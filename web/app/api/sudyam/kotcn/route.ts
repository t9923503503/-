import { NextRequest, NextResponse } from 'next/server';
import { requireLiveReadAccess } from '@/lib/kotc-live';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';
import { isKotcNextError, runKotcNextOperatorAction } from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tournamentId = String(body.tournamentId || '').trim();
  const action = String(body.action || '').trim().toLowerCase();

  if (!tournamentId) {
    return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
  }
  if (
    action !== 'bootstrap_r1' &&
    action !== 'preview_r2_seed' &&
    action !== 'confirm_r2_seed' &&
    action !== 'bootstrap_r2'
  ) {
    return NextResponse.json({ error: 'Unsupported KOTC Next action' }, { status: 400 });
  }

  try {
    const result = await runKotcNextOperatorAction(tournamentId, action as Parameters<typeof runKotcNextOperatorAction>[1], {
      zones: body.zones,
    });
    const payload = await resolveSudyamBootstrap(tournamentId, 'kotc');
    return NextResponse.json({
      success: true,
      payload,
      state: result.state,
      r2SeedDraft: result.r2SeedDraft,
    });
  } catch (error) {
    if (isKotcNextError(error)) {
      const body = error.code ? { error: error.message, code: error.code } : { error: error.message };
      return NextResponse.json(body, { status: error.status });
    }
    console.error('[SUDYAM] kotcn.post:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
