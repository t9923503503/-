import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { deleteTournament, getTournamentById, mergeTournamentSettingsKeys, setTournamentPhotoUrl } from '@/lib/admin-queries';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { isGoAdminFormat, normalizeGoAdminSettings } from '@/lib/admin-legacy-sync';
import { validateGoSetup } from '@/lib/go-next-config';

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
    if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
      const current = await getTournamentById(id);
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const settingsPatch = body.settings as Record<string, unknown>;
      if (isGoAdminFormat(current.format)) {
        const nextSettings = { ...(current.settings ?? {}), ...settingsPatch };
        const participantCount = Number(current.participantCount ?? 0);
        const normalizedGoSettings = normalizeGoAdminSettings(nextSettings, participantCount);
        const structuralError = validateGoSetup(normalizedGoSettings as never, participantCount);
        if (structuralError) {
          return NextResponse.json({ error: structuralError }, { status: 400 });
        }
      }

      const updated = await mergeTournamentSettingsKeys(id, settingsPatch);
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      await writeAuditLog({
        actorId: auth.actor.id,
        actorRole: auth.actor.role,
        action: 'tournament.patchSettings',
        entityType: 'tournament',
        entityId: id,
        beforeState: { settings: current.settings ?? {} },
        afterState: { settings: updated.settings ?? {} },
      });
      return NextResponse.json(updated);
    }

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
    if (!ok) {
      if (before) {
        return NextResponse.json(
          {
            error:
              'Delete blocked by DB policy (RLS). Ensure the server API role can DELETE from tournaments.',
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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
