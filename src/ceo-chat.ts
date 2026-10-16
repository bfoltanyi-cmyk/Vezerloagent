// Beszélgetés a vezérigazgató agenttel egy "ceo" címkés GitHub issue-ban.
// A tulajdonos írja az issue-t és a hozzászólásokat, a vezérigazgató hozzászólásban válaszol,
// és amit kell, feladatként vagy irányelvként rögzít, hogy a munkanapok is lássák.

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { roleById } from "../company/org.js";
import { systemPrompt } from "./agent.js";
import { logEvent } from "./board.js";
import { record, spentThisMonth } from "./budget.js";
import { gitCheckpoint } from "./checkpoint.js";
import { loadConfig, missingKeysText, modelFor, personalDataAllowed, type Config } from "./config.js";
import { realGh, type Gh } from "./gates.js";
import type { ModelClient } from "./llm.js";
import { MultiClient } from "./providers.js";
import { loadState, saveState } from "./state.js";
import { CHAT_TOOLS, runTool, toolDefinitions, type ToolContext } from "./tools.js";
import type { Task } from "./types.js";
import { Workspace } from "./workspace.js";

/** Ezzel jelöljük a vezérigazgató hozzászólásait, így a beszélgetés visszaolvasható. */
export const MARKER = "<!-- alicya-ceo -->";
export const GUIDANCE_FILE = "docs/core/tulajdonosi-iranymutatas.md";
const MAX_TURNS = 8;

export interface IssueThread {
  number: number;
  title: string;
  body: string;
  author: string;
  comments: { author: string; body: string }[];
}

/**
 * A tulajdonos és a vezérigazgató üzenetei modellüzenetként. Mások hozzászólásait kihagyjuk.
 * Ha az utolsó szó a vezérigazgatóé, nincs mire válaszolni: null.
 */
export function toMessages(issue: IssueThread, owner: string): Anthropic.Beta.BetaMessageParam[] | null {
  const turns: { role: "user" | "assistant"; text: string }[] = [];
  const push = (role: "user" | "assistant", text: string) => {
    const t = text.trim();
    if (!t) return;
    const last = turns.at(-1);
    if (last && last.role === role) last.text += `\n\n${t}`;
    else turns.push({ role, text: t });
  };
  if (issue.author === owner) push("user", `${issue.title}\n\n${issue.body}`);
  for (const c of issue.comments) {
    if (c.body.includes(MARKER)) push("assistant", c.body.replace(MARKER, ""));
    else if (c.author === owner) push("user", c.body);
  }
  while (turns[0]?.role === "assistant") turns.shift();
  if (turns.length === 0 || turns.at(-1)!.role !== "user") return null;
  return turns.map((t) => ({ role: t.role, content: t.text }));
}

const chatPrompt = (issueNumber: number) => `

Most nem feladaton dolgozol: a tulajdonossal beszélgetsz egy GitHub issue-ban (#${issueNumber}).
- Válaszolj magyarul, közvetlenül és tömören, mint egy vezérigazgató a cégtulajdonosnak. Markdown használható.
- Ha a cég állapotáról kérdez, előbb nézd meg a feladattáblát és a dokumentumokat (list_tasks, read_task, list_files, read_file), és abból válaszolj. Ne találj ki számokat.
- Ha utasítást vagy irányt ad, rögzítsd: konkrét munkát create_task-kal adj ki, az általános irányelveket pedig írd be a ${GUIDANCE_FILE} fájlba (olvasd el előtte, és egészítsd ki dátummal). A következő munkanapok ezt követik.
- A válaszod végén mondd meg röviden, mit rögzítettél.`;

export interface ChatResult {
  text: string;
  usd: number;
}

export async function ceoReply(opts: { config: Config; client: ModelClient; issue: IssueThread; owner: string; maxUsd: number }): Promise<ChatResult | null> {
  const { config, client, issue } = opts;
  const messages = toMessages(issue, opts.owner);
  if (!messages) return null;

  const s = loadState(config.rootDir);
  const role = roleById("ceo")!;
  const now = new Date().toISOString();
  // Látszatfeladat: a beszélgetés nem kerül a táblára, csak az eszközök kontextusa.
  const task: Task = {
    id: `CHAT-${issue.number}`,
    title: issue.title,
    description: "",
    department: "core",
    assignee: role.id,
    status: "in_progress",
    kind: "plan",
    priority: 1,
    dependsOn: [],
    createdBy: opts.owner,
    createdAt: now,
    updatedAt: now,
    notes: [],
  };
  const ctx: ToolContext = {
    state: s,
    role,
    task,
    workspace: new Workspace(config.rootDir),
    createdThisRun: { count: 0 },
    finished: false,
    filesWritten: new Set(),
    personalData: personalDataAllowed(config, modelFor(config, role)),
    allowed: CHAT_TOOLS,
  };
  const tools = toolDefinitions(role, task, CHAT_TOOLS);
  const system = systemPrompt(role) + chatPrompt(issue.number);
  let usd = 0;
  let text = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.create({ model: modelFor(config, role), effort: config.effort[role.tier], system, messages, tools });
    usd += record(s, role.id, res.model ?? modelFor(config, role), res.usage).usd;
    if (res.stop_reason === "refusal") {
      text = "Erre a kérésre nem tudok válaszolni. Fogalmazd meg másképp, vagy kérdezz mást.";
      break;
    }
    messages.push({ role: "assistant", content: res.content });
    text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) break;
    if (usd >= opts.maxUsd || turn === MAX_TURNS - 1) {
      // Keret vagy körszám vége: utolsó kör eszközök nélkül, hogy legyen válasz.
      messages.push({
        role: "user",
        content: [
          ...calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, content: "Kihagyva: elérted a beszélgetés keretét.", is_error: true })),
          { type: "text" as const, text: "Ne hívj több eszközt; válaszolj most azzal, amit eddig tudsz." },
        ],
      });
      const last = await client.create({ model: modelFor(config, role), effort: config.effort[role.tier], system, messages, tools });
      usd += record(s, role.id, last.model ?? modelFor(config, role), last.usage).usd;
      text = last.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      break;
    }
    messages.push({
      role: "user",
      content: calls.map((c) => {
        const r = runTool(ctx, c.name, c.input);
        return { type: "tool_result" as const, tool_use_id: c.id, content: r.content, is_error: r.isError };
      }),
    });
  }

  if (!text) text = "Most nem sikerült érdemben válaszolnom; írd meg újra a kérdést.";
  logEvent(s, { actor: role.id, department: "core", kind: "info", text: `${role.name} válaszolt a tulajdonosnak (issue #${issue.number}).` });
  saveState(config.rootDir, s);
  return { text, usd };
}

export function readIssue(gh: Gh, n: number): IssueThread {
  const v = JSON.parse(gh(["issue", "view", String(n), "--json", "number,title,body,author,comments"])) as {
    number: number;
    title: string;
    body: string;
    author: { login: string };
    comments: { author: { login: string }; body: string }[];
  };
  return { number: v.number, title: v.title, body: v.body ?? "", author: v.author.login, comments: v.comments.map((c) => ({ author: c.author.login, body: c.body })) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = loadConfig();
  const n = Number(process.env.ISSUE_NUMBER);
  const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "";
  const gh = realGh;
  const say = (body: string) => gh(["issue", "comment", String(n), "--body", `${body}\n\n${MARKER}`]);
  (async () => {
    const issue = readIssue(gh, n);
    if (!toMessages(issue, owner)) return console.log("Nincs megválaszolatlan üzenet.");
    if (config.dryRun) return say(`Most nem tudok válaszolni: ${missingKeysText(config) || "próbafutás van beállítva"}.`);
    const s = loadState(config.rootDir);
    const left = config.monthlyBudgetUsd - spentThisMonth(s);
    if (left <= 0) return say(`Ebben a hónapban elfogyott a keret (${config.monthlyBudgetUsd} USD), ezért a hónap végéig nem tudok válaszolni.`);
    const maxUsd = Math.min(left, Number(process.env.CHAT_BUDGET_USD) || 0.5);
    const r = await ceoReply({ config, client: new MultiClient(), issue, owner, maxUsd });
    if (!r) return;
    say(r.text);
    if (process.env.ALICYA_CHECKPOINT === "1") gitCheckpoint(config.rootDir, process.env.WORK_BRANCH || "alicya/munka")(`Vezérigazgató válasza (issue #${n})`);
    console.log(`Válasz elküldve, ${r.usd.toFixed(3)} USD.`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Válasz az issue #${n}-re, ${r.usd.toFixed(3)} USD.\n`);
  })().catch((e) => {
    console.error(e);
    const auth = e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError;
    try {
      say(
        auth
          ? "Nem tudok válaszolni, mert az Anthropic nem fogadja el az API-kulcsot (érvénytelen vagy visszavont). Cseréld le az `ANTHROPIC_API_KEY` titkot a repó beállításaiban, aztán írj ide újra."
          : "Valami hiba történt válaszírás közben. Próbáld újra egy új hozzászólással.",
      );
    } catch {}
    process.exit(1);
  });
}
