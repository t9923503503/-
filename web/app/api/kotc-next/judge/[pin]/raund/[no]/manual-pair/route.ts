import { NextRequest, NextResponse } from 'next/server';
import { manualRotateKotcNextPairs } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string; no: string }> },
) {
  try {
    const { pin, no } = await params;
    const body = (await req.json().catch(() => null)) as
      | { slot?: 'king' | 'challenger'; direction?: 'prev' | 'next' }
      | null;
    const snapshot = await manualRotateKotcNextPairs(
      pin,
      Number(no),
      body?.slot === 'challenger' ? 'challenger' : 'king',
      body?.direction === 'prev' ? 'prev' : 'next',
    );
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.manualPair');
  }
}
