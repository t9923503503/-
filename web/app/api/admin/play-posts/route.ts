import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listAdminUnfilledPlayPosts } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await listAdminUnfilledPlayPosts());
  } catch (error) {
    return playErrorResponse(error, 'admin.play-posts.get');
  }
}
