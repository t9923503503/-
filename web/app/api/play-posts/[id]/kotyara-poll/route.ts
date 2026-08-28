import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { importManagedPlayKotyaraPoll, listManagedPlayKotyaraPolls } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт организатора' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await listManagedPlayKotyaraPolls(actor, id));
  } catch (error) {
    return playErrorResponse(error, 'kotyara-poll.list');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт организатора' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(await importManagedPlayKotyaraPoll(
      actor,
      id,
      String(body.sessionId ?? ''),
      body.includeMaybe === true,
    ), { status: 201 });
  } catch (error) {
    return playErrorResponse(error, 'kotyara-poll.import');
  }
}
