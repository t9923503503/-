import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getPool } from '@/lib/db';
import type { PlayActor } from '@/lib/play-auth';

export class PlayGuestClaimError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeHashMatch(actualToken: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(actualToken), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validParticipantId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createPlayGuestClaimLink(
  actor: PlayActor,
  participantId: string,
  requestOrigin: string,
): Promise<{ url: string; expiresAt: string }> {
  if (!validParticipantId(participantId)) throw new PlayGuestClaimError(400, 'Некорректный участник');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const loaded = await client.query(
      `SELECT participant.id::text, participant.user_id, participant.guest_name,
              post.id::text AS post_id, organizer.owner_user_id
         FROM play_post_participants participant
         JOIN play_posts post ON post.id = participant.post_id
         JOIN play_organizers organizer ON organizer.id = post.organizer_id
        WHERE participant.id = $1::uuid
        FOR UPDATE OF participant`,
      [participantId],
    );
    const participant = loaded.rows[0];
    if (!participant) throw new PlayGuestClaimError(404, 'Гость не найден');
    const manager = actor.kind === 'admin' || Number(participant.owner_user_id) === actor.userId;
    if (!manager) throw new PlayGuestClaimError(403, 'Ссылку создаёт организатор или администратор');
    if (participant.user_id != null) throw new PlayGuestClaimError(409, 'Участник уже привязан к аккаунту');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query(
      `UPDATE play_post_participants
          SET guest_claim_token_hash = $2, guest_claim_expires_at = $3,
              name_snapshot = COALESCE(NULLIF(name_snapshot, ''), NULLIF(guest_name, ''), 'Игрок')
        WHERE id = $1::uuid`,
      [participantId, sha256(token), expiresAt.toISOString()],
    );
    await client.query('COMMIT');

    let origin = 'https://lpvolley.ru';
    try {
      const parsed = new URL(requestOrigin);
      if (['http:', 'https:'].includes(parsed.protocol)) origin = parsed.origin;
    } catch {}
    const claimUrl = new URL('/play/claim', origin);
    claimUrl.searchParams.set('participant', participantId);
    claimUrl.searchParams.set('token', token);
    return { url: claimUrl.toString(), expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function claimPlayGuest(
  userId: number,
  participantId: string,
  token: string,
): Promise<{ ok: true; postId: string }> {
  if (!validParticipantId(participantId) || token.length < 32 || token.length > 128) {
    throw new PlayGuestClaimError(400, 'Ссылка привязки повреждена');
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const loaded = await client.query(
      `SELECT participant.id::text, participant.post_id::text, participant.user_id,
              participant.guest_claim_token_hash, participant.guest_claim_expires_at
         FROM play_post_participants participant
        WHERE participant.id = $1::uuid
        FOR UPDATE`,
      [participantId],
    );
    const participant = loaded.rows[0];
    if (!participant) throw new PlayGuestClaimError(404, 'Гость не найден');
    if (participant.user_id != null) {
      if (Number(participant.user_id) !== userId) throw new PlayGuestClaimError(409, 'Гость уже привязан к другому аккаунту');
      await client.query('COMMIT');
      return { ok: true, postId: String(participant.post_id) };
    }
    const expectedHash = String(participant.guest_claim_token_hash || '');
    if (!expectedHash || !safeHashMatch(token, expectedHash)) throw new PlayGuestClaimError(403, 'Ссылка недействительна');
    if (!participant.guest_claim_expires_at || new Date(participant.guest_claim_expires_at).getTime() <= Date.now()) {
      throw new PlayGuestClaimError(410, 'Срок ссылки истёк — попросите организатора создать новую');
    }
    const duplicate = await client.query(
      `SELECT 1 FROM play_post_participants
        WHERE post_id = $1::uuid AND user_id = $2 AND id <> $3::uuid
          AND status IN ('pending', 'confirmed', 'reserve') LIMIT 1`,
      [String(participant.post_id), userId, participantId],
    );
    if (duplicate.rows[0]) throw new PlayGuestClaimError(409, 'Ваш аккаунт уже есть в составе этой игры');

    await client.query(
      `UPDATE play_post_participants
          SET user_id = $2,
              player_id = (SELECT player_id FROM users WHERE id = $2),
              guest_claim_token_hash = NULL,
              guest_claim_expires_at = NULL,
              guest_claimed_at = now()
        WHERE id = $1::uuid`,
      [participantId, userId],
    );
    await client.query('COMMIT');
    return { ok: true, postId: String(participant.post_id) };
  } catch (error) {
    await client.query('ROLLBACK');
    if (String((error as { code?: unknown })?.code || '') === '23505') {
      throw new PlayGuestClaimError(409, 'Ваш аккаунт уже есть в составе этой игры');
    }
    throw error;
  } finally {
    client.release();
  }
}
