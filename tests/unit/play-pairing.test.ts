import { describe, expect, it } from 'vitest';
import { suggest2x2Pairing } from '../../web/lib/play-pairing';

const players = [
  { resultKey: 1, rating: 1200 },
  { resultKey: 2, rating: 1100 },
  { resultKey: 3, rating: 900 },
  { resultKey: 4, rating: 800 },
];

describe('2x2 pairing suggestions', () => {
  it('balances the sum of team ratings', () => {
    const result = suggest2x2Pairing(players, 'balanced');
    expect(result?.ratingDifference).toBe(0);
    expect(result?.teamA).toEqual([1, 4]);
    expect(result?.teamB).toEqual([2, 3]);
  });

  it('prefers partnerships that have not been repeated', () => {
    const counts = new Map([['1:4', 4], ['2:3', 4], ['1:2', 2], ['3:4', 2]]);
    const result = suggest2x2Pairing(players, 'fresh', { partnershipCounts: counts });
    expect(result?.teamA).toEqual([1, 3]);
    expect(result?.teamB).toEqual([2, 4]);
    expect(result?.repeatedPartnerships).toBe(0);
  });

  it('can recreate the previous teams', () => {
    const result = suggest2x2Pairing(players, 'rematch', { previousTeams: [[1, 3], [2, 4]] });
    expect(result?.teamA).toEqual([1, 3]);
    expect(result?.teamB).toEqual([2, 4]);
  });
});
