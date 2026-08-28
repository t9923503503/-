import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachAthleteDetail, updateAthleteIssue } from '@/lib/coach/service';
import { isCoachUuid, normalizeAthleteIssuePatch, validateAthleteIssuePatch } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string; issueId: string }> };

export async function PATCH(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id, issueId } = await context.params;
  if (!isCoachUuid(id) || !isCoachUuid(issueId)) return Response.json({ error: 'Некорректный ID' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeAthleteIssuePatch(raw);
  const validationError = validateAthleteIssuePatch(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const detail = await getCoachAthleteDetail(id);
    const before = detail?.issues.find((issue) => issue.id === issueId);
    if (!before) return Response.json({ error: 'Проблема не найдена' }, { status: 404 });
    const issue = await updateAthleteIssue({ ...input, playerId: id, athleteIssueId: issueId, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: input.markWorked ? 'coach.issue.worked' : 'coach.issue.update',
      entityType: 'coach_athlete_issue',
      entityId: issue.id,
      beforeState: before,
      afterState: issue,
      source: 'lp-coach',
    });
    return Response.json({ issue });
  } catch (error) {
    return coachErrorResponse(error, 'issues.update');
  }
}
