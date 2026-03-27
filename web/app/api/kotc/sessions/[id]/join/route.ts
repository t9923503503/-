import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { isSudyamApproved, joinSeat, liveErrorResponse } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireApiRole(req, 'viewer');
  const sudyamApproved = isSudyamApproved(req);
  if (!admin.ok && !sudyamApproved) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const requestedRole = String(body.role || '');
    const role = admin.ok && (requestedRole === 'hub' || requestedRole === 'judge')
      ? requestedRole
      : 'judge';
    const result = await joinSeat(id, {
      role: role === 'hub' ? 'hub' : 'judge',
      courtIdx: body.courtIdx == null ? null : Number(body.courtIdx),
      deviceId: String(body.deviceId || ''),
      displayName: String(body.displayName || ''),
    });
    return NextResponse.json(result);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.join.post');
  }
}
