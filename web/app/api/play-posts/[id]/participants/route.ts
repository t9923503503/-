import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import {
  addManagedPlayParticipant,
  searchManagedPlayParticipantCandidates,
} from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы управлять составом' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await searchManagedPlayParticipantCandidates(actor, id, req.nextUrl.searchParams.get('q')));
  } catch (error) {
    return playErrorResponse(error, 'participant.search');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы управлять составом' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(await addManagedPlayParticipant(actor, id, {
      userId: body.userId == null ? null : Number(body.userId),
      playerId: body.playerId == null ? null : String(body.playerId),
      guestName: body.guestName == null ? null : String(body.guestName),
    }), { status: 201 });
  } catch (error) {
    return playErrorResponse(error, 'participant.add');
  }
}
