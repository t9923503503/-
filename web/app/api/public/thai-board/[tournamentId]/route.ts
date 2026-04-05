import { NextResponse } from 'next/server';
import { getThaiSpectatorBoardPayload } from '@/lib/thai-spectator';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ tournamentId: string }> },
): Promise<NextResponse> {
  const { tournamentId } = await context.params;
  const data = await getThaiSpectatorBoardPayload(tournamentId);
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=30',
    },
  });
}
