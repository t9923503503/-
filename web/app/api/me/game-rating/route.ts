import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { fetchPlayPlayerStatsForUser } from '@/lib/play-player-stats';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  try {
    return NextResponse.json(await fetchPlayPlayerStatsForUser(user.id));
  } catch (error) {
    console.error('[game-rating.get]', error);
    return NextResponse.json({ error: 'Не удалось загрузить игровой рейтинг' }, { status: 500 });
  }
}
