import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthPublicOrigin } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = String(req.headers.get('origin') || '');
  let trustedOrigin = false;
  try {
    trustedOrigin = new URL(origin).origin === getAuthPublicOrigin(new URL(req.url).origin);
  } catch {
    trustedOrigin = false;
  }
  if (!trustedOrigin || !String(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { email?: string; password?: string; full_name?: string; consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const { email, password, full_name, consent } = body;

  if (consent !== true) {
    return NextResponse.json({ error: 'Подтвердите согласие с Политикой обработки персональных данных' }, { status: 400 });
  }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Пароль должен быть минимум 6 символов' }, { status: 400 });
  }
  if (!full_name || full_name.trim().length < 2) {
    return NextResponse.json({ error: 'Введите имя и фамилию' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const nickname = email.split('@')[0].slice(0, 50);

  try {
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO users (
         email, password_hash, full_name, nickname,
         privacy_consent_version, privacy_consented_at
       )
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id, email, full_name`,
      [email.toLowerCase().trim(), hash, full_name.trim(), nickname, PRIVACY_POLICY_VERSION],
    );
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      return NextResponse.json({ error: 'Пользователь с таким email уже существует' }, { status: 400 });
    }
    console.error('[api/auth/register]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
