import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachExercise, updateCoachExercise } from '@/lib/coach/exercise-service';
import { normalizeCoachExerciseInput, validateCoachExerciseInput } from '@/lib/coach/exercise-validators';
import { isCoachUuid } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID упражнения' }, { status: 400 });
  try {
    const exercise = await getCoachExercise(id);
    if (!exercise) return Response.json({ error: 'Упражнение не найдено' }, { status: 404 });
    return Response.json({ exercise });
  } catch (error) {
    return coachErrorResponse(error, 'exercises.get');
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID упражнения' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachExerciseInput(raw);
  const validationError = validateCoachExerciseInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const before = await getCoachExercise(id);
    if (!before) return Response.json({ error: 'Упражнение не найдено' }, { status: 404 });
    const exercise = await updateCoachExercise(id, { ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: exercise.archived ? 'coach.exercise.archive' : 'coach.exercise.update',
      entityType: 'coach_exercise',
      entityId: exercise.id,
      beforeState: before,
      afterState: exercise,
      source: 'lp-coach',
    });
    return Response.json({ exercise });
  } catch (error) {
    return coachErrorResponse(error, 'exercises.update');
  }
}
