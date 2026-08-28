import { writeAuditLog } from '@/lib/admin-audit';
import { coachErrorResponse } from '@/lib/coach/http';
import { syncCoachTrainingFromKotyara } from '@/lib/coach/session-service';
import { requireKotyaraSync } from '@/lib/coach/session-sync-auth';
import { normalizeKotyaraTrainingSync, validateKotyaraTrainingSync } from '@/lib/coach/session-validators';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = requireKotyaraSync(req);
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!raw) return Response.json({ error: 'Ожидается JSON' }, { status: 400 });
  const input = normalizeKotyaraTrainingSync(raw);
  const validationError = validateKotyaraTrainingSync(input);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  try {
    const result = await syncCoachTrainingFromKotyara(input);
    if (!result.duplicate) {
      await writeAuditLog({
        actorId: 'integration:kotyara', actorRole: 'operator', action: 'coach.session.sync',
        entityType: 'coach_training_session', entityId: result.session.id,
        afterState: { eventKey: input.eventKey, participantCount: input.participants.length }, source: 'kotyara',
      });
    }
    return Response.json({ sessionId: result.session.id, duplicate: result.duplicate, participantCount: result.session.participantCount });
  } catch (error) {
    return coachErrorResponse(error, 'integrations.kotyara.sync');
  }
}
