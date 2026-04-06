import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { upsertTournamentResults } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

function normalizePlacement(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
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
    const raw = Array.isArray(body.results) ? body.results : [];
    const results = raw
      .filter((r: unknown) => r && typeof r === 'object')
      .map((r: Record<string, unknown>) => {
        const poolRaw = String(r.ratingPool ?? r.rating_pool ?? '').trim().toLowerCase();
        return {
          playerName: String(r.playerName ?? r.player_name ?? '').trim(),
          gender: String(r.gender ?? 'M') === 'W' ? ('W' as const) : ('M' as const),
          placement: normalizePlacement(r.placement),
          points: Number(r.points ?? 0),
          ratingPool: poolRaw === 'novice' ? ('novice' as const) : ('pro' as const),
        };
      })
      .filter(
        (r: { playerName: string; gender: 'M' | 'W'; placement: number; points: number }) =>
          r.playerName && r.placement > 0,
      );

    const inserted = await upsertTournamentResults(id, results);

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.setResults',
      entityType: 'tournament',
      entityId: id,
      afterState: { count: inserted },
    });
    return NextResponse.json({ ok: true, inserted });
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
