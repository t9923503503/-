import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import {
  getPlayerTokenFromCookieHeader,
  verifyPlayerToken,
} from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

function getAuthedUser(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  if (!token) return null;
  return verifyPlayerToken(token);
}

export async function POST(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  let body: { telegram_chat_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const chatId = String(body.telegram_chat_id || '').trim();
  if (!chatId) {
    return NextResponse.json({ error: 'telegram_chat_id is required' }, { status: 400 });
  }

  try {
    const pool = getPool();
    await pool.query(
      'UPDATE users SET telegram_chat_id = $2 WHERE id = $1',
      [auth.id, chatId]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/auth/telegram][POST]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
