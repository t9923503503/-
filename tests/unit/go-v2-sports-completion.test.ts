import { describe, expect, it } from 'vitest';

import {
  generateDoubleElimination,
  generateSingleElimination,
  resolveCompleteBracketPlacements,
  type BracketMatch,
  type BracketMatchOutcomeInput,
  type BracketParticipant,
  type BracketTopology,
  type SlotSource,
} from '@/lib/go-v2/core';

function participants(count: number): BracketParticipant[] {
  return Array.from({ length: count }, (_, index) => ({ entryId: `T${index + 1}`, seed: index + 1 }));
}

function resolveSource(
  source: SlotSource,
  winners: ReadonlyMap<string, string>,
  losers: ReadonlyMap<string, string>,
): string {
  if (source.kind === 'ENTRY') return source.entryId;
  if (source.kind === 'MATCH_WINNER') return winners.get(source.matchId)!;
  if (source.kind === 'MATCH_LOSER') return losers.get(source.matchId)!;
  throw new Error('Generated real matches cannot contain BYE.');
}

function simulatedOutcomes(
  topology: BracketTopology,
  chooseWinner: (match: BracketMatch, participantA: string, participantB: string) => 'A' | 'B' = () => 'A',
): BracketMatchOutcomeInput[] {
  const winners = new Map<string, string>();
  const losers = new Map<string, string>();
  const matches = new Map(topology.matches.map((match) => [match.matchId, match]));
  const outcomes: BracketMatchOutcomeInput[] = [];
  for (const match of topology.matches) {
    if (match.conditional) {
      const grandFinal = matches.get(match.condition!.grandFinalMatchId)!;
      const lowerChampion = resolveSource(grandFinal.sourceB, winners, losers);
      if (winners.get(grandFinal.matchId) !== lowerChampion) continue;
    }
    const participantA = resolveSource(match.sourceA, winners, losers);
    const participantB = resolveSource(match.sourceB, winners, losers);
    const side = chooseWinner(match, participantA, participantB);
    const winnerEntryId = side === 'A' ? participantA : participantB;
    const loserEntryId = side === 'A' ? participantB : participantA;
    winners.set(match.matchId, winnerEntryId);
    losers.set(match.matchId, loserEntryId);
    outcomes.push({ matchId: match.matchId, winnerEntryId, loserEntryId });
  }
  return outcomes;
}

describe('LPVolley V2 complete bracket placements', () => {
  it('ranks every SE participant and preserves an unplayed cohort range behind seed fallback', () => {
    const topology = generateSingleElimination(participants(8), { bronzeMatch: true });
    const result = resolveCompleteBracketPlacements(topology, simulatedOutcomes(topology));
    expect(result.placements.map((row) => row.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.placements.slice(0, 4).map((row) => row.entryId)).toEqual(['T1', 'T2', 'T4', 'T3']);
    expect(result.placements.slice(4).every((row) => (
      row.sportingPlaceRange[0] === 5
      && row.sportingPlaceRange[1] === 8
      && row.basis === 'initial_seed_tiebreak'
    ))).toBe(true);
    expect(result.strictTwoLossInvariantSatisfied).toBeNull();
  });

  it('property-checks complete deterministic 1..N placements for every SE N=2..48', () => {
    for (let count = 2; count <= 48; count += 1) {
      for (const bronzeMatch of [false, true]) {
        const topology = generateSingleElimination(participants(count), { bronzeMatch });
        const result = resolveCompleteBracketPlacements(
          topology,
          simulatedOutcomes(topology, (match) => (match.position % 2 === 0 ? 'B' : 'A')),
        );
        expect(result.placements, `N=${count}, bronze=${bronzeMatch}`).toHaveLength(count);
        expect(result.placements.map((row) => row.place), `N=${count}, bronze=${bronzeMatch}`)
          .toEqual(Array.from({ length: count }, (_, index) => index + 1));
        expect(new Set(result.placements.map((row) => row.entryId)).size).toBe(count);
      }
    }
  });

  it('skips GF2 when Upper wins GF1 and gives every other DE team exactly two losses', () => {
    const topology = generateDoubleElimination(participants(8));
    const result = resolveCompleteBracketPlacements(topology, simulatedOutcomes(topology));
    expect(result.resetFinalPlayed).toBe(false);
    expect(result.skippedConditionalMatchIds).toHaveLength(1);
    expect(result.strictTwoLossInvariantSatisfied).toBe(true);
    expect(result.placements).toHaveLength(8);
    expect(result.placements[0].losses).toBe(0);
    expect(result.placements.slice(1).every((row) => row.losses === 2)).toBe(true);
  });

  it.each(['A', 'B'] as const)('activates GF2 after a Lower GF1 win and validates reset winner side %s', (resetSide) => {
    const topology = generateDoubleElimination(participants(8));
    const outcomes = simulatedOutcomes(topology, (match) => {
      if (match.phase === 'grand_final' && match.round === 1) return 'B';
      if (match.phase === 'grand_final' && match.round === 2) return resetSide;
      return 'A';
    });
    const result = resolveCompleteBracketPlacements(topology, outcomes);
    expect(result.resetFinalPlayed).toBe(true);
    expect(result.skippedConditionalMatchIds).toEqual([]);
    expect(result.strictTwoLossInvariantSatisfied).toBe(true);
    expect(result.placements.slice(1).every((row) => row.losses === 2)).toBe(true);
    expect(result.placements[0].losses).toBe(1);
  });

  it('rejects a missing required reset and a condition-false fake reset result', () => {
    const topology = generateDoubleElimination(participants(4));
    const needsReset = simulatedOutcomes(topology, (match) => (
      match.phase === 'grand_final' && match.round === 1 ? 'B' : 'A'
    ));
    expect(() => resolveCompleteBracketPlacements(topology, needsReset.slice(0, -1)))
      .toThrowError(expect.objectContaining({ code: 'MISSING_BRACKET_OUTCOME' }));

    const noReset = simulatedOutcomes(topology);
    const conditional = topology.matches.find((match) => match.conditional)!;
    expect(() => resolveCompleteBracketPlacements(topology, [
      ...noReset,
      { matchId: conditional.matchId, winnerEntryId: 'T1', loserEntryId: 'T2' },
    ])).toThrowError(expect.objectContaining({ code: 'INACTIVE_CONDITIONAL_OUTCOME' }));
  });

  it('reports the intentional one-loss runner-up exception when DE reset is disabled', () => {
    const topology = generateDoubleElimination(participants(8), { resetFinal: false });
    const outcomes = simulatedOutcomes(topology, (match) => (
      match.phase === 'grand_final' ? 'B' : 'A'
    ));
    const result = resolveCompleteBracketPlacements(topology, outcomes);
    expect(result.strictTwoLossInvariantSatisfied).toBe(false);
    expect(result.placements[1].losses).toBe(1);
    expect(result.placements.slice(2).every((row) => row.losses === 2)).toBe(true);
  });

  it('property-checks the two-played-game floor for every DE N=3..48 with and without reset', () => {
    for (let count = 3; count <= 48; count += 1) {
      const upperWins = generateDoubleElimination(participants(count));
      const upperResult = resolveCompleteBracketPlacements(upperWins, simulatedOutcomes(upperWins));
      expect(upperResult.placements.every((row) => row.gamesPlayed >= 2), `upper wins, N=${count}`).toBe(true);

      const resetNeeded = generateDoubleElimination(participants(count));
      const resetResult = resolveCompleteBracketPlacements(resetNeeded, simulatedOutcomes(resetNeeded, (match) => (
        match.phase === 'grand_final' && match.round === 1 ? 'B' : 'A'
      )));
      expect(resetResult.placements.every((row) => row.gamesPlayed >= 2), `reset, N=${count}`).toBe(true);

      const noReset = generateDoubleElimination(participants(count), { resetFinal: false });
      const noResetResult = resolveCompleteBracketPlacements(noReset, simulatedOutcomes(noReset, (match) => (
        match.phase === 'grand_final' ? 'B' : 'A'
      )));
      expect(noResetResult.placements.every((row) => row.gamesPlayed >= 2), `no reset, N=${count}`).toBe(true);
    }
  });
});
