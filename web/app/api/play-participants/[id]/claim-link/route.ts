import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { createPlayGuestClaimLink, PlayGuestClaimError } from '@/lib/play-guest-claim';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await createPlayGuestClaimLink(actor, id, req.nextUrl.origin), { status: 201 });
  } catch (error) {
    if (error instanceof PlayGuestClaimError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[play.guest-claim.link]', error);
    return NextResponse.json({ error: 'Не удалось создать ссылку' }, { status: 500 });
  }
}
