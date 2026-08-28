import { NextRequest } from 'next/server';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachTrainingSession } from '@/lib/coach/session-service';
import { isCoachUuid } from '@/lib/coach/validators';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!isCoachUuid(id)) return Response.json({ error: 'Некорректный ID тренировки' }, { status: 400 });
  try {
    const session = await getCoachTrainingSession(id);
    return session ? Response.json({ session }) : Response.json({ error: 'Тренировка не найдена' }, { status: 404 });
  } catch (error) {
    return coachErrorResponse(error, 'sessions.get');
  }
}
