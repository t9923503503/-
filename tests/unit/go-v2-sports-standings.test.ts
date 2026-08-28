import { describe, expect, it } from 'vitest';

import {
  SportsDomainError,
  rankLivePoolStandings,
  rankPoolStandings,
  toPoolStandingInputDto,
  toPoolStandingInputsDto,
  type PoolStandingEntryInput,
  type StandingContribution,
} from '@/lib/go-v2/core';

function contribution(
  matchId: string,
  teamId: string,
  opponentId: string,
  values: Partial<Omit<StandingContribution, 'matchId' | 'teamId' | 'opponentId'>> = {},
): StandingContribution {
  return {
    matchId,
    teamId,
    opponentId,
    matchPoints: 0,
    setsFor: 0,
    setsAgainst: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    ...values,
  };
}

describe('LPVolley V2 internal pool standings', () => {
  it('ranks a complete pool and preserves technical 42/0 as exact infinity', () => {
    const entries: PoolStandingEntryInput[] = [
      {
        entryId: 'A',
        initialSeed: 1,
        ledger: [
          contribution('A-B', 'A', 'B', { matchPoints: 2, setsFor: 2, pointsFor: 42 }),
          contribution('A-C', 'A', 'C', {
            matchPoints: BigInt('9007199254740993'),
            setsFor: 2,
            pointsFor: 42,
          }),
        ],
      },
      {
        entryId: 'B',
        initialSeed: 2,
        ledger: [
          contribution('A-B', 'B', 'A', { setsAgainst: 2, pointsAgainst: 42 }),
          contribution('B-C', 'B', 'C', { matchPoints: 2, setsFor: 1, pointsFor: 21, pointsAgainst: 15 }),
        ],
      },
      {
        entryId: 'C',
        initialSeed: 3,
        ledger: [
          contribution('A-C', 'C', 'A', { setsAgainst: 2, pointsAgainst: 42 }),
          contribution('B-C', 'C', 'B', { setsAgainst: 1, pointsFor: 15, pointsAgainst: 21 }),
        ],
      },
    ];

    const ranked = rankPoolStandings({ poolId: 'P1', poolSize: 3, entries });
    expect(ranked.map((row) => [row.entryId, row.poolRank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);

    const dto = toPoolStandingInputDto(ranked[0]);
    expect(dto.totals.matchPoints).toBe('9007199254740995');
    expect(dto.ratios.setRatio).toEqual({ kind: 'infinity' });
    expect(dto.ratios.rallyPointRatio).toEqual({ kind: 'infinity' });
    expect(() => JSON.stringify(toPoolStandingInputsDto(ranked))).not.toThrow();
  });

  it('skips a no_data set ratio for the whole tied block before comparing rally ratios', () => {
    const entries: PoolStandingEntryInput[] = [
      {
        entryId: 'A',
        initialSeed: 1,
        ledger: [
          contribution('A-B', 'A', 'B', { matchPoints: 2, setsFor: 2, pointsFor: 10, pointsAgainst: 100 }),
          contribution('A-C', 'A', 'C', { setsFor: 2, pointsFor: 10, pointsAgainst: 100 }),
        ],
      },
      {
        entryId: 'B',
        initialSeed: 2,
        ledger: [
          contribution('A-B', 'B', 'A'),
          contribution('B-C', 'B', 'C', { matchPoints: 2, pointsFor: 50, pointsAgainst: 50 }),
        ],
      },
      {
        entryId: 'C',
        initialSeed: 3,
        ledger: [
          contribution('A-C', 'C', 'A', { matchPoints: 2, setsFor: 1, setsAgainst: 2, pointsFor: 100, pointsAgainst: 10 }),
          contribution('B-C', 'C', 'B', { setsFor: 1, setsAgainst: 2, pointsFor: 100, pointsAgainst: 10 }),
        ],
      },
    ];

    const ranked = rankPoolStandings({ poolId: 'P1', poolSize: 3, entries });
    expect(toPoolStandingInputDto(ranked.find((row) => row.entryId === 'B')!).ratios.setRatio)
      .toEqual({ kind: 'no_data' });
    // A would win on set ratio, but B's 0/0 disables sets for A/B/C; rallies decide.
    expect(ranked.map((row) => row.entryId)).toEqual(['C', 'B', 'A']);
  });

  it('uses match points per match only when explicitly selected', () => {
    const entries: PoolStandingEntryInput[] = [
      {
        entryId: 'A',
        initialSeed: 1,
        ledger: [
          contribution('A-B', 'A', 'B', { matchPoints: 2, setsFor: 1, pointsFor: 21, pointsAgainst: 15 }),
          contribution('A-C', 'A', 'C', { matchPoints: 1, setsFor: 1, setsAgainst: 1, pointsFor: 20, pointsAgainst: 20 }),
        ],
      },
      {
        entryId: 'B',
        initialSeed: 2,
        ledger: [
          contribution('A-B', 'B', 'A', { counted: false, setsAgainst: 1, pointsFor: 15, pointsAgainst: 21 }),
          contribution('B-C', 'B', 'C', { matchPoints: 2, setsFor: 1, pointsFor: 21, pointsAgainst: 10 }),
        ],
      },
      {
        entryId: 'C',
        initialSeed: 3,
        ledger: [
          contribution('A-C', 'C', 'A', { matchPoints: 1, setsFor: 1, setsAgainst: 1, pointsFor: 20, pointsAgainst: 20 }),
          contribution('B-C', 'C', 'B', { setsAgainst: 1, pointsFor: 10, pointsAgainst: 21 }),
        ],
      },
    ];

    const defaultRanking = rankPoolStandings({ poolId: 'P1', poolSize: 3, entries });
    const normalizedRanking = rankPoolStandings(
      { poolId: 'P1', poolSize: 3, entries },
      { matchPointsMode: 'per_match' },
    );
    expect(defaultRanking.slice(0, 2).map((row) => row.entryId)).toEqual(['A', 'B']);
    expect(normalizedRanking.slice(0, 2).map((row) => row.entryId)).toEqual(['B', 'A']);
  });

  it('rejects incomplete or non-reciprocal full round-robin ledgers', () => {
    const incomplete: PoolStandingEntryInput[] = [
      { entryId: 'A', initialSeed: 1, ledger: [contribution('A-B', 'A', 'B')] },
      {
        entryId: 'B',
        initialSeed: 2,
        ledger: [contribution('A-B', 'B', 'A'), contribution('B-C', 'B', 'C')],
      },
      {
        entryId: 'C',
        initialSeed: 3,
        ledger: [contribution('A-C', 'C', 'A'), contribution('B-C', 'C', 'B')],
      },
    ];

    expect(() => rankPoolStandings({ poolId: 'P1', poolSize: 3, entries: incomplete }))
      .toThrowError(SportsDomainError);
    try {
      rankPoolStandings({ poolId: 'P1', poolSize: 3, entries: incomplete });
    } catch (error) {
      expect((error as SportsDomainError).code).toBe('INCOMPLETE_POOL_LEDGER');
    }

    const nonReciprocal = incomplete.map((entry) => ({
      ...entry,
      ledger: entry.entryId === 'A'
        ? [contribution('A-B', 'A', 'B'), contribution('A-C-WRONG', 'A', 'C')]
        : entry.ledger,
    }));
    expect(() => rankPoolStandings({ poolId: 'P1', poolSize: 3, entries: nonReciprocal }))
      .toThrowError(expect.objectContaining({ code: 'INCONSISTENT_POOL_MATCH_LEDGER' }));
  });

  it('ranks a partial live ledger and uses exact no_data then seed fallback for idle teams', () => {
    const entries: PoolStandingEntryInput[] = [
      {
        entryId: 'A',
        initialSeed: 3,
        ledger: [contribution('A-B', 'A', 'B', {
          matchPoints: BigInt('9007199254740993'),
          setsFor: 1,
          pointsFor: 21,
          pointsAgainst: 19,
        })],
      },
      {
        entryId: 'B',
        initialSeed: 2,
        ledger: [contribution('A-B', 'B', 'A', {
          matchPoints: 1,
          setsAgainst: 1,
          pointsFor: 19,
          pointsAgainst: 21,
        })],
      },
      { entryId: 'C', initialSeed: 1, ledger: [] },
    ];

    const ranked = rankLivePoolStandings({ poolId: 'P1', poolSize: 3, entries });
    expect(ranked.map((row) => row.entryId)).toEqual(['A', 'B', 'C']);
    expect(toPoolStandingInputDto(ranked[0]).totals.matchPoints).toBe('9007199254740993');

    const idle = rankLivePoolStandings({
      poolId: 'P2',
      poolSize: 3,
      entries: entries.map((entry) => ({ ...entry, ledger: [] })),
    });
    expect(idle.map((row) => row.entryId)).toEqual(['C', 'B', 'A']);
    expect(toPoolStandingInputDto(idle[0]).ratios.setRatio).toEqual({ kind: 'no_data' });
    expect(toPoolStandingInputDto(idle[0]).ratios.rallyPointRatio).toEqual({ kind: 'no_data' });
  });

  it('fails closed when a live completed match has only one contribution', () => {
    const entries: PoolStandingEntryInput[] = [
      { entryId: 'A', initialSeed: 1, ledger: [contribution('A-B', 'A', 'B', { matchPoints: 2 })] },
      { entryId: 'B', initialSeed: 2, ledger: [] },
      { entryId: 'C', initialSeed: 3, ledger: [] },
    ];

    expect(() => rankLivePoolStandings({ poolId: 'P1', poolSize: 3, entries }))
      .toThrowError(expect.objectContaining({ code: 'INCONSISTENT_POOL_MATCH_LEDGER' }));
  });
});
