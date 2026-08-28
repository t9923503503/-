import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { createCoachChallenge, listCoachChallenges } from '@/lib/coach/challenge-service';
import { normalizeCoachChallengeInput, validateCoachChallengeInput } from '@/lib/coach/challenge-validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try { return Response.json({ challenges: await listCoachChallenges(req.nextUrl.searchParams.get('archived') === '1') }); }
  catch (error) { return coachErrorResponse(error, 'challenges.list'); }
}

export async function POST(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeCoachChallengeInput(raw);
  const validationError = validateCoachChallengeInput(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const challenge = await createCoachChallenge({ ...input, actorId: auth.actor.id });
    await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.challenge.create', entityType: 'coach_challenge', entityId: challenge.id, afterState: challenge, source: 'lp-coach' });
    return Response.json({ challenge }, { status: 201 });
  } catch (error) { return coachErrorResponse(error, 'challenges.create'); }
}
