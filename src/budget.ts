import type { CompanyState, LedgerEntry } from "./types.js";

/** USD / millió token. Gyorsítótár-írás az input ár 1,25-szöröse. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
// Ismeretlen modellnél óvatosan a legdrágább árral számolunk.
const FALLBACK_PRICE = { input: 10, output: 50, cacheRead: 1 };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
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
    const key = `${e.at.slice(0, 7)}|${e.role}|${e.model}`;
    const cur = merged.get(key);
    if (!cur) merged.set(key, { ...e, at: `${e.at.slice(0, 7)}-01T00:00:00.000Z` });
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
