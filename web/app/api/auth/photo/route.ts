import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { Buffer } from 'buffer';
import path from 'path';
import { getPool } from '@/lib/db';
import {
  getPlayerTokenFromCookieHeader,
  verifyPlayerToken,
} from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

function getAuthedUser(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  if (!token) return null;
  return verifyPlayerToken(token);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getPhotoStorageDirs(): string[] {
  const dirs = new Set<string>();

  const addPublicRoot = (candidate: string) => {
    const resolved = path.resolve(candidate);
    if (!existsSync(resolved)) return;
    dirs.add(path.join(resolved, 'images', 'users'));
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

async function persistPhotoToStorageDirs(filename: string, buffer: Buffer): Promise<void> {
  const storageDirs = getPhotoStorageDirs();
  const writeResults = await Promise.allSettled(
    storageDirs.map(async (dir) => {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), buffer);
    })
  );

  const successfulWrites = writeResults.filter((result) => result.status === 'fulfilled').length;
  if (successfulWrites > 0) {
    for (const [index, result] of writeResults.entries()) {
      if (result.status === 'rejected') {
        console.warn('[api/auth/photo][storage]', storageDirs[index], result.reason);
      }
    }
    return;
  }

  throw new Error('PHOTO_STORAGE_WRITE_FAILED');
}

export async function POST(req: NextRequest) {
  const auth = getAuthedUser(req);
  if (!auth) {
    return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('photo') as File | null;
    if (!file) return NextResponse.json({ error: 'Файл не выбран' }, { status: 400 });

    const playerIdRaw = String(formData.get('playerId') || '').trim();
    if (playerIdRaw && !isUuid(playerIdRaw)) {
      return NextResponse.json({ error: 'Некорректный playerId' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Разрешены только JPG, PNG, WEBP' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Файл слишком большой (максимум 5 MB)' }, { status: 400 });
    }

    const ext =
      file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg';
    const filename = `u${auth.id}-${Date.now()}${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    let photoUrl = `/images/users/${filename}`;
    let usedInlineFallback = false;
    try {
      await persistPhotoToStorageDirs(filename, buffer);
    } catch (storageError) {
      // Last-resort fallback for environments where runtime filesystem is readonly.
      usedInlineFallback = true;
      photoUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
      console.warn('[api/auth/photo][inline fallback]', storageError);
    }
    const pool = getPool();

    const userRes = await pool.query(
      'SELECT id, full_name FROM users WHERE id = $1 LIMIT 1',
      [auth.id]
    );
    const user = userRes.rows[0];
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    let allowedPlayerIds = new Set<string>();
    try {
      const linkedRes = await pool.query(
        `SELECT DISTINCT approved_player_id::text AS player_id
           FROM player_requests
          WHERE requester_user_id = $1
            AND approved_player_id IS NOT NULL`,
        [auth.id]
      );
      allowedPlayerIds = new Set<string>(
        linkedRes.rows
          .map((row) => String(row.player_id || '').trim())
          .filter((id) => isUuid(id))
      );
    } catch (error) {
      // Older DB snapshots can miss player_requests linkage fields.
      console.warn('[api/auth/photo][player link lookup skipped]', error);
    }

    if (allowedPlayerIds.size === 0 && String(user.full_name || '').trim().length >= 2) {
      const sameNameRes = await pool.query(
        `SELECT id::text AS id
           FROM players
          WHERE lower(trim(name)) = lower(trim($1))
          LIMIT 2`,
        [String(user.full_name || '').trim()]
      );
      if (sameNameRes.rows.length === 1) {
        const candidateId = String(sameNameRes.rows[0]?.id || '');
        if (isUuid(candidateId)) {
          allowedPlayerIds.add(candidateId);
        }
      }
    }

    let targetPlayerIds: string[] = [];
    if (playerIdRaw) {
      if (!allowedPlayerIds.has(playerIdRaw)) {
        return NextResponse.json(
          {
            error:
              'Этот профиль не привязан к вашему аккаунту. Откройте свой профиль или обратитесь к администратору.',
          },
          { status: 403 }
        );
      }
      targetPlayerIds = [playerIdRaw];
    } else {
      targetPlayerIds = Array.from(allowedPlayerIds);
    }

    try {
      await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [photoUrl, auth.id]);
    } catch (error) {
      // Keep upload flow alive for older schemas where avatar_url may be absent.
      if ((error as { code?: string })?.code !== '42703') {
        throw error;
      }
      console.warn('[api/auth/photo][users.avatar_url missing]', error);
    }
    if (targetPlayerIds.length > 0) {
      try {
        await pool.query('UPDATE players SET photo_url = $1 WHERE id = ANY($2::uuid[])', [
          photoUrl,
          targetPlayerIds,
        ]);
      } catch (error) {
        // Keep account avatar update successful even if players table layout differs.
        if ((error as { code?: string })?.code !== '42703') {
          throw error;
        }
        console.warn('[api/auth/photo][players.photo_url missing]', error);
        targetPlayerIds = [];
      }
    }

    return NextResponse.json({
      ok: true,
      photoUrl,
      storageMode: usedInlineFallback ? 'inline' : 'file',
      updatedPlayers: targetPlayerIds.length,
      linkedToPlayerProfile: targetPlayerIds.length > 0,
      message:
        usedInlineFallback
          ? 'Фото сохранено в профиле (fallback-режим хранения).'
          : targetPlayerIds.length > 0
          ? 'Фото обновлено в профиле игрока.'
          : 'Фото сохранено в аккаунте. Привязка к карточке игрока не найдена.',
    });
  } catch (err: any) {
    console.error('[api/auth/photo][POST]', err);
    return NextResponse.json({ 
      error: 'Ошибка сервера: ' + (err?.message || 'Не удалось загрузить фото'),
      details: err && typeof err === 'object' ? err.stack : undefined 
    }, { status: 500 });
  }
}
