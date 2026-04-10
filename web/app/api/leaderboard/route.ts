import { NextRequest, NextResponse } from 'next/server';
import { fetchLeaderboard } from '@/lib/queries';
import type { RatingType, TournamentFormatFilter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = (searchParams.get('type') ?? 'M') as RatingType;
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100);
  const formatParam = searchParams.get('format') ?? 'all';
  const format: TournamentFormatFilter = ['all', 'kotc', 'dt', 'thai'].includes(formatParam)
    ? (formatParam as TournamentFormatFilter)
    : 'all';

  if (!['M', 'W', 'Mix'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  try {
    const data = await fetchLeaderboard(type, limit, format);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API] leaderboard error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
