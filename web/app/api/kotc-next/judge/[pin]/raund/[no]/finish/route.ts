import { NextRequest, NextResponse } from 'next/server';
import { finishKotcNextRaund } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string; no: string }> },
) {
  try {
    const { pin, no } = await params;
    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    const snapshot = await finishKotcNextRaund(pin, Number(no), String(body.password || ''));
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.finish');
  }
}
