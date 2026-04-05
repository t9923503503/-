import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getThaiSchedulePrintPayload, isThaiJudgeError } from '@/lib/thai-live/service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const seedRaw = req.nextUrl.searchParams.get('seed');
    const previewSeed = seedRaw ? Math.trunc(Number(seedRaw) || 0) : undefined;
    const payload = await getThaiSchedulePrintPayload(id, {
      previewSeed: previewSeed && previewSeed >= 1 ? previewSeed : undefined,
    });
    return NextResponse.json({ success: true, payload });
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.schedulePrint');
  }
}
