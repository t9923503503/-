import { SportsDomainError } from './types';
import {
  assertClassificationStrategy,
  describeClassificationTopology,
  type ClassificationFormatStrategyV2,
} from './classification';

export interface FutureFormatStrategyV2 {
  strategyId: string;
  version: string;
  kind: 'placement' | 'consolation' | 'swiss' | 'power_pool' | 'gauntlet';
}

export type GroupStageGuaranteeInput =
  | { format: 'round_robin_pool'; groupSizes: readonly (3 | 4)[] }
  | { format: 'modified_pool_4'; groupSizes: readonly 4[] };

export type PlayoffGuaranteeInput =
  | {
      format: 'single_elimination';
      bracketSizes?: readonly number[];
      bronzeMatch?: boolean;
    }
  | {
      format: 'double_elimination';
      bracketSizes?: readonly number[];
      resetFinal?: boolean;
    }
  | {
      format: 'classification';
      strategy: ClassificationFormatStrategyV2;
    }
  | { format: 'none' }
  | { format: 'extension'; strategy: FutureFormatStrategyV2 };

export interface MinimumGamesGuaranteeInput {
  teamCount: number;
  groupStage?: GroupStageGuaranteeInput;
  playoff: PlayoffGuaranteeInput;
  /** Defaults to true, matching LPVolley tier split where every team continues. */
  allTeamsAdvance?: boolean;
  minimumGamesTarget?: number;
}

export interface MinimumGamesDiagnostic {
  code: 'NOT_TRUE_TWO_LOSS_ELIMINATION' | 'NOT_ALL_TEAMS_ADVANCE';
  severity: 'warning';
  message: string;
}

export interface MinimumGamesGuarantee {
  teamCount: number;
  groupStageMinimum: number;
  playoffMinimum: number;
  totalMinimum: number;
  minimumGamesTarget: number | null;
  meetsTarget: boolean;
  diagnostics: readonly MinimumGamesDiagnostic[];
}

function assertTeamCount(teamCount: number): void {
  if (!Number.isSafeInteger(teamCount) || teamCount < 2 || teamCount > 48) {
    throw new SportsDomainError(
      'INVALID_FORMAT_TEAM_COUNT',
      'A tournament guarantee supports an integer team count from 2 to 48.',
      { teamCount },
    );
  }
}

function groupStageMinimum(teamCount: number, groupStage: GroupStageGuaranteeInput | undefined): number {
  if (!groupStage) return 0;
  if (teamCount < 3) {
    throw new SportsDomainError('INVALID_GROUP_TEAM_COUNT', 'A group stage requires at least three teams.', { teamCount });
  }
  const sizes = [...groupStage.groupSizes];
  if (sizes.length === 0 || sizes.reduce((sum, size) => sum + size, 0) !== teamCount) {
    throw new SportsDomainError(
      'GROUP_GUARANTEE_SIZE_MISMATCH',
      'Group sizes must allocate every tournament team exactly once.',
      { teamCount, groupSizes: sizes },
    );
  }
  if (groupStage.format === 'round_robin_pool') {
    if (sizes.some((size) => size !== 3 && size !== 4)) {
      throw new SportsDomainError('INVALID_GROUP_CAPACITY', 'Round Robin groups must contain three or four teams.');
    }
    return Math.min(...sizes.map((size) => size - 1));
  }
  if (sizes.some((size) => size !== 4)) {
    throw new SportsDomainError(
      'MODIFIED_POOL_REQUIRES_FOUR',
      'Modified Pool guarantees are available only when every group has four teams.',
    );
  }
  return 2;
}

function validateBracketSizes(
  teamCount: number,
  sizesInput: readonly number[] | undefined,
  minimumSize: number,
  allTeamsAdvance: boolean,
): number[] {
  const sizes = [...(sizesInput ?? [teamCount])];
  if (
    sizes.length === 0
    || sizes.some((size) => !Number.isSafeInteger(size) || size < minimumSize || size > 48)
  ) {
    throw new SportsDomainError(
      'INVALID_PLAYOFF_BRACKET_SIZES',
      `Every playoff bracket must contain ${minimumSize} to 48 teams.`,
      { bracketSizes: sizes, minimumSize },
    );
  }
  const allocated = sizes.reduce((sum, size) => sum + size, 0);
  if ((allTeamsAdvance && allocated !== teamCount) || (!allTeamsAdvance && allocated > teamCount)) {
    throw new SportsDomainError(
      'PLAYOFF_BRACKET_SIZE_MISMATCH',
      allTeamsAdvance
        ? 'Playoff bracket sizes must allocate every team when allTeamsAdvance is enabled.'
        : 'Playoff bracket sizes cannot allocate more teams than the tournament contains.',
      { teamCount, bracketSizes: sizes, allocated, allTeamsAdvance },
    );
  }
  return sizes;
}

export function analyzeMinimumGamesGuarantee(input: MinimumGamesGuaranteeInput): MinimumGamesGuarantee {
  assertTeamCount(input.teamCount);
  const allTeamsAdvance = input.allTeamsAdvance !== false;
  const target = input.minimumGamesTarget ?? null;
  if (target !== null && (!Number.isSafeInteger(target) || target < 0)) {
    throw new SportsDomainError(
      'INVALID_MINIMUM_GAMES_TARGET',
      'minimumGamesTarget must be a non-negative safe integer.',
      { minimumGamesTarget: target },
    );
  }

  const groupMinimum = groupStageMinimum(input.teamCount, input.groupStage);
  const diagnostics: MinimumGamesDiagnostic[] = [];
  let advancingPlayoffMinimum = 0;

  if (input.playoff.format === 'extension') {
    throw new SportsDomainError(
      'UNSUPPORTED_FORMAT_STRATEGY',
      'This format strategy is an extension point and has no V1 topology/guarantee implementation.',
      { strategy: input.playoff.strategy },
    );
  }
  if (input.playoff.format === 'single_elimination') {
    validateBracketSizes(input.teamCount, input.playoff.bracketSizes, 2, allTeamsAdvance);
    advancingPlayoffMinimum = 1;
  } else if (input.playoff.format === 'double_elimination') {
    validateBracketSizes(input.teamCount, input.playoff.bracketSizes, 3, allTeamsAdvance);
    // Even without GF2 every N>=3 participant has at least two played games;
    // the integrity caveat is about the Upper finalist being able to finish
    // after only its first loss, not about its number of games.
    advancingPlayoffMinimum = 2;
    if (input.playoff.resetFinal === false) {
      diagnostics.push({
        code: 'NOT_TRUE_TWO_LOSS_ELIMINATION',
        severity: 'warning',
        message: 'Without a reset final, an undefeated Upper finalist can be runner-up after only its first loss.',
      });
    }
  } else if (input.playoff.format === 'classification') {
    assertClassificationStrategy(input.playoff.strategy);
    advancingPlayoffMinimum = describeClassificationTopology(input.teamCount).minimumGamesGuaranteed;
  }

  let playoffMinimum = advancingPlayoffMinimum;
  if (!allTeamsAdvance && advancingPlayoffMinimum > 0) {
    playoffMinimum = 0;
    diagnostics.push({
      code: 'NOT_ALL_TEAMS_ADVANCE',
      severity: 'warning',
      message: 'The tournament-wide floor cannot include playoff games while some teams do not advance.',
    });
  }
  const totalMinimum = groupMinimum + playoffMinimum;
  return {
    teamCount: input.teamCount,
    groupStageMinimum: groupMinimum,
    playoffMinimum,
    totalMinimum,
    minimumGamesTarget: target,
    meetsTarget: target === null || totalMinimum >= target,
    diagnostics,
  };
}

export function assertMinimumGamesTarget(input: MinimumGamesGuaranteeInput): MinimumGamesGuarantee {
  const guarantee = analyzeMinimumGamesGuarantee(input);
  if (!guarantee.meetsTarget) {
    throw new SportsDomainError(
      'MINIMUM_GAMES_TARGET_UNSATISFIED',
      'The selected group/playoff strategies do not guarantee the requested number of games for every team.',
      {
        target: guarantee.minimumGamesTarget,
        guaranteed: guarantee.totalMinimum,
        groupStageMinimum: guarantee.groupStageMinimum,
        playoffMinimum: guarantee.playoffMinimum,
        diagnostics: guarantee.diagnostics,
      },
    );
  }
  return guarantee;
}
