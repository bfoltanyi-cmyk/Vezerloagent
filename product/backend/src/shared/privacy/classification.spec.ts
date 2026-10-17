import { EntityClassification, validateEntityClassification } from './classification';
import { buildProcessingRegister } from './processing-register';

const partner: EntityClassification = {
  module: 'masterdata',
  recordType: 'partner',
  table: 'masterdata.partner',
  dataSubject: 'customer',
  fields: {
    name: { purpose: 'invoicing.issue', legalBases: ['contract', 'legal_obligation'], retentionCategory: 'szamla', sensitivity: 'pii', searchableAs: 'name' },
    tax_id: { purpose: 'invoicing.issue', legalBases: ['legal_obligation'], retentionCategory: 'szamla', sensitivity: 'pii', searchableAs: 'tax_id' },
    email: { purpose: 'invoicing.delivery', legalBases: ['contract'], retentionCategory: 'kapcsolat', sensitivity: 'pii', searchableAs: 'email' },
  },
};

const invoice: EntityClassification = {
  module: 'invoicing',
  recordType: 'invoice',
  table: 'invoicing.invoice',
  dataSubject: 'customer',
  fields: {
    partner_snapshot: { purpose: 'invoicing.issue', legalBases: ['legal_obligation'], retentionCategory: 'szamla', sensitivity: 'pii' },
  },
};

const sickLeave: EntityClassification = {
  module: 'hr',
  recordType: 'absence',
  table: 'hr.absence',
  dataSubject: 'employee',
  fields: {
    absence_type: {
      purpose: 'hr.payroll',
      legalBases: ['legal_obligation'],
      retentionCategory: 'hr_kulonleges',
      sensitivity: 'special',
      art9Condition: 'employment_social_security',
    },
  },
};

describe('validateEntityClassification', () => {
  it('accepts valid classifications', () => {
    expect(validateEntityClassification(partner)).toEqual([]);
    expect(validateEntityClassification(sickLeave)).toEqual([]);
  });

  it('rejects consent outside marketing', () => {
    const bad = { ...invoice, fields: { x: { ...invoice.fields.partner_snapshot, legalBases: ['consent' as const] } } };
    expect(validateEntityClassification(bad).join()).toContain('consent is only allowed for marketing');
  });

  it('accepts consent for marketing', () => {
    const ok: EntityClassification = {
      ...invoice,
      dataSubject: 'subscriber',
      fields: { email: { purpose: 'marketing.newsletter', legalBases: ['consent'], retentionCategory: 'hozzajarulas', sensitivity: 'pii' } },
    };
    expect(validateEntityClassification(ok)).toEqual([]);
  });

  it('requires Art. 9 condition for special data and forbids it otherwise', () => {
    const noCondition = { ...sickLeave, fields: { a: { ...sickLeave.fields.absence_type, art9Condition: undefined } } };
    expect(validateEntityClassification(noCondition).join()).toContain('Art. 9 condition');
    const wrong = { ...partner, fields: { a: { ...partner.fields.name, art9Condition: 'employment_social_security' as const } } };
    expect(validateEntityClassification(wrong).join()).toContain('non-special');
  });

  it('rejects empty legal basis, bad purpose, bad table and no fields', () => {
    const bad: EntityClassification = {
      ...partner,
      table: 'partner',
      fields: { a: { purpose: 'Invoicing', legalBases: [], retentionCategory: 'szamla', sensitivity: 'pii' } },
    };
    const errors = validateEntityClassification(bad);
    expect(errors).toHaveLength(3);
    expect(validateEntityClassification({ ...partner, fields: {} }).join()).toContain('no classified fields');
  });
});

describe('buildProcessingRegister', () => {
  it('groups by module, purpose and data subject, without values', () => {
    const rows = buildProcessingRegister([invoice, partner, sickLeave]);
    expect(rows.map((r) => `${r.module}|${r.purpose}`)).toEqual([
      'hr|hr.payroll',
      'invoicing|invoicing.issue',
      'masterdata|invoicing.delivery',
      'masterdata|invoicing.issue',
    ]);
    const md = rows[3];
    expect(md.legalBases).toEqual(['contract', 'legal_obligation']);
    expect(md.fields).toEqual(['masterdata.partner.name', 'masterdata.partner.tax_id']);
    expect(md.containsSpecial).toBe(false);
    expect(rows[0].containsSpecial).toBe(true);
    expect(rows[0].art9Conditions).toEqual(['employment_social_security']);
  });

  it('refuses invalid classifications', () => {
    expect(() => buildProcessingRegister([{ ...partner, fields: {} }])).toThrow('Invalid classification');
  });
});
