import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { sanitizeServerImageUrl } from '@/lib/server-image-url';
import type {
  CoachAttendanceStatus,
  CoachExternalIdentity,
  CoachIdentityCandidate,
  CoachTrainingParticipant,
  CoachTrainingSession,
  CoachTrainingSessionSummary,
  KotyaraParticipantInput,
  KotyaraTrainingSyncInput,
} from './session-types';

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function statusConflict(telegramStatus: string, yclientsStatus: string): boolean {
  return (telegramStatus === 'going' && yclientsStatus === 'cancelled')
    || (telegramStatus === 'not_going' && yclientsStatus === 'booked');
}

function mapSessionSummary(row: Record<string, unknown>): CoachTrainingSessionSummary {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    status: String(row.status ?? 'scheduled') as CoachTrainingSessionSummary['status'],
    location: String(row.location ?? ''),
    courtCount: Number(row.court_count ?? 0),
    capacity: row.capacity == null ? null : Number(row.capacity),
    yclientsRecordsCount: row.yclients_records_count == null ? null : Number(row.yclients_records_count),
    source: String(row.source ?? 'manual') as CoachTrainingSessionSummary['source'],
    externalEventId: row.external_event_id ? String(row.external_event_id) : null,
    yclientsEventId: row.yclients_event_id ? String(row.yclients_event_id) : null,
    telegramChatId: row.telegram_chat_id == null ? null : String(row.telegram_chat_id),
    telegramMessageId: row.telegram_message_id == null ? null : String(row.telegram_message_id),
    participantCount: Number(row.participant_count ?? 0),
    goingCount: Number(row.going_count ?? 0),
    unknownCount: Number(row.unknown_count ?? 0),
    conflictCount: Number(row.conflict_count ?? 0),
  };
}

const SESSION_SELECT = `
  SELECT session.id::text, session.title, session.starts_at, session.ends_at,
         session.status, session.location, session.court_count, session.capacity,
         session.yclients_records_count, session.source, session.external_event_id,
         session.yclients_event_id, session.telegram_chat_id, session.telegram_message_id,
         COALESCE(stats.participant_count, 0)::int AS participant_count,
         COALESCE(stats.going_count, 0)::int AS going_count,
         COALESCE(stats.unknown_count, 0)::int AS unknown_count,
         COALESCE(stats.conflict_count, 0)::int AS conflict_count
    FROM coach_training_sessions session
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS participant_count,
             COUNT(*) FILTER (WHERE participant.telegram_status = 'going')::int AS going_count,
             COUNT(*) FILTER (WHERE participant.player_id IS NULL)::int AS unknown_count,
             COUNT(*) FILTER (WHERE
               (participant.telegram_status = 'going' AND participant.yclients_status = 'cancelled')
               OR (participant.telegram_status = 'not_going' AND participant.yclients_status = 'booked')
             )::int AS conflict_count
        FROM coach_training_participants participant
       WHERE participant.training_session_id = session.id
    ) stats ON true`;

export async function listCoachTrainingSessions(view = 'upcoming'): Promise<CoachTrainingSessionSummary[]> {
  const normalized = ['upcoming', 'today', 'past', 'drafts', 'all'].includes(view) ? view : 'upcoming';
  const localToday = `(date_trunc('day', now() AT TIME ZONE 'Asia/Yekaterinburg') AT TIME ZONE 'Asia/Yekaterinburg')`;
  const conditions: Record<string, string> = {
    upcoming: `session.starts_at >= ${localToday} AND session.status NOT IN ('completed', 'cancelled', 'draft')`,
    today: `session.starts_at >= ${localToday} AND session.starts_at < ${localToday} + INTERVAL '1 day'`,
    past: `session.starts_at < ${localToday} OR session.status IN ('completed', 'cancelled')`,
    drafts: `session.status = 'draft'`,
    all: 'true',
  };
  const { rows } = await getPool().query(
    `${SESSION_SELECT}
      WHERE ${conditions[normalized]}
      ORDER BY CASE WHEN session.starts_at >= now() THEN 0 ELSE 1 END,
               CASE WHEN session.starts_at >= now() THEN session.starts_at END ASC,
               session.starts_at DESC
      LIMIT 300`,
  );
  return rows.map(mapSessionSummary);
}

export async function getCoachTrainingSession(sessionId: string): Promise<CoachTrainingSession | null> {
  const pool = getPool();
  const [{ rows: sessionRows }, { rows: participantRows }, { rows: identityRows }] = await Promise.all([
    pool.query(`${SESSION_SELECT} WHERE session.id = $1::uuid LIMIT 1`, [sessionId]),
    pool.query(
      `SELECT participant.id::text, participant.player_id::text, player.name AS player_name,
              participant.display_name, participant.telegram_status, participant.yclients_status,
              participant.actual_attendance, participant.joined_at
         FROM coach_training_participants participant
         LEFT JOIN players player ON player.id = participant.player_id
        WHERE participant.training_session_id = $1::uuid
        ORDER BY COALESCE(player.name, participant.display_name), participant.id`,
      [sessionId],
    ),
    pool.query(
      `SELECT link.training_participant_id::text, identity.id::text, identity.provider,
              identity.external_id, identity.player_id::text, player.name AS player_name,
              identity.display_name, identity.username, identity.resolution_status, identity.metadata
         FROM coach_training_participant_identities link
         JOIN coach_external_identities identity ON identity.id = link.external_identity_id
         LEFT JOIN players player ON player.id = identity.player_id
        WHERE link.training_session_id = $1::uuid
        ORDER BY identity.provider, identity.display_name`,
      [sessionId],
    ),
  ]);
  if (!sessionRows[0]) return null;
  const identitiesByParticipant = new Map<string, CoachExternalIdentity[]>();
  for (const row of identityRows) {
    const participantId = String(row.training_participant_id);
    const identities = identitiesByParticipant.get(participantId) ?? [];
    identities.push({
      id: String(row.id),
      provider: String(row.provider) as CoachExternalIdentity['provider'],
      externalId: String(row.external_id),
      playerId: row.player_id ? String(row.player_id) : null,
      playerName: row.player_name ? String(row.player_name) : null,
      displayName: String(row.display_name ?? ''),
      username: String(row.username ?? ''),
      resolutionStatus: String(row.resolution_status) as CoachExternalIdentity['resolutionStatus'],
      metadata: jsonObject(row.metadata),
    });
    identitiesByParticipant.set(participantId, identities);
  }
  const participants: CoachTrainingParticipant[] = participantRows.map((row) => ({
    id: String(row.id),
    playerId: row.player_id ? String(row.player_id) : null,
    playerName: row.player_name ? String(row.player_name) : null,
    displayName: String(row.display_name ?? ''),
    telegramStatus: String(row.telegram_status ?? 'unknown') as CoachTrainingParticipant['telegramStatus'],
    yclientsStatus: String(row.yclients_status ?? 'unknown') as CoachTrainingParticipant['yclientsStatus'],
    actualAttendance: String(row.actual_attendance ?? 'unknown') as CoachTrainingParticipant['actualAttendance'],
    joinedAt: asIso(row.joined_at),
    identities: identitiesByParticipant.get(String(row.id)) ?? [],
    statusConflict: statusConflict(String(row.telegram_status), String(row.yclients_status)),
  }));
  const summary = mapSessionSummary(sessionRows[0]);
  const { rows: metadataRows } = await pool.query(
    `SELECT source_metadata FROM coach_training_sessions WHERE id = $1::uuid LIMIT 1`,
    [sessionId],
  );
  return { ...summary, sourceMetadata: jsonObject(metadataRows[0]?.source_metadata), participants };
}

export async function createCoachTrainingSession(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  location: string;
  courtCount: number;
  capacity: number | null;
  actorId: string;
}): Promise<CoachTrainingSession> {
  const { rows } = await getPool().query(
    `INSERT INTO coach_training_sessions
      (title, starts_at, ends_at, status, location, court_count, capacity, source, created_by_actor, updated_by_actor)
     VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, 'manual', $8, $8)
     RETURNING id::text`,
    [input.title, input.startsAt, input.endsAt, input.status, input.location, input.courtCount, input.capacity, input.actorId],
  );
  const session = await getCoachTrainingSession(String(rows[0].id));
  if (!session) throw new Error('NotFound');
  return session;
}

function normalizedPayloadHash(input: KotyaraTrainingSyncInput): string {
  const payload = { ...input, participants: [...input.participants].sort((a, b) => `${a.provider}:${a.externalId}`.localeCompare(`${b.provider}:${b.externalId}`)) };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function inferPlayerId(client: PoolClient, participant: KotyaraParticipantInput): Promise<string | null> {
  if (participant.provider === 'telegram') {
    const { rows } = await client.query(
      `SELECT player_id::text FROM users WHERE telegram_user_id = $1 AND player_id IS NOT NULL LIMIT 1`,
      [participant.externalId],
    );
    return rows[0]?.player_id ? String(rows[0].player_id) : null;
  }
  if (participant.provider === 'lpvolley' && /^[0-9a-f-]{36}$/i.test(participant.externalId)) {
    const { rows } = await client.query(`SELECT id::text FROM players WHERE id = $1::uuid LIMIT 1`, [participant.externalId]);
    return rows[0]?.id ? String(rows[0].id) : null;
  }
  return null;
}

async function mergeParticipants(client: PoolClient, targetId: string, sourceId: string, sessionId: string): Promise<void> {
  await client.query(
    `UPDATE coach_training_participants target
        SET telegram_status = CASE WHEN target.telegram_status = 'unknown' THEN source.telegram_status ELSE target.telegram_status END,
            yclients_status = CASE WHEN target.yclients_status = 'unknown' THEN source.yclients_status ELSE target.yclients_status END,
            actual_attendance = CASE WHEN target.actual_attendance = 'unknown' THEN source.actual_attendance ELSE target.actual_attendance END,
            source_metadata = target.source_metadata || source.source_metadata
       FROM coach_training_participants source
      WHERE target.id = $1::uuid AND source.id = $2::uuid`,
    [targetId, sourceId],
  );
  await client.query(
    `UPDATE coach_training_participant_identities
        SET training_participant_id = $1::uuid
      WHERE training_participant_id = $2::uuid AND training_session_id = $3::uuid`,
    [targetId, sourceId, sessionId],
  );
  await client.query(`DELETE FROM coach_training_participants WHERE id = $1::uuid`, [sourceId]);
}

async function upsertParticipant(client: PoolClient, sessionId: string, participant: KotyaraParticipantInput): Promise<void> {
  const inferredPlayerId = await inferPlayerId(client, participant);
  if (inferredPlayerId) {
    await client.query(
      `INSERT INTO coach_athlete_profiles (player_id, level_code, status, joined_at, goals, limitations, created_by_actor)
       VALUES ($1::uuid, 'medium', 'active', CURRENT_DATE, '', '', 'integration:kotyara')
       ON CONFLICT (player_id) DO NOTHING`,
      [inferredPlayerId],
    );
  }
  const { rows: identityRows } = await client.query(
    `INSERT INTO coach_external_identities
      (player_id, provider, external_id, display_name, username, metadata, resolution_status, resolved_at, resolved_by_actor)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb,
             CASE WHEN $1::uuid IS NULL THEN 'unresolved' ELSE 'resolved' END,
             CASE WHEN $1::uuid IS NULL THEN NULL ELSE now() END,
             CASE WHEN $1::uuid IS NULL THEN NULL ELSE 'integration:kotyara' END)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       username = EXCLUDED.username,
       metadata = coach_external_identities.metadata || EXCLUDED.metadata,
       player_id = COALESCE(coach_external_identities.player_id, EXCLUDED.player_id),
       resolution_status = CASE WHEN COALESCE(coach_external_identities.player_id, EXCLUDED.player_id) IS NULL
                                THEN coach_external_identities.resolution_status ELSE 'resolved' END,
       resolved_at = CASE WHEN COALESCE(coach_external_identities.player_id, EXCLUDED.player_id) IS NULL
                          THEN coach_external_identities.resolved_at ELSE COALESCE(coach_external_identities.resolved_at, now()) END,
       resolved_by_actor = CASE WHEN COALESCE(coach_external_identities.player_id, EXCLUDED.player_id) IS NULL
                                THEN coach_external_identities.resolved_by_actor ELSE COALESCE(coach_external_identities.resolved_by_actor, 'integration:kotyara') END
     RETURNING id::text, player_id::text`,
    [inferredPlayerId, participant.provider, participant.externalId, participant.displayName, participant.username, JSON.stringify(participant.metadata)],
  );
  const identityId = String(identityRows[0].id);
  const playerId = identityRows[0].player_id ? String(identityRows[0].player_id) : null;
  const { rows: linkedRows } = await client.query(
    `SELECT participant.id::text
       FROM coach_training_participant_identities link
       JOIN coach_training_participants participant ON participant.id = link.training_participant_id
      WHERE link.training_session_id = $1::uuid AND link.external_identity_id = $2::uuid
      LIMIT 1`,
    [sessionId, identityId],
  );
  const linkedId = linkedRows[0]?.id ? String(linkedRows[0].id) : null;
  let canonicalId: string | null = null;
  if (playerId) {
    const { rows } = await client.query(
      `SELECT id::text FROM coach_training_participants WHERE training_session_id = $1::uuid AND player_id = $2::uuid LIMIT 1`,
      [sessionId, playerId],
    );
    canonicalId = rows[0]?.id ? String(rows[0].id) : null;
  }
  let participantId = canonicalId || linkedId;
  if (canonicalId && linkedId && canonicalId !== linkedId) {
    await mergeParticipants(client, canonicalId, linkedId, sessionId);
    participantId = canonicalId;
  }
  if (!participantId) {
    const { rows } = await client.query(
      `INSERT INTO coach_training_participants (training_session_id, player_id, display_name, source_metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb) RETURNING id::text`,
      [sessionId, playerId, participant.displayName, JSON.stringify(participant.metadata)],
    );
    participantId = String(rows[0].id);
  } else if (playerId) {
    await client.query(
      `UPDATE coach_training_participants SET player_id = COALESCE(player_id, $2::uuid) WHERE id = $1::uuid`,
      [participantId, playerId],
    );
  }
  await client.query(
    `INSERT INTO coach_training_participant_identities
      (training_participant_id, training_session_id, external_identity_id, provider)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
     ON CONFLICT (training_session_id, external_identity_id) DO UPDATE
       SET training_participant_id = EXCLUDED.training_participant_id, provider = EXCLUDED.provider`,
    [participantId, sessionId, identityId, participant.provider],
  );
  const statusColumn = participant.provider === 'telegram' ? 'telegram_status' : participant.provider === 'yclients' ? 'yclients_status' : null;
  const statusValue = participant.provider === 'telegram' ? participant.telegramStatus : participant.yclientsStatus;
  await client.query(
    `UPDATE coach_training_participants
        SET display_name = CASE WHEN $2 <> '' THEN $2 ELSE display_name END,
            source_metadata = source_metadata || $3::jsonb
            ${statusColumn ? `, ${statusColumn} = $4` : ''}
      WHERE id = $1::uuid`,
    statusColumn
      ? [participantId, participant.displayName, JSON.stringify(participant.metadata), statusValue]
      : [participantId, participant.displayName, JSON.stringify(participant.metadata)],
  );
}

export async function syncCoachTrainingFromKotyara(input: KotyaraTrainingSyncInput): Promise<{ session: CoachTrainingSession; duplicate: boolean }> {
  const client = await getPool().connect();
  const payloadHash = normalizedPayloadHash(input);
  let sessionId = '';
  let duplicate = false;
  try {
    await client.query('BEGIN');
    const { rows: previousRows } = await client.query(
      `SELECT payload_hash, training_session_id::text, status
         FROM coach_external_sync_events
        WHERE provider = 'kotyara' AND event_key = $1
        FOR UPDATE`,
      [input.eventKey],
    );
    if (previousRows[0]?.payload_hash === payloadHash && previousRows[0]?.status === 'processed' && previousRows[0]?.training_session_id) {
      sessionId = String(previousRows[0].training_session_id);
      duplicate = true;
    } else {
      const { rows } = await client.query(
        `INSERT INTO coach_training_sessions
          (title, starts_at, ends_at, status, location, court_count, capacity, yclients_records_count,
           source, external_event_id, telegram_chat_id, telegram_message_id, yclients_event_id,
           source_metadata, created_by_actor, updated_by_actor)
         VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8,
                 'kotyara', $9, $10::bigint, $11::bigint, $12, $13::jsonb,
                 'integration:kotyara', 'integration:kotyara')
         ON CONFLICT (source, external_event_id) DO UPDATE SET
           title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
           status = EXCLUDED.status, location = EXCLUDED.location, court_count = EXCLUDED.court_count,
           capacity = EXCLUDED.capacity, yclients_records_count = EXCLUDED.yclients_records_count,
           telegram_chat_id = COALESCE(EXCLUDED.telegram_chat_id, coach_training_sessions.telegram_chat_id),
           telegram_message_id = COALESCE(EXCLUDED.telegram_message_id, coach_training_sessions.telegram_message_id),
           yclients_event_id = COALESCE(EXCLUDED.yclients_event_id, coach_training_sessions.yclients_event_id),
           source_metadata = coach_training_sessions.source_metadata || EXCLUDED.source_metadata,
           updated_by_actor = 'integration:kotyara'
         RETURNING id::text`,
        [input.title, input.startsAt, input.endsAt, input.status, input.location, input.courtCount,
          input.capacity, input.yclientsRecordsCount, input.eventKey, input.telegramChatId,
          input.telegramMessageId, input.yclientsEventId, JSON.stringify(input.metadata)],
      );
      sessionId = String(rows[0].id);
      for (const participant of input.participants) await upsertParticipant(client, sessionId, participant);
      await client.query(
        `INSERT INTO coach_external_sync_events
          (provider, event_key, payload_hash, training_session_id, status, processed_at)
         VALUES ('kotyara', $1, $2, $3::uuid, 'processed', now())
         ON CONFLICT (provider, event_key) DO UPDATE SET
           payload_hash = EXCLUDED.payload_hash,
           training_session_id = EXCLUDED.training_session_id,
           status = 'processed', error_text = '', processed_at = now(),
           received_at = now(), attempt_count = coach_external_sync_events.attempt_count + 1`,
        [input.eventKey, payloadHash, sessionId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const session = await getCoachTrainingSession(sessionId);
  if (!session) throw new Error('NotFound');
  return { session, duplicate };
}

export async function updateCoachParticipantAttendance(input: {
  sessionId: string;
  participantId: string;
  attendance: CoachAttendanceStatus;
}): Promise<CoachTrainingSession> {
  const { rowCount } = await getPool().query(
    `UPDATE coach_training_participants
        SET actual_attendance = $3
      WHERE id = $2::uuid AND training_session_id = $1::uuid`,
    [input.sessionId, input.participantId, input.attendance],
  );
  if (!rowCount) throw new Error('NotFound');
  const session = await getCoachTrainingSession(input.sessionId);
  if (!session) throw new Error('NotFound');
  return session;
}

export async function listCoachIdentityCandidates(query = ''): Promise<CoachIdentityCandidate[]> {
  const { rows } = await getPool().query(
    `SELECT player.id::text AS player_id, player.name, player.gender,
            COALESCE(player.photo_url, '') AS photo_url,
            (profile.player_id IS NOT NULL) AS is_coach_athlete
       FROM players player
       LEFT JOIN coach_athlete_profiles profile ON profile.player_id = player.id
      WHERE player.status <> 'temporary'
        AND ($1 = '' OR player.name ILIKE '%' || $1 || '%')
      ORDER BY (profile.player_id IS NOT NULL) DESC, player.name ASC
      LIMIT 400`,
    [String(query || '').trim()],
  );
  return rows.map((row) => ({
    playerId: String(row.player_id),
    name: String(row.name),
    gender: String(row.gender) === 'W' ? 'W' : 'M',
    photoUrl: sanitizeServerImageUrl(row.photo_url),
    isCoachAthlete: Boolean(row.is_coach_athlete),
  }));
}

export async function resolveCoachExternalIdentity(input: {
  identityId: string;
  playerId: string;
  actorId: string;
}): Promise<{ identity: CoachExternalIdentity; sessionIds: string[] }> {
  const client = await getPool().connect();
  const sessionIds: string[] = [];
  try {
    await client.query('BEGIN');
    const { rows: playerRows } = await client.query(`SELECT id::text, name FROM players WHERE id = $1::uuid LIMIT 1`, [input.playerId]);
    if (!playerRows[0]) throw new Error('BadRequest: игрок не найден');
    const { rows: identityRows } = await client.query(
      `SELECT id::text, provider, external_id, display_name, username, metadata
         FROM coach_external_identities WHERE id = $1::uuid FOR UPDATE`,
      [input.identityId],
    );
    if (!identityRows[0]) throw new Error('NotFound');
    await client.query(
      `INSERT INTO coach_athlete_profiles (player_id, level_code, status, joined_at, goals, limitations, created_by_actor)
       VALUES ($1::uuid, 'medium', 'active', CURRENT_DATE, '', '', $2)
       ON CONFLICT (player_id) DO NOTHING`,
      [input.playerId, input.actorId],
    );
    const { rows: participantRows } = await client.query(
      `SELECT participant.id::text, participant.training_session_id::text
         FROM coach_training_participant_identities link
         JOIN coach_training_participants participant ON participant.id = link.training_participant_id
        WHERE link.external_identity_id = $1::uuid
        FOR UPDATE OF participant`,
      [input.identityId],
    );
    for (const row of participantRows) {
      const participantId = String(row.id);
      const sessionId = String(row.training_session_id);
      sessionIds.push(sessionId);
      const { rows: canonicalRows } = await client.query(
        `SELECT id::text FROM coach_training_participants
          WHERE training_session_id = $1::uuid AND player_id = $2::uuid AND id <> $3::uuid LIMIT 1`,
        [sessionId, input.playerId, participantId],
      );
      if (canonicalRows[0]) {
        await mergeParticipants(client, String(canonicalRows[0].id), participantId, sessionId);
      } else {
        await client.query(
          `UPDATE coach_training_participants SET player_id = $2::uuid, display_name = $3 WHERE id = $1::uuid`,
          [participantId, input.playerId, String(playerRows[0].name)],
        );
      }
    }
    const { rows } = await client.query(
      `UPDATE coach_external_identities
          SET player_id = $2::uuid, resolution_status = 'resolved', resolved_at = now(), resolved_by_actor = $3
        WHERE id = $1::uuid
      RETURNING id::text, provider, external_id, player_id::text, display_name, username, metadata, resolution_status`,
      [input.identityId, input.playerId, input.actorId],
    );
    await client.query('COMMIT');
    return {
      identity: {
        id: String(rows[0].id), provider: String(rows[0].provider) as CoachExternalIdentity['provider'],
        externalId: String(rows[0].external_id), playerId: String(rows[0].player_id),
        playerName: String(playerRows[0].name), displayName: String(rows[0].display_name ?? ''),
        username: String(rows[0].username ?? ''), resolutionStatus: 'resolved', metadata: jsonObject(rows[0].metadata),
      },
      sessionIds: [...new Set(sessionIds)],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
