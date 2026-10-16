import hu from './hu.json';

type Messages = Record<string, string>;
const catalogs: Record<string, Messages> = { hu };

/** Returns the localized message; falls back to the key itself so missing keys are visible. */
export function t(key: string, locale = 'hu'): string {
  return catalogs[locale]?.[key] ?? key;
}

/** Maps an RFC 9457 problem `code` from the API to a user message. */
export function errorMessage(code: string | undefined, locale = 'hu'): string {
  if (!code) return t('error.unknown', locale);
  const key = `error.${code}`;
  const msg = t(key, locale);
  return msg === key ? t('error.unknown', locale) : msg;
}
