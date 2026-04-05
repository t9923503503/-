import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getThaiDrawPreview, isThaiJudgeError } from '@/lib/thai-live';

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
    const seed = Math.trunc(Number(body.seed) || 0);
    const preview = await getThaiDrawPreview(id, seed >= 1 ? seed : undefined);
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.previewDraw');
  }
}
