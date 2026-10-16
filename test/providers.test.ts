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
import { ChatCompletionsClient, fromChatResponse, MultiClient, parseModel, PROVIDERS, toChatMessages } from "../src/providers.js";
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
    expect(parseModel("openai:gpt-5-mini")).toEqual({ provider: "openai", model: "gpt-5-mini" });
    expect(parseModel("moonshot:kimi-k2-thinking")).toEqual({ provider: "kimi", model: "kimi-k2-thinking" });
    expect(() => parseModel("valami:x")).toThrow(/Ismeretlen/);
  });

  it("az eszközhívásos beszélgetést helyesen fordítja Chat Completions formára", () => {
    const msgs = toChatMessages(
      "Rendszer",
      [
        { role: "user", content: "Írd meg a fájlt." },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Előbb megírom.", signature: "" },
            { type: "text", text: "Megírom." },
            { type: "tool_use", id: "call_1", name: "write_file", input: { path: "docs/a.md" } },
            { type: "tool_use", id: "call_2", name: "list_files", input: {} },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "call_1", content: "Mentve" },
            { type: "tool_result", tool_use_id: "call_2", content: "Nincs jogod", is_error: true },
            { type: "text", text: "Elérted a keretet." },
          ],
        },
      ],
      PROVIDERS.kimi,
    );
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "tool", "user"]);
    const a = msgs[2] as any;
    expect(a.content).toBe("Megírom.");
    expect(a.reasoning_content).toBe("Előbb megírom.");
    expect(a.tool_calls.map((c: any) => [c.id, c.function.name, JSON.parse(c.function.arguments)])).toEqual([
      ["call_1", "write_file", { path: "docs/a.md" }],
      ["call_2", "list_files", {}],
    ]);
    expect(msgs[4]).toEqual({ role: "tool", tool_call_id: "call_2", content: "HIBA: Nincs jogod" });
    // Az OpenAI-nak nem küldünk gondolatmenet-mezőt.
    const o = toChatMessages("R", [{ role: "assistant", content: [{ type: "thinking", thinking: "x", signature: "" }, { type: "text", text: "y" }] }], PROVIDERS.openai);
    expect((o[1] as any).reasoning_content).toBeUndefined();
  });

  it("a választ Anthropic-formára fordítja: eszközhívás, gondolatmenet, gyorsítótárazott tokenek", () => {
    const m = fromChatResponse(
      chat({ content: null, reasoning_content: "Gondolkodom", tool_calls: [{ id: "c1", type: "function", function: { name: "write_file", arguments: '{"path":"docs/x.md"}' } }, { id: "c2", type: "function", function: { name: "write_file", arguments: "{rossz" } }] }, "tool_calls"),
      "kimi:kimi-k2-thinking",
    );
    expect(m.model).toBe("kimi:kimi-k2-thinking");
    expect(m.stop_reason).toBe("tool_use");
    expect(m.content.map((b) => b.type)).toEqual(["thinking", "tool_use", "tool_use"]);
    expect((m.content[1] as any).input).toEqual({ path: "docs/x.md" });
    expect((m.content[2] as any).input).toEqual({ _hibas_json: "{rossz" });
    expect(m.usage).toMatchObject({ input_tokens: 400, cache_read_input_tokens: 600, output_tokens: 200 });
    // A Kimi a gyorsítótárazott tokeneket a usage tetején is adhatja.
    expect(fromChatResponse(chat({ content: "ok" }, "stop", { prompt_tokens: 100, completion_tokens: 5, cached_tokens: 40 }), "kimi:x").usage).toMatchObject({ input_tokens: 60, cache_read_input_tokens: 40 });
    expect(fromChatResponse(chat({ content: "félbe" }, "length"), "openai:x").stop_reason).toBe("max_tokens");
    expect(fromChatResponse(chat({ content: null, refusal: "Nem" }), "openai:x").stop_reason).toBe("refusal");
  });

  it("OpenAI-kérés: kulcs, max_completion_tokens, reasoning_effort, eszközök", async () => {
    const { f, calls } = fakeFetch([{ json: chat({ content: "Kész." }) }]);
    const c = new ChatCompletionsClient(PROVIDERS.openai, { OPENAI_API_KEY: "sk-teszt" }, f, 0);
    const res = await c.create(req("openai:gpt-5-mini"));
    expect(res.stop_reason).toBe("end_turn");
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]!.headers.Authorization).toBe("Bearer sk-teszt");
    const b = calls[0]!.body;
    expect(b.model).toBe("gpt-5-mini");
    expect(b.max_completion_tokens).toBe(16000);
    expect(b.max_tokens).toBeUndefined();
    expect(b.reasoning_effort).toBe("medium");
    expect(b.temperature).toBeUndefined();
    expect(b.tools[0]).toEqual({ type: "function", function: { name: "write_file", description: "Fájl írása", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } });
    expect(b.messages[0]).toEqual({ role: "system", content: "Rendszer" });
  });

  it("Kimi-kérés: saját végpont, max_tokens, nincs reasoning_effort", async () => {
    const { f, calls } = fakeFetch([{ json: chat({ content: "Kész." }) }]);
    await new ChatCompletionsClient(PROVIDERS.kimi, { MOONSHOT_API_KEY: "k" }, f, 0).create(req("kimi:kimi-k2-thinking"));
    expect(calls[0]!.url).toBe("https://api.moonshot.ai/v1/chat/completions");
    expect(calls[0]!.body.max_tokens).toBe(16000);
    expect(calls[0]!.body.reasoning_effort).toBeUndefined();
  });

  it("túlterhelésnél újrapróbál, hibás kérésnél nem", async () => {
    const ok = fakeFetch([{ status: 429, headers: { "retry-after": "0" } }, { status: 503 }, { json: chat({ content: "Kész." }) }]);
    await expect(new ChatCompletionsClient(PROVIDERS.openai, { OPENAI_API_KEY: "k" }, ok.f, 3, 1).create(req("openai:gpt-5-mini"))).resolves.toBeTruthy();
    expect(ok.calls).toHaveLength(3);
    const bad = fakeFetch([{ status: 400, json: { error: { message: "rossz paraméter" } } }]);
    await expect(new ChatCompletionsClient(PROVIDERS.openai, { OPENAI_API_KEY: "k" }, bad.f, 3).create(req("openai:gpt-5-mini"))).rejects.toThrow(/400.*rossz paraméter/);
    expect(bad.calls).toHaveLength(1);
    await expect(new ChatCompletionsClient(PROVIDERS.openai, {}, bad.f, 0).create(req("openai:gpt-5-mini"))).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("a vegyes kliens a modellnév szerint küldi tovább, az Anthropicnak előtag nélkül", async () => {
    const seen: [string, string][] = [];
    const fake = (p: string): ModelClient => ({ async create(r) { seen.push([p, r.model]); return fromChatResponse(chat({ content: "ok" }), r.model); } });
    const mc = new MultiClient({}, (p) => fake(p));
    await mc.create(req("claude-sonnet-5-5"));
    await mc.create(req("anthropic:claude-haiku-5-5"));
    await mc.create(req("openai:gpt-5-mini"));
    await mc.create(req("kimi:kimi-k2-thinking"));
    expect(seen).toEqual([["anthropic", "claude-sonnet-5-5"], ["anthropic", "claude-haiku-5-5"], ["openai", "openai:gpt-5-mini"], ["kimi", "kimi:kimi-k2-thinking"]]);
  });

  it("hiányzó kulcsnál nem dolgozik a cég, és megmondja, melyik kulcs hiányzik", () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: "a" }).dryRun).toBe(false);
    const c = loadConfig({ ANTHROPIC_API_KEY: "a", MODEL_WORKER: "openai:gpt-5-mini" });
    expect(c.dryRun).toBe(true);
    expect(c.missingKeys).toEqual(["OPENAI_API_KEY"]);
    const all = loadConfig({ OPENAI_API_KEY: "o", MOONSHOT_API_KEY: "m", MODEL_STRATEGIC: "openai:gpt-5", MODEL_LEAD: "openai:gpt-5", MODEL_WORKER: "kimi:kimi-k2-thinking", MODEL_BULK: "kimi:kimi-k2-turbo-preview" });
    // Csak OpenAI és Kimi: Anthropic-kulcs nélkül is dolgozhat, a levelek pedig az OpenAI-hoz mennek.
    expect(all.dryRun).toBe(false);
    expect(all.inboxModel).toBe("openai:gpt-5");
  });

  it("ügyféllevél alapból nem mehet a Kimihez", () => {
    const c = loadConfig({ ANTHROPIC_API_KEY: "a", MOONSHOT_API_KEY: "m", MODEL_BULK: "kimi:kimi-k2-turbo-preview", MODEL_WORKER: "kimi:kimi-k2-thinking" });
    expect(c.inboxModel).toBe("claude-haiku-5-5");
    expect(personalDataAllowed(c, "kimi:kimi-k2-thinking")).toBe(false);
    expect(personalDataAllowed(c, "claude-sonnet-5-5")).toBe(true);
    const explicit = loadConfig({ ANTHROPIC_API_KEY: "a", MOONSHOT_API_KEY: "m", MODEL_BULK: "kimi:kimi-k2-turbo-preview", PERSONAL_DATA_PROVIDERS: "anthropic, openai, kimi" });
    expect(explicit.inboxModel).toBe("kimi:kimi-k2-turbo-preview");
  });

  it("a levélfeldolgozás az engedélyezett modellt használja", async () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: "a", MOONSHOT_API_KEY: "m", MODEL_BULK: "kimi:kimi-k2-turbo-preview" }, tmp());
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
