import { NextRequest, NextResponse } from 'next/server';
import { getThaiJudgeTournamentSnapshot, isThaiJudgeError, type ThaiRoundType } from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown): NextResponse {
  if (isThaiJudgeError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('[THAI JUDGE] tournamentSnapshot:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

function normalizeRoundType(value: string | null): ThaiRoundType | undefined {
  if (value === 'r1' || value === 'r2') return value;
  return undefined;
}

function normalizeCourtNo(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> },
) {
  try {
    const { tournamentId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const snapshot = await getThaiJudgeTournamentSnapshot(tournamentId, {
      selectedRoundType: normalizeRoundType(searchParams.get('round')),
      selectedCourtNo: normalizeCourtNo(searchParams.get('court')),
    });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}
