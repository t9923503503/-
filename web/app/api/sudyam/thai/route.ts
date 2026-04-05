import { NextRequest, NextResponse } from 'next/server';
import { requireLiveReadAccess } from '@/lib/kotc-live';
import {
  confirmThaiR2Seed,
  getThaiDrawPreview,
  getThaiR2SeedDraft,
  isThaiJudgeError,
  runThaiOperatorAction,
} from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tournamentId = String(body.tournamentId || '').trim();
  const action = String(body.action || '').trim().toLowerCase();
  const seed = Math.trunc(Number(body.seed) || 0);

  if (!tournamentId) {
    return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
  }
  if (
    action !== 'preview_draw' &&
    action !== 'reshuffle_r1' &&
    action !== 'finish_r1' &&
    action !== 'preview_r2_seed' &&
    action !== 'confirm_r2_seed' &&
    action !== 'seed_r2' &&
    action !== 'finish_r2'
  ) {
    return NextResponse.json({ error: 'Unsupported Thai operator action' }, { status: 400 });
  }

  try {
    if (action === 'preview_draw') {
      const preview = await getThaiDrawPreview(tournamentId, seed >= 1 ? seed : undefined);
      return NextResponse.json({ success: true, preview });
    }
    if (action === 'preview_r2_seed') {
      const draft = await getThaiR2SeedDraft(tournamentId);
      return NextResponse.json({ success: true, r2SeedDraft: draft });
    }
    if (action === 'confirm_r2_seed') {
      const result = await confirmThaiR2Seed(tournamentId, body.zones);
      return NextResponse.json(result);
    }

    const result = await runThaiOperatorAction(tournamentId, action, {
      seed: seed >= 1 ? seed : undefined,
      zones: body.zones,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[SUDYAM] thai.post:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
