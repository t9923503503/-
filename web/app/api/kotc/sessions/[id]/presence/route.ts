import { NextRequest, NextResponse } from 'next/server';
import { getPresence, liveErrorResponse, requireLiveReadAccess } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;
  try {
    const { id } = await params;
    const presence = await getPresence(id);
    return NextResponse.json({ seats: presence, serverNow: Date.now() });
  } catch (error) {
    return liveErrorResponse(error, 'sessions.presence.get');
  }
}
