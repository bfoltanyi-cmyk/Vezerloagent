// Tanulás a saját munkából. Minden munkanap végén a fejlődési vezető átnézi a nap jelzéseit (átvizsgálói
// visszadobások, elutasított kapuk, elakadt és keretet túllépő feladatok, piros ellenőrzések), és ezekből
// rövid, szerephez vagy feladattípushoz kötött tanulságokat ír. A tanulságokat a következő munkanaptól
// az érintett agentek a rendszerpromptjukban kapják meg. Ha egy hiba a cég működéséből (a motorból)
// fakad, motorfejlesztési feladatot ad ki (lásd selfdev.ts).

import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEPARTMENTS, ROLES, roleById, type Role } from "../company/org.js";
import { createTask, isDisabled, logEvent } from "./board.js";
import { record } from "./budget.js";
import { modelFor, type Config } from "./config.js";
import type { ModelClient } from "./llm.js";
import { ENGINE_RULES } from "./selfdev.js";
import type { CompanyState, TaskKind } from "./types.js";

export const LEARNING_FILE = "state/learning.json";
export const RETRO_ROLE = "kaizen";
const MAX_ACTIVE = 120;
const IN_PROMPT = 6;
const MAX_SIGNALS = 40;
const MAX_OPEN_ENGINE = 2;

export interface Lesson {
  id: string;
  /** Kinek szól: szerep, részleg vagy feladattípus; ha egyik sincs, mindenkinek. */
  role?: string;
  department?: string;
  kind?: TaskKind;
  text: string;
  /** A feladatok, amelyekből leszűrtük vagy amelyek megerősítették. */
  evidence: string[];
  confirmations: number;
  createdAt: string;
  lastAt: string;
  retired?: { at: string; reason: string };
}

export interface Retro {
  at: string;
  signals: number;
  summary: string;
  added: string[];
  confirmed: string[];
  retired: string[];
  engineTask?: string;
  usd: number;
}

export interface Learning {
  version: 1;
  next: number;
  lessons: Lesson[];
  retros: Retro[];
  /** Az utolsó visszatekintés ideje: a következő innen gyűjti a jelzéseket. */
  lastRetro?: string;
}

export function loadLearning(root: string): Learning {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(root, LEARNING_FILE), "utf8")) as Learning;
    if (f && f.version === 1 && Array.isArray(f.lessons)) return { ...f, retros: f.retros ?? [] };
  } catch {
    /* még nincs */
  }
  return { version: 1, next: 1, lessons: [], retros: [] };
}

export function saveLearning(root: string, l: Learning): void {
  const file = path.join(root, LEARNING_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(l, null, 2) + "\n");
}

/** Az agentnek szóló tanulságok: a saját szerepéé, részlegéé, feladattípusáé és az általánosak, a legtöbbször megerősítettek. */
export function lessonsForRole(l: Learning, role: Role, kind: TaskKind, disabled: string[] = []): string[] {
  const off = new Set(disabled);
  const fits = (x: Lesson) => (!x.role || x.role === role.id) && (!x.department || x.department === role.department) && (!x.kind || x.kind === kind);
  // A szerepre szabott tanulság előrébb kerül, mint az általános.
  const weight = (x: Lesson) => (x.role ? 3 : 0) + (x.department ? 1 : 0) + (x.kind ? 1 : 0);
  return l.lessons
    .filter((x) => !x.retired && !off.has(x.id) && fits(x))
    .sort((a, b) => weight(b) - weight(a) || b.confirmations - a.confirmations || b.lastAt.localeCompare(a.lastAt))
    .slice(0, IN_PROMPT)
    .map((x) => x.text);
}

export interface Signal {
  kind: "review" | "owner" | "blocked" | "limit" | "checks";
  task: string;
  role: string;
  taskKind: TaskKind;
  title: string;
  text: string;
}

/** A nap jelzései: mi ment rosszul, és kinél. */
export function collectSignals(s: CompanyState, since: string): Signal[] {
  const out: Signal[] = [];
  for (const t of s.tasks) {
    for (const n of t.notes) {
      if (n.at < since) continue;
      const base = { task: t.id, role: t.assignee, taskKind: t.kind, title: t.title };
      if (n.text.startsWith("Javítás kell:")) out.push({ ...base, kind: "review", text: `${n.by}: ${n.text.slice(13).trim()}` });
      else if (n.text.startsWith("Elakadt:")) out.push({ ...base, kind: "blocked", text: n.text.slice(8).trim() });
      else if (n.text.startsWith("Elérte a feladatkeretet") || n.text.startsWith("Nem fejeződött be")) out.push({ ...base, kind: "limit", text: n.text });
      else if (n.text.startsWith("Piros ellenőrzés:")) out.push({ ...base, kind: "checks", text: n.text.slice(17).trim() });
    }
  }
  for (const g of s.gates) {
    if (g.status !== "rejected" || !g.decidedAt || g.decidedAt < since) continue;
    const t = s.tasks.find((x) => x.id === g.taskId);
    out.push({ kind: "owner", task: g.taskId, role: t?.assignee ?? g.requestedBy, taskKind: t?.kind ?? "doc", title: g.title, text: g.decisionNote || "(indoklás nélkül)" });
  }
  // Ugyanaz a jelzés ne szerepeljen kétszer; a legfrissebbek maradnak.
  const seen = new Set<string>();
  return out
    .filter((x) => {
      const k = `${x.kind}|${x.task}|${x.text.slice(0, 120)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(-MAX_SIGNALS);
}

const KIND_HU: Record<Signal["kind"], string> = {
  review: "átvizsgáló visszadobta",
  owner: "a tulajdonos elutasította",
  blocked: "elakadt",
  limit: "nem fért bele a keretbe",
  checks: "piros maradt az ellenőrzés",
};

const roleIds = ROLES.map((r) => r.id) as [string, ...string[]];
const depIds = DEPARTMENTS.map((d) => d.id) as [string, ...string[]];
const lessonId = z.string().regex(/^S-\d{1,5}$/);

export const retroSchema = z.object({
  osszefoglalo: z.string().trim().min(5).max(1200),
  uj: z
    .array(
      z.object({
        szerep: z.enum(roleIds).optional(),
        reszleg: z.enum(depIds).optional(),
        tipus: z.enum(["plan", "doc", "code", "review"]).optional(),
        szoveg: z.string().trim().min(15).max(240),
        bizonyitek: z.array(z.string().regex(/^T-\d+$/)).min(1).max(8),
      }),
    )
    .max(6)
    .default([]),
  megerosit: z.array(z.object({ id: lessonId, bizonyitek: z.array(z.string().regex(/^T-\d+$/)).max(8).default([]) })).max(10).default([]),
  visszavon: z.array(z.object({ id: lessonId, ok: z.string().trim().min(5).max(300) })).max(6).default([]),
  motor: z
    .object({
      cim: z.string().trim().min(5).max(120),
      problema: z.string().trim().min(20).max(1500),
      javaslat: z.string().trim().min(20).max(2500),
      bizonyitek: z.array(z.string().regex(/^T-\d+$/)).min(1).max(8),
    })
    .optional(),
});
export type RetroOutput = z.infer<typeof retroSchema>;

const retroTool: Anthropic.Beta.BetaTool = (() => {
  const { $schema: _ignored, ...input_schema } = z.toJSONSchema(retroSchema, { io: "input" }) as Record<string, unknown>;
  return {
    name: "record_retro",
    description: "A visszatekintés eredményének rögzítése: új tanulságok, megerősítések, visszavonások és legfeljebb egy motorfejlesztési javaslat.",
    input_schema: input_schema as Anthropic.Beta.BetaTool.InputSchema,
  };
})();

const SYSTEM = `Te az Alicya Nexus szoftverház fejlődési vezetője vagy. A cég agentekből áll; minden nap végén átnézed, mi ment rosszul, és ebből tanulságokat írsz, hogy holnap jobban dolgozzanak.

Szabályok a tanulságokhoz:
- Egy tanulság egy konkrét, ellenőrizhető munkamódszer, felszólító módban, legfeljebb 240 karakter. Pl. „Kódfeladatnál a NestJS-modul exportját is írd be az app.module-ba, és futtasd a tesztet, mielőtt lezárod.”
- Csak a jelzésekből szűrj le tanulságot, és mindig nevezd meg a bizonyítékot (feladatazonosítók). Ne általánosíts egyetlen véletlen esetből, ha nem jellemző.
- Kösd a tanulságot a lehető legszűkebb körhöz: szerep (ha egy szerep hibája), részleg vagy feladattípus. Mindenkinek csak az szóljon, ami tényleg mindenkire igaz.
- Ha egy meglévő tanulság újra igazolódott, ne írj újat, hanem erősítsd meg. Ha egy tanulság téves vagy már nem érvényes, vond vissza indoklással.
- Személyes adatot (ügyfélnév, e-mail-cím) és titkot soha ne írj tanulságba.

Motorfejlesztés: ha egy hiba nem az agent munkájából, hanem a cég működéséből fakad (hiányzó eszköz, rossz szabály a motorban, túl szűk keret, hibás feladatkiosztás, félrevezető rendszerprompt), és tanulsággal nem orvosolható, javasolj egy jól körülhatárolt motorfejlesztést (motor mező). Legfeljebb egyet, és csak ha a bizonyíték erős.

A végén pontosan egyszer hívd meg a record_retro eszközt.`;

function retroPrompt(signals: Signal[], l: Learning, openEngine: string[], selfdev: boolean): string {
  const active = l.lessons.filter((x) => !x.retired);
  return `A mai jelzések (${signals.length}):
${signals.map((x) => `- ${x.task} [${x.taskKind}] ${roleById(x.role)?.name ?? x.role} (${x.role}) · ${KIND_HU[x.kind]} · „${x.title}”: ${x.text.slice(0, 500).replace(/\s+/g, " ")}`).join("\n")}

Meglévő tanulságok (${active.length}):
${active.length ? active.map((x) => `- ${x.id} [${[x.role, x.department, x.kind].filter(Boolean).join(", ") || "mindenki"}] ${x.confirmations}× · ${x.text}`).join("\n") : "- még nincs"}

${selfdev ? `Nyitott motorfejlesztések: ${openEngine.length ? openEngine.join("; ") : "nincs"}.${openEngine.length >= MAX_OPEN_ENGINE ? " Most ne javasolj újat." : ""}` : "Motorfejlesztést most ne javasolj (a tulajdonos kikapcsolta)."}

Szerepazonosítók: ${ROLES.map((r) => r.id).join(", ")}. Részlegek: ${DEPARTMENTS.map((d) => d.id).join(", ")}.`;
}

/** A visszatekintés eredményének beírása: tanulságok és (ha kell) a motorfejlesztési feladat. */
export function applyRetro(s: CompanyState, l: Learning, out: RetroOutput, signals: Signal[], opts: { selfdev: boolean; usd: number }, now = new Date()): Retro {
  const at = now.toISOString();
  const known = new Set(s.tasks.map((t) => t.id));
  const evidence = (ids: string[]) => [...new Set(ids.filter((id) => known.has(id)))];
  const retro: Retro = { at, signals: signals.length, summary: out.osszefoglalo, added: [], confirmed: [], retired: [], usd: opts.usd };
  for (const n of out.uj) {
    const ev = evidence(n.bizonyitek);
    if (!ev.length) continue;
    // Ugyanazt a szöveget ne vegyük fel kétszer.
    const dup = l.lessons.find((x) => !x.retired && x.text.toLowerCase() === n.szoveg.toLowerCase());
    if (dup) {
      dup.confirmations++;
      dup.lastAt = at;
      dup.evidence = [...new Set([...dup.evidence, ...ev])].slice(-20);
      retro.confirmed.push(dup.id);
      continue;
    }
    const role = n.szerep ? roleById(n.szerep) : undefined;
    const lesson: Lesson = {
      id: `S-${String(l.next++).padStart(4, "0")}`,
      role: role?.id,
      department: role ? undefined : n.reszleg,
      kind: n.tipus,
      text: n.szoveg,
      evidence: ev,
      confirmations: 1,
      createdAt: at,
      lastAt: at,
    };
    l.lessons.push(lesson);
    retro.added.push(lesson.id);
  }
  for (const c of out.megerosit) {
    const x = l.lessons.find((y) => y.id === c.id && !y.retired);
    if (!x || retro.added.includes(x.id) || retro.confirmed.includes(x.id)) continue;
    x.confirmations++;
    x.lastAt = at;
    x.evidence = [...new Set([...x.evidence, ...evidence(c.bizonyitek)])].slice(-20);
    retro.confirmed.push(x.id);
  }
  for (const r of out.visszavon) {
    const x = l.lessons.find((y) => y.id === r.id && !y.retired);
    if (!x) continue;
    x.retired = { at, reason: r.ok };
    retro.retired.push(x.id);
  }
  // Ha túl sok az aktív tanulság, a legrégebben megerősített, legkevésbé igazolt megy nyugdíjba.
  const active = l.lessons.filter((x) => !x.retired).sort((a, b) => a.confirmations - b.confirmations || a.lastAt.localeCompare(b.lastAt));
  for (const x of active.slice(0, Math.max(0, active.length - MAX_ACTIVE))) x.retired = { at, reason: "helyet adott az újabbaknak" };

  const openEngine = s.tasks.filter((t) => t.engine && t.status !== "done");
  if (out.motor && opts.selfdev && openEngine.length < MAX_OPEN_ENGINE && !isDisabled(s, "dev")) {
    const ev = evidence(out.motor.bizonyitek);
    if (ev.length) {
      const t = createTask(
        s,
        {
          title: `Motorfejlesztés: ${out.motor.cim}`,
          description: `A fejlődési vezető a napi visszatekintésben ezt találta (bizonyíték: ${ev.join(", ")}).

Probléma: ${out.motor.problema}

Javaslat: ${out.motor.javaslat}

${ENGINE_RULES}`,
          department: "dev",
          assignee: "tech-lead",
          kind: "code",
          priority: 2,
          engine: true,
        },
        RETRO_ROLE,
        now,
      );
      retro.engineTask = t.id;
    }
  }
  l.retros = [...l.retros, retro].slice(-60);
  l.lastRetro = at;
  return retro;
}

/**
 * A napi visszatekintés: egy modellhívás, ha volt jelzés. A költség a cég főkönyvébe kerül a fejlődési
 * vezető nevén. Hibánál csak figyelmeztet; a tanulás nem állíthatja meg a munkanapot.
 */
export async function retrospective(opts: { state: CompanyState; config: Config; client: ModelClient; since: string; remainingUsd: () => number; now?: Date }): Promise<Retro | undefined> {
  const { state: s, config, client } = opts;
  const now = opts.now ?? new Date();
  const root = config.rootDir;
  const l = loadLearning(root);
  const since = l.lastRetro && l.lastRetro < opts.since ? l.lastRetro : opts.since;
  const signals = collectSignals(s, since);
  if (!signals.length) {
    l.lastRetro = now.toISOString();
    saveLearning(root, l);
    return undefined;
  }
  if (opts.remainingUsd() < 0.05) return undefined;
  const role = roleById(RETRO_ROLE)!;
  const model = modelFor(config, role);
  const openEngine = s.tasks.filter((t) => t.engine && t.status !== "done").map((t) => `${t.id} ${t.title}`);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: retroPrompt(signals, l, openEngine, config.selfdev.enabled) }];
  let usd = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.create({ model, effort: config.effort[role.tier], system: SYSTEM, tools: [retroTool], messages });
    usd += record(s, role.id, res.model ?? model, res.usage).usd;
    const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "record_retro");
    const parsed = call ? retroSchema.safeParse(call.input) : undefined;
    if (parsed?.success) {
      const retro = applyRetro(s, l, parsed.data, signals, { selfdev: config.selfdev.enabled, usd }, now);
      saveLearning(root, l);
      logEvent(s, { actor: RETRO_ROLE, department: "core", kind: "info", text: `Visszatekintés: ${signals.length} jelzés, ${retro.added.length} új és ${retro.confirmed.length} megerősített tanulság${retro.engineTask ? `, motorfejlesztés: ${retro.engineTask}` : ""}.` }, now);
      return retro;
    }
    if (attempt === 1 || res.stop_reason === "refusal") break;
    const error = parsed ? parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400) : "nem hívtad meg a record_retro eszközt";
    messages.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    messages.push({
      role: "user",
      content: [
        ...calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, content: `Hibás: ${error}`, is_error: true })),
        { type: "text" as const, text: `A visszatekintés nem rögzült (${error}). Hívd meg most a record_retro eszközt a sémának megfelelően.` },
      ],
    });
  }
  logEvent(s, { actor: RETRO_ROLE, department: "core", kind: "warn", text: "A napi visszatekintés nem sikerült; a jelzéseket a következő munkanap újra átnézi." }, now);
  return undefined;
}
