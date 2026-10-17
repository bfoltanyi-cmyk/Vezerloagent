import { MODEL_CATALOG } from "./catalog.js";
import { parseModel } from "./providers.js";
import type { CompanyState, LedgerEntry } from "./types.js";

/** USD / millió token, a modellkatalógusból. Gyorsítótár-írás az input ár 1,25-szöröse. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = Object.fromEntries(
  MODEL_CATALOG.map((m) => [m.spec, { input: m.input, output: m.output, cacheRead: m.cacheRead }]),
);
// Ismeretlen modellnél óvatosan a legdrágább árral számolunk.
const FALLBACK_PRICE = { input: 10, output: 50, cacheRead: 1 };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

type Price = { input: number; output: number; cacheRead: number };

/** Egységes név: Anthropicnál előtag nélkül, máshol a szolgáltató saját nevével (moonshot:x → kimi:x). */
function canon(m: string): string {
  try {
    const { provider, model } = parseModel(m.trim());
    return provider === "anthropic" ? model : `${provider}:${model}`;
  } catch {
    return m.trim();
  }
}

/** Saját árak a MODEL_PRICES változóból (JSON: {"openai:gpt-5-mini": {"input": 0.25, "output": 2, "cacheRead": 0.025}}). */
function overrides(): Record<string, Price> {
  try {
    const v = JSON.parse(process.env.MODEL_PRICES || "{}") as Record<string, Partial<Price>>;
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, p]) => p && Number.isFinite(p.input) && Number.isFinite(p.output))
        .map(([k, p]) => [canon(k), { input: p.input!, output: p.output!, cacheRead: Number.isFinite(p.cacheRead) ? p.cacheRead! : p.input! }]),
    );
  } catch {
    return {};
  }
}

let registered: Record<string, Price> = {};
/** A Beállítások fülön megadott árak (a GitHub-változóban megadottaknál erősebbek). */
export function registerPrices(prices: Record<string, { input: number; output: number; cacheRead?: number }>): void {
  registered = Object.fromEntries(Object.entries(prices).map(([k, p]) => [canon(k), { input: p.input, output: p.output, cacheRead: p.cacheRead ?? p.input }]));
}

export function priceOf(model: string): Price {
  const own = { ...overrides(), ...registered };
  const c = canon(model);
  // A szolgáltató előtagja nélkül is keresünk (pl. "openai:gpt-5-mini" → "gpt-5-mini").
  const bare = c.includes(":") ? c.slice(c.indexOf(":") + 1) : c;
  return own[c] ?? own[bare] ?? PRICES[c] ?? PRICES[bare] ?? FALLBACK_PRICE;
}

export function costUsd(model: string, u: Usage): number {
  const p = priceOf(model);
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.output) / 1_000_000;
}

export function record(s: CompanyState, role: string, model: string, u: Usage, now = new Date()): LedgerEntry {
  const e: LedgerEntry = {
    at: now.toISOString(),
    role,
    model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    usd: costUsd(model, u),
  };
  s.ledger.push(e);
  return e;
}

export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

export function spentThisMonth(s: CompanyState, now = new Date()): number {
  const m = monthKey(now);
  return s.ledger.filter((e) => e.at.startsWith(m)).reduce((a, e) => a + e.usd, 0);
}

export function spentSince(s: CompanyState, sinceIso: string): number {
  return s.ledger.filter((e) => e.at >= sinceIso).reduce((a, e) => a + e.usd, 0);
}

/** Kompakt főkönyv: a hónapnál régebbi tételeket szerepenként összevonja, hogy az állapotfájl ne nőjön végtelenre. */
export function compactLedger(s: CompanyState, now = new Date()): void {
  const m = monthKey(now);
  const old = s.ledger.filter((e) => !e.at.startsWith(m));
  if (old.length === 0) return;
  const merged = new Map<string, LedgerEntry>();
  for (const e of old) {
    const key = `${e.at.slice(0, 7)}|${e.role}|${e.model}|${e.arena ? "arena" : ""}`;
    const cur = merged.get(key);
    if (!cur) merged.set(key, { ...e, at: `${e.at.slice(0, 7)}-01T00:00:00.000Z`, ...(e.arena ? { arena: "havi" } : {}) });
    else {
      cur.inputTokens += e.inputTokens;
      cur.outputTokens += e.outputTokens;
      cur.cacheReadTokens += e.cacheReadTokens;
      cur.cacheWriteTokens += e.cacheWriteTokens;
      cur.usd += e.usd;
    }
  }
  s.ledger = [...merged.values(), ...s.ledger.filter((e) => e.at.startsWith(m))];
}

/** A belső versenyre (kihívók és bírók) ebben a hónapban elköltött összeg. */
export function arenaSpentThisMonth(s: CompanyState, now = new Date()): number {
  const m = monthKey(now);
  return s.ledger.filter((e) => e.arena && e.at.startsWith(m)).reduce((a, e) => a + e.usd, 0);
}
