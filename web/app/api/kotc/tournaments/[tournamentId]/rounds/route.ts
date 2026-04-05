import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { isKotcTournamentError, listKotcRounds } from '@/lib/kotc-live/tournament';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown, tag: string): NextResponse {
  if (isKotcTournamentError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[KOTC TOURNAMENT] ${tag}:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const { tournamentId } = await params;
    const rounds = await listKotcRounds(tournamentId);
    return NextResponse.json({ rounds, serverNow: Date.now() });
  } catch (error) {
    return errorResponse(error, 'rounds.get');
  }
}
