import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachAthleteDetail, updateCoachAthlete } from '@/lib/coach/service';
import { isCoachUuid, normalizeCoachAthleteInput, validateCoachAthleteInput } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID ученика' }, { status: 400 });
  try {
    const athlete = await getCoachAthleteDetail(id);
    if (!athlete) return Response.json({ error: 'Ученик не найден' }, { status: 404 });
    return Response.json({ athlete });
  } catch (error) {
    return coachErrorResponse(error, 'athletes.get');
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID ученика' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachAthleteInput({ ...raw, playerId: id });
  const validationError = validateCoachAthleteInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const before = await getCoachAthleteDetail(id);
    if (!before) return Response.json({ error: 'Ученик не найден' }, { status: 404 });
    const athlete = await updateCoachAthlete(input);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.athlete.update',
      entityType: 'player',
      entityId: id,
      beforeState: before,
      afterState: athlete,
      source: 'lp-coach',
    });
    return Response.json({ athlete });
  } catch (error) {
    return coachErrorResponse(error, 'athletes.update');
  }
}
