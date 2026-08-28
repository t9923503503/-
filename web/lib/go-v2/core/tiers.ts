import type {
  CrossPoolComparisonRow,
  ExactTierQuotas,
  TierAllocation,
  TierAllocationDto,
  TierMode,
  TierQuotas,
} from './types';
import { SportsDomainError } from './types';
import { rankCrossPoolCohort, toCrossPoolComparisonRowsDto } from './ranking';

export function calculateTierQuotas(
  teamCount: number,
  groupCount: number,
  options: { mode?: TierMode; hardCap?: number; quotas?: ExactTierQuotas } = {},
): TierQuotas {
  if (!Number.isInteger(teamCount) || teamCount < 3 || teamCount > 48) {
    throw new SportsDomainError('INVALID_TIER_TEAM_COUNT', 'Tier allocation supports 3 to 48 teams.', { teamCount });
  }
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > Math.floor(teamCount / 3)) {
    throw new SportsDomainError('INVALID_GROUP_COUNT', 'groupCount is not compatible with the team count.', {
      teamCount,
      groupCount,
    });
  }
  const configuredMode = options.mode ?? 'auto';
  if (configuredMode !== 'auto' && configuredMode !== 'two' && configuredMode !== 'three') {
    throw new SportsDomainError(
      'INVALID_TIER_MODE',
      'Tier mode must be auto, two or three.',
      { mode: options.mode },
    );
  }

  const hardCap = options.hardCap ?? 16;
  if (!Number.isInteger(hardCap) || hardCap < 2 || hardCap > 16) {
    throw new SportsDomainError('INVALID_HARD_CAP', 'hardCap must be an integer from 2 to 16.', { hardCap });
  }

  const requiredHardQualifiers = groupCount <= 8 ? groupCount * 2 : groupCount;
  if (hardCap < requiredHardQualifiers) {
    throw new SportsDomainError(
      'INVALID_HARD_CAP_FOR_GROUPS',
      groupCount <= 8
        ? 'Hard must contain every first- and second-place team when there are at most eight groups.'
        : 'Hard must contain every group winner when there are more than eight groups.',
      {
        hardCap,
        minimumHardCap: requiredHardQualifiers,
        groupCount,
        requiredPoolRanks: groupCount <= 8 ? [1, 2] : [1],
      },
    );
  }

  if (options.quotas !== undefined) {
    const quotasInput = options.quotas;
    const invalidFields = (['hard', 'medium', 'light'] as const)
      .filter((tier) => !Number.isSafeInteger(quotasInput[tier]) || quotasInput[tier] < 0);
    if (invalidFields.length > 0) {
      throw new SportsDomainError(
        'INVALID_TIER_QUOTAS',
        'Exact tier quotas must be non-negative safe integers.',
        { quotas: quotasInput, invalidFields },
      );
    }
    const allocated = quotasInput.hard + quotasInput.medium + quotasInput.light;
    if (allocated !== teamCount) {
      throw new SportsDomainError(
        'TIER_QUOTAS_TEAM_COUNT_MISMATCH',
        'Exact tier quotas must allocate every active team exactly once.',
        { quotas: quotasInput, teamCount, allocated },
      );
    }
    if (quotasInput.hard > hardCap || quotasInput.hard > 16) {
      throw new SportsDomainError(
        'TIER_HARD_QUOTA_EXCEEDS_CAP',
        'The exact Hard quota cannot exceed hardCap or the global limit of 16.',
        { hard: quotasInput.hard, hardCap, maximumHard: 16 },
      );
    }
    if (
      quotasInput.hard < requiredHardQualifiers
      || (groupCount <= 8 && quotasInput.hard !== requiredHardQualifiers)
    ) {
      throw new SportsDomainError(
        'INVALID_HARD_QUOTA_FOR_GROUPS',
        groupCount <= 8
          ? 'With at most eight groups, the exact Hard quota must equal all first- and second-place teams.'
          : 'With more than eight groups, the exact Hard quota must include every group winner.',
        {
          hard: quotasInput.hard,
          requiredHard: requiredHardQualifiers,
          groupCount,
          requiredPoolRanks: groupCount <= 8 ? [1, 2] : [1],
        },
      );
    }
    const inferredMode = quotasInput.medium > 0 ? 'three' : 'two';
    if (configuredMode !== 'auto' && configuredMode !== inferredMode) {
      throw new SportsDomainError(
        'TIER_MODE_QUOTA_MISMATCH',
        'tierMode conflicts with the supplied exact tier quotas.',
        { mode: configuredMode, inferredMode, quotas: quotasInput },
      );
    }
    const exactQuotas: TierQuotas = { mode: inferredMode, ...quotasInput };
    assertNoSingletonTiers(exactQuotas);
    return exactQuotas;
  }

  const mode = configuredMode === 'auto'
    ? (teamCount <= 30 ? 'two' : 'three')
    : configuredMode;
  const hard = groupCount <= 8 ? requiredHardQualifiers : Math.min(teamCount, hardCap);
  const remainder = teamCount - hard;
  const quotas: TierQuotas = mode === 'two'
    ? { mode, hard, medium: 0, light: remainder }
    : {
    mode,
    hard,
    medium: Math.ceil(remainder / 2),
    light: Math.floor(remainder / 2),
  };

  assertNoSingletonTiers(quotas);
  return quotas;
}

function assertNoSingletonTiers(quotas: TierQuotas): void {
  const singletonTiers = (['hard', 'medium', 'light'] as const).filter((tier) => quotas[tier] === 1);
  if (singletonTiers.length > 0) {
    throw new SportsDomainError(
      'SINGLETON_TIER_REQUIRES_PLACEMENT',
      'A one-team tier cannot create a competitive bracket; configure a placement policy or adjust the tier split.',
      {
        quotas,
        singletonTiers,
        alternatives: [
          'placement_from_pool_rank',
          'merge_with_adjacent_tier',
          'standalone_combined_bracket',
        ],
      },
    );
  }
}

export function allocateTiers(
  rows: readonly CrossPoolComparisonRow[],
  groupCount: number,
  options: { mode?: TierMode; hardCap?: number; quotas?: ExactTierQuotas } = {},
): TierAllocation {
  const ids = new Set(rows.map((row) => row.entryId));
  if (ids.size !== rows.length) {
    throw new SportsDomainError('DUPLICATE_TIER_ENTRY', 'Each entry can be allocated to only one tier.');
  }
  const quotas = calculateTierQuotas(rows.length, groupCount, options);
  const globallyRanked = rankCrossPoolCohort(rows);

  let hard: CrossPoolComparisonRow[];
  if (groupCount <= 8) {
    hard = globallyRanked.filter((row) => row.poolRank <= 2);
  } else {
    const winners = rankCrossPoolCohort(globallyRanked.filter((row) => row.poolRank === 1));
    const runnersUp = rankCrossPoolCohort(globallyRanked.filter((row) => row.poolRank === 2));
    hard = [...winners, ...runnersUp.slice(0, Math.max(0, quotas.hard - winners.length))];
  }

  if (hard.length !== quotas.hard) {
    throw new SportsDomainError(
      'TIER_STANDING_SNAPSHOT_INCOMPLETE',
      'The standing snapshot does not contain the required first/second-place teams for Hard.',
      { expectedHard: quotas.hard, actualHard: hard.length },
    );
  }

  const hardIds = new Set(hard.map((row) => row.entryId));
  const remaining = globallyRanked.filter((row) => !hardIds.has(row.entryId));
  const medium = quotas.mode === 'three' ? remaining.slice(0, quotas.medium) : [];
  const light = remaining.slice(quotas.mode === 'three' ? quotas.medium : 0);
  return { quotas, hard, medium, light };
}

export function toTierAllocationDto(allocation: TierAllocation): TierAllocationDto {
  return {
    quotas: { ...allocation.quotas },
    hard: toCrossPoolComparisonRowsDto(allocation.hard),
    medium: toCrossPoolComparisonRowsDto(allocation.medium),
    light: toCrossPoolComparisonRowsDto(allocation.light),
  };
}
