import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getTournamentById } from '@/lib/admin-queries';
import {
  getThaiJudgeStateSummary,
  isThaiJudgeError,
  resetThaiJudgeState,
} from '@/lib/thai-live';

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
    const beforeThaiJudgeState = await getThaiJudgeStateSummary(id);

    const reset = await resetThaiJudgeState(id);
    const after = await getTournamentById(id);
    const afterThaiJudgeState = await getThaiJudgeStateSummary(id);

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.resetThaiNext',
      entityType: 'tournament',
      entityId: id,
      beforeState: {
        tournament: before,
        thaiJudgeState: beforeThaiJudgeState,
      },
      afterState: {
        tournament: after,
        thaiJudgeState: afterThaiJudgeState,
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
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.resetThaiNext');
  }
}
