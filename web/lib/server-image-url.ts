import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_ROOT_CANDIDATES = [
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'web', 'public'),
];

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isInlineImageDataUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function toPublicAssetPath(url: string): string | null {
  if (!url.startsWith('/')) return null;

  const pathname = url.split(/[?#]/, 1)[0] || '';
  if (!pathname.startsWith('/')) return null;

  const normalized = path.normalize(pathname.replace(/^\/+/, ''));
  if (!normalized || normalized.startsWith('..')) return null;

  for (const publicRoot of PUBLIC_ROOT_CANDIDATES) {
    const absolutePath = path.resolve(publicRoot, normalized);
    const publicRootWithSep = `${publicRoot}${path.sep}`;
    if (absolutePath !== publicRoot && !absolutePath.startsWith(publicRootWithSep)) {
      continue;
    }
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

/**
 * Server-side sanitizer for image URLs stored in DB.
 * External http(s) URLs are preserved as-is; local public assets are returned
 * only when the referenced file exists.
 */
export function sanitizeServerImageUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  if (!url) return '';
  if (isHttpUrl(url)) return url;
  if (isInlineImageDataUrl(url)) return url;

  return toPublicAssetPath(url) ? url : '';
}
