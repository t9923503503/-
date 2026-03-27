import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { createLiveSession, listActiveSessions, liveErrorResponse, requireLiveReadAccess } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;
  try {
    const sessions = await listActiveSessions();
    return NextResponse.json({ sessions, serverNow: Date.now() });
  } catch (error) {
    return liveErrorResponse(error, 'sessions.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const snapshot = await createLiveSession({
      tournamentId: String(body.tournamentId || ''),
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      nc: body.nc != null ? Number(body.nc) : undefined,
      phase: body.phase ? String(body.phase) : undefined,
      state: (body.state ?? {}) as Record<string, unknown>,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.post');
  }
}
