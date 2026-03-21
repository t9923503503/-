import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listPlayers, listTournaments } from '@/lib/admin-queries';
import { buildTelegramReport } from '@/lib/admin-reports';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const [players, tournaments] = await Promise.all([listPlayers(''), listTournaments('')]);
    const text = buildTelegramReport({ players, tournaments });
    return NextResponse.json({ text });
  } catch (err) {
    return adminErrorResponse(err, 'reports.telegram.get');
  }
}
