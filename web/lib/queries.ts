import { getPool } from './db';
import type {
  LeaderboardEntry,
  MedalEntry,
  Player,
  Tournament,
  RatingType,
  TournamentFormatFilter,
  Team,
  RatingHistoryEntry,
  RegistrationEntry,
  TournamentResult,
} from './types';
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
  normalizeTournamentRatingLevel,
  normalizeTournamentRatingLevelFromZone,
  ratingPointsForLevelPlace,
  sqlEffectiveRatingPointsExpr,
} from './rating-points';
import { sanitizeServerImageUrl } from './server-image-url';
import { resolveThaiSpectatorBoardUrlForArchive } from './thai-archive-meta';
import { isKotcNextDemoTournament } from './kotc-next-demo-config';
import { getKotcNextOperatorStateSummary } from './kotc-next';
import {
  buildPlayerFormatInsights,
  emptyPlayerFormatInsights,
  type KotcPlayerInsightNativeRow,
  type PlayerFormatInsights,
  type ThaiPlayerInsightNativeRow,
} from './player-format-insights';

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

function isKotcFormatValue(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.includes('king') || normalized.includes('kotc');
}

function resolveResultRatingPts(input: {
  place: number;
  pool: 'pro' | 'novice';
  storedRatingPts: number | null | undefined;
  tournamentFormat?: unknown;
  tournamentLevel?: string | null | undefined;
  kotcZone?: string | null | undefined;
}): number {
  if (isKotcFormatValue(input.tournamentFormat) && String(input.kotcZone || '').trim()) {
    return ratingPointsForLevelPlace(
      input.place,
      normalizeTournamentRatingLevelFromZone(input.kotcZone),
      input.pool,
    );
  }

  const level = input.tournamentLevel ? normalizeTournamentRatingLevel(input.tournamentLevel) : undefined;
  return effectiveRatingPtsFromStored(input.place, input.pool, input.storedRatingPts, level);
}

export function shouldHideTournamentFromPublic(input: {
  name?: unknown;
  location?: unknown;
  format?: unknown;
  status?: unknown;
  settings?: unknown;
}): boolean {
  if (String(input.status || '').trim().toLowerCase() === 'draft') {
    return true;
  }

  if (isKotcNextDemoTournament({ format: input.format, settings: input.settings })) {
    return true;
  }

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
    photoUrl: sanitizeServerImageUrl(row.photo_url),
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
      : format === 'thai'
      ? `AND (LOWER(COALESCE(t.format, '')) = 'thai' OR LOWER(COALESCE(t.format, '')) LIKE '%thai%')`
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
     JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
       AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true' ${formatClause}
     LEFT JOIN pts lk ON lk.place = tr.place
     WHERE tr.rating_type = $1
     GROUP BY p.id, p.name, p.gender, p.photo_url
     HAVING COALESCE(SUM(${eff}), 0) > 0
     ORDER BY rating DESC, tournaments DESC, p.name ASC
     LIMIT $2`,
    [type, limit]
  );

  const previousRankByPlayerId = new Map<string, number>();
  if (rows.length > 0) {
    const { rows: previousRanks } = await pool.query(
      `WITH pts(place, pts) AS (VALUES ${valuesRows}),
       latest_date AS (
         SELECT MAX(t.date) AS value
         FROM tournament_results tr
         JOIN players p ON p.id = tr.player_id AND p.status = 'active'
         JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
           AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true' ${formatClause}
         WHERE tr.rating_type = $1
       ),
       previous_totals AS (
         SELECT
           p.id,
           p.name,
           COALESCE(SUM(${eff}), 0)::int AS rating,
           COUNT(DISTINCT tr.tournament_id)::int AS tournaments
         FROM tournament_results tr
         JOIN players p ON p.id = tr.player_id AND p.status = 'active'
         JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
           AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true' ${formatClause}
         LEFT JOIN pts lk ON lk.place = tr.place
         CROSS JOIN latest_date
         WHERE tr.rating_type = $1
           AND t.date < latest_date.value
         GROUP BY p.id, p.name
         HAVING COALESCE(SUM(${eff}), 0) > 0
       )
       SELECT
         id,
         ROW_NUMBER() OVER (ORDER BY rating DESC, tournaments DESC, name ASC)::int AS previous_rank
       FROM previous_totals`,
      [type]
    );

    for (const row of previousRanks) {
      previousRankByPlayerId.set(String(row.id), Number(row.previous_rank));
    }
  }

  return rows.map((row, i) => ({
    rank: i + 1,
    previousRank: previousRankByPlayerId.get(String(row.id)) ?? null,
    rankDelta:
      previousRankByPlayerId.has(String(row.id))
        ? Number(previousRankByPlayerId.get(String(row.id))) - (i + 1)
        : null,
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
    photoUrl: sanitizeServerImageUrl(row.photo_url),
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
      : format === 'thai'
      ? `AND (LOWER(COALESCE(t.format, '')) = 'thai' OR LOWER(COALESCE(t.format, '')) LIKE '%thai%')`
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
     JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
       AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true' ${formatClause}
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
    photoUrl: sanitizeServerImageUrl(row.photo_url),
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

  const { rows: computed } = await pool.query(
    `SELECT
       tr.rating_type,
       tr.tournament_id,
       tr.place,
       tr.rating_pts,
       tr.rating_pool,
       COALESCE(tr.wins, 0) AS wins,
       t.date AS tournament_date,
       t.format AS tournament_format,
       COALESCE(t.level, '') AS tournament_level,
       kotc_deep.zone AS kotc_zone
     FROM tournament_results tr
     LEFT JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
       AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true'
     LEFT JOIN LATERAL (
       SELECT stats.zone
       FROM kotcn_player_round_stat stats
       JOIN kotcn_round r ON r.id = stats.round_id
       WHERE r.tournament_id = tr.tournament_id
         AND stats.player_id = tr.player_id
       ORDER BY r.round_no DESC
       LIMIT 1
     ) kotc_deep ON TRUE
     WHERE tr.player_id = $1
       AND t.id IS NOT NULL`,
    [id]
  );

  let ratingM = 0, ratingW = 0, ratingMix = 0;
  let tournamentsM = 0, tournamentsW = 0, tournamentsMix = 0;
  let totalWins = 0;
  let lastSeen = '';
  const tournamentIdsByType = {
    M: new Set<string>(),
    W: new Set<string>(),
    Mix: new Set<string>(),
  };

  for (const r of computed) {
    const ratingType = r.rating_type === 'W' ? 'W' : r.rating_type === 'Mix' ? 'Mix' : 'M';
    const rating = resolveResultRatingPts({
      place: Number(r.place ?? 0),
      pool: r.rating_pool === 'novice' ? 'novice' : 'pro',
      storedRatingPts: r.rating_pts != null ? Number(r.rating_pts) : undefined,
      tournamentFormat: r.tournament_format,
      tournamentLevel: String(r.tournament_level ?? ''),
      kotcZone: String(r.kotc_zone ?? ''),
    });
    const wins = Number(r.wins ?? 0);
    const seen = toIsoDate(r.tournament_date);
    totalWins += wins;
    if (seen > lastSeen) lastSeen = seen;

    const tournamentId = String(r.tournament_id ?? '');
    if (tournamentId) tournamentIdsByType[ratingType].add(tournamentId);

    if (ratingType === 'M') ratingM += rating;
    else if (ratingType === 'W') ratingW += rating;
    else ratingMix += rating;
  }

  tournamentsM = tournamentIdsByType.M.size;
  tournamentsW = tournamentIdsByType.W.size;
  tournamentsMix = tournamentIdsByType.Mix.size;

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
    photoUrl: sanitizeServerImageUrl(data.photo_url),
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
        format: row.format,
        status: row.status,
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
        AND COALESCE(t.status, '') NOT IN ('cancelled', 'draft')
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
        format: 'thai',
        status: 'open',
        settings: row.settings,
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
  menTournaments: number;
  womenTournaments: number;
  mixTournaments: number;
  total: number;
}

export async function fetchRankingCounts(): Promise<RankingCounts> {
  if (!process.env.DATABASE_URL) {
    return {
      men: 0,
      women: 0,
      mix: 0,
      menTournaments: 0,
      womenTournaments: 0,
      mixTournaments: 0,
      total: 0,
    };
  }
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT
      count(DISTINCT player_id) FILTER (WHERE rating_type = 'M')::int   AS men,
      count(DISTINCT player_id) FILTER (WHERE rating_type = 'W')::int   AS women,
      count(DISTINCT player_id) FILTER (WHERE rating_type = 'Mix')::int AS mix,
      count(DISTINCT tr.tournament_id) FILTER (WHERE rating_type = 'M')::int   AS men_tournaments,
      count(DISTINCT tr.tournament_id) FILTER (WHERE rating_type = 'W')::int   AS women_tournaments,
      count(DISTINCT tr.tournament_id) FILTER (WHERE rating_type = 'Mix')::int AS mix_tournaments,
      count(DISTINCT player_id)::int AS total
    FROM tournament_results tr
    JOIN players p ON p.id = tr.player_id AND p.status = 'active'
    JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
      AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true'
  `);
  const r = rows[0];
  return {
    men: r?.men ?? 0,
    women: r?.women ?? 0,
    mix: r?.mix ?? 0,
    menTournaments: r?.men_tournaments ?? 0,
    womenTournaments: r?.women_tournaments ?? 0,
    mixTournaments: r?.mix_tournaments ?? 0,
    total: r?.total ?? 0,
  };
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

  if (
    shouldHideTournamentFromPublic({
      name: data.name,
      location: data.location,
      format: data.format,
      status: data.status,
      settings: data.settings,
    })
  ) {
    return null;
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
): Promise<TournamentResult[]> {
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
        t.level AS tournament_level,
        thai_deep.points_p AS thai_points_p,
        thai_deep.wins AS thai_round_wins,
        thai_deep.total_diff AS thai_round_diff,
        thai_deep.round_type AS thai_round_type,
        thai_deep.zone AS thai_zone,
        kotc_deep.king_wins AS kotc_king_wins,
        kotc_deep.takeovers AS kotc_takeovers,
        kotc_deep.games_played AS kotc_games_played,
        kotc_deep.round_no AS kotc_round_no,
        kotc_deep.zone AS kotc_zone
      FROM tournament_results tr
      JOIN tournaments t ON t.id = tr.tournament_id
      JOIN players p ON p.id = tr.player_id
      LEFT JOIN LATERAL (
        SELECT
          r.round_type,
          stats.points_p,
          stats.wins,
          stats.total_diff,
          stats.zone
        FROM thai_player_round_stat stats
        JOIN thai_round r ON r.id = stats.round_id
        WHERE stats.tournament_id = t.id
          AND stats.player_id = tr.player_id
        ORDER BY r.round_no DESC
        LIMIT 1
      ) thai_deep ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          r.round_no,
          stats.king_wins,
          stats.takeovers,
          stats.games_played,
          stats.zone
        FROM kotcn_player_round_stat stats
        JOIN kotcn_round r ON r.id = stats.round_id
        WHERE r.tournament_id = t.id
          AND stats.player_id = tr.player_id
        ORDER BY r.round_no DESC
        LIMIT 1
      ) kotc_deep ON TRUE
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
    const place = Number(r.place ?? 0);
    const ratingPool = r.rating_pool === 'novice' ? 'novice' : 'pro';
    const ratingPts = resolveResultRatingPts({
      place,
      pool: ratingPool,
      storedRatingPts: r.rating_pts != null ? Number(r.rating_pts) : undefined,
      tournamentFormat: r.tournament_format,
      tournamentLevel: r.tournament_level ? String(r.tournament_level) : null,
      kotcZone: String(r.kotc_zone || ''),
    });
    return {
      playerId: r.player_id,
      playerName: r.player_name,
      place,
      gamePts: Number(r.game_pts ?? 0),
      ratingPts,
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
      thaiPointsP: r.thai_points_p != null ? Number(r.thai_points_p) : null,
      thaiRoundWins: r.thai_round_wins != null ? Number(r.thai_round_wins) : null,
      thaiRoundDiff: r.thai_round_diff != null ? Number(r.thai_round_diff) : null,
      thaiRoundType: (() => {
        const roundType = String(r.thai_round_type || '').trim().toLowerCase();
        if (roundType === 'r2') return 'r2' as const;
        if (roundType === 'r1') return 'r1' as const;
        return null;
      })(),
      thaiZone: (() => {
        const zone = String(r.thai_zone || '').trim().toLowerCase();
        if (zone === 'advance') return 'advanced';
        if (zone === 'hard' || zone === 'advanced' || zone === 'medium' || zone === 'light') return zone as 'hard' | 'advanced' | 'medium' | 'light';
        return null;
      })(),
      kotcKingWins: r.kotc_king_wins != null ? Number(r.kotc_king_wins) : null,
      kotcTakeovers: r.kotc_takeovers != null ? Number(r.kotc_takeovers) : null,
      kotcGamesPlayed: r.kotc_games_played != null ? Number(r.kotc_games_played) : null,
      kotcRoundNo: r.kotc_round_no != null ? (Number(r.kotc_round_no) === 2 ? 2 : 1) as 1 | 2 : null,
      kotcZone: (() => {
        const zone = String(r.kotc_zone || '').trim().toLowerCase();
        if (zone === 'advance') return 'advanced';
        if (zone === 'hard') return 'kin';
        if (zone === 'kin' || zone === 'advanced' || zone === 'medium' || zone === 'light') return zone as 'kin' | 'advanced' | 'medium' | 'light';
        if (zone === 'lite') return 'light';
        return null;
      })(),
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
    `COALESCE(t.status, 'open') NOT IN ('cancelled', 'draft')`,
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
         t.settings AS tournament_settings,
         pr.created_at
       FROM player_requests pr
       LEFT JOIN tournaments t ON t.id = pr.tournament_id
       WHERE ${parts.join(' AND ')}
       ORDER BY t.date ASC NULLS LAST, pr.created_at ASC
       LIMIT 300`,
      params
    );

    return rows
      .filter((r) =>
        !shouldHideTournamentFromPublic({
          name: r.tournament_name,
          format: '',
          status: 'open',
          settings: r.tournament_settings,
        }),
      )
      .map((r) => ({
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
  rankDeltaM: number | null;
  rankDeltaW: number | null;
  rankDeltaMix: number | null;
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
    rankM: null, rankW: null, rankMix: null,
    rankDeltaM: null, rankDeltaW: null, rankDeltaMix: null, formLast5: [],
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
            COALESCE(t.level, '') AS tournament_level,
            kotc_deep.zone AS kotc_zone
     FROM tournament_results tr
     JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
       AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true'
     LEFT JOIN LATERAL (
       SELECT stats.zone
       FROM kotcn_player_round_stat stats
       JOIN kotcn_round r ON r.id = stats.round_id
       WHERE r.tournament_id = t.id
         AND stats.player_id = tr.player_id
       ORDER BY r.round_no DESC
       LIMIT 1
     ) kotc_deep ON TRUE
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
    return s + resolveResultRatingPts({
      place: Number(r.place),
      pool: r.rating_pool === 'novice' ? 'novice' : 'pro',
      storedRatingPts: r.rating_pts != null ? Number(r.rating_pts) : undefined,
      tournamentFormat: r.format,
      tournamentLevel: String(r.tournament_level ?? ''),
      kotcZone: String(r.kotc_zone ?? ''),
    });
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
    const pts = resolveResultRatingPts({
      place: Number(r.place),
      pool: r.rating_pool === 'novice' ? 'novice' : 'pro',
      storedRatingPts: r.rating_pts != null ? Number(r.rating_pts) : undefined,
      tournamentFormat: r.format,
      tournamentLevel: String(r.tournament_level ?? ''),
      kotcZone: String(r.kotc_zone ?? ''),
    });
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
    eligible AS (
      SELECT
        tr.player_id,
        tr.rating_type,
        p.name,
        t.date,
        ${eff} AS rating_points,
        tr.tournament_id
      FROM tournament_results tr
      JOIN players p ON p.id = tr.player_id AND p.status = 'active'
      JOIN tournaments t ON t.id = tr.tournament_id AND t.status = 'finished'
        AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true'
      LEFT JOIN pts lk ON lk.place = tr.place
    ),
    latest_dates AS (
      SELECT rating_type, MAX(date) AS latest_date
      FROM eligible
      GROUP BY rating_type
    ),
    current_totals AS (
      SELECT player_id, rating_type, MIN(name) AS name,
             SUM(rating_points)::int AS rating,
             COUNT(DISTINCT tournament_id)::int AS tournaments
      FROM eligible
      GROUP BY player_id, rating_type
      HAVING SUM(rating_points) > 0
    ),
    current_ranked AS (
      SELECT player_id, rating_type,
             ROW_NUMBER() OVER (
               PARTITION BY rating_type
               ORDER BY rating DESC, tournaments DESC, name ASC
             ) AS rn
      FROM current_totals
    ),
    previous_totals AS (
      SELECT e.player_id, e.rating_type, MIN(e.name) AS name,
             SUM(e.rating_points)::int AS rating,
             COUNT(DISTINCT e.tournament_id)::int AS tournaments
      FROM eligible e
      JOIN latest_dates latest ON latest.rating_type = e.rating_type
      WHERE e.date < latest.latest_date
      GROUP BY e.player_id, e.rating_type
      HAVING SUM(e.rating_points) > 0
    ),
    previous_ranked AS (
      SELECT player_id, rating_type,
             ROW_NUMBER() OVER (
               PARTITION BY rating_type
               ORDER BY rating DESC, tournaments DESC, name ASC
             ) AS previous_rn
      FROM previous_totals
    )
    SELECT current.rating_type, current.rn, previous.previous_rn
    FROM current_ranked current
    LEFT JOIN previous_ranked previous
      ON previous.player_id = current.player_id
     AND previous.rating_type = current.rating_type
    WHERE current.player_id = $1`,
    [playerId]
  );
  let rankM: number | null = null, rankW: number | null = null, rankMix: number | null = null;
  let rankDeltaM: number | null = null, rankDeltaW: number | null = null, rankDeltaMix: number | null = null;
  for (const r of ranks) {
    const rank = Number(r.rn);
    const previousRank = r.previous_rn == null ? null : Number(r.previous_rn);
    const delta = previousRank == null ? null : previousRank - rank;
    if (r.rating_type === 'M') { rankM = rank; rankDeltaM = delta; }
    if (r.rating_type === 'W') { rankW = rank; rankDeltaW = delta; }
    if (r.rating_type === 'Mix') { rankMix = rank; rankDeltaMix = delta; }
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
    b.rating += resolveResultRatingPts({
      place: Number(r.place),
      pool: r.rating_pool === 'novice' ? 'novice' : 'pro',
      storedRatingPts: r.rating_pts != null ? Number(r.rating_pts) : undefined,
      tournamentFormat: r.format,
      tournamentLevel: String(r.tournament_level ?? ''),
      kotcZone: String(r.kotc_zone ?? ''),
    });
    if (Number(r.place) === 1) b.gold++;
  }

  return {
    totalTournaments, gold, silver, bronze, topThreeRate,
    avgPlace, bestPlace, totalRatingPts, avgRatingPts, winRate, totalWins,
    totalBalls, avgBalls, bestTournament, currentStreak, rankM, rankW, rankMix,
    rankDeltaM, rankDeltaW, rankDeltaMix, formLast5,
    levelPrizes, formatStats,
  };
}

// ─── Tournament Results (public page) ───────────────────────────────────

export async function fetchPlayerFormatInsights(
  playerId: string,
  options?: { matches?: TournamentResult[]; stats?: PlayerExtendedStats | null; player?: Player | null },
): Promise<PlayerFormatInsights> {
  const empty = emptyPlayerFormatInsights();

  if (!process.env.DATABASE_URL) return empty;
  if (!isUuid(playerId)) return empty;

  const pool = getPool();
  const matches = options?.matches ?? (await fetchPlayerMatches(playerId, 30));
  const stats = options?.stats ?? (await fetchPlayerExtendedStats(playerId));
  const player = options?.player ?? (await fetchPlayer(playerId));
  const primaryRating = player ? (player.gender === 'M' ? player.ratingM : player.ratingW) : 0;

  const { rows: thaiRows } = await pool.query(
    `
      WITH latest_round AS (
        SELECT DISTINCT ON (r.tournament_id)
          r.tournament_id::text AS tournament_id,
          COALESCE(t.name, '') AS tournament_name,
          t.date AS tournament_date,
          r.round_no,
          r.round_type,
          stats.points_p,
          stats.wins,
          stats.total_diff,
          stats.kef,
          stats.zone,
          (
            SELECT COUNT(*)::int
            FROM thai_match tm
            JOIN thai_tour tt ON tt.id = tm.tour_id
            JOIN thai_court tc ON tc.id = tt.court_id
            JOIN thai_match_player mp ON mp.match_id = tm.id
            WHERE tc.round_id = r.id
              AND mp.player_id = stats.player_id
              AND tm.status = 'confirmed'
              AND (
                (mp.team_side = 1 AND tm.team1_score > tm.team2_score AND ABS(tm.team1_score - tm.team2_score) <= 2) OR
                (mp.team_side = 2 AND tm.team2_score > tm.team1_score AND ABS(tm.team1_score - tm.team2_score) <= 2)
              )
          ) AS close_wins
        FROM thai_player_round_stat stats
        JOIN thai_round r ON r.id = stats.round_id
        JOIN tournaments t ON t.id = r.tournament_id
        WHERE stats.player_id = $1
          AND t.status = 'finished'
        ORDER BY r.tournament_id, r.round_no DESC
      )
      SELECT
        tournament_id,
        tournament_name,
        tournament_date,
        round_no,
        round_type,
        points_p,
        wins,
        total_diff,
        kef,
        zone,
        close_wins
      FROM latest_round
      ORDER BY tournament_date DESC, round_no DESC
    `,
    [playerId],
  );

  const thaiNativeRows: ThaiPlayerInsightNativeRow[] = thaiRows.map((row) => ({
    tournamentId: String(row.tournament_id || ''),
    tournamentName: String(row.tournament_name || ''),
    tournamentDate: toIsoDate(row.tournament_date),
    roundNo: Number(row.round_no || 0),
    roundType: String(row.round_type || '').trim().toLowerCase() === 'r2' ? 'r2' : 'r1',
    pointsP: Number(row.points_p || 0),
    wins: Number(row.wins || 0),
    totalDiff: Number(row.total_diff || 0),
    kef: Number(row.kef || 0),
    zone: (() => {
      const zone = String(row.zone || '').trim().toLowerCase();
      if (zone === 'advance') return 'advanced';
      if (zone === 'hard' || zone === 'advanced' || zone === 'medium' || zone === 'light') {
        return zone as 'hard' | 'advanced' | 'medium' | 'light';
      }
      return null;
    })(),
    closeWins: Number(row.close_wins || 0),
  }));

  const { rows: kotcRows } = await pool.query(
    `
      SELECT
        r.tournament_id::text AS tournament_id,
        COALESCE(t.name, '') AS tournament_name,
        t.date AS tournament_date,
        r.round_no,
        SUM(stats.king_wins)::int AS king_wins,
        SUM(stats.takeovers)::int AS takeovers,
        SUM(stats.games_played)::int AS games_played,
        MAX(stats.king_wins)::int AS longest_king_run,
        MAX(stats.zone) AS zone
      FROM kotcn_player_round_stat stats
      JOIN kotcn_round r ON r.id = stats.round_id
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE stats.player_id = $1
        AND t.status = 'finished'
      GROUP BY r.tournament_id, t.name, t.date, r.round_no
      ORDER BY t.date DESC, r.round_no ASC
    `,
    [playerId],
  );

  const kotcNativeRows: KotcPlayerInsightNativeRow[] = kotcRows.map((row) => ({
    tournamentId: String(row.tournament_id || ''),
    tournamentName: String(row.tournament_name || ''),
    tournamentDate: toIsoDate(row.tournament_date),
    roundNo: Number(row.round_no || 0),
    kingWins: Number(row.king_wins || 0),
    takeovers: Number(row.takeovers || 0),
    gamesPlayed: Number(row.games_played || 0),
    longestKingRun: Number(row.longest_king_run || 0),
    zone: (() => {
      const zone = String(row.zone || '').trim().toLowerCase();
      if (zone === 'advance') return 'advanced';
      if (zone === 'hard') return 'kin';
      if (zone === 'kin' || zone === 'advanced' || zone === 'medium' || zone === 'light') {
        return zone as 'kin' | 'advanced' | 'medium' | 'light';
      }
      if (zone === 'lite') return 'light';
      return null;
    })(),
  }));

  return buildPlayerFormatInsights({
    matches,
    primaryRating,
    currentTop3Streak: stats?.currentStreak?.count ?? 0,
    thaiNativeRows,
    kotcNativeRows,
  });
}

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
  ratingPool?: 'pro' | 'novice' | null;
  zoneLabel?: string | null;
}

export async function fetchTournamentRegistrations(
  tournamentId: string,
  formatCode: string
): Promise<RegistrationEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();

  const fc = String(formatCode || '').toLowerCase();
  let formatClause = '';
  if (fc === 'kotc' || fc.includes('king')) {
    formatClause = `AND (LOWER(COALESCE(t2.format, '')) = 'kotc' OR LOWER(COALESCE(t2.format, '')) LIKE '%king%')`;
  } else if (fc === 'thai' || fc.includes('thai')) {
    formatClause = `AND LOWER(COALESCE(t2.format, '')) LIKE '%thai%'`;
  } else if (fc === 'dt' || fc === 'ipt' || fc.includes('ipt') || fc.includes('double')) {
    formatClause = `AND (LOWER(COALESCE(t2.format, '')) LIKE '%ipt%' OR LOWER(COALESCE(t2.format, '')) LIKE '%double%')`;
  }

  const eff = sqlEffectiveRatingPointsExpr('tr');
  const valuesRows = RATING_POINTS_TABLE.map((pts, i) => `(${i + 1}, ${pts})`).join(',');

  try {
    const { rows } = await pool.query(
      `WITH pts(place, pts) AS (VALUES ${valuesRows})
       SELECT
         pr.id,
         pr.name,
         pr.gender,
         CASE WHEN p.id IS NOT NULL
              THEN COALESCE(SUM(${eff}), 0)::int
              ELSE NULL
         END AS format_rating
       FROM player_requests pr
       LEFT JOIN players p ON p.id::text = pr.approved_player_id
       LEFT JOIN tournament_results tr ON tr.player_id = p.id
       LEFT JOIN tournaments t2 ON t2.id = tr.tournament_id
         AND t2.status = 'finished'
         ${formatClause}
       LEFT JOIN pts lk ON lk.place = tr.place
       WHERE pr.tournament_id = $1
         AND pr.status = 'approved'
       GROUP BY pr.id, pr.name, pr.gender, p.id, pr.created_at
       ORDER BY pr.created_at ASC`,
      [tournamentId]
    );

    return rows.map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? ''),
      gender: String(r.gender ?? ''),
      formatRating: r.format_rating != null ? Number(r.format_rating) : null,
    }));
  } catch {
    return [];
  }
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

  const baseResults = rows.map((r) => {
    const place = Number(r.place ?? 0);
    const poolKind: 'pro' | 'novice' = r.rating_pool === 'novice' ? 'novice' : 'pro';
    const ratingPts = effectiveRatingPtsFromStored(place, poolKind, r.rating_pts);

    return {
      playerId: r.player_id,
      playerName: r.player_name,
      playerPhotoUrl: sanitizeServerImageUrl(r.player_photo_url),
      place,
      gamePts: Number(r.game_pts ?? 0),
      ratingPts,
      wins: Number(r.wins ?? 0),
      diff: Number(r.diff ?? 0),
      balls: Number(r.balls ?? 0),
      ratingType: r.rating_type ?? '',
      gender: r.gender ?? '',
      ratingPool: poolKind,
    };
  });

  let format = '';
  try {
    const tournamentMeta = await pool.query(
      `SELECT format FROM tournaments WHERE id = $1 LIMIT 1`,
      [tournamentId],
    );
    format = String(tournamentMeta.rows[0]?.format ?? '').trim().toLowerCase();
  } catch {
    return baseResults;
  }

  if (!format.includes('king') && !format.includes('kotc')) {
    return baseResults;
  }

  try {
    const state = await getKotcNextOperatorStateSummary(tournamentId);
    const finalRows = state?.finalIndividualResults ?? [];
    if (!finalRows.length) return baseResults;

    const playerIds = finalRows
      .map((row) => String(row.playerId || '').trim())
      .filter((value): value is string => Boolean(value) && isUuid(value));

    const photoByPlayerId = new Map<string, string>();
    if (playerIds.length) {
      const photoRows = await pool.query(
        `SELECT id, photo_url FROM players WHERE id = ANY($1::uuid[])`,
        [playerIds],
      );
      for (const row of photoRows.rows) {
        const playerId = String(row.id ?? '').trim();
        if (!playerId) continue;
        photoByPlayerId.set(playerId, sanitizeServerImageUrl(row.photo_url));
      }
    }

    const baseByPlayerId = new Map(
      baseResults
        .filter((row) => row.playerId)
        .map((row) => [row.playerId, row] as const),
    );

    return finalRows.map((row) => {
      const normalizedPlayerId = String(row.playerId || '').trim();
      const base = normalizedPlayerId ? baseByPlayerId.get(normalizedPlayerId) : undefined;
      const r2 = row.r2;

      return {
        playerId: normalizedPlayerId,
        playerName: row.playerName,
        playerPhotoUrl:
          (normalizedPlayerId ? photoByPlayerId.get(normalizedPlayerId) : '') ||
          base?.playerPhotoUrl ||
          '',
        place: row.finalPosition,
        gamePts: r2?.kingWins ?? base?.gamePts ?? 0,
        ratingPts: resolveResultRatingPts({
          place: row.finalPosition,
          pool: 'pro',
          storedRatingPts: undefined,
          tournamentFormat: format,
          kotcZone: row.finalZone,
        }),
        wins: r2?.kingWins ?? base?.wins ?? 0,
        diff: r2?.takeovers ?? base?.diff ?? 0,
        balls: r2?.gamesPlayed ?? base?.balls ?? 0,
        ratingType: base?.ratingType ?? '',
        gender: row.gender ?? base?.gender ?? '',
        zoneLabel: row.finalZoneLabel,
      };
    });
  } catch {
    return baseResults;
  }
}
