import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_TOURNAMENT_PHOTO_BYTES,
  normalizeTournamentPhoto,
} from '../../web/lib/tournament-media';

const requireFromWeb = createRequire(path.resolve(process.cwd(), 'web/package.json'));
const sharp = requireFromWeb('sharp') as typeof import('sharp');

describe('tournament photo normalization', () => {
  it('creates a mobile-sized WebP gallery image and lightweight thumbnail', async () => {
    const input = await sharp({
      create: { width: 3200, height: 2100, channels: 3, background: '#ff5a00' },
    }).jpeg({ quality: 95 }).toBuffer();

    const output = await normalizeTournamentPhoto(input, 'gallery');
    const imageMeta = await sharp(output.image).metadata();
    const thumbMeta = await sharp(output.thumbnail).metadata();

    expect(imageMeta.format).toBe('webp');
    expect(imageMeta.width).toBe(1280);
    expect(imageMeta.height).toBeLessThanOrEqual(1280);
    expect(output.width).toBe(imageMeta.width);
    expect(output.height).toBe(imageMeta.height);
    expect(thumbMeta.format).toBe('webp');
    expect(thumbMeta.width).toBeLessThanOrEqual(420);
    expect(thumbMeta.height).toBeLessThanOrEqual(420);
    expect(output.thumbnail.length).toBeLessThan(output.image.length);
  });

  it('keeps smaller cover photos at their natural size instead of enlarging them', async () => {
    const input = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#171717' },
    }).png().toBuffer();
    const output = await normalizeTournamentPhoto(input, 'cover');
    expect(output.width).toBe(900);
    expect(output.height).toBe(600);
  });

  it('rejects corrupt and oversized input', async () => {
    await expect(normalizeTournamentPhoto(Buffer.from('not an image'), 'gallery')).rejects.toThrow();
    await expect(
      normalizeTournamentPhoto(Buffer.alloc(MAX_TOURNAMENT_PHOTO_BYTES + 1), 'cover'),
    ).rejects.toThrow('TOURNAMENT_MEDIA_FILE_TOO_LARGE');
  });
});
