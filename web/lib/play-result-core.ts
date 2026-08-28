import { rotatingSecondaryPairIdx } from '@/lib/kotc-next/pair-rotation';
import { parseQuickWinnerScore } from '@/lib/quick-winner-score';
import { buildThaiCourtBootstrapTours } from '@/lib/thai-live/core';

export const PLAY_RESULT_FORMATS = ['classic_2x2', 'king_sideout', 'thai_8'] as const;
export type PlayResultFormat = (typeof PLAY_RESULT_FORMATS)[number];
export type PlayPairingMode = 'fixed' | 'random';

export const PLAY_KING_MIN_PLAYERS = 6;
export const PLAY_KING_MAX_PLAYERS = 10;
export const PLAY_KING_MIN_TIMER = 8;
export const PLAY_KING_MAX_TIMER = 25;
export const PLAY_KING_POINT_LIMIT = 15;
export const PLAY_THAI_TOUR_COUNT = 4;

export interface PlayResultMatch {
  id: string;
  teamA: number[];
  teamB: number[];
  scoreA: number;
  scoreB: number;
  /** Optional override for a deciding set; otherwise StructuredPlayResult.pointLimit applies. */
  pointLimit?: number;
  tourNumber?: number;
}

export interface PlayKingRoundPair {
  pairIndex: number;
  team: number[];
  points: number;
}

export interface PlayKingRound {
  id: string;
  roundNumber: number;
  pairs: PlayKingRoundPair[];
}

export interface StructuredPlayResult {
  version: 2;
  format: PlayResultFormat;
  pairingMode: PlayPairingMode;
  pointLimit: number;
  matches: PlayResultMatch[];
  roundDurationMinutes?: number;
  rounds?: PlayKingRound[];
}

export interface PlayResultStanding {
  userId: number;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}

function int(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function seededShuffle(ids: number[], seed: number): number[] {
  const values = [...ids];
  let state = (seed || 1) >>> 0;
  for (let index = values.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const target = state % (index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function parseMatches(rawMatches: unknown, format: PlayResultFormat, pointLimit: number): PlayResultMatch[] | null {
  if (!Array.isArray(rawMatches)) return null;
  const matches: PlayResultMatch[] = [];
  for (const [index, item] of rawMatches.entries()) {
    if (!item || typeof item !== 'object') return null;
    const match = item as Record<string, unknown>;
    const teamA = Array.isArray(match.teamA) ? match.teamA.map(int) : [];
    const teamB = Array.isArray(match.teamB) ? match.teamB.map(int) : [];
    const scoreA = int(match.scoreA);
    const scoreB = int(match.scoreB);
    const matchPointLimit = match.pointLimit == null ? null : int(match.pointLimit);
    if (
      teamA.length !== 2 || teamB.length !== 2 ||
      teamA.some((id) => id == null || id <= 0) || teamB.some((id) => id == null || id <= 0) ||
      new Set([...teamA, ...teamB]).size !== 4 || scoreA == null || scoreB == null ||
      scoreA < 0 || scoreB < 0 || scoreA > 99 || scoreB > 99 || scoreA === scoreB ||
      (match.pointLimit != null && (
        format !== 'classic_2x2' || matchPointLimit == null || matchPointLimit < 10 || matchPointLimit > 21
      ))
    ) return null;
    if (format === 'thai_8' && !parseQuickWinnerScore(pointLimit, scoreA, scoreB)) return null;
    matches.push({
      id: String(match.id || `match-${index + 1}`).slice(0, 80),
      teamA: teamA as number[],
      teamB: teamB as number[],
      scoreA,
      scoreB,
      ...(matchPointLimit ? { pointLimit: matchPointLimit } : {}),
      ...(int(match.tourNumber) ? { tourNumber: int(match.tourNumber)! } : {}),
    });
  }
  return matches.length && matches.length <= 100 ? matches : null;
}

function parseKingRounds(rawRounds: unknown): PlayKingRound[] | null {
  if (!Array.isArray(rawRounds) || !rawRounds.length || rawRounds.length > 5) return null;
  const rounds: PlayKingRound[] = [];
  for (const [roundIndex, item] of rawRounds.entries()) {
    if (!item || typeof item !== 'object') return null;
    const rawRound = item as Record<string, unknown>;
    if (!Array.isArray(rawRound.pairs) || rawRound.pairs.length < 3 || rawRound.pairs.length > 5) return null;
    const pairs: PlayKingRoundPair[] = [];
    for (const [pairIndex, rawPair] of rawRound.pairs.entries()) {
      if (!rawPair || typeof rawPair !== 'object') return null;
      const source = rawPair as Record<string, unknown>;
      const team = Array.isArray(source.team) ? source.team.map(int) : [];
      const points = int(source.points);
      if (
        team.length !== 2 || team.some((id) => id == null || id <= 0) || new Set(team).size !== 2 ||
        points == null || points < 0 || points > PLAY_KING_POINT_LIMIT
      ) return null;
      pairs.push({ pairIndex: int(source.pairIndex) ?? pairIndex, team: team as number[], points });
    }
    rounds.push({
      id: String(rawRound.id || `king-round-${roundIndex + 1}`).slice(0, 80),
      roundNumber: int(rawRound.roundNumber) ?? roundIndex + 1,
      pairs,
    });
  }
  return rounds;
}

export function normalizeStructuredPlayResult(value: unknown): StructuredPlayResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!PLAY_RESULT_FORMATS.includes(raw.format as PlayResultFormat)) return null;
  const format = raw.format as PlayResultFormat;
  const pairingMode = raw.pairingMode === 'fixed' ? 'fixed' : raw.pairingMode === 'random' ? 'random' : null;
  const pointLimit = int(raw.pointLimit);
  if (!pairingMode || !pointLimit || pointLimit < 10 || pointLimit > 21) return null;

  if (format === 'king_sideout') {
    const roundDurationMinutes = int(raw.roundDurationMinutes);
    const rounds = parseKingRounds(raw.rounds);
    if (
      !roundDurationMinutes || roundDurationMinutes < PLAY_KING_MIN_TIMER ||
      roundDurationMinutes > PLAY_KING_MAX_TIMER || !rounds
    ) return null;
    return {
      version: 2,
      format,
      pairingMode,
      pointLimit: PLAY_KING_POINT_LIMIT,
      matches: [],
      roundDurationMinutes,
      rounds,
    };
  }

  const matches = parseMatches(raw.matches, format, pointLimit);
  if (!matches) return null;
  return { version: 2, format, pairingMode, pointLimit, matches };
}

export function getStructuredResultUserIds(result: StructuredPlayResult): number[] {
  if (result.format === 'king_sideout') {
    return [...new Set((result.rounds ?? []).flatMap((round) => round.pairs.flatMap((pair) => pair.team)))];
  }
  return [...new Set(result.matches.flatMap((match) => [...match.teamA, ...match.teamB]))];
}

export function validateStructuredPlayResult(value: unknown, participantIds: number[]): string | null {
  const result = normalizeStructuredPlayResult(value);
  if (!result) return 'Проверьте составы, раунды и счёт';
  const expected = new Set(participantIds);
  const used = new Set(getStructuredResultUserIds(result));
  if (used.size !== expected.size || [...used].some((id) => !expected.has(id))) {
    return 'В результате должен быть указан каждый участник игры';
  }
  if (result.format === 'classic_2x2' && expected.size < 4) return 'Для 2×2 нужно минимум 4 игрока';
  if (result.format === 'thai_8') {
    if (expected.size !== 8) return 'Для тайского формата нужно ровно 8 игроков';
    if (result.pointLimit < 10 || result.pointLimit > 21) return 'Тайский формат играется до 10–21 очка';
    if (result.matches.length !== PLAY_THAI_TOUR_COUNT * 2) return 'Для тайского формата нужно заполнить 4 тура по 2 матча';
    const appearances = new Map<number, number>();
    for (const match of result.matches) {
      for (const id of [...match.teamA, ...match.teamB]) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }
    if ([...expected].some((id) => appearances.get(id) !== PLAY_THAI_TOUR_COUNT)) {
      return 'Тайское расписание должно включать каждого игрока в каждом туре';
    }
  }
  if (result.format === 'king_sideout') {
    if (expected.size < PLAY_KING_MIN_PLAYERS || expected.size > PLAY_KING_MAX_PLAYERS || expected.size % 2 !== 0) {
      return `Для KING нужно чётное число игроков от ${PLAY_KING_MIN_PLAYERS} до ${PLAY_KING_MAX_PLAYERS}`;
    }
    const pairCount = expected.size / 2;
    if (result.rounds?.length !== pairCount) return `Для KING нужно ${pairCount} раундов — по числу пар на корте`;
    for (const round of result.rounds ?? []) {
      const roundIds = round.pairs.flatMap((pair) => pair.team);
      if (
        round.pairs.length !== pairCount || new Set(roundIds).size !== expected.size ||
        roundIds.some((id) => !expected.has(id))
      ) return 'В каждом раунде KING каждый игрок должен участвовать ровно один раз';
    }
  }
  return null;
}

export function buildPlayResultStandings(result: StructuredPlayResult): PlayResultStanding[] {
  const rows = new Map<number, PlayResultStanding>();
  const row = (userId: number) => {
    if (!rows.has(userId)) rows.set(userId, { userId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 });
    return rows.get(userId)!;
  };
  if (result.format === 'king_sideout') {
    for (const round of result.rounds ?? []) {
      const best = Math.max(...round.pairs.map((pair) => pair.points));
      for (const pair of round.pairs) {
        for (const userId of pair.team) {
          const item = row(userId);
          item.played += 1;
          item.wins += pair.points === best ? 1 : 0;
          item.losses += pair.points === best ? 0 : 1;
          item.pointsFor += pair.points;
        }
      }
    }
    return [...rows.values()].map((item) => ({ ...item, diff: item.pointsFor }))
      .sort((a, b) => b.pointsFor - a.pointsFor || b.wins - a.wins || a.userId - b.userId);
  }
  for (const match of result.matches) {
    const aWon = match.scoreA > match.scoreB;
    for (const userId of match.teamA) {
      const item = row(userId); item.played++; item.wins += aWon ? 1 : 0; item.losses += aWon ? 0 : 1;
      item.pointsFor += match.scoreA; item.pointsAgainst += match.scoreB;
    }
    for (const userId of match.teamB) {
      const item = row(userId); item.played++; item.wins += aWon ? 0 : 1; item.losses += aWon ? 1 : 0;
      item.pointsFor += match.scoreB; item.pointsAgainst += match.scoreA;
    }
  }
  return [...rows.values()].map((item) => ({ ...item, diff: item.pointsFor - item.pointsAgainst }))
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pointsFor - a.pointsFor || a.userId - b.userId);
}

/**
 * KOTC stores a place/point result for every pair in a round, not a fake pair-vs-pair match.
 * For the personal Elo calculation we compare the top half with the bottom half once per round,
 * so every player receives at most one W/L for that round.
 */
export function getCompetitiveMatches(result: StructuredPlayResult): PlayResultMatch[] {
  if (result.format !== 'king_sideout') return result.matches;
  const matches: PlayResultMatch[] = [];
  for (const round of result.rounds ?? []) {
    const ranked = [...round.pairs].sort((a, b) => b.points - a.points || a.pairIndex - b.pairIndex);
    for (let index = 0; index < Math.floor(ranked.length / 2); index++) {
      const top = ranked[index];
      const bottom = ranked[ranked.length - 1 - index];
      if (top.points === bottom.points) continue;
      matches.push({
        id: `${round.id}-rank-${index + 1}`,
        teamA: top.team,
        teamB: bottom.team,
        scoreA: top.points,
        scoreB: bottom.points,
      });
    }
  }
  return matches;
}

export function generateKingRounds(
  participantIds: number[],
  pairingMode: PlayPairingMode,
  seed = Date.now(),
): PlayKingRound[] {
  if (
    participantIds.length < PLAY_KING_MIN_PLAYERS || participantIds.length > PLAY_KING_MAX_PLAYERS ||
    participantIds.length % 2 !== 0
  ) return [];
  const ids = pairingMode === 'random' ? seededShuffle(participantIds, seed) : [...participantIds];
  const basePairs = Array.from({ length: ids.length / 2 }, (_, index) => [ids[index * 2], ids[index * 2 + 1]]);
  return Array.from({ length: basePairs.length }, (_, roundIndex) => ({
    id: `king-round-${roundIndex + 1}`,
    roundNumber: roundIndex + 1,
    pairs: basePairs.map((pair, pairIndex) => ({
      pairIndex,
      team: pairingMode === 'fixed'
        ? [...pair]
        : [pair[0], basePairs[rotatingSecondaryPairIdx(pairIndex, roundIndex + 1, basePairs.length)][1]],
      points: 0,
    })),
  }));
}

export function generatePlayMatches(
  participantIds: number[],
  format: PlayResultFormat,
  pairingMode: PlayPairingMode,
  seed = Date.now(),
): PlayResultMatch[] {
  const ids = pairingMode === 'random' ? seededShuffle(participantIds, seed) : [...participantIds];
  if (format === 'classic_2x2') {
    return ids.length >= 4 ? [{ id: 'match-1', teamA: ids.slice(0, 2), teamB: ids.slice(2, 4), scoreA: 0, scoreB: 0 }] : [];
  }
  if (format === 'king_sideout' || ids.length !== 8) return [];

  const players = ids.map((id) => ({ playerId: String(id), playerName: String(id), gender: 'M' as const }));
  const tours = buildThaiCourtBootstrapTours({ players, variant: 'MM', tourCount: PLAY_THAI_TOUR_COUNT, seed });
  return tours.flatMap((tour) => tour.matches.map((match) => ({
    id: `thai-tour-${tour.tourNo}-match-${match.matchNo}`,
    tourNumber: tour.tourNo,
    teamA: match.team1.players.map((player) => Number(player.playerId)),
    teamB: match.team2.players.map((player) => Number(player.playerId)),
    scoreA: 0,
    scoreB: 0,
  })));
}
