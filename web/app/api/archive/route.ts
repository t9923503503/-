import { NextResponse } from 'next/server';
import { getArchiveTournaments } from '@/lib/admin-queries';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getArchiveTournaments();
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'archive.get');
  }
}
