import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addSkillEvaluation } from '@/lib/coach/service';
import { isCoachUuid, normalizeSkillEvaluationInput, validateSkillEvaluationInput } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID ученика' }, { status: 400 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeSkillEvaluationInput(raw);
  const validationError = validateSkillEvaluationInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const evaluation = await addSkillEvaluation({ ...input, playerId: id, confidence: input.confidence!, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: 'coach.evaluation.add',
      entityType: 'coach_skill_evaluation',
      entityId: evaluation.id,
      afterState: evaluation,
      source: 'lp-coach',
    });
    return Response.json({ evaluation }, { status: 201 });
  } catch (error) {
    return coachErrorResponse(error, 'evaluations.add');
  }
}
