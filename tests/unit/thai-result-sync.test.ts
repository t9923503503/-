import { describe, expect, it } from 'vitest';
import { buildThaiTournamentResultRows } from '../../web/lib/thai-live/sync-tournament-results';
import type {
  ThaiOperatorCourtRoundView,
  ThaiOperatorRoundView,
  ThaiStandingsRow,
  ThaiZoneKey,
} from '../../web/lib/thai-live/types';

function standingsRow(input: {
  id: string;
  name?: string;
  place: number;
  points: number;
  wins: number;
  diff: number;
  balls: number;
  role?: 'primary' | 'secondary';
}): ThaiStandingsRow {
  return {
    playerId: input.id,
    playerName: input.name ?? input.id,
    role: input.role ?? 'primary',
    pool: input.role ?? 'all',
    poolLabel: 'Test',
    place: input.place,
    tourDiffs: [],
    totalDiff: input.diff,
    pointsP: input.points,
    kef: 1,
    totalScored: input.balls,
    wins: input.wins,
    tourMatchups: [],
  };
}

function court(input: {
  id: string;
  label: string;
  rows: ThaiStandingsRow[];
}): ThaiOperatorCourtRoundView {
  return {
    courtId: input.id,
    courtNo: 1,
    label: input.label,
    pin: '1111',
    judgeUrl: '/judge',
    currentTourNo: 4,
    currentTourStatus: 'finished',
    playerNames: input.rows.map((row) => row.playerName),
    tours: [],
    standingsGroups: [{ pool: 'all', label: 'Test', rows: input.rows }],
  };
}

function round(input: {
  type: 'r1' | 'r2';
  status?: 'live' | 'finished';
  courts: ThaiOperatorCourtRoundView[];
  zones?: Array<{ courtId: string; zone: ThaiZoneKey }>;
}): ThaiOperatorRoundView {
  return {
    roundId: input.type,
    roundNo: input.type === 'r2' ? 2 : 1,
    roundType: input.type,
    roundStatus: input.status ?? 'finished',
    currentTourNo: 4,
    tourCount: 4,
    courts: input.courts,
    zones: (input.zones ?? []).map(({ courtId, zone }, index) => ({
      zone,
      label: zone,
      courtId,
      courtNo: index + 1,
      courtLabel: zone,
      pin: '1111',
      judgeUrl: '/judge',
      playerNames: [],
    })),
  };
}

describe('Thai tournament result sync rows', () => {
  it('keeps official R2 placement while summing stats from every finished round', () => {
    const r1 = round({
      type: 'r1',
      courts: [
        court({
          id: 'r1-court',
          label: 'R1',
          rows: [
            standingsRow({ id: 'a', name: 'Alpha', place: 2, points: 40, wins: 2, diff: 3, balls: 55 }),
            standingsRow({ id: 'b', name: 'Beta', place: 1, points: 45, wins: 3, diff: 7, balls: 58 }),
          ],
        }),
      ],
    });
    const r2 = round({
      type: 'r2',
      courts: [
        court({
          id: 'hard-court',
          label: 'HARD',
          rows: [standingsRow({ id: 'a', name: 'Alpha', place: 1, points: 47, wins: 4, diff: 17, balls: 65 })],
        }),
        court({
          id: 'advance-court',
          label: 'ADVANCE',
          rows: [standingsRow({ id: 'b', name: 'Beta', place: 2, points: 30, wins: 2, diff: -2, balls: 52 })],
        }),
      ],
      zones: [
        { courtId: 'hard-court', zone: 'hard' },
        { courtId: 'advance-court', zone: 'advance' },
      ],
    });

    const { results, roundUsed } = buildThaiTournamentResultRows({
      rounds: [r1, r2],
      variant: 'MM',
      preset: 'legacy',
      genderByPlayerId: new Map([
        ['a', 'M'],
        ['b', 'M'],
      ]),
    });

    expect(roundUsed).toBe('r2');
    expect(results.find((row) => row.playerId === 'a')).toMatchObject({
      placement: 1,
      points: 87,
      wins: 6,
      diff: 20,
      balls: 120,
      ratingPts: 100,
    });
    expect(results.find((row) => row.playerId === 'b')).toMatchObject({
      placement: 10,
      points: 75,
      wins: 5,
      diff: 5,
      balls: 110,
      ratingPts: 60,
    });
  });

  it('preserves a positive historical award and ignores non-positive stored values', () => {
    const r2 = round({
      type: 'r2',
      courts: [
        court({
          id: 'hard-court',
          label: 'HARD',
          rows: [standingsRow({ id: 'a', place: 1, points: 47, wins: 4, diff: 17, balls: 60 })],
        }),
        court({
          id: 'advance-court',
          label: 'ADVANCE',
          rows: [standingsRow({ id: 'b', place: 1, points: 40, wins: 3, diff: 8, balls: 57 })],
        }),
      ],
      zones: [
        { courtId: 'hard-court', zone: 'hard' },
        { courtId: 'advance-court', zone: 'advance' },
      ],
    });

    const { results } = buildThaiTournamentResultRows({
      rounds: [r2],
      variant: 'MM',
      preset: 'legacy',
      genderByPlayerId: new Map(),
      storedPositiveRatingPtsByPlayerId: new Map([
        ['a', 77],
        ['b', 0],
      ]),
    });

    expect(results.find((row) => row.playerId === 'a')?.ratingPts).toBe(77);
    expect(results.find((row) => row.playerId === 'b')?.ratingPts).toBe(65);
  });

  it('retains the R1-only fallback and its finalized order', () => {
    const r1 = round({
      type: 'r1',
      courts: [
        court({
          id: 'r1-court',
          label: 'R1',
          rows: [
            standingsRow({ id: 'a', place: 1, points: 50, wins: 1, diff: 20, balls: 65 }),
            standingsRow({ id: 'b', place: 2, points: 40, wins: 3, diff: 5, balls: 60 }),
          ],
        }),
      ],
    });

    const { results, roundUsed } = buildThaiTournamentResultRows({
      rounds: [r1],
      variant: 'MM',
      preset: 'legacy',
      genderByPlayerId: new Map(),
      storedPositiveRatingPtsByPlayerId: new Map([['a', 91]]),
    });

    expect(roundUsed).toBe('r1');
    expect(results.map((row) => [row.playerId, row.placement])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(results.find((row) => row.playerId === 'a')?.ratingPts).toBe(91);
  });

  it('rejects a finished round that is missing an official player', () => {
    const r1 = round({
      type: 'r1',
      courts: [
        court({
          id: 'r1-court',
          label: 'R1',
          rows: [standingsRow({ id: 'a', place: 1, points: 40, wins: 3, diff: 5, balls: 60 })],
        }),
      ],
    });
    const r2 = round({
      type: 'r2',
      courts: [
        court({
          id: 'hard-court',
          label: 'HARD',
          rows: [
            standingsRow({ id: 'a', place: 1, points: 47, wins: 4, diff: 17, balls: 65 }),
            standingsRow({ id: 'b', place: 2, points: 40, wins: 3, diff: 8, balls: 60 }),
          ],
        }),
      ],
      zones: [{ courtId: 'hard-court', zone: 'hard' }],
    });

    expect(() =>
      buildThaiTournamentResultRows({
        rounds: [r1, r2],
        variant: 'MM',
        preset: 'legacy',
        genderByPlayerId: new Map(),
      }),
    ).toThrow(/incomplete/i);
  });

  it('rejects the same partial subset when it does not match the authoritative roster', () => {
    const r2 = round({
      type: 'r2',
      courts: [
        court({
          id: 'hard-court',
          label: 'HARD',
          rows: [
            standingsRow({ id: 'a', place: 1, points: 47, wins: 4, diff: 17, balls: 65 }),
            standingsRow({ id: 'b', place: 2, points: 40, wins: 3, diff: 8, balls: 60 }),
          ],
        }),
      ],
      zones: [{ courtId: 'hard-court', zone: 'hard' }],
    });

    expect(() =>
      buildThaiTournamentResultRows({
        rounds: [r2],
        variant: 'MM',
        preset: 'legacy',
        genderByPlayerId: new Map(),
        expectedPlayerIds: new Set(['a', 'b', 'c']),
      }),
    ).toThrow(/roster/i);
  });

  it('rejects duplicate or out-of-range local places in an R2 group', () => {
    const r2 = round({
      type: 'r2',
      courts: [
        court({
          id: 'hard-court',
          label: 'HARD',
          rows: [
            standingsRow({ id: 'a', place: 1, points: 47, wins: 4, diff: 17, balls: 65 }),
            standingsRow({ id: 'b', place: 1, points: 40, wins: 3, diff: 8, balls: 60 }),
          ],
        }),
      ],
      zones: [{ courtId: 'hard-court', zone: 'hard' }],
    });

    expect(() =>
      buildThaiTournamentResultRows({
        rounds: [r2],
        variant: 'MM',
        preset: 'legacy',
        genderByPlayerId: new Map(),
      }),
    ).toThrow(/incomplete/i);
  });

  it('writes MN secondary players to the novice rating pool', () => {
    const r2 = round({
      type: 'r2',
      courts: [
        court({
          id: 'hard-court',
          label: 'HARD',
          rows: [
            standingsRow({ id: 'a', place: 1, points: 47, wins: 4, diff: 17, balls: 65 }),
            standingsRow({
              id: 'b',
              place: 1,
              points: 40,
              wins: 3,
              diff: 8,
              balls: 60,
              role: 'secondary',
            }),
          ],
        }),
      ],
      zones: [{ courtId: 'hard-court', zone: 'hard' }],
    });
    r2.courts[0].standingsGroups = [
      { pool: 'primary', label: 'Pro', rows: [r2.courts[0].standingsGroups[0].rows[0]] },
      { pool: 'secondary', label: 'Novice', rows: [r2.courts[0].standingsGroups[0].rows[1]] },
    ];

    const { results } = buildThaiTournamentResultRows({
      rounds: [r2],
      variant: 'MN',
      preset: 'legacy',
      genderByPlayerId: new Map(),
    });

    expect(results.find((row) => row.playerId === 'a')?.ratingPool).toBe('pro');
    expect(results.find((row) => row.playerId === 'b')?.ratingPool).toBe('novice');
  });

  it.each([
    ['MM', 'hard', 5, 5],
    ['WW', 'advance', 1, 9],
  ] as const)(
    'uses eight-player R2 zone offsets for %s (%s local %i becomes overall %i)',
    (variant, zone, localPlace, expectedPlace) => {
      const r2 = round({
        type: 'r2',
        courts: [
          court({
            id: `${zone}-court`,
            label: zone.toUpperCase(),
            rows: [standingsRow({ id: 'a', place: localPlace, points: 40, wins: 2, diff: 3, balls: 55 })],
          }),
        ],
        zones: [{ courtId: `${zone}-court`, zone }],
      });

      const { results } = buildThaiTournamentResultRows({
        rounds: [r2],
        variant,
        preset: 'legacy',
        genderByPlayerId: new Map(),
      });

      expect(results).toHaveLength(1);
      expect(results[0].placement).toBe(expectedPlace);
    },
  );
});
