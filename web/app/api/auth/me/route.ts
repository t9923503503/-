import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${PLAYER_COOKIE}=([^;]+)`));
  const token = match?.[1];

  if (!token) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const payload = verifyPlayerToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const res = await pool.query(
      'SELECT id, email, full_name, nickname, avatar_url, elo_rating, created_at FROM users WHERE id = $1',
      [payload.id],
    );
    const user = res.rows[0];
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      elo_rating: user.elo_rating,
      created_at: user.created_at,
    });
  } catch (err) {
    console.error('[api/auth/me]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
