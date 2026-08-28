import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import {
  deletePlayAvailability,
  getMyPlayAvailability,
  upsertPlayAvailability,
} from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

// «🟢 Я свободен»: 1 активная запись, срок жизни обязателен (TZ §1.6)
export async function GET(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  try {
    return NextResponse.json(await getMyPlayAvailability(user.id));
  } catch (error) {
    return playErrorResponse(error, 'availability.get');
  }
}

export async function PUT(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(await upsertPlayAvailability(user.id, body));
  } catch (error) {
    return playErrorResponse(error, 'availability.put');
  }
}

export async function DELETE(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  try {
    return NextResponse.json(await deletePlayAvailability(user.id));
  } catch (error) {
    return playErrorResponse(error, 'availability.delete');
  }
}
