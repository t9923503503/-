import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { normalizeProfilePhoto, PROFILE_PHOTO_SIZE } from '../../web/lib/profile-photo';

const requireFromWeb = createRequire(path.resolve(process.cwd(), 'web/package.json'));
const sharp = requireFromWeb('sharp') as typeof import('sharp');

describe('profile photo normalization', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('normalizes %s to a metadata-free square JPEG', async (format) => {
    const builder = sharp({ create: { width: 900, height: 600, channels: 3, background: '#ff6600' } });
    const input = await builder[format]().toBuffer();
    const output = await normalizeProfilePhoto(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(PROFILE_PHOTO_SIZE);
    expect(metadata.height).toBe(PROFILE_PHOTO_SIZE);
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects corrupt content even when the request claims it is an image', async () => {
    await expect(normalizeProfilePhoto(Buffer.from('not an image'))).rejects.toThrow();
  });
});
