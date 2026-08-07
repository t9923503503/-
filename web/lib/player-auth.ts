import { NextResponse } from 'next/server';
import crypto from 'crypto';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LEGACY_PLAYER_COOKIE = 'player_session';
const LEGACY_RECENT_AUTH_COOKIE = 'player_recent_auth';

export const PLAYER_COOKIE = IS_PRODUCTION
  ? '__Host-lpvolley_player_session'
  : LEGACY_PLAYER_COOKIE;
export const PLAYER_RECENT_AUTH_COOKIE = IS_PRODUCTION
  ? '__Host-lpvolley_recent_auth'
  : LEGACY_RECENT_AUTH_COOKIE;

const RECENT_AUTH_TTL_SECONDS = 10 * 60;

function getSecret(): string {
  const secret = process.env.PLAYER_SESSION_SECRET;
  if (!secret && IS_PRODUCTION) {
    throw new Error('PLAYER_SESSION_SECRET env var is required in production');
  }
  return secret || 'lyutye-voleybolisty-surguta-2026';
}

function signature(payload: string, audience: string, legacy = false): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(legacy ? payload : `${audience}\n${payload}`)
    .digest('hex');
}

function safeSignatureEqual(received: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(received) || !/^[0-9a-f]{64}$/.test(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

function encodeSignedPayload(payload: object, audience: string): string {
  const serialized = JSON.stringify(payload);
  return `${Buffer.from(serialized).toString('base64')}.${signature(serialized, audience)}`;
}

function parseSignedToken(token: string): {
  data: Record<string, unknown>;
  payload: string;
  sig: string;
} | null {
  try {
    const [payloadB64, sig, extra] = token.split('.');
    if (!payloadB64 || !sig || extra) return null;
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const data = JSON.parse(payload) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { data: data as Record<string, unknown>, payload, sig };
  } catch {
    return null;
  }
}

export function createPlayerToken(id: number, email: string): string {
  return encodeSignedPayload({
    id,
    email,
    aud: 'player-session',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }, 'player-session');
}

export function createRecentPlayerAuthToken(id: number): string {
  return encodeSignedPayload({
    id,
    aud: 'recent-player-auth',
    exp: Date.now() + RECENT_AUTH_TTL_SECONDS * 1000,
  }, 'recent-player-auth');
}

export function verifyPlayerToken(token: string): { id: number; email: string } | null {
  const parsed = parseSignedToken(token);
  if (!parsed) return null;
  const { data, payload, sig } = parsed;
  const isLegacy = data.aud == null;
  if (
    data.purpose != null
    || (!isLegacy && data.aud !== 'player-session')
    || typeof data.id !== 'number'
    || !Number.isInteger(data.id)
    || data.id <= 0
    || typeof data.email !== 'string'
    || !data.email.trim()
    || typeof data.exp !== 'number'
    || !Number.isFinite(data.exp)
    || data.exp < Date.now()
  ) return null;
  const expected = signature(payload, 'player-session', isLegacy);
  if (!safeSignatureEqual(sig, expected)) return null;
  return { id: data.id, email: data.email };
}

export function verifyRecentPlayerAuthToken(token: string): { id: number } | null {
  const parsed = parseSignedToken(token);
  if (!parsed) return null;
  const { data, payload, sig } = parsed;
  if (
    data.aud !== 'recent-player-auth'
    || typeof data.id !== 'number'
    || !Number.isInteger(data.id)
    || data.id <= 0
    || typeof data.exp !== 'number'
    || !Number.isFinite(data.exp)
    || data.exp < Date.now()
  ) return null;
  const expected = signature(payload, 'recent-player-auth');
  if (!safeSignatureEqual(sig, expected)) return null;
  return { id: data.id };
}

function cookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function getPlayerTokenFromCookieHeader(cookieHeader: string): string | null {
  return cookieValue(cookieHeader, PLAYER_COOKIE);
}

export function getRecentPlayerAuthTokenFromCookieHeader(cookieHeader: string): string | null {
  return cookieValue(cookieHeader, PLAYER_RECENT_AUTH_COOKIE);
}

function clearLegacyPlayerCookies(response: NextResponse): void {
  if (!IS_PRODUCTION) return;
  response.cookies.set(LEGACY_PLAYER_COOKIE, '', {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });
  response.cookies.set(LEGACY_RECENT_AUTH_COOKIE, '', {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
  });
  response.headers.append(
    'Set-Cookie',
    `${LEGACY_PLAYER_COOKIE}=; Path=/; Domain=.lpvolley.ru; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
  );
  response.headers.append(
    'Set-Cookie',
    `${LEGACY_RECENT_AUTH_COOKIE}=; Path=/; Domain=.lpvolley.ru; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`
  );
}

export function setPlayerCookie(
  response: NextResponse,
  token: string,
  opts?: { persistent?: boolean }
): void {
  const cookieOptions: {
    path: '/';
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    maxAge?: number;
  } = {
    path: '/',
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
  };
  if (opts?.persistent !== false) cookieOptions.maxAge = 60 * 60 * 24 * 7;

  clearLegacyPlayerCookies(response);
  response.cookies.set(PLAYER_COOKIE, token, cookieOptions);
  clearLegacyPlayerCookies(response);
}

export function setRecentPlayerAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(PLAYER_RECENT_AUTH_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict',
    maxAge: RECENT_AUTH_TTL_SECONDS,
  });
  clearLegacyPlayerCookies(response);
}

export function clearPlayerCookie(response: NextResponse): void {
  response.cookies.set(PLAYER_COOKIE, '', {
    path: '/',
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });
  response.cookies.set(PLAYER_RECENT_AUTH_COOKIE, '', {
    path: '/',
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
  });
  clearLegacyPlayerCookies(response);
}
