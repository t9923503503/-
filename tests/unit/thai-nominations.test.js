import { describe, test, expect } from 'vitest';

import { thaiCalcNominations } from '../../formats/thai/thai-format.js';

describe('thaiCalcNominations (6 algorithms)', () => {
  test('picks correct winners by pts/diff/wins/K/avg pts', () => {
    const r1Stats = [
      { name: 'A', pts: 10, diff: 1, wins: 2, K: 1.1, rPlayed: 2 },
      { name: 'B', pts: 20, diff: 5, wins: 1, K: 0.5, rPlayed: 4 },
    ];

    const r2Stats = [
      { name: 'C', pts: 15, diff: 3, wins: 4, K: 2.0, rPlayed: 1 },
      { name: 'D', pts: 5, diff: 10, wins: 0, K: 0.2, rPlayed: 2 },
    ];

    const nominations = thaiCalcNominations(r1Stats, r2Stats);
    expect(nominations).toHaveLength(6);

    const ids = nominations.map(n => n.id);
    expect(ids).toEqual([
      'mvp_r1',
      'mvp_r2',
      'best_diff',
      'best_wins',
      'best_k',
      'best_avg_pts',
    ]);

    const byId = Object.fromEntries(nominations.map(n => [n.id, n]));

    expect(byId.mvp_r1.winner.name).toBe('B');
    expect(byId.mvp_r2.winner.name).toBe('C');
    expect(byId.best_diff.winner.name).toBe('D');
    expect(byId.best_wins.winner.name).toBe('C');
    expect(byId.best_k.winner.name).toBe('C');
    expect(byId.best_avg_pts.winner.name).toBe('C');
  });
});

