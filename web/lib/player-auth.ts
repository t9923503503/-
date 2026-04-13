import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const PLAYER_COOKIE = 'player_session';

function getSecret(): string {
  const s = process.env.PLAYER_SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('PLAYER_SESSION_SECRET env var is required in production');
  }
  return s || 'lyutye-voleybolisty-surguta-2026';
}

export function createPlayerToken(id: number, email: string): string {
  const payload = JSON.stringify({
    id,
    email,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

export function verifyPlayerToken(token: string): { id: number; email: string } | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expected = crypto
      .createHmac('sha256', getSecret())
      .update(payload)
      .digest('hex');
    if (sig !== expected) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return { id: data.id, email: data.email };
  } catch {
    return null;
  }
}

export function getPlayerTokenFromCookieHeader(cookieHeader: string): string | null {
  const match = cookieHeader.match(new RegExp(`${PLAYER_COOKIE}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function setPlayerCookie(
  response: NextResponse,
  token: string,
  opts?: { persistent?: boolean }
): void {
  const cookieOptions: {
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    maxAge?: number;
  } = {
    domain: '.lpvolley.ru',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  };

  if (opts?.persistent !== false) {
    cookieOptions.maxAge = 60 * 60 * 24 * 7;
  }

  response.cookies.set(PLAYER_COOKIE, token, cookieOptions);
}

export function clearPlayerCookie(response: NextResponse): void {
  response.cookies.set(PLAYER_COOKIE, '', {
    domain: '.lpvolley.ru',
    path: '/',
    maxAge: 0,
  });
}
