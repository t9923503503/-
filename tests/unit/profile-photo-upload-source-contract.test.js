import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('profile photo upload source contract', () => {
  it('accepts a large source locally but keeps a conservative proxy payload', () => {
    const source = read('web/components/profile/PlayerPhotoUploadForm.tsx');

    expect(source).toContain('const MAX_SOURCE_BYTES = 10 * 1024 * 1024;');
    expect(source).toContain('const MULTIPART_OVERHEAD_BYTES = 32 * 1024;');
    expect(source).toContain('const SAFE_REQUEST_BYTES = 380 * 1024;');
    expect(source).toContain('const MAX_UPLOAD_BYTES = SAFE_REQUEST_BYTES - MULTIPART_OVERHEAD_BYTES;');
    expect(source).toContain('const OUTPUT_SIZE = 512;');
    expect(source).toContain('drawCrop(');
    expect(source).toContain('type="range"');
    expect(source).toContain('setRotation');
    expect(source).toContain('onPointerMove');
    expect(source).toContain("new File([blob], `${sourceName}.jpg`, { type: 'image/jpeg' })");
    expect(source).toContain('startTransition(() => router.refresh());');
    expect(source).not.toContain('window.location.reload()');
  });
});
