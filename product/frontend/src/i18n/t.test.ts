import { describe, expect, it } from 'vitest';
import { errorMessage, t } from './t';

describe('i18n', () => {
  it('translates known keys', () => {
    expect(t('auth.login')).toBe('Bejelentkezés');
  });
  it('returns the key for missing translations', () => {
    expect(t('missing.key')).toBe('missing.key');
  });
  it('maps API error codes and falls back to a generic message', () => {
    expect(errorMessage('INSUFFICIENT_STOCK')).toBe('Nincs elegendő készlet.');
    expect(errorMessage('SOMETHING_NEW')).toBe('Váratlan hiba történt.');
    expect(errorMessage(undefined)).toBe('Váratlan hiba történt.');
  });
});
