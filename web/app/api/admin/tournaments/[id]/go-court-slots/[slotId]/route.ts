import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id, slotId } = await params;
    if (!id || !slotId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const playerId = body.playerId ? String(body.playerId) : null;
    const playerName = body.playerName ? String(body.playerName) : null;

    const pool = getPool();
    const client = await pool.connect();
    try {
      // Verify slot belongs to this tournament
      const { rows: verify } = await client.query<{ slotId: string; gender: string }>(
        `SELECT s.id::text AS "slotId", s.gender
         FROM go_court_slot s
         JOIN go_court c ON c.id = s.court_id
         WHERE s.id = $1 AND c.tournament_id = $2`,
        [slotId, id],
      );
      if (!verify.length) {
        return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
      }

      const slot = verify[0];

      // If assigning a player, verify gender matches
      if (playerId) {
        const { rows: playerRows } = await client.query<{ gender: string }>(
          `SELECT COALESCE(gender, 'M') AS gender FROM players WHERE id = $1`,
          [playerId],
        );
        if (playerRows.length) {
          const playerGender = String(playerRows[0].gender ?? '').toUpperCase() === 'W' ? 'W' : 'M';
          if (playerGender !== slot.gender) {
            return NextResponse.json(
              { error: `Player gender (${playerGender}) does not match slot gender (${slot.gender})` },
              { status: 400 },
            );
          }
        }
      }

      const { rows: updated } = await client.query<{
        slotId: string;
        playerId: string | null;
        playerName: string | null;
      }>(
        `UPDATE go_court_slot
         SET player_id = $2,
             player_name = $3,
             assigned_at = CASE WHEN $2 IS NOT NULL THEN now() ELSE NULL END,
             assigned_by = $4
         WHERE id = $1
         RETURNING id::text AS "slotId", player_id::text AS "playerId", player_name AS "playerName"`,
        [slotId, playerId, playerName, auth.actor.id],
      );

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: playerId ? 'go.courtSlot.assign' : 'go.courtSlot.clear',
        entityType: 'go_court_slot',
        entityId: slotId,
        afterState: { playerId, playerName },
      });

      return NextResponse.json({ slot: updated[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    return adminErrorResponse(error, 'tournaments.goCourtSlots.patch');
  }
}
