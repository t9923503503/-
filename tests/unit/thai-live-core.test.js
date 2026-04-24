import { describe, expect, test } from 'vitest';

import {
  applyThaiStatTotals,
  buildThaiCourtBootstrapTours,
  buildThaiTourStatDeltas,
  calcThaiKef,
  calcThaiPointsP,
  resolveThaiPointLimitForRound,
  seedThaiRound2Courts,
  splitThaiRosterIntoCourts,
} from '../../web/lib/thai-live/core.ts';

describe('thai-live core scoring', () => {
  test('maps P points to 10/11/12/13 contract', () => {
    expect(calcThaiPointsP(-2)).toBe(0);
    expect(calcThaiPointsP(0)).toBe(0);
    expect(calcThaiPointsP(1)).toBe(10);
    expect(calcThaiPointsP(2)).toBe(11);
    expect(calcThaiPointsP(3)).toBe(12);
    expect(calcThaiPointsP(4)).toBe(12);
    expect(calcThaiPointsP(5)).toBe(13);
  });

  test('buildThaiTourStatDeltas counts all 8 player updates and preserves tour delta', () => {
    const result = buildThaiTourStatDeltas([
      {
        team1: { players: ['p1', 'p2'], score: 15 },
        team2: { players: ['p3', 'p4'], score: 12 },
      },
      {
        team1: { players: ['p5', 'p6'], score: 11 },
        team2: { players: ['p7', 'p8'], score: 14 },
      },
    ]);

    expect(result.tourDelta).toBe(0);
    expect(result.playerUpdates).toHaveLength(8);
    expect(result.playerUpdates.filter((row) => row.delta === 3)).toHaveLength(4);
    expect(result.playerUpdates.filter((row) => row.delta === -3)).toHaveLength(4);
  });

  test('applyThaiStatTotals recalculates kef from updated diff without double increment', () => {
    const next = applyThaiStatTotals(
      { totalDiff: 5, totalScored: 20, pointsP: 12, wins: 1 },
      { delta: 3, scored: 15, pointsP: 12, won: true },
    );

    expect(next.totalDiff).toBe(8);
    expect(next.totalScored).toBe(35);
    expect(next.pointsP).toBe(24);
    expect(next.wins).toBe(2);
    expect(next.kef).toBeCloseTo(calcThaiKef(8), 10);
  });
});

describe('thai-live bootstrap schedule', () => {
  const mixedCourt = [
    { playerId: 'm1', playerName: 'Man 1', gender: 'M' },
    { playerId: 'w1', playerName: 'Woman 1', gender: 'W' },
    { playerId: 'm2', playerName: 'Man 2', gender: 'M' },
    { playerId: 'w2', playerName: 'Woman 2', gender: 'W' },
    { playerId: 'm3', playerName: 'Man 3', gender: 'M' },
    { playerId: 'w3', playerName: 'Woman 3', gender: 'W' },
    { playerId: 'm4', playerName: 'Man 4', gender: 'M' },
    { playerId: 'w4', playerName: 'Woman 4', gender: 'W' },
  ];

  test('buildThaiCourtBootstrapTours is deterministic and yields two matches per tour', () => {
    const first = buildThaiCourtBootstrapTours({
      players: mixedCourt,
      variant: 'MF',
      tourCount: 3,
      seed: 7,
    });
    const second = buildThaiCourtBootstrapTours({
      players: mixedCourt,
      variant: 'MF',
      tourCount: 3,
      seed: 7,
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    for (const tour of first) {
      expect(tour.matches).toHaveLength(2);
      for (const match of tour.matches) {
        expect(match.team1.players).toHaveLength(2);
        expect(match.team2.players).toHaveLength(2);
      }
    }
  });

  test('buildThaiCourtBootstrapTours avoids three-match opponent repeats on a 4-tour MN court', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, index) => ({
        playerId: `pro-${index + 1}`,
        playerName: `Pro ${index + 1}`,
        gender: 'M',
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        playerId: `nov-${index + 1}`,
        playerName: `Nov ${index + 1}`,
        gender: 'W',
      })),
    ];

    const tours = buildThaiCourtBootstrapTours({
      players,
      variant: 'MN',
      tourCount: 4,
      seed: 2026,
    });
    const opponentCounts = new Map();

    for (const tour of tours) {
      for (const match of tour.matches) {
        for (const left of match.team1.players) {
          for (const right of match.team2.players) {
            const key = [left.playerId, right.playerId].sort().join('|');
            opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }

    expect(Math.max(...opponentCounts.values())).toBeLessThanOrEqual(2);
  });

  test('splitThaiRosterIntoCourts keeps M/N pools by roster order', () => {
    const roster = [
      ...Array.from({ length: 8 }, (_, index) => ({
        playerId: `pro-${index + 1}`,
        playerName: `Pro ${index + 1}`,
        gender: 'M',
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        playerId: `nov-${index + 1}`,
        playerName: `Nov ${index + 1}`,
        gender: 'W',
      })),
    ];

    const courts = splitThaiRosterIntoCourts({
      players: roster,
      variant: 'MN',
      courts: 2,
    });

    expect(courts).toHaveLength(2);
    expect(courts[0].players.map((player) => player.playerId)).toEqual([
      'pro-1',
      'pro-2',
      'pro-3',
      'pro-4',
      'nov-1',
      'nov-2',
      'nov-3',
      'nov-4',
    ]);
    expect(courts[1].players.map((player) => player.playerId)).toEqual([
      'pro-5',
      'pro-6',
      'pro-7',
      'pro-8',
      'nov-5',
      'nov-6',
      'nov-7',
      'nov-8',
    ]);
  });

  test('seedThaiRound2Courts uses global M/N rankings for 2-court hard/advance zones', () => {
    const playerById = new Map();
    const makeRow = (playerId, role, pointsP, kef, totalScored, place) => ({
      playerId,
      playerName: playerId,
      role,
      pool: role,
      poolLabel: role === 'primary' ? 'Профи' : 'Новички',
      place,
      tourDiffs: [],
      totalDiff: 0,
      pointsP,
      kef,
      totalScored,
      wins: 0,
    });

    const r1Courts = Array.from({ length: 2 }, (_, courtIndex) => {
      const primaryRows = [
        makeRow(`p-${courtIndex + 1}-a`, 'primary', 90 - courtIndex, 2.4 - courtIndex * 0.01, 80 - courtIndex, 1),
        makeRow(`p-${courtIndex + 1}-b`, 'primary', 70 - courtIndex, 2.0 - courtIndex * 0.01, 60 - courtIndex, 2),
        makeRow(`p-${courtIndex + 1}-c`, 'primary', 50 - courtIndex, 1.6 - courtIndex * 0.01, 40 - courtIndex, 3),
        makeRow(`p-${courtIndex + 1}-d`, 'primary', 30 - courtIndex, 1.2 - courtIndex * 0.01, 20 - courtIndex, 4),
      ];
      const secondaryRows = [
        makeRow(`s-${courtIndex + 1}-a`, 'secondary', 89 - courtIndex, 2.39 - courtIndex * 0.01, 79 - courtIndex, 1),
        makeRow(`s-${courtIndex + 1}-b`, 'secondary', 69 - courtIndex, 1.99 - courtIndex * 0.01, 59 - courtIndex, 2),
        makeRow(`s-${courtIndex + 1}-c`, 'secondary', 49 - courtIndex, 1.59 - courtIndex * 0.01, 39 - courtIndex, 3),
        makeRow(`s-${courtIndex + 1}-d`, 'secondary', 29 - courtIndex, 1.19 - courtIndex * 0.01, 19 - courtIndex, 4),
      ];

      for (const row of primaryRows) {
        playerById.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, gender: 'M' });
      }
      for (const row of secondaryRows) {
        playerById.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, gender: 'W' });
      }

      return {
        courtId: `court-${courtIndex + 1}`,
        courtNo: courtIndex + 1,
        courtLabel: `Court ${courtIndex + 1}`,
        groups: [
          { pool: 'primary', label: 'Профи', rows: primaryRows },
          { pool: 'secondary', label: 'Новички', rows: secondaryRows },
        ],
      };
    });

    const zones = seedThaiRound2Courts({
      variant: 'MN',
      r1Courts,
      playerById,
    });

    expect(zones.map((zone) => zone.zone)).toEqual(['hard', 'advance']);
    expect(zones[0].players.map((player) => player.playerId)).toEqual([
      'p-1-a',
      'p-2-a',
      'p-1-b',
      'p-2-b',
      's-1-a',
      's-2-a',
      's-1-b',
      's-2-b',
    ]);
    expect(zones[1].players.map((player) => player.playerId)).toEqual([
      'p-1-c',
      'p-2-c',
      'p-1-d',
      'p-2-d',
      's-1-c',
      's-2-c',
      's-1-d',
      's-2-d',
    ]);
  });

  test('seedThaiRound2Courts keeps MF as global dual-pool buckets for 3 courts', () => {
    const playerById = new Map();
    const r1Courts = Array.from({ length: 3 }, (_, courtIndex) => {
      const primaryRows = Array.from({ length: 4 }, (_, rowIndex) => {
        const playerId = `m-${courtIndex + 1}-${rowIndex + 1}`;
        playerById.set(playerId, { playerId, playerName: playerId, gender: 'M' });
        return {
          playerId,
          playerName: playerId,
          role: 'primary',
          pool: 'primary',
          poolLabel: 'Мужчины',
          place: rowIndex + 1,
          tourDiffs: [],
          totalDiff: 0,
          pointsP: 100 - rowIndex * 10 - courtIndex,
          kef: 2 - rowIndex * 0.1 - courtIndex * 0.01,
          totalScored: 80 - rowIndex * 10 - courtIndex,
          wins: 0,
        };
      });
      const secondaryRows = Array.from({ length: 4 }, (_, rowIndex) => {
        const playerId = `w-${courtIndex + 1}-${rowIndex + 1}`;
        playerById.set(playerId, { playerId, playerName: playerId, gender: 'W' });
        return {
          playerId,
          playerName: playerId,
          role: 'secondary',
          pool: 'secondary',
          poolLabel: 'Женщины',
          place: rowIndex + 1,
          tourDiffs: [],
          totalDiff: 0,
          pointsP: 99 - rowIndex * 10 - courtIndex,
          kef: 1.99 - rowIndex * 0.1 - courtIndex * 0.01,
          totalScored: 79 - rowIndex * 10 - courtIndex,
          wins: 0,
        };
      });

      return {
        courtId: `court-mf-${courtIndex + 1}`,
        courtNo: courtIndex + 1,
        courtLabel: `Court ${courtIndex + 1}`,
        groups: [
          { pool: 'primary', label: 'Мужчины', rows: primaryRows },
          { pool: 'secondary', label: 'Женщины', rows: secondaryRows },
        ],
      };
    });

    const zones = seedThaiRound2Courts({
      variant: 'MF',
      r1Courts,
      playerById,
    });

    expect(zones.map((zone) => zone.zone)).toEqual(['hard', 'advance', 'medium']);
    expect(zones[0].players).toHaveLength(8);
    expect(zones[1].players).toHaveLength(8);
    expect(zones[2].players).toHaveLength(8);
    expect(zones[0].players.slice(0, 4).every((player) => player.gender === 'M')).toBe(true);
    expect(zones[0].players.slice(4).every((player) => player.gender === 'W')).toBe(true);
    expect(zones[2].players.slice(0, 4).every((player) => player.gender === 'M')).toBe(true);
    expect(zones[2].players.slice(4).every((player) => player.gender === 'W')).toBe(true);
  });

  test('seedThaiRound2Courts uses global single-pool buckets for 3 courts', () => {
    const playerById = new Map();
    const r1Courts = Array.from({ length: 3 }, (_, courtIndex) => {
      const rows = Array.from({ length: 8 }, (_, rowIndex) => {
        const playerId = `mm-${courtIndex + 1}-${rowIndex + 1}`;
        playerById.set(playerId, { playerId, playerName: playerId, gender: 'M' });
        return {
          playerId,
          playerName: playerId,
          role: 'primary',
          pool: 'all',
          poolLabel: 'Общий',
          place: rowIndex + 1,
          tourDiffs: [],
          totalDiff: 0,
          pointsP: 100 - rowIndex - courtIndex,
          kef: 2 - rowIndex * 0.01 - courtIndex * 0.001,
          totalScored: 80 - rowIndex - courtIndex,
          wins: 0,
        };
      });

      return {
        courtId: `court-mm-${courtIndex + 1}`,
        courtNo: courtIndex + 1,
        courtLabel: `Court ${courtIndex + 1}`,
        groups: [{ pool: 'all', label: 'Общий', rows }],
      };
    });

    const zones = seedThaiRound2Courts({
      variant: 'MM',
      r1Courts,
      playerById,
    });

    expect(zones.map((zone) => zone.zone)).toEqual(['hard', 'advance', 'medium']);
    expect(zones[0].players).toHaveLength(8);
    expect(zones[1].players).toHaveLength(8);
    expect(zones[2].players).toHaveLength(8);
  });
});

describe('resolveThaiPointLimitForRound', () => {
  test('uses per-round keys with fallback to thaiPointLimit', () => {
    expect(resolveThaiPointLimitForRound({ thaiPointLimit: 15 }, 'r1')).toBe(15);
    expect(
      resolveThaiPointLimitForRound({ thaiPointLimitR1: 12, thaiPointLimitR2: 18, thaiPointLimit: 15 }, 'r1'),
    ).toBe(12);
    expect(
      resolveThaiPointLimitForRound({ thaiPointLimitR1: 12, thaiPointLimitR2: 18, thaiPointLimit: 15 }, 'r2'),
    ).toBe(18);
    expect(resolveThaiPointLimitForRound({ thaiPointLimitR2: 18, thaiPointLimit: 15 }, 'r1')).toBe(15);
  });
});
