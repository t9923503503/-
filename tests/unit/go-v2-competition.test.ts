import { describe, expect, it } from 'vitest';

import {
  buildCompetitionTierPipeline,
  type LockedModifiedPool4,
  type LockedRoundRobinPool,
} from '@/lib/go-v2/competition';
import {
  SportsDomainError,
  partitionGroups,
  type StandingContribution,
} from '@/lib/go-v2/core';

function resultContribution(
  matchId: string,
  teamId: string,
  opponentId: string,
  won: boolean,
): StandingContribution {
  return {
    matchId,
    teamId,
    opponentId,
    matchPoints: won ? 2 : 0,
    setsFor: won ? 1 : 0,
    setsAgainst: won ? 0 : 1,
    pointsFor: won ? 21 : 15,
    pointsAgainst: won ? 15 : 21,
  };
}

function makeRoundRobinPools(teamCount: number): LockedRoundRobinPool[] {
  const capacities = partitionGroups(teamCount).capacities;
  let initialSeed = 1;
  return capacities.map((capacity, poolIndex) => {
    const poolId = `P${String(poolIndex + 1).padStart(2, '0')}`;
    const mutableEntries = Array.from({ length: capacity }, (_, entryIndex) => ({
      entryId: `${poolId}-T${entryIndex + 1}`,
      initialSeed: initialSeed++,
      ledger: [] as StandingContribution[],
    }));
    for (let left = 0; left < mutableEntries.length; left += 1) {
      for (let right = left + 1; right < mutableEntries.length; right += 1) {
        const matchId = `${poolId}-M${left + 1}-${right + 1}`;
        mutableEntries[left].ledger.push(resultContribution(
          matchId,
          mutableEntries[left].entryId,
          mutableEntries[right].entryId,
          true,
        ));
        mutableEntries[right].ledger.push(resultContribution(
          matchId,
          mutableEntries[right].entryId,
          mutableEntries[left].entryId,
          false,
        ));
      }
    }
    return {
      poolId,
      poolSize: capacity,
      locked: true,
      format: 'round_robin_pool',
      entries: mutableEntries,
    };
  });
}

function makeModifiedPool(poolId: string, firstSeed: number): LockedModifiedPool4 {
  const ids = ['A', 'B', 'C', 'D'].map((suffix) => `${poolId}-${suffix}`);
  const entries = ids.map((entryId, index) => ({
    entryId,
    initialSeed: firstSeed + index,
    finalRank: (4 - index) as 1 | 2 | 3 | 4,
    ledger: [] as StandingContribution[],
  }));
  const pairs = [
    [0, 3, 'OPEN-1'],
    [1, 2, 'OPEN-2'],
    [0, 1, 'PLACE-1-2'],
    [2, 3, 'PLACE-3-4'],
  ] as const;
  for (const [left, right, label] of pairs) {
    const matchId = `${poolId}-${label}`;
    // Identical standing contributions make it explicit that finalRank, not
    // ratios or the initial seed, defines a Modified Pool placement.
    entries[left].ledger.push(resultContribution(matchId, ids[left], ids[right], false));
    entries[right].ledger.push(resultContribution(matchId, ids[right], ids[left], false));
  }
  return {
    poolId,
    poolSize: 4,
    locked: true,
    format: 'modified_pool_4',
    entries,
  };
}

describe('LPVolley V2 competition tier pipeline', () => {
  it.each([
    [22, 'auto', { hard: 12, medium: 0, light: 10 }],
    [23, 'auto', { hard: 12, medium: 0, light: 11 }],
    [29, 'three', { hard: 16, medium: 7, light: 6 }],
    [30, 'auto', { hard: 16, medium: 0, light: 14 }],
    [31, 'auto', { hard: 16, medium: 8, light: 7 }],
    [32, 'auto', { hard: 16, medium: 8, light: 8 }],
    [48, 'auto', { hard: 16, medium: 16, light: 16 }],
  ] as const)('allocates every one of %i teams exactly once', (teamCount, tierMode, expected) => {
    const result = buildCompetitionTierPipeline({
      pools: makeRoundRobinPools(teamCount),
      tierMode,
    });
    expect(result.quotas).toMatchObject(expected);
    expect(result.bracketParticipants.hard).toHaveLength(expected.hard);
    expect(result.bracketParticipants.medium).toHaveLength(expected.medium);
    expect(result.bracketParticipants.light).toHaveLength(expected.light);
    expect(result.qualificationRows).toHaveLength(teamCount);
    expect(new Set(result.qualificationRows.map((row) => row.entryId)).size).toBe(teamCount);
    expect(result.bracketParticipants.hard.map((participant) => participant.seed))
      .toEqual(Array.from({ length: expected.hard }, (_, index) => index + 1));
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('uses the equal-two projection without changing the internal four-team table', () => {
    const result = buildCompetitionTierPipeline({ pools: makeRoundRobinPools(7) });
    const fourPool = result.standingRows.filter((row) => row.poolSize === 4);
    const fourComparison = result.comparisonRows.filter((row) => row.poolSize === 4);
    expect(fourPool.map((row) => row.totals.matchesPlayed)).toEqual(['3', '3', '3', '3']);
    expect(fourComparison.slice(0, 3).map((row) => row.matchesPlayed)).toEqual(['2', '2', '2']);
    expect(fourComparison.slice(0, 3).every((row) => row.excludedMatchIds.length === 1)).toBe(true);
    expect(fourComparison[3].matchesPlayed).toBe('3');
  });

  it('keeps a withdrawn team in immutable standings but excludes it from qualification', () => {
    const result = buildCompetitionTierPipeline({
      pools: makeRoundRobinPools(7),
      excludedEntryIds: ['P01-T1'],
    });

    expect(result.standingRows.some((row) => row.entryId === 'P01-T1')).toBe(true);
    expect(result.qualificationRows.some((row) => row.entryId === 'P01-T1')).toBe(false);
    expect(result.qualificationRows).toHaveLength(6);
    expect(result.qualificationRows.find((row) => row.entryId === 'P01-T2')?.poolRank).toBe(1);
  });

  it('takes explicit placement ranks for Modified Pool 4 and never runs the RR projection', () => {
    const result = buildCompetitionTierPipeline({
      pools: [makeModifiedPool('P01', 1), makeModifiedPool('P02', 5)],
    });
    expect(result.format).toBe('modified_pool_4');
    expect(result.standingRows.filter((row) => row.poolId === 'P01').map((row) => row.entryId))
      .toEqual(['P01-D', 'P01-C', 'P01-B', 'P01-A']);
    expect(result.comparisonRows.every((row) => row.matchesPlayed === '2')).toBe(true);
    expect(result.comparisonRows.every((row) => row.excludedMatchIds.length === 0)).toBe(true);
    expect(result.qualificationRows).toHaveLength(8);
  });

  it('is deterministic across input, entry and ledger ordering', () => {
    const pools = makeRoundRobinPools(22);
    const reordered = [...pools].reverse().map((pool) => ({
      ...pool,
      entries: [...pool.entries].reverse().map((entry) => ({ ...entry, ledger: [...entry.ledger].reverse() })),
    }));
    expect(buildCompetitionTierPipeline({ pools: reordered }))
      .toEqual(buildCompetitionTierPipeline({ pools }));
  });

  it('rejects incomplete snapshots, duplicates and mixed ranking semantics', () => {
    const incomplete = makeRoundRobinPools(7);
    incomplete[0] = {
      ...incomplete[0],
      entries: incomplete[0].entries.map((entry, index) => (
        index === 0 ? { ...entry, ledger: entry.ledger.slice(1) } : entry
      )),
    };
    expect(() => buildCompetitionTierPipeline({ pools: incomplete }))
      .toThrowError(expect.objectContaining({ code: 'INCOMPLETE_POOL_LEDGER' }));

    const duplicate = makeRoundRobinPools(7);
    duplicate[1] = {
      ...duplicate[1],
      entries: duplicate[1].entries.map((entry, index) => (
        index === 0 ? { ...entry, entryId: duplicate[0].entries[0].entryId } : entry
      )),
    };
    expect(() => buildCompetitionTierPipeline({ pools: duplicate }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_COMPETITION_ENTRY' }));

    expect(() => buildCompetitionTierPipeline({
      pools: [makeRoundRobinPools(4)[0], makeModifiedPool('P02', 5)],
    })).toThrowError(expect.objectContaining({ code: 'MIXED_POOL_FORMATS' }));
  });

  it('requires two reciprocal matches and explicit unique placements in Modified Pool', () => {
    const pool = makeModifiedPool('P01', 1);
    const incomplete: LockedModifiedPool4 = {
      ...pool,
      entries: pool.entries.map((entry, index) => (
        index === 0 ? { ...entry, ledger: entry.ledger.slice(1) } : entry
      )),
    };
    expect(() => buildCompetitionTierPipeline({ pools: [incomplete] }))
      .toThrowError(SportsDomainError);

    const duplicateRanks: LockedModifiedPool4 = {
      ...pool,
      entries: pool.entries.map((entry) => ({ ...entry, finalRank: 1 })),
    };
    expect(() => buildCompetitionTierPipeline({ pools: [duplicateRanks] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_MODIFIED_POOL_FINAL_RANKS' }));
  });
});
