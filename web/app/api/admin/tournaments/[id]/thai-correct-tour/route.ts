import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { adminCorrectThaiTourScores, isThaiJudgeError } from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

function parseMatches(body: Record<string, unknown>): Array<{ matchId: string; team1Score: number; team2Score: number }> {
  const raw = body.matches;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ matchId: string; team1Score: number; team2Score: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const matchId = String(rec.matchId || '').trim();
    const team1Score = Math.trunc(Number(rec.team1Score));
    const team2Score = Math.trunc(Number(rec.team2Score));
    if (!matchId) continue;
    out.push({ matchId, team1Score, team2Score });
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tourId = String(body.tourId || '').trim();
    const reason = String(body.reason ?? '').trim();
    if (!tourId) {
      return NextResponse.json({ error: 'tourId is required' }, { status: 400 });
    }
    if (reason.length < 4) {
      return NextResponse.json({ error: 'Укажите причину исправления (не короче 4 символов)' }, { status: 400 });
    }

    const matches = parseMatches(body);
    const correction = await adminCorrectThaiTourScores(id, { tourId, matches });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.thaiCorrectTour',
      entityType: 'tournament',
      entityId: id,
      reason,
      beforeState: {
        tourId: correction.tourId,
        tourNo: correction.tourNo,
        courtLabel: correction.courtLabel,
        roundType: correction.roundType,
        matches: correction.beforeMatches,
      },
      afterState: {
        tourId: correction.tourId,
        tourNo: correction.tourNo,
        courtLabel: correction.courtLabel,
        roundType: correction.roundType,
        matches: correction.afterMatches,
      },
    });

    return NextResponse.json({ ok: true, correction });
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.thaiCorrectTour');
  }
}
