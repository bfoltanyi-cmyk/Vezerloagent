import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ModelClient, ModelRequest } from "../src/llm.js";
import { loadState } from "../src/state.js";
import { workday } from "../src/workday.js";
import { ProviderAccountError } from "../src/providers.js";
import type { Gh } from "../src/gates.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-wd-"));

let seq = 0;
const msg = (content: Anthropic.Beta.BetaContentBlock[], stop: string = "tool_use"): Anthropic.Beta.BetaMessage =>
  ({
    id: `msg_${seq++}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: stop,
    usage: { input_tokens: 1000, output_tokens: 200 },
  }) as unknown as Anthropic.Beta.BetaMessage;

const call = (name: string, input: unknown) =>
  ({ type: "tool_use", id: `tu_${seq++}`, name, input }) as unknown as Anthropic.Beta.BetaContentBlock;

/** Szerepalapú hamis modell: minden szerep a saját forgatókönyvét játssza. */
class ScriptedClient implements ModelClient {
  requests: ModelRequest[] = [];
  async create(req: ModelRequest) {
    this.requests.push(req);
    const role = /\(([a-z-]+)\), részleg/.exec(req.system)?.[1];
    const first = req.messages.length === 1;
    const prompt = typeof req.messages[0]!.content === "string" ? req.messages[0]!.content : "";
    if (!first) return msg([{ type: "text", text: "Kész." } as Anthropic.Beta.BetaContentBlock], "end_turn");
    switch (role) {
      case "ceo":
        return msg([call("complete_task", { summary: "Átnéztem a táblát, a piackutatás az első." })]);
      case "market-researcher":
        return msg([
          call("write_file", { path: "docs/product/market.md", content: "# Piac\nKKV számlázás + készlet." }),
          call("complete_task", { summary: "Piackutatás kész: docs/product/market.md" }),
        ]);
      case "ciso":
        return msg([
          call("write_file", { path: "../../etc/passwd", content: "x" }),
          call("write_file", { path: "docs/security/policy.md", content: "# Biztonsági szabályzat" }),
          call("complete_task", { summary: "Szabályzat kész." }),
        ]);
      case "privacy-officer":
        return msg([
          call("privacy_lookup", { jurisdictions: ["HU", "PL", "CZ"], topic: "megorzes" }),
          call("write_file", { path: "docs/security/privacy/requirements.md", content: "# Adatvédelmi követelmények" }),
          call("complete_task", { summary: "Követelmények kész." }),
        ]);
      case "product-manager":
        return msg([
          call("write_file", { path: "docs/product/prd.md", content: "# PRD" }),
          call("request_approval", { kind: "spec", title: "PRD v1: számlázás + készlet", summary: "Nézd át a docs/product/prd.md fájlt, és döntsd el, ezt építsük-e." }),
        ]);
      default:
        return msg([call("block_task", { reason: `Nincs forgatókönyv: ${prompt.slice(0, 40)}` })]);
    }
  }
}

describe("munkanap", () => {
  it("API-kulcs nélkül nem hív modellt, csak a táblát készíti elő", async () => {
    const root = tmp();
    const config = loadConfig({}, root);
    expect(config.dryRun).toBe(true);
    const r = await workday({ config, now: new Date("2026-10-13T06:00:00Z") });
    expect(r.status).toBe("dry-run");
    const s = loadState(root);
    expect(s.tasks.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, "state", "reports", "2026-10-13.md"))).toBe(true);
  });

  it("tervez, dolgozik, jóváhagyást kér és GitHub issue-t nyit", async () => {
    const root = tmp();
    const config = { ...loadConfig({ ANTHROPIC_API_KEY: "x", MAX_TASKS_PER_RUN: "6" }, root) };
    const client = new ScriptedClient();
    const ghCalls: string[][] = [];
    const gh: Gh = (args) => {
      ghCalls.push(args);
      return args[1] === "create" && args[0] === "issue" ? "https://github.com/o/r/issues/7\n" : "";
    };

    const r = await workday({ config, client, gh, now: new Date() });
    expect(r.status).toBe("worked");
    const s = loadState(root);
    const byTitle = (p: string) => s.tasks.find((t) => t.title.startsWith(p))!;
    expect(byTitle("Napi tervezés").status).toBe("done");
    expect(byTitle("Piaci rés").status).toBe("done");
    expect(byTitle("Biztonsági alapszabályzat").status).toBe("done");
    expect(byTitle("Adatvédelmi követelmények").status).toBe("done");
    expect(byTitle("Napi tervezés").id).toBe(s.events.find((e) => e.text.includes("dolgozik"))!.text.match(/T-\d+/)![0]);
    expect(byTitle("PRD").status).toBe("awaiting_approval");
    expect(fs.readFileSync(path.join(root, "docs/security/policy.md"), "utf8")).toContain("szabályzat");
    expect(r.files).toContain("docs/product/market.md");

    // A kilépési kísérlet hibát kapott, nem írt semmit.
    const ciso = client.requests.find((q) => q.system.includes("(ciso)") && q.messages.length > 1)!;
    const results = ciso.messages[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0]!.is_error).toBe(true);

    const gate = s.gates[0]!;
    expect(gate.issueNumber).toBe(7);
    expect(ghCalls.some((a) => a[0] === "issue" && a[1] === "create")).toBe(true);
    expect(s.ledger.length).toBeGreaterThan(0);
    // Csak a vezérigazgató és az architekt kap Opust, a többi vezető és munkatárs Sonnetet.
    expect(client.requests.find((q) => q.system.includes("(ceo)"))!.model).toBe("claude-opus-5-5");
    expect(client.requests.find((q) => q.system.includes("(market-researcher)"))!.model).toBe("claude-sonnet-5-5");
    expect(client.requests.find((q) => q.system.includes("(product-manager)"))!.model).toBe("claude-sonnet-5-5");
  });

  it("ha egy szolgáltatónál rossz a kulcs, azt a napra kihagyja, a többiek dolgoznak tovább", async () => {
    const root = tmp();
    // A vezetők az OpenAI-n dolgoznak, ott rossz a kulcs; a vezérigazgató és a munkatársak az Anthropicon.
    const config = loadConfig({ ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "rossz", MODEL_LEAD: "openai:gpt-6.1-sol", MAX_TASKS_PER_RUN: "6" }, root);
    const scripted = new ScriptedClient();
    const openaiCalls: string[] = [];
    const client: ModelClient = {
      create(req) {
        if (req.model.startsWith("openai:")) {
          openaiCalls.push(req.model);
          return Promise.reject(new ProviderAccountError("openai", "OpenAI hívás sikertelen: 401"));
        }
        return scripted.create(req);
      },
    };
    const r = await workday({ config, client, now: new Date() });
    expect(openaiCalls).toHaveLength(1);
    expect(r.tasksRun).toBeGreaterThan(1);
    expect(loadState(root).events.some((e) => e.text.includes("401"))).toBe(true);
  });

  it("munka közben menti az állapotot, hogy a vezérlőterem élőben lássa", async () => {
    const root = tmp();
    const config = loadConfig({ ANTHROPIC_API_KEY: "x", MAX_TASKS_PER_RUN: "3" }, root);
    const saves: { message: string; running?: string; done: number }[] = [];
    const checkpoint = (message: string) => {
      const s = loadState(root);
      saves.push({ message, running: s.meta.running, done: s.tasks.filter((t) => t.status === "done").length });
      return true;
    };

    const r = await workday({ config, client: new ScriptedClient(), checkpoint });
    expect(saves[0]).toMatchObject({ message: "Munkanap indul", done: 0 });
    expect(saves).toHaveLength(1 + r.tasksRun);
    expect(saves.every((x) => x.running)).toBe(true);
    expect(saves.at(-1)!.done).toBeGreaterThan(0);
    expect(loadState(root).meta.running).toBeUndefined();
  });

  it("beolvassa a GitHubon hozott döntést", async () => {
    const root = tmp();
    const client = new ScriptedClient();
    const config = loadConfig({ ANTHROPIC_API_KEY: "x", MAX_TASKS_PER_RUN: "4" }, root);
    const gh1: Gh = (a) => (a[0] === "issue" && a[1] === "create" ? "https://github.com/o/r/issues/3" : "");
    await workday({ config, client, gh: gh1 });

    const gh2: Gh = (a) =>
      a[0] === "issue" && a[1] === "view"
        ? JSON.stringify({ state: "OPEN", stateReason: null, labels: [{ name: "kapu" }, { name: "elutasítva" }], comments: [{ body: "Kell bele a NAV is." }] })
        : "";
    await workday({ config: { ...config, dryRun: true }, gh: gh2 });
    const s = loadState(root);
    expect(s.gates[0]!.status).toBe("rejected");
    const prd = s.tasks.find((t) => t.title.startsWith("PRD"))!;
    expect(prd.status).toBe("todo");
    expect(prd.notes.at(-1)!.text).toContain("NAV");
  });

  it("havi keret felett nem dolgozik", async () => {
    const root = tmp();
    const client = new ScriptedClient();
    const config = loadConfig({ ANTHROPIC_API_KEY: "x", MONTHLY_BUDGET_USD: "0" }, root);
    const r = await workday({ config, client });
    expect(r.status).toBe("over-budget");
    expect(client.requests).toHaveLength(0);
  });
});

describe("költségkorlát feladatonként", () => {
  it("a keret elérésekor lezárásra szólítja az agentet, és az még lezárhatja", async () => {
    const { runAgent } = await import("../src/agent.js");
    const { roleById } = await import("../company/org.js");
    const { createTask, emptyState } = await import("../src/board.js");
    const { Workspace } = await import("../src/workspace.js");
    const root = tmp();
    const config = { ...loadConfig({ ANTHROPIC_API_KEY: "x", TASK_BUDGET_USD: "0.001" }, root) };
    const s = emptyState();
    const task = createTask(s, { title: "Hosszú elemzés", description: "Valami hosszú munka, sok olvasással.", department: "product", assignee: "market-researcher" }, "system");
    const prompts: string[] = [];
    let n = 0;
    const client: ModelClient = {
      async create(req) {
        n++;
        const last = req.messages.at(-1)!.content;
        prompts.push(JSON.stringify(last));
        if (prompts.at(-1)!.includes("feladatra szánt keretet")) return msg([call("complete_task", { summary: "Részeredmény mentve, lezárva." })]);
        return msg([call("list_tasks", {})]);
      },
    };
    const run = await runAgent({ state: s, role: roleById("market-researcher")!, task, client, config, workspace: new Workspace(root), createdThisRun: { count: 0 }, remainingUsd: () => 10 });
    expect(run.outcome).toBe("finished");
    expect(n).toBe(2);
    expect(task.status).toBe("done");
  });

  it("ha a keretnél nem kész, a feladat nyitva marad a következő munkanapra", async () => {
    const { runAgent } = await import("../src/agent.js");
    const { roleById } = await import("../company/org.js");
    const { createTask, emptyState } = await import("../src/board.js");
    const { Workspace } = await import("../src/workspace.js");
    const root = tmp();
    const config = { ...loadConfig({ ANTHROPIC_API_KEY: "x", TASK_BUDGET_USD: "0.001" }, root) };
    const s = emptyState();
    const task = createTask(s, { title: "Hosszú elemzés", description: "Valami hosszú munka, sok olvasással.", department: "product", assignee: "market-researcher" }, "system");
    let n = 0;
    const client: ModelClient = {
      async create(req) {
        n++;
        if (JSON.stringify(req.messages.at(-1)!.content).includes("feladatra szánt keretet")) return msg([]);
        return msg([call("list_tasks", {})]);
      },
    };
    const run = await runAgent({ state: s, role: roleById("market-researcher")!, task, client, config, workspace: new Workspace(root), createdThisRun: { count: 0 }, remainingUsd: () => 10 });
    expect(run.outcome).toBe("unfinished");
    expect(n).toBe(2);
    expect(task.status).toBe("todo");
  });
});
