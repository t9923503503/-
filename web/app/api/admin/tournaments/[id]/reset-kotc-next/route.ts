import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getTournamentById } from '@/lib/admin-queries';
import {
  getKotcNextOperatorStateSummary,
  isKotcNextError,
  resetKotcNextState,
} from '@/lib/kotc-next';

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

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reason = String(body.reason ?? '').trim();
    if (!reason) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    const before = await getTournamentById(id);
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const beforeKotcNextState = await getKotcNextOperatorStateSummary(id);

    const reset = await resetKotcNextState(id);
    const after = await getTournamentById(id);
    const afterKotcNextState = await getKotcNextOperatorStateSummary(id);

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
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.resetKotcNext');
  }
}
