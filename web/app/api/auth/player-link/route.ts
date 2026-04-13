import { NextRequest, NextResponse } from 'next/server';
import { getPlayerTokenFromCookieHeader, verifyPlayerToken } from '@/lib/player-auth';
import {
  bindPlayerToAccount,
  findBoundPlayer,
  findExplicitLinkedPlayer,
  getAccountFullName,
  resolvePlayerForAccount,
  searchPlayersForLink,
  unlinkPlayerFromAccount,
} from '@/lib/profile-link';

export const dynamic = 'force-dynamic';

function getAuthedUser(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  if (!token) return null;
  return verifyPlayerToken(token);
}

async function buildPayload(userId: number, query = '') {
  const [fullName, linkedPlayer, resolvedPlayer, searchResults] = await Promise.all([
    getAccountFullName(userId),
    findBoundPlayer(userId),
    resolvePlayerForAccount(userId),
    query ? searchPlayersForLink(query, 8) : Promise.resolve([]),
  ]);

  return {
    full_name: fullName,
    linked_player: linkedPlayer,
    resolved_player: resolvedPlayer,
    search_results: searchResults,
  };
}

export async function GET(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  const query = String(req.nextUrl.searchParams.get('q') || '').trim();
  const payload = await buildPayload(auth.id, query);
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  let body: { playerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const playerId = String(body.playerId || '').trim();
  const result = await bindPlayerToAccount(auth.id, playerId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const payload = await buildPayload(auth.id);
  if (!payload.linked_player && result.linkedPlayer) {
    payload.linked_player = result.linkedPlayer;
  }

  return NextResponse.json({
    ok: true,
    message: 'Карточка игрока привязана к аккаунту.',
    ...payload,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  await unlinkPlayerFromAccount(auth.id);
  const payload = await buildPayload(auth.id);

  return NextResponse.json({
    ok: true,
    message: 'Привязка снята.',
    ...payload,
  });
}
