import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthPublicOrigin } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import {
  getPlayerTokenFromCookieHeader,
  getRecentPlayerAuthTokenFromCookieHeader,
  verifyPlayerToken,
  verifyRecentPlayerAuthToken,
} from '@/lib/player-auth';
import { isLegacyTelegramLinkAvailable } from '@/lib/telegram-web-auth';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_MINUTES = 15;

function getAuthedUser(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  if (!token) return null;
  return verifyPlayerToken(token);
}

function hasTrustedOrigin(req: NextRequest): boolean {
  const origin = String(req.headers.get('origin') || '');
  try {
    return new URL(origin).origin === getAuthPublicOrigin(new URL(req.url).origin);
  } catch {
    return false;
  }
}

function hasRecentPasswordAuth(req: NextRequest, userId: number): boolean {
  const token = getRecentPlayerAuthTokenFromCookieHeader(req.headers.get('cookie') || '');
  const recent = token ? verifyRecentPlayerAuthToken(token) : null;
  return recent?.id === userId;
}

function recentAuthRequired() {
  return NextResponse.json(
    {
      error: 'Сначала заново войдите по email и паролю',
      code: 'recent_auth_required',
    },
    { status: 401 }
  );
}

function botUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || 'Lpvolley_bot').replace(/^@/, '');
}

function hasText(value: unknown): boolean {
  return String(value ?? '').trim() !== '';
}

function telegramIdentityState(row: Record<string, unknown> | undefined): {
  linked: boolean;
  hasPasswordLogin: boolean;
} {
  return {
    linked: Boolean(row && hasText(row.telegram_user_id)),
    hasPasswordLogin: Boolean(row && hasText(row.email) && hasText(row.password_hash)),
  };
}

// GET — статус привязки текущего пользователя
export async function GET(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT telegram_user_id, telegram_private_chat_id, telegram_chat_id,
              email, password_hash
         FROM users WHERE id = $1`,
      [auth.id]
    );
    if (!res.rows[0]) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    const state = telegramIdentityState(res.rows[0]);
    return NextResponse.json({
      linked: state.linked,
      linkingAvailable: isLegacyTelegramLinkAvailable(),
      canUnlink: state.linked && state.hasPasswordLogin,
      authMethod: state.hasPasswordLogin
        ? (state.linked ? 'email+telegram' : 'email')
        : (state.linked ? 'telegram' : 'unknown'),
      bot: botUsername(),
    });
  } catch (err) {
    console.error('[api/auth/telegram-link][GET]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}

// POST — сгенерировать одноразовую ссылку привязки t.me/<bot>?start=<token>
export async function POST(req: NextRequest) {
  if (!hasTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden', code: 'origin' }, { status: 403 });
  }
  if (!isLegacyTelegramLinkAvailable()) {
    return NextResponse.json(
      {
        error: 'Привязка Telegram временно недоступна.',
        code: 'telegram_beta_closed',
      },
      { status: 410 }
    );
  }
  const auth = getAuthedUser(req);
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const client = await getPool().connect();
  try {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    await client.query('BEGIN');
    const account = await client.query(
      `SELECT id, email, password_hash, telegram_user_id
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [auth.id]
    );
    if (!account.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    const current = account.rows[0];
    if (!current.email || !current.password_hash || !hasRecentPasswordAuth(req, auth.id)) {
      await client.query('ROLLBACK');
      return recentAuthRequired();
    }
    if (hasText(current.telegram_user_id)) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Telegram уже связан с аккаунтом', code: 'already_linked' },
        { status: 409 }
      );
    }
    await client.query(
      `UPDATE telegram_link_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [auth.id]
    );
    await client.query(
      `DELETE FROM telegram_link_tokens
        WHERE expires_at < now() - interval '1 day'`
    );
    await client.query(
      'INSERT INTO telegram_link_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, auth.id, expiresAt]
    );
    await client.query('COMMIT');
    const url = `https://t.me/${botUsername()}?start=${token}`;
    return NextResponse.json({ url, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[api/auth/telegram-link][POST]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE — отвязать Telegram от аккаунта
export async function DELETE(req: NextRequest) {
  if (!hasTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden', code: 'origin' }, { status: 403 });
  }
  const auth = getAuthedUser(req);
  if (!auth) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query(
      `SELECT telegram_user_id, telegram_private_chat_id, telegram_chat_id,
              email, password_hash
         FROM users WHERE id = $1
         FOR UPDATE`,
      [auth.id]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const state = telegramIdentityState(account);
    if (state.linked && !state.hasPasswordLogin) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        {
          error: 'Нельзя отвязать единственный способ входа. Сначала добавьте email и пароль.',
          code: 'last_login_method',
        },
        { status: 409 }
      );
    }
    if (!state.hasPasswordLogin || !hasRecentPasswordAuth(req, auth.id)) {
      await client.query('ROLLBACK');
      return recentAuthRequired();
    }

    await client.query(
      `UPDATE users
          SET telegram_user_id = NULL,
              telegram_private_chat_id = NULL,
              telegram_chat_id = NULL
        WHERE id = $1`,
      [auth.id]
    );
    await client.query(
      `UPDATE telegram_link_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [auth.id]
    );
    await client.query(
      `UPDATE telegram_web_login_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [auth.id]
    );
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[api/auth/telegram-link][DELETE]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}
