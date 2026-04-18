import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';
import {
  bootstrapThaiJudgeState,
  confirmThaiR2Seed,
  getThaiDrawPreview,
  getThaiR2SeedDraft,
  isThaiJudgeError,
  runThaiOperatorAction,
} from '@/lib/thai-live';

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

    const ALLOWED_ACTIONS = [
      'bootstrap_r1',
      'preview_draw',
      'preview_r2_seed',
      'confirm_r2_seed',
      'reshuffle_r1',
      'finish_r1',
      'finish_r2',
    ] as const;
    if (!ALLOWED_ACTIONS.includes(action as (typeof ALLOWED_ACTIONS)[number])) {
      return NextResponse.json({ error: 'Unsupported Thai admin action' }, { status: 400 });
    }

    let preview;
    let r2SeedDraft;

    if (action === 'bootstrap_r1') {
      await bootstrapThaiJudgeState(id, { seed: seed >= 1 ? seed : undefined });
    } else if (action === 'preview_draw') {
      preview = await getThaiDrawPreview(id, seed >= 1 ? seed : undefined);
    } else if (action === 'preview_r2_seed') {
      r2SeedDraft = await getThaiR2SeedDraft(id);
    } else if (action === 'confirm_r2_seed') {
      await confirmThaiR2Seed(id, body.zones);
    } else if (action === 'reshuffle_r1' || action === 'finish_r1' || action === 'finish_r2') {
      await runThaiOperatorAction(id, action, {
        seed: seed >= 1 ? seed : undefined,
      });
    }

    const payload = await resolveSudyamBootstrap(id, 'thai');
    return NextResponse.json({
      success: true,
      payload,
      preview,
      r2SeedDraft,
    });
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.thaiAction');
  }
}
