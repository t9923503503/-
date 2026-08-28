import { getCompetitiveMatches, normalizeStructuredPlayResult } from '@/lib/play-result-core';

export type PlayGameStatsScope = 'all' | 'rated' | 'friendly';
export type PlayGameRatingMode = Exclude<PlayGameStatsScope, 'all'>;

export interface GameInsightIdentity {
  resultKey: number;
  userId: number | null;
  name?: string;
}

export interface GameInsightSource {
  payload: unknown;
  createdAt: string;
  ratingMode?: PlayGameRatingMode;
  viewerResultKey?: number;
  identities?: GameInsightIdentity[];
}

export interface PlayGameInsightPerson {
  userId: number;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayGameInsightSummary {
  matches: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  bestPartner: PlayGameInsightPerson | null;
  toughestOpponent: PlayGameInsightPerson | null;
  recentForm: Array<'W' | 'L'>;
  winStreak: number;
}

type RivalRow = { userId: number; matches: number; wins: number; losses: number };

function sourceIdentity(source: GameInsightSource, userId: number) {
  const identities = Array.isArray(source.identities) ? source.identities : [];
  const byResultKey = new Map<number, number>();
  for (const identity of identities) {
    if (Number.isInteger(identity.resultKey) && Number.isInteger(identity.userId)) {
      byResultKey.set(identity.resultKey, identity.userId as number);
    }
  }

  const linkedViewerKey = identities.find((identity) => identity.userId === userId)?.resultKey;
  const viewerResultKey = Number.isInteger(source.viewerResultKey)
    ? source.viewerResultKey as number
    : Number.isInteger(linkedViewerKey)
      ? linkedViewerKey as number
      : userId;

  // Old payloads used user ids directly. New payloads use stable result keys,
  // which must be resolved through the roster snapshot before building insights.
  const linkedUserId = (resultKey: number): number | null => {
    if (!identities.length) return resultKey;
    return byResultKey.get(resultKey) ?? null;
  };

  return { viewerResultKey, linkedUserId };
}

export function buildPlayGameInsights(
  userId: number,
  sources: GameInsightSource[],
  names: Map<number, string>,
): PlayGameInsightSummary {
  const partners = new Map<number, RivalRow>();
  const opponents = new Map<number, RivalRow>();
  const form: Array<'W' | 'L'> = [];
  let matches = 0;
  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;

  const touch = (map: Map<number, RivalRow>, id: number, won: boolean) => {
    const row = map.get(id) || { userId: id, matches: 0, wins: 0, losses: 0 };
    row.matches += 1;
    row.wins += won ? 1 : 0;
    row.losses += won ? 0 : 1;
    map.set(id, row);
  };

  for (const source of sources) {
    const result = normalizeStructuredPlayResult(source.payload);
    if (!result) continue;
    const { viewerResultKey, linkedUserId } = sourceIdentity(source, userId);

    for (const match of getCompetitiveMatches(result)) {
      const onA = match.teamA.includes(viewerResultKey);
      const onB = match.teamB.includes(viewerResultKey);
      if (!onA && !onB) continue;

      const viewerScore = onA ? match.scoreA : match.scoreB;
      const rivalScore = onA ? match.scoreB : match.scoreA;
      const won = viewerScore > rivalScore;
      const team = onA ? match.teamA : match.teamB;
      const rivals = onA ? match.teamB : match.teamA;

      matches += 1;
      wins += won ? 1 : 0;
      losses += won ? 0 : 1;
      pointsFor += viewerScore;
      pointsAgainst += rivalScore;
      form.push(won ? 'W' : 'L');

      const partnerKey = team.find((resultKey) => resultKey !== viewerResultKey);
      const partnerId = partnerKey == null ? null : linkedUserId(partnerKey);
      if (partnerId != null && partnerId !== userId) touch(partners, partnerId, won);

      for (const rivalKey of rivals) {
        const rivalId = linkedUserId(rivalKey);
        if (rivalId != null && rivalId !== userId) touch(opponents, rivalId, won);
      }
    }
  }

  const decorate = (row: RivalRow): PlayGameInsightPerson => ({
    ...row,
    name: names.get(row.userId) || `Игрок #${row.userId}`,
    winRate: Math.round((row.wins / row.matches) * 100),
  });
  const bestPartner = [...partners.values()].sort(
    (a, b) => b.wins - a.wins || (b.wins / b.matches) - (a.wins / a.matches) || b.matches - a.matches,
  )[0];
  const toughestOpponent = [...opponents.values()].sort(
    (a, b) => b.losses - a.losses || (b.losses / b.matches) - (a.losses / a.matches) || b.matches - a.matches,
  )[0];
  let winStreak = 0;
  for (const outcome of form) {
    if (outcome !== 'W') break;
    winStreak += 1;
  }

  return {
    matches,
    wins,
    losses,
    pointsFor,
    pointsAgainst,
    bestPartner: bestPartner ? decorate(bestPartner) : null,
    toughestOpponent: toughestOpponent ? decorate(toughestOpponent) : null,
    recentForm: form.slice(0, 10),
    winStreak,
  };
}

export function buildPlayGameScopeInsights(
  userId: number,
  sources: GameInsightSource[],
  names: Map<number, string>,
): Record<PlayGameStatsScope, PlayGameInsightSummary> {
  const rated = sources.filter((source) => source.ratingMode !== 'friendly');
  const friendly = sources.filter((source) => source.ratingMode === 'friendly');
  return {
    all: buildPlayGameInsights(userId, sources, names),
    rated: buildPlayGameInsights(userId, rated, names),
    friendly: buildPlayGameInsights(userId, friendly, names),
  };
}

export function buildPlayAchievements(input: { matches: number; wins: number; rating: number; winStreak: number }) {
  const achievements = [];
  if (input.matches >= 1) achievements.push({ id: 'first_match', icon: '🏐', title: 'Первый матч', level: 'bronze' });
  if (input.wins >= 5) achievements.push({ id: 'five_wins', icon: '🥉', title: '5 побед', level: 'bronze' });
  if (input.matches >= 10) achievements.push({ id: 'regular', icon: '🥈', title: '10 матчей', level: 'silver' });
  if (input.winStreak >= 3) achievements.push({ id: 'hot_streak', icon: '🔥', title: `${input.winStreak} побед подряд`, level: 'gold' });
  if (input.rating >= 1100) achievements.push({ id: 'rating_1100', icon: '🥇', title: 'Рейтинг 1100+', level: 'gold' });
  return achievements;
}
