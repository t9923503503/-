import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import type { NextRequest } from 'next/server';

export async function rangedFileResponse(
  req: NextRequest,
  filePath: string,
  contentType: string,
  fileName: string,
): Promise<Response> {
  const info = await stat(filePath);
  const range = req.headers.get('range');
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${fileName.replace(/["\r\n]/g, '_')}"`,
    'Cache-Control': 'private, no-store',
  });
  if (!range) {
    headers.set('Content-Length', String(info.size));
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return new Response(null, { status: 416 });
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= info.size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } });
  }
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
  return new Response(
    Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream,
    { status: 206, headers },
  );
}
