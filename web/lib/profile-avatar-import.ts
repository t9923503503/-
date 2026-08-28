import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPool } from '@/lib/db';
import { normalizeProfilePhoto } from '@/lib/profile-photo';

const MAX_REMOTE_PHOTO_BYTES = 5 * 1024 * 1024;
const TELEGRAM_API = 'https://api.telegram.org';

async function readLimitedImageBody(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('AVATAR_EMPTY_BODY');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REMOTE_PHOTO_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('AVATAR_TOO_LARGE');
    }
    chunks.push(Buffer.from(value));
  }
  if (!total) throw new Error('AVATAR_EMPTY_BODY');
  return Buffer.concat(chunks, total);
}

function photoStorageDirs(): string[] {
  const dirs = new Set<string>();
  const add = (candidate: string) => {
    const root = path.resolve(candidate);
    if (existsSync(root)) dirs.add(path.join(root, 'images', 'users'));
  };
  add(path.join(process.cwd(), 'public'));
  add(path.join(process.cwd(), 'web', 'public'));
  add(path.join(process.cwd(), '.next', 'standalone', 'web', 'public'));
  add(path.join(process.cwd(), 'web', '.next', 'standalone', 'web', 'public'));
  for (let depth = 1; depth <= 3; depth += 1) {
    const up = path.resolve(process.cwd(), ...Array(depth).fill('..'));
    add(path.join(up, 'public'));
    add(path.join(up, 'web', 'public'));
  }
  return [...dirs];
}

async function downloadImage(url: string, allowedHost: (hostname: string) => boolean): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHost(parsed.hostname.toLowerCase())) {
    throw new Error('AVATAR_SOURCE_NOT_ALLOWED');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(parsed, { cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`AVATAR_HTTP_${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_PHOTO_BYTES) throw new Error('AVATAR_TOO_LARGE');
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('AVATAR_NOT_IMAGE');
    return readLimitedImageBody(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function persistImportedAvatar(userId: number, source: 'vk' | 'telegram', raw: Buffer): Promise<string> {
  const normalized = await normalizeProfilePhoto(raw);
  const filename = `u${userId}-${source}-${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
  const dirs = photoStorageDirs();
  const successful: string[] = [];
  const writes = await Promise.allSettled(dirs.map(async (dir) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), normalized, { flag: 'wx' });
    successful.push(dir);
  }));
  if (!successful.length) {
    throw writes.find((result) => result.status === 'rejected')?.reason || new Error('AVATAR_STORAGE_FAILED');
  }
  const photoUrl = `/images/users/${filename}`;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `SELECT u.player_id::text AS player_id,
              u.avatar_url,
              p.photo_url AS player_photo_url
         FROM users u
         LEFT JOIN players p ON p.id = u.player_id
        WHERE u.id = $1
        FOR UPDATE OF u`,
      [userId],
    );
    if (!account.rows[0]) throw new Error('AVATAR_ACCOUNT_NOT_FOUND');
    const existingAvatarUrl = String(
      account.rows[0].avatar_url || account.rows[0].player_photo_url || '',
    ).trim();
    if (existingAvatarUrl) {
      await client.query('COMMIT');
      await Promise.allSettled(successful.map((dir) => unlink(path.join(dir, filename))));
      return existingAvatarUrl;
    }
    await client.query(`UPDATE users SET avatar_url = $2 WHERE id = $1`, [userId, photoUrl]);
    const playerId = String(account.rows[0].player_id || '');
    if (playerId) await client.query(`UPDATE players SET photo_url = $2 WHERE id = $1::uuid`, [playerId, photoUrl]);
    await client.query('COMMIT');
    return photoUrl;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await Promise.allSettled(successful.map((dir) => unlink(path.join(dir, filename))));
    throw error;
  } finally {
    client.release();
  }
}

async function getExistingAvatarUrl(userId: number): Promise<string> {
  const result = await getPool().query(
    `SELECT u.avatar_url, p.photo_url AS player_photo_url
       FROM users u
       LEFT JOIN players p ON p.id = u.player_id
      WHERE u.id = $1
      LIMIT 1`,
    [userId],
  );
  if (!result.rows[0]) throw new Error('AVATAR_ACCOUNT_NOT_FOUND');
  return String(result.rows[0].avatar_url || result.rows[0].player_photo_url || '').trim();
}

function isVkAvatarHost(hostname: string): boolean {
  return hostname === 'vk.com'
    || hostname.endsWith('.vk.com')
    || hostname.endsWith('.userapi.com')
    || hostname.endsWith('.vkuser.net')
    || hostname.endsWith('.vkuserphoto.ru');
}

export async function importVkProfileAvatar(userId: number, avatarUrl: string): Promise<string> {
  const existingAvatarUrl = await getExistingAvatarUrl(userId);
  if (existingAvatarUrl) return existingAvatarUrl;
  const raw = await downloadImage(avatarUrl, isVkAvatarHost);
  return persistImportedAvatar(userId, 'vk', raw);
}

async function telegramJson<T>(token: string, method: string, params: URLSearchParams): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json() as { ok?: boolean; result?: T; description?: string };
    if (!response.ok || !payload.ok || payload.result == null) throw new Error(payload.description || `TELEGRAM_${method}_FAILED`);
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function importTelegramProfileAvatar(userId: number, telegramUserId: string): Promise<string | null> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
  if (!token || !/^[1-9]\d*$/.test(telegramUserId)) return null;
  const existingAvatarUrl = await getExistingAvatarUrl(userId);
  if (existingAvatarUrl) return existingAvatarUrl;
  const profile = await telegramJson<{ photos?: Array<Array<{ file_id?: string; width?: number; height?: number }>> }>(
    token,
    'getUserProfilePhotos',
    new URLSearchParams({ user_id: telegramUserId, offset: '0', limit: '1' }),
  );
  const photo = (profile.photos?.[0] || [])
    .filter((item) => item.file_id)
    .sort((a, b) => Number(b.width || 0) * Number(b.height || 0) - Number(a.width || 0) * Number(a.height || 0))[0];
  if (!photo?.file_id) return null;
  const file = await telegramJson<{ file_path?: string }>(
    token,
    'getFile',
    new URLSearchParams({ file_id: photo.file_id }),
  );
  const filePath = String(file.file_path || '');
  if (!/^[A-Za-z0-9_./-]+$/.test(filePath) || filePath.includes('..')) throw new Error('TELEGRAM_FILE_PATH_INVALID');
  const raw = await downloadImage(
    `${TELEGRAM_API}/file/bot${token}/${filePath}`,
    (hostname) => hostname === 'api.telegram.org',
  );
  return persistImportedAvatar(userId, 'telegram', raw);
}
