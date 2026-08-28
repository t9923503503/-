import { NextRequest, NextResponse } from 'next/server';
import { getAuthPublicOrigin, normalizeAuthReturnTo } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import { createPlayerToken, setPlayerCookie } from '@/lib/player-auth';
import { importVkProfileAvatar } from '@/lib/profile-avatar-import';
import {
  getVkIdConfig,
  hashVkValue,
  isVkIdAvailable,
  normalizeVkName,
  VK_CODE_VERIFIER_RE,
  VK_DEVICE_ID_RE,
  VK_INTENT_COOKIE,
  VK_STATE_RE,
  VK_USER_ID_RE,
} from '@/lib/vk-id';

export const dynamic = 'force-dynamic';

type TokenResponse = {
  access_token?: unknown;
  state?: unknown;
  user_id?: unknown;
  error?: unknown;
};

type UserInfoResponse = {
  user?: { user_id?: unknown; first_name?: unknown; last_name?: unknown; avatar?: unknown };
  error?: unknown;
};

class VkLinkConflictError extends Error {}

function clearIntentCookie(response: NextResponse): void {
  response.cookies.set(VK_INTENT_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

function loginRedirect(origin: string, code: string, returnTo?: string): NextResponse {
  const url = new URL('/login', origin);
  url.searchParams.set('error', code);
  if (returnTo) url.searchParams.set('returnTo', normalizeAuthReturnTo(returnTo));
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  clearIntentCookie(response);
  return response;
}

async function postForm<T>(url: URL, body: URLSearchParams): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json() as T;
    if (!response.ok) throw new Error(`VK ID HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const origin = getAuthPublicOrigin(req.nextUrl.origin);
  if (!isVkIdAvailable()) return loginRedirect(origin, 'vk_unavailable');

  const state = String(req.nextUrl.searchParams.get('state') || '');
  const code = String(req.nextUrl.searchParams.get('code') || '');
  const deviceId = String(req.nextUrl.searchParams.get('device_id') || '');
  const verifier = String(req.cookies.get(VK_INTENT_COOKIE)?.value || '');
  if (
    req.nextUrl.searchParams.has('error')
    || !VK_STATE_RE.test(state)
    || !code
    || code.length > 2048
    || !VK_DEVICE_ID_RE.test(deviceId)
    || !VK_CODE_VERIFIER_RE.test(verifier)
  ) {
    return loginRedirect(origin, 'vk_cancelled');
  }

  let returnTo = '/profile';
  let linkUserId: number | null = null;
  try {
    const consumed = await getPool().query(
      `UPDATE vk_auth_intents
          SET used_at = now()
        WHERE state_hash = $1
          AND browser_secret_hash = $2
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING return_to, privacy_consent_version, link_user_id`,
      [hashVkValue(state), hashVkValue(verifier)]
    );
    const intent = consumed.rows[0];
    if (!intent) return loginRedirect(origin, 'vk_expired');
    returnTo = normalizeAuthReturnTo(intent.return_to);
    linkUserId = intent.link_user_id == null ? null : Number(intent.link_user_id);

    const config = getVkIdConfig(req.nextUrl.origin);
    const tokenUrl = new URL('https://id.vk.ru/oauth2/auth');
    tokenUrl.search = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      client_id: config.appId,
      code_verifier: verifier,
      state,
      device_id: deviceId,
    }).toString();
    const token = await postForm<TokenResponse>(tokenUrl, new URLSearchParams({ code }));
    const vkUserId = String(token.user_id ?? '').trim();
    const accessToken = String(token.access_token ?? '');
    if (
      token.error
      || token.state !== state
      || !VK_USER_ID_RE.test(vkUserId)
      || !accessToken
      || accessToken.length > 4096
    ) throw new Error('Invalid VK ID token response');

    const userInfoUrl = new URL('https://id.vk.ru/oauth2/user_info');
    userInfoUrl.searchParams.set('client_id', config.appId);
    const info = await postForm<UserInfoResponse>(
      userInfoUrl,
      new URLSearchParams({ access_token: accessToken })
    );
    const profileUserId = String(info.user?.user_id ?? '').trim();
    if (info.error || profileUserId !== vkUserId) {
      throw new Error('VK ID profile subject mismatch');
    }
    const fullName = normalizeVkName(info.user?.first_name, info.user?.last_name);
    const vkAvatarUrl = String(info.user?.avatar || '').trim();

    const client = await getPool().connect();
    let account: { id: number; full_name: string };
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`vk-account:${vkUserId}`]);
      const existing = await client.query(
        `SELECT id, full_name FROM users WHERE vk_user_id = $1 LIMIT 1 FOR UPDATE`,
        [vkUserId]
      );
      if (linkUserId) {
        const target = await client.query(
          `SELECT id, full_name, vk_user_id
             FROM users
            WHERE id = $1
            LIMIT 1
            FOR UPDATE`,
          [linkUserId]
        );
        if (!target.rowCount) throw new Error('VK link target account not found');
        if (existing.rowCount && Number(existing.rows[0].id) !== linkUserId) {
          throw new VkLinkConflictError('VK ID belongs to another account');
        }
        const targetVkId = String(target.rows[0].vk_user_id || '').trim();
        if (targetVkId && targetVkId !== vkUserId) {
          throw new VkLinkConflictError('Account already has another VK ID');
        }
        const updated = await client.query(
          `UPDATE users
              SET vk_user_id = $2,
                  full_name = CASE
                    WHEN NULLIF(btrim(COALESCE(full_name, '')), '') IS NULL THEN $3
                    ELSE full_name
                  END
            WHERE id = $1
            RETURNING id, full_name`,
          [linkUserId, vkUserId, fullName]
        );
        account = { id: Number(updated.rows[0].id), full_name: String(updated.rows[0].full_name) };
      } else if (existing.rowCount) {
        const updated = await client.query(
          `UPDATE users
              SET full_name = CASE
                    WHEN NULLIF(btrim(COALESCE(full_name, '')), '') IS NULL THEN $2
                    ELSE full_name
                  END
            WHERE id = $1
            RETURNING id, full_name`,
          [Number(existing.rows[0].id), fullName]
        );
        account = { id: Number(updated.rows[0].id), full_name: String(updated.rows[0].full_name) };
      } else {
        const created = await client.query(
          `INSERT INTO users (
             email, password_hash, full_name, nickname, vk_user_id,
             privacy_consent_version, privacy_consented_at
           ) VALUES (NULL, NULL, $1, NULL, $2, $3, now())
           RETURNING id, full_name`,
          [fullName, vkUserId, String(intent.privacy_consent_version)]
        );
        account = { id: Number(created.rows[0].id), full_name: String(created.rows[0].full_name) };
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (vkAvatarUrl) {
      await importVkProfileAvatar(account.id, vkAvatarUrl).catch((error) => {
        console.warn('[api/auth/vk/callback][avatar-import]', error instanceof Error ? error.message : 'failed');
      });
    }

    const destination = new URL(returnTo, origin);
    if (linkUserId) destination.searchParams.set('vkLink', 'success');
    const response = NextResponse.redirect(destination, 303);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    setPlayerCookie(response, createPlayerToken(account.id, `vk:${vkUserId}`));
    clearIntentCookie(response);
    return response;
  } catch (error) {
    console.error('[api/auth/vk/callback]', error);
    if (linkUserId) {
      const destination = new URL('/profile', origin);
      destination.searchParams.set('tab', 'settings');
      destination.searchParams.set(
        'vkLink',
        error instanceof VkLinkConflictError ? 'conflict' : 'failed'
      );
      const response = NextResponse.redirect(destination, 303);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      clearIntentCookie(response);
      return response;
    }
    return loginRedirect(origin, 'vk_login', returnTo);
  }
}
