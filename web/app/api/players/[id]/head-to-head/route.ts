import { NextRequest, NextResponse } from 'next/server';

import { fetchPlayer } from '@/lib/queries';
import { fetchHeadToHeadCandidates, fetchHeadToHeadDetails } from '@/lib/player-head-to-head';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const otherId = request.nextUrl.searchParams.get('otherId')?.trim() ?? '';

  try {
    const player = await fetchPlayer(id);
    if (!player) return NextResponse.json({ error: 'Игрок не найден' }, { status: 404 });

    if (otherId) {
      const other = await fetchPlayer(otherId);
      if (!other) return NextResponse.json({ error: 'Второй игрок не найден' }, { status: 404 });
      return NextResponse.json(await fetchHeadToHeadDetails(id, otherId));
    }

    const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? 12);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 12;
    const sort = request.nextUrl.searchParams.get('sort') ?? 'total';
    const query = request.nextUrl.searchParams.get('q') ?? '';
    return NextResponse.json(await fetchHeadToHeadCandidates({ playerId: id, query, limit, sort }));
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PLAYER_ID') {
      return NextResponse.json({ error: 'Некорректный идентификатор игрока' }, { status: 400 });
    }
    console.error('[API] player head-to-head error:', error);
    return NextResponse.json({ error: 'Не удалось загрузить личные встречи' }, { status: 500 });
  }
}
