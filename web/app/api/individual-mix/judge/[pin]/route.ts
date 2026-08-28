import { NextRequest, NextResponse } from 'next/server';
import { individualMixLiveErrorResponse } from '@/lib/individual-mix/live-http';
import { getIndividualMixJudgeSession } from '@/lib/individual-mix/live-service';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pin: string }> }) {
  try {
    const { pin } = await params;
    return NextResponse.json({ session: await getIndividualMixJudgeSession(pin) });
  } catch (error) {
    return individualMixLiveErrorResponse(error, 'judge.get');
  }
}
