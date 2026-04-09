import { NextRequest, NextResponse } from 'next/server';
import { undoKotcNextLastEvent } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ pin: string; no: string }> },
) {
  try {
    const { pin, no } = await params;
    const snapshot = await undoKotcNextLastEvent(pin, Number(no));
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.undo');
  }
}
