import { describe, expect, it } from 'vitest';
import {
  createPostgrestAdminJwt,
  hasAdminPostgrestConfig,
  normalizeAdminApiBase,
  requireCompleteTournamentResultPublish,
} from '../../web/lib/admin-postgrest.ts';

describe('admin postgrest helpers', () => {
  it('normalizes own server API base to rest endpoint', () => {
    expect(normalizeAdminApiBase('https://sv-ugra.ru/api')).toBe('https://sv-ugra.ru/api/rest/v1');
    expect(normalizeAdminApiBase('https://sv-ugra.ru/api/rest/v1')).toBe('https://sv-ugra.ru/api/rest/v1');
  });

  it('creates an admin jwt for postgrest', () => {
    const token = createPostgrestAdminJwt('secret', 'authenticated');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(payload.role).toBe('authenticated');
    expect(payload.is_admin).toBe(true);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('detects config from server env variables', () => {
    process.env.APP_API_BASE = 'https://sv-ugra.ru/api';
    process.env.POSTGREST_JWT_SECRET = 'secret';
    expect(hasAdminPostgrestConfig()).toBe(true);
    delete process.env.APP_API_BASE;
    delete process.env.POSTGREST_JWT_SECRET;
  });

  it('accepts only an explicit successful and complete publish response', () => {
    expect(requireCompleteTournamentResultPublish({ ok: true, results_saved: 24 }, 24)).toBe(24);
    expect(() => requireCompleteTournamentResultPublish({ ok: false }, 24)).toThrow(/incomplete/i);
    expect(() => requireCompleteTournamentResultPublish({ ok: true }, 24)).toThrow(/incomplete/i);
    expect(() =>
      requireCompleteTournamentResultPublish({ ok: true, results_saved: 23 }, 24),
    ).toThrow(/incomplete/i);
  });
});
