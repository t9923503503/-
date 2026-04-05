import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  listRosterParticipants,
  addParticipant,
  removeParticipant,
  promoteFromWaitlist,
} from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeRosterInput, validateRosterInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';
import { isSudyamApproved } from '@/lib/kotc-live';
import { notifyPlayerPromotedFromWaitlist } from '@/lib/tournament-notifications';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok && !isSudyamApproved(req)) return auth.response;

  try {
    const tournamentId = req.nextUrl.searchParams.get('tournamentId') || '';
    if (!tournamentId) return NextResponse.json({ error: 'Missing tournamentId' }, { status: 400 });
    const data = await listRosterParticipants(tournamentId);
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'roster.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeRosterInput(body);
    const err = validateRosterInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    if (input.action === 'add') {
      const result = await addParticipant(input.tournamentId, input.playerId);
      if (!result.ok) return NextResponse.json({ error: result.message }, { status: 409 });
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'roster.add',
        entityType: 'tournament_participant',
        entityId: input.tournamentId,
        reason: input.reason || 'Admin added player',
        afterState: { playerId: input.playerId, waitlist: result.waitlist },
      });
      return NextResponse.json(result);
    }

    if (input.action === 'remove') {
      const result = await removeParticipant(input.tournamentId, input.playerId);
      if (!result.removed) return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'roster.remove',
        entityType: 'tournament_participant',
        entityId: input.tournamentId,
        reason: input.reason || 'Admin removed player',
        afterState: { playerId: input.playerId, promotedPlayerId: result.promotedPlayerId },
      });
      if (result.promotedPlayerId) {
        await notifyPlayerPromotedFromWaitlist(
          input.tournamentId,
          result.promotedPlayerId
        );
      }
      return NextResponse.json(result);
    }

    if (input.action === 'promote') {
      const ok = await promoteFromWaitlist(input.tournamentId, input.playerId);
      if (!ok) return NextResponse.json({ error: 'Player not on waitlist' }, { status: 404 });
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'roster.promote',
        entityType: 'tournament_participant',
        entityId: input.tournamentId,
        reason: input.reason || 'Admin promoted from waitlist',
        afterState: { playerId: input.playerId },
      });
      await notifyPlayerPromotedFromWaitlist(input.tournamentId, input.playerId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return adminErrorResponse(err, 'roster.post');
  }
}
