import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { deleteTournament, getTournamentById, setTournamentPhotoUrl } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const photoUrl = String(body.photo_url ?? '').trim();

    const updated = await setTournamentPhotoUrl(id, photoUrl);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.setPhoto',
      entityType: 'tournament',
      entityId: id,
      afterState: { photo_url: photoUrl },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.patch');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reason = String(body.reason ?? '').trim();
    if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });

    const before = await getTournamentById(id);
    const ok = await deleteTournament(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.delete',
      entityType: 'tournament',
      entityId: id,
      beforeState: before,
      reason,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.deleteById');
  }
}
