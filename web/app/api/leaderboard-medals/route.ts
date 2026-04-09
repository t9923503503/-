import { NextRequest, NextResponse } from 'next/server';
import { fetchMedalsLeaderboard } from '@/lib/queries';
import type { RatingType, TournamentFormatFilter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = (searchParams.get('type') ?? 'M') as RatingType;
  const parsedLimit = Number(searchParams.get('limit') ?? 100);
  const limit = Math.max(1, Math.min(100, Math.trunc(Number.isFinite(parsedLimit) ? parsedLimit : 100)));
  const formatParam = searchParams.get('format') ?? 'all';
  const format: TournamentFormatFilter = ['all', 'kotc', 'dt'].includes(formatParam)
    ? (formatParam as TournamentFormatFilter)
    : 'all';

  if (!['M', 'W', 'Mix'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  try {
    const data = await fetchMedalsLeaderboard(type, limit, format);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API] leaderboard medals error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
