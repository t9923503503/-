import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getUploadSession } from '@/lib/ai/service';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const session = await getUploadSession((await context.params).id);
    if (!session) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    return NextResponse.json({
      id: session.id,
      jobId: session.job_id,
      status: session.status,
      chunkSizeBytes: session.chunk_size_bytes,
      totalChunks: session.total_chunks,
      receivedChunks: session.received_chunks,
      sourceFileName: session.source_file_name,
      sourceSizeBytes: Number(session.source_size_bytes),
    });
  } catch (error) {
    return adminErrorResponse(error, 'ai.upload.get');
  }
}
