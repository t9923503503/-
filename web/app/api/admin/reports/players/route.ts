import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listPlayers } from '@/lib/admin-queries';
import { buildPlayersCsv } from '@/lib/admin-reports';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const rows = await listPlayers('');
    const csv = buildPlayersCsv(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="admin-players.csv"',
      },
    });
  } catch (err) {
    return adminErrorResponse(err, 'reports.players.get');
  }
}
