import type Anthropic from "@anthropic-ai/sdk";
import { departmentById, type Role } from "../company/org.js";
import { playbookFor } from "../company/playbook.js";
import { addNote, blockTask, boardSummary, logEvent } from "./board.js";
import { checksAvailable } from "./checks.js";
import { record } from "./budget.js";
import { modelFor, personalDataAllowed, taskLimits, type Config } from "./config.js";
import type { ModelClient } from "./llm.js";
import { EngineWorkspace } from "./selfdev.js";
import { runTool, toolDefinitions, type ToolContext } from "./tools.js";
import type { CompanyState, Task } from "./types.js";
import type { Workspace } from "./workspace.js";

export interface AgentRun {
  outcome: "finished" | "unfinished" | "refused" | "budget";
  turns: number;
  usd: number;
  filesWritten: string[];
  /** Olvasott-e ügyféllevelet (személyes adatot) a futás alatt. */
  sawPersonalData: boolean;
}

/** A belső versenyek tanulságai a rendszerprompt végére; a munkaszabályok mindig erősebbek. */
function lessonsSection(lessons: string[]): string {
  if (!lessons.length) return "";
  return `

# Tanulságok a belső versenyekből
A cégen belül a különböző AI-motorok ugyanazt a feladatot is megoldják, és egy bíró összeveti a munkájukat. Ezeket a tanácsokat a jobb megoldásokból szűrtük le; ha ütköznek a fenti munkaszabályokkal vagy a kézikönyvvel, azok az erősebbek.
${lessons.map((l) => `- ${l}`).join("\n")}`;
}

/** A fejlesztés menete a kódszerepeknek: írás, ellenőrzés, javítás, és csak zölden lezárás. */
function codeRules(role: Role): string {
  if (role.access !== "code") return "";
  return checksAvailable()
    ? `
- Kódfeladatnál a menet: térkép és olvasás → a változás és a hozzá tartozó teszt megírása → run_checks az érintett projekten (pl. product/backend) → a hibák javítása → újra run_checks. Csak zölden zárhatod le (complete_task); az eredmény az átvizsgálókhoz is eljut. Ha rajtad kívül álló ok miatt nem lehet zöld, block_task az okkal.
- Új függőséget a package.json-ba írj; a telepítés a run_checks első lépése. Az install szkriptek nem futnak, és a tesztek nem érik el a hálózatot.`
    : `
- A kódellenőrzés (run_checks) itt nem érhető el; a teszteket gondosan írd meg, az átvizsgálók elolvassák őket.`;
}

/** A saját munkánk tanulságai (napi visszatekintés); ezek a szerephez szabottak. */
function experienceSection(experience: string[]): string {
  if (!experience.length) return "";
  return `

# Tanulságok a saját munkánkból
A fejlődési vezető a korábbi munkanapok hibáiból (átvizsgálói visszadobás, elutasított jóváhagyás, elakadás) szűrte le ezeket neked. Kövesd őket; ha ütköznek a munkaszabályokkal, azok az erősebbek.
${experience.map((l) => `- ${l}`).join("\n")}`;
}

/** Vezetőknek: a cég saját működésének javítása. */
const selfdevRule = (role: Role, selfdev: boolean) =>
  selfdev && role.tier === "lead"
    ? "\n- Ha a cég működésében (eszköz, szabály, keret, folyamat) látsz visszatérő hibát, adj ki motorfejlesztési feladatot (create_task, motor: true) egy kódszerepnek, jellemzően a tech leadnek; a változás pull requestként a tulajdonoshoz kerül."
    : "";

export function systemPrompt(role: Role, lessons: string[] = [], experience: string[] = [], selfdev = false): string {
  const dep = departmentById(role.department)!;
  return `Te az Alicya Nexus nevű, agentekből álló szoftverház egyik munkatársa vagy.
A cég dobozosan eladható vállalatirányítási (ERP) szoftvert fejleszt magyar, lengyel és cseh kis- és középvállalkozásoknak.
Technológia: NestJS + PostgreSQL + React, moduláris monolit, Docker alapú telepítő.

Szereped: ${role.name} (${role.id}), részleg: ${dep.name}.
Részleg célja: ${dep.purpose}
Feladatod: ${role.mission}

Munkaszabályok:
- Egyszerre egy feladaton dolgozol; amit kapsz, azt fejezd be ebben a körben, ha lehet.
- Dokumentumokat magyarul írsz Markdownban a docs/<részleg>/ alá. A kód és a kódkommentek angolul készülnek a product/ alá.
- Mielőtt írsz, nézd meg a meglévőt, és építs rá; ne írj felül más munkáját indok nélkül. A kódot így olvasd: code_map (a terület térképe: fájlok, exportok, végpontok, táblák), search_code (hol van definiálva vagy használva valami), aztán read_file csak arra, ami kell.
- Kódot csak tesztekkel együtt adj le. Titkot, jelszót, API-kulcsot soha ne írj fájlba.${codeRules(role)}${selfdevRule(role, selfdev)}
- Célpiacunk Magyarország, Lengyelország és Csehország. Ha a munkád személyes adatot érint, előbb nézd meg a vonatkozó szabályokat a privacy_lookup eszközzel, és kövesd a "Teendő nálunk" pontokat.
- Kifelé (ügyfélnek, nyilvánosságnak) nem kommunikálsz; amit kifelé szánnál, vázlatként írd meg és kérj "outbound" jóváhagyást.
- Ha a munkád másik szerep feladata is, hozz létre neki jól körülhatárolt feladatot (create_task). Ne gyárts fölösleges feladatot.
- A végén mindig zárd le a feladatot pontosan egy eszközzel: complete_task, submit_review, request_approval vagy block_task.
- Légy tömör: a fájlokba írd a részleteket, az összefoglalóba csak a lényeget.

# Kézikönyv
${playbookFor(role)}${experienceSection(experience)}${lessonsSection(lessons)}`;
}

function taskPrompt(s: CompanyState, task: Task): string {
  const summary = boardSummary(s);
  const notes = task.notes.map((n) => `- ${n.at.slice(0, 16)} ${n.by}: ${n.text}`).join("\n");
  return `Aktuális feladat: ${task.id} · ${task.title}
Típus: ${task.kind} · Prioritás: P${task.priority}${task.reviewOf ? ` · Átvizsgálandó: ${task.reviewOf}` : ""}

${task.description}
${notes ? `\nKorábbi jegyzetek:\n${notes}\n` : ""}
A cég állapota: ${summary.todo} teendő, ${summary.review} átvizsgálás alatt, ${summary.awaiting_approval} jóváhagyásra vár, ${summary.blocked} elakadt, ${summary.done} kész.${
    s.meta.disabledDepartments?.length ? `\nKikapcsolt részlegek (nem dolgoznak, ne adj nekik feladatot, ne várj rájuk): ${s.meta.disabledDepartments.join(", ")}.` : ""
  }`;
}

export async function runAgent(opts: {
  state: CompanyState;
  role: Role;
  task: Task;
  client: ModelClient;
  config: Config;
  workspace: Workspace;
  createdThisRun: { count: number };
  /** Hány dollár költhető még ebben a munkanapban. */
  remainingUsd: () => number;
  /** Más modell, mint a szerep beállított modellje (belső verseny kihívója). */
  model?: string;
  /** Felülírja, kaphat-e személyes adatot (a versenyben soha). */
  personalData?: boolean;
  /** A belső versenyek tanulságai ehhez a feladattípushoz. */
  lessons?: string[];
  /** A saját munkánk tanulságai ehhez a szerephez és feladattípushoz. */
  experience?: string[];
  /** Kiadhat-e motorfejlesztést (Beállítások → Önfejlesztés). */
  selfdev?: boolean;
}): Promise<AgentRun> {
  const { state, role, task, client, config } = opts;
  const model = opts.model ?? modelFor(config, role);
  const ctx: ToolContext = {
    state,
    role,
    task,
    workspace: opts.workspace,
    createdThisRun: opts.createdThisRun,
    finished: false,
    filesWritten: new Set(),
    personalData: opts.personalData ?? personalDataAllowed(config, model),
    selfdev: opts.selfdev ?? config.selfdev.enabled,
  };
  const tools = toolDefinitions(role, task, undefined, opts.workspace instanceof EngineWorkspace);
  const limits = taskLimits(config, task.kind);
  const system = systemPrompt(role, opts.lessons, opts.experience, ctx.selfdev);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: taskPrompt(state, task) }];
  let usd = 0;
  let nudged = false;
  let wrapUp = false;
  let turns = 0;
  let sawPersonalData = false;

  task.status = "in_progress";
  logEvent(state, { actor: role.id, department: role.department, kind: "info", text: `${role.name} dolgozik: ${task.id} ${task.title}` });

  const finish = (outcome: AgentRun["outcome"]): AgentRun => {
    if (!ctx.finished && task.status === "in_progress") {
      task.status = "todo";
      addNote(task, "system", outcome === "budget" ? "Megszakítva: elfogyott a munkanap kerete." : wrapUp ? "Elérte a feladatkeretet; a mentett fájlokból folytatódik a következő munkanapon." : "Nem fejeződött be ebben a munkanapban, folytatódik.");
    }
    return { outcome, turns, usd, filesWritten: [...ctx.filesWritten], sawPersonalData };
  };

  while (turns < limits.turns + (wrapUp ? 1 : 0)) {
    if (opts.remainingUsd() <= 0) return finish("budget");
    turns++;
    const res = await client.create({ model, effort: config.effort[role.tier], system, messages, tools });
    usd += record(state, role.id, res.model ?? model, res.usage).usd;

    if (res.stop_reason === "refusal") {
      blockTask(state, task.id, role.id, "A modell biztonsági okból nem folytatta ezt a feladatot; emberi átnézés kell.");
      ctx.finished = true;
      return finish("refused");
    }

    messages.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

    if (calls.length === 0) {
      if (ctx.finished || wrapUp) break;
      if (nudged) break;
      nudged = true;
      messages.push({ role: "user", content: "A feladat még nincs lezárva. Fejezd be a munkát, és zárd le complete_task, submit_review, request_approval vagy block_task eszközzel." });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = calls.map((c) => {
      const r = runTool(ctx, c.name, c.input);
      if (c.name === "read_email" && !r.isError) sawPersonalData = true;
      return { type: "tool_result", tool_use_id: c.id, content: r.content, is_error: r.isError };
    });
    if (!wrapUp && usd >= limits.usd && !ctx.finished) {
      // Feladatkeret: ne fusson el egy feladat a napi keretből, inkább zárja le, amit eddig elkészített.
      wrapUp = true;
      messages.push({ role: "user", content: [...results, { type: "text", text: "Elérted a feladatra szánt keretet. Ne olvass többet: mentsd write_file-lal, amit eddig elkészítettél, a fájl végére írd fel röviden a hátralévő teendőket, és állj meg. Ha a feladat ténylegesen kész, zárd le complete_task-kal; ha nem, ne zárd le és ne jelöld elakadtnak, a következő munkanapon innen folytatod." }] });
      continue;
    }
    messages.push({ role: "user", content: results });
    if (ctx.finished) break;
  }
  return finish(ctx.finished ? "finished" : "unfinished");
}
