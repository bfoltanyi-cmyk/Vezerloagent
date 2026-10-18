// Az agentek eszközei. Minden bemenetet zod-dal ellenőrzünk, mielőtt bármi lefutna.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEPARTMENTS, ROLES, type Role } from "../company/org.js";
import {
  addNote,
  blockTask,
  completeTask,
  createTask,
  getTask,
  reassignTask,
  requestGate,
  submitReview,
  isDisabled,
} from "./board.js";
import { formatRule, JURISDICTIONS, lookup, TOPIC_NAMES, type Topic } from "../company/privacy/knowledge.js";
import { CHECK_STEPS, checksAvailable, checksLine, findProjects, formatChecks, projectOf, runChecks } from "./checks.js";
import { codeMap, searchCode } from "./codeintel.js";
import { ENGINE_GENERATED, ENGINE_PROJECT, ENGINE_RULES, EngineWorkspace } from "./selfdev.js";
import { readEmailFor } from "./inbox-store.js";
import type { CompanyState, Task } from "./types.js";
import type { Workspace } from "./workspace.js";

export const MAX_NEW_TASKS_PER_RUN = 8;
export const MAX_OPEN_TASKS = 80;
export const READ_CHUNK = 30_000;

const depIds = DEPARTMENTS.map((d) => d.id) as [string, ...string[]];
const roleIds = ROLES.map((r) => r.id) as [string, ...string[]];

const topicIds = Object.keys(TOPIC_NAMES) as [Topic, ...Topic[]];

const schemas = {
  privacy_lookup: z.object({
    jurisdictions: z.array(z.enum(JURISDICTIONS as [string, ...string[]])).max(4).optional().describe("EU, HU, PL, CZ; az EU-s szabályok mindig benne vannak."),
    topic: z.enum(topicIds).optional(),
    query: z.string().max(200).optional().describe("Szabad szavas keresés, pl. 'megőrzés számla' vagy 'monitoring'."),
  }),
  list_tasks: z.object({
    status: z.enum(["todo", "in_progress", "review", "awaiting_approval", "blocked", "done"]).optional(),
    department: z.enum(depIds).optional(),
  }),
  read_task: z.object({ task_id: z.string() }),
  create_task: z.object({
    title: z.string().min(3).max(140),
    description: z.string().min(10).max(4000).describe("Mit kell pontosan elkészíteni, hova, milyen elfogadási feltétellel."),
    department: z.enum(depIds),
    assignee: z.enum(roleIds).optional().describe("Szerep azonosítója; ha üres, a részlegvezető kapja."),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    depends_on: z.array(z.string()).max(10).optional(),
    motor: z.boolean().optional().describe("Igaz, ha a feladat a cég saját motorjának (src/, company/, dashboard/) javítása; csak vezető adhatja ki, kódszerepnek."),
  }),
  reassign_task: z.object({ task_id: z.string(), assignee: z.enum(roleIds) }),
  read_file: z.object({ path: z.string(), offset: z.number().int().min(0).optional().describe("Hányadik karaktertől olvass (hosszú fájl folytatásához).") }),
  write_file: z.object({ path: z.string(), content: z.string() }),
  list_files: z.object({ path: z.string().optional().describe("Pl. docs vagy product/src") }),
  search_code: z.object({
    query: z.string().min(1).max(200).describe("A keresett szöveg (pl. függvénynév, hibaüzenet, import)."),
    path: z.string().optional().describe("Hol keressen; alapból product. Pl. product/backend/src"),
    regex: z.boolean().optional().describe("Igaz, ha a query reguláris kifejezés."),
    case_sensitive: z.boolean().optional(),
  }),
  show_changes: z.object({}),
  code_map: z.object({ path: z.string().optional().describe("Melyik könyvtár térképe; alapból product. Pl. product/backend/src/modules") }),
  run_checks: z.object({
    path: z.string().describe("A projekt könyvtára vagy egy fájlja, pl. product/backend"),
    steps: z.array(z.enum(CHECK_STEPS as [string, ...string[]])).max(4).optional().describe("Alapból mind: install, typecheck, lint, test. Az install csak változott függőségnél fut újra."),
  }),
  complete_task: z.object({ summary: z.string().min(10).max(2000).describe("Mit csináltál, mely fájlokat érintetted.") }),
  submit_review: z.object({ verdict: z.enum(["approve", "changes"]), note: z.string().min(5).max(2000) }),
  read_email: z.object({ email_id: z.string().regex(/^E-\d{4,}$/).describe("A levél azonosítója, pl. E-0001.") }),
  block_task: z.object({ reason: z.string().min(5).max(1000) }),
  request_approval: z.object({
    kind: z.enum(["spec", "release", "outbound", "pricing"]),
    title: z.string().min(5).max(140),
    summary: z.string().min(20).max(3000).describe("Mit kell a tulajdonosnak eldöntenie, mivel együtt (fájlok, kockázatok)."),
  }),
} as const;

type ToolName = keyof typeof schemas;

/** A tulajdonossal folytatott beszélgetésben használható eszközök: nincs feladatlezárás és jóváhagyáskérés. */
export const CHAT_TOOLS: readonly ToolName[] = ["privacy_lookup", "list_tasks", "read_task", "read_email", "read_file", "list_files", "search_code", "code_map", "write_file", "create_task", "reassign_task"];

const descriptions: Record<ToolName, string> = {
  privacy_lookup: `Adatvédelmi tudásbázis (GDPR és EU-s, magyar, lengyel, cseh szabályok) keresése. Témák: ${topicIds.join(", ")}. Személyes adatot érintő munka előtt használd.`,
  list_tasks: "A feladattábla listázása szűréssel.",
  read_task: "Egy feladat teljes leírása és jegyzetei.",
  create_task: "Új feladat létrehozása egy részlegnek vagy szerepnek. Csak valóban szükséges, jól körülhatárolt feladatot hozz létre.",
  reassign_task: "Feladat átadása másik szerepnek (csak vezetőknek).",
  read_file: "Fájl olvasása a docs/ vagy product/ alól.",
  write_file: "Fájl írása (teljes tartalom). Kódszerep: docs/ és product/; többiek: docs/.",
  list_files: "Fájlok listázása egy könyvtár alatt.",
  search_code: "Keresés a kódban és a dokumentumokban (alapból a product/ alatt): fájl:sor: szöveg találatok. Így találod meg, hol van definiálva vagy használva valami, mielőtt egész fájlokat olvasnál.",
  show_changes: "Motorfejlesztésnél: a javasolt változások diffje a mostani motorhoz képest.",
  code_map: "A kód térképe: fájlok sorszámmal, exportok, osztályok, függvények, végpontok, adatbázistáblák, npm-szkriptek. Új területen ezzel kezdj, utána olvasd el read_file-lal, ami kell.",
  run_checks: "A product/ alatti projekt ellenőrzése: függőségek telepítése, típusellenőrzés, lint és tesztek, elszigetelt környezetben. Kódfeladatot csak akkor zárhatsz le, ha az érintett projekt az utolsó módosításod után zöld.",
  complete_task: "Az aktuális feladat lezárása összefoglalóval. Kódfeladatnál ez automatikusan kódellenőrzést és biztonsági átvizsgálást indít.",
  submit_review: "Átvizsgálási feladatnál: jóváhagyás vagy javítás kérése indoklással.",
  read_email: "Egy beérkezett levél teljes tartalma és a kinyert adatok (feladó, cég, határidő, összegek). Csak a feladatodban hivatkozott levelet olvashatod; vezető bármelyiket. Személyes adatot ne írj nyilvános fájlba.",
  block_task: "Az aktuális feladat megjelölése elakadtként, ha valami hiányzik.",
  request_approval: "Az aktuális feladat eredményének jóváhagyásra küldése a tulajdonosnak (spec, kiadás, kifelé menő kommunikáció, árazás).",
};

export interface ToolContext {
  state: CompanyState;
  role: Role;
  task: Task;
  workspace: Workspace;
  createdThisRun: { count: number };
  /** Igaz, ha az aktuális feladat lezárult (kész, elakadt, jóváhagyásra vár, átvizsgálva). */
  finished: boolean;
  filesWritten: Set<string>;
  /** Hamis, ha az agent modellje nem kaphat személyes adatot (pl. ügyféllevelet); alapból igaz. */
  personalData?: boolean;
  /** Ha meg van adva, csak ezek az eszközök érhetők el (pl. beszélgetésben). */
  allowed?: readonly ToolName[];
  /** Kiadhat-e motorfejlesztési feladatot (a tulajdonos kikapcsolhatja); alapból igen. */
  selfdev?: boolean;
  /** Kódellenőrzés: mely projektek módosultak az utolsó zöld ellenőrzés óta, és mi lett az eredmény. */
  checks?: { dirty: Set<string>; green: Map<string, string>; last: Map<string, string>; noted?: boolean };
}

const checksOf = (ctx: ToolContext): NonNullable<ToolContext["checks"]> => (ctx.checks ??= { dirty: new Set(), green: new Map(), last: new Map() });

/** A munkaterület projektjei: motorfejlesztésnél maga a motor, különben a product/ alattiak. */
const projectsOf = (ctx: ToolContext) => (ctx.workspace instanceof EngineWorkspace ? [ENGINE_PROJECT] : findProjects(ctx.workspace.root));
const projectFor = (ctx: ToolContext, rel: string) => (ctx.workspace instanceof EngineWorkspace ? ENGINE_PROJECT : projectOf(findProjects(ctx.workspace.root), rel));

function allowedTools(role: Role, task: Task, allowed?: readonly ToolName[], engine = false): ToolName[] {
  if (allowed) return allowed.filter((n) => n !== "reassign_task" || role.tier === "lead");
  const base: ToolName[] = ["privacy_lookup", "list_tasks", "read_task", "read_file", "list_files", "search_code", "code_map", "write_file", "create_task", "block_task"];
  if (role.access === "code" && checksAvailable()) base.push("run_checks");
  if (engine) base.push("show_changes");
  if (task.kind === "review") base.push("submit_review");
  else base.push("complete_task", "request_approval");
  if (role.tier === "lead") base.push("reassign_task");
  if (role.tier === "lead" || /\bE-\d{4,}\b/.test(task.description)) base.push("read_email");
  return base;
}

export function toolDefinitions(role: Role, task: Task, allowed?: readonly ToolName[], engine = false): Anthropic.Beta.BetaTool[] {
  return allowedTools(role, task, allowed, engine).map((name) => {
    const { $schema: _ignored, ...input_schema } = z.toJSONSchema(schemas[name]) as Record<string, unknown>;
    return { name, description: descriptions[name], input_schema: input_schema as Anthropic.Beta.BetaTool.InputSchema };
  });
}

const fmtTask = (t: Task) =>
  `${t.id} [${t.status}] P${t.priority} ${t.department}/${t.assignee} · ${t.title}${t.dependsOn.length ? ` (függ: ${t.dependsOn.join(", ")})` : ""}`;

/** Lefuttat egy eszközhívást. Hibánál a hibaüzenet visszakerül az agenthez. */
export function runTool(ctx: ToolContext, name: string, rawInput: unknown): { content: string; isError: boolean } {
  if (!(name in schemas) || !allowedTools(ctx.role, ctx.task, ctx.allowed, ctx.workspace instanceof EngineWorkspace).includes(name as ToolName)) {
    return { content: `Ez az eszköz nem érhető el neked: ${name}`, isError: true };
  }
  const parsed = schemas[name as ToolName].safeParse(rawInput);
  if (!parsed.success) return { content: `Hibás bemenet: ${parsed.error.message}`, isError: true };
  try {
    return { content: execute(ctx, name as ToolName, parsed.data), isError: false };
  } catch (e) {
    return { content: e instanceof Error ? e.message : String(e), isError: true };
  }
}

function execute(ctx: ToolContext, name: ToolName, input: any): string {
  const { state: s, role, task } = ctx;
  if (ctx.finished && ["complete_task", "submit_review", "block_task", "request_approval"].includes(name)) {
    throw new Error("Az aktuális feladat már le van zárva.");
  }
  switch (name) {
    case "privacy_lookup": {
      const rules = lookup({ jurisdictions: input.jurisdictions, topic: input.topic, query: input.query });
      if (rules.length === 0) return "Nincs találat. Próbáld téma szerint vagy más kulcsszóval.";
      return `${rules.slice(0, 12).map(formatRule).join("\n\n")}${rules.length > 12 ? `\n\n…és még ${rules.length - 12} szabály, szűkítsd a keresést.` : ""}\n\nMunkasegédlet, nem jogi tanácsadás; a ⚠ jelölésű pontokat jogász ellenőrizze.`;
    }
    case "list_tasks": {
      const rows = s.tasks
        .filter((t) => (input.status ? t.status === input.status : t.status !== "done"))
        .filter((t) => (input.department ? t.department === input.department : true))
        .slice(-60);
      return rows.length ? rows.map(fmtTask).join("\n") : "Nincs találat.";
    }
    case "read_task": {
      const t = getTask(s, input.task_id);
      return [fmtTask(t), "", t.description, "", ...t.notes.map((n) => `- ${n.at.slice(0, 16)} ${n.by}: ${n.text}`)].join("\n");
    }
    case "create_task": {
      if (ctx.createdThisRun.count >= MAX_NEW_TASKS_PER_RUN) throw new Error("Ebben a munkanapban már elég új feladat született; a többit vedd fel később.");
      if (s.tasks.filter((t) => t.status !== "done").length >= MAX_OPEN_TASKS) throw new Error("Túl sok a nyitott feladat; előbb a meglévőket kell lezárni.");
      if (isDisabled(s, input.department)) throw new Error(`A(z) ${input.department} részleget a tulajdonos kikapcsolta; most ne adj neki feladatot.`);
      if (input.motor) {
        if (role.tier !== "lead") throw new Error("Motorfejlesztést csak vezető adhat ki.");
        if (ctx.selfdev === false) throw new Error("Az önfejlesztést a tulajdonos kikapcsolta; motorfejlesztési feladat most nem adható ki.");
        const target = ROLES.find((r) => r.id === (input.assignee ?? DEPARTMENTS.find((d) => d.id === input.department)?.lead));
        if (target?.access !== "code") throw new Error("Motorfejlesztést kódszerep kaphat (pl. tech-lead a dev részlegben).");
      }
      const t = createTask(
        s,
        {
          title: input.title,
          description: input.description,
          department: input.department,
          assignee: input.assignee,
          priority: input.priority,
          dependsOn: input.depends_on,
          // A projekt feladatából kiadott munka is a projekthez tartozik.
          project: ctx.task.project,
          ...(input.motor ? { kind: "code" as const, engine: true, description: `${input.description}\n\n${ENGINE_RULES}` } : {}),
        },
        role.id,
      );
      ctx.createdThisRun.count++;
      return `Létrehozva: ${fmtTask(t)}`;
    }
    case "reassign_task": {
      reassignTask(s, input.task_id, input.assignee, role.id);
      return `Átadva: ${fmtTask(getTask(s, input.task_id))}`;
    }
    case "read_file": {
      // Hosszú fájlból egyszerre csak egy szelet: a teljes fájl minden további körben újra pénzbe kerülne.
      const all = ctx.workspace.read(input.path, role.access);
      const from = input.offset ?? 0;
      const part = all.slice(from, from + READ_CHUNK);
      return from + READ_CHUNK < all.length ? `${part}\n…[folytatás: read_file offset=${from + READ_CHUNK}, összesen ${all.length} karakter]` : part;
    }
    case "list_files": {
      const files = ctx.workspace.list(input.path ?? "", role.access);
      return files.length ? files.join("\n") : "Üres.";
    }
    case "show_changes": {
      if (!(ctx.workspace instanceof EngineWorkspace)) throw new Error("Ez csak motorfejlesztésnél érhető el.");
      return ctx.workspace.diff();
    }
    case "search_code":
      return searchCode(ctx.workspace, role.access, { query: input.query, path: input.path, regex: input.regex, caseSensitive: input.case_sensitive });
    case "code_map":
      return codeMap(ctx.workspace, role.access, input.path);
    case "run_checks": {
      const projects = projectsOf(ctx);
      const project = ctx.workspace instanceof EngineWorkspace ? ENGINE_PROJECT : projectOf(projects, input.path);
      if (!project) throw new Error(`Ez nem egy projekt a product/ alatt (package.json kell). Projektek: ${projects.join(", ") || "még nincs"}.`);
      const c = checksOf(ctx);
      const engine = ctx.workspace instanceof EngineWorkspace ? ctx.workspace : undefined;
      const r = runChecks(ctx.workspace, role.access, project, input.steps, process.env, engine ? ENGINE_GENERATED : undefined);
      // A motorból generált dokumentumok (kézikönyv, adatvédelmi összefoglaló) a javaslattal együtt frissülnek.
      const regenerated = engine ? (r.generated ?? []).filter((g) => engine.writeGenerated(g.rel, g.content)).map((g) => g.rel) : [];
      regenerated.forEach((f) => ctx.filesWritten.add(f));
      c.last.set(project, checksLine(r));
      const full = !input.steps || ["typecheck", "test"].every((st) => input.steps.includes(st));
      if (r.ok && full) {
        c.dirty.delete(project);
        c.green.set(project, checksLine(r));
      }
      return formatChecks(r) + (regenerated.length ? `\n\nFrissítettem a generált dokumentumot a javaslatban: ${regenerated.join(", ")}.` : "") + (r.ok && !full ? "\n\n(Részleges ellenőrzés: a lezáráshoz typecheck és test is kell.)" : "");
    }
    case "read_email": {
      if (role.tier !== "lead" && !task.description.includes(input.email_id)) throw new Error(`Ez a levél (${input.email_id}) nem a te feladatodhoz tartozik.`);
      if (ctx.personalData === false) {
        throw new Error("Adatvédelmi okból a te modelled nem kaphatja meg az ügyfél levelét. Dolgozz a feladat nyilvános összefoglalójából: a válaszvázlatot név nélkül írd (pl. „Tisztelt Ügyfelünk!”), a kitöltendő adatokat jelöld [szögletes zárójellel].");
      }
      return readEmailFor(ctx.workspace.root, input.email_id, process.env.INBOX_PASSPHRASE);
    }
    case "write_file": {
      ctx.workspace.write(input.path, input.content, role.access);
      ctx.filesWritten.add(input.path);
      const project = projectFor(ctx, input.path);
      if (project) {
        checksOf(ctx).dirty.add(project);
        checksOf(ctx).green.delete(project);
      }
      return `Mentve: ${input.path} (${Buffer.byteLength(input.content)} bájt)`;
    }
    case "complete_task": {
      let summary: string = input.summary;
      if (task.kind === "code" && role.access === "code") {
        const c = checksOf(ctx);
        // „Kész csak zölden”: a kódfeladat csak sikeres ellenőrzés után zárható, ha az ellenőrzés elérhető.
        if (checksAvailable() && projectsOf(ctx).length) {
          const refuse = (msg: string): never => {
            // A visszautasítás jelzés a napi visszatekintésnek is; munkanaponként egyszer jegyezzük fel.
            if (!c.noted) addNote(task, "system", `Piros ellenőrzés: ${[...c.last.values()].join("; ") || "nem futott ellenőrzés"}`);
            c.noted = true;
            throw new Error(msg);
          };
          if (c.dirty.size) refuse(`Még nem zárhatod le: ezek a projektek módosultak az utolsó zöld ellenőrzés óta: ${[...c.dirty].join(", ")}. Futtasd a run_checks-et, javítsd a hibákat, és ha zöld, zárd le. Ha valami rajtad kívül álló ok miatt nem lehet zöld, jelöld elakadtnak (block_task) az okkal.`);
          if (!c.green.size) refuse(`Kódfeladatot csak zöld ellenőrzéssel lehet lezárni: futtasd a run_checks-et ${ctx.workspace instanceof EngineWorkspace ? `a motoron (path: "${ENGINE_PROJECT}")` : "az érintett projekten"} (typecheck és test is kell).`);
        }
        const checked = [...c.green.values(), ...[...c.last].filter(([p]) => !c.green.has(p)).map(([, l]) => `${l} (nem zöld)`)];
        const files = [...ctx.filesWritten];
        summary = `${summary}\n\nEllenőrzés: ${checked.length ? checked.join("; ") : "nem futott (itt nem érhető el)"}${files.length ? `\nMódosított fájlok: ${files.slice(0, 30).join(", ")}${files.length > 30 ? ` …+${files.length - 30}` : ""}` : ""}`;
      }
      const t = completeTask(s, task.id, role.id, summary);
      ctx.finished = true;
      return t.status === "review" ? "Lezárva, kódellenőrzésre és biztonsági átvizsgálásra ment." : "Lezárva.";
    }
    case "submit_review": {
      submitReview(s, task.id, role.id, input.verdict, input.note);
      ctx.finished = true;
      return input.verdict === "approve" ? "Jóváhagyás rögzítve." : "Javítási kérés rögzítve, a feladat visszament a fejlesztőhöz.";
    }
    case "block_task": {
      blockTask(s, task.id, role.id, input.reason);
      ctx.finished = true;
      return "Elakadtként jelölve; a vezetőség látja.";
    }
    case "request_approval": {
      const g = requestGate(s, task.id, input.kind, input.title, input.summary, role.id);
      ctx.finished = true;
      return `Jóváhagyásra küldve: ${g.id}. A tulajdonos dönt róla.`;
    }
  }
}

