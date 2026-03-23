import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { setTournamentPhotoUrl } from '@/lib/admin-queries';
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
