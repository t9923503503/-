import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { updatePlayResult } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return NextResponse.json({ error: 'Передайте текущую версию счёта' }, { status: 400 });
    }
    return NextResponse.json(await updatePlayResult(actor, id, body.payload ?? body, expectedRevision));
  } catch (error) {
    return playErrorResponse(error, 'result.put');
  }
}
