import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const { token, password } = body;

  if (!token) {
    return NextResponse.json({ error: 'Токен отсутствует' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Пароль должен быть минимум 6 символов' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const res = await pool.query(
      'SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token],
    );
    const user = res.rows[0];

    if (!user) {
      return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hash, user.id],
    );

    return NextResponse.json({ ok: true, message: 'Пароль успешно изменён' });
  } catch (err) {
    console.error('[api/auth/reset-password/confirm]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
