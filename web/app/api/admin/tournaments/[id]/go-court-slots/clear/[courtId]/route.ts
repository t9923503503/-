import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; courtId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id, courtId } = await params;
    if (!id || !courtId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify court belongs to this tournament
      const { rows: courtRows } = await client.query<{ courtId: string; courtNo: number; label: string }>(
        `SELECT id::text AS "courtId", court_no AS "courtNo", label
         FROM go_court WHERE id = $1 AND tournament_id = $2`,
        [courtId, id],
      );
      if (!courtRows.length) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Court not found' }, { status: 404 });
      }
      const court = courtRows[0];

      // Atomically: snapshot → clear → update last_cleared_at
      const { rows: historyRows } = await client.query<{ historyId: string }>(
        `INSERT INTO go_court_slot_history (court_id, cleared_by, snapshot)
         SELECT
           $1,
           $2,
           COALESCE(
             json_agg(json_build_object(
               'slotId', id::text,
               'slotOrder', slot_order,
               'gender', gender,
               'playerId', player_id::text,
               'playerName', player_name
             ) ORDER BY slot_order),
             '[]'::json
           )
         FROM go_court_slot
         WHERE court_id = $1
         RETURNING id::text AS "historyId"`,
        [courtId, auth.actor.id],
      );
      const historyId = historyRows[0]?.historyId ?? '';

      await client.query(
        `UPDATE go_court_slot
         SET player_id = NULL, player_name = NULL, assigned_at = NULL, assigned_by = NULL
         WHERE court_id = $1`,
        [courtId],
      );

      await client.query(
        `UPDATE go_court SET last_cleared_at = now() WHERE id = $1`,
        [courtId],
      );

      await client.query('COMMIT');

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'go.courtSlot.clearAll',
        entityType: 'go_court',
        entityId: courtId,
        afterState: { historyId, courtNo: court.courtNo, courtLabel: court.label },
      });

      return NextResponse.json({ ok: true, historyId, courtId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    return adminErrorResponse(error, 'tournaments.goCourtSlots.clear');
  }
}
