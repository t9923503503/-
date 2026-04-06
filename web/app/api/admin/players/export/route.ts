import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { getPlayersByIds } from '@/lib/admin-queries';
import { buildPlayersCsv } from '@/lib/admin-reports';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const ids = String(req.nextUrl.searchParams.get('ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
    const rows = await getPlayersByIds(ids);
    const csv = `\uFEFF${buildPlayersCsv(rows)}`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="admin-selected-players.csv"',
      },
    });
  } catch (err) {
    return adminErrorResponse(err, 'players.export.get');
  }
}
