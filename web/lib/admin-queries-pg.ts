import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { getPool } from './db';
import { getTournamentFormatCode, normalizeTournamentDbTime } from './admin-tournament-db';
import { enrichTournamentRuntimeState, resolveTournamentStatus } from './tournament-status';
import {
  buildLegacyIptTournamentState,
  buildLegacyPlayerDbState,
  isIptMixedFormat,
} from './admin-legacy-sync';
import {
  effectiveRatingPtsFromStored,
  ratingPointsForPlace,
  type RatingPool,
} from './rating-points';
import { augmentArchiveTournamentWithThaiBoard } from './thai-archive-meta';

export interface AdminTournament {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  level: string;
  capacity: number;
  status: string;
  participantCount: number;
  photoUrl: string;
  settings: Record<string, unknown>;
}

export interface AdminTournamentParticipantInput {
  playerId: string;
  position: number;
  isWaitlist?: boolean;
}

export interface ArchiveResult {
  playerName: string;
  gender: 'M' | 'W';
  placement: number;
  points: number;
  /** Очки в общий рейтинг за место (с учётом пула профи/новичок). */
  ratingPts: number;
  /** pro — полные очки за место; novice — половина (округление). */
  ratingPool?: RatingPool;
}

export interface ArchiveTournament extends AdminTournament {
  results: ArchiveResult[];
  /** Публичное табло Thai Next (`/live/thai/...`), иначе null. */
  thaiSpectatorBoardUrl: string | null;
  /** В `settings` сохранён снимок табло для истории. */
  thaiSpectatorBoardHasSnapshot: boolean;
}

export interface AdminPlayer {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status: PlayerStatus;
  ratingM: number;
  ratingW: number;
  ratingMix: number;
  wins: number;
  totalPts: number;
  tournamentsPlayed: number;
  photoUrl: string;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  skillLevel: PlayerSkillLevel | null;
  preferredPosition: PlayerPreferredPosition | null;
  mixReady: boolean;
  phone: string;
  telegram: string;
  adminComment: string;
}

export type PlayerStatus = 'active' | 'temporary' | 'inactive' | 'injured' | 'vacation';
export type PlayerSkillLevel = 'light' | 'medium' | 'advanced' | 'pro';
export type PlayerPreferredPosition = 'attacker' | 'defender' | 'universal' | 'setter' | 'blocker';

export interface AdminFilterPreset {
  id: string;
  actorId: string;
  name: string;
  scope: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const PLAYER_DB_EXTERNAL_ID = '__playerdb__';
let tournamentsColumnCache: Set<string> | null = null;

const PLAYER_STATUSES = new Set<PlayerStatus>(['active', 'temporary', 'inactive', 'injured', 'vacation']);
const PLAYER_SKILL_LEVELS = new Set<PlayerSkillLevel>(['light', 'medium', 'advanced', 'pro']);
const PLAYER_POSITIONS = new Set<PlayerPreferredPosition>(['attacker', 'defender', 'universal', 'setter', 'blocker']);
const PLAYER_SELECT = `
  id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts,
  COALESCE(tournaments_played, 0) AS tournaments_played,
  COALESCE(photo_url, '') AS photo_url,
  birth_date, height_cm, weight_kg, skill_level, preferred_position,
  COALESCE(mix_ready, false) AS mix_ready,
  COALESCE(phone, '') AS phone,
  COALESCE(telegram, '') AS telegram,
  COALESCE(admin_comment, '') AS admin_comment
`;

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

function mapTournament(row: Record<string, unknown>): AdminTournament {
  return enrichTournamentRuntimeState({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    date: toIsoDate(row.date),
    time: String(row.time ?? ''),
    location: String(row.location ?? ''),
    format: String(row.format ?? ''),
    division: String(row.division ?? ''),
    level: String(row.level ?? ''),
    capacity: Number(row.capacity ?? 0),
    status: String(row.status ?? 'open'),
    participantCount: Number(row.participant_count ?? 0),
    photoUrl: String(row.photo_url ?? ''),
    settings: (typeof row.settings === 'object' && row.settings !== null ? row.settings : {}) as Record<string, unknown>,
  });
}

function mapPlayer(row: Record<string, unknown>): AdminPlayer {
  const status = String(row.status ?? 'active') as PlayerStatus;
  const skillLevel = String(row.skill_level ?? '') as PlayerSkillLevel;
  const preferredPosition = String(row.preferred_position ?? '') as PlayerPreferredPosition;
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    status: PLAYER_STATUSES.has(status) ? status : 'active',
    ratingM: Number(row.rating_m ?? 0),
    ratingW: Number(row.rating_w ?? 0),
    ratingMix: Number(row.rating_mix ?? 0),
    wins: Number(row.wins ?? 0),
    totalPts: Number(row.total_pts ?? 0),
    tournamentsPlayed: Number(row.tournaments_played ?? 0),
    photoUrl: String(row.photo_url ?? ''),
    birthDate: toIsoDate(row.birth_date),
    heightCm: row.height_cm == null ? null : Number(row.height_cm),
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    skillLevel: PLAYER_SKILL_LEVELS.has(skillLevel) ? skillLevel : null,
    preferredPosition: PLAYER_POSITIONS.has(preferredPosition) ? preferredPosition : null,
    mixReady: Boolean(row.mix_ready),
    phone: String(row.phone ?? ''),
    telegram: String(row.telegram ?? ''),
    adminComment: String(row.admin_comment ?? ''),
  };
}

function mapFilterPreset(row: Record<string, unknown>): AdminFilterPreset {
  return {
    id: String(row.id ?? ''),
    actorId: String(row.actor_id ?? ''),
    name: String(row.name ?? ''),
    scope: String(row.scope ?? ''),
    filters:
      row.filters && typeof row.filters === 'object' && !Array.isArray(row.filters)
        ? (row.filters as Record<string, unknown>)
        : {},
    createdAt: row.created_at ? String(row.created_at) : '',
    updatedAt: row.updated_at ? String(row.updated_at) : '',
  };
}

function playerDbPayload(input: Partial<AdminPlayer>): Record<string, unknown> {
  const skillLevel = String(input.skillLevel ?? '').trim();
  const preferredPosition = String(input.preferredPosition ?? '').trim();
  return {
    name: String(input.name || '').trim(),
    gender: String(input.gender || 'M') === 'W' ? 'W' : 'M',
    status: PLAYER_STATUSES.has(input.status as PlayerStatus) ? input.status : 'active',
    rating_m: Number(input.ratingM || 0),
    rating_w: Number(input.ratingW || 0),
    rating_mix: Number(input.ratingMix || 0),
    wins: Number(input.wins || 0),
    total_pts: Number(input.totalPts || 0),
    tournaments_played: Number(input.tournamentsPlayed || 0),
    photo_url: String(input.photoUrl || '') || null,
    birth_date: String(input.birthDate || '').trim() || null,
    height_cm: input.heightCm == null || input.heightCm === 0 ? null : Number(input.heightCm),
    weight_kg: input.weightKg == null || input.weightKg === 0 ? null : Number(input.weightKg),
    skill_level: PLAYER_SKILL_LEVELS.has(skillLevel as PlayerSkillLevel) ? skillLevel : null,
    preferred_position: PLAYER_POSITIONS.has(preferredPosition as PlayerPreferredPosition)
      ? preferredPosition
      : null,
    mix_ready: Boolean(input.mixReady),
    phone: String(input.phone || '').trim() || null,
    telegram: String(input.telegram || '').trim() || null,
    admin_comment: String(input.adminComment || '').trim() || null,
  };
}

async function getTournamentTableColumnsTx(client: PoolClient): Promise<Set<string>> {
  if (tournamentsColumnCache) return tournamentsColumnCache;
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tournaments'
    `
  );
  tournamentsColumnCache = new Set(rows.map((row) => String(row.column_name ?? '')));
  return tournamentsColumnCache;
}

function buildDynamicUpdateSql(
  tableName: string,
  idColumn: string,
  idValue: string,
  updates: Record<string, unknown>
): { sql: string; values: unknown[] } | null {
  const entries = Object.entries(updates);
  if (entries.length === 0) return null;

  const values: unknown[] = [idValue];
  const assignments = entries.map(([column, value], index) => {
    values.push(value);
    return `${column} = $${index + 2}`;
  });

  return {
    sql: `UPDATE ${tableName} SET ${assignments.join(', ')} WHERE ${idColumn} = $1`,
    values,
  };
}

async function listTournamentPlayersForLegacyTx(client: PoolClient, tournamentId: string): Promise<AdminPlayer[]> {
  const { rows } = await client.query(
    `
      SELECT
        p.id,
        p.name,
        p.gender,
        p.status,
        p.rating_m,
        p.rating_w,
        p.rating_mix,
        p.wins,
        p.total_pts,
        p.tournaments_played,
        p.photo_url,
        p.birth_date,
        p.height_cm,
        p.weight_kg,
        p.skill_level,
        p.preferred_position,
        p.mix_ready,
        p.phone,
        p.telegram,
        p.admin_comment
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1
      ORDER BY tp.position ASC, tp.registered_at ASC, p.name ASC
    `,
    [tournamentId]
  );
  return rows.map((row) => mapPlayer(row));
}

async function listPlayersForLegacySnapshotTx(client: PoolClient): Promise<AdminPlayer[]> {
  const { rows } = await client.query(
    `
      SELECT ${PLAYER_SELECT}
      FROM players
      ORDER BY name ASC
    `
  );
  return rows.map((row) => mapPlayer(row));
}

async function upsertLegacyPlayerDbSnapshotTx(client: PoolClient, columns: Set<string>): Promise<void> {
  if (!columns.has('external_id') || !columns.has('game_state')) return;

  const players = await listPlayersForLegacySnapshotTx(client);
  const now = new Date().toISOString();
  const valuesByColumn: Record<string, unknown> = {
    id: PLAYER_DB_EXTERNAL_ID,
    name: PLAYER_DB_EXTERNAL_ID,
    date: '2000-01-01',
    time: null,
    location: '',
    format: 'system',
    division: null,
    level: null,
    capacity: 4,
    status: 'finished',
    photo_url: null,
    settings: {},
    external_id: PLAYER_DB_EXTERNAL_ID,
    game_state: buildLegacyPlayerDbState(players),
    synced_at: now,
  };

  const insertColumns = [
    'id',
    'name',
    'date',
    'time',
    'location',
    'format',
    'division',
    'level',
    'capacity',
    'status',
    'photo_url',
    'settings',
    'external_id',
    'game_state',
    ...(columns.has('synced_at') ? ['synced_at'] : []),
    ...(columns.has('format_code') ? ['format_code'] : []),
  ];

  const values = insertColumns.map((column) => valuesByColumn[column]);
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
  const updateColumns = insertColumns.filter((column) => column !== 'id' && column !== 'external_id');
  const updateAssignments = updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(', ');

  await client.query(
    `
      INSERT INTO tournaments (${insertColumns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (external_id) DO UPDATE
      SET ${updateAssignments}
    `,
    values
  );
}

async function syncLegacyTournamentSnapshotTx(
  client: PoolClient,
  tournament: AdminTournament
): Promise<void> {
  const columns = await getTournamentTableColumnsTx(client);
  if (!columns.has('external_id')) return;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    external_id: tournament.id,
  };

  if (isIptMixedFormat(tournament.format) && columns.has('game_state')) {
    const participants = await listTournamentPlayersForLegacyTx(client, tournament.id);
    updates.game_state = buildLegacyIptTournamentState({
      id: tournament.id,
      name: tournament.name,
      date: tournament.date,
      time: tournament.time,
      location: tournament.location,
      format: tournament.format,
      division: tournament.division,
      level: tournament.level,
      status: tournament.status,
      settings: tournament.settings,
      participants,
    });
  } else if (columns.has('game_state')) {
    updates.game_state = null;
  }

  if (columns.has('format_code')) {
    updates.format_code = getTournamentFormatCode(tournament.format);
  }

  if (columns.has('synced_at')) {
    updates.synced_at = now;
  }

  const query = buildDynamicUpdateSql('tournaments', 'id', tournament.id, updates);
  if (query) {
    await client.query(query.sql, query.values);
  }

  if (isIptMixedFormat(tournament.format)) {
    await upsertLegacyPlayerDbSnapshotTx(client, columns);
  }
}

export async function listTournaments(query = ''): Promise<AdminTournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const term = String(query || '').trim();
  const hasFilter = term.length > 0;
  const { rows } = await pool.query(
    `
      SELECT t.*, COUNT(tp.id) FILTER (WHERE COALESCE(tp.is_waitlist, false) = false)::int AS participant_count
      FROM tournaments t
      LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
      ${hasFilter
        ? "WHERE COALESCE(t.name, '') <> '__playerdb__' AND (t.name ILIKE $1 OR t.location ILIKE $1 OR t.status ILIKE $1)"
        : "WHERE COALESCE(t.name, '') <> '__playerdb__'"}
      GROUP BY t.id
      ORDER BY t.date DESC, t.time DESC
      LIMIT 200
    `,
    hasFilter ? [`%${term}%`] : []
  );
  return rows.map((row) => mapTournament(row));
}

async function replaceTournamentParticipantsTx(
  client: PoolClient,
  tournamentId: string,
  participants?: AdminTournamentParticipantInput[]
): Promise<number> {
  if (!participants) {
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS participant_count
       FROM tournament_participants
       WHERE tournament_id = $1 AND is_waitlist = false`,
      [tournamentId]
    );
    return Number(countRes.rows[0]?.participant_count ?? 0);
  }

  await client.query(`DELETE FROM tournament_participants WHERE tournament_id = $1`, [tournamentId]);

  let inserted = 0;
  const normalized = [...participants].sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  for (const [index, participant] of normalized.entries()) {
    await client.query(
      `INSERT INTO tournament_participants (tournament_id, player_id, is_waitlist, position)
       VALUES ($1, $2, $3, $4)`,
      [
        tournamentId,
        participant.playerId,
        Boolean(participant.isWaitlist),
        Math.max(1, Number(participant.position || index + 1)),
      ]
    );
    inserted += 1;
  }
  return inserted;
}

async function insertParticipantTx(
  client: PoolClient,
  tournamentId: string,
  playerId: string
): Promise<{ ok: boolean; waitlist: boolean; message: string }> {
  const tRes = await client.query(
    `SELECT id, status, date, time, capacity
     FROM tournaments
     WHERE id = $1
     FOR UPDATE`,
    [tournamentId]
  );
  const tournament = tRes.rows[0];
  if (!tournament) {
    return { ok: false, waitlist: false, message: 'Tournament not found' };
  }

  const countRes = await client.query(
    `SELECT COUNT(*)::int AS cnt
     FROM tournament_participants
     WHERE tournament_id = $1 AND is_waitlist = false`,
    [tournamentId]
  );
  const participantCount = Number(countRes.rows[0]?.cnt ?? 0);
  const effectiveStatus = resolveTournamentStatus({
    status: String(tournament.status ?? 'open'),
    date: toIsoDate(tournament.date),
    time: String(tournament.time ?? ''),
    capacity: Number(tournament.capacity ?? 0),
    participantCount,
  });

  if (effectiveStatus === 'finished' || effectiveStatus === 'cancelled') {
    return {
      ok: false,
      waitlist: false,
      message: `Tournament is ${effectiveStatus}`,
    };
  }

  const isWaitlist = effectiveStatus === 'full';
  const posRes = await client.query(
    `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
     FROM tournament_participants
     WHERE tournament_id = $1 AND is_waitlist = $2`,
    [tournamentId, isWaitlist]
  );
  const nextPos = Number(posRes.rows[0]?.next_pos ?? 1);

  const insRes = await client.query(
    `INSERT INTO tournament_participants (tournament_id, player_id, is_waitlist, position)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tournament_id, player_id) DO NOTHING
     RETURNING id`,
    [tournamentId, playerId, isWaitlist, nextPos]
  );

  if (!insRes.rows[0]) {
    return { ok: false, waitlist: false, message: 'Player already registered' };
  }

  return {
    ok: true,
    waitlist: isWaitlist,
    message: isWaitlist ? 'Added to waitlist' : 'Registered',
  };
}

export async function createTournament(
  input: Partial<AdminTournament> & { participants?: AdminTournamentParticipantInput[] }
): Promise<AdminTournament> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = String(input.id || randomUUID());
    const settingsJson = input.settings ? JSON.stringify(input.settings) : '{}';
    const { rows } = await client.query(
      `INSERT INTO tournaments
        (id, name, date, time, location, format, division, level, capacity, status, photo_url, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url, settings`,
      [
        id,
        String(input.name || '').trim(),
        String(input.date || '').trim(),
        normalizeTournamentDbTime(input.time),
        String(input.location || ''),
        String(input.format || ''),
        String(input.division || ''),
        String(input.level || ''),
        Number(input.capacity || 0),
        String(input.status || 'open'),
        String(input.photoUrl || '') || null,
        settingsJson,
      ]
    );
    const participantCount = await replaceTournamentParticipantsTx(client, id, input.participants);
    const created = { ...mapTournament(rows[0] ?? {}), participantCount };
    await syncLegacyTournamentSnapshotTx(client, created);
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTournament(
  id: string,
  input: Partial<AdminTournament> & { participants?: AdminTournamentParticipantInput[] }
): Promise<AdminTournament | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settingsJson = input.settings ? JSON.stringify(input.settings) : '{}';
    const { rows } = await client.query(
      `UPDATE tournaments
       SET name=$2, date=$3, time=$4, location=$5, format=$6, division=$7, level=$8, capacity=$9, status=$10, photo_url=$11, settings=$12
       WHERE id=$1
       RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url, settings`,
      [
        id,
        String(input.name || '').trim(),
        String(input.date || '').trim(),
        normalizeTournamentDbTime(input.time),
        String(input.location || ''),
        String(input.format || ''),
        String(input.division || ''),
        String(input.level || ''),
        Number(input.capacity || 0),
        String(input.status || 'open'),
        String(input.photoUrl || '') || null,
        settingsJson,
      ]
    );
    const data = rows[0];
    if (!data) {
      await client.query('ROLLBACK');
      return null;
    }

    const participantCount = await replaceTournamentParticipantsTx(client, id, input.participants);
    const updated = { ...mapTournament(data), participantCount };
    await syncLegacyTournamentSnapshotTx(client, updated);
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTournament(id: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getTournamentById(id: string): Promise<AdminTournament | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT t.*, COUNT(tp.id) FILTER (WHERE COALESCE(tp.is_waitlist, false) = false)::int AS participant_count
      FROM tournaments t
      LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
      WHERE t.id = $1
      GROUP BY t.id
      LIMIT 1
    `,
    [id]
  );
  const data = rows[0];
  return data ? mapTournament(data) : null;
}

export async function getTournamentLegacyGameStateById(id: string): Promise<Record<string, unknown> | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT game_state
      FROM tournaments
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  const state = rows[0]?.game_state;
  return state && typeof state === 'object' && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : null;
}

export async function listPlayers(query = ''): Promise<AdminPlayer[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const term = String(query || '').trim();
  const hasFilter = term.length > 0;
  const { rows } = await pool.query(
    `
      SELECT ${PLAYER_SELECT}
      FROM players
      ${hasFilter ? 'WHERE name ILIKE $1 OR id::text ILIKE $1' : ''}
      ORDER BY name ASC
      LIMIT 2000
    `,
    hasFilter ? [`%${term}%`] : []
  );
  return rows.map((row) => mapPlayer(row));
}

export async function getPlayerById(id: string): Promise<AdminPlayer | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${PLAYER_SELECT} FROM players WHERE id = $1 LIMIT 1`,
    [id]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function getPlayersByIds(ids: string[]): Promise<AdminPlayer[]> {
  if (!process.env.DATABASE_URL) return [];
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalizedIds.length) return [];

  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT ${PLAYER_SELECT}
      FROM players
      WHERE id::text = ANY($1::text[])
    `,
    [normalizedIds],
  );
  return rows.map((row) => mapPlayer(row));
}

export async function createPlayer(input: Partial<AdminPlayer>): Promise<AdminPlayer> {
  const pool = getPool();
  const id = String(input.id || randomUUID());
  const payload = playerDbPayload(input);
  const { rows } = await pool.query(
    `INSERT INTO players
      (id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts,
       tournaments_played, photo_url, birth_date, height_cm, weight_kg, skill_level,
       preferred_position, mix_ready, phone, telegram, admin_comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING ${PLAYER_SELECT}`,
    [
      id,
      payload.name,
      payload.gender,
      payload.status,
      payload.rating_m,
      payload.rating_w,
      payload.rating_mix,
      payload.wins,
      payload.total_pts,
      payload.tournaments_played,
      payload.photo_url,
      payload.birth_date,
      payload.height_cm,
      payload.weight_kg,
      payload.skill_level,
      payload.preferred_position,
      payload.mix_ready,
      payload.phone,
      payload.telegram,
      payload.admin_comment,
    ]
  );
  return mapPlayer(rows[0] ?? {});
}

export async function updatePlayer(id: string, input: Partial<AdminPlayer>): Promise<AdminPlayer | null> {
  const pool = getPool();
  const payload = playerDbPayload(input);
  const { rows } = await pool.query(
    `UPDATE players
     SET name=$2, gender=$3, status=$4, rating_m=$5, rating_w=$6, rating_mix=$7, wins=$8, total_pts=$9,
         tournaments_played=$10, photo_url=$11, birth_date=$12, height_cm=$13, weight_kg=$14,
         skill_level=$15, preferred_position=$16, mix_ready=$17, phone=$18, telegram=$19, admin_comment=$20
     WHERE id=$1
     RETURNING ${PLAYER_SELECT}`,
    [
      id,
      payload.name,
      payload.gender,
      payload.status,
      payload.rating_m,
      payload.rating_w,
      payload.rating_mix,
      payload.wins,
      payload.total_pts,
      payload.tournaments_played,
      payload.photo_url,
      payload.birth_date,
      payload.height_cm,
      payload.weight_kg,
      payload.skill_level,
      payload.preferred_position,
      payload.mix_ready,
      payload.phone,
      payload.telegram,
      payload.admin_comment,
    ]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function deletePlayer(id: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query('DELETE FROM players WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Объединяет ключи в `tournaments.settings` без затрагивания состава участников. */
export async function listFilterPresets(actorId: string, scope: string): Promise<AdminFilterPreset[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, actor_id, name, scope, filters, created_at, updated_at
     FROM admin_filter_presets
     WHERE actor_id = $1 AND scope = $2
     ORDER BY updated_at DESC, name ASC`,
    [actorId, scope],
  );
  return rows.map((row) => mapFilterPreset(row));
}

export async function upsertFilterPreset(input: {
  id?: string;
  actorId: string;
  scope: string;
  name: string;
  filters: Record<string, unknown>;
}): Promise<AdminFilterPreset> {
  const pool = getPool();
  const id = String(input.id || randomUUID());
  const { rows } = await pool.query(
    `INSERT INTO admin_filter_presets (id, actor_id, name, scope, filters)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (actor_id, scope, name) DO UPDATE
       SET filters = EXCLUDED.filters,
           updated_at = now()
     RETURNING id, actor_id, name, scope, filters, created_at, updated_at`,
    [
      id,
      String(input.actorId || '').trim(),
      String(input.name || '').trim(),
      String(input.scope || '').trim(),
      JSON.stringify(input.filters ?? {}),
    ],
  );
  return mapFilterPreset(rows[0] ?? {});
}

export async function deleteFilterPreset(input: {
  id: string;
  actorId: string;
  scope: string;
}): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM admin_filter_presets
     WHERE id = $1 AND actor_id = $2 AND scope = $3`,
    [input.id, input.actorId, input.scope],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function mergeTournamentSettingsKeys(
  id: string,
  patch: Record<string, unknown>,
): Promise<AdminTournament | null> {
  const current = await getTournamentById(id);
  if (!current) return null;
  const settings = { ...current.settings, ...patch };
  return updateTournament(id, {
    name: current.name,
    date: current.date,
    time: current.time,
    location: current.location,
    format: current.format,
    division: current.division,
    level: current.level,
    capacity: current.capacity,
    status: current.status,
    photoUrl: current.photoUrl,
    settings,
  });
}

export async function applyTournamentStatusOverride(input: {
  tournamentId: string;
  status: string;
}): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments SET status = $2 WHERE id = $1
     RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url, settings`,
    [input.tournamentId, input.status]
  );
  const data = rows[0];
  if (!data) return null;
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count
     FROM tournament_participants
     WHERE tournament_id = $1 AND is_waitlist = false`,
    [input.tournamentId]
  );
  return {
    ...mapTournament(data),
    participantCount: Number(countRes.rows[0]?.participant_count ?? 0),
  };
}

export async function applyPlayerRecalcOverride(input: { playerId: string }): Promise<AdminPlayer | null> {
  const pool = getPool();
  const totalsRes = await pool.query(
    `SELECT
       COALESCE(SUM(wins), 0)::int AS wins,
       COALESCE(SUM(game_pts), 0)::int AS total_pts
     FROM tournament_results
     WHERE player_id = $1`,
    [input.playerId]
  );
  const wins = Number(totalsRes.rows[0]?.wins ?? 0);
  const totalPts = Number(totalsRes.rows[0]?.total_pts ?? 0);
  const { rows } = await pool.query(
    `UPDATE players
     SET wins = $2, total_pts = $3
     WHERE id = $1
     RETURNING ${PLAYER_SELECT}`,
    [input.playerId, wins, totalPts]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function applyPlayerRatingOverride(input: {
  playerId: string;
  ratingM?: number;
  ratingW?: number;
  ratingMix?: number;
}): Promise<AdminPlayer | null> {
  const pool = getPool();
  const current = await getPlayerById(input.playerId);
  if (!current) return null;
  const nextRatingM = input.ratingM != null ? Number(input.ratingM) : current.ratingM;
  const nextRatingW = input.ratingW != null ? Number(input.ratingW) : current.ratingW;
  const nextRatingMix = input.ratingMix != null ? Number(input.ratingMix) : current.ratingMix;

  const { rows } = await pool.query(
    `UPDATE players
     SET rating_m = $2, rating_w = $3, rating_mix = $4
     WHERE id = $1
     RETURNING ${PLAYER_SELECT}`,
    [input.playerId, nextRatingM, nextRatingW, nextRatingMix]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

// ═══════════════════════════════════════════════════════════
// ROSTER: Участники турнира
// ═══════════════════════════════════════════════════════════

export interface RosterParticipant {
  id: string;
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  isWaitlist: boolean;
  position: number;
  registeredAt: string;
}

function mapParticipant(row: Record<string, unknown>): RosterParticipant {
  return {
    id: String(row.id ?? ''),
    playerId: String(row.player_id ?? ''),
    playerName: String(row.player_name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    isWaitlist: Boolean(row.is_waitlist),
    position: Number(row.position ?? 0),
    registeredAt: row.registered_at ? String(row.registered_at) : '',
  };
}

export async function listRosterParticipants(tournamentId: string): Promise<RosterParticipant[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT tp.id, tp.player_id, p.name AS player_name, p.gender,
            tp.is_waitlist, tp.position, tp.registered_at
     FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = $1
     ORDER BY tp.is_waitlist ASC, tp.position ASC`,
    [tournamentId]
  );
  return rows.map((r) => mapParticipant(r));
}

export async function addParticipant(
  tournamentId: string,
  playerId: string
): Promise<{ ok: boolean; waitlist: boolean; message: string }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await insertParticipantTx(client, tournamentId, playerId);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function removeParticipant(
  tournamentId: string,
  playerId: string
): Promise<{ removed: boolean; promotedPlayerId: string | null }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);

    const delRes = await client.query(
      `DELETE FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2 RETURNING is_waitlist`,
      [tournamentId, playerId]
    );
    if (!delRes.rows[0]) { await client.query('COMMIT'); return { removed: false, promotedPlayerId: null }; }

    let promotedPlayerId: string | null = null;
    const wasMain = !delRes.rows[0].is_waitlist;
    if (wasMain) {
      const promRes = await client.query(
        `UPDATE tournament_participants
         SET is_waitlist = false
         WHERE id = (
           SELECT id FROM tournament_participants
           WHERE tournament_id = $1 AND is_waitlist = true
           ORDER BY position ASC LIMIT 1
         )
         RETURNING player_id`,
        [tournamentId]
      );
      promotedPlayerId = promRes.rows[0]?.player_id ?? null;
    }
    await client.query('COMMIT');
    return { removed: true, promotedPlayerId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function promoteFromWaitlist(
  tournamentId: string,
  playerId: string
): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE tournament_participants
     SET is_waitlist = false, position = (
       SELECT COALESCE(MAX(position), 0) + 1
       FROM tournament_participants
       WHERE tournament_id = $1 AND is_waitlist = false
     )
     WHERE tournament_id = $1 AND player_id = $2 AND is_waitlist = true`,
    [tournamentId, playerId]
  );
  return (rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════
// REQUESTS: Заявки игроков
// ═══════════════════════════════════════════════════════════

export interface PlayerRequest {
  id: string;
  name: string;
  gender: string;
  phone: string;
  tournamentId: string;
  tournamentName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
}

function mapRequest(row: Record<string, unknown>): PlayerRequest {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? ''),
    phone: String(row.phone ?? ''),
    tournamentId: String(row.tournament_id ?? ''),
    tournamentName: String(row.tournament_name ?? ''),
    status: (['pending', 'approved', 'rejected'].includes(String(row.status)) ? String(row.status) : 'pending') as PlayerRequest['status'],
    createdAt: row.created_at ? String(row.created_at) : '',
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

export async function listPendingRequests(tournamentId?: string): Promise<PlayerRequest[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const hasFilter = Boolean(tournamentId);
  const { rows } = await pool.query(
    `SELECT pr.*, t.name AS tournament_name
     FROM player_requests pr
     LEFT JOIN tournaments t ON t.id = pr.tournament_id
     WHERE pr.status = 'pending'
     ${hasFilter ? 'AND pr.tournament_id = $1' : ''}
     ORDER BY pr.created_at DESC
     LIMIT 200`,
    hasFilter ? [tournamentId] : []
  );
  return rows.map((r) => mapRequest(r));
}

export async function approveRequest(
  requestId: string
): Promise<{ request: PlayerRequest | null; newPlayerId: string | null; error?: string | null }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reqRes = await client.query(
      `SELECT * FROM player_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    const req = reqRes.rows[0];
    if (!req || req.status !== 'pending') {
      await client.query('ROLLBACK');
      return { request: null, newPlayerId: null, error: 'Request not found or already processed' };
    }

    const playerRes = await client.query(
      `INSERT INTO players (name, gender, status, phone)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (lower(trim(name)), gender) DO UPDATE SET phone = COALESCE(NULLIF($3, ''), players.phone)
       RETURNING id`,
      [req.name, req.gender, req.phone || '']
    );
    const newPlayerId = String(playerRes.rows[0]?.id ?? '');

    if (req.tournament_id) {
      const insertResult = await insertParticipantTx(client, req.tournament_id, newPlayerId);
      if (!insertResult.ok && insertResult.message !== 'Player already registered') {
        await client.query('ROLLBACK');
        return { request: null, newPlayerId: null, error: insertResult.message };
      }
    }

    await client.query(
      `UPDATE player_requests
       SET status = 'approved', approved_player_id = $2, reviewed_at = now()
       WHERE id = $1`,
      [requestId, newPlayerId]
    );

    const updRes = await client.query(
      `SELECT pr.*, t.name AS tournament_name
       FROM player_requests pr LEFT JOIN tournaments t ON t.id = pr.tournament_id
       WHERE pr.id = $1`,
      [requestId]
    );
    await client.query('COMMIT');
    return { request: updRes.rows[0] ? mapRequest(updRes.rows[0]) : null, newPlayerId, error: null };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectRequest(requestId: string): Promise<PlayerRequest | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE player_requests
     SET status = 'rejected', reviewed_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [requestId]
  );
  if (!rows[0]) return null;
  const full = await pool.query(
    `SELECT pr.*, t.name AS tournament_name
     FROM player_requests pr LEFT JOIN tournaments t ON t.id = pr.tournament_id
     WHERE pr.id = $1`,
    [requestId]
  );
  return full.rows[0] ? mapRequest(full.rows[0]) : null;
}

// ═══════════════════════════════════════════════════════════
// MERGE: Склейка временных профилей
// ═══════════════════════════════════════════════════════════

export interface TempPlayer {
  id: string;
  name: string;
  gender: 'M' | 'W';
  tournamentsPlayed: number;
}

export async function listTempPlayers(): Promise<TempPlayer[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, gender, tournaments_played
     FROM players WHERE status = 'temporary'
     ORDER BY name ASC LIMIT 200`
  );
  return rows.map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    gender: String(r.gender ?? 'M') === 'W' ? 'W' as const : 'M' as const,
    tournamentsPlayed: Number(r.tournaments_played ?? 0),
  }));
}

export async function mergeTempPlayer(
  tempId: string,
  realId: string
): Promise<{ ok: boolean; moved: number; message: string }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bothRes = await client.query(
      `SELECT id, name, gender, status, tournaments_played, total_pts FROM players WHERE id IN ($1, $2) FOR UPDATE`,
      [tempId, realId]
    );
    const tempRow = bothRes.rows.find((r: Record<string, unknown>) => String(r.id) === tempId);
    const realRow = bothRes.rows.find((r: Record<string, unknown>) => String(r.id) === realId);

    if (!tempRow) { await client.query('ROLLBACK'); return { ok: false, moved: 0, message: 'Temp player not found' }; }
    if (!realRow) { await client.query('ROLLBACK'); return { ok: false, moved: 0, message: 'Target player not found' }; }
    if (tempRow.status !== 'temporary') { await client.query('ROLLBACK'); return { ok: false, moved: 0, message: 'Source is not temporary' }; }

    const tpRes = await client.query(
      `SELECT tournament_id FROM tournament_participants WHERE player_id = $1`,
      [tempId]
    );
    let moved = 0;
    for (const tp of tpRes.rows) {
      const upd = await client.query(
        `UPDATE tournament_participants SET player_id = $2
         WHERE tournament_id = $1 AND player_id = $3
         AND NOT EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2)`,
        [tp.tournament_id, realId, tempId]
      );
      if ((upd.rowCount ?? 0) > 0) moved++;
    }
    await client.query(`DELETE FROM tournament_participants WHERE player_id = $1`, [tempId]);

    await client.query(
      `UPDATE player_requests SET approved_player_id = $2 WHERE approved_player_id = $1`,
      [tempId, realId]
    );

    await client.query(
      `UPDATE players SET
         tournaments_played = tournaments_played + $2,
         total_pts = total_pts + $3
       WHERE id = $1`,
      [realId, Number(tempRow.tournaments_played ?? 0), Number(tempRow.total_pts ?? 0)]
    );

    await client.query(
      `INSERT INTO merge_audit (temp_player_id, real_player_id, temp_name, real_name, records_moved)
       VALUES ($1, $2, $3, $4, $5)`,
      [tempId, realId, tempRow.name, realRow.name, moved]
    );

    await client.query(`DELETE FROM players WHERE id = $1`, [tempId]);

    await client.query('COMMIT');
    return { ok: true, moved, message: `Merged: ${moved} tournaments moved` };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════
// ARCHIVE: Завершённые турниры с результатами
// ═══════════════════════════════════════════════════════════

export async function getArchiveTournaments(): Promise<ArchiveTournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.date, t.time, t.location, t.format, t.division,
           t.level, t.capacity, t.status, t.photo_url, t.settings,
           0 AS participant_count,
           COALESCE(
             json_agg(
               json_build_object(
                 'playerName', p.name,
                 'gender', p.gender,
                 'placement', tr.place,
                 'points', tr.game_pts,
                 'ratingPts', COALESCE(tr.rating_pts, 0),
                 'ratingPool', CASE WHEN tr.rating_pool = 'novice' THEN 'novice' ELSE 'pro' END
               ) ORDER BY tr.place ASC
             ) FILTER (WHERE tr.id IS NOT NULL),
             '[]'
           ) AS results
    FROM tournaments t
    LEFT JOIN tournament_results tr ON tr.tournament_id = t.id
    LEFT JOIN players p ON p.id = tr.player_id
    WHERE t.status = 'finished' AND t.name != '__playerdb__'
    GROUP BY t.id, t.name, t.date, t.time, t.location, t.format, t.division,
             t.level, t.capacity, t.status, t.photo_url, t.settings
    ORDER BY t.date DESC
  `);
  return rows.map((row) => {
    const raw = (row.results as ArchiveResult[]) ?? [];
    const results = raw.map((r) => {
      const pool: RatingPool = r.ratingPool === 'novice' ? 'novice' : 'pro';
      const placement = Number(r.placement) || 0;
      const ratingPts = effectiveRatingPtsFromStored(placement, pool, r.ratingPts);
      return { ...r, ratingPts, ratingPool: pool };
    });
    const base = { ...mapTournament(row), results };
    return augmentArchiveTournamentWithThaiBoard(base);
  });
}

export async function setTournamentPhotoUrl(
  id: string,
  photoUrl: string
): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments SET photo_url = $2 WHERE id = $1
     RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url, settings`,
    [id, photoUrl || null]
  );
  const data = rows[0];
  if (!data) return null;
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count
     FROM tournament_participants
     WHERE tournament_id = $1 AND is_waitlist = false`,
    [id]
  );
  return { ...mapTournament(data), participantCount: Number(countRes.rows[0]?.participant_count ?? 0) };
}

function ratingTypeFromDivision(division: string, gender: 'M' | 'W'): 'M' | 'W' | 'Mix' {
  if (String(division || '').trim() === 'Микст') return 'Mix';
  return gender === 'W' ? 'W' : 'M';
}

function normalizeTournamentResultPlace(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export async function upsertTournamentResults(
  tournamentId: string,
  results: Array<{
    playerName: string;
    gender: 'M' | 'W';
    placement: number;
    points: number;
    ratingPool?: RatingPool;
  }>,
): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const tournament = await getTournamentById(tournamentId);
    const division = tournament?.division ?? '';

    await client.query('BEGIN');
    await client.query(`DELETE FROM tournament_results WHERE tournament_id = $1`, [tournamentId]);
    let inserted = 0;
    for (const r of results) {
      const gender = r.gender === 'W' ? 'W' : 'M';
      const playerRes = await client.query(
        `INSERT INTO players (name, gender, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (lower(trim(name)), gender) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [r.playerName.trim(), gender]
      );
      const playerId = String(playerRes.rows[0]?.id ?? '');
      if (!playerId) continue;
      const place = normalizeTournamentResultPlace(r.placement);
      if (place <= 0) continue;
      const poolKind: RatingPool = r.ratingPool === 'novice' ? 'novice' : 'pro';
      const ratingPts = ratingPointsForPlace(place, poolKind);
      const ratingPoolDb = poolKind === 'novice' ? 'novice' : null;
      const ratingType = ratingTypeFromDivision(division, gender);
      await client.query(
        `INSERT INTO tournament_results (
           tournament_id, player_id, place, game_pts, rating_pts, gender, rating_type, rating_pool
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tournamentId,
          playerId,
          place,
          Number(r.points),
          ratingPts,
          gender,
          ratingType,
          ratingPoolDb,
        ],
      );
      inserted++;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
