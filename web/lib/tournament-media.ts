import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getPool } from '@/lib/db';
import { sanitizeTournamentMediaUrl } from '@/lib/server-image-url';

export const MAX_TOURNAMENT_GALLERY_IMAGES = 20;
export const MAX_TOURNAMENT_PHOTO_BYTES = 15 * 1024 * 1024;

const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);

export type TournamentPhotoKind = 'cover' | 'gallery';

export interface TournamentGalleryImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  caption: string;
  sortOrder: number;
  width: number;
  height: number;
  byteSize: number;
}

export interface TournamentMedia {
  coverPhotoUrl: string;
  gallery: TournamentGalleryImage[];
}

interface NormalizedTournamentPhoto {
  image: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}

interface AddTournamentPhotoInput {
  tournamentId: string;
  kind: TournamentPhotoKind;
  input: Buffer;
  caption?: string;
  source: 'admin' | 'telegram';
  uploadedBy: string;
  telegramFileId?: string;
  telegramFileUniqueId?: string;
}

function databaseErrorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code ?? '');
}

function publicRoots(): string[] {
  const roots = new Set<string>();
  const candidates = [
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'web', 'public'),
    path.join(process.cwd(), '.next', 'standalone', 'web', 'public'),
    path.join(process.cwd(), 'web', '.next', 'standalone', 'web', 'public'),
  ];

  for (let depth = 1; depth <= 3; depth += 1) {
    const parent = path.resolve(process.cwd(), ...Array(depth).fill('..'));
    candidates.push(path.join(parent, 'public'), path.join(parent, 'web', 'public'));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved)) roots.add(resolved);
  }
  return Array.from(roots);
}

function safeTournamentAssetRelativePath(tournamentId: string, filename: string): string {
  return path.join('images', 'tournaments', tournamentId, 'gallery', filename);
}

async function persistTournamentAssets(
  tournamentId: string,
  imageFilename: string,
  thumbnailFilename: string,
  image: Buffer,
  thumbnail: Buffer,
): Promise<string[]> {
  const roots = publicRoots();
  const successfulRoots: string[] = [];
  const imageRelativePath = safeTournamentAssetRelativePath(tournamentId, imageFilename);
  const thumbnailRelativePath = safeTournamentAssetRelativePath(tournamentId, thumbnailFilename);

  const results = await Promise.allSettled(roots.map(async (root) => {
    const imagePath = path.join(root, imageRelativePath);
    const thumbnailPath = path.join(root, thumbnailRelativePath);
    await mkdir(path.dirname(imagePath), { recursive: true });
    try {
      await writeFile(imagePath, image, { flag: 'wx' });
      await writeFile(thumbnailPath, thumbnail, { flag: 'wx' });
      successfulRoots.push(root);
    } catch (error) {
      await Promise.allSettled([unlink(imagePath), unlink(thumbnailPath)]);
      throw error;
    }
  }));

  if (!successfulRoots.length) {
    throw results.find((result) => result.status === 'rejected')?.reason
      || new Error('TOURNAMENT_MEDIA_STORAGE_WRITE_FAILED');
  }
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.warn('[tournament-media][storage]', roots[index], result.reason);
    }
  }
  return successfulRoots;
}

async function cleanupPersistedAssets(
  tournamentId: string,
  imageFilename: string,
  thumbnailFilename: string,
  roots: string[],
) {
  await Promise.allSettled(roots.flatMap((root) => [
    unlink(path.join(root, safeTournamentAssetRelativePath(tournamentId, imageFilename))),
    unlink(path.join(root, safeTournamentAssetRelativePath(tournamentId, thumbnailFilename))),
  ]));
}

function localTournamentAssetParts(url: string): { tournamentId: string; relativePath: string } | null {
  const match = String(url || '').match(
    /^\/images\/tournaments\/([0-9a-f-]{36})\/(gallery\/)?([a-z0-9-]+\.webp)$/i,
  );
  if (!match) return null;
  return {
    tournamentId: match[1],
    relativePath: path.join('images', 'tournaments', match[1], match[2] || '', match[3]),
  };
}

async function cleanupPublicUrls(urls: string[]) {
  const roots = publicRoots();
  const targets = urls
    .map(localTournamentAssetParts)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  await Promise.allSettled(targets.flatMap((target) => roots.map(async (root) => {
    const absoluteRoot = path.resolve(root);
    const absoluteTarget = path.resolve(root, target.relativePath);
    if (!absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)) return;
    await unlink(absoluteTarget);
  })));
}

export async function normalizeTournamentPhoto(
  input: Buffer,
  kind: TournamentPhotoKind,
): Promise<NormalizedTournamentPhoto> {
  if (!input.length || input.length > MAX_TOURNAMENT_PHOTO_BYTES) {
    throw new Error('TOURNAMENT_MEDIA_FILE_TOO_LARGE');
  }

  const metadata = await sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).metadata();
  if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
    throw new Error('TOURNAMENT_MEDIA_UNSUPPORTED_IMAGE');
  }
  if (!metadata.width || !metadata.height) throw new Error('TOURNAMENT_MEDIA_INVALID_IMAGE');

  const maxEdge = kind === 'cover' ? 1600 : 1280;
  const imageResult = await sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 })
    .rotate()
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: kind === 'cover' ? 82 : 78, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 })
    .rotate()
    .resize(420, 420, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70, effort: 4 })
    .toBuffer();

  return {
    image: imageResult.data,
    thumbnail,
    width: imageResult.info.width,
    height: imageResult.info.height,
  };
}

function mapGalleryRow(row: Record<string, unknown>): TournamentGalleryImage {
  return {
    id: String(row.id ?? ''),
    imageUrl: sanitizeTournamentMediaUrl(row.image_url),
    thumbnailUrl: sanitizeTournamentMediaUrl(row.thumbnail_url),
    caption: String(row.caption ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    byteSize: Number(row.byte_size ?? 0),
  };
}

export async function getTournamentMedia(tournamentId: string): Promise<TournamentMedia> {
  if (!process.env.DATABASE_URL) return { coverPhotoUrl: '', gallery: [] };
  const pool = getPool();
  let coverPhotoUrl = '';
  let gallery: TournamentGalleryImage[] = [];

  try {
    const { rows } = await pool.query(
      'SELECT cover_photo_url FROM tournaments WHERE id = $1 LIMIT 1',
      [tournamentId],
    );
    coverPhotoUrl = sanitizeTournamentMediaUrl(rows[0]?.cover_photo_url);
  } catch (error) {
    if (databaseErrorCode(error) !== '42703') throw error;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, image_url, thumbnail_url, caption, sort_order, width, height, byte_size
         FROM tournament_gallery_images
        WHERE tournament_id = $1
        ORDER BY sort_order ASC, created_at ASC, id ASC`,
      [tournamentId],
    );
    gallery = rows.map(mapGalleryRow).filter((image) => image.imageUrl);
  } catch (error) {
    if (databaseErrorCode(error) !== '42P01') throw error;
  }

  return { coverPhotoUrl, gallery };
}

export async function addTournamentPhoto(input: AddTournamentPhotoInput): Promise<TournamentMedia> {
  const pool = getPool();
  const tournament = await pool.query(
    `SELECT id, status FROM tournaments WHERE id = $1 LIMIT 1`,
    [input.tournamentId],
  );
  if (!tournament.rowCount) throw new Error('TOURNAMENT_MEDIA_NOT_FOUND');
  if (String(tournament.rows[0]?.status) !== 'finished') {
    throw new Error('TOURNAMENT_MEDIA_REQUIRES_FINISHED_TOURNAMENT');
  }

  const normalized = await normalizeTournamentPhoto(input.input, input.kind);
  const assetId = crypto.randomUUID();
  const imageFilename = `${input.kind}-${assetId}.webp`;
  const thumbnailFilename = `${input.kind}-${assetId}-thumb.webp`;
  const persistedRoots = await persistTournamentAssets(
    input.tournamentId,
    imageFilename,
    thumbnailFilename,
    normalized.image,
    normalized.thumbnail,
  );
  const imageUrl = `/images/tournaments/${input.tournamentId}/gallery/${imageFilename}`;
  const thumbnailUrl = `/images/tournaments/${input.tournamentId}/gallery/${thumbnailFilename}`;
  const client = await pool.connect();
  let previousCoverUrl = '';

  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT status, cover_photo_url FROM tournaments WHERE id = $1 FOR UPDATE',
      [input.tournamentId],
    );
    if (!locked.rowCount) throw new Error('TOURNAMENT_MEDIA_NOT_FOUND');
    if (String(locked.rows[0]?.status) !== 'finished') {
      throw new Error('TOURNAMENT_MEDIA_REQUIRES_FINISHED_TOURNAMENT');
    }

    if (input.kind === 'cover') {
      previousCoverUrl = String(locked.rows[0]?.cover_photo_url ?? '');
      await client.query(
        'UPDATE tournaments SET cover_photo_url = $2 WHERE id = $1',
        [input.tournamentId, imageUrl],
      );
    } else {
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM tournament_gallery_images WHERE tournament_id = $1',
        [input.tournamentId],
      );
      if (Number(countResult.rows[0]?.count ?? 0) >= MAX_TOURNAMENT_GALLERY_IMAGES) {
        throw new Error('TOURNAMENT_MEDIA_GALLERY_FULL');
      }
      await client.query(
        `INSERT INTO tournament_gallery_images (
           tournament_id, image_url, thumbnail_url, caption, sort_order,
           width, height, byte_size, source, uploaded_by,
           telegram_file_id, telegram_file_unique_id
         )
         SELECT $1, $2, $3, $4, COALESCE(MAX(sort_order), -1) + 1,
                $5, $6, $7, $8, $9, $10, $11
           FROM tournament_gallery_images
          WHERE tournament_id = $1`,
        [
          input.tournamentId,
          imageUrl,
          thumbnailUrl,
          String(input.caption || '').trim().slice(0, 500),
          normalized.width,
          normalized.height,
          normalized.image.length,
          input.source,
          input.uploadedBy,
          input.telegramFileId || null,
          input.telegramFileUniqueId || null,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await cleanupPersistedAssets(
      input.tournamentId,
      imageFilename,
      thumbnailFilename,
      persistedRoots,
    );
    if (databaseErrorCode(error) === '23505' && input.telegramFileUniqueId) {
      return getTournamentMedia(input.tournamentId);
    }
    if (databaseErrorCode(error) === '23514') throw new Error('TOURNAMENT_MEDIA_GALLERY_FULL');
    throw error;
  } finally {
    client.release();
  }

  if (input.kind === 'cover' && previousCoverUrl && previousCoverUrl !== imageUrl) {
    await cleanupPublicUrls([previousCoverUrl]);
  }
  return getTournamentMedia(input.tournamentId);
}

export async function deleteTournamentPhoto(input: {
  tournamentId: string;
  kind: TournamentPhotoKind;
  photoId?: string;
}): Promise<TournamentMedia> {
  const pool = getPool();
  const client = await pool.connect();
  const urlsToDelete: string[] = [];
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT cover_photo_url FROM tournaments WHERE id = $1 FOR UPDATE',
      [input.tournamentId],
    );
    if (!locked.rowCount) throw new Error('TOURNAMENT_MEDIA_NOT_FOUND');

    if (input.kind === 'cover') {
      urlsToDelete.push(String(locked.rows[0]?.cover_photo_url ?? ''));
      await client.query('UPDATE tournaments SET cover_photo_url = NULL WHERE id = $1', [input.tournamentId]);
    } else {
      if (!input.photoId) throw new Error('TOURNAMENT_MEDIA_PHOTO_ID_REQUIRED');
      const removed = await client.query(
        `DELETE FROM tournament_gallery_images
          WHERE id = $1 AND tournament_id = $2
        RETURNING image_url, thumbnail_url`,
        [input.photoId, input.tournamentId],
      );
      if (!removed.rowCount) throw new Error('TOURNAMENT_MEDIA_PHOTO_NOT_FOUND');
      urlsToDelete.push(
        String(removed.rows[0]?.image_url ?? ''),
        String(removed.rows[0]?.thumbnail_url ?? ''),
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await cleanupPublicUrls(urlsToDelete.filter(Boolean));
  return getTournamentMedia(input.tournamentId);
}
