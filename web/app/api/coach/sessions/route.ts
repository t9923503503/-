import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { createCoachTrainingSession, listCoachTrainingSessions } from '@/lib/coach/session-service';
import { normalizeCoachTrainingInput, validateCoachTrainingInput } from '@/lib/coach/session-validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ sessions: await listCoachTrainingSessions(new URL(req.url).searchParams.get('view') || 'upcoming') });
  } catch (error) {
    return coachErrorResponse(error, 'sessions.list');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachTrainingInput(raw);
  const validationError = validateCoachTrainingInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const session = await createCoachTrainingSession({ ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.session.create',
      entityType: 'coach_training_session', entityId: session.id, afterState: session, source: 'lp-coach',
    });
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'sessions.create');
  }
}
