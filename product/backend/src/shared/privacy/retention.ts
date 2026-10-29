/**
 * Retention profile model and lifecycle decision (requirement R3, ADR-0006).
 * Lifecycle after expiry: restrict -> grace period -> (approval) -> delete/anonymize.
 * A legal hold suspends the lifecycle at any point.
 */
import { RetentionCategory } from './classification';
import { addDaysUtc, addMonthsUtc, fiscalYearEndUtc } from './date-utc';

export type CountryCode = 'HU' | 'PL' | 'CZ';
export type RetentionAnchor =
  | 'document_date'
  | 'fiscal_year_end'
  | 'accounts_approved'
  | 'employment_end'
  | 'relationship_end';
export type RetentionAction = 'delete' | 'anonymize' | 'review';

export interface RetentionRule {
  category: RetentionCategory;
  durationMonths: number;
  anchor: RetentionAnchor;
  /** "next_year_start": counting starts on 1 January after the anchor (PL art. 74). */
  startOffset: 'none' | 'next_year_start';
  action: RetentionAction;
  manualApproval: boolean;
  /** Statutory minimum; customer overrides cannot go below it. 0 = no statutory minimum. */
  legalMinimumMonths: number;
}

export interface RetentionProfile {
  country: CountryCode;
  version: string;
  /** True while values are not confirmed by legal review. */
  draft: boolean;
  rules: readonly RetentionRule[];
}

export function ruleFor(profile: RetentionProfile, category: RetentionCategory): RetentionRule | undefined {
  return profile.rules.find((r) => r.category === category);
}

/** Customer may change the duration but never below the statutory minimum. */
export function applyCustomerOverride(rule: RetentionRule, overrideMonths?: number): RetentionRule {
  if (overrideMonths === undefined) return rule;
  if (!Number.isInteger(overrideMonths) || overrideMonths < 0) throw new Error('Invalid retention override');
  if (overrideMonths < rule.legalMinimumMonths) {
    throw new Error(`RETENTION_BELOW_LEGAL_MINIMUM: ${rule.category} requires >= ${rule.legalMinimumMonths} months`);
  }
  return { ...rule, durationMonths: overrideMonths };
}

export interface AnchorFacts {
  /** Date stored on the record (document date, relationship/employment end). */
  recordDate: Date | null;
  fiscalYearEndMonth: number;
  /** Approval date of the accounts for the fiscal year of the record, if known. */
  accountsApprovedAt?: Date | null;
}

/** Resolves the anchor instant; null means "not yet known" and the record is retained. */
export function resolveAnchor(anchor: RetentionAnchor, facts: AnchorFacts): Date | null {
  if (!facts.recordDate) return null;
  switch (anchor) {
    case 'document_date':
    case 'employment_end':
    case 'relationship_end':
      return facts.recordDate;
    case 'fiscal_year_end':
      return fiscalYearEndUtc(facts.recordDate, facts.fiscalYearEndMonth);
    case 'accounts_approved':
      return facts.accountsApprovedAt ?? null;
  }
}

export function computeExpiry(rule: RetentionRule, anchorDate: Date): Date {
  const start =
    rule.startOffset === 'next_year_start' ? new Date(Date.UTC(anchorDate.getUTCFullYear() + 1, 0, 1)) : anchorDate;
  return addMonthsUtc(start, rule.durationMonths);
}

export type RetentionDecision = 'retain' | 'on_hold' | 'restrict' | 'in_grace' | 'await_approval' | 'execute';

export interface RetentionState {
  rule: RetentionRule;
  anchorDate: Date | null;
  now: Date;
  legalHold: boolean;
  restrictedAt: Date | null;
  graceDays: number;
  approvedAt: Date | null;
}

export function decideRetention(s: RetentionState): RetentionDecision {
  if (s.legalHold) return 'on_hold';
  if (!s.anchorDate) return 'retain';
  if (s.now.getTime() < computeExpiry(s.rule, s.anchorDate).getTime()) return 'retain';
  if (!s.restrictedAt) return 'restrict';
  if (s.now.getTime() < addDaysUtc(s.restrictedAt, s.graceDays).getTime()) return 'in_grace';
  if ((s.rule.manualApproval || s.rule.action === 'review') && !s.approvedAt) return 'await_approval';
  return 'execute';
}
