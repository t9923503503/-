import { NextRequest, NextResponse } from 'next/server';
import { fetchPlayer } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const player = await fetchPlayer(id);
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    return NextResponse.json(player);
  } catch (err) {
    console.error('[API] player error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
