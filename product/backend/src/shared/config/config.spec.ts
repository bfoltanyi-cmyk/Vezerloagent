import { loadConfig } from './config';

describe('loadConfig', () => {
  const base = { DATABASE_URL_FILE: '/run/secrets/database_url' };

  it('applies defaults', () => {
    const c = loadConfig({ ...base });
    expect(c).toEqual({
      appRole: 'api',
      port: 3000,
      databaseUrlFile: '/run/secrets/database_url',
      countryPack: 'hu',
      timezone: 'Europe/Budapest',
    });
  });

  it('accepts worker role', () => {
    expect(loadConfig({ ...base, APP_ROLE: 'worker' }).appRole).toBe('worker');
  });

  it('rejects unknown role', () => {
    expect(() => loadConfig({ ...base, APP_ROLE: 'admin' })).toThrow('Invalid APP_ROLE');
  });

  it('rejects invalid port', () => {
    expect(() => loadConfig({ ...base, PORT: '70000' })).toThrow('Invalid PORT');
  });

  it('requires database secret file path', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL_FILE is required');
  });
});
