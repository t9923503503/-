import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addCoachExerciseVideo } from '@/lib/coach/exercise-service';
import { normalizeCoachExerciseVideoInput, validateCoachExerciseVideoInput } from '@/lib/coach/exercise-validators';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID упражнения' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachExerciseVideoInput(raw);
  const validationError = validateCoachExerciseVideoInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const video = await addCoachExerciseVideo(id, { ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.exercise.video.add',
      entityType: 'coach_exercise',
      entityId: id,
      afterState: video,
      source: 'lp-coach',
    });
    return Response.json({ video }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'exercise-videos.add');
  }
}
