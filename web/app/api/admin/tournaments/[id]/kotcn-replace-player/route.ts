import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';
import { isKotcNextError, replaceKotcNextTournamentPlayer } from '@/lib/kotc-next';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const oldPlayerId = String(body.oldPlayerId || '').trim();
    const newPlayerId = String(body.newPlayerId || '').trim();
    const reason = String(body.reason || '').trim();

    if (!oldPlayerId) return NextResponse.json({ error: 'oldPlayerId is required' }, { status: 400 });
    if (!newPlayerId) return NextResponse.json({ error: 'newPlayerId is required' }, { status: 400 });
    if (reason.length < 4) {
      return NextResponse.json({ error: 'Укажите причину замены не короче 4 символов' }, { status: 400 });
    }

    const replacement = await replaceKotcNextTournamentPlayer(id, { oldPlayerId, newPlayerId });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.kotcNextReplacePlayer',
      entityType: 'tournament',
      entityId: id,
      reason,
      beforeState: {
        playerId: replacement.oldPlayerId,
        playerName: replacement.oldPlayerName,
        gender: replacement.oldGender,
      },
      afterState: {
        playerId: replacement.newPlayerId,
        playerName: replacement.newPlayerName,
        gender: replacement.newGender,
        pairsTouched: replacement.pairsTouched,
        roundStatsTouched: replacement.roundStatsTouched,
        resultsTouched: replacement.resultsTouched,
      },
    });

    const payload = await resolveSudyamBootstrap(id, 'kotc');
    return NextResponse.json({ ok: true, replacement, payload });
  } catch (error) {
    if (isKotcNextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return adminErrorResponse(error, 'tournaments.kotcNextReplacePlayer');
  }
}
