import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { getPlayLiveSession, PlayLiveSessionError } from '@/lib/play-live-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getPlayLiveSession(actor, id));
  } catch (error) {
    if (error instanceof PlayLiveSessionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[play.live.get]', error);
    return NextResponse.json({ error: 'Не удалось открыть live-режим' }, { status: 500 });
  }
}
