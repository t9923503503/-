import { buildPlayResultStandings, normalizeStructuredPlayResult } from '@/lib/play-result-core';
import { listPlayFeed, listPlayPosts, type PlayActionCard, type PlayPostView } from '@/lib/play-service';
import { resolvePlayerIdForAccount } from '@/lib/profile-link';
import {
  fetchLeaderboard,
  fetchPlayer,
  fetchPlayerExtendedStats,
  fetchTournamentResults,
  fetchTournaments,
} from '@/lib/queries';
import { getPool } from '@/lib/db';
import type { LeaderboardEntry, RatingType, Tournament } from '@/lib/types';

export interface HomeTournamentPodiumEntry {
  playerId: string;
  name: string;
  photoUrl: string;
  place: number;
  ratingPts: number;
}

export interface HomeTournamentActivity {
  kind: 'tournament';
  id: string;
  href: string;
  title: string;
  date: string;
  format: string;
  podium: HomeTournamentPodiumEntry[];
}

export interface HomeGameActivity {
  kind: 'game';
  id: string;
  href: string;
  title: string;
  date: string;
  format: string;
  summary: string;
  leaders: Array<{ playerId: string | null; name: string; value: string }>;
}

export type HomeActivityItem = HomeTournamentActivity | HomeGameActivity;

export interface HomeOverview {
  stats: {
    openGames: number;
    upcomingTournaments: number;
    savedResults: number;
  };
  upcomingGames: PlayPostView[];
  upcomingTournaments: Tournament[];
  activity: HomeActivityItem[];
  rankings: Record<RatingType, LeaderboardEntry[]>;
}

export interface HomePersonalSnapshot {
  nextGame: PlayPostView | null;
  actions: PlayActionCard[];
  player: {
    id: string;
    name: string;
    photoUrl: string;
    ratingType: RatingType;
    rating: number;
    rank: number | null;
    rankDelta: number | null;
  } | null;
}

type GameResultParticipant = {
  resultKey: number;
  playerId: string | null;
  name: string;
};

function asIso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function isSchemaUnavailable(error: unknown): boolean {
  return ['42P01', '42703'].includes(String((error as { code?: unknown })?.code ?? ''));
}

function activityTime(value: string): number {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+05:00` : value;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeHomeActivity(
  tournaments: HomeTournamentActivity[],
  games: HomeGameActivity[],
  limit = 6,
): HomeActivityItem[] {
  return [...tournaments, ...games]
    .sort((left, right) => activityTime(right.date) - activityTime(left.date))
    .slice(0, limit);
}

function teamLabel(ids: number[], names: Map<number, GameResultParticipant>): string {
  return ids.map((id) => names.get(id)?.name || 'Игрок').join(' + ');
}

export function summarizeHomeGameResult(
  payload: unknown,
  participants: GameResultParticipant[],
): Pick<HomeGameActivity, 'summary' | 'leaders'> {
  const result = normalizeStructuredPlayResult(payload);
  if (!result) return { summary: 'Результат подтверждён', leaders: [] };

  const names = new Map(participants.map((participant) => [participant.resultKey, participant]));
  if (result.format === 'classic_2x2') {
    const match = result.matches[0];
    return {
      summary: `${teamLabel(match.teamA, names)} · ${match.scoreA}:${match.scoreB} · ${teamLabel(match.teamB, names)}`,
      leaders: [],
    };
  }

  const leaders = buildPlayResultStandings(result).slice(0, 3).map((standing) => {
    const participant = names.get(standing.userId);
    const value = result.format === 'king_sideout'
      ? `${standing.pointsFor} очков`
      : `${standing.wins} побед · ${standing.diff > 0 ? '+' : ''}${standing.diff}`;
    return {
      playerId: participant?.playerId ?? null,
      name: participant?.name || 'Игрок',
      value,
    };
  });

  return {
    summary: result.format === 'king_sideout' ? 'Итоги KING' : 'Итоги тайского формата',
    leaders,
  };
}

async function fetchRecentPublicGameResults(limit = 6): Promise<HomeGameActivity[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const { rows } = await getPool().query(
      `SELECT result.id::text AS id,
              post.id::text AS post_id,
              post.title,
              post.format_label,
              post.ends_at,
              result.payload,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'resultKey', participant.result_key,
                    'playerId', player.id::text,
                    'name', COALESCE(NULLIF(player.name, ''), NULLIF(account.full_name, ''), 'Игрок')
                  ) ORDER BY participant.created_at
                ) FILTER (WHERE participant.id IS NOT NULL),
                '[]'::jsonb
              ) AS participants
         FROM play_game_results result
         JOIN play_posts post ON post.id = result.post_id
         JOIN play_organizers organizer ON organizer.id = post.organizer_id
         LEFT JOIN play_post_participants participant
           ON participant.post_id = post.id AND participant.status = 'confirmed'
         LEFT JOIN users account ON account.id = participant.user_id
         LEFT JOIN players player ON player.id = participant.player_id
        WHERE result.status = 'confirmed'
          AND result.reversed_at IS NULL
          AND post.kind = 'game'
          AND post.status = 'completed'
          AND post.visibility = 'public'
          AND organizer.status = 'active'
        GROUP BY result.id, post.id
        ORDER BY post.ends_at DESC, result.created_at DESC
        LIMIT $1`,
      [limit],
    );

    return rows.map((row) => {
      const participants = Array.isArray(row.participants)
        ? row.participants.map((participant: Record<string, unknown>) => ({
            resultKey: Number(participant.resultKey ?? 0),
            playerId: participant.playerId ? String(participant.playerId) : null,
            name: String(participant.name || 'Игрок'),
          }))
        : [];
      const summary = summarizeHomeGameResult(row.payload, participants);
      return {
        kind: 'game' as const,
        id: String(row.id),
        href: `/partner/${String(row.post_id)}`,
        title: String(row.title || 'Обычная игра'),
        date: asIso(row.ends_at),
        format: String(row.format_label || 'Игра'),
        ...summary,
      };
    });
  } catch (error) {
    if (isSchemaUnavailable(error)) return [];
    throw error;
  }
}

async function fetchSavedResultCount(visibleTournamentIds: string[]): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const { rows } = await getPool().query(
      `SELECT
         (SELECT COUNT(*)::int
            FROM tournament_results tournament_result
           WHERE tournament_result.tournament_id::text = ANY($1::text[]))
         +
         (SELECT COUNT(*)::int
            FROM play_game_results game_result
            JOIN play_posts post ON post.id = game_result.post_id
           WHERE game_result.status = 'confirmed'
             AND game_result.reversed_at IS NULL
             AND post.kind = 'game'
             AND post.status = 'completed'
             AND post.visibility = 'public') AS total`,
      [visibleTournamentIds],
    );
    return Number(rows[0]?.total ?? 0);
  } catch (error) {
    if (isSchemaUnavailable(error)) return 0;
    throw error;
  }
}

async function fetchRecentTournamentActivity(tournaments: Tournament[]): Promise<HomeTournamentActivity[]> {
  const recent = tournaments
    .filter((tournament) => tournament.status === 'finished')
    .sort((left, right) => activityTime(right.date) - activityTime(left.date))
    .slice(0, 4);

  const activities = await Promise.all(recent.map(async (tournament) => {
    const results = await fetchTournamentResults(tournament.id).catch(() => []);
    if (!results.length) return null;
    return {
      kind: 'tournament' as const,
      id: tournament.id,
      href: `/calendar/${tournament.id}`,
      title: tournament.name,
      date: tournament.date,
      format: tournament.format || tournament.formatCode || 'Турнир',
      podium: results.slice(0, 3).map((result) => ({
        playerId: String(result.playerId),
        name: String(result.playerName),
        photoUrl: String(result.playerPhotoUrl || ''),
        place: Number(result.place),
        ratingPts: Number(result.ratingPts),
      })),
    };
  }));

  return activities.filter((item): item is HomeTournamentActivity => Boolean(item));
}

export async function fetchHomeOverview(viewerUserId: number | null): Promise<HomeOverview> {
  const now = new Date().toISOString();
  const [tournaments, upcomingGames, rankingsM, rankingsW, rankingsMix, recentGames] = await Promise.all([
    fetchTournaments(1000),
    listPlayPosts({ kind: 'game', dateFrom: now, viewerUserId }),
    fetchLeaderboard('M', 5),
    fetchLeaderboard('W', 5),
    fetchLeaderboard('Mix', 5),
    fetchRecentPublicGameResults(6),
  ]);

  const upcomingTournaments = tournaments.filter(
    (tournament) => tournament.status === 'open' || tournament.status === 'full',
  );
  const [recentTournaments, savedResults] = await Promise.all([
    fetchRecentTournamentActivity(tournaments),
    fetchSavedResultCount(tournaments.map((tournament) => tournament.id)),
  ]);

  return {
    stats: {
      openGames: upcomingGames.length,
      upcomingTournaments: upcomingTournaments.length,
      savedResults,
    },
    upcomingGames: upcomingGames.slice(0, 3),
    upcomingTournaments: upcomingTournaments.slice(0, 3),
    activity: mergeHomeActivity(recentTournaments, recentGames, 6),
    rankings: {
      M: rankingsM,
      W: rankingsW,
      Mix: rankingsMix,
    },
  };
}

export async function fetchHomePersonalSnapshot(userId: number): Promise<HomePersonalSnapshot> {
  const [feed, playerId] = await Promise.all([
    listPlayFeed(userId),
    resolvePlayerIdForAccount(userId),
  ]);
  const now = Date.now();
  const nextGame = feed.myGames
    .filter((game) => game.status !== 'cancelled' && new Date(game.startsAt).getTime() >= now)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null;

  if (!playerId) {
    return { nextGame, actions: feed.actionCards.slice(0, 3), player: null };
  }

  const [player, stats] = await Promise.all([
    fetchPlayer(playerId),
    fetchPlayerExtendedStats(playerId),
  ]);
  if (!player) return { nextGame, actions: feed.actionCards.slice(0, 3), player: null };

  const ownType: RatingType = player.gender === 'W' ? 'W' : 'M';
  const ownTournaments = ownType === 'W' ? player.tournamentsW : player.tournamentsM;
  const ratingType: RatingType = ownTournaments > 0 || player.tournamentsMix === 0 ? ownType : 'Mix';
  const rating = ratingType === 'W' ? player.ratingW : ratingType === 'M' ? player.ratingM : player.ratingMix;
  const rank = ratingType === 'W' ? stats.rankW : ratingType === 'M' ? stats.rankM : stats.rankMix;
  const rankDelta = ratingType === 'W'
    ? stats.rankDeltaW
    : ratingType === 'M'
      ? stats.rankDeltaM
      : stats.rankDeltaMix;

  return {
    nextGame,
    actions: feed.actionCards.slice(0, 3),
    player: {
      id: player.id,
      name: player.name,
      photoUrl: player.photoUrl,
      ratingType,
      rating,
      rank,
      rankDelta,
    },
  };
}
