import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor, getPlayUserFromRequest } from '@/lib/play-auth';
import { normalizePlayLevel, normalizePlayPostInput, validatePlayPostInput } from '@/lib/play-core';
import { createPlayPosts, listPlayPosts } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getPlayUserFromRequest(req);
  const params = req.nextUrl.searchParams;
  const level = normalizePlayLevel(params.get('level')) ?? undefined;
  try {
    const posts = await listPlayPosts({
      kind: params.get('kind') === 'training' ? 'training' : params.get('kind') === 'game' ? 'game' : undefined,
      dateFrom: params.get('dateFrom') || undefined,
      dateTo: params.get('dateTo') || undefined,
      venueId: params.get('venueId') || undefined,
      level,
      gender: params.get('gender') === 'M' ? 'M' : params.get('gender') === 'W' ? 'W' : undefined,
      availableOnly: params.get('availableOnly') === 'true',
      viewerUserId: user?.id,
    });
    return NextResponse.json(posts);
  } catch (error) {
    return playErrorResponse(error, 'posts.get');
  }
}

export async function POST(req: NextRequest) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите или зарегистрируйтесь, чтобы создать игру' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizePlayPostInput(body);
    const error = validatePlayPostInput(input);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const posts = await createPlayPosts(actor, input);
    return NextResponse.json({ posts }, { status: 201 });
  } catch (error) {
    return playErrorResponse(error, 'posts.post');
  }
}
