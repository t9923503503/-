import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { applyPlayLiveCommand, PlayLiveSessionError, type PlayLiveCommand } from '@/lib/play-live-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const commandId = String(body.commandId || '');
    const expectedRevision = Number(body.expectedRevision);
    const command = (body.command || {}) as PlayLiveCommand;
    return NextResponse.json(await applyPlayLiveCommand(actor, id, commandId, expectedRevision, command));
  } catch (error) {
    if (error instanceof PlayLiveSessionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[play.live.command]', error);
    return NextResponse.json({ error: 'Не удалось сохранить действие' }, { status: 500 });
  }
}
