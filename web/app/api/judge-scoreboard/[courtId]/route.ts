import { NextResponse } from 'next/server';
import {
  getJudgeScoreboardServerState,
  JudgeScoreboardConflictError,
  upsertJudgeScoreboardServerState,
} from '@/lib/judge-scoreboard/server-state';
import type { MatchState } from '@/lib/judge-scoreboard/types';

export const dynamic = 'force-dynamic';

function parseCourtId(input: string): string {
  const trimmed = String(input || '').trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return digits === '1' || digits === '2' || digits === '3' || digits === '4' ? digits : '1';
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courtId: string }> },
) {
  try {
    const { courtId } = await params;
    const normalizedCourtId = parseCourtId(courtId);
    const snapshot = await getJudgeScoreboardServerState(normalizedCourtId);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ courtId: string }> },
) {
  try {
    const { courtId } = await params;
    const normalizedCourtId = parseCourtId(courtId);
    const body = (await req.json().catch(() => null)) as
      | { state?: MatchState; senderId?: string; expectedVersion?: number }
      | null;
    if (!body?.state || typeof body.state !== 'object') {
      return NextResponse.json({ error: 'state is required' }, { status: 400 });
    }
    const snapshot = await upsertJudgeScoreboardServerState(
      normalizedCourtId,
      body.state,
      body.senderId ? String(body.senderId) : null,
      typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof JudgeScoreboardConflictError) {
      return NextResponse.json(
        {
          error: 'version_conflict',
          snapshot: error.snapshot,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
