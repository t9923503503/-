import { describe, expect, it } from 'vitest';
import { calculateTeamRatingChange, calculateTeamRatingDelta } from '../../web/lib/play-game-rating';

describe('game rating Elo', () => {
  it('rewards an upset more than an expected win', () => {
    const upset = calculateTeamRatingDelta({ teamRating: 900, opponentRating: 1100, won: true });
    const expected = calculateTeamRatingDelta({ teamRating: 1100, opponentRating: 900, won: true });
    expect(upset).toBeGreaterThan(expected);
  });

  it('reduces value of repeated opponents', () => {
    const first = calculateTeamRatingDelta({ teamRating: 1000, opponentRating: 1000, won: true, previousMeetings: 0 });
    const repeated = calculateTeamRatingDelta({ teamRating: 1000, opponentRating: 1000, won: true, previousMeetings: 8 });
    expect(repeated).toBeLessThan(first);
  });

  it('always changes rating by at least one point', () => {
    expect(calculateTeamRatingDelta({ teamRating: 2000, opponentRating: 500, won: true })).toBeGreaterThanOrEqual(1);
    expect(calculateTeamRatingDelta({ teamRating: 500, opponentRating: 2000, won: false })).toBeLessThanOrEqual(-1);
  });

  it('moves a new rating faster and protects strongly mismatched games', () => {
    const newcomer = calculateTeamRatingChange({ teamRating: 1000, opponentRating: 1000, won: true, accountMatches: 0 });
    const established = calculateTeamRatingChange({ teamRating: 1000, opponentRating: 1000, won: true, accountMatches: 40 });
    const mismatch = calculateTeamRatingChange({ teamRating: 1500, opponentRating: 800, won: true, accountMatches: 40 });
    expect(newcomer.delta).toBeGreaterThan(established.delta);
    expect(mismatch.balanceFactor).toBeLessThan(1);
    expect(mismatch.delta).toBeLessThan(established.delta);
  });
});
