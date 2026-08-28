import { NextRequest, NextResponse } from 'next/server';
import { getKotcNextJudgeSnapshotByPin } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';
import { getVerifiedPlayerSessionFromCookieHeader } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string }> },
) {
  try {
    const { pin } = await params;
    const rawRaundNo = req.nextUrl.searchParams.get('raund');
    const raundNo = rawRaundNo ? Number(rawRaundNo) : null;
    const viewerSession = getVerifiedPlayerSessionFromCookieHeader(req.headers.get('cookie') || '');
    const snapshot = await getKotcNextJudgeSnapshotByPin(pin, {
      raundNo: Number.isInteger(raundNo) ? raundNo : null,
      viewerUserId: viewerSession?.id ?? null,
    });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.snapshot');
  }
}
