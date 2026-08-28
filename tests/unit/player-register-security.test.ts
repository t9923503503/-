import { afterEach, describe, expect, it, vi } from 'vitest';

const getPoolMock = vi.fn();

vi.mock('../../web/lib/db.ts', () => ({ getPool: getPoolMock }));

function registerRequest(body: object, options?: { origin?: string; contentType?: string }): Request {
  const headers: Record<string, string> = {};
  if (options?.origin !== '') headers.origin = options?.origin || 'https://lpvolley.ru';
  if (options?.contentType !== '') {
    headers['content-type'] = options?.contentType || 'application/json';
  }
  return new Request('https://lpvolley.ru/api/auth/register', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('password registration request boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('rejects cross-origin requests before database access', async () => {
    const { POST } = await import('../../web/app/api/auth/register/route');

    const response = await POST(registerRequest({}, { origin: 'https://evil.example' }) as never);

    expect(response.status).toBe(403);
    expect(getPoolMock).not.toHaveBeenCalled();
  });

  it('requires explicit privacy consent before database access', async () => {
    const { POST } = await import('../../web/app/api/auth/register/route');

    const response = await POST(registerRequest({
      email: 'player@example.com',
      password: 'secret123',
      full_name: 'Test Player',
      consent: false,
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Политикой обработки персональных данных'),
    });
    expect(getPoolMock).not.toHaveBeenCalled();
  });
});
