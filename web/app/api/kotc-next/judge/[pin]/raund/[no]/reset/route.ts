import { NextRequest, NextResponse } from 'next/server';
import { resetKotcNextRaund } from '@/lib/kotc-next';
import { kotcNextErrorResponse } from '@/lib/kotc-next-http';

export const dynamic = 'force-dynamic';
const RESET_RAUND_PASSWORD = '2525';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string; no: string }> },
) {
  try {
    const { pin, no } = await params;
    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    if (String(body.password || '') !== RESET_RAUND_PASSWORD) {
      return NextResponse.json({ error: 'Invalid reset password' }, { status: 403 });
    }
    const snapshot = await resetKotcNextRaund(pin, Number(no));
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return kotcNextErrorResponse(error, 'judge.reset');
  }
}
