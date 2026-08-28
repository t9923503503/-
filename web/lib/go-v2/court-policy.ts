import type {
  ScheduleCourtPolicyBinding,
  ScheduleMatchInput,
  ScheduleTierProfile,
} from './scheduler/types';

export const LPV_TIER_COURT_POLICY_CODE = 'lpv_tier_courts_v1' as const;

export interface LpvNumberedCourt {
  id: string;
  courtNo: number;
}

export interface LpvTierCourtPolicyInput {
  courts: LpvNumberedCourt[];
  stageKind: NonNullable<ScheduleMatchInput['stageKind']>;
  tier: ScheduleMatchInput['tier'];
  tierProfile: ScheduleTierProfile;
  /** Must be supplied explicitly; strict is always the default. */
  overflowMode?: 'strict' | 'approved_overflow';
  overflowPenalty?: number;
}

export interface LpvTierCourtPolicyResult {
  courtPolicy: ScheduleCourtPolicyBinding;
  courtAffinityPenalties: Record<string, number>;
}

function normalizedCourts(courts: LpvNumberedCourt[]): LpvNumberedCourt[] {
  if (courts.length < 1 || courts.length > 6) {
    throw new RangeError('lpv_tier_courts_v1 requires between one and six courts');
  }
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const court of courts) {
    if (!court.id.trim() || ids.has(court.id)) throw new Error('Court ids must be non-empty and unique');
    if (!Number.isInteger(court.courtNo) || court.courtNo < 1 || court.courtNo > 6 || numbers.has(court.courtNo)) {
      throw new Error('Court numbers must be unique integers from 1 through 6');
    }
    ids.add(court.id);
    numbers.add(court.courtNo);
  }
  const sorted = courts.slice().sort((left, right) => left.courtNo - right.courtNo || left.id.localeCompare(right.id));
  sorted.forEach((court, index) => {
    if (court.courtNo !== index + 1) throw new Error('Court numbers must form a contiguous sequence starting at 1');
  });
  return sorted;
}

function preferredCourtNumbers(
  courtCount: number,
  tier: ScheduleMatchInput['tier'],
): number[] {
  if (courtCount === 1) return [1];
  if (tier === 'light') return [2];
  if (courtCount === 2) return tier === 'hard' || tier === 'medium' ? [1] : [1, 2];
  if (tier === 'medium') return [1];
  if (tier === 'hard') {
    return courtCount === 3 ? [3] : [3, 4];
  }
  return Array.from({ length: courtCount }, (_, index) => index + 1);
}

/**
 * Resolves the LPVolley physical-court matrix into concrete ids. Pool matches
 * are deliberately neutral. Courts 5-6 stay outside strict tier lanes and are
 * usable by tier matches only through an explicit approved-overflow binding.
 */
export function buildLpvTierCourtPolicy(input: LpvTierCourtPolicyInput): LpvTierCourtPolicyResult {
  const courts = normalizedCourts(input.courts);
  const allCourtIds = courts.map((court) => court.id).sort();
  const neutral = input.stageKind === 'pool' || input.tier == null;
  const preferredNos = neutral
    ? courts.map((court) => court.courtNo)
    : preferredCourtNumbers(Math.min(courts.length, 4), input.tier);
  const preferredCourtIds = courts
    .filter((court) => preferredNos.includes(court.courtNo))
    .map((court) => court.id)
    .sort();
  const mode = neutral ? 'neutral' : input.overflowMode ?? 'strict';
  const strictAllowedNos = !neutral
    && input.tier === 'hard'
    && input.tierProfile === 'hard_light'
    && courts.length >= 3
    ? [1, ...preferredNos]
    : preferredNos;
  const strictAllowedCourtIds = courts
    .filter((court) => strictAllowedNos.includes(court.courtNo))
    .map((court) => court.id)
    .sort();
  const allowedCourtIds = mode === 'strict' ? strictAllowedCourtIds : allCourtIds;
  const overflowPenalty = input.overflowPenalty ?? 10;
  if (!Number.isFinite(overflowPenalty) || overflowPenalty < 0) {
    throw new RangeError('Overflow penalty must be a finite non-negative number');
  }
  return {
    courtPolicy: {
      code: LPV_TIER_COURT_POLICY_CODE,
      mode,
      tierProfile: input.tierProfile,
      allowedCourtIds,
      preferredCourtIds,
    },
    courtAffinityPenalties: Object.fromEntries(allCourtIds.map((courtId) => [
      courtId,
      preferredCourtIds.includes(courtId) || neutral ? 0 : overflowPenalty,
    ])),
  };
}
