import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { massPlayInvites } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

// «Пригласить всех подходящих»: 1 раз на игру, ≤ 20 получателей (TZ §4)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы пригласить игроков' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await massPlayInvites(actor, id), { status: 201 });
  } catch (error) {
    return playErrorResponse(error, 'invites.mass');
  }
}
