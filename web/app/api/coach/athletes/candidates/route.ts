import { NextRequest } from 'next/server';
import { requireCoachApiActor } from '@/lib/coach/auth';
import { coachErrorResponse } from '@/lib/coach/http';
import { listCoachCandidates } from '@/lib/coach/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCoachApiActor(req);
  if (!auth.ok) return auth.response;
  try {
    const query = new URL(req.url).searchParams.get('q') ?? '';
    return Response.json({ candidates: await listCoachCandidates(query) });
  } catch (error) {
    return coachErrorResponse(error, 'athletes.candidates');
  }
}
