import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthPublicOrigin, normalizeAuthReturnTo } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy';
import {
  getPlayerTokenFromCookieHeader,
  getRecentPlayerAuthTokenFromCookieHeader,
  verifyPlayerToken,
  verifyRecentPlayerAuthToken,
} from '@/lib/player-auth';
import {
  buildVkAuthorizeUrl,
  getVkIdConfig,
  hashVkValue,
  isVkIdAvailable,
  randomVkSecret,
  VK_INTENT_COOKIE,
  vkCodeChallenge,
} from '@/lib/vk-id';

export const dynamic = 'force-dynamic';

function noStoreJson(body: object, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function trustedOrigin(req: NextRequest): boolean {
  try {
    return new URL(String(req.headers.get('origin') || '')).origin
      === getAuthPublicOrigin(req.nextUrl.origin);
  } catch {
    return false;
  }
}

function requestFingerprint(req: NextRequest): string {
  const forwarded = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers.get('x-real-ip') || '').trim();
  const agent = String(req.headers.get('user-agent') || '').slice(0, 300);
  return crypto.createHash('sha256').update(`${ip}\n${agent}`).digest('hex');
}

export async function POST(req: NextRequest) {
  if (!isVkIdAvailable()) {
    return noStoreJson({ error: 'VK ID пока не настроен', code: 'unavailable' }, 503);
  }
  if (!trustedOrigin(req)) {
    return noStoreJson({ error: 'Forbidden', code: 'origin' }, 403);
  }
  if (!String(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return noStoreJson({ error: 'Ожидается JSON', code: 'content_type' }, 415);
  }
  const body = await req.json().catch(() => ({})) as {
    mode?: unknown;
    privacyConsent?: unknown;
    returnTo?: unknown;
  };
  const currentToken = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  const currentUser = currentToken ? verifyPlayerToken(currentToken) : null;
  const linkMode = body.mode === 'link';
  if (!linkMode && currentUser) {
    return noStoreJson({
      error: 'Вы уже вошли в аккаунт. Выйдите из него перед новым входом через VK ID.',
      code: 'already_authenticated',
    }, 409);
  }
  if (linkMode && !currentUser) {
    return noStoreJson({ error: 'Сначала войдите в аккаунт', code: 'authentication_required' }, 401);
  }
  if (linkMode && currentUser) {
    const recentToken = getRecentPlayerAuthTokenFromCookieHeader(req.headers.get('cookie') || '');
    const recent = recentToken ? verifyRecentPlayerAuthToken(recentToken) : null;
    if (recent?.id !== currentUser.id) {
      return noStoreJson({
        error: 'Для подключения VK выйдите и заново войдите по email и паролю',
        code: 'recent_auth_required',
      }, 401);
    }
  }
  if (body.privacyConsent !== true) {
    return noStoreJson({
      error: 'Подтвердите согласие с Политикой обработки персональных данных',
      code: 'privacy_consent_required',
    }, 400);
  }

  try {
    const config = getVkIdConfig(req.nextUrl.origin);
    const state = randomVkSecret();
    const verifier = randomVkSecret();
    const fingerprint = requestFingerprint(req);
    const pool = getPool();
    if (linkMode && currentUser) {
      const account = await pool.query(
        'SELECT vk_user_id FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );
      if (!account.rowCount) {
        return noStoreJson({ error: 'Аккаунт не найден', code: 'account_not_found' }, 404);
      }
      if (String(account.rows[0].vk_user_id || '').trim()) {
        return noStoreJson({ error: 'VK ID уже подключён', code: 'already_linked' }, 409);
      }
    }
    const limited = await pool.query(
      `SELECT count(*)::int AS attempts
         FROM vk_auth_intents
        WHERE request_fingerprint = $1
          AND created_at > now() - interval '15 minutes'`,
      [fingerprint]
    );
    if (Number(limited.rows[0]?.attempts || 0) >= 10) {
      return noStoreJson({
        error: 'Слишком много попыток входа. Подождите несколько минут.',
        code: 'rate_limited',
      }, 429);
    }

    await pool.query(
      `INSERT INTO vk_auth_intents (
         state_hash, browser_secret_hash, return_to, request_fingerprint,
         privacy_consent_version, link_user_id, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '10 minutes')`,
      [
        hashVkValue(state),
        hashVkValue(verifier),
        normalizeAuthReturnTo(body.returnTo),
        fingerprint,
        PRIVACY_POLICY_VERSION,
        linkMode ? currentUser?.id : null,
      ]
    );

    const response = noStoreJson({
      authorizationUrl: buildVkAuthorizeUrl({
        ...config,
        state,
        codeChallenge: vkCodeChallenge(verifier),
      }),
    });
    response.cookies.set(VK_INTENT_COOKIE, verifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error('[api/auth/vk/start]', error);
    return noStoreJson({ error: 'VK ID временно недоступен', code: 'unavailable' }, 503);
  }
}
