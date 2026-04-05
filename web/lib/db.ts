import { Pool } from 'pg';

import { resolvePgSsl } from './resolve-pg-ssl';

let pool: Pool | null = null;

export { resolvePgSsl };

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing DATABASE_URL env var');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: resolvePgSsl(connectionString),
    });
  }
  return pool;
}
