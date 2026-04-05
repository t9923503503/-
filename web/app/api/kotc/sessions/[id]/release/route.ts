import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { isSudyamApproved, liveErrorResponse, parseSeatTokenFromRequest, releaseSeat } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireApiRole(req, 'operator');
  const sudyamApproved = isSudyamApproved(req);
  if (!admin.ok && !sudyamApproved) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const token = parseSeatTokenFromRequest(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    if (admin.ok && !token) {
      const result = await releaseSeat(id, {
        courtIdx: body.courtIdx == null ? null : Number(body.courtIdx),
      });
      return NextResponse.json(result);
    }
    if (!token) {
      return NextResponse.json({ error: 'Seat token is required' }, { status: 401 });
    }
    const result = await releaseSeat(id, { seatToken: token });
    return NextResponse.json(result);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.release.post');
  }
}
