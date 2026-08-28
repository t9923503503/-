import { NextRequest } from 'next/server';
import { assertLease } from '@/lib/ai/service';
import { rangedFileResponse } from '@/lib/ai/file-response';
import { requireWorker } from '@/lib/ai/worker-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const job = await assertLease((await context.params).id, String(req.headers.get('x-ai-lease-token') || ''));
    if (!job.source_storage_path) return Response.json({ error: 'Source is unavailable' }, { status: 404 });
    return rangedFileResponse(req, String(job.source_storage_path), String(job.source_content_type), String(job.source_file_name));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Source failed' }, { status: 409 });
  }
}
