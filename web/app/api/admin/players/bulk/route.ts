import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { deletePlayer, getPlayersByIds, updatePlayer } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeBulkPlayerInput, validateBulkPlayerInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const input = normalizeBulkPlayerInput(body);
  const err = validateBulkPlayerInput(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const auth = requireApiRole(req, input.action === 'delete' ? 'admin' : 'operator');
  if (!auth.ok) return auth.response;

  try {
    const before = await getPlayersByIds(input.ids);
    const beforeById = new Map(before.map((player) => [player.id, player]));
    const updated = [];
    let deleted = 0;

    if (input.action === 'delete') {
      for (const id of input.ids) {
        if (await deletePlayer(id)) deleted += 1;
      }
      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'player.bulk_delete',
        entityType: 'player',
        entityId: input.ids.join(','),
        beforeState: before,
        afterState: { deleted },
        reason: input.reason,
      });
      return NextResponse.json({ ok: true, deleted });
    }

    for (const id of input.ids) {
      const current = beforeById.get(id);
      if (!current) continue;
      const next = await updatePlayer(id, {
        ...current,
        ...(input.action === 'status' ? { status: input.status as typeof current.status } : {}),
        ...(input.action === 'level' ? { skillLevel: input.skillLevel as NonNullable<typeof current.skillLevel> } : {}),
      });
      if (next) updated.push(next);
    }

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: input.action === 'status' ? 'player.bulk_status' : 'player.bulk_level',
      entityType: 'player',
      entityId: input.ids.join(','),
      beforeState: before,
      afterState: updated,
      reason: input.reason || 'bulk update from admin players',
    });
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return adminErrorResponse(err, 'players.bulk.patch');
  }
}
