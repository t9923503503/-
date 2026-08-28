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
    const reason = String(body.reason ?? '').trim();

    if (!reason) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    const before = await getTournamentById(id);
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const beforeKotcNextState = await getKotcNextOperatorStateSummary(id);

    const control = await executeKotcNextControlCommand(id, { kind: 'admin', id: auth.actor.id }, {
      commandId: String(body.commandId || `legacy-force-all-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      action: 'force_finish_all',
      expectedRevision: body.expectedRevision == null ? undefined : Number(body.expectedRevision),
      reason,
    });
    const result = {
      state: control.state,
      completedCount: Number(control.event?.payload.completedCount) || 0,
    };
    const after = await getTournamentById(id);
    const payload = await resolveSudyamBootstrap(id, 'kotc');

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.kotcNextForceFinishAllRounds',
      entityType: 'tournament',
      entityId: id,
      beforeState: {
        tournament: before,
        kotcNextState: beforeKotcNextState,
      },
      afterState: {
        tournament: after,
        kotcNextState: result.state,
        completedCount: result.completedCount,
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
      state: result.state,
      completedCount: result.completedCount,
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.kotcnForceFinishAllRounds');
  }
}
