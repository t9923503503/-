import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/admin-audit';
import { addRrSetupTeam, isRrError, listRrFrequentPlayers } from '@/lib/round-robin/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const gender = req.nextUrl.searchParams.get('gender') === 'W' ? 'W' : 'M';
    return NextResponse.json(await listRrFrequentPlayers(id, gender));
  } catch {
    return NextResponse.json({ error: 'internal_error', message: 'Не удалось загрузить частых игроков.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const player1Id = String(body.player1Id ?? '');
    const player2Id = String(body.player2Id ?? '');
    const snapshot = await addRrSetupTeam(id, player1Id, player2Id);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'round_robin.setup_team.add',
      entityType: 'tournament',
      entityId: id,
      reason: 'Организатор добавил фиксированную команду на экране Round Robin',
      afterState: { player1Id, player2Id },
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    if (isRrError(error)) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ error: 'internal_error', message: 'Не удалось добавить команду.' }, { status: 500 });
  }
}
