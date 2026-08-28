import {
  aggregateStandingLedger,
  compareExactRatios,
  exactRatio,
  toExactInteger,
  toExactRatioDto,
} from './ranking';
import type {
  ExactRatio,
  ExactRatioDto,
  ExactStats,
  PoolStandingInput,
  StandingContribution,
} from './types';
import { SportsDomainError } from './types';

export type PoolMatchPointsMode = 'total' | 'per_match';

export interface PoolStandingEntryInput {
  entryId: string;
  initialSeed: number;
  ledger: readonly StandingContribution[];
}

export interface RankPoolStandingsInput {
  poolId: string;
  poolSize: 3 | 4;
  entries: readonly PoolStandingEntryInput[];
}

export interface RankPoolStandingsOptions {
  /** LPVolley defaults to total match points inside one complete pool. */
  matchPointsMode?: PoolMatchPointsMode;
}

export interface RankLivePoolStandingsOptions {
  /** Live tables use the same configured points criterion as the final table. */
  matchPointsMode?: PoolMatchPointsMode;
}

export interface StandingContributionDto {
  matchId: string;
  teamId: string;
  opponentId: string;
  matchPoints: string;
  setsFor: string;
  setsAgainst: string;
  pointsFor: string;
  pointsAgainst: string;
  counted: boolean;
}

export interface ExactStatsDto {
  matchesPlayed: string;
  matchPoints: string;
  setsFor: string;
  setsAgainst: string;
  pointsFor: string;
  pointsAgainst: string;
}

/** JSON-safe representation of a PoolStandingInput plus display-ready totals. */
export interface PoolStandingInputDto {
  entryId: string;
  poolId: string;
  poolSize: 3 | 4;
  poolRank: number;
  initialSeed: number;
  ledger: readonly StandingContributionDto[];
  totals: ExactStatsDto;
  ratios: {
    matchPointsPerMatch: ExactRatioDto;
    setRatio: ExactRatioDto;
    rallyPointRatio: ExactRatioDto;
  };
}

interface EvaluatedStanding {
  entry: PoolStandingEntryInput;
  stats: ExactStats;
}

/**
 * Builds the internal table for one complete round-robin pool.
 *
 * Ranking is lexicographic. A ratio with no_data disables that criterion for
 * the complete currently tied block, avoiding pair-dependent comparisons.
 * The returned rows have unique sequential poolRank values and are accepted
 * directly by createCrossPoolComparisonRows().
 */
export function rankPoolStandings(
  input: RankPoolStandingsInput,
  options: RankPoolStandingsOptions = {},
): PoolStandingInput[] {
  const matchPointsMode = options.matchPointsMode ?? 'total';
  validateRankPoolStandingsInput(input, matchPointsMode, 'complete');

  return rankValidatedPoolStandings(input, matchPointsMode);
}

/**
 * Builds a provisional table from completed matches available so far.
 *
 * Unlike rankPoolStandings(), a team may have fewer than poolSize - 1 ledger
 * rows. A match is nevertheless accepted only as a reciprocal pair of current
 * standing contributions; a one-sided or otherwise ambiguous result fails
 * closed. Exact-ratio/no_data handling and the final seed fallback are shared
 * with the locked table implementation.
 */
export function rankLivePoolStandings(
  input: RankPoolStandingsInput,
  options: RankLivePoolStandingsOptions = {},
): PoolStandingInput[] {
  const matchPointsMode = options.matchPointsMode ?? 'total';
  validateRankPoolStandingsInput(input, matchPointsMode, 'partial');

  return rankValidatedPoolStandings(input, matchPointsMode);
}

function rankValidatedPoolStandings(
  input: RankPoolStandingsInput,
  matchPointsMode: PoolMatchPointsMode,
): PoolStandingInput[] {

  const evaluated: EvaluatedStanding[] = input.entries.map((entry) => ({
    entry: {
      ...entry,
      ledger: [...entry.ledger]
        .map((contribution) => ({ ...contribution }))
        .sort((left, right) => stableCompare(left.matchId, right.matchId)),
    },
    stats: aggregateStandingLedger(entry.ledger),
  }));

  return rankStandingBlock(evaluated, 0, matchPointsMode).map(({ entry }, index) => ({
    entryId: entry.entryId,
    poolId: input.poolId,
    poolSize: input.poolSize,
    poolRank: index + 1,
    initialSeed: entry.initialSeed,
    ledger: entry.ledger,
  }));
}

export function toPoolStandingInputDto(row: PoolStandingInput): PoolStandingInputDto {
  const totals = aggregateStandingLedger(row.ledger);
  return {
    entryId: row.entryId,
    poolId: row.poolId,
    poolSize: row.poolSize,
    poolRank: row.poolRank,
    initialSeed: row.initialSeed,
    ledger: [...row.ledger]
      .sort((left, right) => stableCompare(left.matchId, right.matchId))
      .map(toStandingContributionDto),
    totals: toExactStatsDto(totals),
    ratios: {
      matchPointsPerMatch: toExactRatioDto(exactRatio(totals.matchPoints, totals.matchesPlayed)),
      setRatio: toExactRatioDto(exactRatio(totals.setsFor, totals.setsAgainst)),
      rallyPointRatio: toExactRatioDto(exactRatio(totals.pointsFor, totals.pointsAgainst)),
    },
  };
}

export function toPoolStandingInputsDto(rows: readonly PoolStandingInput[]): PoolStandingInputDto[] {
  return rows.map(toPoolStandingInputDto);
}

function toStandingContributionDto(contribution: StandingContribution): StandingContributionDto {
  return {
    matchId: contribution.matchId,
    teamId: contribution.teamId,
    opponentId: contribution.opponentId,
    matchPoints: toExactInteger(contribution.matchPoints, 'matchPoints').toString(10),
    setsFor: toExactInteger(contribution.setsFor, 'setsFor').toString(10),
    setsAgainst: toExactInteger(contribution.setsAgainst, 'setsAgainst').toString(10),
    pointsFor: toExactInteger(contribution.pointsFor, 'pointsFor').toString(10),
    pointsAgainst: toExactInteger(contribution.pointsAgainst, 'pointsAgainst').toString(10),
    counted: contribution.counted !== false,
  };
}

function toExactStatsDto(stats: ExactStats): ExactStatsDto {
  return {
    matchesPlayed: stats.matchesPlayed.toString(10),
    matchPoints: stats.matchPoints.toString(10),
    setsFor: stats.setsFor.toString(10),
    setsAgainst: stats.setsAgainst.toString(10),
    pointsFor: stats.pointsFor.toString(10),
    pointsAgainst: stats.pointsAgainst.toString(10),
  };
}

function rankStandingBlock(
  block: readonly EvaluatedStanding[],
  criterion: number,
  matchPointsMode: PoolMatchPointsMode,
): EvaluatedStanding[] {
  if (block.length <= 1) return [...block];
  if (criterion >= 4) {
    return [...block].sort((left, right) => stableCompare(left.entry.entryId, right.entry.entryId));
  }

  if (criterion === 3) {
    return [...block].sort((left, right) =>
      left.entry.initialSeed - right.entry.initialSeed
      || stableCompare(left.entry.entryId, right.entry.entryId));
  }

  const selector = criterionSelector(criterion, matchPointsMode);
  const values = block.map(selector);
  if (values.some((value) => value.kind === 'no_data')) {
    return rankStandingBlock(block, criterion + 1, matchPointsMode);
  }

  const sorted = [...block].sort((left, right) => {
    const comparison = compareExactRatios(selector(left), selector(right));
    if (comparison === null || comparison === 0) {
      return stableCompare(left.entry.entryId, right.entry.entryId);
    }
    return -comparison;
  });

  const tiedGroups: EvaluatedStanding[][] = [];
  for (const row of sorted) {
    const current = tiedGroups[tiedGroups.length - 1];
    if (!current) {
      tiedGroups.push([row]);
      continue;
    }
    const comparison = compareExactRatios(selector(current[0]), selector(row));
    if (comparison === 0) current.push(row);
    else tiedGroups.push([row]);
  }

  return tiedGroups.flatMap((group) => rankStandingBlock(group, criterion + 1, matchPointsMode));
}

function criterionSelector(
  criterion: number,
  matchPointsMode: PoolMatchPointsMode,
): (row: EvaluatedStanding) => ExactRatio {
  if (criterion === 0) {
    return matchPointsMode === 'per_match'
      ? (row) => exactRatio(row.stats.matchPoints, row.stats.matchesPlayed)
      : (row) => exactRatio(row.stats.matchPoints, BigInt(1));
  }
  if (criterion === 1) return (row) => exactRatio(row.stats.setsFor, row.stats.setsAgainst);
  return (row) => exactRatio(row.stats.pointsFor, row.stats.pointsAgainst);
}

function validateRankPoolStandingsInput(
  input: RankPoolStandingsInput,
  matchPointsMode: PoolMatchPointsMode,
  ledgerMode: 'complete' | 'partial',
): void {
  if (!input.poolId || input.poolId.trim() !== input.poolId) {
    throw new SportsDomainError('INVALID_POOL_ID', 'poolId must be a non-empty trimmed string.', {
      poolId: input.poolId,
    });
  }
  if (input.poolSize !== 3 && input.poolSize !== 4) {
    throw new SportsDomainError('INVALID_POOL_SIZE', 'Pool standings support groups of three or four.', {
      poolSize: input.poolSize,
    });
  }
  if (matchPointsMode !== 'total' && matchPointsMode !== 'per_match') {
    throw new SportsDomainError('INVALID_MATCH_POINTS_MODE', 'matchPointsMode must be total or per_match.', {
      matchPointsMode,
    });
  }
  if (input.entries.length !== input.poolSize) {
    throw new SportsDomainError('INCOMPLETE_POOL_STANDING', 'The pool snapshot must contain every declared team.', {
      poolId: input.poolId,
      expected: input.poolSize,
      actual: input.entries.length,
    });
  }

  const entryIds = new Set<string>();
  const initialSeeds = new Set<number>();
  for (const entry of input.entries) {
    if (!entry.entryId || entry.entryId.trim() !== entry.entryId) {
      throw new SportsDomainError('INVALID_ENTRY_ID', 'entryId must be a non-empty trimmed string.', {
        entryId: entry.entryId,
      });
    }
    if (entryIds.has(entry.entryId)) {
      throw new SportsDomainError('DUPLICATE_POOL_STANDING', 'Each team may appear once in a pool snapshot.', {
        poolId: input.poolId,
        entryId: entry.entryId,
      });
    }
    if (!Number.isSafeInteger(entry.initialSeed) || entry.initialSeed < 1) {
      throw new SportsDomainError('INVALID_INITIAL_SEED', 'initialSeed must be a positive safe integer.', {
        entryId: entry.entryId,
        initialSeed: entry.initialSeed,
      });
    }
    if (initialSeeds.has(entry.initialSeed)) {
      throw new SportsDomainError('DUPLICATE_INITIAL_SEED', 'Initial seeds must be unique inside one pool.', {
        poolId: input.poolId,
        initialSeed: entry.initialSeed,
      });
    }
    entryIds.add(entry.entryId);
    initialSeeds.add(entry.initialSeed);
  }

  const matches = new Map<string, Array<{ teamId: string; opponentId: string }>>();
  for (const entry of input.entries) {
    if (ledgerMode === 'complete' && entry.ledger.length !== input.poolSize - 1) {
      throw new SportsDomainError('INCOMPLETE_POOL_LEDGER', 'A round-robin ledger must contain one match per opponent.', {
        poolId: input.poolId,
        entryId: entry.entryId,
        expected: input.poolSize - 1,
        actual: entry.ledger.length,
      });
    }
    if (ledgerMode === 'partial' && entry.ledger.length > input.poolSize - 1) {
      throw new SportsDomainError('INVALID_PARTIAL_POOL_LEDGER', 'A live ledger cannot contain more than one match per opponent.', {
        poolId: input.poolId,
        entryId: entry.entryId,
        maximum: input.poolSize - 1,
        actual: entry.ledger.length,
      });
    }
    const opponents = new Set<string>();
    const matchIds = new Set<string>();
    for (const contribution of entry.ledger) {
      if (!contribution.matchId || contribution.matchId.trim() !== contribution.matchId) {
        throw new SportsDomainError('INVALID_LEDGER_MATCH_ID', 'Ledger matchId must be a non-empty trimmed string.', {
          entryId: entry.entryId,
          matchId: contribution.matchId,
        });
      }
      if (matchIds.has(contribution.matchId)) {
        throw new SportsDomainError('DUPLICATE_LEDGER_MATCH', 'A team ledger may contain each match exactly once.', {
          entryId: entry.entryId,
          matchId: contribution.matchId,
        });
      }
      if (contribution.teamId !== entry.entryId) {
        throw new SportsDomainError('LEDGER_TEAM_MISMATCH', 'Ledger teamId must match its pool entry.', {
          expected: entry.entryId,
          actual: contribution.teamId,
        });
      }
      if (!entryIds.has(contribution.opponentId) || contribution.opponentId === entry.entryId) {
        throw new SportsDomainError('LEDGER_OPPONENT_NOT_IN_POOL', 'Ledger opponent must be another team in this pool.', {
          poolId: input.poolId,
          entryId: entry.entryId,
          opponentId: contribution.opponentId,
        });
      }
      if (opponents.has(contribution.opponentId)) {
        throw new SportsDomainError('DUPLICATE_LEDGER_OPPONENT', 'A round-robin ledger must contain one match per opponent.', {
          entryId: entry.entryId,
          opponentId: contribution.opponentId,
        });
      }
      if (contribution.counted !== undefined && typeof contribution.counted !== 'boolean') {
        throw new SportsDomainError('INVALID_LEDGER_COUNTED', 'counted must be boolean when provided.', {
          entryId: entry.entryId,
          matchId: contribution.matchId,
        });
      }
      validateContributionIntegers(contribution);
      opponents.add(contribution.opponentId);
      matchIds.add(contribution.matchId);
      const participants = matches.get(contribution.matchId) ?? [];
      participants.push({ teamId: contribution.teamId, opponentId: contribution.opponentId });
      matches.set(contribution.matchId, participants);
    }
  }

  for (const [matchId, participants] of matches) {
    if (
      participants.length !== 2
      || participants[0].teamId !== participants[1].opponentId
      || participants[0].opponentId !== participants[1].teamId
    ) {
      throw new SportsDomainError('INCONSISTENT_POOL_MATCH_LEDGER', 'Each pool match needs reciprocal team contributions.', {
        poolId: input.poolId,
        matchId,
        participants,
      });
    }
  }
}

function validateContributionIntegers(contribution: StandingContribution): void {
  toExactInteger(contribution.matchPoints, 'matchPoints');
  toExactInteger(contribution.setsFor, 'setsFor');
  toExactInteger(contribution.setsAgainst, 'setsAgainst');
  toExactInteger(contribution.pointsFor, 'pointsFor');
  toExactInteger(contribution.pointsAgainst, 'pointsAgainst');
}

function stableCompare(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
