import { NextRequest, NextResponse } from 'next/server';
import { getKotcNextJudgeSnapshotByPin } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pin: string }> },
) {
  try {
    const { pin } = await params;
    const snapshot = await getKotcNextJudgeSnapshotByPin(pin);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.snapshot');
  }
}
