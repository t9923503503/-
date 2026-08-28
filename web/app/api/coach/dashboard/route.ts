import { NextRequest } from 'next/server';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { getCoachDashboard } from '@/lib/coach/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ dashboard: await getCoachDashboard() });
  } catch (error) {
    return coachErrorResponse(error, 'dashboard.get');
  }
}
