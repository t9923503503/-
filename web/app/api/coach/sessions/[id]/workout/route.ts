import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { isCoachUuid } from '@/lib/coach/validators';
import {
  addCoachWorkoutItem,
  completeCoachWorkoutSession,
  getCoachWorkoutWorkspace,
  moveCoachWorkoutItem,
  removeCoachWorkoutItem,
  startCoachWorkoutSession,
  updateCoachWorkoutItem,
} from '@/lib/coach/workout-service';
import { parseWorkoutPlanCommand } from '@/lib/coach/workout-validators';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID тренировки' }, { status: 400 });
  try {
    const workspace = await getCoachWorkoutWorkspace(id, auth.actor.id);
    return workspace ? Response.json({ workspace }) : Response.json({ error: 'Тренировка не найдена' }, { status: 404 });
  } catch (error) {
    return coachErrorResponse(error, 'workout.get');
  }
}

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID тренировки' }, { status: 400 });
  const raw = await req.json().catch(() => null);
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  try {
    const command = parseWorkoutPlanCommand(raw);
    let plan;
    if (command.action === 'add_item') plan = await addCoachWorkoutItem(id, { ...command, actorId: auth.actor.id });
    else if (command.action === 'update_item') plan = await updateCoachWorkoutItem(id, command.itemId, { ...command, actorId: auth.actor.id });
    else if (command.action === 'move_item') plan = await moveCoachWorkoutItem(id, command.itemId, command.direction, auth.actor.id);
    else if (command.action === 'remove_item') plan = await removeCoachWorkoutItem(id, command.itemId, auth.actor.id);
    else if (command.action === 'start_session') plan = await startCoachWorkoutSession(id, auth.actor.id);
    else plan = await completeCoachWorkoutSession(id, auth.actor.id);
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: `coach.workout.${command.action}`,
      entityType: 'coach_workout_plan',
      entityId: plan.id,
      afterState: { trainingSessionId: id, status: plan.status, itemCount: plan.items.length },
      source: 'lp-coach',
    });
    return Response.json({ plan });
  } catch (error) {
    return coachErrorResponse(error, 'workout.command');
  }
}
