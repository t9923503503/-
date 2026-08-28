import { NextRequest, NextResponse } from 'next/server';
import { getPlayActor } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { resolvePlayResultCorrectionRequest } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const actor = getPlayActor(req);
  if (!actor) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id, requestId } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const decision = body.decision === 'accept' || body.decision === 'accepted'
      ? 'accepted'
      : body.decision === 'reject' || body.decision === 'rejected'
        ? 'rejected'
        : null;
    if (!decision) return NextResponse.json({ error: 'Выберите: принять или отклонить' }, { status: 400 });
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return NextResponse.json({ error: 'Передайте текущую версию счёта' }, { status: 400 });
    }
    return NextResponse.json(await resolvePlayResultCorrectionRequest(actor, id, requestId, {
      decision,
      comment: String(body.comment ?? ''),
      expectedRevision,
    }));
  } catch (error) {
    return playErrorResponse(error, 'result.correction.resolve');
  }
}
