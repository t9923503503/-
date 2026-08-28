import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { submitPlayResult } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

// Внесение результата игры организатором (TZ §4)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Войдите в аккаунт, чтобы внести результат' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const expectedRevision = body.expectedRevision == null
      ? undefined
      : Number(body.expectedRevision);
    if (expectedRevision != null && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
      return NextResponse.json({ error: 'Передайте корректную версию счёта' }, { status: 400 });
    }
    return NextResponse.json(
      await submitPlayResult(actor, id, body.payload ?? body, { expectedRevision }),
      { status: 201 },
    );
  } catch (error) {
    return playErrorResponse(error, 'result.post');
  }
}
