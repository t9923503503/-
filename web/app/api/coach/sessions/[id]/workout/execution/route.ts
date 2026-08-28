import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { isCoachUuid } from '@/lib/coach/validators';
import { commandCoachExecution, startCoachExerciseExecution } from '@/lib/coach/workout-service';
import { parseWorkoutExecutionCommand } from '@/lib/coach/workout-validators';

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
    const command = parseWorkoutExecutionCommand(raw);
    const plan = command.action === 'start'
      ? await startCoachExerciseExecution(id, command.itemId, auth.actor.id)
      : await commandCoachExecution(id, { ...command, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: `coach.execution.${command.action}`,
      entityType: 'coach_training_session',
      entityId: id,
      afterState: { activeExecutionId: plan.activeExecution?.id ?? null, status: plan.status },
      source: 'lp-coach',
    });
    return Response.json({ plan, serverNow: new Date().toISOString() });
  } catch (error) {
    return coachErrorResponse(error, 'workout.execution');
  }
}
