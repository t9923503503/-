import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Прямая привязка Telegram отключена. Используйте одноразовую ссылку из настроек профиля.',
      code: 'telegram_direct_link_disabled',
    },
    { status: 410 }
  );
}
