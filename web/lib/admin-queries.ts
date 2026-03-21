import { randomUUID } from 'crypto';
import { getPool } from './db';

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
}

export interface AdminPlayer {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status: 'active' | 'temporary';
  ratingM: number;
  ratingW: number;
  ratingMix: number;
  wins: number;
  totalPts: number;
}

function mapTournament(row: Record<string, unknown>): AdminTournament {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    date: String(row.date ?? ''),
    time: String(row.time ?? ''),
    location: String(row.location ?? ''),
    format: String(row.format ?? ''),
    division: String(row.division ?? ''),
    level: String(row.level ?? ''),
    capacity: Number(row.capacity ?? 0),
    status: String(row.status ?? 'open'),
    participantCount: Number(row.participant_count ?? 0),
  };
}

function mapPlayer(row: Record<string, unknown>): AdminPlayer {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    status: String(row.status ?? 'active') === 'temporary' ? 'temporary' : 'active',
    ratingM: Number(row.rating_m ?? 0),
    ratingW: Number(row.rating_w ?? 0),
    ratingMix: Number(row.rating_mix ?? 0),
    wins: Number(row.wins ?? 0),
    totalPts: Number(row.total_pts ?? 0),
  };
}

export async function listTournaments(query = ''): Promise<AdminTournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const term = String(query || '').trim();
  const hasFilter = term.length > 0;
  const { rows } = await pool.query(
    `
      SELECT t.*, COUNT(tp.id)::int AS participant_count
      FROM tournaments t
      LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
      ${hasFilter ? "WHERE t.name ILIKE $1 OR t.location ILIKE $1 OR t.status ILIKE $1" : ''}
      GROUP BY t.id
      ORDER BY t.date DESC, t.time DESC
      LIMIT 200
    `,
    hasFilter ? [`%${term}%`] : []
  );
  return rows.map((row) => mapTournament(row));
}

export async function createTournament(input: Partial<AdminTournament>): Promise<AdminTournament> {
  const pool = getPool();
  const id = String(input.id || randomUUID());
  const { rows } = await pool.query(
    `INSERT INTO tournaments
      (id, name, date, time, location, format, division, level, capacity, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, name, date, time, location, format, division, level, capacity, status`,
    [
      id,
      String(input.name || '').trim(),
      String(input.date || '').trim(),
      String(input.time || ''),
      String(input.location || ''),
      String(input.format || ''),
      String(input.division || ''),
      String(input.level || ''),
      Number(input.capacity || 0),
      String(input.status || 'open'),
    ]
  );
  const data = rows[0] ?? {};
  return { ...mapTournament(data), participantCount: 0 };
}

export async function updateTournament(
  id: string,
  input: Partial<AdminTournament>
): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments
     SET name=$2, date=$3, time=$4, location=$5, format=$6, division=$7, level=$8, capacity=$9, status=$10
     WHERE id=$1
     RETURNING id, name, date, time, location, format, division, level, capacity, status`,
    [
      id,
      String(input.name || '').trim(),
      String(input.date || '').trim(),
      String(input.time || ''),
      String(input.location || ''),
      String(input.format || ''),
      String(input.division || ''),
      String(input.level || ''),
      Number(input.capacity || 0),
      String(input.status || 'open'),
    ]
  );
  const data = rows[0];
  if (!data) return null;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count FROM tournament_participants WHERE tournament_id = $1`,
    [id]
  );
  const participantCount = Number(countRes.rows[0]?.participant_count ?? 0);
  return { ...mapTournament(data), participantCount };
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
      SELECT t.*, COUNT(tp.id)::int AS participant_count
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

export async function listPlayers(query = ''): Promise<AdminPlayer[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const term = String(query || '').trim();
  const hasFilter = term.length > 0;
  const { rows } = await pool.query(
    `
      SELECT id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts
      FROM players
      ${hasFilter ? 'WHERE name ILIKE $1 OR id ILIKE $1' : ''}
      ORDER BY name ASC
      LIMIT 500
    `,
    hasFilter ? [`%${term}%`] : []
  );
  return rows.map((row) => mapPlayer(row));
}

export async function getPlayerById(id: string): Promise<AdminPlayer | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts FROM players WHERE id = $1 LIMIT 1`,
    [id]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function createPlayer(input: Partial<AdminPlayer>): Promise<AdminPlayer> {
  const pool = getPool();
  const id = String(input.id || randomUUID());
  const gender = String(input.gender || 'M') === 'W' ? 'W' : 'M';
  const status = String(input.status || 'active') === 'temporary' ? 'temporary' : 'active';
  const { rows } = await pool.query(
    `INSERT INTO players
      (id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [
      id,
      String(input.name || '').trim(),
      gender,
      status,
      Number(input.ratingM || 0),
      Number(input.ratingW || 0),
      Number(input.ratingMix || 0),
      Number(input.wins || 0),
      Number(input.totalPts || 0),
    ]
  );
  return mapPlayer(rows[0] ?? {});
}

export async function updatePlayer(id: string, input: Partial<AdminPlayer>): Promise<AdminPlayer | null> {
  const pool = getPool();
  const gender = String(input.gender || 'M') === 'W' ? 'W' : 'M';
  const status = String(input.status || 'active') === 'temporary' ? 'temporary' : 'active';
  const { rows } = await pool.query(
    `UPDATE players
     SET name=$2, gender=$3, status=$4, rating_m=$5, rating_w=$6, rating_mix=$7, wins=$8, total_pts=$9
     WHERE id=$1
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [
      id,
      String(input.name || '').trim(),
      gender,
      status,
      Number(input.ratingM || 0),
      Number(input.ratingW || 0),
      Number(input.ratingMix || 0),
      Number(input.wins || 0),
      Number(input.totalPts || 0),
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

export async function applyTournamentStatusOverride(input: {
  tournamentId: string;
  status: string;
}): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments SET status = $2 WHERE id = $1
     RETURNING id, name, date, time, location, format, division, level, capacity, status`,
    [input.tournamentId, input.status]
  );
  const data = rows[0];
  if (!data) return null;
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count FROM tournament_participants WHERE tournament_id = $1`,
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
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
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
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [input.playerId, nextRatingM, nextRatingW, nextRatingMix]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}
