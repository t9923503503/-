import { describe, expect, it } from 'vitest';
import { buildPlayGameReport } from '../../web/lib/play-report';

describe('automatic play report', () => {
  it('finds the closest set, best pair and total points', () => {
    const report = buildPlayGameReport({
      version: 2,
      format: 'classic_2x2',
      pairingMode: 'fixed',
      pointLimit: 15,
      matches: [
        { id: 'set-1', teamA: [1, 2], teamB: [3, 4], scoreA: 15, scoreB: 8 },
        { id: 'set-2', teamA: [1, 2], teamB: [3, 4], scoreA: 13, scoreB: 15 },
        { id: 'set-3', teamA: [1, 2], teamB: [3, 4], scoreA: 15, scoreB: 12 },
      ],
    });
    expect(report).toMatchObject({ matchCount: 3, totalPoints: 78, closestMatch: { id: 'set-2', score: '13:15', margin: 2 }, bestPair: [1, 2] });
    expect(report?.leaderIds).toEqual([1, 2]);
  });
});

