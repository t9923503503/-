import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { removeCoachExerciseVideo } from '@/lib/coach/exercise-service';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string; videoId: string }> };

export async function DELETE(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id, videoId } = await context.params;
  if (!isCoachUuid(id) || !isCoachUuid(videoId)) return Response.json({ error: 'Некорректный ID' }, { status: 400 });
  try {
    if (!await removeCoachExerciseVideo(id, videoId)) return Response.json({ error: 'Видео не найдено' }, { status: 404 });
    await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.exercise.video.remove', entityType: 'coach_exercise', entityId: id, beforeState: { videoId }, source: 'lp-coach' });
    return new Response(null, { status: 204 });
  } catch (error) {
    return coachErrorResponse(error, 'exercise-videos.remove');
  }
}
