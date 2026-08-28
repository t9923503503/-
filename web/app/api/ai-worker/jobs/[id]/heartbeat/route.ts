import { NextRequest, NextResponse } from 'next/server';
import { heartbeatAiJob } from '@/lib/ai/service';
import { requireWorker } from '@/lib/ai/worker-auth';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const result = await heartbeatAiJob(
      (await context.params).id,
      String(body.leaseToken || ''),
      Number(body.progress || 0),
      String(body.stage || 'processing'),
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Heartbeat failed' }, { status: 409 });
  }
}
