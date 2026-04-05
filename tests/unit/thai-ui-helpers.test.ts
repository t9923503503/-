import { describe, expect, it } from 'vitest';
import {
  clampThaiJudgeScore,
  filterPlayersByGenderSelection,
  resolveAbsoluteJudgeUrl,
} from '../../web/lib/thai-ui-helpers';

describe('Thai UI helpers', () => {
  it('resolves Thai judge QR links to absolute URLs', () => {
    expect(resolveAbsoluteJudgeUrl('/court/ABC123', 'https://lpvolley.ru')).toBe(
      'https://lpvolley.ru/court/ABC123',
    );
    expect(resolveAbsoluteJudgeUrl('https://lpvolley.ru/court/ABC123', 'https://example.com')).toBe(
      'https://lpvolley.ru/court/ABC123',
    );
  });

  it('clamps Thai judge scores to the point limit range', () => {
    expect(clampThaiJudgeScore(12, 9)).toBe(9);
    expect(clampThaiJudgeScore(-4, 9)).toBe(0);
    expect(clampThaiJudgeScore('7', 9)).toBe(7);
    expect(clampThaiJudgeScore('oops', 9)).toBe(0);
  });

  it('filters roster candidates by selected gender without mutating data', () => {
    const players = [
      { id: 'm1', gender: 'M' as const },
      { id: 'w1', gender: 'W' as const },
      { id: 'm2', gender: 'M' as const },
    ];

    expect(filterPlayersByGenderSelection(players, 'all')).toEqual(players);
    expect(filterPlayersByGenderSelection(players, 'M')).toEqual([
      { id: 'm1', gender: 'M' },
      { id: 'm2', gender: 'M' },
    ]);
    expect(filterPlayersByGenderSelection(players, 'W')).toEqual([{ id: 'w1', gender: 'W' }]);
  });
});
