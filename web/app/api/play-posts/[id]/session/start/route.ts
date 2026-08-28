import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { startPlayLiveSession, PlayLiveSessionError } from '@/lib/play-live-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await startPlayLiveSession(actor, id), { status: 201 });
  } catch (error) {
    if (error instanceof PlayLiveSessionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[play.live.start]', error);
    return NextResponse.json({ error: 'Не удалось запустить live-режим' }, { status: 500 });
  }
}
