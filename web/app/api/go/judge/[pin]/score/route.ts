import { NextRequest, NextResponse } from 'next/server';
import { isGoNextError, submitGoMatchScore, walkoverMatch } from '@/lib/go-next';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string }> },
) {
  try {
    const { pin } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const matchId = String(body.matchId || '').trim();
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const walkover = String(body.walkover || '').trim().toLowerCase();
    if (walkover === 'team_a' || walkover === 'team_b' || walkover === 'mutual') {
      const snapshot = await walkoverMatch(pin, matchId, walkover);
      return NextResponse.json(snapshot);
    }

    const snapshot = await submitGoMatchScore(pin, matchId, {
      scoreA: Array.isArray(body.scoreA) ? (body.scoreA as number[]) : [],
      scoreB: Array.isArray(body.scoreB) ? (body.scoreB as number[]) : [],
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
