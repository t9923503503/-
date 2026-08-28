import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getTournamentById } from '@/lib/admin-queries';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';
import {
  type KotcNextOperatorState,
  getKotcNextOperatorStateSummary,
  isKotcNextError,
  resetKotcNextState,
} from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

async function getKotcNextStateForAudit(
  tournamentId: string,
): Promise<KotcNextOperatorState | { unavailable: true; error: string } | null> {
  try {
    return await getKotcNextOperatorStateSummary(tournamentId);
  } catch (error) {
    return {
      unavailable: true,
      error: error instanceof Error ? error.message : 'KOTC Next state is not available',
    };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reason = String(body.reason ?? '').trim();
    if (!reason) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    const before = await getTournamentById(id);
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const beforeKotcNextState = await getKotcNextStateForAudit(id);

    const reset = await resetKotcNextState(id);
    const after = await getTournamentById(id);
    const afterKotcNextState = await getKotcNextStateForAudit(id);
    const payload = await resolveSudyamBootstrap(id, 'kotc');

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.resetKotcNext',
      entityType: 'tournament',
      entityId: id,
      beforeState: {
        tournament: before,
        kotcNextState: beforeKotcNextState,
      },
      afterState: {
        tournament: after,
        kotcNextState: afterKotcNextState,
        reset,
      },
      reason,
    });

    return NextResponse.json({
      ok: true,
      tournament: after,
      reset,
      payload: {
        ...payload,
        canAdminResetKotcNext: true,
        canAdminForceFinishKotcRound: true,
      },
      state: afterKotcNextState,
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.resetKotcNext');
  }
}
