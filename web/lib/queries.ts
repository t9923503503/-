import { getPool } from './db';
import type { LeaderboardEntry, Player, Tournament, RatingType, Team, RatingHistoryEntry } from './types';

/* Professional Points — same table as SPA (assets/js/state/app-state.js) */
const POINTS_TABLE = [
  100,90,82,76,70,65,60,56,52,48,  // 1-10  HARD
  44,42,40,38,36,34,32,30,28,26,   // 11-20 MEDIUM
  24,22,20,18,16,14,12,10,8,7,     // 21-30
  6,5,4,3,2,2,1,1,1,1              // 31-40 LITE
];

function toIsoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeNameQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Leaderboard computed from tournament_results.place via POINTS_TABLE.
 * This matches exactly how the SPA (recalcAllPlayerStats) computes ratings.
 */
export async function fetchLeaderboard(
  type: RatingType = 'M',
  limit = 50
): Promise<LeaderboardEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  // Build a VALUES list for the points lookup: (place, pts)
  const valuesRows = POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');

  const { rows } = await pool.query(
    `WITH pts(place, pts) AS (VALUES ${valuesRows})
     SELECT
       p.id,
       p.name,
       p.gender,
       p.photo_url,
       COALESCE(SUM(COALESCE(lk.pts, 1)), 0)::int AS rating,
       COUNT(DISTINCT tr.tournament_id)::int AS tournaments,
       COALESCE(SUM(tr.wins), 0)::int AS wins,
       MAX(t.date) AS last_seen
     FROM tournament_results tr
     JOIN players p ON p.id = tr.player_id AND p.status = 'active'
     LEFT JOIN tournaments t ON t.id = tr.tournament_id
     LEFT JOIN pts lk ON lk.place = tr.place
     WHERE tr.rating_type = $1
     GROUP BY p.id, p.name, p.gender, p.photo_url
     HAVING COALESCE(SUM(COALESCE(lk.pts, 1)), 0) > 0
     ORDER BY rating DESC
     LIMIT $2`,
    [type, limit]
  );

  return rows.map((row, i) => ({
    rank: i + 1,
    playerId: row.id,
    name: row.name,
    gender: row.gender,
    rating: row.rating ?? 0,
    tournaments: row.tournaments ?? 0,
    wins: row.wins ?? 0,
    lastSeen: toIsoDate(row.last_seen),
    photoUrl: row.photo_url ?? '',
  }));
}

export async function fetchPlayer(id: string): Promise<Player | null> {
  if (!process.env.DATABASE_URL) return null;
  if (!isUuid(id)) return null;
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT * FROM players WHERE id = $1',
    [id]
  );

  const data = rows[0];
  if (!data) return null;

  // Compute ratings & tournament counts from tournament_results (source of truth)
  const valuesRows = POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');
  const { rows: computed } = await pool.query(
    `WITH pts(place, pts) AS (VALUES ${valuesRows})
     SELECT
       tr.rating_type,
       COALESCE(SUM(COALESCE(lk.pts, 1)), 0)::int AS rating,
       COUNT(DISTINCT tr.tournament_id)::int AS tournaments,
       COALESCE(SUM(tr.wins), 0)::int AS wins,
       MAX(t.date) AS last_seen
     FROM tournament_results tr
     LEFT JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
     LEFT JOIN pts lk ON lk.place = tr.place
     WHERE tr.player_id = $1
     GROUP BY tr.rating_type`,
    [id]
  );

  let ratingM = 0, ratingW = 0, ratingMix = 0;
  let tournamentsM = 0, tournamentsW = 0, tournamentsMix = 0;
  let totalWins = 0;
  let lastSeen = '';

  for (const r of computed) {
    const rating = Number(r.rating ?? 0);
    const tournaments = Number(r.tournaments ?? 0);
    const wins = Number(r.wins ?? 0);
    const seen = toIsoDate(r.last_seen);
    totalWins += wins;
    if (seen > lastSeen) lastSeen = seen;

    if (r.rating_type === 'M') { ratingM = rating; tournamentsM = tournaments; }
    else if (r.rating_type === 'W') { ratingW = rating; tournamentsW = tournaments; }
    else if (r.rating_type === 'Mix') { ratingMix = rating; tournamentsMix = tournaments; }
  }

  return {
    id: data.id,
    name: data.name,
    gender: data.gender,
    status: data.status,
    ratingM,
    ratingW,
    ratingMix,
    tournamentsM,
    tournamentsW,
    tournamentsMix,
    wins: totalWins || (data.wins ?? 0),
    totalPts: ratingM + ratingW + ratingMix || (data.total_pts ?? 0),
    lastSeen: lastSeen || (data.last_seen ? toIsoDate(data.last_seen) : ''),
    photoUrl: data.photo_url ?? '',
    city: data.city ?? '',
    level: data.level ?? '',
    bio: data.bio ?? '',
  };
}

export async function findPlayerIdsByName(query: string, limit = 5): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const nameQuery = normalizeNameQuery(query);
  if (nameQuery.length < 2) return [];
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT id
       FROM players
       WHERE status = 'active'
         AND lower(name) LIKE lower($1)
       ORDER BY
         CASE WHEN lower(name) = lower($2) THEN 0 ELSE 1 END,
         name ASC
       LIMIT $3`,
      [`%${nameQuery}%`, nameQuery, limit]
    );
    return rows.map((r) => String(r.id ?? '')).filter(Boolean);
  } catch {
    // Backward compatibility for old schemas where players.status may not exist.
    try {
      const { rows } = await pool.query(
        `SELECT id
         FROM players
         WHERE lower(name) LIKE lower($1)
         ORDER BY
           CASE WHEN lower(name) = lower($2) THEN 0 ELSE 1 END,
           name ASC
         LIMIT $3`,
        [`%${nameQuery}%`, nameQuery, limit]
      );
      return rows.map((r) => String(r.id ?? '')).filter(Boolean);
    } catch {
      return [];
    }
  }
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
    prize: row.prize ?? '',
    photoUrl: row.photo_url ?? '',
    formatCode: row.format_code ?? '',
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

export interface RankingCounts {
  men: number;
  women: number;
  mix: number;
  total: number;
}

export async function fetchRankingCounts(): Promise<RankingCounts> {
  if (!process.env.DATABASE_URL) return { men: 0, women: 0, mix: 0, total: 0 };
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT
      count(DISTINCT player_id) FILTER (WHERE rating_type = 'M')::int   AS men,
      count(DISTINCT player_id) FILTER (WHERE rating_type = 'W')::int   AS women,
      count(DISTINCT player_id) FILTER (WHERE rating_type = 'Mix')::int AS mix,
      count(DISTINCT player_id)::int AS total
    FROM tournament_results tr
    JOIN players p ON p.id = tr.player_id AND p.status = 'active'
  `);
  const r = rows[0];
  return { men: r?.men ?? 0, women: r?.women ?? 0, mix: r?.mix ?? 0, total: r?.total ?? 0 };
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
    prize: data.prize ?? '',
    photoUrl: data.photo_url ?? '',
    formatCode: data.format_code ?? '',
  };
}

export async function fetchPlayerMatches(
  playerId: string,
  limit = 20
) {
  if (!process.env.DATABASE_URL) return [];
  if (!isUuid(playerId)) return [];

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

  try {
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
  } catch {
    // Table 'teams' may not exist yet
    return [];
  }
}

export interface PartnerRequestRow {
  id: string;
  name: string;
  gender: 'M' | 'W';
  phone: string;
  requesterUserId: number | null;
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentLevel: string;
  createdAt: string;
}

export interface PartnerFilters {
  tournamentId?: string;
  level?: 'hard' | 'medium' | 'easy' | 'all';
  gender?: 'M' | 'W' | 'all';
}

export async function fetchPartnerRequests(filters: PartnerFilters = {}): Promise<PartnerRequestRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const parts: string[] = [
    `pr.status = 'pending'`,
    `COALESCE(pr.registration_type, 'solo') = 'solo'`,
    `COALESCE(pr.partner_wanted, true) = true`,
    `t.status IN ('open', 'full')`,
  ];
  const params: string[] = [];

  if (filters.tournamentId) {
    params.push(filters.tournamentId);
    parts.push(`pr.tournament_id = $${params.length}`);
  }
  if (filters.level && filters.level !== 'all') {
    params.push(filters.level);
    parts.push(`LOWER(COALESCE(t.level, '')) = $${params.length}`);
  }
  if (filters.gender && filters.gender !== 'all') {
    params.push(filters.gender);
    parts.push(`pr.gender = $${params.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         pr.id,
         pr.name,
         pr.gender,
         COALESCE(pr.phone, '') AS phone,
         pr.requester_user_id,
         pr.tournament_id,
         COALESCE(t.name, '') AS tournament_name,
         t.date AS tournament_date,
         COALESCE(t.level, '') AS tournament_level,
         pr.created_at
       FROM player_requests pr
       LEFT JOIN tournaments t ON t.id = pr.tournament_id
       WHERE ${parts.join(' AND ')}
       ORDER BY t.date ASC NULLS LAST, pr.created_at ASC
       LIMIT 300`,
      params
    );

    return rows.map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? ''),
      gender: String(r.gender ?? 'M') === 'W' ? 'W' : 'M',
      phone: String(r.phone ?? ''),
      requesterUserId:
        r.requester_user_id != null ? Number(r.requester_user_id) : null,
      tournamentId: String(r.tournament_id ?? ''),
      tournamentName: String(r.tournament_name ?? ''),
      tournamentDate: toIsoDate(r.tournament_date),
      tournamentLevel: String(r.tournament_level ?? ''),
      createdAt: String(r.created_at ?? ''),
    }));
  } catch {
    // Backward compatible: partner columns may not exist before migration.
    return [];
  }
}

// ─── Rating History ──────────────────────────────────────────────────────

export async function fetchRatingHistory(
  playerId: string,
  limit = 30
): Promise<RatingHistoryEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  if (!isUuid(playerId)) return [];
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

// ─── Extended Player Stats ──────────────────────────────────────────────

export interface PlayerExtendedStats {
  totalTournaments: number;
  gold: number;
  silver: number;
  bronze: number;
  topThreeRate: number;
  avgPlace: number;
  bestPlace: number;
  totalRatingPts: number;
  avgRatingPts: number;
  winRate: number;
  totalWins: number;
  totalBalls: number;
  avgBalls: number;
  bestTournament: { name: string; date: string; place: number; pts: number } | null;
  currentStreak: { type: 'top3' | 'none'; count: number };
  rankM: number | null;
  rankW: number | null;
  rankMix: number | null;
  formLast5: number[];
}

export async function fetchPlayerExtendedStats(playerId: string): Promise<PlayerExtendedStats> {
  const empty: PlayerExtendedStats = {
    totalTournaments: 0, gold: 0, silver: 0, bronze: 0,
    topThreeRate: 0, avgPlace: 0, bestPlace: 0, totalRatingPts: 0, avgRatingPts: 0,
    winRate: 0, totalWins: 0, totalBalls: 0, avgBalls: 0,
    bestTournament: null, currentStreak: { type: 'none', count: 0 },
    rankM: null, rankW: null, rankMix: null, formLast5: [],
  };
  if (!process.env.DATABASE_URL) return empty;
  if (!isUuid(playerId)) return empty;
  const pool = getPool();

  const { rows: results } = await pool.query(
    `SELECT tr.place, tr.game_pts, tr.rating_pts, tr.wins, tr.diff, tr.balls, tr.rating_type,
            t.name AS tournament_name, t.date AS tournament_date, t.format
     FROM tournament_results tr
     JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
     WHERE tr.player_id = $1
     ORDER BY t.date DESC, tr.place ASC`,
    [playerId]
  );

  if (!results.length) return empty;

  const totalTournaments = results.length;
  const gold = results.filter(r => Number(r.place) === 1).length;
  const silver = results.filter(r => Number(r.place) === 2).length;
  const bronze = results.filter(r => Number(r.place) === 3).length;
  const places = results.map(r => Number(r.place)).filter(p => p > 0);
  const avgPlace = places.length ? +(places.reduce((a, b) => a + b, 0) / places.length).toFixed(1) : 0;
  const bestPlace = places.length ? Math.min(...places) : 0;
  const totalRatingPts = results.reduce((s, r) => s + Number(r.rating_pts || 0), 0);
  const avgRatingPts = totalTournaments ? +(totalRatingPts / totalTournaments).toFixed(1) : 0;
  const totalWins = results.reduce((s, r) => s + Number(r.wins || 0), 0);
  const totalBalls = results.reduce((s, r) => s + Number(r.balls || 0), 0);
  const avgBalls = totalTournaments ? +(totalBalls / totalTournaments).toFixed(1) : 0;
  const topThreeRate = totalTournaments ? Math.round((gold + silver + bronze) / totalTournaments * 100) : 0;
  const winRate = totalTournaments > 0 ? Math.round(gold / totalTournaments * 100) : 0;
  const formLast5 = places.slice(0, 5);

  let bestTournament: PlayerExtendedStats['bestTournament'] = null;
  let bestPts = -Infinity;
  for (const r of results) {
    const pts = Number(r.rating_pts || 0);
    if (pts > bestPts) {
      bestPts = pts;
      bestTournament = { name: r.tournament_name, date: toIsoDate(r.tournament_date), place: Number(r.place), pts };
    }
  }

  let streakCount = 0;
  for (const r of results) {
    if (Number(r.place) <= 3) streakCount++;
    else break;
  }
  const currentStreak = { type: (streakCount > 0 ? 'top3' : 'none') as 'top3' | 'none', count: streakCount };

  const valuesRows = POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');
  const { rows: ranks } = await pool.query(
    `WITH pts(place, pts) AS (VALUES ${valuesRows}),
    ranked AS (
      SELECT tr.player_id, tr.rating_type,
             ROW_NUMBER() OVER (PARTITION BY tr.rating_type ORDER BY SUM(COALESCE(lk.pts,1)) DESC) AS rn
      FROM tournament_results tr
      JOIN players p ON p.id = tr.player_id AND p.status = 'active'
      LEFT JOIN pts lk ON lk.place = tr.place
      GROUP BY tr.player_id, tr.rating_type
      HAVING SUM(COALESCE(lk.pts,1)) > 0
    )
    SELECT rating_type, rn FROM ranked WHERE player_id = $1`,
    [playerId]
  );
  let rankM: number | null = null, rankW: number | null = null, rankMix: number | null = null;
  for (const r of ranks) {
    if (r.rating_type === 'M') rankM = Number(r.rn);
    if (r.rating_type === 'W') rankW = Number(r.rn);
    if (r.rating_type === 'Mix') rankMix = Number(r.rn);
  }

  return {
    totalTournaments, gold, silver, bronze, topThreeRate,
    avgPlace, bestPlace, totalRatingPts, avgRatingPts, winRate, totalWins,
    totalBalls, avgBalls, bestTournament, currentStreak, rankM, rankW, rankMix, formLast5,
  };
}

// ─── Tournament Results (public page) ───────────────────────────────────

export interface TournamentResultRow {
  playerId: string;
  playerName: string;
  playerPhotoUrl: string;
  place: number;
  gamePts: number;
  ratingPts: number;
  wins: number;
  diff: number;
  balls: number;
  ratingType: string;
  gender: string;
}

export async function fetchTournamentResults(tournamentId: string): Promise<TournamentResultRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT tr.player_id, p.name AS player_name, p.photo_url AS player_photo_url,
            tr.place, tr.game_pts, tr.rating_pts, tr.wins, tr.diff, tr.balls,
            tr.rating_type, tr.gender
     FROM tournament_results tr
     JOIN players p ON p.id = tr.player_id
     WHERE tr.tournament_id = $1
     ORDER BY tr.place ASC, tr.game_pts DESC`,
    [tournamentId]
  );

  return rows.map(r => ({
    playerId: r.player_id,
    playerName: r.player_name,
    playerPhotoUrl: r.player_photo_url ?? '',
    place: Number(r.place ?? 0),
    gamePts: Number(r.game_pts ?? 0),
    ratingPts: Number(r.rating_pts ?? 0),
    wins: Number(r.wins ?? 0),
    diff: Number(r.diff ?? 0),
    balls: Number(r.balls ?? 0),
    ratingType: r.rating_type ?? '',
    gender: r.gender ?? '',
  }));
}
