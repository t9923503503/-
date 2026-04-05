import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { isKotcTournamentError, listKotcRoster, replaceKotcRoster } from '@/lib/kotc-live/tournament';

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
    const roster = await listKotcRoster(tournamentId);
    return NextResponse.json({ roster, serverNow: Date.now() });
  } catch (error) {
    return errorResponse(error, 'roster.get');
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { tournamentId } = await params;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const roster = await replaceKotcRoster(tournamentId, body.roster ?? []);
    return NextResponse.json({ roster, serverNow: Date.now() });
  } catch (error) {
    return errorResponse(error, 'roster.put');
  }
}
