// Több modellszolgáltató: Anthropic (alap), OpenAI és Moonshot Kimi. A modellt "szolgáltató:modell"
// alakban lehet megadni (pl. openai:gpt-5-mini, kimi:kimi-k2-thinking); előtag nélkül Anthropic.
// A motor továbbra is az Anthropic üzenetformátumában gondolkodik; a többi szolgáltatót
// az OpenAI-kompatibilis Chat Completions felületen érjük el, és oda-vissza fordítunk.

import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeClient, type ModelClient, type ModelRequest } from "./llm.js";

export type ProviderId = "anthropic" | "openai" | "kimi";

export interface ProviderSpec {
  id: ProviderId;
  name: string;
  /** Az első megtalált környezeti változó a kulcs. */
  keyEnv: string[];
  baseUrlEnv?: string;
  baseUrl?: string;
  /** Melyik mezőben várja a válasz hosszkorlátját. */
  tokenParam?: "max_tokens" | "max_completion_tokens";
  /** A gondolkodó modell gondolatmenetét a következő körben vissza kell küldeni (reasoning_content). */
  echoReasoning?: boolean;
  /** Erre a modellre küldhető reasoning_effort. */
  effortFor?: (model: string) => boolean;
  /** Ajánlott mintavételi hőmérséklet, ha a szolgáltató alapértéke nem jó agentmunkára. */
  temperatureFor?: (model: string) => number | undefined;
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  anthropic: { id: "anthropic", name: "Anthropic", keyEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] },
  openai: {
    id: "openai",
    name: "OpenAI",
    keyEnv: ["OPENAI_API_KEY"],
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrl: "https://api.openai.com/v1",
    tokenParam: "max_completion_tokens",
    effortFor: (m) => /^(gpt-5|o\d)/.test(m),
  },
  kimi: {
    id: "kimi",
    name: "Moonshot Kimi",
    keyEnv: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    baseUrlEnv: "MOONSHOT_BASE_URL",
    baseUrl: "https://api.moonshot.ai/v1",
    tokenParam: "max_tokens",
    echoReasoning: true,
    temperatureFor: (m) => (/thinking/.test(m) ? 1.0 : 0.6),
  },
};

const ALIASES: Record<string, ProviderId> = { anthropic: "anthropic", claude: "anthropic", openai: "openai", kimi: "kimi", moonshot: "kimi" };

/** "openai:gpt-5-mini" → { provider: "openai", model: "gpt-5-mini" }; előtag nélkül Anthropic. */
export function parseModel(spec: string): { provider: ProviderId; model: string } {
  const i = spec.indexOf(":");
  if (i <= 0) return { provider: "anthropic", model: spec };
  const p = ALIASES[spec.slice(0, i).trim().toLowerCase()];
  if (!p) throw new Error(`Ismeretlen modellszolgáltató: ${spec.slice(0, i)} (lehet: anthropic, openai, kimi)`);
  return { provider: p, model: spec.slice(i + 1).trim() };
}

export const providerOf = (spec: string): ProviderId => parseModel(spec).provider;

export function providerKey(p: ProviderId, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const k of PROVIDERS[p].keyEnv) if (env[k]) return env[k];
  return undefined;
}

// ── Fordítás az Anthropic-formátum és a Chat Completions között ──

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[]; reasoning_content?: string }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const blockText = (c: unknown): string => {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .map((b) => (b && typeof b === "object" && (b as { type?: string }).type === "text" ? String((b as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
};

export function toChatMessages(system: string, messages: Anthropic.Beta.BetaMessageParam[], spec: ProviderSpec): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content });
      continue;
    }
    const blocks = m.content as unknown as Array<Record<string, unknown>>;
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n");
      const reasoning = blocks.filter((b) => b.type === "thinking").map((b) => String(b.thinking ?? "")).join("\n");
      const calls: ChatToolCall[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      const msg: ChatMessage = { role: "assistant", content: text || null };
      if (calls.length) msg.tool_calls = calls;
      if (spec.echoReasoning && reasoning) msg.reasoning_content = reasoning;
      // Kimi gondolkodó modelljénél a tool hívást tartalmazó üzenetből nem hiányozhat a gondolatmenet mező.
      else if (spec.echoReasoning && calls.length) msg.reasoning_content = "";
      out.push(msg);
      continue;
    }
    // Felhasználói üzenet: előbb az eszközeredmények (közvetlenül a hívások után kell állniuk), aztán a szöveg.
    const texts: string[] = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const body = blockText(b.content);
        out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: b.is_error ? `HIBA: ${body}` : body || "(üres)" });
      } else if (b.type === "text") texts.push(String(b.text ?? ""));
    }
    if (texts.length) out.push({ role: "user", content: texts.join("\n\n") });
  }
  return out;
}

export function toChatTools(tools: Anthropic.Beta.BetaTool[]) {
  return tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
}

interface ChatResponse {
  id?: string;
  model?: string;
  choices: { finish_reason?: string | null; message: { content?: string | null; reasoning_content?: string | null; tool_calls?: ChatToolCall[] | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } | null };
}

export function fromChatResponse(res: ChatResponse, modelSpec: string): Anthropic.Beta.BetaMessage {
  const choice = res.choices?.[0];
  if (!choice) throw new Error("A modell nem adott választ (üres choices).");
  const msg = choice.message ?? {};
  const content: Record<string, unknown>[] = [];
  if (msg.reasoning_content) content.push({ type: "thinking", thinking: msg.reasoning_content, signature: "" });
  if (msg.content) content.push({ type: "text", text: msg.content, citations: null });
  for (const c of msg.tool_calls ?? []) {
    let input: unknown;
    try {
      input = c.function.arguments ? JSON.parse(c.function.arguments) : {};
    } catch {
      // Hibás JSON: az eszköz bemenet-ellenőrzése visszaszól a modellnek, és újrapróbálhatja.
      input = { _hibas_json: c.function.arguments };
    }
    content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
  }
  const hasCalls = (msg.tool_calls ?? []).length > 0;
  const stop =
    msg.refusal || choice.finish_reason === "content_filter"
      ? "refusal"
      : hasCalls
        ? "tool_use"
        : choice.finish_reason === "length"
          ? "max_tokens"
          : "end_turn";
  const u = res.usage ?? {};
  const cached = u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens ?? 0;
  return {
    id: res.id ?? "",
    type: "message",
    role: "assistant",
    model: modelSpec,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(0, (u.prompt_tokens ?? 0) - cached),
      output_tokens: u.completion_tokens ?? 0,
      cache_read_input_tokens: cached,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Beta.BetaMessage;
}

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OpenAI-kompatibilis Chat Completions kliens (OpenAI, Kimi). */
export class ChatCompletionsClient implements ModelClient {
  constructor(
    private readonly spec: ProviderSpec,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: Fetch = fetch,
    private readonly retries = 3,
    private readonly retryBaseMs = 2000,
  ) {}

  async create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    const { model } = parseModel(req.model);
    const key = providerKey(this.spec.id, this.env);
    if (!key) throw new Error(`Nincs beállítva a(z) ${this.spec.name} kulcsa (${this.spec.keyEnv.join(" vagy ")}).`);
    const base = (this.spec.baseUrlEnv && this.env[this.spec.baseUrlEnv]) || this.spec.baseUrl!;
    const body: Record<string, unknown> = {
      model,
      messages: toChatMessages(req.system, req.messages, this.spec),
      [this.spec.tokenParam ?? "max_tokens"]: 16000,
    };
    if (req.tools.length) {
      body.tools = toChatTools(req.tools);
      body.tool_choice = "auto";
    }
    if (this.spec.effortFor?.(model)) body.reasoning_effort = req.effort;
    const temp = this.spec.temperatureFor?.(model);
    if (temp !== undefined) body.temperature = temp;

    let last = "";
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      let r: Response;
      try {
        r = await this.fetchImpl(`${base.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10 * 60_000),
        });
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
        if (attempt < this.retries) await sleep(this.retryBaseMs * 2 ** attempt);
        continue;
      }
      if (r.ok) return fromChatResponse((await r.json()) as ChatResponse, `${this.spec.id}:${model}`);
      last = `${r.status} ${(await r.text().catch(() => "")).slice(0, 500)}`;
      // Csak a túlterhelés és a szerverhiba ismételhető; a hibás kérés vagy rossz kulcs nem lesz jobb.
      if (!(r.status === 429 || r.status >= 500) || attempt === this.retries) break;
      const after = Number(r.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : this.retryBaseMs * 2 ** attempt);
    }
    throw new Error(`${this.spec.name} hívás sikertelen: ${last}`);
  }
}

/** A modellnév előtagja alapján a megfelelő szolgáltatóhoz küldi a kérést. */
export class MultiClient implements ModelClient {
  private readonly clients = new Map<ProviderId, ModelClient>();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly make?: (p: ProviderId) => ModelClient) {}

  private client(p: ProviderId): ModelClient {
    let c = this.clients.get(p);
    if (!c) {
      c = this.make?.(p) ?? (p === "anthropic" ? new ClaudeClient() : new ChatCompletionsClient(PROVIDERS[p], this.env));
      this.clients.set(p, c);
    }
    return c;
  }

  create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    const { provider, model } = parseModel(req.model);
    return provider === "anthropic" ? this.client(provider).create({ ...req, model }) : this.client(provider).create(req);
  }
}
