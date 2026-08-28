import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getTournamentById } from '@/lib/admin-queries';
import {
  executeKotcNextControlCommand,
  getKotcNextOperatorStateSummary,
  isKotcNextError,
} from '@/lib/kotc-next';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const roundNo = Math.trunc(Number(body.roundNo) || 0);
    const courtNo = Math.trunc(Number(body.courtNo) || 0);
    const raundNo = Math.trunc(Number(body.raundNo) || 0);
    const reason = String(body.reason ?? '').trim();

    if (!reason) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }
    if (roundNo !== 1 && roundNo !== 2) {
      return NextResponse.json({ error: 'roundNo is required' }, { status: 400 });
    }
    if (courtNo < 1 || raundNo < 1) {
      return NextResponse.json({ error: 'courtNo and raundNo are required' }, { status: 400 });
    }

    const before = await getTournamentById(id);
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const beforeKotcNextState = await getKotcNextOperatorStateSummary(id);

    const control = await executeKotcNextControlCommand(id, { kind: 'admin', id: auth.actor.id }, {
      commandId: String(body.commandId || `legacy-force-court-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      action: 'force_finish_court', roundNo, courtNo, raundNo,
      expectedRevision: body.expectedRevision == null ? undefined : Number(body.expectedRevision),
      reason,
    });
    const state = control.state;
    const after = await getTournamentById(id);
    const payload = await resolveSudyamBootstrap(id, 'kotc');

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.kotcNextForceFinishRound',
      entityType: 'tournament',
      entityId: id,
      beforeState: {
        tournament: before,
        kotcNextState: beforeKotcNextState,
      },
      afterState: {
        tournament: after,
        kotcNextState: state,
        roundNo,
        courtNo,
        raundNo,
      },
      reason,
    });

    return NextResponse.json({
      ok: true,
      payload: {
        ...payload,
        canAdminResetKotcNext: true,
        canAdminForceFinishKotcRound: true,
      },
      state,
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.kotcnForceFinishRound');
  }
}
