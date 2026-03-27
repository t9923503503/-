import { NextRequest, NextResponse } from 'next/server';
import { listActiveSessions, liveErrorResponse, requireLiveReadAccess } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;
  try {
    const sessions = await listActiveSessions();
    return NextResponse.json({ sessions, serverNow: Date.now() });
  } catch (error) {
    return liveErrorResponse(error, 'sessions.active.get');
  }
}
