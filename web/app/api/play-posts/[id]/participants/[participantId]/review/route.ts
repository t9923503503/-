import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { reviewPlayParticipant } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы управлять заявками' }, { status: 401 });
  const { id, participantId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'reject' ? 'reject' : body.action === 'accept' ? 'accept' : null;
    if (!action) return NextResponse.json({ error: 'action must be accept or reject' }, { status: 400 });
    return NextResponse.json(await reviewPlayParticipant(actor, id, participantId, action));
  } catch (error) {
    return playErrorResponse(error, 'participant.review');
  }
}
