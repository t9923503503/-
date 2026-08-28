import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { resolveCoachExternalIdentity } from '@/lib/coach/session-service';
import { isCoachUuid } from '@/lib/coach/validators';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  const playerId = String(raw?.playerId ?? raw?.player_id ?? '').trim();
  if (!isCoachUuid(id) || !isCoachUuid(playerId)) return Response.json({ error: 'Выберите игрока LPVOLLEY' }, { status: 400 });
  try {
    const result = await resolveCoachExternalIdentity({ identityId: id, playerId, actorId: auth.actor.id });
    await writeAuditLog({
      actorId: auth.actor.id, actorRole: auth.actor.role, action: 'coach.identity.resolve',
      entityType: 'coach_external_identity', entityId: id, afterState: result, source: 'lp-coach',
    });
    return Response.json(result);
  } catch (error) {
    return coachErrorResponse(error, 'identities.resolve');
  }
}
