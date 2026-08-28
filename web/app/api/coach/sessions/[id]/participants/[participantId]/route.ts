import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { updateCoachParticipantAttendance } from '@/lib/coach/session-service';
import { normalizeAttendance } from '@/lib/coach/session-validators';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string; participantId: string }> };

export async function PATCH(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id, participantId } = await context.params;
  if (!isCoachUuid(id) || !isCoachUuid(participantId)) return Response.json({ error: 'Некорректный ID' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const attendance = normalizeAttendance(raw.actualAttendance ?? raw.actual_attendance);
  try {
    const session = await updateCoachParticipantAttendance({ sessionId: id, participantId, attendance });
    await writeAuditLog({
      actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.session.attendance',
      entityType: 'coach_training_participant', entityId: participantId,
      afterState: { sessionId: id, actualAttendance: attendance }, source: 'lp-coach',
    });
    return Response.json({ session });
  } catch (error) {
    return coachErrorResponse(error, 'sessions.attendance');
  }
}
