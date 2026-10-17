/**
 * Field-level personal data classification (privacy requirement R1).
 * Every module declares its personal data fields with this metadata;
 * the processing register (R6) and data subject search (R2) are built from it.
 */

export const LEGAL_BASES = ['contract', 'legal_obligation', 'legitimate_interest', 'consent'] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];

/** GDPR Art. 9(2) conditions supported by the product. */
export const ART9_CONDITIONS = ['employment_social_security'] as const;
export type Art9Condition = (typeof ART9_CONDITIONS)[number];

export const RETENTION_CATEGORIES = [
  'szamla',
  'konyveles',
  'szerzodes',
  'ber',
  'hr_torzs',
  'hr_kulonleges',
  'kapcsolat',
  'tamogatas',
  'naplo',
  'fiok',
  'jelenlet',
  'hozzajarulas',
] as const;
export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

export type Sensitivity = 'pii' | 'special';

export const DATA_SUBJECT_CATEGORIES = ['customer', 'supplier', 'contact_person', 'employee', 'user', 'subscriber'] as const;
export type DataSubjectCategory = (typeof DATA_SUBJECT_CATEGORIES)[number];

/** Identifier kinds a data subject request can search by. */
export const PERSON_IDENTIFIER_KINDS = ['name', 'email', 'tax_id', 'national_id', 'partner_id', 'user_id', 'phone'] as const;
export type PersonIdentifierKind = (typeof PERSON_IDENTIFIER_KINDS)[number];

export interface FieldClassification {
  /** Purpose key, e.g. "invoicing.issue". Consent is only allowed for "marketing.*". */
  purpose: string;
  legalBases: readonly LegalBasis[];
  retentionCategory: RetentionCategory;
  sensitivity: Sensitivity;
  /** Mandatory when sensitivity is "special". */
  art9Condition?: Art9Condition;
  /** If set, the field can be used to find the data subject. */
  searchableAs?: PersonIdentifierKind;
}

export interface EntityClassification {
  module: string;
  /** Stable record type used in DSR results, e.g. "invoice". */
  recordType: string;
  /** Fully qualified table, "<schema>.<table>". */
  table: string;
  dataSubject: DataSubjectCategory;
  fields: Readonly<Record<string, FieldClassification>>;
}

const PURPOSE_RE = /^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/;
const TABLE_RE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

/** Returns a list of validation errors; empty list means valid. Used at startup and in CI. */
export function validateEntityClassification(e: EntityClassification): string[] {
  const errors: string[] = [];
  const where = `${e.module}/${e.recordType}`;
  if (!TABLE_RE.test(e.table)) errors.push(`${where}: table must be "<schema>.<table>"`);
  const names = Object.keys(e.fields);
  if (names.length === 0) errors.push(`${where}: no classified fields`);
  for (const name of names) {
    const f = e.fields[name];
    const at = `${where}.${name}`;
    if (!PURPOSE_RE.test(f.purpose)) errors.push(`${at}: invalid purpose key`);
    if (f.legalBases.length === 0) errors.push(`${at}: at least one legal basis required`);
    if (new Set(f.legalBases).size !== f.legalBases.length) errors.push(`${at}: duplicate legal basis`);
    if (f.legalBases.includes('consent') && !f.purpose.startsWith('marketing.')) {
      errors.push(`${at}: consent is only allowed for marketing purposes`);
    }
    if (f.sensitivity === 'special' && !f.art9Condition) errors.push(`${at}: special data needs an Art. 9 condition`);
    if (f.sensitivity !== 'special' && f.art9Condition) errors.push(`${at}: Art. 9 condition set on non-special field`);
  }
  return errors;
}
