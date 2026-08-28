import {
  SportsDomainError,
  aggregateStandingLedger,
  allocateTiers,
  createCrossPoolComparisonRows,
  rankPoolStandings,
  toCrossPoolComparisonRowsDto,
  toExactInteger,
  toPoolStandingInputsDto,
  type BracketParticipant,
  type CrossPoolComparisonRow,
  type CrossPoolComparisonRowDto,
  type ExactTierQuotas,
  type PoolMatchPointsMode,
  type PoolStandingEntryInput,
  type PoolStandingInput,
  type PoolStandingInputDto,
  type StandingContribution,
  type TierMode,
  type TierName,
  type TierQuotas,
} from './core';

export type CompetitionPoolFormat = 'round_robin_pool' | 'modified_pool_4';

interface LockedPoolBase {
  poolId: string;
  poolSize: 3 | 4;
  /** Only immutable draw snapshots are accepted by the qualification pipeline. */
  locked: true;
}

export interface LockedRoundRobinPool extends LockedPoolBase {
  format: 'round_robin_pool';
  entries: readonly PoolStandingEntryInput[];
}

export interface ModifiedPoolStandingEntry extends PoolStandingEntryInput {
  /** Determined by the 1-2 and 3-4 placement matches, never by ledger ratios. */
  finalRank: 1 | 2 | 3 | 4;
}

export interface LockedModifiedPool4 extends LockedPoolBase {
  format: 'modified_pool_4';
  poolSize: 4;
  entries: readonly ModifiedPoolStandingEntry[];
}

export type LockedCompetitionPool = LockedRoundRobinPool | LockedModifiedPool4;

export interface BuildTierPipelineInput {
  pools: readonly LockedCompetitionPool[];
  /** Withdrawn/disqualified entries remain in immutable standings, but cannot qualify. */
  excludedEntryIds?: readonly string[];
  tierMode?: TierMode;
  hardCap?: number;
  /** Optional exact pre-lock quota override; every active entry must be allocated. */
  tierQuotas?: ExactTierQuotas;
  /** Internal RR default is total MP. Cross-pool comparison always uses MP/match. */
  internalMatchPointsMode?: PoolMatchPointsMode;
}

export interface QualificationRowDto {
  entryId: string;
  poolId: string;
  poolRank: number;
  initialSeed: number;
  tier: TierName;
  tierSeed: number;
  comparison: CrossPoolComparisonRowDto;
}

export interface TierBracketParticipants {
  hard: readonly BracketParticipant[];
  medium: readonly BracketParticipant[];
  light: readonly BracketParticipant[];
}

/** Entire result is safe to serialize with JSON.stringify (no BigInt escapes). */
export interface CompetitionTierPipelineDto {
  format: CompetitionPoolFormat;
  teamCount: number;
  groupCount: number;
  quotas: TierQuotas;
  standingRows: readonly PoolStandingInputDto[];
  comparisonRows: readonly CrossPoolComparisonRowDto[];
  qualificationRows: readonly QualificationRowDto[];
  bracketParticipants: TierBracketParticipants;
}

/**
 * Pure qualification pipeline for a locked group stage.
 *
 * RR pools are ranked from their complete ledgers, then projected onto the
 * equal-two-match comparison ledger. Modified Pool 4 deliberately bypasses
 * the RR ranker: its explicit placement-match finalRank is authoritative and
 * all teams have exactly two declared ledger contributions.
 */
export function buildCompetitionTierPipeline(input: BuildTierPipelineInput): CompetitionTierPipelineDto {
  const pools = validateAndSortPools(input.pools);
  const format = pools[0].format;
  const standingRows = pools.flatMap((pool) => (
    pool.format === 'round_robin_pool'
      ? rankPoolStandings(
          {
            poolId: pool.poolId,
            poolSize: pool.poolSize,
            entries: pool.entries,
          },
          { matchPointsMode: input.internalMatchPointsMode ?? 'total' },
        )
      : materializeModifiedPoolStandings(pool)
  ));

  assertEveryEntryOnce(standingRows);
  const comparisonRows = format === 'round_robin_pool'
    ? createCrossPoolComparisonRows(standingRows)
    : createModifiedPoolComparisonRows(standingRows);
  const knownEntryIds = new Set(comparisonRows.map((row) => row.entryId));
  const excludedEntryIds = new Set(input.excludedEntryIds ?? []);
  for (const entryId of excludedEntryIds) {
    if (!knownEntryIds.has(entryId)) {
      throw new SportsDomainError('UNKNOWN_EXCLUDED_ENTRY', 'Excluded qualification entry is not in the locked pools.', {
        entryId,
      });
    }
  }
  const activeComparisonRows = compressActivePoolRanks(
    comparisonRows.filter((row) => !excludedEntryIds.has(row.entryId)),
  );
  const allocation = allocateTiers(activeComparisonRows, pools.length, {
    mode: input.tierMode,
    hardCap: input.hardCap,
    quotas: input.tierQuotas,
  });

  const qualificationRows = [
    ...qualifyTier('hard', allocation.hard),
    ...qualifyTier('medium', allocation.medium),
    ...qualifyTier('light', allocation.light),
  ];
  assertEveryEntryOnce(qualificationRows);

  return {
    format,
    teamCount: activeComparisonRows.length,
    groupCount: pools.length,
    quotas: { ...allocation.quotas },
    standingRows: toPoolStandingInputsDto(
      [...standingRows].sort(compareStandingRows),
    ),
    comparisonRows: toCrossPoolComparisonRowsDto(
      [...comparisonRows].sort(compareStandingRows),
    ),
    qualificationRows,
    bracketParticipants: {
      hard: qualificationRows.filter((row) => row.tier === 'hard').map(toBracketParticipant),
      medium: qualificationRows.filter((row) => row.tier === 'medium').map(toBracketParticipant),
      light: qualificationRows.filter((row) => row.tier === 'light').map(toBracketParticipant),
    },
  };
}

function compressActivePoolRanks(rows: readonly CrossPoolComparisonRow[]): CrossPoolComparisonRow[] {
  const byPool = new Map<string, CrossPoolComparisonRow[]>();
  for (const row of rows) byPool.set(row.poolId, [...(byPool.get(row.poolId) ?? []), row]);
  return [...byPool.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .flatMap(([, poolRows]) => [...poolRows]
      .sort((left, right) => left.poolRank - right.poolRank || stableCompare(left.entryId, right.entryId))
      .map((row, index) => ({ ...row, poolRank: index + 1 })));
}

function validateAndSortPools(pools: readonly LockedCompetitionPool[]): LockedCompetitionPool[] {
  if (pools.length === 0) {
    throw new SportsDomainError('EMPTY_POOL_SNAPSHOT', 'At least one locked pool is required.');
  }
  const seenPools = new Set<string>();
  const seenEntries = new Set<string>();
  const seenSeeds = new Set<number>();
  const formats = new Set<CompetitionPoolFormat>();
  let teamCount = 0;

  for (const pool of pools) {
    if (pool.locked !== true) {
      throw new SportsDomainError('POOL_NOT_LOCKED', 'Qualification accepts only locked pool snapshots.', {
        poolId: pool.poolId,
      });
    }
    if (!pool.poolId || pool.poolId.trim() !== pool.poolId || seenPools.has(pool.poolId)) {
      throw new SportsDomainError('INVALID_OR_DUPLICATE_POOL', 'Pool ids must be non-empty, trimmed and unique.', {
        poolId: pool.poolId,
      });
    }
    if (pool.poolSize !== 3 && pool.poolSize !== 4) {
      throw new SportsDomainError('INVALID_POOL_SIZE', 'Competition pools must contain three or four teams.', {
        poolId: pool.poolId,
        poolSize: pool.poolSize,
      });
    }
    if (pool.entries.length !== pool.poolSize) {
      throw new SportsDomainError('INCOMPLETE_POOL_STANDING', 'Pool entries must match the locked pool size.', {
        poolId: pool.poolId,
        expected: pool.poolSize,
        actual: pool.entries.length,
      });
    }
    if (pool.format === 'modified_pool_4' && pool.poolSize !== 4) {
      throw new SportsDomainError('MODIFIED_POOL_REQUIRES_FOUR', 'Modified Pool requires four entries.');
    }
    formats.add(pool.format);
    seenPools.add(pool.poolId);
    teamCount += pool.entries.length;
    for (const entry of pool.entries) {
      if (!entry.entryId || entry.entryId.trim() !== entry.entryId) {
        throw new SportsDomainError('INVALID_ENTRY_ID', 'Entry ids must be non-empty trimmed strings.', {
          poolId: pool.poolId,
          entryId: entry.entryId,
        });
      }
      if (!Number.isSafeInteger(entry.initialSeed) || entry.initialSeed < 1) {
        throw new SportsDomainError('INVALID_INITIAL_SEED', 'Initial seeds must be positive safe integers.', {
          entryId: entry.entryId,
          initialSeed: entry.initialSeed,
        });
      }
      if (seenEntries.has(entry.entryId)) {
        throw new SportsDomainError('DUPLICATE_COMPETITION_ENTRY', 'Each entry must occur in exactly one pool.', {
          entryId: entry.entryId,
        });
      }
      if (seenSeeds.has(entry.initialSeed)) {
        throw new SportsDomainError('DUPLICATE_INITIAL_SEED', 'Initial seeds must be unique across the locked draw.', {
          initialSeed: entry.initialSeed,
        });
      }
      seenEntries.add(entry.entryId);
      seenSeeds.add(entry.initialSeed);
    }
  }
  if (formats.size !== 1) {
    throw new SportsDomainError(
      'MIXED_POOL_FORMATS',
      'One group stage cannot mix Round Robin and Modified Pool standings.',
    );
  }
  if (teamCount < 3 || teamCount > 48) {
    throw new SportsDomainError('INVALID_TIER_TEAM_COUNT', 'Tier allocation supports 3 to 48 teams.', {
      teamCount,
    });
  }
  return [...pools].sort((left, right) => stableCompare(left.poolId, right.poolId));
}

function materializeModifiedPoolStandings(pool: LockedModifiedPool4): PoolStandingInput[] {
  validateModifiedPoolLedger(pool);
  const ranks = new Set(pool.entries.map((entry) => entry.finalRank));
  if (ranks.size !== 4 || [...ranks].some((rank) => rank < 1 || rank > 4)) {
    throw new SportsDomainError(
      'INVALID_MODIFIED_POOL_FINAL_RANKS',
      'Modified Pool placement matches must provide the unique ranks 1 through 4.',
      { poolId: pool.poolId, ranks: [...ranks] },
    );
  }
  return [...pool.entries]
    .sort((left, right) => left.finalRank - right.finalRank || stableCompare(left.entryId, right.entryId))
    .map((entry) => ({
      entryId: entry.entryId,
      poolId: pool.poolId,
      poolSize: 4,
      poolRank: entry.finalRank,
      initialSeed: entry.initialSeed,
      ledger: entry.ledger,
    }));
}

function validateModifiedPoolLedger(pool: LockedModifiedPool4): void {
  const memberIds = new Set(pool.entries.map((entry) => entry.entryId));
  const matches = new Map<string, Array<{ teamId: string; opponentId: string }>>();
  for (const entry of pool.entries) {
    if (entry.ledger.length !== 2) {
      throw new SportsDomainError(
        'INCOMPLETE_MODIFIED_POOL_LEDGER',
        'Each Modified Pool team must have its opening and placement match.',
        { poolId: pool.poolId, entryId: entry.entryId, expected: 2, actual: entry.ledger.length },
      );
    }
    const opponents = new Set<string>();
    const ownMatches = new Set<string>();
    for (const contribution of entry.ledger) {
      if (!contribution.matchId || contribution.matchId.trim() !== contribution.matchId) {
        throw new SportsDomainError('INVALID_LEDGER_MATCH_ID', 'Every Modified Pool ledger match needs an id.');
      }
      if (contribution.teamId !== entry.entryId) {
        throw new SportsDomainError('LEDGER_TEAM_MISMATCH', 'Ledger teamId must match its Modified Pool entry.', {
          entryId: entry.entryId,
          teamId: contribution.teamId,
        });
      }
      if (!memberIds.has(contribution.opponentId) || contribution.opponentId === entry.entryId) {
        throw new SportsDomainError('LEDGER_OPPONENT_NOT_IN_POOL', 'Modified Pool opponent must belong to the pool.', {
          entryId: entry.entryId,
          opponentId: contribution.opponentId,
        });
      }
      if (ownMatches.has(contribution.matchId) || opponents.has(contribution.opponentId)) {
        throw new SportsDomainError(
          'DUPLICATE_MODIFIED_POOL_MATCH',
          'A Modified Pool team must play two distinct opponents in two matches.',
          { entryId: entry.entryId, matchId: contribution.matchId },
        );
      }
      validateContribution(contribution);
      ownMatches.add(contribution.matchId);
      opponents.add(contribution.opponentId);
      const participants = matches.get(contribution.matchId) ?? [];
      participants.push({ teamId: entry.entryId, opponentId: contribution.opponentId });
      matches.set(contribution.matchId, participants);
    }
  }
  if (matches.size !== 4) {
    throw new SportsDomainError('INCOMPLETE_MODIFIED_POOL_LEDGER', 'Modified Pool 4 must contain four real matches.', {
      poolId: pool.poolId,
      actual: matches.size,
    });
  }
  for (const [matchId, participants] of matches) {
    if (
      participants.length !== 2
      || participants[0].teamId !== participants[1].opponentId
      || participants[0].opponentId !== participants[1].teamId
    ) {
      throw new SportsDomainError(
        'INCONSISTENT_POOL_MATCH_LEDGER',
        'Each Modified Pool match needs reciprocal contributions.',
        { poolId: pool.poolId, matchId, participants },
      );
    }
  }
}

function validateContribution(contribution: StandingContribution): void {
  toExactInteger(contribution.matchPoints, 'matchPoints');
  toExactInteger(contribution.setsFor, 'setsFor');
  toExactInteger(contribution.setsAgainst, 'setsAgainst');
  toExactInteger(contribution.pointsFor, 'pointsFor');
  toExactInteger(contribution.pointsAgainst, 'pointsAgainst');
}

function createModifiedPoolComparisonRows(rows: readonly PoolStandingInput[]): CrossPoolComparisonRow[] {
  return rows.map((row) => ({
    entryId: row.entryId,
    poolId: row.poolId,
    poolSize: row.poolSize,
    poolRank: row.poolRank,
    initialSeed: row.initialSeed,
    excludedMatchIds: [],
    ...aggregateStandingLedger(row.ledger),
  }));
}

function qualifyTier(tier: TierName, rows: readonly CrossPoolComparisonRow[]): QualificationRowDto[] {
  return rows.map((row, index) => ({
    entryId: row.entryId,
    poolId: row.poolId,
    poolRank: row.poolRank,
    initialSeed: row.initialSeed,
    tier,
    tierSeed: index + 1,
    comparison: toCrossPoolComparisonRowsDto([row])[0],
  }));
}

function toBracketParticipant(row: QualificationRowDto): BracketParticipant {
  return {
    entryId: row.entryId,
    seed: row.tierSeed,
    poolId: row.poolId,
    poolRank: row.poolRank,
  };
}

function assertEveryEntryOnce(rows: readonly { entryId: string }[]): void {
  const ids = new Set(rows.map((row) => row.entryId));
  if (ids.size !== rows.length) {
    throw new SportsDomainError('DUPLICATE_COMPETITION_ENTRY', 'Each entry must occur exactly once in the result.');
  }
}

function compareStandingRows(
  left: { poolId: string; poolRank: number; entryId: string },
  right: { poolId: string; poolRank: number; entryId: string },
): number {
  return stableCompare(left.poolId, right.poolId)
    || left.poolRank - right.poolRank
    || stableCompare(left.entryId, right.entryId);
}

function stableCompare(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
