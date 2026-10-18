// A cég beállításai, amelyeket a tulajdonos a vezérlőterem Beállítások fülén módosít.
// A vezérlőterem egy jelölt issue-t nyit a változásokkal (JSON); a Döntés munkafolyamat
// ellenőrzi és beírja a state/settings.json fájlba. A beállítás erősebb a GitHub-változóknál.
// API-kulcs soha nem kerül ide: azok GitHub-titokként tárolódnak.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEPARTMENTS, ROLES } from "../company/org.js";
import { logEvent, setDepartmentEnabled } from "./board.js";
import type { Gh } from "./gates.js";
import { parseModel } from "./providers.js";
import type { CompanyState } from "./types.js";

export const SETTINGS_FILE = "state/settings.json";
export const SETTINGS_MARKER = "<!-- alicya-beallitasok -->";

const modelSpec = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9:._\-/]+$/, "A modellnévben csak betű, szám és : . _ - / lehet.")
  .refine((v) => {
    try {
      return parseModel(v).model.length > 0;
    } catch {
      return false;
    }
  }, "Ismeretlen szolgáltató; lehet: anthropic, openai, kimi.");
const effort = z.enum(["low", "medium", "high"]);
const provider = z.enum(["anthropic", "openai", "kimi"]);
const usd = (max: number) => z.number().min(0).max(max);
const roleIds = ROLES.map((r) => r.id) as [string, ...string[]];
const depIds = DEPARTMENTS.map((d) => d.id) as [string, ...string[]];
const price = z.object({ input: usd(1000), output: usd(1000), cacheRead: usd(1000).optional() }).strict();

/** Egy változtatás: a megadott mezők felülírnak, a null törli a beállítást (vissza az alapértékre). */
export const settingsPatch = z
  .object({
    models: z
      .object({
        strategic: modelSpec.nullable(),
        lead: modelSpec.nullable(),
        worker: modelSpec.nullable(),
        bulk: modelSpec.nullable(),
        inbox: modelSpec.nullable(),
        roles: z.partialRecord(z.enum(roleIds), modelSpec.nullable()),
      })
      .partial()
      .strict(),
    effort: z.object({ lead: effort.nullable(), worker: effort.nullable(), bulk: effort.nullable() }).partial().strict(),
    personalDataProviders: z.array(provider).max(3).nullable(),
    budget: z
      .object({
        monthlyUsd: usd(100_000).nullable(),
        runUsd: usd(10_000).nullable(),
        taskUsd: usd(1_000).nullable(),
        codeTaskUsd: usd(1_000).nullable(),
        chatUsd: usd(1_000).nullable(),
        maxTasksPerRun: z.number().int().min(1).max(50).nullable(),
        maxTurnsPerTask: z.number().int().min(1).max(40).nullable(),
        maxTurnsPerCodeTask: z.number().int().min(1).max(60).nullable(),
      })
      .partial()
      .strict(),
    schedule: z
      .object({
        days: z.array(z.number().int().min(1).max(7)).max(7).nullable(),
        hours: z.array(z.number().int().min(0).max(23)).max(24).nullable(),
      })
      .partial()
      .strict(),
    paused: z.boolean().nullable(),
    inbox: z.object({ enabled: z.boolean().nullable(), createTasks: z.boolean().nullable() }).partial().strict(),
    prices: z.record(modelSpec, price.nullable()),
    arena: z
      .object({
        enabled: z.boolean().nullable(),
        duelsPerRun: z.number().int().min(0).max(5).nullable(),
        monthlyUsd: usd(10_000).nullable(),
        contestants: z.array(modelSpec).max(20).nullable(),
        judge: modelSpec.nullable(),
        disabledLessons: z.array(z.string().regex(/^L-\d{1,5}$/)).max(500).nullable(),
        approvedLessons: z.array(z.string().regex(/^L-\d{1,5}$/)).max(500).nullable(),
      })
      .partial()
      .strict(),
    departments: z.partialRecord(z.enum(depIds), z.boolean()),
    learning: z
      .object({
        enabled: z.boolean().nullable(),
        disabled: z.array(z.string().regex(/^S-\d{1,5}$/)).max(500).nullable(),
      })
      .partial()
      .strict(),
    selfdev: z.object({ enabled: z.boolean().nullable() }).partial().strict(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatch>;

type Effort = z.infer<typeof effort>;
type ProviderId = z.infer<typeof provider>;
export interface Settings {
  models?: { strategic?: string; lead?: string; worker?: string; bulk?: string; inbox?: string; roles?: Record<string, string> };
  effort?: { lead?: Effort; worker?: Effort; bulk?: Effort };
  personalDataProviders?: ProviderId[];
  budget?: { monthlyUsd?: number; runUsd?: number; taskUsd?: number; codeTaskUsd?: number; chatUsd?: number; maxTasksPerRun?: number; maxTurnsPerTask?: number; maxTurnsPerCodeTask?: number };
  /** Munkarend budapesti idő szerint: napok (1 = hétfő … 7 = vasárnap) és órák, amikor munkanap indul. */
  schedule?: { days?: number[]; hours?: number[] };
  /** Szünet: ütemezett munkanap és levélfeldolgozás nem fut (kézzel indítva igen). */
  paused?: boolean;
  inbox?: { enabled?: boolean; createTasks?: boolean };
  prices?: Record<string, { input: number; output: number; cacheRead?: number }>;
  /** Belső verseny: párbajok munkanaponként, saját havi keret, versenyzők, bíró, kikapcsolt tanulságok. */
  arena?: { enabled?: boolean; duelsPerRun?: number; monthlyUsd?: number; contestants?: string[]; judge?: string; disabledLessons?: string[]; approvedLessons?: string[] };
  /** Tanulás a saját munkából: a napi visszatekintés tanulságai, és a kikapcsoltak. */
  learning?: { enabled?: boolean; disabled?: string[] };
  /** Önfejlesztés: az agentek a cég motorját is javíthatják (pull request a main ágra, a tulajdonos olvasztja be). */
  selfdev?: { enabled?: boolean };
}

export interface SettingsFile {
  version: 1;
  updatedAt?: string;
  /** Az utolsó módosító issue száma. */
  issue?: number;
  settings: Settings;
}

export function readSettings(root: string): Settings {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(root, SETTINGS_FILE), "utf8")) as SettingsFile;
    return f && typeof f.settings === "object" && f.settings ? f.settings : {};
  } catch {
    return {};
  }
}

function writeSettings(root: string, settings: Settings, issue: number | undefined, now: Date): void {
  const f = path.join(root, SETTINGS_FILE);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const body: SettingsFile = { version: 1, updatedAt: now.toISOString(), issue, settings };
  fs.writeFileSync(f, JSON.stringify(body, null, 2) + "\n");
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Mély összefésülés: objektumot mezőnként, tömböt és értéket egészben; a null törli a kulcsot. */
function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k];
    else if (isObj(v)) {
      const m = merge(isObj(out[k]) ? (out[k] as Record<string, unknown>) : {}, v);
      if (Object.keys(m).length) out[k] = m;
      else delete out[k];
    } else if (Array.isArray(v)) {
      const u = [...new Set(v)];
      out[k] = u.every((x) => typeof x === "number") ? (u as number[]).sort((a, b) => a - b) : u;
    } else out[k] = v;
  }
  return out;
}

const LABELS: Record<string, string> = {
  models: "AI-motorok",
  effort: "gondolkodási szint",
  personalDataProviders: "adatvédelem",
  budget: "költségkeret",
  schedule: "munkarend",
  paused: "szünet",
  inbox: "posta",
  prices: "árak",
  arena: "belső verseny",
  departments: "részlegek",
  learning: "tanulás",
  selfdev: "önfejlesztés",
};

/** A változtatás kinyerése az issue szövegéből (a jelölő utáni JSON-blokk). */
export function parseSettingsIssue(body: string): { patch: SettingsPatch } | { error: string } | null {
  if (!(body ?? "").includes(SETTINGS_MARKER)) return null;
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(body.slice(body.indexOf(SETTINGS_MARKER)));
  if (!m) return { error: "Nem találtam a beállításokat (JSON-blokk) a kérésben." };
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]!);
  } catch {
    return { error: "A beállítások nem érvényes JSON-ban érkeztek." };
  }
  const p = settingsPatch.safeParse(raw);
  if (!p.success) return { error: `A beállítások hibásak, nem rögzítettem semmit: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  return { patch: p.data };
}

/** A változtatás alkalmazása: settings.json, részlegek ki/be, napló. Visszaad egy rövid magyar összefoglalót. */
export function applySettings(s: CompanyState, root: string, patch: SettingsPatch, issue?: number, now = new Date()): string {
  const { departments, ...rest } = patch;
  const before = readSettings(root);
  const after = merge(before as Record<string, unknown>, rest as Record<string, unknown>) as Settings;
  // Egy modell ára egészben cserélődik: a kimaradt gyorsítótár-ár ne a régiből maradjon meg.
  if (rest.prices) {
    const prices: Record<string, unknown> = { ...(before.prices ?? {}) };
    for (const [k, v] of Object.entries(rest.prices)) {
      if (v === null) delete prices[k];
      else prices[k] = v;
    }
    if (Object.keys(prices).length) after.prices = prices as Settings["prices"];
    else delete after.prices;
  }
  const changed = Object.keys(LABELS).filter((k) => k !== "departments" && JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
  if (changed.length) writeSettings(root, after, issue, now);
  const depMsgs: string[] = [];
  for (const [dep, on] of Object.entries(departments ?? {})) {
    try {
      if (setDepartmentEnabled(s, dep, on!, now)) depMsgs.push(`${DEPARTMENTS.find((d) => d.id === dep)?.name ?? dep} ${on ? "bekapcsolva" : "kikapcsolva"}`);
    } catch (e) {
      depMsgs.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!changed.length && !depMsgs.length) return "A beállítások nem változtak.";
  const parts = [...changed.map((k) => LABELS[k]!), ...(depMsgs.length ? [`részlegek (${depMsgs.join(", ")})`] : [])];
  const text = `Beállítások módosítva: ${parts.join(", ")}.`;
  logEvent(s, { actor: "owner", department: "core", kind: "info", text }, now);
  return `${text} A következő munkanaptól érvényes.`;
}

/**
 * A tulajdonos nyitott beállítás-issue-inak feldolgozása és lezárása, a régebbitől az újabb felé.
 * Ha `deferClose` adott, a lezárások oda kerülnek, és a hívó csak sikeres mentés után futtatja őket;
 * különben egy elveszett mentés után az issue „kész”-nek látszana. Az újrafeldolgozás ártalmatlan.
 */
export function sweepSettingsIssues(s: CompanyState, root: string, gh: Gh, owner: string, deferClose?: (() => void)[]): string[] {
  if (!owner) return [];
  const list = JSON.parse(gh(["issue", "list", "--state", "open", "--author", owner, "--limit", "100", "--json", "number,body"])) as { number: number; body: string }[];
  const out: string[] = [];
  for (const i of list.sort((a, b) => a.number - b.number)) {
    const r = parseSettingsIssue(i.body);
    if (!r) continue;
    const msg = "error" in r ? r.error : applySettings(s, root, r.patch, i.number);
    const close = () => void gh(["issue", "close", String(i.number), "--reason", "error" in r ? "not planned" : "completed", "--comment", msg]);
    if (deferClose && !("error" in r)) deferClose.push(close);
    else close();
    out.push(msg);
  }
  return out;
}
