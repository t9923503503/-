import { getPool } from './db';
import type { LeaderboardEntry, Player, Tournament, RatingType, Team, RatingHistoryEntry } from './types';

const RATING_COLUMN: Record<RatingType, string> = {
  M: 'rating_m',
  W: 'rating_w',
  Mix: 'rating_mix',
};

const TOURNAMENTS_COLUMN: Record<RatingType, string> = {
  M: 'tournaments_m',
  W: 'tournaments_w',
  Mix: 'tournaments_mix',
};

function toIsoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function fetchLeaderboard(
  type: RatingType = 'M',
  limit = 50
): Promise<LeaderboardEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const ratingCol = RATING_COLUMN[type] ?? 'rating_m';
  const trnCol = TOURNAMENTS_COLUMN[type] ?? 'tournaments_m';

  const { rows } = await pool.query(
    `SELECT id, name, gender, ${ratingCol} AS rating, ${trnCol} AS tournaments, wins, last_seen
     FROM players
     WHERE status = 'active' AND ${ratingCol} > 0
     ORDER BY ${ratingCol} DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row, i) => ({
    rank: i + 1,
    playerId: row.id,
    name: row.name,
    gender: row.gender,
    rating: row.rating ?? 0,
    tournaments: row.tournaments ?? 0,
    wins: row.wins ?? 0,
    lastSeen: row.last_seen ?? '',
  }));
}

export async function fetchPlayer(id: string): Promise<Player | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT * FROM players WHERE id = $1',
    [id]
  );

  const data = rows[0];
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    gender: data.gender,
    status: data.status,
    ratingM: data.rating_m ?? 0,
    ratingW: data.rating_w ?? 0,
    ratingMix: data.rating_mix ?? 0,
    tournamentsM: data.tournaments_m ?? 0,
    tournamentsW: data.tournaments_w ?? 0,
    tournamentsMix: data.tournaments_mix ?? 0,
    wins: data.wins ?? 0,
    totalPts: data.total_pts ?? 0,
    lastSeen: data.last_seen ?? '',
  };
}

export async function fetchTournaments(
  limit = 20,
  status?: string
): Promise<Tournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  let query = `
    SELECT t.*, COUNT(tp.id)::int AS participant_count
    FROM tournaments t
    LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
  `;
  const params: (string | number)[] = [];

  if (status) {
    params.push(status);
    query += ` WHERE t.status = $${params.length}`;
  }

  query += ' GROUP BY t.id ORDER BY t.date DESC';
  params.push(limit);
  query += ` LIMIT $${params.length}`;

  const { rows } = await pool.query(query, params);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: toIsoDate(row.date),
    time: row.time ?? '',
    location: row.location ?? '',
    format: row.format ?? '',
    division: row.division ?? '',
    level: row.level ?? '',
    capacity: row.capacity ?? 0,
    status: row.status ?? 'open',
    participantCount: row.participant_count ?? 0,
  }));
}

export interface HomeStats {
  tournamentCount: number;
  playerCount: number;
  openCount: number;
  menCount: number;
  womenCount: number;
}

export async function fetchHomeStats(): Promise<HomeStats> {
  if (!process.env.DATABASE_URL) return { tournamentCount: 0, playerCount: 0, openCount: 0, menCount: 0, womenCount: 0 };
  const pool = getPool();

  const [tRes, pRes] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'open')::int AS open FROM tournaments`),
    pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE gender = 'M')::int AS men, count(*) FILTER (WHERE gender = 'W')::int AS women FROM players WHERE status = 'active'`),
  ]);

  return {
    tournamentCount: tRes.rows[0]?.total ?? 0,
    openCount: tRes.rows[0]?.open ?? 0,
    playerCount: pRes.rows[0]?.total ?? 0,
    menCount: pRes.rows[0]?.men ?? 0,
    womenCount: pRes.rows[0]?.women ?? 0,
  };
}

export async function fetchTournamentById(
  id: string
): Promise<Tournament | null> {
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
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    date: toIsoDate(data.date),
    time: data.time ?? '',
    location: data.location ?? '',
    format: data.format ?? '',
    division: data.division ?? '',
    level: data.level ?? '',
    capacity: data.capacity ?? 0,
    status: data.status ?? 'open',
    participantCount: data.participant_count ?? 0,
  };
}

export async function fetchPlayerMatches(
  playerId: string,
  limit = 20
) {
  if (!process.env.DATABASE_URL) return [];

  const pool = getPool();

  const { rows } = await pool.query(
    `
      SELECT
        tr.player_id,
        p.name AS player_name,
        tr.place,
        tr.game_pts,
        tr.rating_pts,
        tr.gender,
        tr.rating_type,
        tr.wins,
        tr.diff,
        tr.coef,
        tr.balls,
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.date AS tournament_date
      FROM tournament_results tr
      JOIN tournaments t ON t.id = tr.tournament_id
      JOIN players p ON p.id = tr.player_id
      WHERE tr.player_id = $1
        AND t.status = 'finished'
      ORDER BY t.date DESC, tr.place ASC
      LIMIT $2
    `,
    [playerId, limit]
  );

  return rows.map((r) => ({
    playerId: r.player_id,
    playerName: r.player_name,
    place: Number(r.place ?? 0),
    gamePts: Number(r.game_pts ?? 0),
    ratingPts: Number(r.rating_pts ?? 0),
    gender: (r.gender ?? 'M') as 'M' | 'W',
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name ?? '',
    tournamentDate: r.tournament_date ? String(r.tournament_date) : '',
    ratingType: (r.rating_type ?? 'M') as 'M' | 'W' | 'Mix',
    wins: r.wins != null ? Number(r.wins) : 0,
    diff: r.diff != null ? Number(r.diff) : 0,
    coef: r.coef ?? 0,
    balls: r.balls != null ? Number(r.balls) : 0,
  }));
}

// ─── Teams (парные заявки на турнир) ──────────────────────────────────────

export async function fetchTeamsByTournament(tournamentId: string): Promise<Team[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT
       t.id, t.tournament_id, t.status, t.seed, t.created_at,
       t.player1_id, p1.name AS player1_name,
       t.player2_id, p2.name AS player2_name
     FROM teams t
     JOIN players p1 ON p1.id = t.player1_id
     LEFT JOIN players p2 ON p2.id = t.player2_id
     WHERE t.tournament_id = $1 AND t.status != 'withdrawn'
     ORDER BY t.seed NULLS LAST, t.created_at`,
    [tournamentId]
  );

  return rows.map((r) => ({
    id: r.id,
    tournamentId: r.tournament_id,
    player1Id: r.player1_id,
    player1Name: r.player1_name,
    player2Id: r.player2_id,
    player2Name: r.player2_name,
    status: r.status,
    seed: r.seed,
    createdAt: r.created_at ? String(r.created_at) : '',
  }));
}

export async function fetchTeamsLookingForPartner(tournamentId: string): Promise<Team[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT
       t.id, t.tournament_id, t.status, t.seed, t.created_at,
       t.player1_id, p1.name AS player1_name,
       t.player2_id, NULL AS player2_name
     FROM teams t
     JOIN players p1 ON p1.id = t.player1_id
     WHERE t.tournament_id = $1 AND t.status = 'looking_for_partner'
     ORDER BY t.created_at`,
    [tournamentId]
  );

  return rows.map((r) => ({
    id: r.id,
    tournamentId: r.tournament_id,
    player1Id: r.player1_id,
    player1Name: r.player1_name,
    player2Id: null,
    player2Name: null,
    status: r.status as Team['status'],
    seed: r.seed,
    createdAt: r.created_at ? String(r.created_at) : '',
  }));
}

// ─── Rating History ──────────────────────────────────────────────────────

export async function fetchRatingHistory(
  playerId: string,
  limit = 30
): Promise<RatingHistoryEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT
       rh.id, rh.player_id, rh.tournament_id, rh.format_code,
       rh.points_changed, rh.new_total_rating, rh.place, rh.created_at,
       t.name AS tournament_name
     FROM rating_history rh
     LEFT JOIN tournaments t ON t.id = rh.tournament_id
     WHERE rh.player_id = $1
     ORDER BY rh.created_at DESC
     LIMIT $2`,
    [playerId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name ?? '',
    formatCode: r.format_code ?? '',
    pointsChanged: Number(r.points_changed ?? 0),
    newTotalRating: Number(r.new_total_rating ?? 0),
    place: r.place != null ? Number(r.place) : null,
    createdAt: r.created_at ? String(r.created_at) : '',
  }));
}
