import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { listPlayFeed } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

// Зоны ленты /play (TZ-production-play-v3 §5). Гостю — read-only без персонализации.
export async function GET(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  try {
    return NextResponse.json(await listPlayFeed(user?.id ?? null));
  } catch (error) {
    return playErrorResponse(error, 'feed.get');
  }
}
