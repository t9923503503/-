import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/db';
import { sendResetEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Введите корректный email' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const res = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    const user = res.rows[0];

    // Всегда отвечаем 200, чтобы не раскрывать существование аккаунта
    if (!user) {
      return NextResponse.json({ ok: true, message: 'Если аккаунт существует, письмо отправлено' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, user.id],
    );

    await sendResetEmail(user.email, token);

    return NextResponse.json({ ok: true, message: 'Если аккаунт существует, письмо отправлено' });
  } catch (err) {
    console.error('[api/auth/reset-password]', err);
    return NextResponse.json({ error: 'Ошибка отправки письма' }, { status: 500 });
  }
}
