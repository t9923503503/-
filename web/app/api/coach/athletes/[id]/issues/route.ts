import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addAthleteIssue } from '@/lib/coach/service';
import { isCoachUuid, normalizeAthleteIssueInput, validateAthleteIssueInput } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID ученика' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeAthleteIssueInput(raw);
  const validationError = validateAthleteIssueInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const issue = await addAthleteIssue({ ...input, playerId: id, confidence: input.confidence!, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.issue.add',
      entityType: 'coach_athlete_issue',
      entityId: issue.id,
      afterState: issue,
      source: 'lp-coach',
    });
    return Response.json({ issue }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'issues.add');
  }
}
