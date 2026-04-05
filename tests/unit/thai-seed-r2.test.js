import { describe, test, expect } from 'vitest';

import { thaiSeedR2 } from '../../formats/thai/thai-format.js';

function mkPlayers(n, idPrefix = 'p') {
  return Array.from({ length: n }, (_, i) => ({ id: `${idPrefix}${i}`, name: `P${i + 1}` }));
}

function flatPlayerIds(zones) {
  return zones.flatMap(z => z.players.map(p => p.id));
}

describe('thaiSeedR2 — dynamic zones (1..4)', () => {
  test('n=16: four classic zones, equal quarters + gender', () => {
    const players = mkPlayers(16);
    const zones = thaiSeedR2({ players }, 'M');
    expect(zones.map(z => z.key)).toEqual(['hard', 'advance', 'medium', 'lite']);
    expect(zones.map(z => z.players.length)).toEqual([4, 4, 4, 4]);
    expect(zones.every(z => z.gender === 'M')).toBe(true);
    expect(new Set(flatPlayerIds(zones)).size).toBe(16);
  });

  test('n=8 (MF pool): four zones, two players each', () => {
    const players = mkPlayers(8, 'm');
    const zones = thaiSeedR2({ players }, 'M');
    expect(zones.map(z => z.key)).toEqual(['hard', 'advance', 'medium', 'lite']);
    expect(zones.map(z => z.players.length)).toEqual([2, 2, 2, 2]);
    expect(flatPlayerIds(zones).join(',')).toBe(players.map(p => p.id).join(','));
  });

  test('n=10: four zones, sizes 3+3+3+1 (ceil partition)', () => {
    const players = mkPlayers(10);
    const zones = thaiSeedR2({ players }, 'W');
    expect(zones.map(z => z.key)).toEqual(['hard', 'advance', 'medium', 'lite']);
    expect(zones.map(z => z.players.length)).toEqual([3, 3, 3, 1]);
    expect(zones.every(z => z.gender === 'W')).toBe(true);
    expect(new Set(flatPlayerIds(zones)).size).toBe(10);
  });

  test('n=6: three zones hard / medium / lite', () => {
    const players = mkPlayers(6);
    const zones = thaiSeedR2({ players });
    expect(zones.map(z => z.key)).toEqual(['hard', 'medium', 'lite']);
    expect(zones.map(z => z.players.length)).toEqual([2, 2, 2]);
    expect(new Set(flatPlayerIds(zones)).size).toBe(6);
  });

  test('n=5: two zones top / bottom', () => {
    const players = mkPlayers(5);
    const zones = thaiSeedR2({ players });
    expect(zones.map(z => z.key)).toEqual(['top', 'bottom']);
    expect(zones.map(z => z.players.length)).toEqual([3, 2]);
    expect(new Set(flatPlayerIds(zones)).size).toBe(5);
  });

  test('n=4: two zones top / bottom', () => {
    const players = mkPlayers(4);
    const zones = thaiSeedR2({ players });
    expect(zones.map(z => z.key)).toEqual(['top', 'bottom']);
    expect(zones.map(z => z.players.length)).toEqual([2, 2]);
  });

  test('n=2: single zone all', () => {
    const players = mkPlayers(2);
    const zones = thaiSeedR2({ players });
    expect(zones.map(z => z.key)).toEqual(['all']);
    expect(zones[0].players).toHaveLength(2);
  });

  test('n=1: single zone all', () => {
    const players = mkPlayers(1);
    const zones = thaiSeedR2({ players });
    expect(zones.map(z => z.key)).toEqual(['all']);
    expect(zones[0].players).toHaveLength(1);
  });

  test('accepts plain array as first argument (same as { players })', () => {
    const players = mkPlayers(8);
    const a = thaiSeedR2(players, 'M');
    const b = thaiSeedR2({ players }, 'M');
    expect(a).toEqual(b);
  });

  test('empty players: no zones', () => {
    expect(thaiSeedR2({ players: [] }, 'M')).toEqual([]);
  });

  test('omitted gender yields empty string on zones', () => {
    const zones = thaiSeedR2({ players: mkPlayers(2) });
    expect(zones.every(z => z.gender === '')).toBe(true);
  });

  test('respects explicit ppc from thai-boot-style payload', () => {
    const players = mkPlayers(8);
    const zones = thaiSeedR2({ players, ppc: 2 }, 'M');
    expect(zones.map(z => z.players.length)).toEqual([2, 2, 2, 2]);
    expect(zones.map(z => z.key)).toEqual(['hard', 'advance', 'medium', 'lite']);
  });
});
