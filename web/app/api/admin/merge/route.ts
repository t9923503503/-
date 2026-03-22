import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listTempPlayers, mergeTempPlayer } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeMergeInput, validateMergeInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const data = await listTempPlayers();
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'merge.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeMergeInput(body);
    const err = validateMergeInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const result = await mergeTempPlayer(input.tempId, input.realId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'player.merge',
      entityType: 'player',
      entityId: input.tempId,
      reason: input.reason,
      afterState: { tempId: input.tempId, realId: input.realId, moved: result.moved },
    });

    return NextResponse.json(result);
  } catch (err) {
    return adminErrorResponse(err, 'merge.post');
  }
}
