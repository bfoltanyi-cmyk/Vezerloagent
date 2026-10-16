import type Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { roleById } from "../company/org.js";
import { createTask, emptyState } from "../src/board.js";
import { costUsd } from "../src/budget.js";
import { loadConfig, personalDataAllowed } from "../src/config.js";
import { emptyInbox, saveInbox } from "../src/inbox-store.js";
import { processEmails } from "../src/inbox.js";
import type { ModelClient, ModelRequest } from "../src/llm.js";
import { fromChatResponse, fromResponses, KimiClient, MultiClient, OpenAIClient, parseModel, toChatMessages } from "../src/providers.js";
import { runTool } from "../src/tools.js";
import { Workspace } from "../src/workspace.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nexus-prov-"));

type Call = { url: string; body: any; headers: Record<string, string> };
/** Hamis HTTP: a megadott válaszokat adja sorban, és rögzíti a kéréseket. */
function fakeFetch(responses: Array<{ status?: number; json?: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  let i = 0;
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    const status = r.status ?? 200;
    return new Response(JSON.stringify(r.json ?? { error: { message: "hiba" } }), { status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const chat = (message: Record<string, unknown>, finish = "stop", usage: Record<string, unknown> = { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 600 } }): any => ({
  id: "chatcmpl-1",
  choices: [{ finish_reason: finish, message: { role: "assistant", ...message } }],
  usage,
});

const req = (model: string, messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: "Szia" }]): ModelRequest => ({
  model,
  effort: "medium",
  system: "Rendszer",
  messages,
  tools: [{ name: "write_file", description: "Fájl írása", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }],
});

afterEach(() => {
  delete process.env.MODEL_PRICES;
  delete process.env.INBOX_PASSPHRASE;
});

describe("modellszolgáltatók", () => {
  it("a modellnév előtagjából tudja a szolgáltatót", () => {
    expect(parseModel("claude-sonnet-5-5")).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(parseModel("openai:gpt-6-sol")).toEqual({ provider: "openai", model: "gpt-6-sol" });
    expect(parseModel("moonshot:kimi-k2.6")).toEqual({ provider: "kimi", model: "kimi-k2.6" });
    expect(() => parseModel("valami:x")).toThrow(/Ismeretlen/);
  });

  it("Kimi: az eszközhívásos beszélgetést helyesen fordítja Chat Completions formára", () => {
    const msgs = toChatMessages("Rendszer", [
      { role: "user", content: "Írd meg a fájlt." },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Előbb megírom.", signature: "" },
          { type: "tool_use", id: "write_file:0", name: "write_file", input: { path: "docs/a.md" } },
          { type: "tool_use", id: "list_files:1", name: "list_files", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "write_file:0", content: "Mentve" },
          { type: "tool_result", tool_use_id: "list_files:1", content: "Nincs jogod", is_error: true },
          { type: "text", text: "Elérted a keretet." },
        ],
      },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "tool", "user"]);
    const a = msgs[2] as any;
    // A Kimi nem fogad el null tartalmat, és a gondolatmenetnek az eszközhívással együtt kell mennie.
    expect(a.content).toBe("");
    expect(a.reasoning_content).toBe("Előbb megírom.");
    expect(a.tool_calls.map((c: any) => [c.id, c.function.name, JSON.parse(c.function.arguments)])).toEqual([
      ["write_file:0", "write_file", { path: "docs/a.md" }],
      ["list_files:1", "list_files", {}],
    ]);
    expect(msgs[3]).toEqual({ role: "tool", tool_call_id: "write_file:0", name: "write_file", content: "Mentve" });
    expect(msgs[4]).toEqual({ role: "tool", tool_call_id: "list_files:1", name: "list_files", content: "HIBA: Nincs jogod" });
  });

  it("Kimi: a választ Anthropic-formára fordítja (gondolatmenet, eszközhívás, gyorsítótár)", () => {
    const m = fromChatResponse(
      chat({ content: "", reasoning_content: "Gondolkodom", tool_calls: [{ id: "c1", type: "function", function: { name: "write_file", arguments: '{"path":"docs/x.md"}' } }, { id: "c2", type: "function", function: { name: "write_file", arguments: "{rossz" } }] }, "tool_calls"),
      "kimi:kimi-k2.6",
    );
    expect(m.model).toBe("kimi:kimi-k2.6");
    expect(m.stop_reason).toBe("tool_use");
    expect(m.content.map((b) => b.type)).toEqual(["thinking", "tool_use", "tool_use"]);
    expect((m.content[1] as any).input).toEqual({ path: "docs/x.md" });
    expect((m.content[2] as any).input).toEqual({ _hibas_json: "{rossz" });
    expect(m.usage).toMatchObject({ input_tokens: 400, cache_read_input_tokens: 600, output_tokens: 200 });
    expect(fromChatResponse(chat({ content: "ok" }, "stop", { prompt_tokens: 100, completion_tokens: 5, cached_tokens: 40 }), "kimi:x").usage).toMatchObject({ input_tokens: 60, cache_read_input_tokens: 40 });
    expect(fromChatResponse(chat({ content: "félbe" }, "length"), "kimi:x").stop_reason).toBe("max_tokens");
  });

  it("Kimi-kérés: max_completion_tokens, nem szigorú eszközök, gondolkodási szint csak a K3-nak", async () => {
    const { f, calls } = fakeFetch([{ json: chat({ content: "Kész." }) }]);
    const k = new KimiClient({ env: { MOONSHOT_API_KEY: "k" }, fetchImpl: f, retries: 0 });
    await k.create(req("kimi:kimi-k2.6"));
    await k.create({ ...req("kimi:kimi-k3"), effort: "medium" });
    expect(calls[0]!.url).toBe("https://api.moonshot.ai/v1/chat/completions");
    expect(calls[0]!.headers.Authorization).toBe("Bearer k");
    const b = calls[0]!.body;
    expect(b.model).toBe("kimi-k2.6");
    expect(b.max_completion_tokens).toBe(32000);
    expect(b.max_tokens).toBeUndefined();
    expect(b.reasoning_effort).toBeUndefined();
    expect(b.temperature).toBeUndefined();
    expect(b.tools[0].function.strict).toBe(false);
    expect(calls[1]!.body.reasoning_effort).toBe("high");
  });

  it("OpenAI: Responses API, titkosított gondolatmenet, nem tárolt beszélgetés", async () => {
    const out = {
      id: "resp_1",
      status: "completed",
      output: [
        { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "TITOK" },
        { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Megírom.", annotations: [] }] },
        { type: "function_call", id: "fc_1", call_id: "call_1", name: "write_file", arguments: '{"path":"docs/a.md"}', status: "completed" },
      ],
      usage: { input_tokens: 1000, output_tokens: 300, input_tokens_details: { cached_tokens: 500, cache_write_tokens: 100 } },
    };
    const { f, calls } = fakeFetch([{ json: out }, { json: { id: "resp_2", status: "completed", output: [{ type: "message", id: "msg_2", role: "assistant", content: [{ type: "output_text", text: "Kész." }] }], usage: { input_tokens: 10, output_tokens: 2 } } }]);
    const c = new OpenAIClient({ env: { OPENAI_API_KEY: "sk-teszt" }, fetchImpl: f, retries: 0 });
    const r1 = await c.create(req("openai:gpt-6-sol"));
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/responses");
    const b = calls[0]!.body;
    expect(b).toMatchObject({ model: "gpt-6-sol", instructions: "Rendszer", store: false, include: ["reasoning.encrypted_content"], reasoning: { effort: "medium" }, max_output_tokens: 32000, tool_choice: "auto" });
    expect(b.tools[0]).toEqual({ type: "function", name: "write_file", description: "Fájl írása", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, strict: false });
    expect(b.input).toEqual([{ role: "user", content: "Szia" }]);
    expect(r1.stop_reason).toBe("tool_use");
    expect(r1.content.map((x) => x.type)).toEqual(["redacted_thinking", "text", "tool_use"]);
    expect(r1.content[2]).toMatchObject({ id: "call_1", name: "write_file", input: { path: "docs/a.md" } });
    expect(r1.usage).toMatchObject({ input_tokens: 400, cache_read_input_tokens: 500, cache_creation_input_tokens: 100, output_tokens: 300 });

    // Második kör: a modell kimenete változatlanul, aztán az eszköz eredménye.
    await c.create(req("openai:gpt-6-sol", [
      { role: "user", content: "Szia" },
      { role: "assistant", content: r1.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "Mentve" }, { type: "text", text: "Folytasd." }] },
    ]));
    expect(calls[1]!.body.input).toEqual([
      { role: "user", content: "Szia" },
      out.output[0],
      out.output[1],
      out.output[2],
      { type: "function_call_output", call_id: "call_1", output: "Mentve" },
      { role: "user", content: "Folytasd." },
    ]);
  });

  it("OpenAI: csonka és visszautasított válasz", () => {
    expect(fromResponses({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, "openai:x").stop_reason).toBe("max_tokens");
    expect(fromResponses({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Nem" }] }] }, "openai:x").stop_reason).toBe("refusal");
  });

  it("túlterhelésnél újrapróbál; hibás kérésnél és elfogyott egyenlegnél nem", async () => {
    const ok = fakeFetch([{ status: 429, json: { error: { type: "engine_overloaded_error" } }, headers: { "retry-after": "0" } }, { status: 503 }, { json: chat({ content: "Kész." }) }]);
    await expect(new KimiClient({ env: { MOONSHOT_API_KEY: "k" }, fetchImpl: ok.f, retries: 3, retryBaseMs: 1 }).create(req("kimi:kimi-k2.6"))).resolves.toBeTruthy();
    expect(ok.calls).toHaveLength(3);
    const quota = fakeFetch([{ status: 429, json: { error: { type: "exceeded_current_quota_error", message: "Account balance is insufficient" } } }]);
    await expect(new KimiClient({ env: { MOONSHOT_API_KEY: "k" }, fetchImpl: quota.f, retries: 3, retryBaseMs: 1 }).create(req("kimi:kimi-k2.6"))).rejects.toThrow(/429/);
    expect(quota.calls).toHaveLength(1);
    const bad = fakeFetch([{ status: 400, json: { error: { message: "rossz paraméter" } } }]);
    await expect(new OpenAIClient({ env: { OPENAI_API_KEY: "k" }, fetchImpl: bad.f, retries: 3, retryBaseMs: 1 }).create(req("openai:gpt-6-sol"))).rejects.toThrow(/400.*rossz paraméter/);
    expect(bad.calls).toHaveLength(1);
    await expect(new OpenAIClient({ env: {}, fetchImpl: bad.f, retries: 0 }).create(req("openai:gpt-6-sol"))).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("a vegyes kliens a modellnév szerint küldi tovább, az Anthropicnak előtag nélkül", async () => {
    const seen: [string, string][] = [];
    const fake = (p: string): ModelClient => ({ async create(r) { seen.push([p, r.model]); return fromChatResponse(chat({ content: "ok" }), r.model); } });
    const mc = new MultiClient({}, (p) => fake(p));
    await mc.create(req("claude-sonnet-5-5"));
    await mc.create(req("anthropic:claude-haiku-5-5"));
    await mc.create(req("openai:gpt-6-sol"));
    await mc.create(req("kimi:kimi-k2.6"));
    expect(seen).toEqual([["anthropic", "claude-sonnet-5-5"], ["anthropic", "claude-haiku-5-5"], ["openai", "openai:gpt-6-sol"], ["kimi", "kimi:kimi-k2.6"]]);
  });

  it("hiányzó kulcsnál nem dolgozik a cég, és megmondja, melyik kulcs hiányzik", () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: "a" }).dryRun).toBe(false);
    const c = loadConfig({ ANTHROPIC_API_KEY: "a", MODEL_WORKER: "openai:gpt-6-sol" });
    expect(c.dryRun).toBe(true);
    expect(c.missingKeys).toEqual(["OPENAI_API_KEY"]);
    const all = loadConfig({ OPENAI_API_KEY: "o", MOONSHOT_API_KEY: "m", MODEL_STRATEGIC: "openai:gpt-6-astra", MODEL_LEAD: "openai:gpt-6-astra", MODEL_WORKER: "kimi:kimi-k2.6", MODEL_BULK: "kimi:kimi-k2.6" });
    // Csak OpenAI és Kimi: Anthropic-kulcs nélkül is dolgozhat, a levelek pedig az OpenAI-hoz mennek.
    expect(all.dryRun).toBe(false);
    expect(all.inboxModel).toBe("openai:gpt-6-astra");
  });

  it("ügyféllevél alapból nem mehet a Kimihez", () => {
    const c = loadConfig({ ANTHROPIC_API_KEY: "a", MOONSHOT_API_KEY: "m", MODEL_BULK: "kimi:kimi-k2.6", MODEL_WORKER: "kimi:kimi-k2.6" });
    expect(c.inboxModel).toBe("claude-haiku-5-5");
    expect(personalDataAllowed(c, "kimi:kimi-k2.6")).toBe(false);
    expect(personalDataAllowed(c, "claude-sonnet-5-5")).toBe(true);
    const explicit = loadConfig({ ANTHROPIC_API_KEY: "a", MOONSHOT_API_KEY: "m", MODEL_BULK: "kimi:kimi-k2.6", PERSONAL_DATA_PROVIDERS: "anthropic, openai, kimi" });
    expect(explicit.inboxModel).toBe("kimi:kimi-k2.6");
  });

  it("a levélfeldolgozás az engedélyezett modellt használja", async () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: "a", MOONSHOT_API_KEY: "m", MODEL_BULK: "kimi:kimi-k2.6" }, tmp());
    const models: string[] = [];
    const client: ModelClient = {
      async create(r) {
        models.push(r.model);
        return { id: "m", type: "message", role: "assistant", model: r.model, content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Beta.BetaMessage;
      },
    };
    await processEmails(emptyState(), emptyInbox(), [{ uid: 1, receivedAt: "2026-10-16T08:00:00Z", from: "a@b.hu", fromName: "A", subject: "x", text: "y", attachments: [] }], client, config);
    expect(models).toEqual(["claude-haiku-5-5"]);
  });

  it("Kimin dolgozó agent nem olvashatja el az ügyfél levelét", () => {
    const root = tmp();
    saveInbox(root, { ...emptyInbox(), items: [{ id: "E-0001", uid: 1, receivedAt: "", from: "a@b.hu", fromName: "Anna", subject: "", category: "tamogatas", urgency: "kozepes", summary: "", company: "", contactName: "", phone: "", deadline: "", amounts: [], products: [], actions: [], needsReply: true, attachments: [], excerpt: "" }] }, "j");
    process.env.INBOX_PASSPHRASE = "j";
    const s = emptyState();
    const role = roleById("kb-editor")!;
    const task = createTask(s, { title: "Válasz", description: "Válaszolj az E-0001 levélre.", department: "support", assignee: role.id }, "system");
    const base = { state: s, role, task, workspace: new Workspace(root), createdThisRun: { count: 0 }, finished: false, filesWritten: new Set<string>() };
    expect(runTool({ ...base, personalData: true }, "read_email", { email_id: "E-0001" }).content).toContain("Anna");
    const r = runTool({ ...base, personalData: false }, "read_email", { email_id: "E-0001" });
    expect(r.isError).toBe(true);
    expect(r.content).not.toContain("Anna");
  });

  it("árazás szolgáltató-előtaggal és saját árral", () => {
    const u = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    expect(costUsd("anthropic:claude-sonnet-5-5", u)).toBe(costUsd("claude-sonnet-5-5", u));
    process.env.MODEL_PRICES = JSON.stringify({ "kimi:sajat-modell": { input: 1, output: 2 } });
    expect(costUsd("kimi:sajat-modell", u)).toBe(3);
    process.env.MODEL_PRICES = "nem json";
    expect(costUsd("kimi:sajat-modell", u)).toBe(60);
  });
});
