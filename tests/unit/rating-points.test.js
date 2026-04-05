import { describe, expect, it } from 'vitest';

import {
  effectiveRatingPtsFromStored,
  pointsForPlace,
  ratingPointsForPlace,
  RATING_POINTS_TABLE,
} from '../../web/lib/rating-points.ts';

describe('rating-points', () => {
  it('matches legacy POINTS_TABLE for place 1–3', () => {
    expect(pointsForPlace(1)).toBe(100);
    expect(pointsForPlace(2)).toBe(90);
    expect(pointsForPlace(3)).toBe(82);
  });

  it('novice gets half rounded', () => {
    expect(ratingPointsForPlace(1, 'pro')).toBe(100);
    expect(ratingPointsForPlace(1, 'novice')).toBe(50);
    expect(ratingPointsForPlace(2, 'novice')).toBe(45);
    expect(ratingPointsForPlace(3, 'novice')).toBe(41);
  });

  it('table length is 40', () => {
    expect(RATING_POINTS_TABLE.length).toBe(40);
  });

  it('effectiveRatingPtsFromStored prefers positive DB value', () => {
    expect(effectiveRatingPtsFromStored(1, 'pro', 77)).toBe(77);
    expect(effectiveRatingPtsFromStored(1, 'novice', 40)).toBe(40);
  });

  it('effectiveRatingPtsFromStored falls back when DB empty or zero', () => {
    expect(effectiveRatingPtsFromStored(1, 'pro', 0)).toBe(100);
    expect(effectiveRatingPtsFromStored(1, 'pro', null)).toBe(100);
    expect(effectiveRatingPtsFromStored(2, 'novice', undefined)).toBe(45);
  });
});
