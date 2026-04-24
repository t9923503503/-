import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { getTournamentById, updateTournament, upsertTournamentResults } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { sanitizeArchiveRows, validateArchiveRows } from '@/lib/archive-results';
import { normalizeTournamentRatingLevel } from '@/lib/rating-points';

export const dynamic = 'force-dynamic';

function normalizePlacement(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeRatingPts(value: unknown): number | undefined {
  const parsed = Number(value ?? Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

function normalizeTournamentLevel(value: unknown): 'hard' | 'advance' | 'medium' | 'lite' {
  return normalizeTournamentRatingLevel(String(value ?? ''));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const current = await getTournamentById(id);
    if (!current) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    const level =
      body.level == null ? normalizeTournamentLevel(current.level) : normalizeTournamentLevel(body.level);
    const raw = Array.isArray(body.results) ? body.results : [];
    const results = sanitizeArchiveRows(
      raw.filter((r: unknown) => r && typeof r === 'object') as Array<Record<string, unknown>>,
      level,
    ).filter((row) => {
      return (
        row.playerName.trim() ||
        row.placement > 0 ||
        row.points > 0 ||
        row.ratingPool !== 'pro' ||
        row.ratingLevel !== level ||
        typeof row.ratingPts === 'number'
      );
    });

    const validation = validateArchiveRows(results);
    if (validation.errors.length) {
      return NextResponse.json(
        { error: 'Validation failed', validation },
        { status: 422 },
      );
    }

    if (normalizeTournamentLevel(current.level) !== level) {
      await updateTournament(id, { ...current, level });
    }

    const inserted = await upsertTournamentResults(id, results);

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.setResults',
      entityType: 'tournament',
      entityId: id,
      afterState: { count: inserted, level, warnings: validation.warnings },
    });
    return NextResponse.json({ ok: true, inserted, validation });
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.results.post');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    await upsertTournamentResults(id, []);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.clearResults',
      entityType: 'tournament',
      entityId: id,
    });
    return NextResponse.json({ ok: true, inserted: 0 });
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.results.delete');
  }
}
