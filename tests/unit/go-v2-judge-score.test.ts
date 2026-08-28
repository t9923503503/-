import { describe, expect, it } from 'vitest';

import { validateGoV2JudgeLiveScore } from '../../web/lib/go-v2/live-operations';

describe('GO V2 authoritative judge score validation', () => {
  it('accepts the client a/b score shape and a terminal single_21 result', () => {
    expect(validateGoV2JudgeLiveScore('single_21', {
      currentSet: 2,
      points: { a: 0, b: 0 },
      sets: [{ a: 21, b: 18 }],
    }, { requireFinished: true })).toMatchObject({
      finished: true,
      winnerSide: 'A',
      setsA: 1,
      setsB: 0,
    });
  });

  it('enforces all-to-15 and 21/21/15 best-of-three targets', () => {
    expect(validateGoV2JudgeLiveScore('best_of_3_15', {
      currentSet: 3,
      points: { a: 0, b: 0 },
      sets: [{ a: 15, b: 11 }, { a: 15, b: 13 }],
    }, { requireFinished: true }).winnerSide).toBe('A');

    expect(validateGoV2JudgeLiveScore('best_of_3_21_15', {
      currentSet: 4,
      points: { a: 0, b: 0 },
      sets: [{ a: 21, b: 17 }, { a: 18, b: 21 }, { a: 15, b: 12 }],
    }, { requireFinished: true }).winnerSide).toBe('A');
  });

  it('rejects an incomplete closed set and a finish request without a winner', () => {
    expect(() => validateGoV2JudgeLiveScore('single_21', {
      currentSet: 2,
      points: { a: 0, b: 0 },
      sets: [{ a: 21, b: 20 }],
    })).toThrowError(expect.objectContaining({ code: 'LIVE_SCORE_INCOMPLETE_CLOSED_SET' }));

    expect(() => validateGoV2JudgeLiveScore('best_of_3_15', {
      currentSet: 2,
      points: { a: 7, b: 6 },
      sets: [{ a: 15, b: 10 }],
    }, { requireFinished: true })).toThrowError(expect.objectContaining({ code: 'MATCH_SCORE_INCOMPLETE' }));
  });

  it('rejects points beyond a cap, extra sets and play after a match winner', () => {
    const capped = {
      preset: 'single_21',
      setsToWin: 1,
      sets: [{ targetPoints: 21, winBy: 2, pointCap: 25 }],
    };
    expect(() => validateGoV2JudgeLiveScore(capped, {
      currentSet: 1,
      points: { a: 26, b: 24 },
      sets: [],
    })).toThrowError(expect.objectContaining({ code: 'LIVE_SCORE_EXCEEDS_POINT_CAP' }));

    expect(() => validateGoV2JudgeLiveScore('single_21', {
      currentSet: 3,
      points: { a: 0, b: 0 },
      sets: [{ a: 21, b: 10 }, { a: 21, b: 11 }],
    })).toThrowError(expect.objectContaining({ code: 'LIVE_SCORE_SET_COUNT_EXCEEDED' }));

    expect(() => validateGoV2JudgeLiveScore('best_of_3_15', {
      currentSet: 4,
      points: { a: 0, b: 0 },
      sets: [{ a: 15, b: 10 }, { a: 15, b: 9 }, { a: 15, b: 8 }],
    })).toThrowError(expect.objectContaining({ code: 'LIVE_SCORE_SETS_AFTER_MATCH_WIN' }));
  });
});
