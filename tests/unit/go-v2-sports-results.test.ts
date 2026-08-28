import { describe, expect, it } from 'vitest';

import {
  completeIncompleteMatchScore,
  createMatchRule,
  SportsDomainError,
} from '../../web/lib/go-v2/core';

describe('GO V2 incomplete result completion', () => {
  it('awards a single set to 21 while preserving the injured side actual points', () => {
    const result = completeIncompleteMatchScore(
      createMatchRule('single_21'),
      [{ teamA: 13, teamB: 10 }],
      'B',
    );

    expect(result.actualSets).toEqual([{ setNo: 1, teamA: 13, teamB: 10 }]);
    expect(result.declaredSets).toEqual([{ setNo: 1, teamA: 13, teamB: 21 }]);
    expect(result).toMatchObject({ actualRalliesA: 13, actualRalliesB: 10 });
    expect(result).toMatchObject({ setsA: 0, setsB: 1, ralliesA: 13, ralliesB: 21 });
  });

  it('keeps completed sets and awards the current and remaining best-of-three sets', () => {
    const result = completeIncompleteMatchScore(
      createMatchRule('best_of_3_21_15'),
      [
        { teamA: 21, teamB: 17 },
        { teamA: 7, teamB: 9 },
      ],
      'B',
    );

    expect(result.declaredSets).toEqual([
      { setNo: 1, teamA: 21, teamB: 17 },
      { setNo: 2, teamA: 7, teamB: 21 },
      { setNo: 3, teamA: 0, teamB: 15 },
    ]);
    expect(result).toMatchObject({ setsA: 1, setsB: 2, ralliesA: 28, ralliesB: 53 });
  });

  it('rejects a result that was already completed on court', () => {
    expect(() => completeIncompleteMatchScore(
      createMatchRule('single_21'),
      [{ teamA: 21, teamB: 12 }],
      'A',
    )).toThrowError(SportsDomainError);
  });

  it('rejects a partial set before another supplied set', () => {
    expect(() => completeIncompleteMatchScore(
      createMatchRule('best_of_3_15'),
      [{ teamA: 5, teamB: 4 }, { teamA: 2, teamB: 1 }],
      'A',
    )).toThrowError(/final supplied set/i);
  });

  it('rejects points recorded after a set should already have ended', () => {
    for (const score of [
      { teamA: 22, teamB: 0 },
      { teamA: 18, teamB: 15 },
    ]) {
      expect(() => completeIncompleteMatchScore(
        createMatchRule('best_of_3_15'),
        [score],
        'B',
      )).toThrowError(/after the set should have ended/i);
    }
  });
});
