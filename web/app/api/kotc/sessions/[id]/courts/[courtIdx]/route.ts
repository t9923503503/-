import { NextRequest, NextResponse } from 'next/server';
import { getCourtSnapshot, liveErrorResponse, requireLiveReadAccess } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; courtIdx: string }> }
) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;
  try {
    const { id, courtIdx } = await params;
    const state = await getCourtSnapshot(id, Number(courtIdx));
    return NextResponse.json(state);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.court.get');
  }
}
