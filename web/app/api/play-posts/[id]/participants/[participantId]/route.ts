import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { removeManagedPlayParticipant } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы управлять составом' }, { status: 401 });
  const { id, participantId } = await params;
  try {
    return NextResponse.json(await removeManagedPlayParticipant(actor, id, participantId));
  } catch (error) {
    return playErrorResponse(error, 'participant.remove');
  }
}
