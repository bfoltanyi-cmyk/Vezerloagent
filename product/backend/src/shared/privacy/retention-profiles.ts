/**
 * Draft default retention profiles. Values come from docs/security/privacy/requirements.md §4
 * and MUST be confirmed by legal review (privacy-hu/pl/cz, T-0007..T-0009) before release.
 * HR categories are intentionally missing until the country experts provide them.
 * Final location: the CountryPack retentionProfile (ADR-0004).
 */
import { RetentionProfile, RetentionRule } from './retention';

const contactRules: RetentionRule[] = [
  { category: 'kapcsolat', durationMonths: 12, anchor: 'relationship_end', startOffset: 'none', action: 'anonymize', manualApproval: false, legalMinimumMonths: 0 },
  { category: 'tamogatas', durationMonths: 12, anchor: 'relationship_end', startOffset: 'none', action: 'delete', manualApproval: false, legalMinimumMonths: 0 },
  { category: 'naplo', durationMonths: 12, anchor: 'document_date', startOffset: 'none', action: 'delete', manualApproval: false, legalMinimumMonths: 0 },
];

export const RETENTION_PROFILES: Readonly<Record<'HU' | 'PL' | 'CZ', RetentionProfile>> = {
  HU: {
    country: 'HU',
    version: '0.1.0',
    draft: true,
    rules: [
      // Sztv. 169. § – 8 years; anchor to be confirmed by privacy-hu.
      { category: 'szamla', durationMonths: 96, anchor: 'fiscal_year_end', startOffset: 'none', action: 'anonymize', manualApproval: true, legalMinimumMonths: 96 },
      { category: 'konyveles', durationMonths: 96, anchor: 'fiscal_year_end', startOffset: 'none', action: 'anonymize', manualApproval: true, legalMinimumMonths: 96 },
      ...contactRules,
    ],
  },
  PL: {
    country: 'PL',
    version: '0.1.0',
    draft: true,
    rules: [
      // UoR art. 74 – 5 years from the start of the year after accounts approval; manual approval (limitation may be interrupted).
      { category: 'szamla', durationMonths: 60, anchor: 'accounts_approved', startOffset: 'next_year_start', action: 'anonymize', manualApproval: true, legalMinimumMonths: 60 },
      { category: 'konyveles', durationMonths: 60, anchor: 'accounts_approved', startOffset: 'next_year_start', action: 'anonymize', manualApproval: true, legalMinimumMonths: 60 },
      ...contactRules,
    ],
  },
  CZ: {
    country: 'CZ',
    version: '0.1.0',
    draft: true,
    rules: [
      // DPH § 35 – 10 years for tax documents; accounting documents 5 years (§ 31).
      { category: 'szamla', durationMonths: 120, anchor: 'fiscal_year_end', startOffset: 'none', action: 'anonymize', manualApproval: true, legalMinimumMonths: 120 },
      { category: 'konyveles', durationMonths: 60, anchor: 'fiscal_year_end', startOffset: 'none', action: 'anonymize', manualApproval: true, legalMinimumMonths: 60 },
      ...contactRules,
    ],
  },
};
