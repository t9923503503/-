import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { cancelPlayJoin, joinPlayPost } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы подать заявку' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await joinPlayPost(user.id, id), { status: 201 });
  } catch (error) {
    return playErrorResponse(error, 'join.post');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await cancelPlayJoin(user.id, id));
  } catch (error) {
    return playErrorResponse(error, 'join.delete');
  }
}

