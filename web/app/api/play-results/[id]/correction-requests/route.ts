import { NextRequest, NextResponse } from 'next/server';
import { getPlayUserFromRequest } from '@/lib/play-auth';
import { playErrorResponse } from '@/lib/play-http';
import { createPlayResultCorrectionRequest } from '@/lib/play-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getPlayUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const expectedRevision = body.expectedRevision == null ? undefined : Number(body.expectedRevision);
    if (expectedRevision != null && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) {
      return NextResponse.json({ error: 'Передайте текущую версию счёта' }, { status: 400 });
    }
    return NextResponse.json(
      await createPlayResultCorrectionRequest(user.id, id, String(body.comment ?? ''), expectedRevision),
      { status: 201 },
    );
  } catch (error) {
    return playErrorResponse(error, 'result.correction.create');
  }
}
