import { describe, expect, it } from 'vitest';

import {
  MATCH_RULE_PRESETS,
  SportsDomainError,
  aggregateStandingLedger,
  allocateTiers,
  calculateTierQuotas,
  compareExactRatios,
  createCrossPoolComparisonRows,
  createMatchRule,
  exactRatio,
  generateModifiedPool4,
  generateRoundRobinPairings,
  partitionGroups,
  pointRatio,
  rankCrossPoolCohort,
  seedGroupsSnake,
  supportsModifiedPool4,
  swapGroupSlots,
  toCrossPoolComparisonRowDto,
  toExactRatioDto,
  toTierAllocationDto,
  validateSportsEngineConfig,
  type CrossPoolComparisonRow,
  type PoolStandingInput,
  type SeedEntry,
  type SeededEntry,
} from '@/lib/go-v2/core';

function entries(count: number): SeedEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    entryId: `T${String(index + 1).padStart(2, '0')}`,
    rating: 1000 - index,
    confirmedAt: new Date(Date.UTC(2026, 0, 1, 9, index)).toISOString(),
  }));
}

function seeded(count: number): SeededEntry[] {
  return entries(count).map((entry, index) => ({ ...entry, initialSeed: index + 1 }));
}

function comparisonRow(
  entryId: string,
  poolId: string,
  poolRank: number,
  initialSeed: number,
  overrides: Partial<CrossPoolComparisonRow> = {},
): CrossPoolComparisonRow {
  return {
    entryId,
    poolId,
    poolSize: 4,
    poolRank,
    initialSeed,
    excludedMatchIds: [],
    matchesPlayed: BigInt(2),
    matchPoints: BigInt(Math.max(0, 4 - poolRank)),
    setsFor: BigInt(Math.max(0, 4 - poolRank)),
    setsAgainst: BigInt(poolRank),
    pointsFor: BigInt(42 - poolRank),
    pointsAgainst: BigInt(20 + poolRank),
    ...overrides,
  };
}

describe('LPVolley V2 match rules and validation', () => {
  it('materializes all three independent match profiles', () => {
    expect(MATCH_RULE_PRESETS.single_21.sets.map((set) => set.targetPoints)).toEqual([21]);
    expect(MATCH_RULE_PRESETS.best_of_3_15.sets.map((set) => set.targetPoints)).toEqual([15, 15, 15]);
    expect(MATCH_RULE_PRESETS.best_of_3_21_15.sets.map((set) => set.targetPoints)).toEqual([21, 21, 15]);
    expect(createMatchRule('single_21', { pointCap: 25 }).sets[0].pointCap).toBe(25);
  });

  it('returns actionable config issues instead of silently changing sport rules', () => {
    const result = validateSportsEngineConfig({
      teamCount: 5,
      groupStage: { enabled: true, format: 'round_robin_pool', matchRule: MATCH_RULE_PRESETS.single_21 },
      playoff: {
        format: 'double_elimination',
        matchRule: MATCH_RULE_PRESETS.best_of_3_21_15,
        bronzeMatch: true,
        resetFinal: true,
      },
      tierMode: 'auto',
      hardCap: 16,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
        'GROUPS_UNAVAILABLE_FOR_FIVE',
        'BRONZE_NOT_SUPPORTED_IN_DOUBLE_ELIMINATION',
      ]));
    }
  });

  it('allows Modified Pool only when the complete partition consists of fours', () => {
    const base = {
      groupStage: { enabled: true, format: 'modified_pool_4' as const, matchRule: MATCH_RULE_PRESETS.single_21 },
      playoff: {
        format: 'single_elimination' as const,
        matchRule: MATCH_RULE_PRESETS.single_21,
        bronzeMatch: true,
        resetFinal: false,
      },
      tierMode: 'auto' as const,
      hardCap: 16,
    };
    const mixed = validateSportsEngineConfig({ ...base, teamCount: 30 });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.issues.map((issue) => issue.code)).toContain('MODIFIED_POOL_REQUIRES_ALL_FOURS');
    expect(validateSportsEngineConfig({ ...base, teamCount: 32 }).ok).toBe(true);
  });
});

describe('LPVolley V2 group partition and draw', () => {
  it('partitions every supported N into 3/4 pools with the minimum number of threes', () => {
    for (let teamCount = 3; teamCount <= 48; teamCount += 1) {
      if (teamCount === 5) continue;
      const partition = partitionGroups(teamCount);
      expect(partition.capacities.reduce((sum, capacity) => sum + capacity, 0)).toBe(teamCount);
      expect(partition.capacities.every((capacity) => capacity === 3 || capacity === 4)).toBe(true);
      for (let fewerThrees = 0; fewerThrees < partition.threes; fewerThrees += 1) {
        expect((teamCount - fewerThrees * 3) % 4).not.toBe(0);
      }
    }
  });

  it('rejects five teams with the promised alternatives', () => {
    expect(() => partitionGroups(5)).toThrowError(SportsDomainError);
    try {
      partitionGroups(5);
    } catch (error) {
      expect((error as SportsDomainError).code).toBe('GROUPS_UNAVAILABLE_FOR_FIVE');
      expect((error as SportsDomainError).details.alternatives).toEqual(['standalone_bracket', 'add_sixth_team']);
    }
  });

  it('reproduces the 22, 23 and 30 team pool shapes from the workbook', () => {
    expect(partitionGroups(22)).toMatchObject({ fours: 4, threes: 2, groupCount: 6 });
    expect(partitionGroups(23)).toMatchObject({ fours: 5, threes: 1, groupCount: 6 });
    expect(partitionGroups(30)).toMatchObject({ fours: 6, threes: 2, groupCount: 8 });
    expect(supportsModifiedPool4(partitionGroups(32))).toBe(true);
    expect(supportsModifiedPool4(partitionGroups(30))).toBe(false);
  });

  it('sorts rating ties deterministically and snakes while skipping full triples', () => {
    const source = entries(22);
    source[0] = { entryId: 'Z', rating: 2000, confirmedAt: '2026-01-01T09:01:00Z' };
    source[1] = { entryId: 'A', rating: 2000, confirmedAt: '2026-01-01T09:00:00Z' };
    const draw = seedGroupsSnake(source);
    expect(draw.seedSnapshot.slice(0, 2).map((entry) => entry.entryId)).toEqual(['A', 'Z']);
    expect(draw.groups.map((group) => group.slots.length)).toEqual([4, 4, 4, 4, 3, 3]);
    expect(new Set(draw.groups.flatMap((group) => group.slots.map((slot) => slot.entry.entryId))).size).toBe(22);
    expect(draw.groups.map((group) => group.slots[0].entry.initialSeed)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(draw.groups.map((group) => group.slots[1].entry.initialSeed)).toEqual([12, 11, 10, 9, 8, 7]);
  });

  it('supports an immutable manual swap without changing capacities or seed snapshot', () => {
    const draw = seedGroupsSnake(entries(8));
    const beforeLeft = draw.groups[0].slots[0].entry.entryId;
    const beforeRight = draw.groups[1].slots[0].entry.entryId;
    const swapped = swapGroupSlots(draw, { groupId: 'POOL-1', slot: 1 }, { groupId: 'POOL-2', slot: 1 });
    expect(swapped.groups[0].slots[0].entry.entryId).toBe(beforeRight);
    expect(swapped.groups[1].slots[0].entry.entryId).toBe(beforeLeft);
    expect(draw.groups[0].slots[0].entry.entryId).toBe(beforeLeft);
    expect(swapped.seedSnapshot).toEqual(draw.seedSnapshot);
  });

  it('generates complete, duplicate-free RR and four-match Modified Pool schedules', () => {
    expect(generateRoundRobinPairings('A', seeded(3))).toHaveLength(3);
    const four = generateRoundRobinPairings('B', seeded(4));
    expect(four).toHaveLength(6);
    const pairs = four.map((match) => [
      match.sourceA.kind === 'ENTRY' ? match.sourceA.entryId : '',
      match.sourceB.kind === 'ENTRY' ? match.sourceB.entryId : '',
    ].sort().join(':'));
    expect(new Set(pairs).size).toBe(6);

    const modified = generateModifiedPool4('C', seeded(4));
    expect(modified).toHaveLength(4);
    expect(modified.slice(0, 2).map((match) => [match.sourceA, match.sourceB])).toEqual([
      [expect.objectContaining({ entryId: 'T01' }), expect.objectContaining({ entryId: 'T04' })],
      [expect.objectContaining({ entryId: 'T02' }), expect.objectContaining({ entryId: 'T03' })],
    ]);
    expect(modified[2].placementRange).toEqual([1, 2]);
    expect(modified[3].placementRange).toEqual([3, 4]);
  });
});

describe('LPVolley V2 exact ranking and equal-two-match ledger', () => {
  it('compares exact fractions beyond Number precision and handles both zero-denominator states', () => {
    expect(compareExactRatios(exactRatio(BigInt('9007199254740993'), BigInt('9007199254740994')), exactRatio(1, 1))).toBe(-1);
    expect(exactRatio(42, 0)).toEqual({ kind: 'infinity' });
    expect(exactRatio(0, 0)).toEqual({ kind: 'no_data' });
    expect(compareExactRatios(exactRatio(0, 0), exactRatio(1, 2))).toBeNull();
  });

  it('aggregates only counted standing contributions', () => {
    expect(aggregateStandingLedger([
      { matchId: '1', teamId: 'A', opponentId: 'B', matchPoints: 2, setsFor: 2, setsAgainst: 0, pointsFor: 42, pointsAgainst: 0 },
      { matchId: '2', teamId: 'A', opponentId: 'C', matchPoints: 0, setsFor: 0, setsAgainst: 0, pointsFor: 0, pointsAgainst: 0, counted: false },
    ])).toEqual({
      matchesPlayed: BigInt(1),
      matchPoints: BigInt(2),
      setsFor: BigInt(2),
      setsAgainst: BigInt(0),
      pointsFor: BigInt(42),
      pointsAgainst: BigInt(0),
    });
  });

  it('drops only the top-three team match against final fourth place in a four-pool', () => {
    const ranks = ['A', 'B', 'C', 'D'];
    const inputs: PoolStandingInput[] = ranks.map((entryId, teamIndex) => ({
      entryId,
      poolId: 'P1',
      poolSize: 4,
      poolRank: teamIndex + 1,
      initialSeed: teamIndex + 1,
      ledger: ranks.filter((opponentId) => opponentId !== entryId).map((opponentId, matchIndex) => ({
        matchId: [entryId, opponentId].sort().join('-'),
        teamId: entryId,
        opponentId,
        matchPoints: 2,
        setsFor: 2,
        setsAgainst: 1,
        pointsFor: 40 + matchIndex,
        pointsAgainst: 30,
      })),
    }));
    const rows = createCrossPoolComparisonRows(inputs);
    expect(rows.slice(0, 3).map((row) => row.matchesPlayed)).toEqual([BigInt(2), BigInt(2), BigInt(2)]);
    expect(rows.slice(0, 3).map((row) => row.excludedMatchIds)).toEqual([['A-D'], ['B-D'], ['C-D']]);
    expect(rows[3].matchesPlayed).toBe(BigInt(3));
    expect(rows[3].excludedMatchIds).toEqual([]);
  });

  it('skips a no_data criterion for the entire tied block, preserving a transitive order', () => {
    const finiteButBetterPoints = comparisonRow('A', 'P1', 1, 2, {
      matchPoints: BigInt(4),
      setsFor: BigInt(2),
      setsAgainst: BigInt(1),
      pointsFor: BigInt(100),
      pointsAgainst: BigInt(1),
    });
    const noPointData = comparisonRow('B', 'P2', 1, 1, {
      matchPoints: BigInt(4),
      setsFor: BigInt(2),
      setsAgainst: BigInt(1),
      pointsFor: BigInt(0),
      pointsAgainst: BigInt(0),
    });
    expect(pointRatio(noPointData)).toEqual({ kind: 'no_data' });
    expect(rankCrossPoolCohort([finiteButBetterPoints, noPointData]).map((row) => row.entryId)).toEqual(['B', 'A']);
  });

  it('exposes an explicit decimal-string DTO at the JSON boundary', () => {
    const row = comparisonRow('A', 'P1', 1, 1, {
      matchPoints: BigInt('9007199254740993'),
      pointsFor: BigInt('9007199254740995'),
    });
    const dto = toCrossPoolComparisonRowDto(row);
    expect(dto.matchPoints).toBe('9007199254740993');
    expect(dto.pointsFor).toBe('9007199254740995');
    expect(() => JSON.stringify(dto)).not.toThrow();
    expect(toExactRatioDto(exactRatio(BigInt('9007199254740993'), BigInt('9007199254740994')))).toEqual({
      kind: 'finite',
      numerator: '9007199254740993',
      denominator: '9007199254740994',
    });
  });
});

describe('LPVolley V2 Hard / Medium / Light allocation', () => {
  it.each([
    [22, 6, 'auto', { mode: 'two', hard: 12, medium: 0, light: 10 }],
    [23, 6, 'auto', { mode: 'two', hard: 12, medium: 0, light: 11 }],
    [29, 8, 'three', { mode: 'three', hard: 16, medium: 7, light: 6 }],
    [30, 8, 'auto', { mode: 'two', hard: 16, medium: 0, light: 14 }],
    [31, 8, 'auto', { mode: 'three', hard: 16, medium: 8, light: 7 }],
    [32, 8, 'auto', { mode: 'three', hard: 16, medium: 8, light: 8 }],
    [48, 12, 'auto', { mode: 'three', hard: 16, medium: 16, light: 16 }],
  ] as const)('calculates %i teams / %i groups', (teamCount, groupCount, mode, expected) => {
    expect(calculateTierQuotas(teamCount, groupCount, { mode })).toEqual(expected);
  });

  it('rejects a Hard cap before allocation when it cannot contain mandatory pool qualifiers', () => {
    expect(() => calculateTierQuotas(22, 6, { hardCap: 10 })).toThrowError(expect.objectContaining({
      code: 'INVALID_HARD_CAP_FOR_GROUPS',
      details: expect.objectContaining({ minimumHardCap: 12, requiredPoolRanks: [1, 2] }),
    } satisfies Partial<SportsDomainError>));
    expect(() => calculateTierQuotas(48, 12, { hardCap: 10 })).toThrowError(expect.objectContaining({
      code: 'INVALID_HARD_CAP_FOR_GROUPS',
      details: expect.objectContaining({ minimumHardCap: 12, requiredPoolRanks: [1] }),
    } satisfies Partial<SportsDomainError>));
  });

  it('supports exact pre-lock quotas while rejecting omissions and singleton brackets', () => {
    expect(calculateTierQuotas(29, 8, {
      mode: 'auto',
      quotas: { hard: 16, medium: 7, light: 6 },
    })).toEqual({ mode: 'three', hard: 16, medium: 7, light: 6 });

    expect(() => calculateTierQuotas(29, 8, {
      quotas: { hard: 16, medium: 6, light: 6 },
    })).toThrowError(expect.objectContaining({ code: 'TIER_QUOTAS_TEAM_COUNT_MISMATCH' }));
    expect(() => calculateTierQuotas(29, 8, {
      quotas: { hard: 16, medium: 12, light: 1 },
    })).toThrowError(expect.objectContaining({
      code: 'SINGLETON_TIER_REQUIRES_PLACEMENT',
      details: expect.objectContaining({ singletonTiers: ['light'] }),
    }));
    expect(() => calculateTierQuotas(22, 6, {
      quotas: { hard: 13, medium: 0, light: 9 },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_HARD_QUOTA_FOR_GROUPS' }));
  });

  it('takes all firsts/seconds for up to eight groups and never fills Hard with thirds', () => {
    const rows = Array.from({ length: 6 }, (_, groupIndex) =>
      Array.from({ length: groupIndex < 4 ? 4 : 3 }, (_, rankIndex) => comparisonRow(
        `P${groupIndex + 1}T${rankIndex + 1}`,
        `P${groupIndex + 1}`,
        rankIndex + 1,
        groupIndex * 4 + rankIndex + 1,
      )),
    ).flat();
    const allocation = allocateTiers(rows, 6);
    expect(allocation.hard).toHaveLength(12);
    expect(allocation.hard.every((row) => row.poolRank <= 2)).toBe(true);
    expect(allocation.light).toHaveLength(10);
    expect(() => JSON.stringify(toTierAllocationDto(allocation))).not.toThrow();
  });

  it('takes all winners then only the best runners-up when there are more than eight groups', () => {
    const rows = Array.from({ length: 12 }, (_, groupIndex) =>
      Array.from({ length: 4 }, (_, rankIndex) => comparisonRow(
        `P${groupIndex + 1}T${rankIndex + 1}`,
        `P${groupIndex + 1}`,
        rankIndex + 1,
        groupIndex * 4 + rankIndex + 1,
        { matchPoints: BigInt(100 - groupIndex - rankIndex * 20) },
      )),
    ).flat();
    const allocation = allocateTiers(rows, 12);
    expect(allocation.hard.filter((row) => row.poolRank === 1)).toHaveLength(12);
    expect(allocation.hard.filter((row) => row.poolRank === 2)).toHaveLength(4);
    expect(allocation.medium).toHaveLength(16);
    expect(allocation.light).toHaveLength(16);
  });
});
