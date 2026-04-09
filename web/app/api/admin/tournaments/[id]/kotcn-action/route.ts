import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';
import { isKotcNextError, runKotcNextOperatorAction } from '@/lib/kotc-next';

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

    if (
      action !== 'bootstrap_r1' &&
      action !== 'finish_r1' &&
      action !== 'preview_r2_seed' &&
      action !== 'confirm_r2_seed' &&
      action !== 'bootstrap_r2' &&
      action !== 'finish_r2'
    ) {
      return NextResponse.json({ error: 'Unsupported KOTC Next admin action' }, { status: 400 });
    }

    const result = await runKotcNextOperatorAction(id, action as Parameters<typeof runKotcNextOperatorAction>[1], {
      seed: seed >= 1 ? seed : undefined,
      zones: body.zones,
    });
    const payload = await resolveSudyamBootstrap(id, 'kotc');
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
    return adminErrorResponse(error, 'tournaments.kotcnAction');
  }
}
