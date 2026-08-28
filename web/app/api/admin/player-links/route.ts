import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireApiRole } from '@/lib/admin-auth';
import { getAuthPublicOrigin } from '@/lib/auth-return-to';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function trustedOrigin(req: NextRequest): boolean {
  try {
    return new URL(String(req.headers.get('origin') || '')).origin
      === getAuthPublicOrigin(req.nextUrl.origin);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;

  const query = String(req.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
  try {
    const { rows } = await getPool().query(
      `SELECT u.id AS user_id, u.full_name, u.email,
              (u.vk_user_id IS NOT NULL) AS vk_linked,
              (u.telegram_user_id IS NOT NULL) AS telegram_linked,
              p.id::text AS player_id, p.name AS player_name, p.gender
         FROM users u
         JOIN players p ON p.id = u.player_id
        WHERE $1 = ''
           OR p.name ILIKE '%' || $1 || '%'
           OR COALESCE(u.full_name, '') ILIKE '%' || $1 || '%'
           OR COALESCE(u.email, '') ILIKE '%' || $1 || '%'
        ORDER BY p.name ASC, u.id ASC
        LIMIT 200`,
      [query]
    );
    return NextResponse.json({
      canUnlink: auth.actor.role === 'admin',
      links: rows.map((row) => ({
        userId: Number(row.user_id),
        accountName: String(row.full_name || ''),
        email: row.email ? String(row.email) : null,
        vkLinked: Boolean(row.vk_linked),
        telegramLinked: Boolean(row.telegram_linked),
        playerId: String(row.player_id),
        playerName: String(row.player_name),
        gender: String(row.gender) === 'W' ? 'W' : 'M',
      })),
    });
  } catch (error) {
    console.error('[api/admin/player-links][GET]', error);
    return NextResponse.json({ error: 'Не удалось загрузить привязки' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  if (!trustedOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden', code: 'origin' }, { status: 403 });
  }
  if (!String(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Ожидается JSON' }, { status: 415 });
  }

  const body = await req.json().catch(() => ({})) as { userId?: unknown; reason?: unknown };
  const userId = Number(body.userId);
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Некорректный ID аккаунта' }, { status: 400 });
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Укажите причину отвязки (минимум 5 символов)' }, { status: 400 });
  }

  const client = await getPool().connect();
  let beforeState: Record<string, unknown> | null = null;
  try {
    await client.query('BEGIN');
    const accountResult = await client.query(
      `SELECT id, full_name, player_id::text AS player_id,
              (vk_user_id IS NOT NULL) AS vk_linked,
              (telegram_user_id IS NOT NULL) AS telegram_linked
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [userId]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Аккаунт не найден' }, { status: 404 });
    }
    if (!account.player_id) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Карточка уже отвязана' }, { status: 409 });
    }
    const playerResult = await client.query(
      'SELECT id::text, name, gender FROM players WHERE id = $1 LIMIT 1',
      [account.player_id]
    );
    const player = playerResult.rows[0];
    beforeState = {
      userId,
      accountName: account.full_name,
      vkLinked: Boolean(account.vk_linked),
      telegramLinked: Boolean(account.telegram_linked),
      playerId: String(account.player_id),
      playerName: player ? String(player.name) : '',
    };

    await client.query(
      `UPDATE users
          SET player_id = NULL,
              telegram_onboarding_status = CASE
                WHEN telegram_user_id IS NOT NULL THEN 'legacy'
                ELSE telegram_onboarding_status
              END
        WHERE id = $1`,
      [userId]
    );
    await client.query(
      `DELETE FROM player_requests
        WHERE requester_user_id = $1
          AND tournament_id IS NULL`,
      [userId]
    );
    await client.query(
      `WITH cancelled_claims AS (
         UPDATE player_claims
            SET status = 'cancelled', updated_at = now()
          WHERE user_id = $1 AND status IN ('pending', 'approved')
          RETURNING id
       )
       UPDATE telegram_admin_outbox AS outbox
          SET sent_at = COALESCE(outbox.sent_at, now())
         FROM cancelled_claims AS claim
        WHERE outbox.sent_at IS NULL
          AND outbox.dedup_key = 'player_claim:' || claim.id::text`,
      [userId]
    );
    await client.query('COMMIT');

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'account.player_unlink',
      entityType: 'player',
      entityId: String(account.player_id),
      reason,
      beforeState,
      afterState: { ...beforeState, playerId: null, playerName: null },
    });
    return NextResponse.json({ ok: true, message: 'Карточка отвязана от аккаунта.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[api/admin/player-links][DELETE]', error);
    return NextResponse.json({ error: 'Не удалось отвязать карточку' }, { status: 500 });
  } finally {
    client.release();
  }
}
