import { describe, test, expect } from 'vitest';

import {
  thaiCalcPoints,
  thaiCalcCoef,
  thaiZeroSumMatch,
  thaiZeroSumTour,
  thaiTiebreak,
  thaiCalcStandings,
} from '../../formats/thai/thai-format.js';

describe('thaiCalcPoints', () => {
  test('maps diff -> points by ThaiVolley32 rules', () => {
    expect(thaiCalcPoints(-1)).toBe(0);
    expect(thaiCalcPoints(0)).toBe(0);
    expect(thaiCalcPoints(1)).toBe(1);
    expect(thaiCalcPoints(2)).toBe(1);
    expect(thaiCalcPoints(3)).toBe(2);
    expect(thaiCalcPoints(6)).toBe(2);
    expect(thaiCalcPoints(7)).toBe(3);
    expect(thaiCalcPoints(99)).toBe(3);
  });
});

describe('thaiCalcCoef', () => {
  test('coef for diffSum=0 is 1', () => {
    expect(thaiCalcCoef([0])).toBe(1);
    expect(thaiCalcCoef([])).toBe(1);
  });

  test('coef for negative diffSum is below 1', () => {
    expect(thaiCalcCoef([1, -3])).toBeCloseTo(58 / 62, 10);
  });

  test('coef protects division by zero near denom=0', () => {
    expect(thaiCalcCoef([60])).toBe(999.99);
    expect(thaiCalcCoef([-60])).toBeCloseTo(0 / 120, 10);
  });
});

describe('thaiZeroSumMatch / thaiZeroSumTour', () => {
  test('thaiZeroSumMatch checks diff1 + diff2 == 0', () => {
    expect(thaiZeroSumMatch(5, -5)).toBe(true);
    expect(thaiZeroSumMatch(1, -1)).toBe(true);
    expect(thaiZeroSumMatch(1, 1)).toBe(false);
  });

  test('thaiZeroSumTour checks sum(diffs) == 0', () => {
    expect(thaiZeroSumTour([1, -1, 0])).toBe(true);
    expect(thaiZeroSumTour([2, -1])).toBe(false);
    expect(thaiZeroSumTour([])).toBe(true);
  });
});

describe('thaiTiebreak comparator', () => {
  test('sorts by win percentage, then tournament points, then diff and ratio', () => {
    const a = { idx: 0, wins: 2, rPlayed: 4, points: 7, diff: 10, pointRatio: 10 };
    const b = { idx: 1, wins: 3, rPlayed: 4, points: 6, diff: -10, pointRatio: 0.5 };
    const c = { idx: 2, wins: 2, rPlayed: 4, points: 6, diff: 20, pointRatio: 20 };
    const sorted = [a, b, c].sort(thaiTiebreak);
    expect(sorted.map((row) => row.idx)).toEqual([1, 0, 2]);
  });
});

describe('thaiCalcStandings', () => {
  test('computes tournament points, ratios and primary ranking order', () => {
    const group = {
      players: [
        { idx: 0, own: [3, 0, 5, 10], opp: [1, 1, 5, 2] },
        { idx: 1, own: [2, 2, 5, 9], opp: [1, 1, 5, 3] },
      ],
      playerKeys: ['A', 'B'],
    };

    const res = thaiCalcStandings(group);
    expect(res).toHaveLength(2);

    expect(res[0].idx).toBe(1);
    expect(res[0].place).toBe(1);
    expect(res[0].wins).toBe(3);
    expect(res[0].points).toBe(7);
    expect(res[0].pts).toBe(7);
    expect(res[0].winPercentage).toBeCloseTo(0.75, 10);

    expect(res[1].idx).toBe(0);
    expect(res[1].place).toBe(2);
    expect(res[1].wins).toBe(2);
    expect(res[1].points).toBe(6);
    expect(res[1].pointRatio).toBeCloseTo(2, 10);
  });

  test('uses direct head-to-head when two players tie on primary metrics', () => {
    const res = thaiCalcStandings({
      playerKeys: ['A', 'B'],
      ownScores: [
        [6, 4],
        [4, 8],
      ],
      oppScores: [
        [4, 6],
        [6, 6],
      ],
      opponents: [
        ['B', 'X'],
        ['A', 'Y'],
      ],
    });

    expect(res.map((row) => row.playerKey)).toEqual(['A', 'B']);
    expect(res.meta.logs.some((entry) => entry.type === 'head_to_head')).toBe(true);
  });

  test('uses mini-league for 3-way ties and keeps logs', () => {
    const res = thaiCalcStandings({
      playerKeys: ['A', 'B', 'C'],
      ownScores: [
        [6, 4, 4, 2],
        [3, 7, 4, 2],
        [5, 4, 5, 2],
      ],
      oppScores: [
        [3, 5, 3, 5],
        [6, 4, 2, 4],
        [4, 7, 2, 3],
      ],
      opponents: [
        ['B', 'C', 'D1', 'D2'],
        ['A', 'C', 'D3', 'D4'],
        ['A', 'B', 'D5', 'D6'],
      ],
    });

    expect(res.map((row) => row.playerKey)).toEqual(['A', 'B', 'C']);
    expect(res[0].miniPointDiff).toBe(2);
    expect(res.meta.logs.some((entry) => entry.type === 'mini_league')).toBe(true);
  });

  test('uses persisted draw orders for exact ties', () => {
    const res = thaiCalcStandings({
      playerKeys: ['A', 'B'],
      ownScores: [
        [5, 4],
        [5, 4],
      ],
      oppScores: [
        [3, 6],
        [3, 6],
      ],
      opponents: [
        ['X', 'Y'],
        ['U', 'V'],
      ],
      drawGroups: {
        'head-to-head-draw:A||B': {
          A: 2,
          B: 1,
        },
      },
    });

    expect(res.map((row) => row.playerKey)).toEqual(['B', 'A']);
    expect(res[0].tiebreakerOrder).toBe(1);
    expect(res[1].tiebreakerOrder).toBe(2);
    expect(res.meta.logs.some((entry) => entry.type === 'draw')).toBe(true);
  });
});
