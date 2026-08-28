import { getPool } from '@/lib/db';
import {
  buildPlayAchievements,
  buildPlayGameInsights,
  buildPlayGameScopeInsights,
  type GameInsightIdentity,
  type GameInsightSource,
  type PlayGameInsightPerson,
  type PlayGameInsightSummary,
  type PlayGameRatingMode,
  type PlayGameStatsScope,
} from '@/lib/play-game-insights';

export interface PlayPlayerStatsHistoryItem {
  resultId: string;
  postId: string;
  title: string;
  delta: number;
  ratingAfter: number;
  wins: number;
  losses: number;
  createdAt: string;
}

export interface PlayPlayerStatsGameItem {
  resultId: string;
  postId: string;
  title: string;
  ratingMode: PlayGameRatingMode;
  matches: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  delta: number | null;
  ratingAfter: number | null;
  createdAt: string;
}

export interface PlayPlayerStats {
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  updatedAt: string;
  history: PlayPlayerStatsHistoryItem[];
  games: PlayPlayerStatsGameItem[];
  scopes: Record<PlayGameStatsScope, PlayGameInsightSummary>;
  bestPartner: PlayGameInsightPerson | null;
  toughestOpponent: PlayGameInsightPerson | null;
  recentForm: Array<'W' | 'L'>;
  winStreak: number;
  achievements: Array<{ id: string; icon: string; title: string; level: 'bronze' | 'silver' | 'gold' }>;
}

type ConfirmedGameSource = GameInsightSource & {
  resultId: string;
  postId: string;
  title: string;
  ratingMode: PlayGameRatingMode;
};

function emptyInsightSummary(): PlayGameInsightSummary {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    bestPartner: null,
    toughestOpponent: null,
    recentForm: [],
    winStreak: 0,
  };
}

function emptyPlayPlayerStats(): PlayPlayerStats {
  return {
    rating: 1000,
    matches: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    updatedAt: '',
    history: [],
    games: [],
    scopes: {
      all: emptyInsightSummary(),
      rated: emptyInsightSummary(),
      friendly: emptyInsightSummary(),
    },
    bestPartner: null,
    toughestOpponent: null,
    recentForm: [],
    winStreak: 0,
    achievements: [],
  };
}

function isSchemaUnavailable(error: unknown): boolean {
  return ['42P01', '42703'].includes(String((error as { code?: unknown })?.code ?? ''));
}

function normalizeIdentity(value: unknown): GameInsightIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const resultKey = Number(raw.resultKey);
  const userId = raw.userId == null ? null : Number(raw.userId);
  if (!Number.isInteger(resultKey) || (userId != null && !Number.isInteger(userId))) return null;
  return {
    resultKey,
    userId,
    name: String(raw.name || '').trim() || undefined,
  };
}

function normalizeConfirmedGameSource(row: Record<string, unknown>): ConfirmedGameSource {
  const identities = (Array.isArray(row.identities) ? row.identities : [])
    .map(normalizeIdentity)
    .filter((identity): identity is GameInsightIdentity => identity != null);
  return {
    resultId: String(row.resultId || ''),
    postId: String(row.postId || ''),
    title: String(row.title || 'Обычная игра'),
    ratingMode: row.ratingMode === 'friendly' ? 'friendly' : 'rated',
    payload: row.payload,
    createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : '',
    viewerResultKey: Number(row.viewerResultKey),
    identities,
  };
}

async function loadConfirmedGameSources(
  userId: number,
  visibilityClause: string,
  includeRatingMode = true,
  includeNameSnapshot = true,
): Promise<ConfirmedGameSource[]> {
  const ratingModeSelect = includeRatingMode
    ? `CASE WHEN pp.rating_mode = 'friendly' THEN 'friendly' ELSE 'rated' END`
    : `'rated'`;
  const participantNameSelect = includeNameSnapshot
    ? `COALESCE(NULLIF(roster.name_snapshot, ''), NULLIF(roster_user.full_name, ''), NULLIF(roster.guest_name, ''), 'Игрок')`
    : `COALESCE(NULLIF(roster_user.full_name, ''), NULLIF(roster.guest_name, ''), 'Игрок')`;
  const { rows } = await getPool().query(
    `SELECT result.id::text AS "resultId", result.payload,
            result.created_at AS "createdAt", pp.id::text AS "postId", pp.title,
            ${ratingModeSelect} AS "ratingMode",
            target.result_key::text AS "viewerResultKey",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'resultKey', roster.result_key::text,
                       'userId', roster.user_id,
                       'name', ${participantNameSelect}
                     ) ORDER BY roster.created_at, roster.id)
                FROM play_post_participants roster
                LEFT JOIN users roster_user ON roster_user.id = roster.user_id
               WHERE roster.post_id = pp.id
            ), '[]'::jsonb) AS identities
       FROM play_game_results result
       JOIN play_posts pp ON pp.id = result.post_id
       JOIN play_post_participants target
         ON target.post_id = pp.id AND target.user_id = $1
      WHERE result.status = 'confirmed'
        AND result.reversed_at IS NULL
        ${visibilityClause}
      ORDER BY result.created_at DESC`,
    [userId],
  );
  return rows.map((row) => normalizeConfirmedGameSource(row));
}

async function loadConfirmedGameSourcesWithLegacyFallback(
  userId: number,
  visibilityClause: string,
): Promise<ConfirmedGameSource[]> {
  try {
    return await loadConfirmedGameSources(userId, visibilityClause, true, true);
  } catch (error) {
    if (String((error as { code?: unknown })?.code ?? '') !== '42703') throw error;
    try {
      return await loadConfirmedGameSources(userId, visibilityClause, true, false);
    } catch (fallbackError) {
      // Until migration 087 is applied, every historical game follows the old rated behavior.
      if (String((fallbackError as { code?: unknown })?.code ?? '') !== '42703') throw fallbackError;
      return loadConfirmedGameSources(userId, visibilityClause, false, false);
    }
  }
}

export async function fetchPlayPlayerStatsForUser(
  userId: number,
  options: { publicHistoryOnly?: boolean } = {},
): Promise<PlayPlayerStats> {
  if (!process.env.DATABASE_URL || !Number.isInteger(userId) || userId <= 0) return emptyPlayPlayerStats();
  const visibilityClause = options.publicHistoryOnly
    ? `AND pp.visibility = 'public' AND pp.status = 'completed'`
    : '';

  try {
    const [account, history, sources] = await Promise.all([
      getPool().query(
        `SELECT rating, matches, wins, losses,
                points_for AS "pointsFor", points_against AS "pointsAgainst",
                updated_at AS "updatedAt"
           FROM play_game_rating_accounts
          WHERE user_id = $1`,
        [userId],
      ),
      getPool().query(
        `SELECT event.result_id::text AS "resultId", event.delta,
                event.rating_after AS "ratingAfter", event.wins, event.losses,
                event.created_at AS "createdAt", pp.id::text AS "postId", pp.title
           FROM play_game_rating_events event
           JOIN play_game_results result ON result.id = event.result_id
           JOIN play_posts pp ON pp.id = result.post_id
          WHERE event.user_id = $1
            AND event.reversed_at IS NULL
            AND result.status = 'confirmed'
            AND result.reversed_at IS NULL
            ${visibilityClause}
          ORDER BY event.created_at DESC
          LIMIT 20`,
        [userId],
      ),
      loadConfirmedGameSourcesWithLegacyFallback(userId, visibilityClause),
    ]);

    const row = account.rows[0] || emptyPlayPlayerStats();
    const names = new Map<number, string>();
    for (const source of sources) {
      for (const identity of source.identities ?? []) {
        if (identity.userId != null && identity.name) names.set(identity.userId, identity.name);
      }
    }
    const scopes = buildPlayGameScopeInsights(userId, sources, names);
    const ratedInsights = scopes.rated;
    const rating = Number(row.rating ?? 1000);
    const matches = Number(row.matches ?? 0);
    const wins = Number(row.wins ?? 0);
    const losses = Number(row.losses ?? 0);
    const normalizedHistory: PlayPlayerStatsHistoryItem[] = history.rows.map((item) => ({
      resultId: String(item.resultId),
      postId: String(item.postId),
      title: String(item.title || 'Обычная игра'),
      delta: Number(item.delta ?? 0),
      ratingAfter: Number(item.ratingAfter ?? 1000),
      wins: Number(item.wins ?? 0),
      losses: Number(item.losses ?? 0),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
    }));
    const ratingHistory = new Map(normalizedHistory.map((item) => [item.resultId, item]));
    const games = sources.flatMap((source): PlayPlayerStatsGameItem[] => {
      const summary = buildPlayGameInsights(userId, [source], names);
      if (summary.matches === 0) return [];
      const event = ratingHistory.get(source.resultId);
      return [{
        resultId: source.resultId,
        postId: source.postId,
        title: source.title,
        ratingMode: source.ratingMode,
        matches: summary.matches,
        wins: summary.wins,
        losses: summary.losses,
        pointsFor: summary.pointsFor,
        pointsAgainst: summary.pointsAgainst,
        delta: event?.delta ?? null,
        ratingAfter: event?.ratingAfter ?? null,
        createdAt: source.createdAt,
      }];
    });

    return {
      rating,
      matches,
      wins,
      losses,
      pointsFor: Number(row.pointsFor ?? 0),
      pointsAgainst: Number(row.pointsAgainst ?? 0),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
      history: normalizedHistory,
      games,
      scopes,
      bestPartner: ratedInsights.bestPartner,
      toughestOpponent: ratedInsights.toughestOpponent,
      recentForm: ratedInsights.recentForm,
      winStreak: ratedInsights.winStreak,
      achievements: buildPlayAchievements({ matches, wins, rating, winStreak: ratedInsights.winStreak }) as PlayPlayerStats['achievements'],
    };
  } catch (error) {
    if (isSchemaUnavailable(error)) return emptyPlayPlayerStats();
    throw error;
  }
}

export async function fetchPublicPlayPlayerStats(playerId: string): Promise<PlayPlayerStats> {
  if (!process.env.DATABASE_URL || !playerId) return emptyPlayPlayerStats();
  try {
    const { rows } = await getPool().query(
      `SELECT id FROM users WHERE player_id::text = $1 LIMIT 1`,
      [playerId],
    );
    const userId = Number(rows[0]?.id ?? 0);
    return userId > 0
      ? fetchPlayPlayerStatsForUser(userId, { publicHistoryOnly: true })
      : emptyPlayPlayerStats();
  } catch (error) {
    if (isSchemaUnavailable(error)) return emptyPlayPlayerStats();
    throw error;
  }
}
