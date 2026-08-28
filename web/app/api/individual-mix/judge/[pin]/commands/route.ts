import { NextRequest, NextResponse } from 'next/server';
import { individualMixLiveErrorResponse } from '@/lib/individual-mix/live-http';
import {
  applyIndividualMixJudgeCommand,
  type IndividualMixLiveCommandEnvelope,
} from '@/lib/individual-mix/live-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ pin: string }> }) {
  try {
    const envelope = await req.json() as IndividualMixLiveCommandEnvelope;
    if (!['record_score', 'undo_last'].includes(String(envelope.command?.type || ''))) {
      return NextResponse.json({ error: 'Судье доступны только ввод и отмена последнего результата своего корта.', code: 'judge_command_forbidden' }, { status: 403 });
    }
    const { pin } = await params;
    return NextResponse.json({ session: await applyIndividualMixJudgeCommand(pin, envelope) });
  } catch (error) {
    return individualMixLiveErrorResponse(error, 'judge.command');
  }
}
