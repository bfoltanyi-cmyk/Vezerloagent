/**
 * Generates the record of processing activities draft (GDPR Art. 30, requirement R6)
 * from field classifications. One row per module + purpose + data subject category.
 * The output contains metadata only, never personal data values.
 */
import {
  Art9Condition,
  DataSubjectCategory,
  EntityClassification,
  LegalBasis,
  RetentionCategory,
  validateEntityClassification,
} from './classification';

export interface ProcessingRegisterRow {
  module: string;
  purpose: string;
  dataSubject: DataSubjectCategory;
  legalBases: LegalBasis[];
  retentionCategories: RetentionCategory[];
  /** "<schema>.<table>.<field>" */
  fields: string[];
  containsSpecial: boolean;
  art9Conditions: Art9Condition[];
}

export function buildProcessingRegister(entities: readonly EntityClassification[]): ProcessingRegisterRow[] {
  const errors = entities.flatMap(validateEntityClassification);
  if (errors.length > 0) throw new Error(`Invalid classification: ${errors.join('; ')}`);

  const rows = new Map<string, ProcessingRegisterRow>();
  for (const e of entities) {
    for (const [field, f] of Object.entries(e.fields)) {
      const key = `${e.module}|${f.purpose}|${e.dataSubject}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          module: e.module,
          purpose: f.purpose,
          dataSubject: e.dataSubject,
          legalBases: [],
          retentionCategories: [],
          fields: [],
          containsSpecial: false,
          art9Conditions: [],
        };
        rows.set(key, row);
      }
      pushUnique(row.legalBases, ...f.legalBases);
      pushUnique(row.retentionCategories, f.retentionCategory);
      pushUnique(row.fields, `${e.table}.${field}`);
      if (f.sensitivity === 'special') row.containsSpecial = true;
      if (f.art9Condition) pushUnique(row.art9Conditions, f.art9Condition);
    }
  }
  const result = [...rows.values()];
  for (const r of result) {
    r.legalBases.sort();
    r.retentionCategories.sort();
    r.fields.sort();
    r.art9Conditions.sort();
  }
  return result.sort((a, b) =>
    `${a.module}|${a.purpose}|${a.dataSubject}`.localeCompare(`${b.module}|${b.purpose}|${b.dataSubject}`),
  );
}

function pushUnique<T>(target: T[], ...values: readonly T[]): void {
  for (const v of values) if (!target.includes(v)) target.push(v);
}
