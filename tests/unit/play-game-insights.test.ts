import { describe, expect, it } from 'vitest';
import {
  buildPlayAchievements,
  buildPlayGameInsights,
  buildPlayGameScopeInsights,
} from '../../web/lib/play-game-insights';

const result = (scoreA: number, scoreB: number) => ({
  payload: { version: 2, format: 'classic_2x2', pairingMode: 'fixed', pointLimit: 15, matches: [{ id: `${scoreA}-${scoreB}`, teamA: [1, 2], teamB: [3, 4], scoreA, scoreB }] },
  createdAt: '2026-08-05T00:00:00Z',
});

describe('play game profile insights', () => {
  it('finds partner, difficult opponent and current form', () => {
    const insights = buildPlayGameInsights(1, [result(10, 15), result(15, 8), result(15, 12)], new Map([[2, 'Напарник'], [3, 'Соперник А'], [4, 'Соперник Б']]));
    expect(insights.bestPartner).toMatchObject({ name: 'Напарник', wins: 2, matches: 3 });
    expect(insights.toughestOpponent).toMatchObject({ losses: 1, matches: 3 });
    expect(insights.recentForm).toEqual(['L', 'W', 'W']);
  });

  it('awards milestone medals independently from tournament rating', () => {
    expect(buildPlayAchievements({ matches: 12, wins: 6, rating: 1110, winStreak: 3 }).map((item) => item.id))
      .toEqual(['first_match', 'five_wins', 'regular', 'hot_streak', 'rating_1100']);
  });

  it('separates rated and friendly results and resolves stable result keys through the roster', () => {
    const identities = [
      { resultKey: 101, userId: 1, name: 'Игрок' },
      { resultKey: 102, userId: 2, name: 'Напарник' },
      { resultKey: 103, userId: 3, name: 'Соперник А' },
      { resultKey: 104, userId: 4, name: 'Соперник Б' },
    ];
    const source = (ratingMode: 'rated' | 'friendly', scoreA: number, scoreB: number) => ({
      payload: {
        version: 2,
        format: 'classic_2x2',
        pairingMode: 'fixed',
        pointLimit: 15,
        matches: [{ id: `${ratingMode}-1`, teamA: [101, 102], teamB: [103, 104], scoreA, scoreB }],
      },
      createdAt: ratingMode === 'rated' ? '2026-08-06T00:00:00Z' : '2026-08-05T00:00:00Z',
      ratingMode,
      viewerResultKey: 101,
      identities,
    });
    const scopes = buildPlayGameScopeInsights(
      1,
      [source('rated', 15, 9), source('friendly', 8, 15)],
      new Map([[2, 'Напарник'], [3, 'Соперник А'], [4, 'Соперник Б']]),
    );

    expect(scopes.all).toMatchObject({ matches: 2, wins: 1, losses: 1, pointsFor: 23, pointsAgainst: 24 });
    expect(scopes.rated).toMatchObject({ matches: 1, wins: 1, losses: 0, recentForm: ['W'] });
    expect(scopes.friendly).toMatchObject({ matches: 1, wins: 0, losses: 1, recentForm: ['L'] });
    expect(scopes.rated.bestPartner).toMatchObject({ userId: 2, name: 'Напарник', wins: 1 });
    expect(scopes.friendly.toughestOpponent).toMatchObject({ userId: 3, losses: 1 });
  });

  it('keeps guests in the match totals without presenting them as linked player insights', () => {
    const insights = buildPlayGameInsights(1, [{
      payload: {
        version: 2,
        format: 'classic_2x2',
        pairingMode: 'fixed',
        pointLimit: 15,
        matches: [{ id: 'mixed', teamA: [201, 202], teamB: [203, 204], scoreA: 15, scoreB: 11 }],
      },
      createdAt: '2026-08-07T00:00:00Z',
      ratingMode: 'friendly',
      viewerResultKey: 201,
      identities: [
        { resultKey: 201, userId: 1, name: 'Игрок' },
        { resultKey: 202, userId: null, name: 'Гость' },
        { resultKey: 203, userId: 3, name: 'Соперник' },
        { resultKey: 204, userId: null, name: 'Гость соперника' },
      ],
    }], new Map([[3, 'Соперник']]));

    expect(insights).toMatchObject({ matches: 1, wins: 1, pointsFor: 15, pointsAgainst: 11 });
    expect(insights.bestPartner).toBeNull();
    expect(insights.toughestOpponent).toMatchObject({ userId: 3, matches: 1 });
  });
});
