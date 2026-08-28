import { NextRequest, NextResponse } from 'next/server';
import { runPlayReminders } from '@/lib/play-cron';

export const dynamic = 'force-dynamic';

// Расписание: каждые 5 минут. Авторизация: Authorization: Bearer ${CRON_SECRET}
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runPlayReminders());
  } catch (error) {
    console.error('[cron/play-reminders]', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
