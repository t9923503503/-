import { NextRequest } from 'next/server';
import { getCoachAnalytics } from '@/lib/coach/analytics-service';
import { normalizeCoachAnalyticsPeriod } from '@/lib/coach/analytics-validators';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ analytics: await getCoachAnalytics(normalizeCoachAnalyticsPeriod(req.nextUrl.searchParams.get('period'))) });
  } catch (error) {
    return coachErrorResponse(error, 'analytics.get');
  }
}
