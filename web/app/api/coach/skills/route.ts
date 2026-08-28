import { NextRequest } from 'next/server';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { listCoachSkills } from '@/lib/coach/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ skills: await listCoachSkills() });
  } catch (error) {
    return coachErrorResponse(error, 'skills.list');
  }
}
