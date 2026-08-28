import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { removeCoachExercisePhoto } from '@/lib/coach/exercise-service';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id, photoId } = await context.params;
  if (!isCoachUuid(id) || !isCoachUuid(photoId)) return Response.json({ error: 'Некорректный ID' }, { status: 400 });
  try {
    if (!await removeCoachExercisePhoto(id, photoId)) return Response.json({ error: 'Фото не найдено' }, { status: 404 });
    await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.exercise.photo.remove', entityType: 'coach_exercise', entityId: id, beforeState: { photoId }, source: 'lp-coach' });
    return new Response(null, { status: 204 });
  } catch (error) {
    return coachErrorResponse(error, 'exercise-photos.remove');
  }
}
