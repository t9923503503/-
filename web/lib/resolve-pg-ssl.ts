const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Decide SSL options for node-pg from connection string and env (no pg import).
 */
export function resolvePgSsl(connectionString: string) {
  const explicit = String(
    process.env.DATABASE_SSL ?? process.env.PGSSLMODE ?? '',
  ).trim().toLowerCase();
  if (['0', 'false', 'off', 'disable', 'disabled'].includes(explicit)) {
    return false;
  }
  if (explicit) {
    return { rejectUnauthorized: false };
  }

  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get('sslmode')?.trim().toLowerCase();
    if (sslMode && ['disable', 'allow', 'prefer'].includes(sslMode)) {
      return false;
    }
    return LOCAL_DB_HOSTS.has(parsed.hostname) ? false : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}
