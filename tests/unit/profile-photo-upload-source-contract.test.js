import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile photo upload source contract', () => {
  it('keeps a conservative client-side payload budget for proxy uploads', () => {
    const source = read('web/components/profile/PlayerPhotoUploadForm.tsx');

    expect(source).toContain('const MULTIPART_OVERHEAD_BYTES = 32 * 1024;');
    expect(source).toContain('const SAFE_REQUEST_BYTES = 380 * 1024;');
    expect(source).toContain('const MAX_UPLOAD_BYTES = SAFE_REQUEST_BYTES - MULTIPART_OVERHEAD_BYTES;');
    expect(source).toContain('const shouldNormalize = file.size > MAX_UPLOAD_BYTES || file.type !== "image/jpeg";');
    expect(source).toContain('const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42, 0.34];');
    expect(source).toContain('while (width > MIN_IMAGE_SIDE && height > MIN_IMAGE_SIDE)');
    expect(source).toContain('Файл всё ещё превышает лимит прокси.');
    expect(source).toContain('startTransition(() => {');
    expect(source).toContain('router.refresh();');
    expect(source).not.toContain('window.location.reload()');
  });
});
