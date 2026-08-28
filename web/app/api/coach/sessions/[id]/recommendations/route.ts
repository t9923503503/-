import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { generateCoachWorkoutRecommendation } from '@/lib/coach/recommendation-service';
import { parseCoachRecommendationInput } from '@/lib/coach/recommendation-validators';
import { isCoachUuid } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID тренировки' }, { status: 400 });
  const raw = await req.json().catch(() => null);
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  try {
    const input = parseCoachRecommendationInput(raw);
    const result = await generateCoachWorkoutRecommendation(id, { ...input, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.workout.recommendation_generate',
      entityType: 'coach_workout_plan',
      entityId: result.plan.id,
      afterState: {
        trainingSessionId: id,
        algorithm: 'deterministic-v1',
        requestedDurationMinutes: result.recommendation.requestedDurationMinutes,
        plannedDurationMinutes: result.recommendation.plannedDurationMinutes,
        itemCount: result.recommendation.items.length,
      },
      source: 'lp-coach',
    });
    return Response.json(result);
  } catch (error) {
    return coachErrorResponse(error, 'workout.recommendation.generate');
  }
}
