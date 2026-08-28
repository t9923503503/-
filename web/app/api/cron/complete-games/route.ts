import { NextRequest, NextResponse } from 'next/server';
import { runCompleteGames } from '@/lib/play-cron';

export const dynamic = 'force-dynamic';

// Расписание: каждые 15 минут. Авторизация: Authorization: Bearer ${CRON_SECRET}
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCompleteGames());
  } catch (error) {
    console.error('[cron/complete-games]', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
