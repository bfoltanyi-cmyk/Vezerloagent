export type AppRole = 'api' | 'worker';

export interface AppConfig {
  appRole: AppRole;
  port: number;
  databaseUrlFile: string;
  countryPack: string;
  timezone: string;
}

/**
 * Reads and validates configuration from environment variables.
 * Secrets are never passed directly: only paths to secret files (Docker secrets, mode 0600).
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const appRole = (env.APP_ROLE ?? 'api') as AppRole;
  if (appRole !== 'api' && appRole !== 'worker') {
    throw new Error(`Invalid APP_ROLE: ${String(env.APP_ROLE)}`);
  }
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${String(env.PORT)}`);
  }
  const databaseUrlFile = env.DATABASE_URL_FILE ?? '';
  if (databaseUrlFile === '') {
    throw new Error('DATABASE_URL_FILE is required');
  }
  return {
    appRole,
    port,
    databaseUrlFile,
    countryPack: env.COUNTRY_PACK ?? 'hu',
    timezone: env.DISPLAY_TIMEZONE ?? 'Europe/Budapest',
  };
}
