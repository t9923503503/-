import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { isGoNextError, patchGoMatchByOperator } from '@/lib/go-next';
import type { GoMatchStatus } from '@/lib/go-next/types';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id, matchId } = await params;
    if (!id || !matchId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const statusRaw = body.status == null ? undefined : String(body.status).trim().toLowerCase();

    const result = await patchGoMatchByOperator(id, {
      matchId,
      courtNo: body.courtNo == null ? undefined : body.courtNo === '' ? null : Number(body.courtNo),
      scheduledAt: body.scheduledAt == null ? undefined : (body.scheduledAt === '' ? null : String(body.scheduledAt)),
      status: statusRaw ? (statusRaw as GoMatchStatus) : undefined,
      scoreA: Array.isArray(body.scoreA) ? body.scoreA.map((item) => Number(item)) : undefined,
      scoreB: Array.isArray(body.scoreB) ? body.scoreB.map((item) => Number(item)) : undefined,
      setsA: body.setsA == null || body.setsA === '' ? undefined : Number(body.setsA),
      setsB: body.setsB == null || body.setsB === '' ? undefined : Number(body.setsB),
      winnerId: body.winnerId == null ? undefined : (body.winnerId === '' ? null : String(body.winnerId)),
      note: body.note == null ? undefined : String(body.note),
      allowLiveReschedule: body.allowLiveReschedule === true,
      allowFinishedReschedule: body.allowFinishedReschedule === true,
    });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'go.match.patch',
      entityType: 'go_match',
      entityId: matchId,
      reason: typeof body.note === 'string' ? body.note : '',
      beforeState: result.audit.before,
      afterState: result.audit.after,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.goMatch.patch');
  }
}
