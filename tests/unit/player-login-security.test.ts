import { afterEach, describe, expect, it, vi } from 'vitest';

const getPoolMock = vi.fn();

vi.mock('../../web/lib/db.ts', () => ({ getPool: getPoolMock }));
vi.mock('../../web/lib/player-auth.ts', () => ({
  createPlayerToken: vi.fn(),
  createRecentPlayerAuthToken: vi.fn(),
  setPlayerCookie: vi.fn(),
  setRecentPlayerAuthCookie: vi.fn(),
}));

function loginRequest(options?: {
  origin?: string;
  contentType?: string;
  body?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (options?.origin !== '') headers.origin = options?.origin || 'https://lpvolley.ru';
  if (options?.contentType !== '') {
    headers['content-type'] = options?.contentType || 'application/json';
  }
  return new Request('https://lpvolley.ru/api/auth/login', {
    method: 'POST',
    headers,
    body: options?.body ?? JSON.stringify({ email: 'player@example.com', password: 'secret' }),
  });
}

describe('password login request boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('rejects cross-origin and missing-origin login CSRF before database access', async () => {
    const { POST } = await import('../../web/app/api/auth/login/route');

    const crossOrigin = await POST(loginRequest({ origin: 'https://evil.example' }));
    const missingOrigin = await POST(loginRequest({ origin: '' }));

    expect(crossOrigin.status).toBe(403);
    expect(missingOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toMatchObject({ code: 'origin' });
    expect(crossOrigin.headers.get('cache-control')).toBe('no-store');
    expect(getPoolMock).not.toHaveBeenCalled();
  });

  it('rejects a simple form content type before parsing attacker-controlled JSON', async () => {
    const { POST } = await import('../../web/app/api/auth/login/route');

    const response = await POST(loginRequest({ contentType: 'text/plain' }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ code: 'content_type' });
    expect(getPoolMock).not.toHaveBeenCalled();
  });

  it('allows same-origin JSON through the request boundary', async () => {
    const { POST } = await import('../../web/app/api/auth/login/route');

    const response = await POST(loginRequest({ body: '{bad json' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Некорректный запрос' });
    expect(getPoolMock).not.toHaveBeenCalled();
  });
});
