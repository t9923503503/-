import { getPool } from '@/lib/db';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';

export interface PlayerLinkSummary {
  id: string;
  name: string;
  gender: 'M' | 'W';
  photoUrl: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function mapPlayerSummary(row: Record<string, unknown> | undefined | null): PlayerLinkSummary | null {
  const id = String(row?.id ?? '').trim();
  if (!isUuid(id)) return null;

  return {
    id,
    name: String(row?.name ?? '').trim(),
    gender: String(row?.gender ?? 'M') === 'W' ? 'W' : 'M',
    photoUrl: sanitizeServerImageUrl(row?.photo_url) || '',
  };
}

export async function fetchPlayerLinkSummary(playerId: string): Promise<PlayerLinkSummary | null> {
  if (!process.env.DATABASE_URL || !isUuid(playerId)) return null;
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT id::text AS id, name, gender, photo_url
         FROM players
        WHERE id = $1
        LIMIT 1`,
      [playerId]
    );
    return mapPlayerSummary(rows[0]);
  } catch {
    return null;
  }
}

export async function getAccountFullName(userId: number): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();

  try {
    const { rows } = await pool.query('SELECT full_name FROM users WHERE id = $1 LIMIT 1', [userId]);
    const fullName = normalizeName(String(rows[0]?.full_name ?? ''));
    return fullName.length >= 2 ? fullName : null;
  } catch {
    return null;
  }
}

export async function requiresModeratedPlayerLink(userId: number): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { rows } = await getPool().query(
      `SELECT email, password_hash, telegram_user_id
         FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const account = rows[0];
    return Boolean(
      account?.telegram_user_id
      && (!String(account.email || '').trim() || !String(account.password_hash || '').trim())
    );
  } catch {
    return false;
  }
}

export async function findExplicitLinkedPlayer(userId: number): Promise<PlayerLinkSummary | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT p.id::text AS id, p.name, p.gender, p.photo_url
         FROM users u
         JOIN players p ON p.id = u.player_id
        WHERE u.id = $1
          AND u.player_id IS NOT NULL
        LIMIT 1`,
      [userId]
    );
    return mapPlayerSummary(rows[0]);
  } catch {
    return null;
  }
}

export async function findBoundPlayer(userId: number): Promise<PlayerLinkSummary | null> {
  return findExplicitLinkedPlayer(userId);
}

export async function searchPlayersForLink(query: string, limit = 8): Promise<PlayerLinkSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const normalized = normalizeName(query);
  if (normalized.length < 2) return [];

  const pool = getPool();
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(Number(limit) || 8)));

  try {
    const { rows } = await pool.query(
      `SELECT id::text AS id, name, gender, photo_url
         FROM players
        WHERE status = 'active'
          AND lower(name) LIKE lower($1)
        ORDER BY
          CASE WHEN lower(trim(name)) = lower(trim($2)) THEN 0 ELSE 1 END,
          name ASC
        LIMIT $3`,
      [`%${normalized}%`, normalized, safeLimit]
    );

    return rows
      .map((row) => mapPlayerSummary(row))
      .filter((row): row is PlayerLinkSummary => Boolean(row));
  } catch {
    return [];
  }
}

export async function resolvePlayerIdForAccount(userId: number): Promise<string | null> {
  const explicit = await findExplicitLinkedPlayer(userId);
  return explicit?.id || null;
}

export async function resolvePlayerForAccount(userId: number): Promise<PlayerLinkSummary | null> {
  const playerId = await resolvePlayerIdForAccount(userId);
  return playerId ? fetchPlayerLinkSummary(playerId) : null;
}

export async function bindPlayerToAccount(
  userId: number,
  playerId: string
): Promise<{ linkedPlayer: PlayerLinkSummary | null; error?: string | null }> {
  if (!process.env.DATABASE_URL) {
    return { linkedPlayer: null, error: 'База данных не настроена' };
  }
  if (!isUuid(playerId)) {
    return { linkedPlayer: null, error: 'Некорректный ID игрока' };
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const accountRes = await client.query(
      `SELECT email, password_hash, telegram_user_id
         FROM users WHERE id = $1
         FOR UPDATE`,
      [userId]
    );
    const account = accountRes.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return { linkedPlayer: null, error: 'Аккаунт не найден' };
    }
    if (
      account.telegram_user_id
      && (!String(account.email || '').trim() || !String(account.password_hash || '').trim())
    ) {
      await client.query('ROLLBACK');
      return {
        linkedPlayer: null,
        error: 'Для Telegram-аккаунта карточку подтверждает организатор. Откройте @Lpvolley_bot и нажмите «Привязать карточку».',
      };
    }

    const playerRes = await client.query(
      `SELECT id::text AS id, name, gender, photo_url
         FROM players
        WHERE id = $1 AND status = 'active'
        FOR SHARE`,
      [playerId]
    );
    const player = mapPlayerSummary(playerRes.rows[0]);
    if (!player) {
      await client.query('ROLLBACK');
      return { linkedPlayer: null, error: 'Карточка игрока не найдена' };
    }

    const conflictRes = await client.query(
      `SELECT account_id
         FROM (
           SELECT u.id AS account_id
             FROM users u
            WHERE u.player_id::text = $1 AND u.id <> $2
           UNION ALL
           SELECT pr.requester_user_id AS account_id
             FROM player_requests pr
            WHERE pr.tournament_id IS NULL
              AND pr.status = 'approved'
              AND pr.approved_player_id::text = $1
              AND pr.requester_user_id <> $2
         ) conflicts
        LIMIT 1`,
      [playerId, userId]
    );
    if (conflictRes.rows[0]?.account_id != null) {
      await client.query('ROLLBACK');
      return {
        linkedPlayer: null,
        error: 'Эта карточка уже привязана к другому аккаунту.',
      };
    }

    const existingRes = await client.query(
      `SELECT id
         FROM player_requests
        WHERE requester_user_id = $1
          AND tournament_id IS NULL
        ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [userId]
    );

    const existingId = String(existingRes.rows[0]?.id ?? '').trim();
    if (existingId) {
      await client.query(
        `UPDATE player_requests
            SET name = $2,
                gender = $3,
                phone = '',
                status = 'approved',
                approved_player_id = $4,
                reviewed_at = now()
          WHERE id = $1`,
        [existingId, player.name, player.gender, player.id]
      );
      await client.query(
        `DELETE FROM player_requests
          WHERE requester_user_id = $1
            AND tournament_id IS NULL
            AND id <> $2`,
        [userId, existingId]
      );
    } else {
      await client.query(
        `INSERT INTO player_requests (
           name,
           gender,
           phone,
           tournament_id,
           status,
           approved_player_id,
           requester_user_id,
           reviewed_at
         )
         VALUES ($1, $2, '', NULL, 'approved', $3, $4, now())`,
        [player.name, player.gender, player.id, userId]
      );
    }

    const avatarRes = await client.query('SELECT avatar_url FROM users WHERE id = $1 LIMIT 1', [userId]);
    const avatarUrl = sanitizeServerImageUrl(avatarRes.rows[0]?.avatar_url);
    if (avatarUrl) {
      await client.query('UPDATE players SET photo_url = $1 WHERE id = $2', [avatarUrl, player.id]);
      player.photoUrl = avatarUrl;
    }

    await client.query(
      `WITH cancelled_claims AS (
         UPDATE player_claims
            SET status = 'cancelled', updated_at = now()
          WHERE user_id = $1 AND status IN ('pending', 'approved')
          RETURNING id
       )
       UPDATE telegram_admin_outbox AS outbox
          SET sent_at = COALESCE(outbox.sent_at, now())
         FROM cancelled_claims AS claim
        WHERE outbox.sent_at IS NULL
          AND outbox.dedup_key = 'player_claim:' || claim.id::text`,
      [userId]
    );
    await client.query(
      `UPDATE users
          SET player_id = $2,
              telegram_onboarding_status = CASE
                WHEN telegram_user_id IS NOT NULL THEN 'approved'
                ELSE telegram_onboarding_status
              END
        WHERE id = $1`,
      [userId, player.id]
    );

    await client.query('COMMIT');
    return { linkedPlayer: player, error: null };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
      return {
        linkedPlayer: null,
        error: 'Эта карточка уже привязана к другому аккаунту.',
      };
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function unlinkPlayerFromAccount(userId: number): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    await client.query(
      `UPDATE users
          SET player_id = NULL,
              telegram_onboarding_status = CASE
                WHEN telegram_user_id IS NOT NULL THEN 'legacy'
                ELSE telegram_onboarding_status
              END
        WHERE id = $1`,
      [userId]
    );
    await client.query(
      `WITH cancelled_claims AS (
         UPDATE player_claims
            SET status = 'cancelled', updated_at = now()
          WHERE user_id = $1 AND status IN ('pending', 'approved')
          RETURNING id
       )
       UPDATE telegram_admin_outbox AS outbox
          SET sent_at = COALESCE(outbox.sent_at, now())
         FROM cancelled_claims AS claim
        WHERE outbox.sent_at IS NULL
          AND outbox.dedup_key = 'player_claim:' || claim.id::text`,
      [userId]
    );
    await client.query(
      `DELETE FROM player_requests
        WHERE requester_user_id = $1
          AND tournament_id IS NULL`,
      [userId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
