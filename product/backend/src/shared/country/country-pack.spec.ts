import { CountryPack, CountryPackRegistry } from './country-pack';

const fakeHu: CountryPack = {
  code: 'hu',
  currency: 'HUF',
  locale: 'hu-HU',
  timezone: 'Europe/Budapest',
  validateTaxId: (id) => ({ valid: /^\d{8}-\d-\d{2}$/.test(id) }),
  retentionProfile: 'hu-default',
  cashRoundingStepMinor: 500n,
};

describe('CountryPackRegistry', () => {
  it('returns a registered pack', () => {
    const r = new CountryPackRegistry();
    r.register(fakeHu);
    expect(r.get('hu').currency).toBe('HUF');
    expect(r.get('hu').validateTaxId('12345678-2-41').valid).toBe(true);
  });

  it('rejects duplicate registration', () => {
    const r = new CountryPackRegistry();
    r.register(fakeHu);
    expect(() => r.register(fakeHu)).toThrow('already registered');
  });

  it('fails clearly for an unavailable pack', () => {
    expect(() => new CountryPackRegistry().get('pl')).toThrow('not available: pl');
  });
});
