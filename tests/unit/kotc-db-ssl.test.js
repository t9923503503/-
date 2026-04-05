import { afterEach, describe, expect, it } from 'vitest';

import { resolvePgSsl } from '../../web/lib/resolve-pg-ssl.ts';

const originalDatabaseSsl = process.env.DATABASE_SSL;
const originalPgSslMode = process.env.PGSSLMODE;

function restoreEnv() {
  if (originalDatabaseSsl === undefined) delete process.env.DATABASE_SSL;
  else process.env.DATABASE_SSL = originalDatabaseSsl;

  if (originalPgSslMode === undefined) delete process.env.PGSSLMODE;
  else process.env.PGSSLMODE = originalPgSslMode;
}

describe('Postgres SSL resolution', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('disables ssl for localhost by default', () => {
    expect(resolvePgSsl('postgresql://user:pass@localhost:5432/app')).toBe(false);
    expect(resolvePgSsl('postgresql://user:pass@127.0.0.1:5432/app')).toBe(false);
  });

  it('keeps ssl for remote hosts by default', () => {
    expect(resolvePgSsl('postgresql://user:pass@db.example.com:5432/app')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('honors explicit disable flags', () => {
    process.env.PGSSLMODE = 'disable';
    expect(resolvePgSsl('postgresql://user:pass@db.example.com:5432/app')).toBe(false);
  });

  it('honors sslmode query params that disable negotiation', () => {
    expect(resolvePgSsl('postgresql://user:pass@db.example.com:5432/app?sslmode=disable')).toBe(
      false,
    );
    expect(resolvePgSsl('postgresql://user:pass@db.example.com:5432/app?sslmode=prefer')).toBe(
      false,
    );
  });
});
