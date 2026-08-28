import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { executeKotcNextControlCommand, isKotcNextError } from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '').trim();
    const adminActions = new Set([
      'force_finish_court',
      'force_finish_all',
      'correct_score',
      'correct_positions',
      'set_remaining_time',
      'revert_correction',
      'rollback_r2',
    ]);
    const actor = adminActions.has(action) || body.acknowledgeOffline === true
      ? requireApiRole(req, 'admin')
      : auth;
    if (!actor.ok) return actor.response;

    const result = await executeKotcNextControlCommand(
      id,
      { kind: actor.actor.role === 'admin' ? 'admin' : 'operator', id: actor.actor.id },
      {
        commandId: String(body.commandId || ''),
        action: action as Parameters<typeof executeKotcNextControlCommand>[2]['action'],
        roundNo: body.roundNo == null ? undefined : Number(body.roundNo),
        courtNo: body.courtNo == null ? undefined : Number(body.courtNo),
        raundNo: body.raundNo == null ? undefined : Number(body.raundNo),
        expectedRevision: body.expectedRevision == null ? undefined : Number(body.expectedRevision),
        reason: body.reason == null ? undefined : String(body.reason),
        acknowledgeOffline: body.acknowledgeOffline === true,
        payload: body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : undefined,
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json(
        error.code ? { error: error.message, code: error.code } : { error: error.message },
        { status: error.status },
      );
    }
    return adminErrorResponse(error, 'tournaments.kotcnControl');
  }
}
