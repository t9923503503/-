import { describe, expect, it } from 'vitest';
import { splitCourtPlayersForSpectator } from '../../web/lib/thai-spectator-court-split';

describe('splitCourtPlayersForSpectator', () => {
  const eight = ['a', 'b', 'c', 'd', 'w', 'x', 'y', 'z'];

  it('MN: two columns Монстры and Лютые with 4+4', () => {
    const { columns } = splitCourtPlayersForSpectator('MN', eight);
    expect(columns).toHaveLength(2);
    expect(columns[0].title).toBe('Монстры');
    expect(columns[0].names).toEqual(['a', 'b', 'c', 'd']);
    expect(columns[1].title).toBe('Лютые');
    expect(columns[1].names).toEqual(['w', 'x', 'y', 'z']);
  });

  it('MF: Мужчины / Женщины', () => {
    const { columns } = splitCourtPlayersForSpectator('MF', eight);
    expect(columns[0].title).toBe('Мужчины');
    expect(columns[1].title).toBe('Женщины');
  });

  it('MM: splits in half without titles when not dual-pool 8', () => {
    const { columns } = splitCourtPlayersForSpectator('MM', ['1', '2', '3', '4', '5', '6']);
    expect(columns[0].title).toBe('');
    expect(columns[0].names).toEqual(['1', '2', '3']);
    expect(columns[1].names).toEqual(['4', '5', '6']);
  });
});
