import crypto from 'crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthPublicOrigin, normalizeAuthReturnTo } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import {
  createPlayerToken,
  getPlayerTokenFromCookieHeader,
  getRecentPlayerAuthTokenFromCookieHeader,
  setPlayerCookie,
  verifyPlayerToken,
  verifyRecentPlayerAuthToken,
} from '@/lib/player-auth';
import { importTelegramProfileAvatar } from '@/lib/profile-avatar-import';
import { ensureTelegramAccount } from '@/lib/telegram-registration';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy';
import {
  hashTelegramBrowserSecret,
  hashTelegramConfirmationCode,
  isTelegramWebAuthAvailable,
  isTelegramWebAuthUserAllowed,
  LEGACY_TELEGRAM_INTENT_COOKIE,
  TELEGRAM_BROWSER_SECRET_RE,
  TELEGRAM_CONFIRMATION_CODE_RE,
  TELEGRAM_INTENT_COOKIE,
} from '@/lib/telegram-web-auth';

export const dynamic = 'force-dynamic';

const TELEGRAM_ID_RE = /^[1-9]\d*$/;

function browserSecret(req: NextRequest): string {
  const value = String(req.cookies.get(TELEGRAM_INTENT_COOKIE)?.value || '');
  return TELEGRAM_BROWSER_SECRET_RE.test(value) ? value : '';
}

function noStoreJson(body: object, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function clearIntentCookie(response: NextResponse): void {
  response.cookies.set(TELEGRAM_INTENT_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  if (TELEGRAM_INTENT_COOKIE !== LEGACY_TELEGRAM_INTENT_COOKIE) {
    response.cookies.set(LEGACY_TELEGRAM_INTENT_COOKIE, '', {
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
  }
}

function hasTrustedOrigin(req: NextRequest): boolean {
  const origin = String(req.headers.get('origin') || '');
  try {
    return new URL(origin).origin === getAuthPublicOrigin(req.nextUrl.origin);
  } catch {
    return false;
  }
}

function currentPlayer(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  return token ? verifyPlayerToken(token) : null;
}

function confirmedProfile(value: unknown): {
  firstName?: unknown;
  lastName?: unknown;
  username?: unknown;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const profile = value as Record<string, unknown>;
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    username: profile.username,
  };
}

function safeHashEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function GET(req: NextRequest) {
  if (!isTelegramWebAuthAvailable()) {
    return noStoreJson({ status: 'unavailable' }, 503);
  }
  const secret = browserSecret(req);
  if (!secret) return noStoreJson({ status: 'no_intent' }, 404);

  try {
    const result = await getPool().query(
      `SELECT i.expires_at, i.used_at,
              i.pending_telegram_user_id, i.confirmed_user_id,
              i.confirmed_telegram_user_id, i.confirmed_private_chat_id,
              i.confirmed_display_name, linked.id AS linked_user_id
         FROM telegram_web_auth_intents i
         LEFT JOIN users linked
           ON linked.telegram_user_id = i.confirmed_telegram_user_id
        WHERE i.browser_secret_hash = $1
        LIMIT 1`,
      [hashTelegramBrowserSecret(secret)]
    );
    const intent = result.rows[0];
    if (!intent) {
      const response = noStoreJson({ status: 'no_intent' }, 404);
      clearIntentCookie(response);
      return response;
    }
    if (intent.used_at || new Date(intent.expires_at).getTime() <= Date.now()) {
      const response = noStoreJson({ status: 'expired' }, 410);
      clearIntentCookie(response);
      return response;
    }

    const pendingTelegramUserId = String(intent.pending_telegram_user_id || '');
    if (pendingTelegramUserId && !isTelegramWebAuthUserAllowed(pendingTelegramUserId)) {
      const response = noStoreJson({ status: 'invalid' }, 403);
      clearIntentCookie(response);
      return response;
    }
    const telegramUserId = String(intent.confirmed_telegram_user_id || '');
    if (!telegramUserId) {
      return noStoreJson({
        status: 'pending',
        telegramOpened: Boolean(intent.pending_telegram_user_id),
        expiresAt: new Date(intent.expires_at).toISOString(),
      });
    }
    const privateChatId = String(intent.confirmed_private_chat_id || '');
    const linkedUserId = Number(intent.linked_user_id || 0);
    const confirmedUserId = Number(intent.confirmed_user_id || 0);
    if (
      !TELEGRAM_ID_RE.test(telegramUserId)
      || privateChatId !== telegramUserId
      || !isTelegramWebAuthUserAllowed(telegramUserId)
      || (confirmedUserId > 0 && confirmedUserId !== linkedUserId)
    ) {
      const response = noStoreJson({ status: 'invalid' }, 409);
      clearIntentCookie(response);
      return response;
    }

    return noStoreJson({
      status: 'confirmed',
      displayName: String(intent.confirmed_display_name || 'Игрок Telegram').slice(0, 120),
      existingAccount: linkedUserId > 0,
      expiresAt: new Date(intent.expires_at).toISOString(),
    });
  } catch (error) {
    console.error('[api/auth/telegram-login][GET]', error);
    return noStoreJson({ status: 'unavailable' }, 503);
  }
}

export async function PATCH(req: NextRequest) {
  if (!isTelegramWebAuthAvailable()) {
    return noStoreJson({ error: 'Вход через Telegram временно недоступен', code: 'telegram_unavailable' }, 503);
  }
  if (!hasTrustedOrigin(req)) {
    return noStoreJson({ error: 'Forbidden', code: 'origin' }, 403);
  }
  const secret = browserSecret(req);
  if (!secret) return noStoreJson({ error: 'Сессия входа не найдена', code: 'no_intent' }, 404);
  const body = await req.json().catch(() => ({})) as { code?: unknown };
  const code = String(body.code ?? '').replace(/\s+/g, '');
  if (!TELEGRAM_CONFIRMATION_CODE_RE.test(code)) {
    return noStoreJson({ error: 'Введите шестизначный код из бота', code: 'invalid_code' }, 400);
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const intentResult = await client.query(
      `SELECT token, confirmation_code_hash, confirmation_attempts,
              pending_telegram_user_id, pending_private_chat_id,
              pending_display_name, pending_profile,
              confirmed_telegram_user_id
         FROM telegram_web_auth_intents
        WHERE browser_secret_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
        FOR UPDATE`,
      [hashTelegramBrowserSecret(secret)]
    );
    const intent = intentResult.rows[0];
    if (!intent) {
      await client.query('ROLLBACK');
      const response = noStoreJson({ error: 'Попытка входа истекла', code: 'expired' }, 410);
      clearIntentCookie(response);
      return response;
    }
    if (intent.confirmed_telegram_user_id) {
      await client.query('COMMIT');
      const existing = await getPool().query(
        `SELECT id FROM users WHERE telegram_user_id = $1 LIMIT 1`,
        [String(intent.confirmed_telegram_user_id)]
      );
      return noStoreJson({
        ok: true,
        status: 'confirmed',
        displayName: String(intent.pending_display_name || 'Игрок Telegram').slice(0, 120),
        existingAccount: Boolean(existing.rowCount),
      });
    }

    const telegramUserId = String(intent.pending_telegram_user_id || '');
    if (
      !TELEGRAM_ID_RE.test(telegramUserId)
      || String(intent.pending_private_chat_id || '') !== telegramUserId
      || !isTelegramWebAuthUserAllowed(telegramUserId)
      || !intent.confirmation_code_hash
    ) {
      await client.query('ROLLBACK');
      return noStoreJson({
        error: 'Сначала откройте ссылку в Telegram и получите код',
        code: 'telegram_not_opened',
      }, 409);
    }

    const attempts = Number(intent.confirmation_attempts || 0);
    if (attempts >= 5) {
      await client.query(
        `UPDATE telegram_web_auth_intents SET used_at = now()
          WHERE browser_secret_hash = $1`,
        [hashTelegramBrowserSecret(secret)]
      );
      await client.query('COMMIT');
      const response = noStoreJson({ error: 'Слишком много неверных кодов', code: 'locked' }, 429);
      clearIntentCookie(response);
      return response;
    }

    const submittedHash = hashTelegramConfirmationCode(String(intent.token), code);
    if (!safeHashEqual(String(intent.confirmation_code_hash), submittedHash)) {
      const nextAttempts = attempts + 1;
      await client.query(
        `UPDATE telegram_web_auth_intents
            SET confirmation_attempts = $2,
                used_at = CASE WHEN $2 >= 5 THEN now() ELSE used_at END
          WHERE browser_secret_hash = $1`,
        [hashTelegramBrowserSecret(secret), nextAttempts]
      );
      await client.query('COMMIT');
      const response = noStoreJson({
        error: nextAttempts >= 5
          ? 'Слишком много неверных кодов. Начните вход заново.'
          : 'Неверный код из Telegram',
        code: nextAttempts >= 5 ? 'locked' : 'wrong_code',
        attemptsRemaining: Math.max(0, 5 - nextAttempts),
      }, nextAttempts >= 5 ? 429 : 401);
      if (nextAttempts >= 5) clearIntentCookie(response);
      return response;
    }

    const existing = await client.query(
      `SELECT id FROM users WHERE telegram_user_id = $1 LIMIT 1`,
      [telegramUserId]
    );
    await client.query(
      `UPDATE telegram_web_auth_intents
          SET confirmed_user_id = $2,
              confirmed_telegram_user_id = pending_telegram_user_id,
              confirmed_private_chat_id = pending_private_chat_id,
              confirmed_display_name = pending_display_name,
              confirmed_profile = pending_profile,
              confirmed_at = now()
        WHERE browser_secret_hash = $1
          AND confirmed_telegram_user_id IS NULL
          AND used_at IS NULL`,
      [hashTelegramBrowserSecret(secret), existing.rows[0]?.id ?? null]
    );
    await client.query('COMMIT');
    return noStoreJson({
      ok: true,
      status: 'confirmed',
      displayName: String(intent.pending_display_name || 'Игрок Telegram').slice(0, 120),
      existingAccount: Boolean(existing.rowCount),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[api/auth/telegram-login][PATCH]', error);
    return noStoreJson({ error: 'Временная ошибка проверки кода', code: 'unavailable' }, 503);
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  if (!isTelegramWebAuthAvailable()) {
    return noStoreJson({ error: 'Вход через Telegram временно недоступен', code: 'telegram_unavailable' }, 503);
  }
  if (!hasTrustedOrigin(req)) {
    return noStoreJson({ error: 'Forbidden', code: 'origin' }, 403);
  }
  const secret = browserSecret(req);
  if (!secret) return noStoreJson({ error: 'Сессия входа не найдена', code: 'no_intent' }, 404);

  const body = await req.json().catch(() => ({})) as {
    action?: unknown;
    switchAccount?: unknown;
    privacyConsent?: unknown;
  };
  if (body.action !== 'continue' && body.action !== 'link_current') {
    return noStoreJson({ error: 'Выберите действие с аккаунтом', code: 'decision_required' }, 400);
  }
  if (body.privacyConsent !== true) {
    return noStoreJson({
      error: 'Подтвердите согласие с Политикой обработки персональных данных',
      code: 'privacy_consent_required',
    }, 400);
  }
  const action = body.action;
  const switchAccount = body.switchAccount === true;
  const session = currentPlayer(req);
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const intentResult = await client.query(
      `SELECT confirmed_user_id, confirmed_telegram_user_id,
              confirmed_private_chat_id, confirmed_profile, return_to
         FROM telegram_web_auth_intents
        WHERE browser_secret_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
        FOR UPDATE`,
      [hashTelegramBrowserSecret(secret)]
    );
    const intent = intentResult.rows[0];
    const telegramUserId = String(intent?.confirmed_telegram_user_id || '');
    const privateChatId = String(intent?.confirmed_private_chat_id || '');
    if (
      !intent
      || !TELEGRAM_ID_RE.test(telegramUserId)
      || privateChatId !== telegramUserId
      || !isTelegramWebAuthUserAllowed(telegramUserId)
    ) {
      await client.query('ROLLBACK');
      return noStoreJson({ error: 'Telegram ещё не подтвердил вход', code: 'pending' }, 409);
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `telegram-account:${telegramUserId}`,
    ]);
    const ownerResult = await client.query(
      `SELECT id, email, password_hash, full_name, telegram_user_id
         FROM users
        WHERE telegram_user_id = $1
        LIMIT 1
        FOR UPDATE`,
      [telegramUserId]
    );
    const owner = ownerResult.rows[0];
    const confirmedUserId = Number(intent.confirmed_user_id || 0);
    if (confirmedUserId > 0 && Number(owner?.id || 0) !== confirmedUserId) {
      await client.query('ROLLBACK');
      const response = noStoreJson({ error: 'Привязка Telegram изменилась', code: 'invalid' }, 409);
      clearIntentCookie(response);
      return response;
    }

    let accountId = 0;
    if (action === 'link_current') {
      const recentToken = getRecentPlayerAuthTokenFromCookieHeader(req.headers.get('cookie') || '');
      const recent = recentToken ? verifyRecentPlayerAuthToken(recentToken) : null;
      if (!session?.id || recent?.id !== session.id) {
        await client.query('ROLLBACK');
        return noStoreJson({
          error: 'Сначала заново войдите по email и паролю',
          code: 'recent_auth_required',
        }, 401);
      }
      if (owner && Number(owner.id) !== session.id) {
        await client.query('ROLLBACK');
        return noStoreJson({
          error: 'Этот Telegram уже принадлежит другому аккаунту',
          code: 'telegram_taken',
        }, 409);
      }

      const currentResult = await client.query(
        `SELECT id, email, password_hash, telegram_user_id
           FROM users
          WHERE id = $1
          FOR UPDATE`,
        [session.id]
      );
      const current = currentResult.rows[0];
      if (!current?.email || !current?.password_hash) {
        await client.query('ROLLBACK');
        return noStoreJson({ error: 'Нужен аккаунт с email и паролем', code: 'email_account_required' }, 409);
      }
      if (current.telegram_user_id && current.telegram_user_id !== telegramUserId) {
        await client.query('ROLLBACK');
        return noStoreJson({
          error: 'Аккаунт уже связан с другим Telegram',
          code: 'telegram_conflict',
        }, 409);
      }
      await client.query(
        `UPDATE users
            SET telegram_user_id = $2,
                telegram_chat_id = $2,
                telegram_private_chat_id = $2,
                telegram_onboarding_status = CASE
                  WHEN player_id IS NOT NULL THEN 'approved'
                  ELSE COALESCE(NULLIF(telegram_onboarding_status, ''), 'legacy')
                END
          WHERE id = $1`,
        [session.id, telegramUserId]
      );
      await client.query(
        `UPDATE telegram_link_tokens
            SET used_at = COALESCE(used_at, now())
          WHERE user_id = $1 AND used_at IS NULL`,
        [session.id]
      );
      await client.query(
        `UPDATE telegram_web_login_tokens
            SET used_at = COALESCE(used_at, now())
          WHERE user_id = $1 AND used_at IS NULL`,
        [session.id]
      );
      accountId = session.id;
    } else {
      if (owner && session?.id && session.id !== Number(owner.id) && !switchAccount) {
        await client.query('ROLLBACK');
        return noStoreJson({
          error: 'В браузере уже открыт другой аккаунт',
          code: 'account_switch',
        }, 409);
      }
      if (!owner && session?.id) {
        await client.query('ROLLBACK');
        return noStoreJson({
          error: 'Привяжите Telegram к уже открытому аккаунту',
          code: 'link_current_available',
        }, 409);
      }
      const account = await ensureTelegramAccount(
        client,
        telegramUserId,
        privateChatId,
        confirmedProfile(intent.confirmed_profile)
      );
      accountId = account.id;
    }

    const accountResult = await client.query(
      `SELECT id, email, full_name, telegram_user_id
         FROM users
        WHERE id = $1
        FOR SHARE`,
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account || account.telegram_user_id !== telegramUserId) {
      await client.query('ROLLBACK');
      return noStoreJson({ error: 'Не удалось подтвердить аккаунт', code: 'invalid' }, 409);
    }

    await client.query(
      `UPDATE users
          SET privacy_consent_version = $2,
              privacy_consented_at = now()
        WHERE id = $1`,
      [accountId, PRIVACY_POLICY_VERSION]
    );

    const consumed = await client.query(
      `UPDATE telegram_web_auth_intents
          SET confirmed_user_id = $2, used_at = now()
        WHERE browser_secret_hash = $1 AND used_at IS NULL
        RETURNING return_to`,
      [hashTelegramBrowserSecret(secret), accountId]
    );
    if (!consumed.rowCount) {
      await client.query('ROLLBACK');
      const response = noStoreJson({ error: 'Сессия входа уже использована', code: 'expired' }, 410);
      clearIntentCookie(response);
      return response;
    }

    const returnTo = normalizeAuthReturnTo(consumed.rows[0]?.return_to);
    const authIdentity = String(account.email || `telegram:${telegramUserId}`);
    const playerToken = createPlayerToken(Number(account.id), authIdentity);
    const response = noStoreJson({ ok: true, returnTo });
    clearIntentCookie(response);
    setPlayerCookie(response, playerToken);
    await client.query('COMMIT');
    if (process.env.NODE_ENV !== 'test') {
      try {
        after(async () => {
          await importTelegramProfileAvatar(accountId, telegramUserId).catch((error) => {
            console.warn('[api/auth/telegram-login][avatar-import]', error instanceof Error ? error.message : 'failed');
          });
        });
      } catch (error) {
        // Avatar enrichment must never turn a successful login into an error.
        console.warn('[api/auth/telegram-login][avatar-schedule]', error instanceof Error ? error.message : 'failed');
      }
    }
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
      return noStoreJson({ error: 'Telegram уже связан с другим аккаунтом', code: 'telegram_taken' }, 409);
    }
    console.error('[api/auth/telegram-login][POST]', error);
    return noStoreJson({ error: 'Временная ошибка входа', code: 'unavailable' }, 503);
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  if (!hasTrustedOrigin(req)) {
    return noStoreJson({ error: 'Forbidden', code: 'origin' }, 403);
  }
  const secret = browserSecret(req);
  if (secret) {
    await getPool().query(
      `UPDATE telegram_web_auth_intents
          SET used_at = COALESCE(used_at, now())
        WHERE browser_secret_hash = $1`,
      [hashTelegramBrowserSecret(secret)]
    ).catch((error) => console.error('[api/auth/telegram-login][DELETE]', error));
  }
  const response = noStoreJson({ ok: true });
  clearIntentCookie(response);
  return response;
}
