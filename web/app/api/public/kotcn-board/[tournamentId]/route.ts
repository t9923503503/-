import { NextResponse } from 'next/server';
import { getKotcNextSpectatorPayload } from '@/lib/kotc-next/spectator';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ tournamentId: string }> },
): Promise<NextResponse> {
  try {
    const { tournamentId } = await context.params;
    const data = await getKotcNextSpectatorPayload(tournamentId);
    if (!data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    return kotcNextErrorResponse(error, 'public.kotcnBoard');
  }
}
