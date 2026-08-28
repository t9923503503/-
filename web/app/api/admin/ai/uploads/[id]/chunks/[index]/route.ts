import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { requireApiRole } from '@/lib/admin-auth';
import { adminErrorResponse } from '@/lib/admin-errors';
import { getUploadSession, markUploadChunk } from '@/lib/ai/service';
import { uploadChunkPath, writeChunkAtomic } from '@/lib/ai/storage';

export const runtime = 'nodejs';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string; index: string }> },
) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const { id, index: rawIndex } = await context.params;
    const session = await getUploadSession(id);
    if (!session) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    const index = Number(rawIndex);
    const body = new Uint8Array(await req.arrayBuffer());
    const expected = index === session.total_chunks - 1
      ? Number(session.source_size_bytes) - index * Number(session.chunk_size_bytes)
      : Number(session.chunk_size_bytes);
    if (!Number.isInteger(index) || body.byteLength !== expected) {
      return NextResponse.json({ error: 'Unexpected chunk size or index' }, { status: 400 });
    }
    const suppliedHash = String(req.headers.get('x-chunk-sha256') || '').toLowerCase();
    const actualHash = createHash('sha256').update(body).digest('hex');
    if (!/^[0-9a-f]{64}$/.test(suppliedHash) || suppliedHash !== actualHash) {
      return NextResponse.json({ error: 'Chunk SHA-256 mismatch' }, { status: 400 });
    }
    await writeChunkAtomic(uploadChunkPath(id, index), body);
    await markUploadChunk(id, index);
    return NextResponse.json({ ok: true, index });
  } catch (error) {
    return adminErrorResponse(error, 'ai.upload.chunk');
  }
}
