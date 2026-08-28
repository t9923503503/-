import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachChallenge, updateCoachChallenge } from '@/lib/coach/challenge-service';
import { normalizeCoachChallengeInput, validateCoachChallengeInput } from '@/lib/coach/challenge-validators';
import { isCoachUuid } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  const auth = requireCoachApiActor(req); if (!auth.ok) return auth.response;
  const { id } = await params; if (!isCoachUuid(id)) return Response.json({ error: 'Не найдено' }, { status: 404 });
  try { const challenge = await getCoachChallenge(id); return challenge ? Response.json({ challenge }) : Response.json({ error: 'Не найдено' }, { status: 404 }); }
  catch (error) { return coachErrorResponse(error, 'challenge.get'); }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const auth = requireCoachApiActor(req); if (!auth.ok) return auth.response;
  const { id } = await params; if (!isCoachUuid(id)) return Response.json({ error: 'Не найдено' }, { status: 404 });
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachChallengeInput(raw); const validationError = validateCoachChallengeInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const challenge = await updateCoachChallenge(id, { ...input, actorId: auth.actor.id });
    await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.challenge.update', entityType: 'coach_challenge', entityId: id, afterState: challenge, source: 'lp-coach' });
    return Response.json({ challenge });
  } catch (error) { return coachErrorResponse(error, 'challenge.update'); }
}
