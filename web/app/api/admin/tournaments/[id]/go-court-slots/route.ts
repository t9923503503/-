import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPool } from '@/lib/db';
import { loadCourtsWithSlots, loadTournamentPlayers } from '@/lib/go-next/court-slots';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      const courts = await loadCourtsWithSlots(client, id);
      const players = await loadTournamentPlayers(client, id);
      return NextResponse.json({ courts, players });
    } finally {
      client.release();
    }
  } catch (error) {
    return adminErrorResponse(error, 'tournaments.goCourtSlots.get');
  }
}
