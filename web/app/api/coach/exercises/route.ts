import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { createCoachExercise, listCoachExercises } from '@/lib/coach/exercise-service';
import { normalizeCoachExerciseFilters, normalizeCoachExerciseInput, validateCoachExerciseInput } from '@/lib/coach/exercise-validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    const exercises = await listCoachExercises(normalizeCoachExerciseFilters(new URL(req.url).searchParams));
    return Response.json({ exercises });
  } catch (error) {
    return coachErrorResponse(error, 'exercises.list');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachExerciseInput(raw);
  const validationError = validateCoachExerciseInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const exercise = await createCoachExercise({ ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.exercise.create',
      entityType: 'coach_exercise',
      entityId: exercise.id,
      afterState: exercise,
      source: 'lp-coach',
    });
    return Response.json({ exercise }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'exercises.create');
  }
}
