import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { deletePlayer, getPlayerById } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

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

    const before = await getPlayerById(id);
    const ok = await deletePlayer(id);
    if (!ok) {
      if (before) {
        return NextResponse.json(
          {
            error:
              'Delete blocked by DB policy (RLS). Ensure the DATABASE_URL role can DELETE from players (e.g. BYPASSRLS or a DELETE policy).',
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'player.delete',
      entityType: 'player',
      entityId: id,
      beforeState: before,
      reason,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err, 'players.deleteById');
  }
}
