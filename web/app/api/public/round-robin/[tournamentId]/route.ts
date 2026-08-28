import { NextResponse } from 'next/server';
import { getRrJudgeSnapshot, isRrError } from '@/lib/round-robin';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  try {
    const { tournamentId } = await params;
    const snapshot = await getRrJudgeSnapshot(tournamentId);
    return NextResponse.json({
      tournament: snapshot.tournament,
      initialized: snapshot.initialized,
      stage: snapshot.stage,
      config: snapshot.config,
      teams: snapshot.teams,
      groups: snapshot.groups,
      courts: snapshot.courts,
      matches: snapshot.matches,
      standings: snapshot.standings,
      playoffPreview: snapshot.playoffPreview,
      generatedAt: snapshot.generatedAt,
    });
  } catch (error) {
    if (isRrError(error)) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
