import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthPublicOrigin, normalizeAuthReturnTo } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import {
  getTelegramIntentHashSecret,
  hashTelegramBrowserSecret,
  isTelegramWebAuthAvailable,
  LEGACY_TELEGRAM_INTENT_COOKIE,
  TELEGRAM_BROWSER_SECRET_RE,
  TELEGRAM_INTENT_COOKIE,
} from '@/lib/telegram-web-auth';

export const dynamic = 'force-dynamic';

const INTENT_TTL_MINUTES = 10;
const INTENT_LIMIT_PER_TEN_MINUTES = 30;

function botUsername(): string {
  const value = String(process.env.TELEGRAM_BOT_USERNAME || 'Lpvolley_bot')
    .trim()
    .replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(value) ? value : 'Lpvolley_bot';
}

function loginPage(req: NextRequest, error: string, returnTo: string): NextResponse {
  const url = new URL('/login', getAuthPublicOrigin(req.nextUrl.origin));
  url.searchParams.set('error', error);
  url.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(url);
}

function requestFingerprint(req: NextRequest): string {
  // The trusted ingress must replace the incoming X-Forwarded-For with the
  // directly connected client address. Read the last value defensively and
  // never trust CF/X-Real-IP or the first client-supplied XFF value.
  const forwarded = String(req.headers.get('x-forwarded-for') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const address = String(forwarded.at(-1) || 'unknown').slice(0, 128);
  const secret = getTelegramIntentHashSecret();
  return crypto.createHmac('sha256', secret).update(address).digest('hex');
}

function telegramDeepLink(req: NextRequest, username: string, token: string): string {
  const userAgent = String(req.headers.get('user-agent') || '').toLowerCase();
  const isMobileTelegramClient = /android|iphone|ipad|ipod/.test(userAgent);
  if (isMobileTelegramClient) {
    const params = new URLSearchParams({ domain: username, start: `login_${token}` });
    return `tg://resolve?${params.toString()}`;
  }
  const deepLink = new URL(`https://t.me/${username}`);
  deepLink.searchParams.set('start', `login_${token}`);
  return deepLink.toString();
}

export async function GET(req: NextRequest) {
  const returnTo = normalizeAuthReturnTo(req.nextUrl.searchParams.get('returnTo'));
  if (!isTelegramWebAuthAvailable()) {
    return loginPage(req, 'telegram_beta_closed', returnTo);
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const browserSecret = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INTENT_TTL_MINUTES * 60 * 1000);
  let fingerprint = '';
  const previousSecret = String(req.cookies.get(TELEGRAM_INTENT_COOKIE)?.value || '');
  let client: PoolClient | null = null;

  try {
    fingerprint = requestFingerprint(req);
    client = await getPool().connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [fingerprint]);
    await client.query(
      `DELETE FROM telegram_web_auth_intents
        WHERE expires_at < now()`
    );
    const recent = await client.query(
      `SELECT count(*)::int AS count
         FROM telegram_web_auth_intents
        WHERE request_fingerprint = $1
          AND created_at > now() - interval '10 minutes'`,
      [fingerprint]
    );
    if (Number(recent.rows[0]?.count || 0) >= INTENT_LIMIT_PER_TEN_MINUTES) {
      await client.query('ROLLBACK');
      return loginPage(req, 'telegram_rate_limited', returnTo);
    }
    if (TELEGRAM_BROWSER_SECRET_RE.test(previousSecret)) {
      await client.query(
        `UPDATE telegram_web_auth_intents
            SET used_at = COALESCE(used_at, now())
          WHERE browser_secret_hash = $1 AND used_at IS NULL`,
        [hashTelegramBrowserSecret(previousSecret)]
      );
    }
    await client.query(
      `INSERT INTO telegram_web_auth_intents (
         token, return_to, request_fingerprint, browser_secret_hash, expires_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        token,
        returnTo,
        fingerprint,
        hashTelegramBrowserSecret(browserSecret),
        expiresAt,
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    console.error('[api/auth/telegram-start]', error);
    return loginPage(req, 'telegram_unavailable', returnTo);
  } finally {
    client?.release();
  }

  const response = NextResponse.redirect(telegramDeepLink(req, botUsername(), token));
  response.cookies.set(TELEGRAM_INTENT_COOKIE, browserSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: INTENT_TTL_MINUTES * 60,
  });
  if (TELEGRAM_INTENT_COOKIE !== LEGACY_TELEGRAM_INTENT_COOKIE) {
    response.cookies.set(LEGACY_TELEGRAM_INTENT_COOKIE, '', {
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
