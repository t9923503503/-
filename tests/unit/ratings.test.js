import { describe, expect, it } from 'vitest';
import {
  calcRatingPoints,
  getFormatMultiplier,
  getFormatMultipliers,
  getPlacementPoints,
  FORMAT_MULTIPLIERS,
  PLACEMENT_POINTS,
} from '../../shared/ratings.js';

describe('Rating multipliers (A4.3)', () => {

  it('PLACEMENT_POINTS has at least 24 entries', () => {
    expect(PLACEMENT_POINTS.length).toBeGreaterThanOrEqual(24);
  });

  it('PLACEMENT_POINTS is strictly descending', () => {
    for (let i = 1; i < PLACEMENT_POINTS.length; i++) {
      expect(PLACEMENT_POINTS[i]).toBeLessThan(PLACEMENT_POINTS[i - 1]);
    }
  });

  it('1st place gets 100 base points', () => {
    expect(getPlacementPoints(1)).toBe(100);
  });

  it('FORMAT_MULTIPLIERS has expected formats', () => {
    const keys = Object.keys(FORMAT_MULTIPLIERS);
    expect(keys).toContain('kotc');
    expect(keys).toContain('thai');
    expect(keys).toContain('ipt_mixed');
    expect(keys).toContain('classic');
  });

  it('KOTC has highest multiplier (1.0)', () => {
    expect(FORMAT_MULTIPLIERS.kotc).toBe(1.0);
    for (const [k, v] of Object.entries(FORMAT_MULTIPLIERS)) {
      expect(v).toBeLessThanOrEqual(1.0);
    }
  });

  it('calcRatingPoints returns correct structure', () => {
    const result = calcRatingPoints(1, 'kotc');
    expect(result).toHaveProperty('base');
    expect(result).toHaveProperty('multiplier');
    expect(result).toHaveProperty('bonus');
    expect(result).toHaveProperty('total');
  });

  it('1st place KOTC = 100 points', () => {
    const { total } = calcRatingPoints(1, 'kotc');
    expect(total).toBe(100);
  });

  it('1st place Thai = 85 points (0.85x)', () => {
    const { total } = calcRatingPoints(1, 'thai');
    expect(total).toBe(85);
  });

  it('participation bonus +10% for 24+ players', () => {
    const without = calcRatingPoints(1, 'kotc');
    const with24 = calcRatingPoints(1, 'kotc', { participantCount: 24 });
    expect(with24.total).toBe(110);
    expect(with24.bonus).toBe(0.1);
    expect(without.bonus).toBe(0);
  });

  it('participation bonus +20% for 32+ players', () => {
    const result = calcRatingPoints(1, 'kotc', { participantCount: 32 });
    expect(result.total).toBe(120);
    expect(result.bonus).toBe(0.2);
  });

  it('unknown format gets 0.8 default multiplier', () => {
    expect(getFormatMultiplier('unknown_format')).toBe(0.8);
    const { multiplier } = calcRatingPoints(1, 'unknown_format');
    expect(multiplier).toBe(0.8);
  });

  it('last place still gets at least 1 point', () => {
    const { total } = calcRatingPoints(100, 'kotc');
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it('getFormatMultipliers returns a copy', () => {
    const m1 = getFormatMultipliers();
    const m2 = getFormatMultipliers();
    expect(m1).toEqual(m2);
    m1.kotc = 999;
    expect(getFormatMultipliers().kotc).toBe(1.0);
  });

  it('multiplier ordering: kotc > ipt > thai > classic > friendly', () => {
    expect(FORMAT_MULTIPLIERS.kotc).toBeGreaterThan(FORMAT_MULTIPLIERS.ipt_mixed);
    expect(FORMAT_MULTIPLIERS.ipt_mixed).toBeGreaterThan(FORMAT_MULTIPLIERS.thai);
    expect(FORMAT_MULTIPLIERS.thai).toBeGreaterThan(FORMAT_MULTIPLIERS.classic);
    expect(FORMAT_MULTIPLIERS.classic).toBeGreaterThan(FORMAT_MULTIPLIERS.friendly);
  });

  it('combined: 3rd place Thai with 32 players', () => {
    const result = calcRatingPoints(3, 'thai', { participantCount: 32 });
    // base=75, multiplier=0.85, bonus=0.2 → 75 * 0.85 * 1.2 = 76.5 → 77
    expect(result.base).toBe(75);
    expect(result.multiplier).toBe(0.85);
    expect(result.bonus).toBe(0.2);
    expect(result.total).toBe(77);
  });
});
