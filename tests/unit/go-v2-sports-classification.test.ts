import { describe, expect, it } from 'vitest';

import {
  analyzeClassificationFeasibility,
  describeClassificationTopology,
  generateClassificationTopology,
  resolveCompleteClassificationPlacements,
  type BracketParticipant,
  type ClassificationMatchOutcomeInput,
  type ClassificationTopology,
} from '@/lib/go-v2/core';

function participants(count: number): BracketParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    entryId: `E-${String(index + 1).padStart(2, '0')}`,
    seed: index + 1,
  }));
}

function sourceAWins(topology: ClassificationTopology): ClassificationMatchOutcomeInput[] {
  return topology.matches.map((match) => ({
    matchId: match.matchId,
    winnerEntryId: match.sourceA.entryId,
    loserEntryId: match.sourceB.entryId,
  }));
}

describe('LPVolley V2 classification/consolation rounds', () => {
  it('states the supported range honestly instead of inventing BYE wins for two teams', () => {
    expect(analyzeClassificationFeasibility(2)).toEqual({
      supported: false,
      code: 'CLASSIFICATION_REQUIRES_THREE',
      message: expect.stringContaining('explicit series'),
      alternatives: ['standalone_series', 'add_third_team'],
    });
    expect(() => generateClassificationTopology(participants(2)))
      .toThrowError(expect.objectContaining({ code: 'CLASSIFICATION_REQUIRES_THREE' }));
    expect(describeClassificationTopology(3)).toMatchObject({
      minimumGamesGuaranteed: 4,
      rematchesRequired: true,
    });
    expect(describeClassificationTopology(48)).toMatchObject({
      minimumGamesGuaranteed: 3,
      maximumGames: 3,
      realMatchCount: 72,
    });
  });

  it('property-checks real match counts, DAG edges and the game floor for every N=3..48', () => {
    for (let count = 3; count <= 48; count += 1) {
      const topology = generateClassificationTopology(participants(count), { idPrefix: `C${count}` });
      const plan = describeClassificationTopology(count);
      expect(topology).toMatchObject({
        participantCount: count,
        roundCount: plan.roundCount,
        realMatchCount: plan.realMatchCount,
        minimumGamesGuaranteed: plan.minimumGamesGuaranteed,
        maximumGames: plan.maximumGames,
      });
      expect(topology.matches).toHaveLength(plan.realMatchCount);
      expect(topology.matches.every((match) => (
        match.sourceA.kind === 'ENTRY' && match.sourceB.kind === 'ENTRY'
      ))).toBe(true);
      expect(topology.gamesByEntry).toHaveLength(count);
      expect(Math.min(...topology.gamesByEntry.map((row) => row.games))).toBeGreaterThanOrEqual(3);
      expect(topology.gamesByEntry.reduce((sum, row) => sum + row.games, 0)).toBe(2 * topology.realMatchCount);
      expect(topology.rounds.reduce((sum, round) => sum + round.idleEntryIds.length, 0))
        .toBe(plan.structuralIdleAppearances);

      const matchIndex = new Map(topology.matches.map((match, index) => [match.matchId, index]));
      for (const match of topology.matches) {
        expect(match.dependencies.every((dependency) => (
          (matchIndex.get(dependency) ?? Number.MAX_SAFE_INTEGER) < (matchIndex.get(match.matchId) ?? -1)
        ))).toBe(true);
      }
      for (const round of topology.rounds) {
        const roundMatches = round.matchIds.map((matchId) => topology.matches.find((match) => match.matchId === matchId)!);
        const activeEntries = roundMatches.flatMap((match) => [match.sourceA.entryId, match.sourceB.entryId]);
        expect(new Set(activeEntries).size).toBe(activeEntries.length);
        expect(round.idleEntryIds.every((entryId) => !activeEntries.includes(entryId))).toBe(true);
      }

      const pairCounts = new Map<string, number>();
      for (const match of topology.matches) {
        const pair = [match.sourceA.entryId, match.sourceB.entryId].sort().join(':');
        pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
      }
      if (count === 3) expect([...pairCounts.values()]).toEqual([2, 2, 2]);
      else expect(Math.max(...pairCounts.values())).toBe(1);
    }
  });

  it('is deterministic across participant input order', () => {
    const forward = generateClassificationTopology(participants(17));
    const reverse = generateClassificationTopology([...participants(17)].reverse());
    expect(reverse.topologyHash).toBe(forward.topologyHash);
    expect(reverse).toEqual(forward);
  });

  it('property-checks complete deterministic places for every N=3..48', () => {
    for (let count = 3; count <= 48; count += 1) {
      const topology = generateClassificationTopology(participants(count), { idPrefix: `P${count}` });
      const outcomes = sourceAWins(topology);
      const first = resolveCompleteClassificationPlacements(topology, outcomes);
      const replay = resolveCompleteClassificationPlacements(topology, [...outcomes].reverse());
      expect(first.placements).toHaveLength(count);
      expect(first.placements.map((row) => row.place)).toEqual(
        Array.from({ length: count }, (_, index) => index + 1),
      );
      expect(new Set(first.placements.map((row) => row.entryId)).size).toBe(count);
      expect(first.placements.every((row) => row.gamesPlayed >= 3)).toBe(true);
      expect(first.playedMatchIds).toEqual(topology.matches.map((match) => match.matchId));
      expect(replay).toEqual(first);
      expect(first.resultHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    }
  });

  it('preserves a sporting tie range before using seed for unique export places', () => {
    const topology = generateClassificationTopology(participants(3));
    // Each pair plays twice with reversed A/B; source-A wins split every series 1:1.
    const result = resolveCompleteClassificationPlacements(topology, sourceAWins(topology));
    expect(result.placements.map((row) => ({
      entryId: row.entryId,
      place: row.place,
      range: row.sportingPlaceRange,
      basis: row.basis,
      record: `${row.wins}-${row.losses}`,
    }))).toEqual([
      { entryId: 'E-01', place: 1, range: [1, 3], basis: 'initial_seed_tiebreak', record: '2-2' },
      { entryId: 'E-02', place: 2, range: [1, 3], basis: 'initial_seed_tiebreak', record: '2-2' },
      { entryId: 'E-03', place: 3, range: [1, 3], basis: 'initial_seed_tiebreak', record: '2-2' },
    ]);
  });

  it('rejects missing, duplicate and participant-invalid outcomes', () => {
    const topology = generateClassificationTopology(participants(4));
    const outcomes = sourceAWins(topology);
    expect(() => resolveCompleteClassificationPlacements(topology, outcomes.slice(1)))
      .toThrowError(expect.objectContaining({ code: 'MISSING_CLASSIFICATION_OUTCOME' }));
    expect(() => resolveCompleteClassificationPlacements(topology, [...outcomes, outcomes[0]]))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_CLASSIFICATION_OUTCOME' }));
    expect(() => resolveCompleteClassificationPlacements(topology, [
      { ...outcomes[0], winnerEntryId: 'UNKNOWN' },
      ...outcomes.slice(1),
    ])).toThrowError(expect.objectContaining({ code: 'INVALID_CLASSIFICATION_OUTCOME_PARTICIPANTS' }));
  });
});
