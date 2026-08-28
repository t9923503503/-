import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addCoachAthlete, listCoachAthletes } from '@/lib/coach/service';
import { normalizeCoachAthleteInput, validateCoachAthleteInput } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const athletes = await listCoachAthletes({
      query: url.searchParams.get('q') ?? '',
      level: url.searchParams.get('level') ?? '',
      status: url.searchParams.get('status') ?? '',
    });
    return Response.json({ athletes });
  } catch (error) {
    return coachErrorResponse(error, 'athletes.list');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachAthleteInput(raw);
  const validationError = validateCoachAthleteInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const athlete = await addCoachAthlete({ ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.athlete.add',
      entityType: 'player',
      entityId: athlete.playerId,
      afterState: athlete,
      source: 'lp-coach',
    });
    return Response.json({ athlete }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'athletes.add');
  }
}
