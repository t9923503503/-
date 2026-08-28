import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { getPool } from '@/lib/db';
import { reverseConfirmedPlayResultRating } from '@/lib/play-game-rating';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (reason.length < 5) return NextResponse.json({ error: 'Укажите причину отмены (минимум 5 символов)' }, { status: 400 });
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT id::text,status,post_id::text AS "postId" FROM play_game_results WHERE id=$1::uuid`, [id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Результат не найден' }, { status: 404 }); }
    const reversed = await reverseConfirmedPlayResultRating(client, id, auth.actor.id, reason);
    await client.query('COMMIT');
    try {
      await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'play_result.reverse', entityType: 'play_game_result', entityId: id, reason, beforeState: before.rows[0], afterState: reversed });
    } catch (auditError) {
      console.error('[play-result.reverse.audit]', auditError);
    }
    return NextResponse.json(reversed);
  } catch (error) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось отменить начисление' }, { status: 409 });
  } finally { client.release(); }
}
