import { NextRequest, NextResponse } from 'next/server';
import { getGoJudgeSnapshotByPin, isGoNextError, runGoJudgeAction } from '@/lib/go-next';
import type { GoJudgeActionName } from '@/lib/go-next/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pin: string }> },
) {
  try {
    const { pin } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const matchId = String(body.matchId || '').trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });

    const expectedVersion = Number.isFinite(Number(body.expectedVersion))
      ? Number(body.expectedVersion)
      : undefined;
    const payload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};

    const snapshot = await runGoJudgeAction(pin, matchId, action as GoJudgeActionName, payload, expectedVersion);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (isGoNextError(error)) {
      if (error.status === 409) {
        const { pin } = await params;
        const snapshot = await getGoJudgeSnapshotByPin(pin).catch(() => null);
        return NextResponse.json(
          { error: 'version_conflict', snapshot },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
