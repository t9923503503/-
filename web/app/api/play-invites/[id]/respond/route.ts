import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { respondPlayInvite } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

// Ответ на приглашение: accept = вход напрямую (confirmed/reserve) (TZ §4)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = body.action === 'decline' ? 'decline' : 'accept';
    return NextResponse.json(await respondPlayInvite(user.id, id, action));
  } catch (error) {
    return playErrorResponse(error, 'invites.respond');
  }
}
