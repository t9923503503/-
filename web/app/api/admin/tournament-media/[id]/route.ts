import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function hasColumn(pool: ReturnType<typeof getPool>, table: string, column: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [table, column],
  );
  return Boolean(result.rowCount && result.rowCount > 0);
}

function normalizeStatus(value: unknown): 'approved' | 'rejected' | '' {
  const status = String(value || '').trim().toLowerCase();
  return status === 'approved' || status === 'rejected' ? status : '';
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(String(id))) {
    return NextResponse.json({ error: 'Invalid media id' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const status = normalizeStatus(body.status);
    if (!status) return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });

    const pool = getPool();
    const hasStatusColumn = await hasColumn(pool, 'tournament_media', 'status');
    if (!hasStatusColumn) {
      return NextResponse.json({ error: 'Media status moderation is not available' }, { status: 409 });
    }

    const beforeResult = await pool.query(
      'SELECT status::text AS status FROM tournament_media WHERE id::text = $1 LIMIT 1',
      [id],
    );
    if (!beforeResult.rowCount) return NextResponse.json({ error: 'Media not found' }, { status: 404 });

    const updatedResult = await pool.query(
      `UPDATE tournament_media
          SET status = $1
        WHERE id::text = $2`,
      [status, id],
    );
    if (!updatedResult.rowCount) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.media.moderate',
      entityType: 'tournament_media',
      entityId: id,
      beforeState: { status: beforeResult.rows[0]?.status ?? null },
      afterState: { status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, 'admin.tournament-media.patch');
  }
}
