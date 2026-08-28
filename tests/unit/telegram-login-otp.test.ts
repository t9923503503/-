import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTelegramIntentHashSecret,
  hashTelegramConfirmationCode,
} from '../../web/lib/telegram-web-auth';

const getPoolMock = vi.fn();
const ensureTelegramAccountMock = vi.fn();
const createPlayerTokenMock = vi.fn(() => 'player-session-token');
const getPlayerTokenFromCookieHeaderMock = vi.fn(() => null);
const getRecentPlayerAuthTokenFromCookieHeaderMock = vi.fn(() => null);
const setPlayerCookieMock = vi.fn();
const verifyPlayerTokenMock = vi.fn(() => null);
const verifyRecentPlayerAuthTokenMock = vi.fn(() => null);

vi.mock('../../web/lib/db.ts', () => ({ getPool: getPoolMock }));
vi.mock('../../web/lib/telegram-registration.ts', () => ({
  ensureTelegramAccount: ensureTelegramAccountMock,
}));
vi.mock('../../web/lib/player-auth.ts', () => ({
  createPlayerToken: createPlayerTokenMock,
  getPlayerTokenFromCookieHeader: getPlayerTokenFromCookieHeaderMock,
  getRecentPlayerAuthTokenFromCookieHeader: getRecentPlayerAuthTokenFromCookieHeaderMock,
  setPlayerCookie: setPlayerCookieMock,
  verifyPlayerToken: verifyPlayerTokenMock,
  verifyRecentPlayerAuthToken: verifyRecentPlayerAuthTokenMock,
}));

const BROWSER_SECRET = 'browser_secret_abcdefghijklmnopqrstuvwxyz_12345';
const INTENT_TOKEN = 'intent_token_abcdefghijklmnopqrstuvwxyz';
const TELEGRAM_ID = '123456789';

function otpRequest(method: 'PATCH' | 'POST', body: object) {
  const request = new Request('https://lpvolley.ru/api/auth/telegram-login', {
    method,
    headers: {
      origin: 'https://lpvolley.ru',
      cookie: `telegram_login_intent=${BROWSER_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  Object.defineProperty(request, 'cookies', {
    value: {
      get(name: string) {
        return name === 'telegram_login_intent' ? { value: BROWSER_SECRET } : undefined;
      },
    },
  });
  Object.defineProperty(request, 'nextUrl', { value: new URL(request.url) });
  return request as never;
}

function clientWith(query: ReturnType<typeof vi.fn>) {
  return { query, release: vi.fn() };
}

function pendingIntent(attempts: number, code = '654321') {
  return {
    token: INTENT_TOKEN,
    confirmation_code_hash: hashTelegramConfirmationCode(INTENT_TOKEN, code),
    confirmation_attempts: attempts,
    pending_telegram_user_id: TELEGRAM_ID,
    pending_private_chat_id: TELEGRAM_ID,
    pending_display_name: 'Иван Telegram',
    pending_profile: { firstName: 'Иван' },
    confirmed_telegram_user_id: null,
  };
}

describe('browser-bound Telegram OTP route', () => {
  beforeEach(() => {
    process.env.TELEGRAM_INTENT_HASH_SECRET = 'unit-test-telegram-intent-secret';
    getPlayerTokenFromCookieHeaderMock.mockReturnValue(null);
    getRecentPlayerAuthTokenFromCookieHeaderMock.mockReturnValue(null);
    verifyPlayerTokenMock.mockReturnValue(null);
    verifyRecentPlayerAuthTokenMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('requires a dedicated OTP HMAC secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLAYER_SESSION_SECRET', 'must-not-be-reused-for-telegram-otp');
    vi.stubEnv('TELEGRAM_INTENT_HASH_SECRET', '');

    expect(() => getTelegramIntentHashSecret()).toThrow(
      'TELEGRAM_INTENT_HASH_SECRET env var is required in production'
    );
  });

  it('counts a wrong code without confirming or creating an account', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [pendingIntent(0)], rowCount: 1 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = clientWith(query);
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
    const { PATCH } = await import('../../web/app/api/auth/telegram-login/route');

    const response = await PATCH(otpRequest('PATCH', { code: '000000' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'wrong_code',
      attemptsRemaining: 4,
    });
    expect(query.mock.calls[2][0]).toContain('confirmation_attempts = $2');
    expect(query.mock.calls[2][1]).toEqual(expect.arrayContaining([1]));
    expect(ensureTelegramAccountMock).not.toHaveBeenCalled();
    expect(setPlayerCookieMock).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('closes the intent on the fifth wrong code', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [pendingIntent(4)], rowCount: 1 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = clientWith(query);
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
    const { PATCH } = await import('../../web/app/api/auth/telegram-login/route');

    const response = await PATCH(otpRequest('PATCH', { code: '000000' }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: 'locked', attemptsRemaining: 0 });
    expect(query.mock.calls[2][0]).toContain('CASE WHEN $2 >= 5 THEN now()');
    expect(response.headers.get('set-cookie')).toContain('telegram_login_intent=');
  });

  it('confirms the Telegram identity after the right code but does not create an account', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [pendingIntent(0)], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = clientWith(query);
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
    const { PATCH } = await import('../../web/app/api/auth/telegram-login/route');

    const response = await PATCH(otpRequest('PATCH', { code: '654321' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'confirmed',
      existingAccount: false,
    });
    expect(query.mock.calls[3][0]).toContain(
      'confirmed_telegram_user_id = pending_telegram_user_id'
    );
    expect(ensureTelegramAccountMock).not.toHaveBeenCalled();
    expect(setPlayerCookieMock).not.toHaveBeenCalled();
  });

  it('requires an explicit account decision before opening a transaction', async () => {
    const { POST } = await import('../../web/app/api/auth/telegram-login/route');

    const response = await POST(otpRequest('POST', {}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'decision_required' });
    expect(getPoolMock).not.toHaveBeenCalled();
    expect(ensureTelegramAccountMock).not.toHaveBeenCalled();
  });

  it('requires explicit privacy consent before opening a transaction', async () => {
    const { POST } = await import('../../web/app/api/auth/telegram-login/route');

    const response = await POST(otpRequest('POST', { action: 'continue' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'privacy_consent_required' });
    expect(getPoolMock).not.toHaveBeenCalled();
    expect(ensureTelegramAccountMock).not.toHaveBeenCalled();
  });

  it('creates an unknown Telegram account only after explicit continue', async () => {
    ensureTelegramAccountMock.mockResolvedValue({
      id: 23,
      fullName: 'Иван Telegram',
      playerId: null,
    });
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          confirmed_user_id: null,
          confirmed_telegram_user_id: TELEGRAM_ID,
          confirmed_private_chat_id: TELEGRAM_ID,
          confirmed_profile: { firstName: 'Иван' },
          return_to: '/cabinet',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: 23, email: null, full_name: 'Иван Telegram', telegram_user_id: TELEGRAM_ID }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ return_to: '/cabinet' }], rowCount: 1 })
      .mockResolvedValueOnce({});
    const client = clientWith(query);
    getPoolMock.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
    const { POST } = await import('../../web/app/api/auth/telegram-login/route');

    const response = await POST(otpRequest('POST', {
      action: 'continue',
      privacyConsent: true,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, returnTo: '/cabinet' });
    expect(ensureTelegramAccountMock).toHaveBeenCalledWith(
      client,
      TELEGRAM_ID,
      TELEGRAM_ID,
      expect.objectContaining({ firstName: 'Иван' })
    );
    expect(createPlayerTokenMock).toHaveBeenCalledWith(23, `telegram:${TELEGRAM_ID}`);
    expect(query.mock.calls[5][0]).toContain('privacy_consent_version');
    expect(query.mock.calls[5][1]).toEqual([23, '2026-08-05']);
    expect(setPlayerCookieMock).toHaveBeenCalledOnce();
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
});
