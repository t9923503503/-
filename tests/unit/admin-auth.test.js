import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSessionResponse } from '../../web/lib/admin-auth.ts';

const ENV_KEYS = [
  'NODE_ENV',
  'ADMIN_PIN',
  'ADMIN_OPERATOR_PIN',
  'ADMIN_VIEWER_PIN',
  'ADMIN_ALLOW_LEGACY_PIN',
  'ADMIN_CREDENTIALS_JSON',
  'ADMIN_SESSION_SECRET',
];

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  ENV_KEYS.forEach((key) => {
    const value = originalEnv[key];
    if (value == null) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
}

async function readJson(response) {
  return response.json();
}

describe('createAdminSessionResponse', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_SESSION_SECRET = 'test-secret';
    delete process.env.ADMIN_CREDENTIALS_JSON;
    delete process.env.ADMIN_PIN;
    delete process.env.ADMIN_OPERATOR_PIN;
    delete process.env.ADMIN_VIEWER_PIN;
    delete process.env.ADMIN_ALLOW_LEGACY_PIN;
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('rejects the old hardcoded 7319 pin when no env credentials are configured', async () => {
    const response = createAdminSessionResponse({ pin: '7319' });

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: 'Invalid credentials' });
  });

  it('accepts an explicit legacy ADMIN_PIN during the grace window and warns about it', async () => {
    process.env.ADMIN_ALLOW_LEGACY_PIN = 'true';
    process.env.ADMIN_PIN = '7890';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = createAdminSessionResponse({ pin: '7890' });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      actor: { id: 'legacy-admin', role: 'admin' },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[admin-auth] Legacy PIN mode is active. Please switch to ADMIN_CREDENTIALS_JSON or explicit env PINs.'
    );
  });
});
