import sharp from 'sharp';

export const PROFILE_PHOTO_SIZE = 512;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export async function normalizeProfilePhoto(input: Buffer): Promise<Buffer> {
  const processor = sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 });
  const metadata = await processor.metadata();
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) throw new Error('UNSUPPORTED_IMAGE');
  if (!metadata.width || !metadata.height) throw new Error('INVALID_IMAGE');
  return processor
    .rotate()
    .resize(PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

