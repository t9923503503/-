import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { adminConfirmThaiTourScores, isThaiJudgeError } from '@/lib/thai-live';

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
    if (!tourId) {
      return NextResponse.json({ error: 'tourId is required' }, { status: 400 });
    }

    const matches = parseMatches(body);
    const confirmation = await adminConfirmThaiTourScores(id, { tourId, matches });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.thaiAdminConfirmTour',
      entityType: 'tournament',
      entityId: id,
      reason: 'operator entered Thai tour score from admin panel',
      beforeState: {
        tourId: confirmation.tourId,
        tourNo: confirmation.tourNo,
        courtLabel: confirmation.courtLabel,
        roundType: confirmation.roundType,
        matches: confirmation.beforeMatches,
      },
      afterState: {
        tourId: confirmation.tourId,
        tourNo: confirmation.tourNo,
        courtLabel: confirmation.courtLabel,
        roundType: confirmation.roundType,
        matches: confirmation.afterMatches,
        nextTourNumber: confirmation.nextTourNumber ?? null,
        courtFinished: confirmation.courtFinished,
      },
    });

    return NextResponse.json({ ok: true, confirmation });
  } catch (error) {
    if (isThaiJudgeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.thaiConfirmTour');
  }
}
