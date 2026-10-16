// Több modellszolgáltató: Anthropic (alap), OpenAI és Moonshot Kimi. A modellt "szolgáltató:modell"
// alakban lehet megadni (pl. openai:gpt-6-sol, kimi:kimi-k2.6); előtag nélkül Anthropic.
// A motor az Anthropic üzenetformátumában gondolkodik; a többi szolgáltatóhoz oda-vissza fordítunk:
// - OpenAI: Responses API (a mostani GPT-6 modellek csak itt tudnak eszközt hívni gondolkodás mellett),
//   állapot nélkül (store: false), a titkosított gondolatmenetet minden körben visszaküldjük.
// - Kimi: OpenAI-kompatibilis Chat Completions; a gondolatmenetet (reasoning_content) vissza kell küldeni.

import type Anthropic from "@anthropic-ai/sdk";
import type { ProviderId } from "./catalog.js";
import { ClaudeClient, type Effort, type ModelClient, type ModelRequest } from "./llm.js";

export type { ProviderId };

export interface ProviderSpec {
  id: ProviderId;
  name: string;
  /** Az első megtalált környezeti változó a kulcs. */
  keyEnv: string[];
  baseUrlEnv?: string;
  baseUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  anthropic: { id: "anthropic", name: "Anthropic", keyEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] },
  openai: { id: "openai", name: "OpenAI", keyEnv: ["OPENAI_API_KEY"], baseUrlEnv: "OPENAI_BASE_URL", baseUrl: "https://api.openai.com/v1" },
  kimi: { id: "kimi", name: "Moonshot Kimi", keyEnv: ["MOONSHOT_API_KEY", "KIMI_API_KEY"], baseUrlEnv: "MOONSHOT_BASE_URL", baseUrl: "https://api.moonshot.ai/v1" },
};

const ALIASES: Record<string, ProviderId> = { anthropic: "anthropic", claude: "anthropic", openai: "openai", kimi: "kimi", moonshot: "kimi" };

/** "openai:gpt-6-sol" → { provider: "openai", model: "gpt-6-sol" }; előtag nélkül Anthropic. */
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

type Block = Record<string, unknown>;
const blocksOf = (m: Anthropic.Beta.BetaMessageParam): Block[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as unknown as Block[]));

/** Egy eszközeredmény szövege; a hibát a szövegbe írjuk, mert a többi szolgáltatónál nincs külön jelző. */
function toolResultText(b: Block): string {
  const c = b.content;
  const text =
    typeof c === "string"
      ? c
      : Array.isArray(c)
        ? c
            .filter((x) => x && typeof x === "object" && (x as Block).type === "text")
            .map((x) => String((x as Block).text ?? ""))
            .join("\n")
        : "";
  return b.is_error ? `HIBA: ${text}` : text || "(üres)";
}

/** Az eredeti szolgáltatói elem (pl. az OpenAI kimeneti eleme) a blokkon; a következő körben változatlanul küldjük vissza. */
const RAW = "_raw";

// ── HTTP: újrapróbálás túlterhelésnél, érthető hiba máskor ──

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HttpOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: Fetch;
  retries?: number;
  retryBaseMs?: number;
}

async function postJson(spec: ProviderSpec, path: string, body: unknown, o: HttpOptions): Promise<unknown> {
  const env = o.env ?? process.env;
  const key = providerKey(spec.id, env);
  if (!key) throw new Error(`Nincs beállítva a(z) ${spec.name} kulcsa (${spec.keyEnv.join(" vagy ")}).`);
  const base = ((spec.baseUrlEnv && env[spec.baseUrlEnv]) || spec.baseUrl!).replace(/\/+$/, "");
  const retries = o.retries ?? 3;
  const baseMs = o.retryBaseMs ?? 2000;
  let last = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    let r: Response;
    try {
      r = await (o.fetchImpl ?? fetch)(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(14 * 60_000),
      });
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (attempt < retries) await sleep(baseMs * 2 ** attempt);
      continue;
    }
    if (r.ok) return r.json();
    const text = await r.text().catch(() => "");
    let type = "";
    try {
      type = String((JSON.parse(text) as { error?: { type?: string; code?: string } }).error?.type ?? "");
    } catch {
      // Nem JSON (pl. 504-es HTML-oldal).
    }
    last = `${r.status} ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)}`;
    // Túlterhelés és szerverhiba ismételhető; a kimerült egyenleg (szintén 429) és a hibás kérés nem.
    const retryable = (r.status === 429 && !/quota|insufficient/i.test(type + text)) || r.status >= 500;
    if (!retryable || attempt === retries) break;
    const after = Number(r.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : baseMs * 2 ** attempt);
  }
  throw new Error(`${spec.name} hívás sikertelen: ${last}`);
}

// ── OpenAI: Responses API ──

/** Az Anthropic-formájú beszélgetés OpenAI Responses bemenetté alakítása. */
export function toResponsesInput(messages: Anthropic.Beta.BetaMessageParam[]): unknown[] {
  const items: unknown[] = [];
  for (const m of messages) {
    const sent = new Set<unknown>();
    const texts: string[] = [];
    const flushUser = () => {
      if (texts.length) items.push({ role: "user", content: texts.splice(0).join("\n\n") });
    };
    for (const b of blocksOf(m)) {
      if (m.role === "assistant") {
        const raw = b[RAW];
        if (raw) {
          if (!sent.has(raw)) items.push(raw);
          sent.add(raw);
        } else if (b.type === "redacted_thinking" && typeof b.data === "string") {
          try {
            items.push(JSON.parse(b.data));
          } catch {
            // Sérült gondolatmenet: kihagyjuk.
          }
        } else if (b.type === "text" && b.text) items.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: String(b.text) }] });
        else if (b.type === "tool_use") items.push({ type: "function_call", call_id: String(b.id), name: String(b.name), arguments: JSON.stringify(b.input ?? {}) });
      } else if (b.type === "tool_result") {
        flushUser();
        items.push({ type: "function_call_output", call_id: String(b.tool_use_id), output: toolResultText(b) });
      } else if (b.type === "text") texts.push(String(b.text ?? ""));
    }
    flushUser();
  }
  return items;
}

interface ResponsesOutputItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string; refusal?: string }[];
  [k: string]: unknown;
}
interface ResponsesResponse {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: ResponsesOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null };
}

function parseArgs(s: string | undefined): unknown {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    // Hibás vagy csonka JSON: az eszköz bemenet-ellenőrzése visszaszól a modellnek.
    return { _hibas_json: s };
  }
}

export function fromResponses(res: ResponsesResponse, modelSpec: string): Anthropic.Beta.BetaMessage {
  const content: Block[] = [];
  let refused = false;
  for (const item of res.output ?? []) {
    if (item.type === "reasoning") content.push({ type: "redacted_thinking", data: JSON.stringify(item) });
    else if (item.type === "message") {
      let first = true;
      for (const part of item.content ?? []) {
        if (part.type === "refusal") refused = true;
        if (part.type !== "output_text" && part.type !== "refusal") continue;
        const blk: Block = { type: "text", text: part.text ?? part.refusal ?? "", citations: null };
        if (first) Object.defineProperty(blk, RAW, { value: item, enumerable: false });
        first = false;
        content.push(blk);
      }
    } else if (item.type === "function_call") {
      const blk: Block = { type: "tool_use", id: item.call_id ?? item.id ?? "", name: item.name ?? "", input: parseArgs(item.arguments) };
      Object.defineProperty(blk, RAW, { value: item, enumerable: false });
      content.push(blk);
    }
  }
  const reason = res.incomplete_details?.reason;
  const stop = refused || reason === "content_filter" ? "refusal" : content.some((b) => b.type === "tool_use") ? "tool_use" : res.status === "incomplete" && reason === "max_output_tokens" ? "max_tokens" : "end_turn";
  const u = res.usage ?? {};
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const written = u.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    id: res.id ?? "",
    type: "message",
    role: "assistant",
    model: modelSpec,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(0, (u.input_tokens ?? 0) - cached - written),
      output_tokens: u.output_tokens ?? 0,
      cache_read_input_tokens: cached,
      // Az OpenAI a gyorsítótár-írást 1,25-szörös bemeneti áron számolja, mint az Anthropic.
      cache_creation_input_tokens: written,
    },
  } as unknown as Anthropic.Beta.BetaMessage;
}

export class OpenAIClient implements ModelClient {
  constructor(private readonly http: HttpOptions = {}) {}

  async create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    const { model } = parseModel(req.model);
    const body: Record<string, unknown> = {
      model,
      instructions: req.system,
      input: toResponsesInput(req.messages),
      // A gondolkodás is ebből a keretből fogy; az OpenAI legalább 25 ezret javasol.
      max_output_tokens: 32_000,
      reasoning: { effort: req.effort },
      // Nem tároltatjuk a beszélgetést az OpenAI-nál; a gondolatmenetet titkosítva kapjuk vissza.
      store: false,
      include: ["reasoning.encrypted_content"],
    };
    if (req.tools.length) {
      // A Responses API-ban az eszközök alapból szigorúak; a mi sémáink opcionális mezőket is tartalmaznak.
      body.tools = req.tools.map((t) => ({ type: "function", name: t.name, description: t.description ?? "", parameters: t.input_schema, strict: false }));
      body.tool_choice = "auto";
    }
    return fromResponses((await postJson(PROVIDERS.openai, "/responses", body, this.http)) as ResponsesResponse, `openai:${model}`);
  }
}

// ── Kimi: Chat Completions ──

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ChatToolCall[]; reasoning_content?: string }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export function toChatMessages(system: string, messages: Anthropic.Beta.BetaMessageParam[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  const toolNames = new Map<string, string>();
  for (const m of messages) {
    const blocks = blocksOf(m);
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n");
      const reasoning = blocks.filter((b) => b.type === "thinking").map((b) => String(b.thinking ?? "")).join("\n");
      const calls: ChatToolCall[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          toolNames.set(String(b.id), String(b.name));
          return { id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } };
        });
      // A Kimi nem fogad el null tartalmat; a gondolkodó modell eszközhívásánál a gondolatmenet kötelező.
      const msg: ChatMessage = { role: "assistant", content: text };
      if (calls.length) {
        msg.tool_calls = calls;
        msg.reasoning_content = reasoning;
      } else if (reasoning) msg.reasoning_content = reasoning;
      out.push(msg);
      continue;
    }
    // Felhasználói üzenet: előbb az eszközeredmények (közvetlenül a hívások után kell állniuk), aztán a szöveg.
    const texts: string[] = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const id = String(b.tool_use_id);
        out.push({ role: "tool", tool_call_id: id, ...(toolNames.has(id) ? { name: toolNames.get(id)! } : {}), content: toolResultText(b) });
      } else if (b.type === "text") texts.push(String(b.text ?? ""));
    }
    if (texts.length) out.push({ role: "user", content: texts.join("\n\n") });
  }
  return out;
}

interface ChatResponse {
  id?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: ChatToolCall[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null };
}

export function fromChatResponse(res: ChatResponse, modelSpec: string): Anthropic.Beta.BetaMessage {
  const choice = res.choices?.[0];
  if (!choice) throw new Error("A modell nem adott választ (üres choices).");
  const msg = choice.message ?? {};
  const content: Block[] = [];
  if (msg.reasoning_content) content.push({ type: "thinking", thinking: msg.reasoning_content, signature: "" });
  if (msg.content) content.push({ type: "text", text: msg.content, citations: null });
  for (const c of msg.tool_calls ?? []) content.push({ type: "tool_use", id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) });
  const stop = choice.finish_reason === "content_filter" ? "refusal" : (msg.tool_calls ?? []).length ? "tool_use" : choice.finish_reason === "length" ? "max_tokens" : "end_turn";
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
      // A Kimi gyorsítótár-írása a bemeneti áron megy (5 perces tár), ezért a bemenetben marad.
      input_tokens: Math.max(0, (u.prompt_tokens ?? 0) - cached),
      output_tokens: u.completion_tokens ?? 0,
      cache_read_input_tokens: cached,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Beta.BetaMessage;
}

/** A Kimi K3 gondolkodási szintjei: low, high, max (közepes nincs). */
const KIMI_EFFORT: Record<Effort, string> = { low: "low", medium: "high", high: "max" };

export class KimiClient implements ModelClient {
  constructor(private readonly http: HttpOptions = {}) {}

  async create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    const { model } = parseModel(req.model);
    // A mintavételi paraméterek modellenként rögzítettek (más értékre hibát ad), ezért nem küldjük őket.
    const body: Record<string, unknown> = {
      model,
      messages: toChatMessages(req.system, req.messages),
      // A gondolatmenet is ebből a keretből fogy; a Kimi legalább 16 ezret javasol.
      max_completion_tokens: 32_000,
    };
    // reasoning_effort csak a K3-nál létezik; a K2.x hibát adhat rá.
    if (/^kimi-k3/.test(model)) body.reasoning_effort = KIMI_EFFORT[req.effort];
    if (req.tools.length) {
      // A Kimi eszközei alapból szigorúak (saját sémaváltozat); a bemenetet úgyis mi ellenőrizzük.
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema, strict: false } }));
      body.tool_choice = "auto";
    }
    return fromChatResponse((await postJson(PROVIDERS.kimi, "/chat/completions", body, this.http)) as ChatResponse, `kimi:${model}`);
  }
}

/** A modellnév előtagja alapján a megfelelő szolgáltatóhoz küldi a kérést. */
export class MultiClient implements ModelClient {
  private readonly clients = new Map<ProviderId, ModelClient>();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly make?: (p: ProviderId) => ModelClient) {}

  private client(p: ProviderId): ModelClient {
    let c = this.clients.get(p);
    if (!c) {
      c = this.make?.(p) ?? (p === "anthropic" ? new ClaudeClient() : p === "openai" ? new OpenAIClient({ env: this.env }) : new KimiClient({ env: this.env }));
      this.clients.set(p, c);
    }
    return c;
  }

  create(req: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    const { provider, model } = parseModel(req.model);
    return provider === "anthropic" ? this.client(provider).create({ ...req, model }) : this.client(provider).create(req);
  }
}
