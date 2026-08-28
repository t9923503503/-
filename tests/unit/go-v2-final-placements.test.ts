import { describe, expect, it } from 'vitest';

import {
  buildGoV2RatingShadowProjection,
  GO_V2_DEFAULT_RATING_POLICY,
  mergeGoV2TierBracketPlacements,
  type GoV2CompletedTierBracket,
  type GoV2PersistedFinalPlacementRow,
} from '@/lib/go-v2/final-placements';
import { orderFinalPlacementMatchesTopologically } from '@/lib/go-v2/repository';
import type { BracketMatch } from '@/lib/go-v2/core';

function bracket(
  tier: GoV2CompletedTierBracket['tier'],
  stageOrder: number,
  entries: Array<{ entryId: string; range?: readonly [number, number] }>,
): GoV2CompletedTierBracket {
  return {
    stageId: `stage-${tier}`,
    stageKey: `${tier}-playoff`,
    stageOrder,
    tier,
    result: {
      championEntryId: entries[0].entryId,
      runnerUpEntryId: entries[1]?.entryId ?? entries[0].entryId,
      placements: entries.map((entry, index) => ({
        entryId: entry.entryId,
        place: index + 1,
        sportingPlaceRange: entry.range ?? [index + 1, index + 1],
        initialSeed: index + 1,
        gamesPlayed: 2,
        losses: index === 0 ? 0 : 1,
        eliminatedByMatchId: index === 0 ? null : `match-${tier}-${index + 1}`,
        basis: index < 2 ? 'championship_match' : 'initial_seed_tiebreak',
      })),
      playedMatchIds: [],
      skippedConditionalMatchIds: [],
      resetFinalPlayed: false,
      strictTwoLossInvariantSatisfied: null,
    },
  };
}

describe('GO V2 authoritative final placements', () => {
  it('reconstructs shuffled persisted matches by immutable route dependencies', () => {
    const direct = (matchId: string, position: number): BracketMatch => ({
      matchId,
      phase: 'upper',
      round: 1,
      position,
      sourceA: { kind: 'ENTRY', entryId: `${matchId}-a`, initialSeed: position * 2 - 1 },
      sourceB: { kind: 'ENTRY', entryId: `${matchId}-b`, initialSeed: position * 2 },
      conditional: false,
    });
    const first = direct('m1', 1);
    const second = direct('m2', 2);
    const final: BracketMatch = {
      matchId: 'm3',
      phase: 'upper',
      round: 2,
      position: 1,
      sourceA: { kind: 'MATCH_WINNER', matchId: 'm1' },
      sourceB: { kind: 'MATCH_WINNER', matchId: 'm2' },
      conditional: false,
    };
    expect(orderFinalPlacementMatchesTopologically([final, second, first]).map((match) => match.matchId))
      .toEqual(['m1', 'm2', 'm3']);

    expect(() => orderFinalPlacementMatchesTopologically([{
      ...final,
      sourceA: { kind: 'MATCH_WINNER', matchId: 'missing' },
    }])).toThrowError(expect.objectContaining({ code: 'FINAL_PLACEMENT_ROUTE_DEPENDENCY_MISSING' }));

    expect(() => orderFinalPlacementMatchesTopologically([
      { ...first, sourceA: { kind: 'MATCH_WINNER', matchId: 'm2' } },
      { ...second, sourceA: { kind: 'MATCH_WINNER', matchId: 'm1' } },
    ])).toThrowError(expect.objectContaining({ code: 'FINAL_PLACEMENT_ROUTE_CYCLE' }));
  });

  it('creates one deterministic overall ledger in Hard → Medium → Light order', () => {
    const rows = mergeGoV2TierBracketPlacements([
      bracket('light', 7, [{ entryId: 'L1' }, { entryId: 'L2' }]),
      bracket('hard', 5, [
        { entryId: 'H1' },
        { entryId: 'H2' },
        { entryId: 'H3', range: [3, 4] },
        { entryId: 'H4', range: [3, 4] },
      ]),
      bracket('medium', 6, [{ entryId: 'M1' }, { entryId: 'M2' }]),
    ]);

    expect(rows.map((row) => [row.entryId, row.tierPlace, row.overallPlace])).toEqual([
      ['H1', 1, 1],
      ['H2', 2, 2],
      ['H3', 3, 3],
      ['H4', 4, 4],
      ['M1', 1, 5],
      ['M2', 2, 6],
      ['L1', 1, 7],
      ['L2', 2, 8],
    ]);
    expect(rows[2].sportingTierPlaceRange).toEqual([3, 4]);
    expect(rows[2].sportingOverallPlaceRange).toEqual([3, 4]);
    expect(rows[4].sportingOverallPlaceRange).toEqual([5, 5]);
  });

  it('rejects duplicate tier brackets and duplicate entries across tiers', () => {
    expect(() => mergeGoV2TierBracketPlacements([
      bracket('hard', 1, [{ entryId: 'A' }, { entryId: 'B' }]),
      bracket('hard', 2, [{ entryId: 'C' }, { entryId: 'D' }]),
    ])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_FINAL_PLACEMENT_TIER' }));

    expect(() => mergeGoV2TierBracketPlacements([
      bracket('hard', 1, [{ entryId: 'A' }, { entryId: 'B' }]),
      bracket('medium', 2, [{ entryId: 'A' }, { entryId: 'C' }]),
    ])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_FINAL_PLACEMENT_ENTRY' }));
  });

  it('generates rating rows only from the immutable credited lineup and policy', () => {
    const placement = (overrides: Partial<GoV2PersistedFinalPlacementRow>): GoV2PersistedFinalPlacementRow => ({
      entryId: 'entry-hard',
      sourceStageId: 'stage-hard',
      sourceStageKey: 'hard-playoff',
      tier: 'hard',
      tierPlace: 1,
      overallPlace: 1,
      sportingTierPlaceRange: [1, 1],
      sportingOverallPlaceRange: [1, 1],
      initialSeed: 1,
      gamesPlayed: 3,
      losses: 0,
      eliminatedByMatchId: null,
      basis: 'championship_match',
      lineupSnapshot: {
        matchId: 'final',
        resultRevisionId: 'revision',
        resultRevisionNo: 1,
        rosterRevisionId: 'roster',
        ratingEligibility: 'eligible',
        members: [
          { memberOrder: 1, playerId: 'player-a', displayName: 'A', ratingValue: 500 },
          { memberOrder: 2, playerId: 'player-b', displayName: 'B', ratingValue: 450 },
        ],
      },
      ...overrides,
    });
    const ineligible = placement({
      entryId: 'entry-light',
      tier: 'light',
      tierPlace: 2,
      overallPlace: 2,
      lineupSnapshot: {
        matchId: 'light-final',
        resultRevisionId: 'light-revision',
        resultRevisionNo: 3,
        rosterRevisionId: 'light-roster',
        ratingEligibility: 'ineligible',
        members: [
          { memberOrder: 1, playerId: 'player-c', displayName: 'C', ratingValue: 300 },
          { memberOrder: 2, playerId: null, displayName: 'Guest', ratingValue: 0 },
        ],
      },
    });
    const projection = buildGoV2RatingShadowProjection([placement({}), ineligible]);

    expect(projection.rows).toEqual([
      expect.objectContaining({ playerId: 'player-a', beforeValue: 500, deltaValue: 100, afterValue: 600 }),
      expect.objectContaining({ playerId: 'player-b', beforeValue: 450, deltaValue: 100, afterValue: 550 }),
      expect.objectContaining({ playerId: 'player-c', beforeValue: 300, deltaValue: 0, afterValue: 300 }),
    ]);
    expect(projection.rows[0].payload).toMatchObject({
      rosterRevisionId: 'roster',
      ratingEligibility: 'eligible',
      policyCode: GO_V2_DEFAULT_RATING_POLICY.code,
    });
    expect(projection.excluded).toEqual([
      expect.objectContaining({ entryId: 'entry-light', memberOrder: 2, reason: 'guest_without_player_id' }),
    ]);
  });

  it('fails closed when one player would be credited through two entries', () => {
    const base: GoV2PersistedFinalPlacementRow = {
      ...mergeGoV2TierBracketPlacements([
        bracket('hard', 1, [{ entryId: 'A' }, { entryId: 'B' }]),
      ])[0],
      lineupSnapshot: {
        matchId: 'm1',
        resultRevisionId: 'r1',
        resultRevisionNo: 1,
        rosterRevisionId: 'roster-1',
        ratingEligibility: 'eligible',
        members: [{ memberOrder: 1, playerId: 'same-player', displayName: 'P', ratingValue: 100 }],
      },
    };
    expect(() => buildGoV2RatingShadowProjection([
      base,
      {
        ...base,
        entryId: 'B',
        tierPlace: 2,
        overallPlace: 2,
        lineupSnapshot: { ...base.lineupSnapshot, matchId: 'm2', rosterRevisionId: 'roster-2' },
      },
    ])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_FINAL_PLACEMENT_PLAYER' }));
  });
});
