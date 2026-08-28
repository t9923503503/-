import { NextRequest, NextResponse } from 'next/server';
import { failAiJob } from '@/lib/ai/service';
import { requireWorker } from '@/lib/ai/worker-auth';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    await failAiJob((await context.params).id, String(body.leaseToken || ''), String(body.error || 'Worker failed'));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failure report failed' }, { status: 400 });
  }
}
