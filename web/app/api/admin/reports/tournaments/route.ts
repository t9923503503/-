import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listTournaments } from '@/lib/admin-queries';
import { buildTournamentsCsv } from '@/lib/admin-reports';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const rows = await listTournaments('');
    const csv = buildTournamentsCsv(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="admin-tournaments.csv"',
      },
    });
  } catch (err) {
    return adminErrorResponse(err, 'reports.tournaments.get');
  }
}
