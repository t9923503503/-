import { NextRequest, NextResponse } from 'next/server';
import { leaseAiJob } from '@/lib/ai/service';
import { requireWorker } from '@/lib/ai/worker-auth';

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const workerId = String(body.workerId || '').trim();
  if (!workerId) return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  const leased = await leaseAiJob(workerId);
  return leased ? NextResponse.json(leased) : new NextResponse(null, { status: 204 });
}
