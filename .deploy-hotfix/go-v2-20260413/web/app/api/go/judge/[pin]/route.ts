import { NextResponse } from 'next/server';
import { getGoJudgeSnapshotByPin, isGoNextError } from '@/lib/go-next';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pin: string }> },
) {
  try {
    const { pin } = await params;
    const snapshot = await getGoJudgeSnapshotByPin(pin);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (isGoNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
