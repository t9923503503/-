import { NextRequest, NextResponse } from 'next/server';
import { runChannelAnnounce } from '@/lib/telegram-channel';

export const dynamic = 'force-dynamic';

// Расписание: каждые 5 минут. Авторизация: Authorization: Bearer ${CRON_SECRET}
// Анонсирует в TG-канал новые игры (/partner?tab=games) и турниры (/calendar).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runChannelAnnounce());
  } catch (error) {
    console.error('[cron/channel-announce]', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
