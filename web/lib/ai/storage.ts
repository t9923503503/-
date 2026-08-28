import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { access, mkdir, open, rename, rm, stat } from 'fs/promises';
import path from 'path';

function storageRoot(): string {
  const configured = String(process.env.AI_STORAGE_ROOT || '').trim();
  if (configured) return path.resolve(configured);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AI_STORAGE_ROOT is required in production');
  }
  return path.resolve(process.cwd(), '..', '.ai-storage');
}

function safeId(value: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('BadRequest: invalid storage id');
  return value.toLowerCase();
}

function safeFilename(value: string): string {
  const normalized = path.basename(String(value || 'video.mp4')).replace(/[^a-zA-Z0-9._-]/g, '_');
  return normalized || 'video.mp4';
}

export function uploadChunkPath(uploadId: string, index: number): string {
  return path.join(storageRoot(), 'uploads', safeId(uploadId), 'chunks', `${index}.part`);
}

export function sourceVideoPath(jobId: string, fileName: string): string {
  return path.join(storageRoot(), 'jobs', safeId(jobId), 'source', safeFilename(fileName));
}

export function artifactChunkPath(artifactId: string, index: number): string {
  return path.join(storageRoot(), 'artifacts', safeId(artifactId), 'chunks', `${index}.part`);
}

export function artifactFilePath(jobId: string, artifactId: string, fileName: string): string {
  return path.join(
    storageRoot(),
    'jobs',
    safeId(jobId),
    'artifacts',
    `${safeId(artifactId)}-${safeFilename(fileName)}`,
  );
}

export async function writeChunkAtomic(target: string, body: Uint8Array): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const existing = await stat(target);
    if (existing.size === body.byteLength) return;
    throw new Error('BadRequest: uploaded chunk has a different size');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(body);
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}

export async function assembleChunks(
  chunkPaths: string[],
  outputPath: string,
): Promise<{ size: number; sha256: string }> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.assembling`;
  const output = createWriteStream(temporary, { flags: 'w' });
  const hash = createHash('sha256');
  let size = 0;
  try {
    for (const chunkPath of chunkPaths) {
      await access(chunkPath);
      for await (const chunk of createReadStream(chunkPath)) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        hash.update(buffer);
        if (!output.write(buffer)) {
          await new Promise<void>((resolve) => output.once('drain', resolve));
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      output.once('error', reject);
      output.end(resolve);
    });
    await rename(temporary, outputPath);
    return { size, sha256: hash.digest('hex') };
  } catch (error) {
    output.destroy();
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function deletePath(target: string | null | undefined): Promise<void> {
  if (!target) return;
  const resolved = path.resolve(target);
  const root = storageRoot();
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Refusing to delete outside AI_STORAGE_ROOT');
  }
  await rm(resolved, { recursive: true, force: true });
}

export async function fileSize(target: string): Promise<number> {
  return (await stat(target)).size;
}
