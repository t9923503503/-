import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SnapshotEntry {
  slotId: string;
  slotOrder: number;
  gender: string;
  playerId: string | null;
  playerName: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; historyId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id, historyId } = await params;
    if (!id || !historyId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Load history entry and verify it belongs to this tournament's court
      const { rows: histRows } = await client.query<{
        courtId: string;
        snapshot: SnapshotEntry[];
      }>(
        `SELECT h.court_id::text AS "courtId", h.snapshot
         FROM go_court_slot_history h
         JOIN go_court c ON c.id = h.court_id
         WHERE h.id = $1 AND c.tournament_id = $2`,
        [historyId, id],
      );
      if (!histRows.length) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
      }

      const { courtId, snapshot } = histRows[0];
      const entries = Array.isArray(snapshot) ? (snapshot as SnapshotEntry[]) : [];

      // Restore all slots atomically in one pass
      for (const entry of entries) {
        if (!entry.slotId) continue;
        await client.query(
          `UPDATE go_court_slot
           SET player_id = $2, player_name = $3,
               assigned_at = CASE WHEN $2 IS NOT NULL THEN now() ELSE NULL END,
               assigned_by = $4
           WHERE id = $1`,
          [entry.slotId, entry.playerId ?? null, entry.playerName ?? null, auth.actor.id],
        );
      }

      await client.query('COMMIT');

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'go.courtSlot.restore',
        entityType: 'go_court',
        entityId: courtId,
        afterState: { historyId, restoredCount: entries.filter((e) => e.playerId).length },
      });

      return NextResponse.json({ ok: true, courtId, restored: entries.filter((e) => e.playerId).length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    return adminErrorResponse(error, 'tournaments.goCourtSlots.restore');
  }
}
