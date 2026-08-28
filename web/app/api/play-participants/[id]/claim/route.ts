import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { claimPlayGuest, PlayGuestClaimError } from '@/lib/play-guest-claim';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Сначала войдите или зарегистрируйтесь' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(await claimPlayGuest(user.id, id, String(body.token || '')));
  } catch (error) {
    if (error instanceof PlayGuestClaimError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[play.guest-claim.claim]', error);
    return NextResponse.json({ error: 'Не удалось привязать гостя' }, { status: 500 });
  }
}
