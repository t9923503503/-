import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { beginUploadAssembly, finishUploadAssembly, getUploadSession } from '@/lib/ai/service';
import { assembleChunks, deletePath, sourceVideoPath, uploadChunkPath } from '@/lib/ai/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const uploadId = (await context.params).id;
    const session = await getUploadSession(uploadId);
    if (!session) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    await beginUploadAssembly(uploadId);
    const chunks = Array.from({ length: Number(session.total_chunks) }, (_, index) => uploadChunkPath(uploadId, index));
    const target = sourceVideoPath(session.job_id, session.source_file_name);
    const assembled = await assembleChunks(chunks, target);
    const jobId = await finishUploadAssembly({ uploadId, sourcePath: target, ...assembled });
    await deletePath(path.dirname(path.dirname(uploadChunkPath(uploadId, 0))));
    return NextResponse.json({ ok: true, jobId, sha256: assembled.sha256 });
  } catch (error) {
    return adminErrorResponse(error, 'ai.upload.complete');
  }
}
