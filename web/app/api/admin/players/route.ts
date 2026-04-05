import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  createPlayer,
  deletePlayer,
  getPlayerById,
  listPlayers,
  updatePlayer,
} from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizePlayerInput, validatePlayerInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const q = req.nextUrl.searchParams.get('q') ?? '';
    const data = await listPlayers(q);
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'players.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizePlayerInput(body);
    const err = validatePlayerInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const created = await createPlayer(input);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'player.create',
      entityType: 'player',
      entityId: created.id,
      afterState: created,
      reason: input.reason,
    });
    return NextResponse.json(created);
  } catch (err) {
    return adminErrorResponse(err, 'players.post');
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizePlayerInput(body);
    const id = input.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const err = validatePlayerInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const before = await getPlayerById(id);
    const updated = await updatePlayer(id, input);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'player.update',
      entityType: 'player',
      entityId: id,
      beforeState: before,
      afterState: updated,
      reason: input.reason,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return adminErrorResponse(err, 'players.put');
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizePlayerInput(body);
    const id = input.id;
    const reason = input.reason;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });

    const before = await getPlayerById(id);
    const ok = await deletePlayer(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    return adminErrorResponse(err, 'players.delete');
  }
}
