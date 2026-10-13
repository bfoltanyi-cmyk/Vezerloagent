import { describe, expect, it } from "vitest";
import { emptyState } from "../src/board.js";
import { compactLedger, costUsd, record, spentThisMonth } from "../src/budget.js";

describe("költségkeret", () => {
  it("modellenként számol", () => {
    expect(costUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(4);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(10);
    expect(costUsd("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.01);
    expect(costUsd("ismeretlen", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(10);
  });

  it("a havi költést tartja nyilván és a régieket összevonja", () => {
    const s = emptyState();
    record(s, "ceo", "claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }, new Date("2026-09-30T10:00:00Z"));
    record(s, "ceo", "claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }, new Date("2026-09-30T11:00:00Z"));
    record(s, "ceo", "claude-opus-5-5", { input_tokens: 500_000, output_tokens: 0 }, new Date("2026-10-01T10:00:00Z"));
    const now = new Date("2026-10-13T00:00:00Z");
    expect(spentThisMonth(s, now)).toBeCloseTo(2);
    compactLedger(s, now);
    expect(s.ledger).toHaveLength(2);
    expect(s.ledger[0]!.usd).toBeCloseTo(8);
  });
});
