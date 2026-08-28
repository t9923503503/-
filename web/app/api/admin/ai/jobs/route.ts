import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { createAiJob, listAiJobs } from '@/lib/ai/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await listAiJobs(Number(req.nextUrl.searchParams.get('limit') || 50)));
  } catch (error) {
    return adminErrorResponse(error, 'ai.jobs.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const result = await createAiJob({
      actorId: auth.actor.id,
      kind: body.kind,
      title: body.title,
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: Number(body.sizeBytes),
      sha256: body.sha256,
      sourceMatchRef: body.sourceMatchRef,
      calibration: body.calibration,
      players: Array.isArray(body.players) ? body.players : [],
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, 'ai.jobs.post');
  }
}
