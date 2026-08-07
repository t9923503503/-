import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { listRosterParticipants } from '@/lib/admin-queries';
import { getGoOperatorState, isGoNextError, mutateGoPairs, type GoPairMutationInput } from '@/lib/go-next';

export const dynamic = 'force-dynamic';

function asPairMutation(body: Record<string, unknown>): GoPairMutationInput | null {
  const action = String(body.action ?? '').trim();
  const pairIndex = Math.floor(Number(body.pairIndex));
  if (action === 'remove_pair' && pairIndex >= 1) {
    return {
      action,
      pairIndex,
      promoteWaitlistPlayerIds: Array.isArray(body.promoteWaitlistPlayerIds)
        ? body.promoteWaitlistPlayerIds.map(String)
        : undefined,
    };
  }
  if (action === 'replace_player' && pairIndex >= 1 && (body.playerSlot === 1 || body.playerSlot === 2)) {
    return { action, pairIndex, playerSlot: body.playerSlot, replacementPlayerId: String(body.replacementPlayerId ?? '') };
  }
  if (action === 'promote_waitlist_pair' && Array.isArray(body.playerIds)) {
    return { action, playerIds: body.playerIds.map(String) };
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json({ roster: await listRosterParticipants(id), state: await getGoOperatorState(id) });
  } catch (error) {
    return adminErrorResponse(error, 'tournaments.goPairs.get');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = asPairMutation(body);
    const reason = String(body.reason ?? '').trim();
    if (!input) return NextResponse.json({ error: 'Invalid GO pair action' }, { status: 400 });
    if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    const before = await listRosterParticipants(id);
    await mutateGoPairs(id, input);
    const [roster, state] = await Promise.all([listRosterParticipants(id), getGoOperatorState(id)]);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: `tournament.goPairs.${input.action}`,
      entityType: 'tournament',
      entityId: id,
      reason,
      beforeState: { roster: before },
      afterState: { roster, state },
    });
    return NextResponse.json({ ok: true, roster, state });
  } catch (error) {
    if (isGoNextError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    return adminErrorResponse(error, 'tournaments.goPairs.post');
  }
}
