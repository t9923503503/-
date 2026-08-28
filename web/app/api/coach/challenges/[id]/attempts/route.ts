import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { addCoachChallengeAttempt } from '@/lib/coach/challenge-service';
import { normalizeCoachChallengeAttemptInput, validateCoachChallengeAttemptInput } from '@/lib/coach/challenge-validators';
import { isCoachUuid } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Context) {
  const auth = requireCoachApiActor(req); if (!auth.ok) return auth.response;
  const { id } = await params; if (!isCoachUuid(id)) return Response.json({ error: 'Не найдено' }, { status: 404 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachChallengeAttemptInput(raw); const validationError = validateCoachChallengeAttemptInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const attempt = await addCoachChallengeAttempt(id, { ...input, actorId: auth.actor.id });
    await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.challenge.attempt.add', entityType: 'coach_challenge_attempt', entityId: attempt.id, afterState: attempt, source: 'lp-coach' });
    return Response.json({ attempt }, { status: 201 });
  } catch (error) { return coachErrorResponse(error, 'challenge.attempt.add'); }
}
