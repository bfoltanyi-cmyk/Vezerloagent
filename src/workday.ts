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
import { loadConfig, missingKeysText, modelFor, type Config } from "./config.js";
import { githubAvailable, openIssues, realGh, syncDecisions, type Gh } from "./gates.js";
import { gitCheckpoint, type Checkpoint } from "./checkpoint.js";
import { sweepDecisionIssues } from "./decide.js";
import { sweepBrandingIssues } from "./branding.js";
import { sweepSettingsIssues } from "./settings.js";
import { ArenaSession } from "./arena.js";
import type { ModelClient } from "./llm.js";
import { MultiClient, ProviderAccountError, providerKey, providerOf, type ProviderId } from "./providers.js";
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
    const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "";
    // Egymástól függetlenül, hogy egy hibás issue ne akassza meg a többit.
    const sweeps: [string, () => unknown][] = [
      ["döntés", () => sweepDecisionIssues(s, config.rootDir, opts.gh!, owner)],
      ["márkázás", () => sweepBrandingIssues(s, config.rootDir, opts.gh!, owner)],
      // Az elmaradt beállítás-kérések; a következő munkanaptól érvényesek.
      ["beállítás", () => sweepSettingsIssues(s, config.rootDir, opts.gh!, owner)],
    ];
    for (const [name, sweep] of sweeps) {
      try {
        await sweep();
      } catch (e) {
        logEvent(s, { actor: "system", department: "system", kind: "warn", text: `A(z) ${name}-issue-kat nem sikerült beolvasni: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` });
      }
    }
  }

  const result: WorkdayResult = { status: "worked", tasksRun: 0, usd: 0, files: [] };
  s.meta.models = { strategic: config.strategic.model, strategicRoles: config.strategic.roles, ...config.models, inbox: config.inboxModel, roles: config.roleModels };
  // Melyik kulcs van beállítva (csak igen/nem): a Beállítások fül ebből mutatja, mi hiányzik.
  s.meta.personalDataProviders = config.personalDataProviders;
  s.meta.keys = { anthropic: Boolean(providerKey("anthropic")), openai: Boolean(providerKey("openai")), kimi: Boolean(providerKey("kimi")), imap: Boolean(process.env.IMAP_HOST && process.env.INBOX_PASSPHRASE), at: now.toISOString() };

  if (spentThisMonth(s, now) >= config.monthlyBudgetUsd) {
    logEvent(s, { actor: "controller", department: "finance", kind: "warn", text: `Elérte a havi keretet (${config.monthlyBudgetUsd} USD); a cég a hónap végéig pihen.` }, now);
    result.status = "over-budget";
  } else if (config.paused && process.env.GITHUB_EVENT_NAME === "schedule") {
    // Az ütemező kapuja ezt már kiszűri; ez a második védvonal, ha a kapu nem tudta beolvasni a beállítást.
    logEvent(s, { actor: "system", department: "system", kind: "info", text: "A cég szünetel, az ütemezett munkanap kimaradt." }, now);
    result.status = "dry-run";
  } else if (config.dryRun || !opts.client) {
    logEvent(s, { actor: "system", department: "system", kind: "warn", text: `${missingKeysText(config) || "Próbafutás (DRY_RUN)"}, ezért a cég csak a táblát frissítette, munka nem folyt.` }, now);
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

  const deadProviders = new Set<ProviderId>();
  const arena = new ArenaSession(s, config, client, workspace);
  for (let i = 0; i < config.maxTasksPerRun; i++) {
    if (remainingUsd() <= 0) {
      logEvent(s, { actor: "controller", department: "finance", kind: "warn", text: "A munkanap költségkerete elfogyott." });
      break;
    }
    // Akinek a szolgáltatójánál rossz a kulcs vagy elfogyott az egyenleg, azt ma kihagyjuk; a többiek dolgoznak.
    const task = runnableTasks(s, s.tasks.length).find((t) => {
      const r = roleById(t.assignee);
      return !r || !deadProviders.has(providerOf(modelFor(config, r)));
    });
    if (!task) break;
    const role = roleById(task.assignee);
    if (!role) {
      task.status = "blocked";
      continue;
    }
    // Belső verseny: egy másik modell előbb árnyékban megoldja ugyanezt, aztán a bíró összeveti a kettőt.
    const duel = await arena.challenge(role, task, modelFor(config, role), remainingUsd, createdThisRun);
    try {
      const run = await runAgent({ state: s, role, task, client, config, workspace, createdThisRun, remainingUsd, lessons: arena.lessons(task.kind) });
      result.tasksRun++;
      run.filesWritten.forEach((f) => files.add(f));
      if (duel) {
        await arena.judge(duel, run).catch((e) => {
          logEvent(s, { actor: "system", department: "system", kind: "warn", text: `Aréna ${duel.id}: a pontozás nem sikerült: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` });
        });
      }
      progress(`Munkanap folyamatban: ${task.id} ${role.name}`);
    } catch (e) {
      if (duel) arena.abandon(duel);
      task.status = "todo";
      const msg = e instanceof Error ? e.message : String(e);
      logEvent(s, { actor: "system", department: "system", kind: "warn", text: `Hiba ${task.id} közben: ${msg.slice(0, 300)}` });
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) deadProviders.add("anthropic");
      else if (e instanceof ProviderAccountError) deadProviders.add(e.provider);
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
  const client = config.dryRun ? undefined : new MultiClient();
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
