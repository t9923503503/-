import { NextRequest, NextResponse } from 'next/server';
import { fetchTournaments } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);
  const status = searchParams.get('status') ?? undefined;

  try {
    const data = await fetchTournaments(limit, status);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API] tournaments error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
