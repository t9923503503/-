import type {
  CrossPoolComparisonRow,
  CrossPoolComparisonRowDto,
  ExactRatio,
  ExactRatioDto,
  ExactStats,
  IntegerLike,
  PoolStandingInput,
  StandingContribution,
} from './types';
import { SportsDomainError } from './types';

const ZERO = BigInt(0);

export function toExactInteger(value: IntegerLike, field = 'value'): bigint {
  if (typeof value === 'bigint') {
    if (value < ZERO) throw new SportsDomainError('NEGATIVE_STANDING_VALUE', `${field} cannot be negative.`, { field });
    return value;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SportsDomainError('INVALID_STANDING_INTEGER', `${field} must be a non-negative safe integer.`, { field, value });
  }
  return BigInt(value);
}

export function exactRatio(numerator: IntegerLike, denominator: IntegerLike): ExactRatio {
  const exactNumerator = toExactInteger(numerator, 'numerator');
  const exactDenominator = toExactInteger(denominator, 'denominator');
  if (exactDenominator === ZERO) {
    return exactNumerator === ZERO ? { kind: 'no_data' } : { kind: 'infinity' };
  }
  return { kind: 'finite', numerator: exactNumerator, denominator: exactDenominator };
}

/** Returns -1 when left is smaller, 1 when left is larger, and null for no_data. */
export function compareExactRatios(left: ExactRatio, right: ExactRatio): -1 | 0 | 1 | null {
  if (left.kind === 'no_data' || right.kind === 'no_data') return null;
  if (left.kind === 'infinity') return right.kind === 'infinity' ? 0 : 1;
  if (right.kind === 'infinity') return -1;
  const leftCross = left.numerator * right.denominator;
  const rightCross = right.numerator * left.denominator;
  if (leftCross === rightCross) return 0;
  return leftCross > rightCross ? 1 : -1;
}

export function aggregateStandingLedger(ledger: readonly StandingContribution[]): ExactStats {
  return ledger.reduce<ExactStats>(
    (stats, item) => {
      if (item.counted === false) return stats;
      return {
        matchesPlayed: stats.matchesPlayed + BigInt(1),
        matchPoints: stats.matchPoints + toExactInteger(item.matchPoints, 'matchPoints'),
        setsFor: stats.setsFor + toExactInteger(item.setsFor, 'setsFor'),
        setsAgainst: stats.setsAgainst + toExactInteger(item.setsAgainst, 'setsAgainst'),
        pointsFor: stats.pointsFor + toExactInteger(item.pointsFor, 'pointsFor'),
        pointsAgainst: stats.pointsAgainst + toExactInteger(item.pointsAgainst, 'pointsAgainst'),
      };
    },
    {
      matchesPlayed: ZERO,
      matchPoints: ZERO,
      setsFor: ZERO,
      setsAgainst: ZERO,
      pointsFor: ZERO,
      pointsAgainst: ZERO,
    },
  );
}

/**
 * Creates the comparison ledger used between full RR pools of three and four.
 * A top-three team from a pool of four drops its match against the final fourth
 * placed team. Fourth-place teams keep all matches and are only ranked with
 * other fourth-place teams by rankCrossPoolCohort().
 */
export function createCrossPoolComparisonRows(inputs: readonly PoolStandingInput[]): CrossPoolComparisonRow[] {
  validatePoolInputs(inputs);
  const finalRankByPoolAndEntry = new Map<string, number>();
  for (const input of inputs) finalRankByPoolAndEntry.set(poolEntryKey(input.poolId, input.entryId), input.poolRank);

  return inputs.map((input) => {
    const excludedMatchIds = new Set<string>();
    const comparisonLedger = input.ledger.filter((item) => {
      if (item.counted === false) return false;
      if (input.poolSize !== 4 || input.poolRank === 4) return true;
      const opponentRank = finalRankByPoolAndEntry.get(poolEntryKey(input.poolId, item.opponentId));
      if (opponentRank === 4) {
        excludedMatchIds.add(item.matchId);
        return false;
      }
      return true;
    });
    const stats = aggregateStandingLedger(comparisonLedger);
    return {
      entryId: input.entryId,
      poolId: input.poolId,
      poolSize: input.poolSize,
      poolRank: input.poolRank,
      initialSeed: input.initialSeed,
      excludedMatchIds: [...excludedMatchIds].sort(),
      ...stats,
    };
  });
}

/**
 * Ranks rows lexicographically. A no_data ratio skips that criterion for the
 * whole currently tied block, preventing pair-dependent/non-transitive sorts.
 */
export function rankCrossPoolCohort(rows: readonly CrossPoolComparisonRow[]): CrossPoolComparisonRow[] {
  const byRank = groupBy(
    [...rows].sort((left, right) => left.poolRank - right.poolRank || left.entryId.localeCompare(right.entryId)),
    (row) => String(row.poolRank),
  );
  return [...byRank.values()].flatMap((block) => rankTiedBlock(block, 0));
}

export function matchPointsPerMatch(row: CrossPoolComparisonRow): ExactRatio {
  return exactRatio(row.matchPoints, row.matchesPlayed);
}

export function setRatio(row: CrossPoolComparisonRow): ExactRatio {
  return exactRatio(row.setsFor, row.setsAgainst);
}

export function pointRatio(row: CrossPoolComparisonRow): ExactRatio {
  return exactRatio(row.pointsFor, row.pointsAgainst);
}

/** The only supported JSON boundary for exact ratio values. */
export function toExactRatioDto(ratio: ExactRatio): ExactRatioDto {
  if (ratio.kind !== 'finite') return { kind: ratio.kind };
  return {
    kind: 'finite',
    numerator: ratio.numerator.toString(10),
    denominator: ratio.denominator.toString(10),
  };
}

/**
 * Converts domain BigInts to decimal strings without Number coercion. Service
 * and route layers should return this DTO, never a CrossPoolComparisonRow.
 */
export function toCrossPoolComparisonRowDto(row: CrossPoolComparisonRow): CrossPoolComparisonRowDto {
  return {
    entryId: row.entryId,
    poolId: row.poolId,
    poolSize: row.poolSize,
    poolRank: row.poolRank,
    initialSeed: row.initialSeed,
    excludedMatchIds: [...row.excludedMatchIds],
    matchesPlayed: row.matchesPlayed.toString(10),
    matchPoints: row.matchPoints.toString(10),
    setsFor: row.setsFor.toString(10),
    setsAgainst: row.setsAgainst.toString(10),
    pointsFor: row.pointsFor.toString(10),
    pointsAgainst: row.pointsAgainst.toString(10),
  };
}

export function toCrossPoolComparisonRowsDto(
  rows: readonly CrossPoolComparisonRow[],
): CrossPoolComparisonRowDto[] {
  return rows.map(toCrossPoolComparisonRowDto);
}

function rankTiedBlock(block: CrossPoolComparisonRow[], criterion: number): CrossPoolComparisonRow[] {
  if (block.length <= 1) return block;
  if (criterion >= 4) return [...block].sort((left, right) => left.entryId.localeCompare(right.entryId));

  if (criterion === 3) {
    return [...block].sort(
      (left, right) => left.initialSeed - right.initialSeed || left.entryId.localeCompare(right.entryId),
    );
  }

  const selectors = [matchPointsPerMatch, setRatio, pointRatio] as const;
  const values = block.map(selectors[criterion]);
  if (values.some((value) => value.kind === 'no_data')) {
    return rankTiedBlock(block, criterion + 1);
  }

  const sorted = [...block].sort((left, right) => {
    const comparison = compareExactRatios(selectors[criterion](left), selectors[criterion](right));
    if (comparison === null || comparison === 0) return left.entryId.localeCompare(right.entryId);
    return -comparison;
  });
  const tiedGroups: CrossPoolComparisonRow[][] = [];
  for (const row of sorted) {
    const current = tiedGroups[tiedGroups.length - 1];
    if (!current) {
      tiedGroups.push([row]);
      continue;
    }
    const comparison = compareExactRatios(selectors[criterion](current[0]), selectors[criterion](row));
    if (comparison === 0) current.push(row);
    else tiedGroups.push([row]);
  }
  return tiedGroups.flatMap((group) => rankTiedBlock(group, criterion + 1));
}

function validatePoolInputs(inputs: readonly PoolStandingInput[]): void {
  const seen = new Set<string>();
  const poolMembers = new Map<string, Set<string>>();
  const poolRanks = new Map<string, Set<number>>();
  const poolSizes = new Map<string, 3 | 4>();
  for (const input of inputs) {
    const key = poolEntryKey(input.poolId, input.entryId);
    if (seen.has(key)) {
      throw new SportsDomainError('DUPLICATE_POOL_STANDING', 'Each team may appear once in a pool standing snapshot.', { key });
    }
    if (!Number.isInteger(input.poolRank) || input.poolRank < 1 || input.poolRank > input.poolSize) {
      throw new SportsDomainError('INVALID_POOL_RANK', 'poolRank must fit the declared pool size.', {
        entryId: input.entryId,
        poolRank: input.poolRank,
        poolSize: input.poolSize,
      });
    }
    const declaredSize = poolSizes.get(input.poolId);
    if (declaredSize !== undefined && declaredSize !== input.poolSize) {
      throw new SportsDomainError('INCONSISTENT_POOL_SIZE', 'All rows in one pool must declare the same pool size.', {
        poolId: input.poolId,
        expected: declaredSize,
        actual: input.poolSize,
      });
    }
    const ranks = poolRanks.get(input.poolId) ?? new Set<number>();
    if (ranks.has(input.poolRank)) {
      throw new SportsDomainError('DUPLICATE_POOL_RANK', 'Final pool ranks must be unique inside a pool.', {
        poolId: input.poolId,
        poolRank: input.poolRank,
      });
    }
    ranks.add(input.poolRank);
    poolRanks.set(input.poolId, ranks);
    poolSizes.set(input.poolId, input.poolSize);
    if (!Number.isInteger(input.initialSeed) || input.initialSeed < 1) {
      throw new SportsDomainError('INVALID_INITIAL_SEED', 'initialSeed must be a positive integer.', { entryId: input.entryId });
    }
    seen.add(key);
    const members = poolMembers.get(input.poolId) ?? new Set<string>();
    members.add(input.entryId);
    poolMembers.set(input.poolId, members);
  }
  for (const [poolId, members] of poolMembers) {
    const poolSize = poolSizes.get(poolId)!;
    if (members.size !== poolSize) {
      throw new SportsDomainError('INCOMPLETE_POOL_STANDING', 'A final standing snapshot must contain every team in its pool.', {
        poolId,
        expected: poolSize,
        actual: members.size,
      });
    }
  }
  for (const input of inputs) {
    const matchIds = new Set<string>();
    for (const item of input.ledger) {
      if (!item.matchId || matchIds.has(item.matchId)) {
        throw new SportsDomainError('DUPLICATE_LEDGER_MATCH', 'A team ledger may contain each match exactly once.', {
          entryId: input.entryId,
          matchId: item.matchId,
        });
      }
      matchIds.add(item.matchId);
      if (item.teamId !== input.entryId) {
        throw new SportsDomainError('LEDGER_TEAM_MISMATCH', 'Ledger contribution teamId must match its standing row.', {
          expected: input.entryId,
          actual: item.teamId,
        });
      }
      if (!poolMembers.get(input.poolId)?.has(item.opponentId)) {
        throw new SportsDomainError('LEDGER_OPPONENT_NOT_IN_POOL', 'Ledger opponent must belong to the same pool.', {
          poolId: input.poolId,
          opponentId: item.opponentId,
        });
      }
      if (item.opponentId === input.entryId) {
        throw new SportsDomainError('SELF_MATCH_IN_LEDGER', 'A team cannot be its own ledger opponent.', {
          entryId: input.entryId,
          matchId: item.matchId,
        });
      }
    }
  }
}

function poolEntryKey(poolId: string, entryId: string): string {
  return `${poolId}\u0000${entryId}`;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    const block = result.get(itemKey) ?? [];
    block.push(item);
    result.set(itemKey, block);
  }
  return result;
}
