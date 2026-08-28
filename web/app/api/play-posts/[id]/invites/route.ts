import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { createPlayInvite } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

// Точечное приглашение игрока (TZ §4)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы пригласить игроков' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(
      await createPlayInvite(actor, id, Number(body.toUserId ?? body.to_user_id)),
      { status: 201 }
    );
  } catch (error) {
    return playErrorResponse(error, 'invites.post');
  }
}
