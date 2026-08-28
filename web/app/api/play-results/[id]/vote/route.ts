import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';

export const dynamic = 'force-dynamic';

// Подтверждение/оспаривание результата участником (TZ §4)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  await params;
  return NextResponse.json(
    { error: 'Теперь результат утверждает организатор. После утверждения участник может отправить запрос на исправление.' },
    { status: 410 },
  );
}
