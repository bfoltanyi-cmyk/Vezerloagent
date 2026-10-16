import { addMonthsUtc, fiscalYearEndUtc } from './date-utc';
import { applyCustomerOverride, computeExpiry, decideRetention, resolveAnchor, RetentionRule, ruleFor } from './retention';
import { RETENTION_PROFILES } from './retention-profiles';

const d = (iso: string) => new Date(iso);
const huInvoice = ruleFor(RETENTION_PROFILES.HU, 'szamla') as RetentionRule;
const plInvoice = ruleFor(RETENTION_PROFILES.PL, 'szamla') as RetentionRule;
const contact = ruleFor(RETENTION_PROFILES.HU, 'kapcsolat') as RetentionRule;

describe('date helpers', () => {
  it('adds months with month-end clamping, including leap years', () => {
    expect(addMonthsUtc(d('2024-02-29T00:00:00Z'), 12).toISOString()).toBe('2025-02-28T00:00:00.000Z');
    expect(addMonthsUtc(d('2026-08-31T00:00:00Z'), 1).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('finds the fiscal year end', () => {
    expect(fiscalYearEndUtc(d('2024-03-15T00:00:00Z'), 12).toISOString()).toBe('2024-12-31T00:00:00.000Z');
    expect(fiscalYearEndUtc(d('2024-08-10T00:00:00Z'), 6).toISOString()).toBe('2025-06-30T00:00:00.000Z');
    expect(() => fiscalYearEndUtc(d('2024-08-10T00:00:00Z'), 13)).toThrow();
  });
});

describe('expiry', () => {
  it('HU invoice: 8 years from fiscal year end', () => {
    const anchor = resolveAnchor('fiscal_year_end', { recordDate: d('2024-03-15T00:00:00Z'), fiscalYearEndMonth: 12 });
    expect(computeExpiry(huInvoice, anchor as Date).toISOString()).toBe('2032-12-31T00:00:00.000Z');
  });

  it('PL invoice: 5 years from 1 January after accounts approval', () => {
    const anchor = resolveAnchor('accounts_approved', {
      recordDate: d('2024-03-15T00:00:00Z'),
      fiscalYearEndMonth: 12,
      accountsApprovedAt: d('2025-06-20T00:00:00Z'),
    });
    expect(computeExpiry(plInvoice, anchor as Date).toISOString()).toBe('2031-01-01T00:00:00.000Z');
  });

  it('unknown anchor means retain', () => {
    expect(resolveAnchor('accounts_approved', { recordDate: d('2024-03-15T00:00:00Z'), fiscalYearEndMonth: 12 })).toBeNull();
    expect(resolveAnchor('relationship_end', { recordDate: null, fiscalYearEndMonth: 12 })).toBeNull();
  });
});

describe('applyCustomerOverride', () => {
  it('allows extending but not going below the legal minimum', () => {
    expect(applyCustomerOverride(huInvoice, 120).durationMonths).toBe(120);
    expect(() => applyCustomerOverride(huInvoice, 60)).toThrow('RETENTION_BELOW_LEGAL_MINIMUM');
    expect(applyCustomerOverride(contact, 6).durationMonths).toBe(6);
    expect(applyCustomerOverride(contact).durationMonths).toBe(12);
    expect(() => applyCustomerOverride(contact, 1.5)).toThrow();
  });
});

describe('decideRetention', () => {
  const base = {
    rule: huInvoice,
    anchorDate: d('2024-12-31T00:00:00Z'), // expires 2032-12-31
    now: d('2030-01-01T00:00:00Z'),
    legalHold: false,
    restrictedAt: null as Date | null,
    graceDays: 30,
    approvedAt: null as Date | null,
  };

  it('walks the lifecycle: retain -> restrict -> grace -> approval -> execute', () => {
    expect(decideRetention(base)).toBe('retain');
    expect(decideRetention({ ...base, now: d('2033-01-15T00:00:00Z') })).toBe('restrict');
    const restricted = { ...base, restrictedAt: d('2033-01-10T00:00:00Z') };
    expect(decideRetention({ ...restricted, now: d('2033-01-15T00:00:00Z') })).toBe('in_grace');
    expect(decideRetention({ ...restricted, now: d('2033-03-01T00:00:00Z') })).toBe('await_approval');
    expect(decideRetention({ ...restricted, now: d('2033-03-01T00:00:00Z'), approvedAt: d('2033-02-20T00:00:00Z') })).toBe('execute');
  });

  it('legal hold suspends everything', () => {
    expect(decideRetention({ ...base, now: d('2040-01-01T00:00:00Z'), restrictedAt: d('2033-01-10T00:00:00Z'), legalHold: true })).toBe('on_hold');
  });

  it('no anchor (ongoing relationship) means retain', () => {
    expect(decideRetention({ ...base, anchorDate: null, now: d('2040-01-01T00:00:00Z') })).toBe('retain');
  });

  it('rules without manual approval execute after grace; review always needs approval', () => {
    const s = { ...base, rule: contact, anchorDate: d('2025-01-01T00:00:00Z'), restrictedAt: d('2026-01-02T00:00:00Z'), now: d('2026-03-01T00:00:00Z') };
    expect(decideRetention(s)).toBe('execute');
    expect(decideRetention({ ...s, rule: { ...contact, action: 'review' } })).toBe('await_approval');
  });
});

describe('default profiles', () => {
  it.each(['HU', 'PL', 'CZ'] as const)('%s profile is consistent and marked draft', (country) => {
    const p = RETENTION_PROFILES[country];
    expect(p.draft).toBe(true);
    const categories = p.rules.map((r) => r.category);
    expect(new Set(categories).size).toBe(categories.length);
    for (const r of p.rules) expect(r.durationMonths).toBeGreaterThanOrEqual(r.legalMinimumMonths);
    expect(ruleFor(p, 'szamla')?.manualApproval).toBe(true);
  });

  it('CZ keeps invoices 10 years', () => {
    expect(ruleFor(RETENTION_PROFILES.CZ, 'szamla')?.durationMonths).toBe(120);
  });
});
