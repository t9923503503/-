import { describe, expect, it } from 'vitest';

import { buildKotcNextR1PairSources } from '../../web/lib/kotc-next/service.ts';

describe('buildKotcNextR1PairSources', () => {
  it('builds mixed courts from separate male and female pools', () => {
    const roster = [
      { playerId: 'm1', playerName: 'M1', gender: 'M', position: 1 },
      { playerId: 'm2', playerName: 'M2', gender: 'M', position: 2 },
      { playerId: 'm3', playerName: 'M3', gender: 'M', position: 3 },
      { playerId: 'm4', playerName: 'M4', gender: 'M', position: 4 },
      { playerId: 'w1', playerName: 'W1', gender: 'W', position: 5 },
      { playerId: 'w2', playerName: 'W2', gender: 'W', position: 6 },
      { playerId: 'w3', playerName: 'W3', gender: 'W', position: 7 },
      { playerId: 'w4', playerName: 'W4', gender: 'W', position: 8 },
    ];

    const pairSources = buildKotcNextR1PairSources(roster, {
      courts: 1,
      ppc: 4,
      variant: 'MF',
    });

    expect(pairSources).toHaveLength(1);
    expect(
      pairSources[0].pairs.map((pair) => [
        pair.primaryPlayerName,
        pair.primaryGender,
        pair.secondaryPlayerName,
        pair.secondaryGender,
      ]),
    ).toEqual([
      ['M1', 'M', 'W1', 'W'],
      ['M2', 'M', 'W2', 'W'],
      ['M3', 'M', 'W3', 'W'],
      ['M4', 'M', 'W4', 'W'],
    ]);
  });

  it('keeps sequential pairing for non-mixed variants', () => {
    const roster = [
      { playerId: 'm1', playerName: 'M1', gender: 'M', position: 1 },
      { playerId: 'm2', playerName: 'M2', gender: 'M', position: 2 },
      { playerId: 'm3', playerName: 'M3', gender: 'M', position: 3 },
      { playerId: 'm4', playerName: 'M4', gender: 'M', position: 4 },
      { playerId: 'm5', playerName: 'M5', gender: 'M', position: 5 },
      { playerId: 'm6', playerName: 'M6', gender: 'M', position: 6 },
    ];

    const pairSources = buildKotcNextR1PairSources(roster, {
      courts: 1,
      ppc: 3,
      variant: 'MM',
    });

    expect(pairSources[0].pairs.map((pair) => [pair.primaryPlayerName, pair.secondaryPlayerName])).toEqual([
      ['M1', 'M2'],
      ['M3', 'M4'],
      ['M5', 'M6'],
    ]);
  });

  it('rejects mixed bootstrap when gender counts do not match court capacity', () => {
    const roster = [
      { playerId: 'm1', playerName: 'M1', gender: 'M', position: 1 },
      { playerId: 'm2', playerName: 'M2', gender: 'M', position: 2 },
      { playerId: 'm3', playerName: 'M3', gender: 'M', position: 3 },
      { playerId: 'm4', playerName: 'M4', gender: 'M', position: 4 },
      { playerId: 'w1', playerName: 'W1', gender: 'W', position: 5 },
      { playerId: 'w2', playerName: 'W2', gender: 'W', position: 6 },
      { playerId: 'w3', playerName: 'W3', gender: 'W', position: 7 },
      { playerId: 'w4', playerName: 'W4', gender: 'W', position: 8 },
      { playerId: 'w5', playerName: 'W5', gender: 'W', position: 9 },
      { playerId: 'w6', playerName: 'W6', gender: 'W', position: 10 },
    ];

    expect(() =>
      buildKotcNextR1PairSources(roster, {
        courts: 1,
        ppc: 4,
        variant: 'MF',
      }),
    ).toThrow(/Mixed KOTC requires 4 men and 4 women/);
  });
});
