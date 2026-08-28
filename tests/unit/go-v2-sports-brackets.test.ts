import { describe, expect, it } from 'vitest';

import {
  LPV_DE_CROSSOVER_ORDERINGS,
  applyLoserOrdering,
  buildSeedOrder,
  generateDoubleElimination,
  generateSingleElimination,
  nextBracketCapacity,
  type BracketParticipant,
  type BracketTopology,
  type SlotSource,
} from '@/lib/go-v2/core';

function participants(count: number): BracketParticipant[] {
  return Array.from({ length: count }, (_, index) => ({ entryId: `T${index + 1}`, seed: index + 1 }));
}

function assertNoByeMatches(topology: BracketTopology): void {
  expect(topology.matches.every((match) => match.sourceA.kind !== 'BYE' && match.sourceB.kind !== 'BYE')).toBe(true);
}

function assertReferencesAreAcyclic(topology: BracketTopology): void {
  const created = new Set<string>();
  for (const match of topology.matches) {
    for (const source of [match.sourceA, match.sourceB]) {
      if (source.kind === 'MATCH_WINNER' || source.kind === 'MATCH_LOSER') {
        expect(created.has(source.matchId), `${match.matchId} references future/missing ${source.matchId}`).toBe(true);
      }
    }
    created.add(match.matchId);
  }
}

function resolveSource(source: SlotSource, winners: ReadonlyMap<string, string>, losers: ReadonlyMap<string, string>): string {
  if (source.kind === 'ENTRY') return source.entryId;
  if (source.kind === 'MATCH_WINNER') return winners.get(source.matchId)!;
  if (source.kind === 'MATCH_LOSER') return losers.get(source.matchId)!;
  throw new Error('A generated real match cannot resolve a BYE source.');
}

function simulateAlwaysSourceAWins(topology: BracketTopology): Map<string, number> {
  const winners = new Map<string, string>();
  const losers = new Map<string, string>();
  const losses = new Map<string, number>();
  for (const match of topology.matches.filter((candidate) => !candidate.conditional)) {
    const sourceA = resolveSource(match.sourceA, winners, losers);
    const sourceB = resolveSource(match.sourceB, winners, losers);
    winners.set(match.matchId, sourceA);
    losers.set(match.matchId, sourceB);
    losses.set(sourceB, (losses.get(sourceB) ?? 0) + 1);
    losses.set(sourceA, losses.get(sourceA) ?? 0);
  }
  return losses;
}

describe('LPVolley V2 bracket ordering primitives', () => {
  it('uses standard inner/outer seed positions and capacities through 64', () => {
    expect(buildSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect([2, 3, 4, 5, 8, 9, 16, 17, 32, 33, 48].map(nextBracketCapacity)).toEqual([
      2, 4, 4, 8, 8, 16, 16, 32, 32, 64, 64,
    ]);
  });

  it('freezes the lpv_de_crossover_v1 table exactly', () => {
    expect(LPV_DE_CROSSOVER_ORDERINGS).toEqual({
      4: ['natural', 'reverse'],
      8: ['natural', 'reverse', 'natural'],
      16: ['natural', 'reverse_half_shift', 'reverse', 'natural'],
      32: ['natural', 'reverse', 'half_shift', 'natural', 'natural'],
      64: ['natural', 'reverse', 'half_shift', 'reverse', 'natural', 'natural'],
    });
    expect(applyLoserOrdering([1, 2, 3, 4], 'natural')).toEqual([1, 2, 3, 4]);
    expect(applyLoserOrdering([1, 2, 3, 4], 'reverse')).toEqual([4, 3, 2, 1]);
    expect(applyLoserOrdering([1, 2, 3, 4], 'half_shift')).toEqual([3, 4, 1, 2]);
    expect(applyLoserOrdering([1, 2, 3, 4], 'reverse_half_shift')).toEqual([2, 1, 4, 3]);
  });
});

describe('LPVolley V2 single elimination', () => {
  it.each([4, 8, 16, 32, 64])('materializes the standard first-round seed layout for P=%i', (capacity) => {
    const participantCount = Math.min(capacity, 48);
    const topology = generateSingleElimination(participants(participantCount), { bronzeMatch: false });
    const firstRoundPairs = topology.matches
      .filter((match) => match.phase === 'upper' && match.round === 1)
      .map((match) => {
        expect(match.sourceA.kind).toBe('ENTRY');
        expect(match.sourceB.kind).toBe('ENTRY');
        return [
          match.sourceA.kind === 'ENTRY' ? match.sourceA.initialSeed : 0,
          match.sourceB.kind === 'ENTRY' ? match.sourceB.initialSeed : 0,
        ];
      });

    expect(topology.capacity).toBe(capacity);
    expect(firstRoundPairs).toHaveLength(participantCount - capacity / 2);
    expect(firstRoundPairs.every(([left, right]) => left + right === capacity + 1)).toBe(true);
    if (participantCount === capacity) {
      expect(firstRoundPairs[0]).toEqual([1, capacity]);
      expect(firstRoundPairs.flat().sort((left, right) => left - right)).toEqual(
        Array.from({ length: capacity }, (_, index) => index + 1),
      );
    } else {
      expect(topology.byeAdvances
        .filter((advance) => advance.phase === 'upper' && advance.round === 1)
        .map((advance) => advance.advancedSource.kind === 'ENTRY' ? advance.advancedSource.initialSeed : 0)
        .sort((left, right) => left - right))
        .toEqual(Array.from({ length: capacity - participantCount }, (_, index) => index + 1));
    }
  });

  it('gives seeds 1-3 the standard BYEs when five teams occupy an eight-slot bracket', () => {
    const topology = generateSingleElimination(participants(5), { bronzeMatch: false });
    const firstRound = topology.matches.filter((match) => match.phase === 'upper' && match.round === 1);
    expect(firstRound).toHaveLength(1);
    expect(firstRound[0]).toMatchObject({
      sourceA: { kind: 'ENTRY', initialSeed: 4 },
      sourceB: { kind: 'ENTRY', initialSeed: 5 },
    });
    expect(topology.byeAdvances
      .filter((advance) => advance.phase === 'upper' && advance.round === 1)
      .map((advance) => advance.advancedSource.kind === 'ENTRY' ? advance.advancedSource.initialSeed : 0)
      .sort((left, right) => left - right))
      .toEqual([1, 2, 3]);
  });

  it('creates exactly N-1 real matches for every N=2..48 when bronze is off', () => {
    for (let count = 2; count <= 48; count += 1) {
      const topology = generateSingleElimination(participants(count), { bronzeMatch: false });
      expect(topology.guaranteedMatchCount, `N=${count}`).toBe(count - 1);
      expect(topology.maximumMatchCount, `N=${count}`).toBe(count - 1);
      assertNoByeMatches(topology);
      assertReferencesAreAcyclic(topology);
    }
  });

  it('adds bronze only when two played semifinals exist', () => {
    const four = generateSingleElimination(participants(4));
    expect(four.matches.filter((match) => match.phase === 'bronze')).toHaveLength(1);
    expect(four.guaranteedMatchCount).toBe(4);
    const three = generateSingleElimination(participants(3));
    expect(three.matches.filter((match) => match.phase === 'bronze')).toHaveLength(0);
    expect(three.warnings.some((warning) => warning.startsWith('BRONZE_MATCH_NOT_CREATED'))).toBe(true);
  });

  it('is deterministic and hashes seed changes', () => {
    const first = generateSingleElimination(participants(12), { bronzeMatch: false });
    const second = generateSingleElimination(participants(12), { bronzeMatch: false });
    expect(second.topologyHash).toBe(first.topologyHash);
    const changed = participants(12);
    [changed[0].seed, changed[1].seed] = [changed[1].seed, changed[0].seed];
    expect(generateSingleElimination(changed, { bronzeMatch: false }).topologyHash).not.toBe(first.topologyHash);
    expect(generateSingleElimination(participants(4), { bronzeMatch: false, idPrefix: 'HARD-SE' }).matches[0].matchId)
      .toMatch(/^HARD-SE-/);
  });

  it('separates pool peers in upper round one when same-rank swaps make it possible', () => {
    const source: BracketParticipant[] = [
      { entryId: 'A1', seed: 1, poolId: 'A', poolRank: 1 },
      { entryId: 'A2', seed: 2, poolId: 'A', poolRank: 1 },
      { entryId: 'B1', seed: 3, poolId: 'B', poolRank: 1 },
      { entryId: 'B2', seed: 4, poolId: 'B', poolRank: 1 },
      { entryId: 'C1', seed: 5, poolId: 'C', poolRank: 2 },
      { entryId: 'C2', seed: 6, poolId: 'C', poolRank: 2 },
      { entryId: 'D1', seed: 7, poolId: 'D', poolRank: 2 },
      { entryId: 'D2', seed: 8, poolId: 'D', poolRank: 2 },
    ];
    const topology = generateSingleElimination(source, { bronzeMatch: false });
    expect(topology.rematchPreview.every((preview) => preview.earliestUpperRound > 1)).toBe(true);
    expect(topology.warnings.filter((warning) => warning.startsWith('POOL_REMATCH_IN_UPPER_R1'))).toEqual([]);
  });
});

describe('LPVolley V2 true double elimination', () => {
  it('generates 2N-2 guaranteed and 2N-1 maximum matches for every N=3..48', () => {
    for (let count = 3; count <= 48; count += 1) {
      const topology = generateDoubleElimination(participants(count));
      expect(topology.guaranteedMatchCount, `N=${count}`).toBe(count * 2 - 2);
      expect(topology.maximumMatchCount, `N=${count}`).toBe(count * 2 - 1);
      expect(topology.templateVersion).toBe('lpv_de_crossover_v1');
      assertNoByeMatches(topology);
      assertReferencesAreAcyclic(topology);
    }
  });

  it('omits the conditional reset node when resetFinal is false', () => {
    const topology = generateDoubleElimination(participants(8), { resetFinal: false });
    expect(topology.guaranteedMatchCount).toBe(14);
    expect(topology.maximumMatchCount).toBe(14);
    expect(topology.matches.some((match) => match.conditional)).toBe(false);
  });

  it('models GF2 as a conditional real match without a fake score or BYE', () => {
    const topology = generateDoubleElimination(participants(4));
    const reset = topology.matches.find((match) => match.conditional);
    expect(reset).toMatchObject({
      phase: 'grand_final',
      round: 2,
      publicLabel: 'Reset-финал — при необходимости',
      condition: { kind: 'LOWER_BRACKET_WINNER_WON_GF1' },
    });
    expect(topology.championSource).toMatchObject({
      kind: 'CONDITIONAL_MATCH_WINNER',
      matchId: reset?.matchId,
      fallback: { kind: 'MATCH_WINNER' },
    });
  });

  it('gives every eliminated team exactly two losses in a deterministic completed path', () => {
    for (const count of [3, 5, 8, 12, 16, 31, 48]) {
      const topology = generateDoubleElimination(participants(count), { resetFinal: false });
      const losses = simulateAlwaysSourceAWins(topology);
      const values = [...losses.values()];
      expect(values.filter((lossCount) => lossCount === 0), `N=${count}`).toHaveLength(1);
      expect(values.filter((lossCount) => lossCount === 2), `N=${count}`).toHaveLength(count - 1);
      expect(values.every((lossCount) => lossCount === 0 || lossCount === 2), `N=${count}`).toBe(true);
    }
  });

  it('keeps topology hashes stable at every supported template capacity', () => {
    for (const count of [4, 8, 16, 32, 48]) {
      const first = generateDoubleElimination(participants(count));
      const second = generateDoubleElimination(participants(count));
      expect(first.topologyHash).toBe(second.topologyHash);
      expect(first.capacity).toBe(nextBracketCapacity(count));
    }
  });
});
