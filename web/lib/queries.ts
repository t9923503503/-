import { getPool } from './db';
import type { LeaderboardEntry, MedalEntry, Player, Tournament, RatingType, TournamentFormatFilter, Team, RatingHistoryEntry } from './types';
import {
  applyTournamentOverride,
  applyTournamentOverrides,
  getTournamentOverride,
} from './tournament-overrides';
import {
  enrichTournamentRuntimeState,
  resolveTournamentStatus,
} from './tournament-status';
import { sortTournamentsForCalendar } from './calendar';
import {
  RATING_POINTS_TABLE,
  effectiveRatingPtsFromStored,
  ratingPointsForPlace,
  sqlEffectiveRatingPointsExpr,
} from './rating-points';
import { resolveThaiSpectatorBoardUrlForArchive } from './thai-archive-meta';

const PLAYER_DB_EXTERNAL_ID = '__playerdb__';

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

function normalizeTournamentSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function shouldHideTournamentFromPublic(input: {
  name?: unknown;
  location?: unknown;
  settings?: unknown;
}): boolean {
  const settings = normalizeTournamentSettings(input.settings);
  if (
    settings.hideFromPublic === true ||
    settings.publicVisible === false ||
    settings.internalOnly === true ||
    settings.qaMode === true ||
    settings.isQa === true ||
    settings.isTest === true ||
    settings.demoMode === true
  ) {
    return true;
  }

  const haystack = ` ${[
    input.name,
    input.location,
    settings.tag,
    settings.label,
    settings.notes,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')} `;

  return [
    ' qa ',
    ' demo ',
    ' test ',
    ' tmp ',
    ' debug ',
    ' smoke ',
    ' staging ',
    ' демо ',
    ' тест ',
    ' отладка ',
  ].some((token) => haystack.includes(token));
}

function mapTournamentRow(row: Record<string, unknown>): Tournament {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    date: toIsoDate(row.date),
    time: String(row.time ?? ''),
    location: String(row.location ?? ''),
    format: String(row.format ?? ''),
    division: String(row.division ?? ''),
    level: String(row.level ?? ''),
    capacity: Number(row.capacity ?? 0),
    status: String(row.status ?? 'open') as Tournament['status'],
    participantCount: Number(row.participant_count ?? 0),
    waitlistCount: Number(row.waitlist_count ?? 0),
    partnerRequestCount: Number(row.partner_request_count ?? 0),
    prize: String(row.prize ?? ''),
    photoUrl: String(row.photo_url ?? ''),
    formatCode: String(row.format_code ?? ''),
    description:
      row.description != null && String(row.description).trim().length > 0
        ? String(row.description)
        : undefined,
    participantListText:
      row.participant_list_text != null && String(row.participant_list_text).trim().length > 0
        ? String(row.participant_list_text)
        : undefined,
  };
}

async function fetchPartnerRequestCounts(
  tournamentIds: string[]
): Promise<Map<string, number>> {
  if (!process.env.DATABASE_URL || tournamentIds.length === 0) {
    return new Map<string, number>();
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT
         pr.tournament_id::text AS tournament_id,
         COUNT(*)::int AS partner_request_count
       FROM player_requests pr
       WHERE pr.tournament_id::text = ANY($1::text[])
         AND pr.status = 'pending'
         AND COALESCE(pr.registration_type, 'solo') = 'solo'
         AND COALESCE(pr.partner_wanted, true) = true
       GROUP BY pr.tournament_id`,
      [tournamentIds]
    );

    return new Map(
      rows.map((row) => [
        String(row.tournament_id ?? ''),
        Number(row.partner_request_count ?? 0),
      ])
    );
  } catch {
    return new Map<string, number>();
  }
}

/**
 * Leaderboard: сумма эффективных очков за место (POINTS_TABLE), для rating_pool=novice — половина (округление).
 */
export async function fetchLeaderboard(
  type: RatingType = 'M',
  limit = 50,
  format: TournamentFormatFilter = 'all'
): Promise<LeaderboardEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const valuesRows = RATING_POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');
  const eff = sqlEffectiveRatingPointsExpr('tr');

  const formatClause =
    format === 'kotc'
      ? `AND (LOWER(COALESCE(t.format, '')) = 'kotc' OR LOWER(COALESCE(t.format, '')) LIKE '%king%')`
      : format === 'dt'
      ? `AND (LOWER(COALESCE(t.format, '')) LIKE '%ipt%' OR LOWER(COALESCE(t.format, '')) LIKE '%double%' OR LOWER(COALESCE(t.format, '')) LIKE '%trouble%')`
      : '';

  const { rows } = await pool.query(
    `WITH pts(place, pts) AS (VALUES ${valuesRows})
     SELECT
       p.id,
       p.name,
       p.gender,
       p.photo_url,
       COALESCE(SUM(${eff}), 0)::int AS rating,
       COUNT(DISTINCT tr.tournament_id)::int AS tournaments,
       COALESCE(SUM(tr.wins), 0)::int AS wins,
       COUNT(CASE WHEN tr.place = 1 THEN 1 END)::int AS gold,
       COUNT(CASE WHEN tr.place = 2 THEN 1 END)::int AS silver,
       COUNT(CASE WHEN tr.place = 3 THEN 1 END)::int AS bronze,
       MAX(t.date) AS last_seen,
       CASE
         WHEN bool_or(LOWER(COALESCE(t.level,'')) = 'hard') THEN 'hard'
         WHEN bool_or(LOWER(COALESCE(t.level,'')) IN ('advanced','advance')) THEN 'advanced'
         WHEN bool_or(LOWER(COALESCE(t.level,'')) = 'medium') THEN 'medium'
         WHEN bool_or(LOWER(COALESCE(t.level,'')) = 'light') THEN 'light'
         ELSE 'light'
       END AS top_level
     FROM tournament_results tr
     JOIN players p ON p.id = tr.player_id AND p.status = 'active'
     JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished' ${formatClause}
     LEFT JOIN pts lk ON lk.place = tr.place
     WHERE tr.rating_type = $1
     GROUP BY p.id, p.name, p.gender, p.photo_url
     HAVING COALESCE(SUM(${eff}), 0) > 0
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
    gold: Number(row.gold ?? 0),
    silver: Number(row.silver ?? 0),
    bronze: Number(row.bronze ?? 0),
    lastSeen: toIsoDate(row.last_seen),
    photoUrl: row.photo_url ?? '',
    topLevel: row.top_level ?? 'light',
  }));
}

export async function fetchMedalsLeaderboard(
  type: RatingType = 'M',
  limit = 100,
  format: TournamentFormatFilter = 'all'
): Promise<MedalEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 100)));

  const formatClause =
    format === 'kotc'
      ? `AND (LOWER(COALESCE(t.format, '')) = 'kotc' OR LOWER(COALESCE(t.format, '')) LIKE '%king%')`
      : format === 'dt'
      ? `AND (LOWER(COALESCE(t.format, '')) LIKE '%ipt%' OR LOWER(COALESCE(t.format, '')) LIKE '%double%' OR LOWER(COALESCE(t.format, '')) LIKE '%trouble%')`
      : '';

  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.photo_url,
       p.gender,
       COUNT(CASE WHEN tr.place = 1 THEN 1 END)::int AS gold,
       COUNT(CASE WHEN tr.place = 2 THEN 1 END)::int AS silver,
       COUNT(CASE WHEN tr.place = 3 THEN 1 END)::int AS bronze,
       COUNT(CASE WHEN tr.place = 1 AND LOWER(COALESCE(t.level, '')) = 'hard' THEN 1 END)::int AS hard_wins,
       COUNT(CASE WHEN tr.place = 1 AND LOWER(COALESCE(t.level, '')) IN ('advanced', 'advance') THEN 1 END)::int AS advanced_wins,
       COUNT(CASE WHEN tr.place = 1 AND LOWER(COALESCE(t.level, '')) = 'medium' THEN 1 END)::int AS medium_wins,
       COUNT(CASE WHEN tr.place = 1 AND LOWER(COALESCE(t.level, '')) = 'light' THEN 1 END)::int AS light_wins,
       COUNT(CASE WHEN tr.place = 1 AND (
         LOWER(COALESCE(t.format, '')) = 'kotc' OR LOWER(COALESCE(t.format, '')) LIKE '%king%'
       ) THEN 1 END)::int AS kotc_wins,
       COUNT(CASE WHEN tr.place = 1 AND LOWER(COALESCE(t.format, '')) LIKE '%thai%' THEN 1 END)::int AS thai_wins,
       COUNT(CASE WHEN tr.place = 1 AND (
         LOWER(COALESCE(t.format, '')) LIKE '%ipt%' OR
         LOWER(COALESCE(t.format, '')) LIKE '%double%' OR
         LOWER(COALESCE(t.format, '')) LIKE '%trouble%'
       ) THEN 1 END)::int AS ipt_wins
     FROM tournament_results tr
     JOIN players p ON p.id = tr.player_id AND p.status = 'active'
     JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished' ${formatClause}
     WHERE tr.rating_type = $1
     GROUP BY p.id, p.name, p.photo_url, p.gender
     HAVING COUNT(CASE WHEN tr.place = 1 THEN 1 END) > 0
     ORDER BY gold DESC, silver DESC, bronze DESC, p.name ASC
     LIMIT $2`,
    [type, safeLimit]
  );

  return rows.map((row, i) => ({
    rank: i + 1,
    playerId: row.id,
    name: row.name,
    photoUrl: row.photo_url ?? '',
    gender: row.gender,
    gold: Number(row.gold ?? 0),
    silver: Number(row.silver ?? 0),
    bronze: Number(row.bronze ?? 0),
    hardWins: Number(row.hard_wins ?? 0),
    advancedWins: Number(row.advanced_wins ?? 0),
    mediumWins: Number(row.medium_wins ?? 0),
    lightWins: Number(row.light_wins ?? 0),
    kotcWins: Number(row.kotc_wins ?? 0),
    thaiWins: Number(row.thai_wins ?? 0),
    iptWins: Number(row.ipt_wins ?? 0),
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

  const valuesRows = RATING_POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');
  const eff = sqlEffectiveRatingPointsExpr('tr');
  const { rows: computed } = await pool.query(
    `WITH pts(place, pts) AS (VALUES ${valuesRows})
     SELECT
       tr.rating_type,
       COALESCE(SUM(${eff}), 0)::int AS rating,
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
  if (!process.env.DATABASE_URL) {
    return sortTournamentsForCalendar(applyTournamentOverrides([])).slice(0, limit);
  }
  const pool = getPool();
  const queryLimit = Math.max(limit, 200);

  const query = `
    SELECT t.*,
           COUNT(tp.id) FILTER (WHERE COALESCE(tp.is_waitlist, false) = false)::int AS participant_count,
           COUNT(tp.id) FILTER (WHERE COALESCE(tp.is_waitlist, false) = true)::int AS waitlist_count
    FROM tournaments t
    LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
    WHERE COALESCE(t.name, '') <> '__playerdb__'
    GROUP BY t.id
    ORDER BY t.date ASC NULLS LAST, t.time ASC NULLS LAST
    LIMIT $1
  `;

  try {
    const { rows } = await pool.query(query, [queryLimit]);
    const visibleRows = rows.filter((row) => {
      if (String(row.name ?? '') === PLAYER_DB_EXTERNAL_ID) return false;
      return !shouldHideTournamentFromPublic({
        name: row.name,
        location: row.location,
        settings: row.settings,
      });
    });

    const partnerCounts = await fetchPartnerRequestCounts(
      visibleRows.map((row) => String(row.id ?? '')).filter(Boolean)
    );
    const tournaments = sortTournamentsForCalendar(
      applyTournamentOverrides(
        visibleRows.map((row) => ({
          ...mapTournamentRow(row),
          partnerRequestCount: partnerCounts.get(String(row.id ?? '')) ?? 0,
        }))
      ).map((tournament) => enrichTournamentRuntimeState(tournament))
    );

    const filtered = status
      ? tournaments.filter((tournament) => tournament.status === status)
      : tournaments;

    return filtered.slice(0, limit);
  } catch {
    return sortTournamentsForCalendar(applyTournamentOverrides([])).slice(0, limit);
  }
}

export interface HomeStats {
  tournamentCount: number;
  playerCount: number;
  openCount: number;
  menCount: number;
  womenCount: number;
}

export interface ActiveThaiJudgeTournament {
  tournamentId: string;
  name: string;
  date: string;
  time: string;
  location: string;
  variant: string;
  pointLimit: number;
  roundNo: number;
  roundType: 'r1' | 'r2';
  currentTourNo: number;
  courtCount: number;
}

export async function fetchHomeStats(): Promise<HomeStats> {
  if (!process.env.DATABASE_URL) return { tournamentCount: 0, playerCount: 0, openCount: 0, menCount: 0, womenCount: 0 };
  const pool = getPool();

  const [visibleTournaments, pRes] = await Promise.all([
    fetchTournaments(1000),
    pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE gender = 'M')::int AS men, count(*) FILTER (WHERE gender = 'W')::int AS women FROM players WHERE status = 'active'`),
  ]);

  return {
    tournamentCount: visibleTournaments.length,
    openCount: visibleTournaments.filter((tournament) => tournament.status === 'open').length,
    playerCount: pRes.rows[0]?.total ?? 0,
    menCount: pRes.rows[0]?.men ?? 0,
    womenCount: pRes.rows[0]?.women ?? 0,
  };
}

export async function fetchActiveThaiJudgeTournaments(): Promise<ActiveThaiJudgeTournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const { rows } = await pool.query(
    `
      SELECT
        t.id::text AS tournament_id,
        COALESCE(t.name, '') AS name,
        t.date AS tournament_date,
        COALESCE(t.time::text, '') AS tournament_time,
        COALESCE(t.location, '') AS tournament_location,
        COALESCE(t.settings->>'thaiVariant', '') AS thai_variant,
        COALESCE(NULLIF(t.settings->>'thaiPointLimit', ''), '15')::int AS thai_point_limit,
        r.round_no,
        r.round_type,
        COALESCE(r.current_tour_no, 1)::int AS current_tour_no,
        COUNT(c.id)::int AS court_count
      FROM tournaments t
      JOIN thai_round r
        ON r.tournament_id = t.id
       AND r.status = 'live'
      LEFT JOIN thai_court c ON c.round_id = r.id
      WHERE LOWER(COALESCE(t.format, '')) = 'thai'
        AND COALESCE(t.status, '') <> 'cancelled'
      GROUP BY t.id, t.name, t.date, t.time, t.location, t.settings, r.round_no, r.round_type, r.current_tour_no
      ORDER BY
        t.date DESC NULLS LAST,
        NULLIF(BTRIM(COALESCE(t.time::text, '')), '') DESC NULLS LAST,
        t.name ASC
    `,
  );

  return rows
    .filter((row) =>
      !shouldHideTournamentFromPublic({
        name: row.name,
        location: row.tournament_location,
      })
    )
    .map((row) => ({
      tournamentId: String(row.tournament_id ?? ''),
      name: String(row.name ?? ''),
      date: toIsoDate(row.tournament_date),
      time: String(row.tournament_time ?? ''),
      location: String(row.tournament_location ?? ''),
      variant: String(row.thai_variant ?? ''),
      pointLimit: Number(row.thai_point_limit ?? 15),
      roundNo: Number(row.round_no ?? 1),
      roundType: String(row.round_type ?? 'r1').trim().toLowerCase() === 'r2' ? 'r2' : 'r1',
      currentTourNo: Number(row.current_tour_no ?? 1),
      courtCount: Number(row.court_count ?? 0),
    }));
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
    JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
  `);
  const r = rows[0];
  return { men: r?.men ?? 0, women: r?.women ?? 0, mix: r?.mix ?? 0, total: r?.total ?? 0 };
}

export async function fetchTournamentById(
  id: string
): Promise<Tournament | null> {
  const override = getTournamentOverride(id);
  if (!process.env.DATABASE_URL) {
    if (!override) return null;
    return enrichTournamentRuntimeState(applyTournamentOverride({
      id,
      name: '',
      date: '',
      time: '',
      location: '',
      format: '',
      division: '',
      level: '',
      capacity: 0,
      status: 'open',
      participantCount: 0,
      waitlistCount: 0,
      prize: '',
      photoUrl: '',
      formatCode: '',
    }));
  }
  const pool = getPool();

  let rows;
  try {
    const res = await pool.query(
      `
        SELECT t.*, COUNT(tp.id) FILTER (WHERE COALESCE(tp.is_waitlist, false) = false)::int AS participant_count,
               COUNT(tp.id) FILTER (WHERE COALESCE(tp.is_waitlist, false) = true)::int AS waitlist_count
        FROM tournaments t
        LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
        WHERE t.id = $1
        GROUP BY t.id
        LIMIT 1
      `,
      [id]
    );
    rows = res.rows;
  } catch {
    if (!override) return null;
    return enrichTournamentRuntimeState(applyTournamentOverride({
      id,
      name: '',
      date: '',
      time: '',
      location: '',
      format: '',
      division: '',
      level: '',
      capacity: 0,
      status: 'open',
      participantCount: 0,
      waitlistCount: 0,
      prize: '',
      photoUrl: '',
      formatCode: '',
    }));
  }

  const data = rows[0];
  if (!data) {
    if (!override) return null;
    return enrichTournamentRuntimeState(applyTournamentOverride({
      id,
      name: '',
      date: '',
      time: '',
      location: '',
      format: '',
      division: '',
      level: '',
      capacity: 0,
      status: 'open',
      participantCount: 0,
      waitlistCount: 0,
      prize: '',
      photoUrl: '',
      formatCode: '',
    }));
  }

  return enrichTournamentRuntimeState(
    applyTournamentOverride({
      ...mapTournamentRow(data),
      partnerRequestCount: (await fetchPartnerRequestCounts([id])).get(id) ?? 0,
    })
  );
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
        tr.rating_pool,
        tr.gender,
        tr.rating_type,
        tr.wins,
        tr.diff,
        tr.coef,
        tr.balls,
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.date AS tournament_date,
        t.format AS tournament_format,
        t.settings AS tournament_settings,
        t.level AS tournament_level
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

  return rows.map((r) => {
    const tid = String(r.tournament_id ?? '');
    const settings =
      r.tournament_settings && typeof r.tournament_settings === 'object' && !Array.isArray(r.tournament_settings)
        ? (r.tournament_settings as Record<string, unknown>)
        : undefined;
    const thaiSpectatorBoardUrl = resolveThaiSpectatorBoardUrlForArchive(
      tid,
      String(r.tournament_format ?? ''),
      settings,
    );
    return {
      playerId: r.player_id,
      playerName: r.player_name,
      place: Number(r.place ?? 0),
      gamePts: Number(r.game_pts ?? 0),
      ratingPts: ratingPointsForPlace(
        Number(r.place ?? 0),
        r.rating_pool === 'novice' ? 'novice' : 'pro',
      ),
      gender: (r.gender ?? 'M') as 'M' | 'W',
      tournamentId: tid,
      tournamentName: r.tournament_name ?? '',
      tournamentDate: r.tournament_date ? String(r.tournament_date) : '',
      ratingType: (r.rating_type ?? 'M') as 'M' | 'W' | 'Mix',
      wins: r.wins != null ? Number(r.wins) : 0,
      diff: r.diff != null ? Number(r.diff) : 0,
      coef: r.coef ?? 0,
      balls: r.balls != null ? Number(r.balls) : 0,
      thaiSpectatorBoardUrl,
      level: r.tournament_level ? String(r.tournament_level) : null,
      format: r.tournament_format ? String(r.tournament_format) : null,
    };
  });
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
    `COALESCE(t.status, 'open') <> 'cancelled'`,
    `(t.date IS NULL OR t.date >= CURRENT_DATE)`,
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

interface LevelBucket { gold: number; silver: number; bronze: number; total: number; }
interface FormatBucket { total: number; rating: number; gold: number; }

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
  bestTournament: { id?: string; name: string; date: string; place: number; pts: number } | null;
  currentStreak: { type: 'top3' | 'none'; count: number };
  rankM: number | null;
  rankW: number | null;
  rankMix: number | null;
  formLast5: number[];
  levelPrizes: { hard: LevelBucket; advanced: LevelBucket; medium: LevelBucket; light: LevelBucket };
  formatStats: { kotc: FormatBucket; double: FormatBucket; thai: FormatBucket };
}

export async function fetchPlayerExtendedStats(playerId: string): Promise<PlayerExtendedStats> {
  const emptyLvl = () => ({ gold: 0, silver: 0, bronze: 0, total: 0 });
  const emptyFmtDef = () => ({ total: 0, rating: 0, gold: 0 });
  const empty: PlayerExtendedStats = {
    totalTournaments: 0, gold: 0, silver: 0, bronze: 0,
    topThreeRate: 0, avgPlace: 0, bestPlace: 0, totalRatingPts: 0, avgRatingPts: 0,
    winRate: 0, totalWins: 0, totalBalls: 0, avgBalls: 0,
    bestTournament: null, currentStreak: { type: 'none', count: 0 },
    rankM: null, rankW: null, rankMix: null, formLast5: [],
    levelPrizes: { hard: emptyLvl(), advanced: emptyLvl(), medium: emptyLvl(), light: emptyLvl() },
    formatStats: { kotc: emptyFmtDef(), double: emptyFmtDef(), thai: emptyFmtDef() },
  };
  if (!process.env.DATABASE_URL) return empty;
  if (!isUuid(playerId)) return empty;
  const pool = getPool();

  const { rows: results } = await pool.query(
    `SELECT tr.place, tr.game_pts, tr.rating_pts, tr.wins, tr.diff, tr.balls, tr.rating_type,
            tr.rating_pool,
            t.id AS tournament_id, t.name AS tournament_name, t.date AS tournament_date, t.format,
            COALESCE(t.level, '') AS tournament_level
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
  const totalRatingPts = results.reduce((s, r) => {
    const pool = r.rating_pool === 'novice' ? 'novice' : 'pro';
    return s + ratingPointsForPlace(Number(r.place), pool);
  }, 0);
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
    const pool = r.rating_pool === 'novice' ? 'novice' : 'pro';
    const pts = ratingPointsForPlace(Number(r.place), pool);
    if (pts > bestPts) {
      bestPts = pts;
      bestTournament = { id: r.tournament_id ? String(r.tournament_id) : undefined, name: r.tournament_name, date: toIsoDate(r.tournament_date), place: Number(r.place), pts };
    }
  }

  let streakCount = 0;
  for (const r of results) {
    if (Number(r.place) <= 3) streakCount++;
    else break;
  }
  const currentStreak = { type: (streakCount > 0 ? 'top3' : 'none') as 'top3' | 'none', count: streakCount };

  const valuesRows = RATING_POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');
  const eff = sqlEffectiveRatingPointsExpr('tr');
  const { rows: ranks } = await pool.query(
    `WITH pts(place, pts) AS (VALUES ${valuesRows}),
    ranked AS (
      SELECT tr.player_id, tr.rating_type,
             ROW_NUMBER() OVER (PARTITION BY tr.rating_type ORDER BY SUM(${eff}) DESC) AS rn
      FROM tournament_results tr
      JOIN players p ON p.id = tr.player_id AND p.status = 'active'
      LEFT JOIN pts lk ON lk.place = tr.place
      GROUP BY tr.player_id, tr.rating_type
      HAVING SUM(${eff}) > 0
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

  // ── Level prizes breakdown ───────────────────────────────────────────────
  function normLevel(raw: string): 'hard' | 'advanced' | 'medium' | 'light' | null {
    const l = (raw || '').toLowerCase();
    if (l.includes('hard')) return 'hard';
    if (l.includes('advanc')) return 'advanced';
    if (l.includes('medium') || l.includes('mid')) return 'medium';
    if (l.includes('light') || l.includes('lite') || l.includes('easy') || l.includes('novice')) return 'light';
    return null;
  }
  const emptyBucket = (): LevelBucket => ({ gold: 0, silver: 0, bronze: 0, total: 0 });
  const levelPrizes: PlayerExtendedStats['levelPrizes'] = {
    hard: emptyBucket(), advanced: emptyBucket(), medium: emptyBucket(), light: emptyBucket(),
  };
  for (const r of results) {
    const key = normLevel(String(r.tournament_level ?? ''));
    if (!key) continue;
    const b = levelPrizes[key];
    b.total++;
    const p = Number(r.place);
    if (p === 1) b.gold++;
    else if (p === 2) b.silver++;
    else if (p === 3) b.bronze++;
  }

  // ── Format stats (KOTC / Double Trouble / Thai) ──────────────────────────
  function normFormat(raw: string): 'kotc' | 'double' | 'thai' | null {
    const f = (raw || '').toLowerCase();
    if (f.includes('thai')) return 'thai';
    if (f.includes('kotc') || f.includes('king')) return 'kotc';
    if (f.includes('double') || f.includes('dbl') || f.includes('trouble') || f.includes('трабл')) return 'double';
    return null;
  }
  const emptyFmt = (): FormatBucket => ({ total: 0, rating: 0, gold: 0 });
  const formatStats: PlayerExtendedStats['formatStats'] = {
    kotc: emptyFmt(), double: emptyFmt(), thai: emptyFmt(),
  };
  for (const r of results) {
    const key = normFormat(String(r.format ?? ''));
    if (!key) continue;
    const b = formatStats[key];
    b.total++;
    b.rating += ratingPointsForPlace(Number(r.place), r.rating_pool === 'novice' ? 'novice' : 'pro');
    if (Number(r.place) === 1) b.gold++;
  }

  return {
    totalTournaments, gold, silver, bronze, topThreeRate,
    avgPlace, bestPlace, totalRatingPts, avgRatingPts, winRate, totalWins,
    totalBalls, avgBalls, bestTournament, currentStreak, rankM, rankW, rankMix, formLast5,
    levelPrizes, formatStats,
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
            tr.rating_type, tr.gender, tr.rating_pool
     FROM tournament_results tr
     JOIN players p ON p.id = tr.player_id
     WHERE tr.tournament_id = $1
     ORDER BY tr.place ASC, tr.game_pts DESC`,
    [tournamentId]
  );

  return rows.map((r) => {
    const place = Number(r.place ?? 0);
    const poolKind = r.rating_pool === 'novice' ? 'novice' : 'pro';
    const ratingPts = effectiveRatingPtsFromStored(place, poolKind, r.rating_pts);

    return {
      playerId: r.player_id,
      playerName: r.player_name,
      playerPhotoUrl: r.player_photo_url ?? '',
      place,
      gamePts: Number(r.game_pts ?? 0),
      ratingPts,
      wins: Number(r.wins ?? 0),
      diff: Number(r.diff ?? 0),
      balls: Number(r.balls ?? 0),
      ratingType: r.rating_type ?? '',
      gender: r.gender ?? '',
    };
  });
}
