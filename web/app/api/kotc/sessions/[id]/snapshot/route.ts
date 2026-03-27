import { NextRequest, NextResponse } from 'next/server';
import { getSessionSnapshot, liveErrorResponse, requireLiveReadAccess } from '@/lib/kotc-live';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;
  try {
    const { id } = await params;
    const scopeParam = String(req.nextUrl.searchParams.get('scope') || 'full');
    const scope = scopeParam === 'global' ? 'global' : 'full';
    const snapshot = await getSessionSnapshot(id, scope);
    return NextResponse.json(snapshot);
  } catch (error) {
    return liveErrorResponse(error, 'sessions.snapshot.get');
  }
}
