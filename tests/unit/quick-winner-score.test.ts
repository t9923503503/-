import { describe, expect, it } from 'vitest';
import { buildQuickWinnerScore, parseQuickWinnerScore } from '../../web/lib/quick-winner-score';

describe('quick winner score', () => {
  it('builds a two-tap score from the winner and losing points', () => {
    expect(buildQuickWinnerScore(15, 'B', 8)).toEqual({
      winner: 'B',
      loserPoints: 8,
      scoreA: 8,
      scoreB: 15,
    });
  });

  it('normalizes touch input to the selected target', () => {
    expect(buildQuickWinnerScore(11, 'A', -3)).toMatchObject({ scoreA: 11, scoreB: 0 });
    expect(buildQuickWinnerScore(11, 'A', 99)).toMatchObject({ scoreA: 11, scoreB: 10 });
  });

  it('recognizes only strict quick scores and leaves deuce scores for full entry', () => {
    expect(parseQuickWinnerScore(21, 21, 17)).toMatchObject({ winner: 'A', loserPoints: 17 });
    expect(parseQuickWinnerScore(21, 8, 21)).toMatchObject({ winner: 'B', loserPoints: 8 });
    expect(parseQuickWinnerScore(21, 22, 20)).toBeNull();
    expect(parseQuickWinnerScore(21, 21, 21)).toBeNull();
  });
});
