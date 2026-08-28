import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPoolMock = vi.fn();
const getPlayerTokenFromCookieHeaderMock = vi.fn();
const getRecentPlayerAuthTokenFromCookieHeaderMock = vi.fn();
const verifyPlayerTokenMock = vi.fn();
const verifyRecentPlayerAuthTokenMock = vi.fn();

vi.mock('../../web/lib/db.ts', () => ({
  getPool: getPoolMock,
}));

vi.mock('../../web/lib/player-auth.ts', () => ({
  getPlayerTokenFromCookieHeader: getPlayerTokenFromCookieHeaderMock,
  getRecentPlayerAuthTokenFromCookieHeader: getRecentPlayerAuthTokenFromCookieHeaderMock,
  verifyPlayerToken: verifyPlayerTokenMock,
  verifyRecentPlayerAuthToken: verifyRecentPlayerAuthTokenMock,
}));

function request(method: string, options?: { origin?: string; recent?: boolean }): Request {
  const recent = options?.recent !== false;
  return new Request('https://lpvolley.ru/api/auth/telegram-link', {
    method,
    headers: {
      cookie: `player_session=test-session${recent ? '; player_recent_auth=recent-session' : ''}`,
      ...(options?.origin === '' ? {} : { origin: options?.origin || 'https://lpvolley.ru' }),
    },
  });
}

function authenticatedAs(userId = 17): void {
  getPlayerTokenFromCookieHeaderMock.mockReturnValue('test-session');
  verifyPlayerTokenMock.mockReturnValue({ id: userId, email: 'player@example.com' });
  getRecentPlayerAuthTokenFromCookieHeaderMock.mockReturnValue('recent-session');
  verifyRecentPlayerAuthTokenMock.mockReturnValue({ id: userId });
}

describe('Telegram identity link security', () => {
  beforeEach(() => {
    authenticatedAs();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('reports linkage from the immutable Telegram user id and protects a Telegram-only account', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        telegram_user_id: '123456789',
        telegram_private_chat_id: null,
        telegram_chat_id: null,
        email: null,
        password_hash: null,
      }],
    });
    getPoolMock.mockReturnValue({ query });
    const { GET } = await import('../../web/app/api/auth/telegram-link/route');

    const response = await GET(request('GET') as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      linked: true,
      canUnlink: false,
      authMethod: 'telegram',
    });
  });

  it('refuses to remove Telegram when it is the last login method', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          telegram_user_id: '123456789',
          telegram_private_chat_id: '123456789',
          telegram_chat_id: '123456789',
          email: null,
          password_hash: null,
        }],
      })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue({ query, release }) });
    const { DELETE } = await import('../../web/app/api/auth/telegram-link/route');

    const response = await DELETE(request('DELETE') as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'last_login_method' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toBe('ROLLBACK');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE users'))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it('clears every Telegram identity and revokes outstanding links when password login remains', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          telegram_user_id: '123456789',
          telegram_private_chat_id: '123456789',
          telegram_chat_id: '123456789',
          email: 'player@example.com',
          password_hash: 'bcrypt-hash',
        }],
      })
      .mockResolvedValue({});
    const release = vi.fn();
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue({ query, release }) });
    const { DELETE } = await import('../../web/app/api/auth/telegram-link/route');

    const response = await DELETE(request('DELETE') as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('telegram_user_id = NULL');
    expect(sql).toContain('telegram_private_chat_id = NULL');
    expect(sql).toContain('telegram_chat_id = NULL');
    expect(sql).toContain('UPDATE telegram_link_tokens');
    expect(sql).toContain('UPDATE telegram_web_login_tokens');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('revokes older unused link tokens before issuing a new one', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 17,
          email: 'player@example.com',
          password_hash: 'bcrypt-hash',
          telegram_user_id: null,
        }],
      })
      .mockResolvedValue({});
    const release = vi.fn();
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue({ query, release }) });
    const { POST } = await import('../../web/app/api/auth/telegram-link/route');

    const response = await POST(request('POST') as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toMatch(/^https:\/\/t\.me\/Lpvolley_bot\?start=[0-9a-f]{48}$/);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('SELECT id, email, password_hash, telegram_user_id');
    expect(sql).toContain('UPDATE telegram_link_tokens');
    expect(sql).toContain('used_at = COALESCE(used_at, now())');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects cross-origin link and unlink mutations before touching the database', async () => {
    getPoolMock.mockReturnValue({ connect: vi.fn() });
    const { POST, DELETE } = await import('../../web/app/api/auth/telegram-link/route');

    const postResponse = await POST(request('POST', { origin: 'https://evil.example' }) as never);
    const deleteResponse = await DELETE(request('DELETE', { origin: '' }) as never);

    expect(postResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(getPoolMock).not.toHaveBeenCalled();
  });

  it('requires a fresh password login before issuing a legacy link token', async () => {
    verifyRecentPlayerAuthTokenMock.mockReturnValue(null);
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 17,
          email: 'player@example.com',
          password_hash: 'bcrypt-hash',
          telegram_user_id: null,
        }],
      })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue({ query, release }) });
    const { POST } = await import('../../web/app/api/auth/telegram-link/route');

    const response = await POST(request('POST', { recent: false }) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'recent_auth_required' });
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO telegram_link_tokens'))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps the legacy direct chat-id mutation endpoint disabled', async () => {
    const { POST } = await import('../../web/app/api/auth/telegram/route');

    const response = await POST();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: 'telegram_direct_link_disabled',
    });
    expect(getPoolMock).not.toHaveBeenCalled();
  });
});
