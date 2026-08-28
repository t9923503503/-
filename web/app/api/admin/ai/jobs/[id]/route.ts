import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getAiJobDetail } from '@/lib/ai/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const detail = await getAiJobDetail((await context.params).id);
    return detail ? NextResponse.json(detail) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return adminErrorResponse(error, 'ai.job.get');
  }
}
