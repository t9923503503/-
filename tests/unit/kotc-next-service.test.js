import { describe, expect, it } from 'vitest';

import { buildKotcNextR1PairSources } from '../../web/lib/kotc-next/service.ts';
import { buildKotcNextRoundPartnerIndexMap } from '../../web/lib/kotc-next/core.ts';

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

  it('keeps partner rotation unique through a full cycle for MF/MM/WW/MN', () => {
    const buildRoster = (variant, ppc) => {
      if (variant === 'MF') {
        return [
          ...Array.from({ length: ppc }, (_, index) => ({
            playerId: `m${index + 1}`,
            playerName: `M${index + 1}`,
            gender: 'M',
            position: index + 1,
          })),
          ...Array.from({ length: ppc }, (_, index) => ({
            playerId: `w${index + 1}`,
            playerName: `W${index + 1}`,
            gender: 'W',
            position: ppc + index + 1,
          })),
        ];
      }
      if (variant === 'WW') {
        return Array.from({ length: ppc * 2 }, (_, index) => ({
          playerId: `w${index + 1}`,
          playerName: `W${index + 1}`,
          gender: 'W',
          position: index + 1,
        }));
      }
      return Array.from({ length: ppc * 2 }, (_, index) => ({
        playerId: `p${index + 1}`,
        playerName: `P${index + 1}`,
        gender: index % 2 === 0 ? 'M' : 'W',
        position: index + 1,
      }));
    };

    for (const variant of ['MF', 'MM', 'WW', 'MN']) {
      for (const ppc of [3, 4, 5]) {
        const roster = buildRoster(variant, ppc);
        const pairSources = buildKotcNextR1PairSources(roster, {
          courts: 1,
          ppc,
          variant,
        });
        const basePairs = pairSources[0].pairs;
        const partnersByPrimary = new Map(
          basePairs.map((pair) => [pair.primaryPlayerName, new Set()]),
        );

        for (let raundNo = 1; raundNo <= ppc; raundNo += 1) {
          const mapping = buildKotcNextRoundPartnerIndexMap(ppc, raundNo);
          for (const { pairIdx, secondaryIdx } of mapping) {
            const primaryName = basePairs[pairIdx].primaryPlayerName;
            const secondaryName = basePairs[secondaryIdx].secondaryPlayerName;
            partnersByPrimary.get(primaryName).add(secondaryName);
          }
        }

        for (const partners of partnersByPrimary.values()) {
          expect(partners.size).toBe(ppc);
        }
      }
    }
  });
});
