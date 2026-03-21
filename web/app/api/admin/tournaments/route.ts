import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  createTournament,
  deleteTournament,
  getTournamentById,
  listTournaments,
  updateTournament,
} from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { normalizeTournamentInput, validateTournamentInput } from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const q = req.nextUrl.searchParams.get('q') ?? '';
    const data = await listTournaments(q);
    return NextResponse.json(data);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeTournamentInput(body);
    const err = validateTournamentInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const created = await createTournament(input);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.create',
      entityType: 'tournament',
      entityId: created.id,
      afterState: created,
      reason: input.reason,
    });
    return NextResponse.json(created);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.post');
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeTournamentInput(body);
    const id = input.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const err = validateTournamentInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const before = await getTournamentById(id);
    const updated = await updateTournament(id, input);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'tournament.update',
      entityType: 'tournament',
      entityId: id,
      beforeState: before,
      afterState: updated,
      reason: input.reason,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return adminErrorResponse(err, 'tournaments.put');
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeTournamentInput(body);
    const id = input.id;
    const reason = input.reason;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
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
    return adminErrorResponse(err, 'tournaments.delete');
  }
}
