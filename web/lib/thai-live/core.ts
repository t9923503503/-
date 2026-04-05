import type { ThaiRulesPreset } from '@/lib/admin-legacy-sync';
import { thaiGenerateSchedule } from '../../../formats/thai/thai-format.js';
import type {
  ThaiBootstrapCourtPlayer,
  ThaiBootstrapTour,
  ThaiPlayerRole,
  ThaiStandingsGroup,
  ThaiStandingsPoolKey,
  ThaiStandingsRow,
  ThaiStatTotals,
  ThaiZoneKey,
} from './types';

interface ThaiScheduleRound {
  pairs: Array<[number, number]>;
}

interface ThaiStatDeltaInput<TPlayer = string> {
  team1: {
    players: TPlayer[];
    score: number;
  };
  team2: {
    players: TPlayer[];
    score: number;
  };
}

export interface ThaiPlayerTourDelta<TPlayer = string> {
  player: TPlayer;
  delta: number;
  scored: number;
  pointsP: number;
  won: boolean;
}

export interface ThaiRoundRosterCourt {
  courtNo: number;
  players: ThaiBootstrapCourtPlayer[];
}

export interface ThaiStandingsSeedRow extends ThaiStandingsRow {
  courtId: string;
  courtNo: number;
  courtLabel: string;
}

export const THAI_POINT_LIMIT_MIN = 9;
export const THAI_POINT_LIMIT_MAX = 21;
export const THAI_POINT_LIMIT_DEFAULT = 15;

const THAI_ZONE_LABELS: Record<ThaiZoneKey, string> = {
  hard: 'HARD',
  advance: 'ADVANCE',
  medium: 'MEDIUM',
  light: 'LIGHT',
};

function asFiniteInt(value: unknown, fallback = 0): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCourtLabel(courtNo: number): string {
  if (courtNo >= 1) return `K${courtNo}`;
  return String(courtNo);
}

function poolLabel(variant: string, pool: ThaiStandingsPoolKey): string {
  const normalizedVariant = String(variant || '').toUpperCase();
  if (pool === 'all') return 'Общий';
  if (normalizedVariant === 'MF') return pool === 'primary' ? 'Мужчины' : 'Женщины';
  if (normalizedVariant === 'MN') return pool === 'primary' ? 'Профи' : 'Новички';
  return pool === 'primary' ? 'Пул A' : 'Пул B';
}

export function normalizeThaiPointLimit(value: unknown): number {
  return clamp(asFiniteInt(value, THAI_POINT_LIMIT_DEFAULT), THAI_POINT_LIMIT_MIN, THAI_POINT_LIMIT_MAX);
}

/** R1/R2 могут иметь разный лимит (`thaiPointLimitR1` / `thaiPointLimitR2`); иначе общий `thaiPointLimit`. */
export function resolveThaiPointLimitForRound(
  settings: Record<string, unknown>,
  roundType: 'r1' | 'r2',
): number {
  const legacy = settings.thaiPointLimit ?? settings.pointLimit;
  const r1Raw = settings.thaiPointLimitR1 ?? legacy;
  const r2Raw = settings.thaiPointLimitR2 ?? legacy;
  const raw = roundType === 'r2' ? r2Raw : r1Raw;
  return normalizeThaiPointLimit(raw);
}

export function calcThaiPointsP(diff: number): number {
  const value = Math.trunc(Number(diff) || 0);
  if (value <= 0) return 0;
  if (value === 1) return 10;
  if (value === 2) return 11;
  if (value <= 4) return 12;
  return 13;
}

export function calcThaiKef(totalDiff: number): number {
  const delta = Number(totalDiff) || 0;
  const denominator = 60 - delta;
  if (denominator <= 0) return 999.99;
  return (60 + delta) / denominator;
}

export function applyThaiStatTotals(
  current: Omit<ThaiStatTotals, 'kef'>,
  update: { delta: number; scored: number; pointsP: number; won: boolean },
): ThaiStatTotals {
  const totalDiff = Number(current.totalDiff || 0) + Number(update.delta || 0);
  const totalScored = Number(current.totalScored || 0) + Number(update.scored || 0);
  const pointsP = Number(current.pointsP || 0) + Number(update.pointsP || 0);
  const wins = Number(current.wins || 0) + (update.won ? 1 : 0);
  return {
    totalDiff,
    totalScored,
    pointsP,
    wins,
    kef: calcThaiKef(totalDiff),
  };
}

export function calcThaiTourDelta(matches: Array<{ team1Score: number; team2Score: number }>): number {
  return matches.reduce((sum, match) => sum + (Number(match.team1Score || 0) - Number(match.team2Score || 0)), 0);
}

export function buildThaiTourStatDeltas<TPlayer = string>(matches: ThaiStatDeltaInput<TPlayer>[]): {
  tourDelta: number;
  playerUpdates: ThaiPlayerTourDelta<TPlayer>[];
} {
  const playerUpdates: ThaiPlayerTourDelta<TPlayer>[] = [];
  let tourDelta = 0;

  for (const match of matches) {
    const team1Score = Math.max(0, Math.trunc(Number(match.team1.score) || 0));
    const team2Score = Math.max(0, Math.trunc(Number(match.team2.score) || 0));
    const diff = team1Score - team2Score;
    tourDelta += diff;

    for (const player of match.team1.players) {
      playerUpdates.push({
        player,
        delta: diff,
        scored: team1Score,
        pointsP: calcThaiPointsP(diff),
        won: diff > 0,
      });
    }

    for (const player of match.team2.players) {
      playerUpdates.push({
        player,
        delta: -diff,
        scored: team2Score,
        pointsP: calcThaiPointsP(-diff),
        won: diff < 0,
      });
    }
  }

  return { tourDelta, playerUpdates };
}

export function validateThaiMatchScore(team1Score: unknown, team2Score: unknown, pointLimit: number): string | null {
  const left = asFiniteInt(team1Score, -1);
  const right = asFiniteInt(team2Score, -1);
  if (left < 0 || right < 0) return 'Счёт должен быть целым и неотрицательным';
  if (left === right) return 'Матч не может завершиться ничьей';
  if (Math.max(left, right) !== normalizeThaiPointLimit(pointLimit)) {
    return `Победитель должен набрать ровно ${normalizeThaiPointLimit(pointLimit)} очков`;
  }
  return null;
}

function buildSinglePoolTours(
  players: ThaiBootstrapCourtPlayer[],
  variant: string,
  tourCount: number,
  seed: number,
): ThaiBootstrapTour[] {
  const schedule = thaiGenerateSchedule({
    mode: variant,
    men: variant === 'MM' ? players.length : 0,
    women: variant === 'WW' ? players.length : 0,
    courts: 4,
    tours: tourCount,
    seed,
  }) as unknown as ThaiScheduleRound[];

  return schedule.map((round, index) => {
    const teams = round.pairs.map(([firstIdx, secondIdx]) => ({
      players: [
        {
          playerId: players[firstIdx].playerId,
          playerName: players[firstIdx].playerName,
          role: 'primary' as ThaiPlayerRole,
        },
        {
          playerId: players[secondIdx].playerId,
          playerName: players[secondIdx].playerName,
          role: 'secondary' as ThaiPlayerRole,
        },
      ],
    }));
    const rotations = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
    ];
    const matchPairings = rotations[index % 5];

    return {
      tourNo: index + 1,
      matches: [
        { matchNo: 1, team1: teams[matchPairings[0][0]], team2: teams[matchPairings[0][1]] },
        { matchNo: 2, team1: teams[matchPairings[1][0]], team2: teams[matchPairings[1][1]] },
      ],
    };
  });
}

function splitDualPoolPlayers(
  players: ThaiBootstrapCourtPlayer[],
  variant: string,
): { primary: ThaiBootstrapCourtPlayer[]; secondary: ThaiBootstrapCourtPlayer[] } {
  if (variant === 'MF') {
    const men = players.filter((player) => player.gender === 'M');
    const women = players.filter((player) => player.gender === 'W');
    if (men.length !== 4 || women.length !== 4) {
      throw new Error('Thai MF bootstrap requires 4 men and 4 women per court.');
    }
    return { primary: men, secondary: women };
  }

  return {
    primary: players.slice(0, 4),
    secondary: players.slice(4, 8),
  };
}

function buildDualPoolTours(
  players: ThaiBootstrapCourtPlayer[],
  variant: string,
  tourCount: number,
  seed: number,
): ThaiBootstrapTour[] {
  const pools = splitDualPoolPlayers(players, variant);
  const schedule = thaiGenerateSchedule({
    mode: variant,
    men: pools.primary.length,
    women: pools.secondary.length,
    courts: 4,
    tours: tourCount,
    seed,
  }) as unknown as ThaiScheduleRound[];

  return schedule.map((round, index) => {
    const teams = round.pairs.map(([primaryIdx, secondaryIdx]) => ({
      players: [
        {
          playerId: pools.primary[primaryIdx].playerId,
          playerName: pools.primary[primaryIdx].playerName,
          role: 'primary' as ThaiPlayerRole,
        },
        {
          playerId: pools.secondary[secondaryIdx].playerId,
          playerName: pools.secondary[secondaryIdx].playerName,
          role: 'secondary' as ThaiPlayerRole,
        },
      ],
    }));
    const rotations = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
    ];
    const matchPairings = rotations[index % 5];

    return {
      tourNo: index + 1,
      matches: [
        { matchNo: 1, team1: teams[matchPairings[0][0]], team2: teams[matchPairings[0][1]] },
        { matchNo: 2, team1: teams[matchPairings[1][0]], team2: teams[matchPairings[1][1]] },
      ],
    };
  });
}

export function buildThaiCourtBootstrapTours(input: {
  players: ThaiBootstrapCourtPlayer[];
  variant: string;
  tourCount: number;
  seed: number;
}): ThaiBootstrapTour[] {
  const players = input.players.slice();
  if (players.length !== 8) {
    throw new Error('Thai bootstrap requires exactly 8 players per court.');
  }

  const variant = String(input.variant || '').toUpperCase();
  if (variant === 'MF' || variant === 'MN') {
    return buildDualPoolTours(players, variant, input.tourCount, input.seed);
  }
  if (variant === 'MM' || variant === 'WW') {
    return buildSinglePoolTours(players, variant, input.tourCount, input.seed);
  }
  throw new Error(`Unsupported Thai variant: ${input.variant}`);
}

export function splitThaiRosterIntoCourts(input: {
  players: ThaiBootstrapCourtPlayer[];
  variant: string;
  courts: number;
}): ThaiRoundRosterCourt[] {
  const players = input.players.slice();
  const courts = Math.max(1, Math.trunc(Number(input.courts) || 0));
  const variant = String(input.variant || '').toUpperCase();

  if (players.length !== courts * 8) {
    throw new Error(`Thai bootstrap requires exactly ${courts * 8} players.`);
  }

  if (variant === 'MF') {
    const men = players.filter((player) => player.gender === 'M');
    const women = players.filter((player) => player.gender === 'W');
    if (men.length !== courts * 4 || women.length !== courts * 4) {
      throw new Error(`Thai MF requires exactly ${courts * 4} men and ${courts * 4} women.`);
    }
    return Array.from({ length: courts }, (_, index) => ({
      courtNo: index + 1,
      players: [...men.slice(index * 4, index * 4 + 4), ...women.slice(index * 4, index * 4 + 4)],
    }));
  }

  if (variant === 'MN') {
    const primary = players.slice(0, courts * 4);
    const secondary = players.slice(courts * 4);
    return Array.from({ length: courts }, (_, index) => ({
      courtNo: index + 1,
      players: [
        ...primary.slice(index * 4, index * 4 + 4),
        ...secondary.slice(index * 4, index * 4 + 4),
      ],
    }));
  }

  return Array.from({ length: courts }, (_, index) => ({
    courtNo: index + 1,
    players: players.slice(index * 8, index * 8 + 8),
  }));
}

export function buildThaiCourtLabel(courtNo: number): string {
  return normalizeCourtLabel(courtNo);
}

export function sortThaiStandingsRows(rows: ThaiStandingsRow[], preset: ThaiRulesPreset = 'legacy'): ThaiStandingsRow[] {
  return [...rows].sort((left, right) => {
    if (preset === 'balanced_v2' && right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    if (right.pointsP !== left.pointsP) return right.pointsP - left.pointsP;
    if (Math.abs(right.kef - left.kef) > 1e-9) return right.kef - left.kef;
    if (right.totalScored !== left.totalScored) return right.totalScored - left.totalScored;
    return left.playerName.localeCompare(right.playerName, 'ru');
  });
}

export function finalizeThaiStandingsRows(rows: ThaiStandingsRow[], preset: ThaiRulesPreset = 'legacy'): ThaiStandingsRow[] {
  return sortThaiStandingsRows(rows, preset).map((row, index) => ({
    ...row,
    place: index + 1,
  }));
}

export function buildThaiStandingsGroups(input: {
  variant: string;
  rows: ThaiStandingsRow[];
  thaiRulesPreset?: ThaiRulesPreset;
}): ThaiStandingsGroup[] {
  const variant = String(input.variant || '').toUpperCase();
  const preset = input.thaiRulesPreset ?? 'legacy';
  if (variant === 'MF' || variant === 'MN') {
    return (['primary', 'secondary'] as const).map((pool) => ({
      pool,
      label: poolLabel(variant, pool),
      rows: finalizeThaiStandingsRows(input.rows.filter((row) => row.role === pool), preset),
    }));
  }

  return [
    {
      pool: 'all',
      label: poolLabel(variant, 'all'),
      rows: finalizeThaiStandingsRows(input.rows.map((row) => ({ ...row, pool: 'all' })), preset),
    },
  ];
}

export function thaiZoneLabel(zone: ThaiZoneKey): string {
  return THAI_ZONE_LABELS[zone];
}

function getThaiZoneSequence(courtCount: number): ThaiZoneKey[] {
  return (['hard', 'advance', 'medium', 'light'] as const).slice(0, Math.max(1, Math.min(4, courtCount)));
}

function resolveSeededPlayersFromRows(
  rows: ThaiStandingsRow[],
  start: number,
  size: number,
  playerById: Map<string, ThaiBootstrapCourtPlayer>,
  errorMessage: string,
): ThaiBootstrapCourtPlayer[] {
  const bucket = rows.slice(start, start + size);
  if (bucket.length !== size) {
    throw new Error(errorMessage);
  }
  return bucket.map((row) => {
    const player = playerById.get(row.playerId);
    if (!player) {
      throw new Error(`R2 seeding player not found in roster: ${row.playerId}`);
    }
    return player;
  });
}

export function seedThaiRound2Courts(input: {
  variant: string;
  r1Courts: Array<{
    courtId: string;
    courtNo: number;
    courtLabel: string;
    groups: ThaiStandingsGroup[];
  }>;
  playerById: Map<string, ThaiBootstrapCourtPlayer>;
  thaiRulesPreset?: ThaiRulesPreset;
}): Array<{
  zone: ThaiZoneKey;
  courtNo: number;
  players: ThaiBootstrapCourtPlayer[];
}> {
  const variant = String(input.variant || '').toUpperCase();
  const preset = input.thaiRulesPreset ?? 'legacy';
  const courtCount = input.r1Courts.length;
  const zones = getThaiZoneSequence(courtCount);
  const sortedCourts = [...input.r1Courts].sort((left, right) => left.courtNo - right.courtNo);

  if (variant === 'MF' || variant === 'MN') {
    const primaryRows = sortThaiStandingsRows(
      sortedCourts.flatMap((court) => court.groups.find((group) => group.pool === 'primary')?.rows ?? []),
      preset,
    );
    const secondaryRows = sortThaiStandingsRows(
      sortedCourts.flatMap((court) => court.groups.find((group) => group.pool === 'secondary')?.rows ?? []),
      preset,
    );
    const poolBucketSize = 4;

    return zones.map((zone, zoneIndex) => {
      const start = zoneIndex * poolBucketSize;
      const primaryPlayers = resolveSeededPlayersFromRows(
        primaryRows,
        start,
        poolBucketSize,
        input.playerById,
        `R2 seeding requires full global rankings for ${variant} primary pool.`,
      );
      const secondaryPlayers = resolveSeededPlayersFromRows(
        secondaryRows,
        start,
        poolBucketSize,
        input.playerById,
        `R2 seeding requires full global rankings for ${variant} secondary pool.`,
      );
      return {
        zone,
        courtNo: zoneIndex + 1,
        players: [...primaryPlayers, ...secondaryPlayers],
      };
    });
  }

  const allRows = sortThaiStandingsRows(sortedCourts.flatMap((court) => court.groups[0]?.rows ?? []), preset);
  const bucketSize = 8;

  return zones.map((zone, zoneIndex) => {
    const players = resolveSeededPlayersFromRows(
      allRows,
      zoneIndex * bucketSize,
      bucketSize,
      input.playerById,
      'R2 seeding requires full global rankings for the single pool.',
    );
    return {
      zone,
      courtNo: zoneIndex + 1,
      players,
    };
  });
}

export function buildThaiProgressRows(input: {
  r1: ThaiStandingsGroup[];
  r2: ThaiStandingsGroup[];
}): Array<{
  playerId: string;
  playerName: string;
  role: ThaiPlayerRole;
  poolLabel: string;
  r1Place: number | null;
  r2Place: number | null;
}> {
  const r1Rows = input.r1.flatMap((group) => group.rows);
  const r2Rows = input.r2.flatMap((group) => group.rows);
  const r1ById = new Map(r1Rows.map((row) => [row.playerId, row]));
  const r2ById = new Map(r2Rows.map((row) => [row.playerId, row]));

  return [...new Set([...r1ById.keys(), ...r2ById.keys()])].map((playerId) => {
    const r1 = r1ById.get(playerId);
    const r2 = r2ById.get(playerId);
    const source = r2 ?? r1!;
    return {
      playerId,
      playerName: source.playerName,
      role: source.role,
      poolLabel: source.poolLabel,
      r1Place: r1?.place ?? null,
      r2Place: r2?.place ?? null,
    };
  });
}
