import {
  SportsDomainError,
  type CompleteBracketPlacement,
  type CompleteBracketResult,
  type TierName,
} from './core';

export const GO_V2_FINAL_PLACEMENT_TIER_ORDER = ['hard', 'medium', 'light'] as const;

/** Immutable source strategy of the official finished-tournament ledger. */
export type GoV2FinalPlacementSourceKind = 'bracket_v1' | 'classification_v1';

export interface GoV2CompletedTierBracket {
  stageId: string;
  stageKey: string;
  stageOrder: number;
  tier: TierName;
  result: CompleteBracketResult;
}

export interface GoV2FinalPlacementLineupMember {
  memberOrder: number;
  playerId: string | null;
  displayName: string | null;
  ratingValue: number;
}

export interface GoV2FinalPlacementLineupSnapshot {
  matchId: string;
  resultRevisionId: string;
  resultRevisionNo: number;
  rosterRevisionId: string;
  ratingEligibility: 'eligible' | 'ineligible' | 'profile_controlled';
  members: GoV2FinalPlacementLineupMember[];
}

export interface GoV2FinalPlacementRowDraft {
  entryId: string;
  sourceStageId: string;
  sourceStageKey: string;
  tier: TierName;
  tierPlace: number;
  overallPlace: number;
  sportingTierPlaceRange: readonly [number, number];
  sportingOverallPlaceRange: readonly [number, number];
  initialSeed: number;
  gamesPlayed: number;
  losses: number;
  eliminatedByMatchId: string | null;
  basis: CompleteBracketPlacement['basis'] | 'classification_standings';
}

export interface GoV2PersistedFinalPlacementRow extends GoV2FinalPlacementRowDraft {
  lineupSnapshot: GoV2FinalPlacementLineupSnapshot;
}

export interface GoV2RatingPolicySnapshot {
  schemaVersion: 1;
  code: 'LPV_GO_V2_TIER_POINTS_V1';
  lineupSelection: 'placement_deciding_active_result';
  ineligibleResultPoints: 0;
  tierPoints: Readonly<Record<TierName, readonly number[]>>;
}

export const GO_V2_DEFAULT_RATING_POLICY: GoV2RatingPolicySnapshot = Object.freeze({
  schemaVersion: 1,
  code: 'LPV_GO_V2_TIER_POINTS_V1',
  lineupSelection: 'placement_deciding_active_result',
  ineligibleResultPoints: 0,
  tierPoints: Object.freeze({
    hard: Object.freeze([100, 92, 84, 76, 68, 60, 52, 44, 36, 28, 20, 16, 12, 8, 4, 2]),
    medium: Object.freeze([72, 66, 60, 54, 48, 42, 36, 30, 24, 18, 14, 10, 8, 6, 4, 2]),
    light: Object.freeze([48, 44, 40, 36, 32, 28, 24, 20, 16, 12, 10, 8, 6, 4, 2, 1]),
  }),
});

function stableTextCompare(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Joins complete per-tier bracket ledgers into the official tournament order.
 * Sporting ties remain ranges; the resolver's seed fallback supplies a unique
 * deterministic ordinal for exports and rating projections.
 */
export function mergeGoV2TierBracketPlacements(
  brackets: readonly GoV2CompletedTierBracket[],
): GoV2FinalPlacementRowDraft[] {
  const stageByTier = new Map<TierName, GoV2CompletedTierBracket>();
  for (const bracket of brackets) {
    if (stageByTier.has(bracket.tier)) {
      throw new SportsDomainError(
        'DUPLICATE_FINAL_PLACEMENT_TIER',
        'A final-placement ledger can contain only one completed bracket per tier.',
        { tier: bracket.tier },
      );
    }
    stageByTier.set(bracket.tier, bracket);
  }
  if (!stageByTier.size) {
    throw new SportsDomainError(
      'FINAL_PLACEMENT_BRACKET_REQUIRED',
      'At least one completed SE or DE bracket is required for final placements.',
    );
  }

  const rows: GoV2FinalPlacementRowDraft[] = [];
  const seenEntries = new Set<string>();
  let offset = 0;
  for (const tier of GO_V2_FINAL_PLACEMENT_TIER_ORDER) {
    const bracket = stageByTier.get(tier);
    if (!bracket) continue;
    const tierRows = [...bracket.result.placements]
      .sort((left, right) => left.place - right.place || stableTextCompare(left.entryId, right.entryId));
    for (const placement of tierRows) {
      if (seenEntries.has(placement.entryId)) {
        throw new SportsDomainError(
          'DUPLICATE_FINAL_PLACEMENT_ENTRY',
          'One entry cannot receive a place in more than one tier.',
          { entryId: placement.entryId, tier },
        );
      }
      seenEntries.add(placement.entryId);
      rows.push({
        entryId: placement.entryId,
        sourceStageId: bracket.stageId,
        sourceStageKey: bracket.stageKey,
        tier,
        tierPlace: placement.place,
        overallPlace: offset + placement.place,
        sportingTierPlaceRange: placement.sportingPlaceRange,
        sportingOverallPlaceRange: [
          offset + placement.sportingPlaceRange[0],
          offset + placement.sportingPlaceRange[1],
        ],
        initialSeed: placement.initialSeed,
        gamesPlayed: placement.gamesPlayed,
        losses: placement.losses,
        eliminatedByMatchId: placement.eliminatedByMatchId,
        basis: placement.basis,
      });
    }
    offset += tierRows.length;
  }
  if (rows.some((row, index) => row.overallPlace !== index + 1)) {
    throw new SportsDomainError(
      'INVALID_FINAL_PLACEMENT_ORDINALS',
      'Final-placement overall ordinals must be a complete deterministic 1..N sequence.',
    );
  }
  return rows;
}

export interface GoV2RatingShadowRow {
  playerId: string;
  beforeValue: number;
  deltaValue: number;
  afterValue: number;
  payload: Record<string, unknown>;
}

export interface GoV2RatingShadowProjection {
  rows: GoV2RatingShadowRow[];
  excluded: Array<Record<string, unknown>>;
}

function pointsForTierPlace(policy: GoV2RatingPolicySnapshot, tier: TierName, tierPlace: number): number {
  const table = policy.tierPoints[tier];
  const index = Math.max(0, Math.min(table.length - 1, Math.floor(tierPlace) - 1));
  return table[index];
}

/** Generates a shadow projection only from immutable final-placement lineups. */
export function buildGoV2RatingShadowProjection(
  placements: readonly GoV2PersistedFinalPlacementRow[],
  policy: GoV2RatingPolicySnapshot = GO_V2_DEFAULT_RATING_POLICY,
): GoV2RatingShadowProjection {
  if (policy.code !== 'LPV_GO_V2_TIER_POINTS_V1' || policy.schemaVersion !== 1) {
    throw new SportsDomainError(
      'UNSUPPORTED_RATING_POLICY',
      'The final-placement snapshot uses an unsupported rating policy.',
      { policyCode: policy.code, schemaVersion: policy.schemaVersion },
    );
  }
  const rows: GoV2RatingShadowRow[] = [];
  const excluded: Array<Record<string, unknown>> = [];
  const seenPlayers = new Set<string>();
  for (const placement of [...placements].sort((left, right) => left.overallPlace - right.overallPlace)) {
    const eligible = placement.lineupSnapshot.ratingEligibility !== 'ineligible';
    const deltaValue = eligible
      ? pointsForTierPlace(policy, placement.tier, placement.tierPlace)
      : policy.ineligibleResultPoints;
    for (const member of placement.lineupSnapshot.members) {
      if (!member.playerId) {
        excluded.push({
          entryId: placement.entryId,
          overallPlace: placement.overallPlace,
          memberOrder: member.memberOrder,
          reason: 'guest_without_player_id',
        });
        continue;
      }
      if (seenPlayers.has(member.playerId)) {
        throw new SportsDomainError(
          'DUPLICATE_FINAL_PLACEMENT_PLAYER',
          'One registered player cannot receive rating through multiple final-placement entries.',
          { playerId: member.playerId },
        );
      }
      if (!Number.isSafeInteger(member.ratingValue)) {
        throw new SportsDomainError(
          'INVALID_FINAL_LINEUP_RATING',
          'Immutable lineup rating values must be safe integers.',
          { playerId: member.playerId, ratingValue: member.ratingValue },
        );
      }
      seenPlayers.add(member.playerId);
      rows.push({
        playerId: member.playerId,
        beforeValue: member.ratingValue,
        deltaValue,
        afterValue: member.ratingValue + deltaValue,
        payload: {
          entryId: placement.entryId,
          tier: placement.tier,
          tierPlace: placement.tierPlace,
          overallPlace: placement.overallPlace,
          sportingTierPlaceRange: placement.sportingTierPlaceRange,
          sportingOverallPlaceRange: placement.sportingOverallPlaceRange,
          sourceStageId: placement.sourceStageId,
          lineupMatchId: placement.lineupSnapshot.matchId,
          lineupResultRevisionId: placement.lineupSnapshot.resultRevisionId,
          rosterRevisionId: placement.lineupSnapshot.rosterRevisionId,
          ratingEligibility: placement.lineupSnapshot.ratingEligibility,
          policyCode: policy.code,
        },
      });
    }
  }
  rows.sort((left, right) => stableTextCompare(left.playerId, right.playerId));
  return { rows, excluded };
}
