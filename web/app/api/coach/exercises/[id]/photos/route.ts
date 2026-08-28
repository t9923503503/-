import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addCoachExercisePhoto } from '@/lib/coach/exercise-service';
import { normalizeCoachExercisePhotoInput, validateCoachExercisePhotoInput } from '@/lib/coach/exercise-validators';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID упражнения' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachExercisePhotoInput(raw);
  const validationError = validateCoachExercisePhotoInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const photo = await addCoachExercisePhoto(id, { ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.exercise.photo.add',
      entityType: 'coach_exercise',
      entityId: id,
      afterState: photo,
      source: 'lp-coach',
    });
    return Response.json({ photo }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'exercise-photos.add');
  }
}
