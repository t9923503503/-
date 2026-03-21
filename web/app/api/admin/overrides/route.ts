import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  applyPlayerRatingOverride,
  applyPlayerRecalcOverride,
  applyTournamentStatusOverride,
  getPlayerById,
  getTournamentById,
} from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeOverrideInput, validateOverrideInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeOverrideInput(body);
    const err = validateOverrideInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    if (input.type === 'tournament_status') {
      const tournamentId = input.tournamentId;
      const status = input.status;

      const before = await getTournamentById(tournamentId);
      const updated = await applyTournamentStatusOverride({ tournamentId, status });
      if (!updated) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'override.tournament_status',
        entityType: 'tournament',
        entityId: tournamentId,
        reason: input.reason,
        beforeState: before,
        afterState: updated,
      });
      return NextResponse.json(updated);
    }

    if (input.type === 'player_rating') {
      const playerId = input.playerId;
      const before = await getPlayerById(playerId);
      const updated = await applyPlayerRatingOverride({
        playerId,
        ratingM: Number.isNaN(input.ratingM) ? undefined : Number(input.ratingM),
        ratingW: Number.isNaN(input.ratingW) ? undefined : Number(input.ratingW),
        ratingMix: Number.isNaN(input.ratingMix) ? undefined : Number(input.ratingMix),
      });
      if (!updated) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'override.player_rating',
        entityType: 'player',
        entityId: playerId,
        reason: input.reason,
        beforeState: before,
        afterState: updated,
      });
      return NextResponse.json(updated);
    }

    if (input.type === 'player_recalc') {
      const playerId = input.playerId;
      const before = await getPlayerById(playerId);
      const updated = await applyPlayerRecalcOverride({ playerId });
      if (!updated) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'override.player_recalc',
        entityType: 'player',
        entityId: playerId,
        reason: input.reason,
        beforeState: before,
        afterState: updated,
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Unsupported override type' }, { status: 400 });
  } catch (err) {
    return adminErrorResponse(err, 'overrides.post');
  }
}
