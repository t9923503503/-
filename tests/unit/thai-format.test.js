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
    // diffSum = -2 => (60-2)/(60+2) = 58/62
    expect(thaiCalcCoef([1, -3])).toBeCloseTo(58 / 62, 10);
  });

  test('coef protects division by zero near denom=0', () => {
    expect(thaiCalcCoef([60])).toBe(999.99);
    expect(thaiCalcCoef([-60])).toBeCloseTo((60 - 60) / (60 + 60), 10); // 0/120=0
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
  test('sorts by wins desc, then diff desc, then pts desc', () => {
    const a = { idx: 0, wins: 2, diff: 10, pts: 1, K: 1, balls: 1 };
    const b = { idx: 1, wins: 3, diff: 0, pts: 999, K: 1, balls: 1 };
    const sorted = [a, b].sort(thaiTiebreak);
    expect(sorted[0].idx).toBe(1);
  });
});

describe('thaiCalcStandings', () => {
  test('computes wins/diff/pts/K/balls and sorts properly', () => {
    const group = {
      players: [
        // diffs: [2, -1, 0, 8] => pts: 1+0+0+3=4, wins:2, diff:9, balls:18
        { idx: 0, own: [3, 0, 5, 10], opp: [1, 1, 5, 2] },
        // diffs: [1, 1, 0, 6] => pts: 1+1+0+2=4, wins:3, diff:8, balls:18
        { idx: 1, own: [2, 2, 5, 9], opp: [1, 1, 5, 3] },
      ],
    };

    const res = thaiCalcStandings(group);
    expect(res).toHaveLength(2);

    expect(res[0].idx).toBe(1);
    expect(res[0].place).toBe(1);
    expect(res[0].wins).toBe(3);
    expect(res[0].diff).toBe(8);
    expect(res[0].pts).toBe(4);

    expect(res[1].idx).toBe(0);
    expect(res[1].place).toBe(2);
    expect(res[1].wins).toBe(2);
  });

  test('assigns tied places when all tie-break inputs match', () => {
    const base = { idx: 0, own: [1, 1, 1, 7], opp: [0, 0, 1, 0] }; // diffs [1,1,0,7]
    const group = {
      players: [
        base,
        { idx: 1, own: [...base.own], opp: [...base.opp] },
      ],
    };
    const res = thaiCalcStandings(group);
    expect(res[0].place).toBe(1);
    expect(res[1].place).toBe(1);
    expect(res[1].tied).toBe(true);
  });
});

