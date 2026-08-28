import { NextRequest, NextResponse } from 'next/server';
import { completeAiJob } from '@/lib/ai/service';
import { requireWorker } from '@/lib/ai/worker-auth';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    await completeAiJob({
      jobId: (await context.params).id,
      leaseToken: String(body.leaseToken || ''),
      modelVersion: String(body.modelVersion || 'unknown'),
      result: body.result || {},
      rallies: Array.isArray(body.rallies) ? body.rallies : [],
      events: Array.isArray(body.events) ? body.events : [],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Completion failed' }, { status: 400 });
  }
}
