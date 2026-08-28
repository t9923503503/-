import { NextRequest, NextResponse } from 'next/server';
import { recordKotcNextPairPoint } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';
import { getVerifiedPlayerSessionFromCookieHeader } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string; no: string }> },
) {
  try {
    const { pin, no } = await params;
    const body = (await req.json().catch(() => null)) as {
      pairIdx?: number;
      commandId?: string;
      deviceId?: string;
      expectedRevision?: number;
    } | null;
    const viewerSession = getVerifiedPlayerSessionFromCookieHeader(req.headers.get('cookie') || '');
    const result = await recordKotcNextPairPoint(pin, Number(no), Number(body?.pairIdx), {
      viewerUserId: viewerSession?.id ?? null,
      commandId: body?.commandId,
      deviceId: body?.deviceId,
      expectedRevision: body?.expectedRevision,
    });
    return NextResponse.json({ success: true, snapshot: result.snapshot, feedback: result.feedback });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.pairPoint');
  }
}
