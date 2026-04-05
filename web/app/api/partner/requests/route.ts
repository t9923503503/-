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

export async function GET(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         pr.id,
         pr.tournament_id,
         pr.requester_user_id,
         pr.recipient_user_id,
         pr.status,
         pr.created_at,
         req.full_name AS requester_name,
         rec.full_name AS recipient_name,
         t.name AS tournament_name
       FROM partner_requests pr
       LEFT JOIN users req ON req.id = pr.requester_user_id
       LEFT JOIN users rec ON rec.id = pr.recipient_user_id
       LEFT JOIN tournaments t ON t.id = pr.tournament_id
       WHERE pr.requester_user_id = $1 OR pr.recipient_user_id = $1
       ORDER BY pr.created_at DESC
       LIMIT 200`,
      [auth.id]
    );
    return NextResponse.json(
      rows.map((r) => ({
        id: String(r.id),
        tournamentId: String(r.tournament_id ?? ''),
        tournamentName: String(r.tournament_name ?? ''),
        status: String(r.status ?? 'pending'),
        createdAt: String(r.created_at ?? ''),
        requesterName: String(r.requester_name ?? ''),
        recipientName: String(r.recipient_name ?? ''),
        direction:
          Number(r.requester_user_id) === auth.id ? 'outgoing' : 'incoming',
      }))
    );
  } catch (err) {
    console.error('[api/partner/requests][GET]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  let body: { sourceRequestId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const sourceRequestId = String(body.sourceRequestId || '').trim();
  if (!sourceRequestId) {
    return NextResponse.json({ error: 'sourceRequestId is required' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const sourceRes = await pool.query(
      `SELECT id, requester_user_id, tournament_id, name
       FROM player_requests
       WHERE id = $1
         AND status = 'pending'
         AND COALESCE(registration_type, 'solo') = 'solo'
         AND COALESCE(partner_wanted, true) = true
       LIMIT 1`,
      [sourceRequestId]
    );
    const source = sourceRes.rows[0];
    if (!source) {
      return NextResponse.json({ error: 'Заявка для поиска пары не найдена' }, { status: 404 });
    }
    if (!source.requester_user_id) {
      return NextResponse.json(
        { error: 'Игрок не подключил личный кабинет для подтверждения' },
        { status: 400 }
      );
    }
    if (Number(source.requester_user_id) === auth.id) {
      return NextResponse.json(
        { error: 'Нельзя отправить запрос самому себе' },
        { status: 400 }
      );
    }

    const insertRes = await pool.query(
      `INSERT INTO partner_requests
         (tournament_id, source_request_id, requester_user_id, recipient_user_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (source_request_id, requester_user_id, recipient_user_id)
       DO UPDATE SET updated_at = now()
       RETURNING id`,
      [source.tournament_id, source.id, auth.id, Number(source.requester_user_id)]
    );

    const notifyRes = await pool.query(
      `SELECT
         u.telegram_chat_id,
         u.full_name AS recipient_name,
         t.name AS tournament_name
       FROM users u
       LEFT JOIN tournaments t ON t.id = $2
       WHERE u.id = $1
       LIMIT 1`,
      [Number(source.requester_user_id), source.tournament_id]
    );
    const recipient = notifyRes.rows[0];
    await sendTelegramMessage(
      recipient?.telegram_chat_id,
      `Новый запрос на пару в турнире "${recipient?.tournament_name || ''}". Откройте личный кабинет: https://lpvolley.ru/profile`
    );

    return NextResponse.json({
      ok: true,
      id: insertRes.rows[0]?.id ?? null,
      message: 'Запрос отправлен. Ожидайте подтверждения игрока.',
    });
  } catch (err) {
    console.error('[api/partner/requests][POST]', err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
