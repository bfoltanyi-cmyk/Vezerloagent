// Az agentek eszközei. Minden bemenetet zod-dal ellenőrzünk, mielőtt bármi lefutna.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEPARTMENTS, ROLES, type Role } from "../company/org.js";
import {
  blockTask,
  completeTask,
  createTask,
  getTask,
  reassignTask,
  requestGate,
  submitReview,
} from "./board.js";
import { formatRule, JURISDICTIONS, lookup, TOPIC_NAMES, type Topic } from "../company/privacy/knowledge.js";
import type { CompanyState, Task } from "./types.js";
import type { Workspace } from "./workspace.js";

export const MAX_NEW_TASKS_PER_RUN = 8;
export const MAX_OPEN_TASKS = 80;

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
  }),
  reassign_task: z.object({ task_id: z.string(), assignee: z.enum(roleIds) }),
  read_file: z.object({ path: z.string() }),
  write_file: z.object({ path: z.string(), content: z.string() }),
  list_files: z.object({ path: z.string().optional().describe("Pl. docs vagy product/src") }),
  complete_task: z.object({ summary: z.string().min(10).max(2000).describe("Mit csináltál, mely fájlokat érintetted.") }),
  submit_review: z.object({ verdict: z.enum(["approve", "changes"]), note: z.string().min(5).max(2000) }),
  block_task: z.object({ reason: z.string().min(5).max(1000) }),
  request_approval: z.object({
    kind: z.enum(["spec", "release", "outbound", "pricing"]),
    title: z.string().min(5).max(140),
    summary: z.string().min(20).max(3000).describe("Mit kell a tulajdonosnak eldöntenie, mivel együtt (fájlok, kockázatok)."),
  }),
} as const;

type ToolName = keyof typeof schemas;

/** A tulajdonossal folytatott beszélgetésben használható eszközök: nincs feladatlezárás és jóváhagyáskérés. */
export const CHAT_TOOLS: readonly ToolName[] = ["privacy_lookup", "list_tasks", "read_task", "read_file", "list_files", "write_file", "create_task", "reassign_task"];

const descriptions: Record<ToolName, string> = {
  privacy_lookup: `Adatvédelmi tudásbázis (GDPR és EU-s, magyar, lengyel, cseh szabályok) keresése. Témák: ${topicIds.join(", ")}. Személyes adatot érintő munka előtt használd.`,
  list_tasks: "A feladattábla listázása szűréssel.",
  read_task: "Egy feladat teljes leírása és jegyzetei.",
  create_task: "Új feladat létrehozása egy részlegnek vagy szerepnek. Csak valóban szükséges, jól körülhatárolt feladatot hozz létre.",
  reassign_task: "Feladat átadása másik szerepnek (csak vezetőknek).",
  read_file: "Fájl olvasása a docs/ vagy product/ alól.",
  write_file: "Fájl írása (teljes tartalom). Kódszerep: docs/ és product/; többiek: docs/.",
  list_files: "Fájlok listázása egy könyvtár alatt.",
  complete_task: "Az aktuális feladat lezárása összefoglalóval. Kódfeladatnál ez automatikusan kódellenőrzést és biztonsági átvizsgálást indít.",
  submit_review: "Átvizsgálási feladatnál: jóváhagyás vagy javítás kérése indoklással.",
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
  /** Ha meg van adva, csak ezek az eszközök érhetők el (pl. beszélgetésben). */
  allowed?: readonly ToolName[];
}

function allowedTools(role: Role, task: Task, allowed?: readonly ToolName[]): ToolName[] {
  if (allowed) return allowed.filter((n) => n !== "reassign_task" || role.tier === "lead");
  const base: ToolName[] = ["privacy_lookup", "list_tasks", "read_task", "read_file", "list_files", "write_file", "create_task", "block_task"];
  if (task.kind === "review") base.push("submit_review");
  else base.push("complete_task", "request_approval");
  if (role.tier === "lead") base.push("reassign_task");
  return base;
}

export function toolDefinitions(role: Role, task: Task, allowed?: readonly ToolName[]): Anthropic.Beta.BetaTool[] {
  return allowedTools(role, task, allowed).map((name) => {
    const { $schema: _ignored, ...input_schema } = z.toJSONSchema(schemas[name]) as Record<string, unknown>;
    return { name, description: descriptions[name], input_schema: input_schema as Anthropic.Beta.BetaTool.InputSchema };
  });
}

const fmtTask = (t: Task) =>
  `${t.id} [${t.status}] P${t.priority} ${t.department}/${t.assignee} · ${t.title}${t.dependsOn.length ? ` (függ: ${t.dependsOn.join(", ")})` : ""}`;

/** Lefuttat egy eszközhívást. Hibánál a hibaüzenet visszakerül az agenthez. */
export function runTool(ctx: ToolContext, name: string, rawInput: unknown): { content: string; isError: boolean } {
  if (!(name in schemas) || !allowedTools(ctx.role, ctx.task, ctx.allowed).includes(name as ToolName)) {
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
      const t = createTask(
        s,
        {
          title: input.title,
          description: input.description,
          department: input.department,
          assignee: input.assignee,
          priority: input.priority,
          dependsOn: input.depends_on,
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
    case "read_file":
      return ctx.workspace.read(input.path, role.access);
    case "list_files": {
      const files = ctx.workspace.list(input.path ?? "", role.access);
      return files.length ? files.join("\n") : "Üres.";
    }
    case "write_file": {
      ctx.workspace.write(input.path, input.content, role.access);
      ctx.filesWritten.add(input.path);
      return `Mentve: ${input.path} (${Buffer.byteLength(input.content)} bájt)`;
    }
    case "complete_task": {
      const t = completeTask(s, task.id, role.id, input.summary);
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

