import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { updateRally } from '@/lib/ai/service';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; rallyId: string }> },
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const params = await context.params;
    const body = await req.json();
    const rally = await updateRally({
      jobId: params.id,
      rallyId: params.rallyId,
      actorId: auth.actor.id,
      startSec: body.startSec === undefined ? undefined : Number(body.startSec),
      endSec: body.endSec === undefined ? undefined : Number(body.endSec),
      winnerTeam: body.winnerTeam,
      reviewStatus: body.reviewStatus,
    });
    return rally ? NextResponse.json(rally) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return adminErrorResponse(error, 'ai.rally.patch');
  }
}
