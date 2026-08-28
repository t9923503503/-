import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthPublicOrigin } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import {
  createPlayerToken,
  createRecentPlayerAuthToken,
  setPlayerCookie,
  setRecentPlayerAuthCookie,
} from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

function noStoreJson(body: object, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function hasTrustedOrigin(req: Request): boolean {
  const origin = String(req.headers.get('origin') || '');
  try {
    return new URL(origin).origin === getAuthPublicOrigin(new URL(req.url).origin);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!hasTrustedOrigin(req)) {
    return noStoreJson({ error: 'Forbidden', code: 'origin' }, 403);
  }
  if (!String(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return noStoreJson({ error: 'Ожидается JSON', code: 'content_type' }, 415);
  }
  let body: { email?: string; password?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Некорректный запрос' }, 400);
  }

  const { email, password } = body;
  const remember = body.remember !== false;

  if (!email || !password) {
    return noStoreJson({ error: 'Введите email и пароль' }, 400);
  }

  try {
    const pool = getPool();
    const res = await pool.query(
      'SELECT id, email, full_name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );
    const user = res.rows[0];

    // Одно сообщение для «нет пользователя» и «неверный пароль» — защита от enumeration
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return noStoreJson({ error: 'Неверный логин или пароль' }, 401);
    }

    const token = createPlayerToken(user.id, user.email);
    const response = noStoreJson({
      success: true,
      user: { id: user.id, name: user.full_name },
    });
    setPlayerCookie(response, token, { persistent: remember });
    setRecentPlayerAuthCookie(response, createRecentPlayerAuthToken(Number(user.id)));
    return response;
  } catch (err) {
    console.error('[api/auth/login]', err);
    return noStoreJson({ error: 'Внутренняя ошибка сервера' }, 500);
  }
}
