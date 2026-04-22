import { describe, expect, it } from 'vitest';

import {
  effectiveRatingPtsFromStored,
  normalizeTournamentRatingLevel,
  pointsForLevelPlace,
  pointsForPlace,
  ratingPointsForLevelPlace,
  ratingPointsForPlace,
  RATING_LEVEL_TABLES,
  RATING_POINTS_TABLE,
  sqlEffectiveRatingPointsExpr,
} from '../../web/lib/rating-points.ts';

describe('rating-points', () => {
  it('matches legacy POINTS_TABLE for place 1-3', () => {
    expect(pointsForPlace(1)).toBe(100);
    expect(pointsForPlace(2)).toBe(90);
    expect(pointsForPlace(3)).toBe(82);
  });

  it('keeps row-level tables for hard/advance/medium/lite', () => {
    expect(RATING_LEVEL_TABLES.hard).toEqual([100, 90, 82, 76]);
    expect(RATING_LEVEL_TABLES.advance).toEqual([70, 65, 60, 56, 52]);
    expect(RATING_LEVEL_TABLES.medium).toEqual([48, 44, 42, 40]);
    expect(RATING_LEVEL_TABLES.lite).toEqual([38, 36, 34, 32]);
    expect(pointsForLevelPlace(1, 'medium')).toBe(48);
    expect(pointsForLevelPlace(2, 'lite')).toBe(36);
  });

  it('novice gets half rounded', () => {
    expect(ratingPointsForPlace(1, 'pro')).toBe(100);
    expect(ratingPointsForPlace(1, 'novice')).toBe(50);
    expect(ratingPointsForPlace(2, 'novice')).toBe(45);
    expect(ratingPointsForPlace(3, 'novice')).toBe(41);
    expect(ratingPointsForLevelPlace(1, 'medium', 'novice')).toBe(24);
    expect(ratingPointsForLevelPlace(1, 'lite', 'novice')).toBe(19);
  });

  it('table length is 40', () => {
    expect(RATING_POINTS_TABLE.length).toBe(40);
  });

  it('effectiveRatingPtsFromStored prefers positive DB value', () => {
    expect(effectiveRatingPtsFromStored(1, 'pro', 77)).toBe(77);
    expect(effectiveRatingPtsFromStored(1, 'novice', 40, 'medium')).toBe(40);
  });

  it('effectiveRatingPtsFromStored falls back when DB empty or zero', () => {
    expect(effectiveRatingPtsFromStored(1, 'pro', 0)).toBe(100);
    expect(effectiveRatingPtsFromStored(1, 'pro', null)).toBe(100);
    expect(effectiveRatingPtsFromStored(2, 'novice', undefined)).toBe(45);
    expect(effectiveRatingPtsFromStored(1, 'pro', undefined, 'medium')).toBe(48);
    expect(effectiveRatingPtsFromStored(2, 'novice', undefined, 'lite')).toBe(18);
  });

  it('normalizes tournament level aliases', () => {
    expect(normalizeTournamentRatingLevel('advanced')).toBe('advance');
    expect(normalizeTournamentRatingLevel('light')).toBe('lite');
    expect(normalizeTournamentRatingLevel('')).toBe('hard');
  });

  it('sqlEffectiveRatingPointsExpr prefers stored rating_pts before place fallback', () => {
    const sql = sqlEffectiveRatingPointsExpr('tr');

    expect(sql).toContain("COALESCE(tr.rating_pts, 0) > 0");
    expect(sql).toContain('THEN tr.rating_pts');
    expect(sql).toContain("COALESCE(tr.rating_pool, 'pro') = 'novice'");
  });
});
