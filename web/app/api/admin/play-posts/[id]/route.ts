import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireApiRole } from '@/lib/admin-auth';
import { deleteAdminUnfilledPlayPost } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Укажите причину удаления (минимум 5 символов)' }, { status: 400 });
  }

  try {
    const deleted = await deleteAdminUnfilledPlayPost(id);
    try {
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'play_post.delete_unfilled',
        entityType: 'play_post',
        entityId: id,
        reason,
        beforeState: deleted,
      });
    } catch (auditError) {
      console.error('[admin/play-posts/delete.audit]', auditError);
    }
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return playErrorResponse(error, 'admin.play-posts.delete');
  }
}
