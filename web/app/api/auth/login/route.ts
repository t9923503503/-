import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { createPlayerToken, setPlayerCookie } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Введите email и пароль' }, { status: 400 });
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
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }

    const token = createPlayerToken(user.id, user.email);
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.full_name },
    });
    setPlayerCookie(response, token);
    return response;
  } catch (err) {
    console.error('[api/auth/login]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
