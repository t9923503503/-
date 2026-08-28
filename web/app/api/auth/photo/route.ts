import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { getPool } from '@/lib/db';
import { getPlayerTokenFromCookieHeader, verifyPlayerToken } from '@/lib/player-auth';
import { normalizeProfilePhoto } from '@/lib/profile-photo';

export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

function getAuthedUser(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  return token ? verifyPlayerToken(token) : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getPhotoStorageDirs(): string[] {
  const dirs = new Set<string>();
  const addPublicRoot = (candidate: string) => {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved)) dirs.add(path.join(resolved, 'images', 'users'));
  };
  addPublicRoot(path.join(process.cwd(), 'public'));
  addPublicRoot(path.join(process.cwd(), 'web', 'public'));
  addPublicRoot(path.join(process.cwd(), '.next', 'standalone', 'web', 'public'));
  addPublicRoot(path.join(process.cwd(), 'web', '.next', 'standalone', 'web', 'public'));
  for (let depth = 1; depth <= 3; depth += 1) {
    const up = path.resolve(process.cwd(), ...Array(depth).fill('..'));
    addPublicRoot(path.join(up, 'public'));
    addPublicRoot(path.join(up, 'web', 'public'));
  }
  return Array.from(dirs);
}

async function persistPhoto(filename: string, buffer: Buffer): Promise<string[]> {
  const storageDirs = getPhotoStorageDirs();
  const successfulDirs: string[] = [];
  const results = await Promise.allSettled(storageDirs.map(async (dir) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer, { flag: 'wx' });
    successfulDirs.push(dir);
  }));
  if (!successfulDirs.length) {
    throw results.find((result) => result.status === 'rejected')?.reason || new Error('PHOTO_STORAGE_WRITE_FAILED');
  }
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') console.warn('[api/auth/photo][storage]', storageDirs[index], result.reason);
  }
  return successfulDirs;
}

async function cleanupNewPhoto(filename: string, dirs: string[]) {
  await Promise.allSettled(dirs.map((dir) => unlink(path.join(dir, filename))));
}

export async function POST(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });

  let persistedDirs: string[] = [];
  let filename = '';
  try {
    const formData = await req.formData();
    const file = formData.get('photo');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Файл не выбран' }, { status: 400 });
    if (file.size > MAX_REQUEST_BYTES) return NextResponse.json({ error: 'Файл слишком большой' }, { status: 400 });

    const playerIdRaw = String(formData.get('playerId') || '').trim();
    if (playerIdRaw && !isUuid(playerIdRaw)) return NextResponse.json({ error: 'Некорректный playerId' }, { status: 400 });

    const pool = getPool();
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [auth.id]);
    const user = userResult.rows[0];
    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });

    let allowedPlayerIds = new Set<string>();
    try {
      const linkedResult = await pool.query(
        `SELECT player_id::text AS player_id
           FROM users
          WHERE id = $1 AND player_id IS NOT NULL`,
        [auth.id]
      );
      allowedPlayerIds = new Set(linkedResult.rows.map((row) => String(row.player_id || '')).filter(isUuid));
    } catch (error) {
      console.warn('[api/auth/photo][player link lookup skipped]', error);
    }

    if (playerIdRaw && !allowedPlayerIds.has(playerIdRaw)) {
      return NextResponse.json({ error: 'Этот профиль не привязан к вашему аккаунту.' }, { status: 403 });
    }
    const targetPlayerIds = playerIdRaw ? [playerIdRaw] : Array.from(allowedPlayerIds);

    let normalized: Buffer;
    try {
      normalized = await normalizeProfilePhoto(Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json({ error: 'Повреждённое изображение или неподдерживаемый формат' }, { status: 400 });
    }

    filename = `u${auth.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    persistedDirs = await persistPhoto(filename, normalized);
    const photoUrl = `/images/users/${filename}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const currentLinkResult = await client.query(
        `SELECT player_id::text AS player_id
           FROM users
          WHERE id = $1
          FOR UPDATE`,
        [auth.id]
      );
      if (!currentLinkResult.rowCount) {
        await client.query('ROLLBACK');
        await cleanupNewPhoto(filename, persistedDirs);
        persistedDirs = [];
        return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
      }
      const currentPlayerId = String(currentLinkResult.rows[0]?.player_id || '');
      if (targetPlayerIds.length && currentPlayerId !== targetPlayerIds[0]) {
        await client.query('ROLLBACK');
        await cleanupNewPhoto(filename, persistedDirs);
        persistedDirs = [];
        return NextResponse.json(
          { error: 'Привязка карточки изменилась. Обновите страницу и попробуйте снова.' },
          { status: 409 }
        );
      }
      try {
        await client.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [photoUrl, auth.id]);
      } catch (error) {
        if ((error as { code?: string }).code !== '42703') throw error;
      }
      if (targetPlayerIds.length) {
        await client.query('UPDATE players SET photo_url = $1 WHERE id = ANY($2::uuid[])', [photoUrl, targetPlayerIds]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      await cleanupNewPhoto(filename, persistedDirs);
      persistedDirs = [];
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({
      ok: true,
      photoUrl,
      storageMode: 'file',
      updatedPlayers: targetPlayerIds.length,
      linkedToPlayerProfile: targetPlayerIds.length > 0,
      message: targetPlayerIds.length ? 'Фото обновлено в профиле игрока.' : 'Фото сохранено в аккаунте.',
    });
  } catch (error) {
    if (filename && persistedDirs.length) await cleanupNewPhoto(filename, persistedDirs);
    console.error('[api/auth/photo][POST]', error);
    return NextResponse.json({ error: 'Не удалось сохранить фото' }, { status: 500 });
  }
}
