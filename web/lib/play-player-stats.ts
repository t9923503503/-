import { getPool } from '@/lib/db';
import { buildPlayAchievements, buildPlayGameInsights } from '@/lib/play-game-insights';

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

export interface PlayPlayerStats {
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  updatedAt: string;
  history: PlayPlayerStatsHistoryItem[];
  bestPartner: { userId: number; name: string; matches: number; wins: number; losses: number; winRate: number } | null;
  toughestOpponent: { userId: number; name: string; matches: number; wins: number; losses: number; winRate: number } | null;
  recentForm: Array<'W' | 'L'>;
  winStreak: number;
  achievements: Array<{ id: string; icon: string; title: string; level: 'bronze' | 'silver' | 'gold' }>;
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

export async function fetchPlayPlayerStatsForUser(
  userId: number,
  options: { publicHistoryOnly?: boolean } = {},
): Promise<PlayPlayerStats> {
  if (!process.env.DATABASE_URL || !Number.isInteger(userId) || userId <= 0) return emptyPlayPlayerStats();
  const visibilityClause = options.publicHistoryOnly
    ? `AND pp.visibility = 'public' AND pp.status = 'completed'`
    : '';

  try {
    const [account, history, sources, users] = await Promise.all([
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
      getPool().query(
        `SELECT result.payload, result.created_at AS "createdAt"
           FROM play_game_results result
           JOIN play_game_rating_events event ON event.result_id = result.id
          WHERE event.user_id = $1
            AND event.reversed_at IS NULL
            AND result.status = 'confirmed'
            AND result.reversed_at IS NULL
          ORDER BY result.created_at DESC
          LIMIT 50`,
        [userId],
      ),
      getPool().query(`SELECT id, COALESCE(NULLIF(full_name, ''), 'Игрок') AS name FROM users`),
    ]);

    const row = account.rows[0] || emptyPlayPlayerStats();
    const names = new Map<number, string>(users.rows.map((item) => [Number(item.id), String(item.name)]));
    const insights = buildPlayGameInsights(userId, sources.rows, names);
    const rating = Number(row.rating ?? 1000);
    const matches = Number(row.matches ?? 0);
    const wins = Number(row.wins ?? 0);
    const losses = Number(row.losses ?? 0);

    return {
      rating,
      matches,
      wins,
      losses,
      pointsFor: Number(row.pointsFor ?? 0),
      pointsAgainst: Number(row.pointsAgainst ?? 0),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
      history: history.rows.map((item) => ({
        resultId: String(item.resultId),
        postId: String(item.postId),
        title: String(item.title || 'Обычная игра'),
        delta: Number(item.delta ?? 0),
        ratingAfter: Number(item.ratingAfter ?? 1000),
        wins: Number(item.wins ?? 0),
        losses: Number(item.losses ?? 0),
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      })),
      ...insights,
      achievements: buildPlayAchievements({ matches, wins, rating, winStreak: insights.winStreak }) as PlayPlayerStats['achievements'],
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
