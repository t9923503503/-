import { describe, expect, it } from 'vitest';
import { normalizeCoachAnalyticsPeriod } from '../../web/lib/coach/analytics-validators';

describe('LP Coach analytics validators', () => {
  it('accepts supported periods', () => {
    expect(normalizeCoachAnalyticsPeriod('28')).toBe(28);
    expect(normalizeCoachAnalyticsPeriod(90)).toBe(90);
    expect(normalizeCoachAnalyticsPeriod('365')).toBe(365);
  });

  it('falls back to 28 days for arbitrary input', () => {
    expect(normalizeCoachAnalyticsPeriod('all')).toBe(28);
    expect(normalizeCoachAnalyticsPeriod('0')).toBe(28);
    expect(normalizeCoachAnalyticsPeriod('28 days; drop table')).toBe(28);
  });
});
