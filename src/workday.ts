// Egy munkanap: beolvassa a döntéseidet, a vezérigazgató tervez, a részlegek dolgoznak,
// végül napi jelentés és új jóváhagyási kérések készülnek.

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { roleById } from "../company/org.js";
import { runAgent } from "./agent.js";
import { boardSummary, createTask, logEvent, runnableTasks, seedBacklog, seedPrivacyBacklog } from "./board.js";
import { compactLedger, spentSince, spentThisMonth } from "./budget.js";
import { loadConfig, type Config } from "./config.js";
import { githubAvailable, openIssues, realGh, syncDecisions, type Gh } from "./gates.js";
import { gitCheckpoint, type Checkpoint } from "./checkpoint.js";
import { sweepDecisionIssues } from "./decide.js";
import { sweepBrandingIssues } from "./branding.js";
import { ClaudeClient, type ModelClient } from "./llm.js";
import { loadState, saveState } from "./state.js";
import type { CompanyState } from "./types.js";
import { Workspace } from "./workspace.js";

export interface WorkdayResult {
  status: "worked" | "dry-run" | "over-budget";
  tasksRun: number;
  usd: number;
  files: string[];
}

export async function workday(opts: { config: Config; client?: ModelClient; gh?: Gh; now?: Date; checkpoint?: Checkpoint }): Promise<WorkdayResult> {
  const { config } = opts;
  const now = opts.now ?? new Date();
  const startIso = now.toISOString();
  const s = loadState(config.rootDir);
  seedBacklog(s, now);
  seedPrivacyBacklog(s, now);
  if (opts.gh) {
    syncDecisions(s, opts.gh);
    try {
      sweepDecisionIssues(s, config.rootDir, opts.gh, process.env.GITHUB_REPOSITORY_OWNER ?? "");
      await sweepBrandingIssues(s, config.rootDir, opts.gh, process.env.GITHUB_REPOSITORY_OWNER ?? "");
    } catch (e) {
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `A döntés-issue-kat nem sikerült beolvasni: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` });
    }
  }

  const result: WorkdayResult = { status: "worked", tasksRun: 0, usd: 0, files: [] };

  if (spentThisMonth(s, now) >= config.monthlyBudgetUsd) {
    logEvent(s, { actor: "controller", department: "finance", kind: "warn", text: `Elérte a havi keretet (${config.monthlyBudgetUsd} USD); a cég a hónap végéig pihen.` }, now);
    result.status = "over-budget";
  } else if (config.dryRun || !opts.client) {
    logEvent(s, { actor: "system", department: "system", kind: "warn", text: "Nincs beállítva ANTHROPIC_API_KEY, ezért a cég csak a táblát frissítette, munka nem folyt." }, now);
    result.status = "dry-run";
  } else {
    // Köztes mentés: a vezérlőterem élőben látja, hogy dolgozik a cég, és mi készült el.
    const progress = (message: string) => {
      saveState(config.rootDir, s);
      opts.checkpoint?.(message);
    };
    s.meta.running = startIso;
    progress("Munkanap indul");
    try {
      await work(s, config, opts.client, startIso, result, progress);
    } finally {
      delete s.meta.running;
    }
  }

  if (opts.gh) openIssues(s, opts.gh);
  s.meta.runs++;
  s.meta.lastRun = startIso;
  compactLedger(s, now);
  writeReport(config.rootDir, s, startIso, result);
  saveState(config.rootDir, s);
  return result;
}

async function work(s: CompanyState, config: Config, client: ModelClient, startIso: string, result: WorkdayResult, progress: (message: string) => void): Promise<void> {
  const workspace = new Workspace(config.rootDir);
  const createdThisRun = { count: 0 };
  const remainingUsd = () =>
    Math.min(config.runBudgetUsd - spentSince(s, startIso), config.monthlyBudgetUsd - spentThisMonth(s));
  const files = new Set<string>();

  // Napi tervezés, ha kevés a munka vagy van elakadt feladat.
  const summary = boardSummary(s);
  if (summary.blocked > 0 || runnableTasks(s, config.maxTasksPerRun).length < config.maxTasksPerRun) {
    createTask(s, {
      title: `Napi tervezés (${startIso.slice(0, 10)})`,
      description:
        "Ha van docs/core/tulajdonosi-iranymutatas.md, olvasd el először: ezek a tulajdonos utasításai, ezeket kövesd. Nézd át a feladattáblát. Oldd fel az elakadt feladatokat (átadás vagy pontosítás), és ha egy részlegnek nincs érdemi munkája, hozz létre neki a termék útvonalához illő, jól körülhatárolt feladatot. A fejlesztés legyen a fókusz, a biztonság minden kódmunkát kísérjen. Ne duplikálj meglévő feladatot. A végén zárd le complete_task-kal egy rövid tervvel.",
      department: "core",
      assignee: "ceo",
      kind: "plan",
      priority: 1,
    }, "system");
  }

  for (let i = 0; i < config.maxTasksPerRun; i++) {
    if (remainingUsd() <= 0) {
      logEvent(s, { actor: "controller", department: "finance", kind: "warn", text: "A munkanap költségkerete elfogyott." });
      break;
    }
    const task = runnableTasks(s, 1)[0];
    if (!task) break;
    const role = roleById(task.assignee);
    if (!role) {
      task.status = "blocked";
      continue;
    }
    try {
      const run = await runAgent({ state: s, role, task, client, config, workspace, createdThisRun, remainingUsd });
      result.tasksRun++;
      run.filesWritten.forEach((f) => files.add(f));
      progress(`Munkanap folyamatban: ${task.id} ${role.name}`);
    } catch (e) {
      task.status = "todo";
      const msg = e instanceof Error ? e.message : String(e);
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `Hiba ${task.id} közben: ${msg.slice(0, 300)}` });
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) break;
    }
  }
  result.usd = spentSince(s, startIso);
  result.files = [...files].sort();
}

function writeReport(root: string, s: CompanyState, startIso: string, r: WorkdayResult): void {
  const day = startIso.slice(0, 10);
  const doneToday = s.tasks.filter((t) => t.status === "done" && t.updatedAt >= startIso);
  const pending = s.gates.filter((g) => g.status === "pending");
  const blocked = s.tasks.filter((t) => t.status === "blocked");
  const b = boardSummary(s);
  const lines = [
    `# Napi jelentés · ${day}`,
    "",
    r.status === "dry-run" ? "> A cég ma nem dolgozott, mert nincs beállítva API-kulcs." : r.status === "over-budget" ? "> A cég ma nem dolgozott, mert elérte a havi keretet." : `Ma ${r.tasksRun} feladaton dolgoztunk, ${r.usd.toFixed(2)} USD költséggel.`,
    "",
    "## Rád vár",
    ...(pending.length ? pending.map((g) => `- **${g.id}** ${g.title}${g.issueNumber ? ` (issue #${g.issueNumber})` : ""}`) : ["- Semmi."]),
    "",
    "## Elkészült",
    ...(doneToday.length ? doneToday.map((t) => `- ${t.id} ${t.title} · ${roleById(t.assignee)?.name ?? t.assignee}`) : ["- Ma nem zárult le feladat."]),
    "",
    "## Elakadt",
    ...(blocked.length ? blocked.map((t) => `- ${t.id} ${t.title}: ${t.notes.at(-1)?.text ?? ""}`) : ["- Nincs."]),
    "",
    `Tábla: ${b.todo} teendő · ${b.in_progress} folyamatban · ${b.review} átvizsgálás · ${b.awaiting_approval} jóváhagyásra vár · ${b.blocked} elakadt · ${b.done} kész.`,
    `Havi költés: ${spentThisMonth(s, new Date(startIso)).toFixed(2)} USD.`,
    "",
  ];
  const dir = path.join(root, "state", "reports");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${day}.md`), lines.join("\n"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = loadConfig();
  const gh = githubAvailable() ? realGh : undefined;
  const client = config.dryRun ? undefined : new ClaudeClient();
  const checkpoint = process.env.ALICYA_CHECKPOINT === "1" ? gitCheckpoint(config.rootDir, process.env.WORK_BRANCH || "alicya/munka") : undefined;
  workday({ config, client, gh, checkpoint })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${r.status}\ntasks=${r.tasksRun}\nusd=${r.usd.toFixed(2)}\n`);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
