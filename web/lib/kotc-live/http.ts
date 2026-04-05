import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { isSudyamApproved } from './auth';
import { isLiveApiError } from './service';

export function liveErrorResponse(error: unknown, tag: string): NextResponse {
  if (isLiveApiError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[KOTC LIVE] ${tag}:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export function requireLiveReadAccess(
  req: NextRequest
): { ok: true; isAdmin: boolean; actorId?: string } | { ok: false; response: NextResponse } {
  const admin = requireApiRole(req, 'viewer');
  if (admin.ok) return { ok: true, isAdmin: true, actorId: admin.actor.id };
  if (isSudyamApproved(req)) return { ok: true, isAdmin: false };
  return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
}
