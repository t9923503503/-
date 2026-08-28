import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminSessionResponse } from '../../web/lib/admin-auth';

function configureProductionAdmin(overrides: Record<string, string> = {}): void {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-session-secret-with-enough-entropy');
  vi.stubEnv('ADMIN_CREDENTIALS_JSON', '');
  vi.stubEnv('ADMIN_PIN', '');
  vi.stubEnv('ADMIN_OPERATOR_PIN', '');
  vi.stubEnv('ADMIN_VIEWER_PIN', '');
  vi.stubEnv('ADMIN_ALLOW_LEGACY_PIN', '');
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

describe('admin auth production fallback security', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects the built-in development PIN in production', () => {
    configureProductionAdmin({ ADMIN_ALLOW_LEGACY_PIN: 'true' });

    const response = createAdminSessionResponse({ pin: '7319' });

    expect(response.status).toBe(401);
  });

  it('keeps an explicitly configured production PIN working without a hidden fallback', async () => {
    configureProductionAdmin({
      ADMIN_PIN: '864275',
    });

    const response = createAdminSessionResponse({ pin: '864275' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      actor: { id: 'legacy-admin', role: 'admin' },
    });
  });

  it('limits named admin sessions to twelve hours', async () => {
    configureProductionAdmin({
      ADMIN_CREDENTIALS_JSON: JSON.stringify([
        { id: 'owner', pin: 'strong-test-password', role: 'admin' },
      ]),
    });

    const response = createAdminSessionResponse({
      id: 'owner',
      pin: 'strong-test-password',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=43200');
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      actor: { id: 'owner', role: 'admin' },
    });
  });
});
