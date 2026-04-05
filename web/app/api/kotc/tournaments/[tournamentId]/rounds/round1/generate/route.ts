import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { generateKotcRound1, isKotcTournamentError } from '@/lib/kotc-live/tournament';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown, tag: string): NextResponse {
  if (isKotcTournamentError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[KOTC TOURNAMENT] ${tag}:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { tournamentId } = await params;
    const result = await generateKotcRound1(tournamentId);
    return NextResponse.json({ ...result, serverNow: Date.now() });
  } catch (error) {
    return errorResponse(error, 'round1.generate.post');
  }
}
