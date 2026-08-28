import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { confirmAiJob } from '@/lib/ai/service';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    await confirmAiJob((await context.params).id, auth.actor.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, 'ai.job.confirm');
  }
}
