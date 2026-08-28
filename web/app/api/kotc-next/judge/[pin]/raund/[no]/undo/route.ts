import { NextRequest, NextResponse } from 'next/server';
import { undoKotcNextLastEvent } from '@/lib/kotc-next';
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
      commandId?: string;
      deviceId?: string;
      expectedRevision?: number;
    } | null;
    const viewerSession = getVerifiedPlayerSessionFromCookieHeader(req.headers.get('cookie') || '');
    const snapshot = await undoKotcNextLastEvent(pin, Number(no), {
      viewerUserId: viewerSession?.id ?? null,
      commandId: body?.commandId,
      deviceId: body?.deviceId,
      expectedRevision: body?.expectedRevision,
    });
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.undo');
  }
}
