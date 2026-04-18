import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { isGoNextError, runGoOperatorAction } from '@/lib/go-next';

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
    const result = await runGoOperatorAction(id, action as Parameters<typeof runGoOperatorAction>[1], {
      seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : undefined,
      groupId: String(body.groupId || ''),
      seedDraft: body.seedDraft,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.goAction');
  }
}
