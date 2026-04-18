import { NextResponse } from 'next/server';
import { getGoSpectatorPayload, isGoNextError } from '@/lib/go-next';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tournamentId: string }> },
) {
  try {
    const { tournamentId } = await params;
    const payload = await getGoSpectatorPayload(tournamentId);
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
