import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { finalizeSession, liveErrorResponse } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const result = await finalizeSession(id, auth.actor.id);
    return NextResponse.json(result);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.finalize.post');
  }
}
