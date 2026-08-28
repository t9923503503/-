import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { createPlayCoach, createPlayVenue, listPlayResources } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await listPlayResources());
  } catch (error) {
    return playErrorResponse(error, 'resources.get');
  }
}

export async function POST(req: NextRequest) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите или зарегистрируйтесь, чтобы продолжить' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    if (body.resource === 'venue') return NextResponse.json(await createPlayVenue(actor, body), { status: 201 });
    if (body.resource === 'coach') return NextResponse.json(await createPlayCoach(actor, body), { status: 201 });
    return NextResponse.json({ error: 'Неизвестный тип справочника' }, { status: 400 });
  } catch (error) {
    return playErrorResponse(error, 'resources.post');
  }
}
