import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { syncThaiStandingsToTournamentResultsOrThrowBadRequest } from '@/lib/thai-live/sync-tournament-results';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { inserted, roundUsed } = await syncThaiStandingsToTournamentResultsOrThrowBadRequest(id);

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.syncThaiResults',
      entityType: 'tournament',
      entityId: id,
      afterState: { inserted, roundUsed },
    });
    return NextResponse.json({ ok: true, inserted, roundUsed });
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.sync-thai-results.post');
  }
}
