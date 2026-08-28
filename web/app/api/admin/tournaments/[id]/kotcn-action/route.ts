import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';
import { executeKotcNextControlCommand, isKotcNextError, runKotcNextOperatorAction } from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '').trim().toLowerCase();
    const seed = Math.trunc(Number(body.seed) || 0);

    if (action === 'adjust_r1_pair_score' || action === 'adjust_r2_pair_score' || action === 'reset_r2') {
      const adminAuth = requireApiRole(req, 'admin');
      if (!adminAuth.ok) return adminAuth.response;
      const reason = String(body.reason || '').trim();
      if (!reason) {
        return NextResponse.json({ error: 'Reason is required; use KOTC Next Control Center' }, { status: 400 });
      }
      const roundNo = action === 'adjust_r1_pair_score' ? 1 : 2;
      const controlResult = await executeKotcNextControlCommand(
        id,
        { kind: 'admin', id: adminAuth.actor.id },
        {
          commandId: String(body.commandId || `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`),
          action: action === 'reset_r2' ? 'rollback_r2' : 'correct_score',
          roundNo,
          courtNo: body.courtNo == null ? undefined : Number(body.courtNo),
          raundNo: body.raundNo == null ? undefined : Number(body.raundNo),
          expectedRevision: body.expectedRevision == null ? undefined : Number(body.expectedRevision),
          reason,
          payload: action === 'reset_r2' ? undefined : { pairIdx: body.pairIdx, delta: body.delta },
        },
      );
      const refreshed = await resolveSudyamBootstrap(id, 'kotc');
      return NextResponse.json({
        success: true,
        payload: { ...refreshed, canAdminResetKotcNext: true, canAdminForceFinishKotcRound: true },
        state: controlResult.state,
      });
    }

    if (
      action !== 'bootstrap_r1' &&
      action !== 'finish_r1' &&
      action !== 'adjust_r1_pair_score' &&
      action !== 'preview_r2_seed' &&
      action !== 'confirm_r2_seed' &&
      action !== 'preview_manual_r2' &&
      action !== 'confirm_manual_r2' &&
      action !== 'bootstrap_r2' &&
      action !== 'finish_r2' &&
      action !== 'close_tournament' &&
      action !== 'reset_r2' &&
      action !== 'adjust_r2_pair_score'
    ) {
      return NextResponse.json({ error: 'Unsupported KOTC Next admin action' }, { status: 400 });
    }

    const result = await runKotcNextOperatorAction(id, action as Parameters<typeof runKotcNextOperatorAction>[1], {
      seed: seed >= 1 ? seed : undefined,
      zones: body.zones,
      manualDraft: body.manualDraft,
      courtNo: body.courtNo,
      raundNo: body.raundNo,
      pairIdx: body.pairIdx,
      delta: body.delta,
    });
    const payload = await resolveSudyamBootstrap(id, 'kotc');
    const responsePayload = {
      ...payload,
      canAdminResetKotcNext: auth.actor.role === 'admin',
      canAdminForceFinishKotcRound: auth.actor.role === 'admin',
    };
    return NextResponse.json({
      success: true,
      payload: responsePayload,
      state: result.state,
      r2SeedDraft: result.r2SeedDraft,
      manualR2Draft: result.manualR2Draft,
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      const body = error.code ? { error: error.message, code: error.code } : { error: error.message };
      return NextResponse.json(body, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.kotcnAction');
  }
}
