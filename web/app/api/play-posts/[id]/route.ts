import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor, getPlayUserFromRequest } from '@/lib/play-auth';
import { getPlayPostDetail, isPlayPostManager, setPlayPostArchived, updatePlayPost } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = getPlayUserFromRequest(req);
  try {
    const post = await getPlayPostDetail(id, user?.id);
    if (!post) return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    const actor = getPlayActor(req);
    const canSeePrivateRoster = actor?.kind === 'admin'
      || Boolean(user && await isPlayPostManager(user.id, id));
    if (canSeePrivateRoster) return NextResponse.json(post);
    return NextResponse.json({
      ...post,
      participants: post.participants.map(({ userId, ...participant }) => {
        void userId;
        return participant;
      }),
      result: post.result ? {
        id: post.result.id,
        postId: post.result.postId,
        status: post.result.status,
        payload: post.result.payload,
        revision: post.result.revision,
        approvedAt: post.result.approvedAt,
        createdAt: post.result.createdAt,
        confirmations: post.result.confirmations.map(({ userId, comment, ...confirmation }) => {
          void userId;
          void comment;
          return confirmation;
        }),
      } : null,
    });
  } catch (error) {
    return playErrorResponse(error, 'post.get');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы управлять игрой' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    if (typeof body.archived === 'boolean') {
      const post = await setPlayPostArchived(actor, id, body.archived);
      return NextResponse.json(post);
    }
    const post = await updatePlayPost(actor, id, body);
    return NextResponse.json(post);
  } catch (error) {
    return playErrorResponse(error, 'post.patch');
  }
}
