import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import {
  getPlayerTokenFromCookieHeader,
  verifyPlayerToken,
} from '@/lib/player-auth';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

function getAuthedUser(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  if (!token) return null;
  return verifyPlayerToken(token);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { action?: 'accept' | 'reject' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be accept or reject' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const pairRes = await pool.query(
      `SELECT
         pr.id,
         pr.status,
         pr.recipient_user_id,
         pr.requester_user_id,
         pr.tournament_id,
         t.name AS tournament_name,
         u.telegram_chat_id AS requester_chat_id
       FROM partner_requests pr
       LEFT JOIN tournaments t ON t.id = pr.tournament_id
       LEFT JOIN users u ON u.id = pr.requester_user_id
       WHERE pr.id = $1
       LIMIT 1`,
      [id]
    );
    const pair = pairRes.rows[0];
    if (!pair) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 });
    }
    if (Number(pair.recipient_user_id) !== auth.id) {
      return NextResponse.json({ error: 'Нет прав на подтверждение' }, { status: 403 });
    }
    if (String(pair.status) !== 'pending') {
      return NextResponse.json({ error: 'Запрос уже обработан' }, { status: 400 });
    }

    const nextStatus = action === 'accept' ? 'accepted' : 'rejected';
    await pool.query(
      `UPDATE partner_requests
       SET status = $2, updated_at = now()
       WHERE id = $1`,
      [id, nextStatus]
    );

    await sendTelegramMessage(
      pair.requester_chat_id,
      action === 'accept'
        ? `Ваш запрос на пару подтверждён для турнира "${pair.tournament_name || ''}".`
        : `Ваш запрос на пару отклонён для турнира "${pair.tournament_name || ''}".`
    );

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err) {
    console.error('[api/partner/requests/respond][POST]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
