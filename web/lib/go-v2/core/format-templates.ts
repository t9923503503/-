import {
  analyzeMinimumGamesGuarantee,
  assertMinimumGamesTarget,
  type FutureFormatStrategyV2,
  type MinimumGamesGuarantee,
} from './format-guarantees';
import {
  assertClassificationStrategy,
  describeClassificationTopology,
  LPV_CLASSIFICATION_STRATEGY_V1,
  type ClassificationFormatStrategyV2,
  type ClassificationTopologyPlan,
} from './classification';
import { partitionGroups, supportsModifiedPool4 } from './groups';
import { stableStructuralHash } from './hash';
import { MATCH_RULE_PRESETS, validateMatchRule } from './match-rules';
import { calculateTierQuotas } from './tiers';
import type {
  GroupPartition,
  MatchRule,
  MatchRulePreset,
  TierMode,
  TierQuotas,
  ValidationIssue,
  ValidationResult,
} from './types';
import { SportsDomainError } from './types';

export type TournamentFormatTemplateIdV2 =
  | 'lpv_groups_hl_se_v1'
  | 'lpv_groups_hml_se_v1'
  | 'lpv_groups_tiers_de_v1'
  | 'lpv_modified4_se_v1'
  | 'lpv_modified4_de_v1'
  | 'lpv_standalone_se_v1'
  | 'lpv_standalone_de_v1'
  | 'lpv_classification_v1';

export interface TournamentScheduleDefaultsV2 {
  courtCount: 4;
  allowedCourtCount: readonly [1, 6];
  localStartTime: '09:00';
  timezone: 'Asia/Yekaterinburg';
  refereeMode: 'hybrid';
  slotDurationMinutes: Readonly<Record<MatchRulePreset, number>>;
}

export type TournamentTemplateGroupStageV2 =
  | { enabled: false }
  | {
      enabled: true;
      format: 'round_robin_pool' | 'modified_pool_4';
      allowedGroupSizes: readonly (3 | 4)[];
      matchRule: MatchRule;
    };

export type TournamentTemplateTierPolicyV2 =
  | { mode: 'none'; allTeamsContinue: false }
  | { mode: TierMode; hardCap: 16; allTeamsContinue: true };

export type TournamentTemplatePlayoffV2 =
  | {
      format: 'single_elimination';
      matchRule: MatchRule;
      bronzeMatch: boolean;
    }
  | {
      format: 'double_elimination';
      matchRule: MatchRule;
      resetFinal: boolean;
    }
  | {
      format: 'classification';
      matchRule: MatchRule;
      strategy: ClassificationFormatStrategyV2;
    }
  | {
      format: 'extension';
      matchRule: MatchRule;
      strategy: FutureFormatStrategyV2;
    };

export interface TournamentFormatTemplateV2 {
  schemaVersion: 2;
  templateVersion: 1;
  id: TournamentFormatTemplateIdV2;
  label: string;
  availability: 'ready' | 'extension_only';
  teamCount: { min: number; max: 48 };
  groupStage: TournamentTemplateGroupStageV2;
  tierPolicy: TournamentTemplateTierPolicyV2;
  playoff: TournamentTemplatePlayoffV2;
  minimumGamesTarget: number;
  scheduleDefaults: TournamentScheduleDefaultsV2;
}

export interface MaterializeTournamentFormatInputV2 {
  templateId: TournamentFormatTemplateIdV2;
  teamCount: number;
  /** Expert-mode target override; it may strengthen but never silently weaken validation. */
  minimumGamesTarget?: number;
}

export interface MaterializedTournamentFormatV2 {
  schemaVersion: 2;
  templateVersion: 1;
  templateId: TournamentFormatTemplateIdV2;
  teamCount: number;
  groupPartition: GroupPartition | null;
  tierQuotas: TierQuotas | null;
  playoffBracketSizes: readonly number[];
  classificationPlan: ClassificationTopologyPlan | null;
  groupMatchRule: MatchRule | null;
  playoffMatchRule: MatchRule;
  playoff: TournamentTemplatePlayoffV2;
  scheduleDefaults: TournamentScheduleDefaultsV2;
  minimumGames: MinimumGamesGuarantee;
  snapshotHash: string;
}

const DEFAULT_SCHEDULE: TournamentScheduleDefaultsV2 = Object.freeze({
  courtCount: 4,
  allowedCourtCount: Object.freeze([1, 6] as const),
  localStartTime: '09:00',
  timezone: 'Asia/Yekaterinburg',
  refereeMode: 'hybrid',
  slotDurationMinutes: Object.freeze({
    single_21: 20,
    best_of_3_15: 40,
    best_of_3_21_15: 50,
  }),
});

const rr = Object.freeze({
  enabled: true,
  format: 'round_robin_pool',
  allowedGroupSizes: Object.freeze([3, 4] as const),
  matchRule: MATCH_RULE_PRESETS.single_21,
}) satisfies TournamentTemplateGroupStageV2;

const modified = Object.freeze({
  enabled: true,
  format: 'modified_pool_4',
  allowedGroupSizes: Object.freeze([4] as const),
  matchRule: MATCH_RULE_PRESETS.single_21,
}) satisfies TournamentTemplateGroupStageV2;

const standalone = Object.freeze({ enabled: false }) satisfies TournamentTemplateGroupStageV2;
const hl = Object.freeze({ mode: 'two', hardCap: 16, allTeamsContinue: true }) satisfies TournamentTemplateTierPolicyV2;
const hml = Object.freeze({ mode: 'three', hardCap: 16, allTeamsContinue: true }) satisfies TournamentTemplateTierPolicyV2;
const autoTiers = Object.freeze({ mode: 'auto', hardCap: 16, allTeamsContinue: true }) satisfies TournamentTemplateTierPolicyV2;
const noTiers = Object.freeze({ mode: 'none', allTeamsContinue: false }) satisfies TournamentTemplateTierPolicyV2;

function single(bronzeMatch = true): TournamentTemplatePlayoffV2 {
  return Object.freeze({
    format: 'single_elimination',
    matchRule: MATCH_RULE_PRESETS.best_of_3_21_15,
    bronzeMatch,
  });
}

function double(resetFinal = true): TournamentTemplatePlayoffV2 {
  return Object.freeze({
    format: 'double_elimination',
    matchRule: MATCH_RULE_PRESETS.best_of_3_21_15,
    resetFinal,
  });
}

function classification(): TournamentTemplatePlayoffV2 {
  return Object.freeze({
    format: 'classification',
    matchRule: MATCH_RULE_PRESETS.best_of_3_21_15,
    strategy: LPV_CLASSIFICATION_STRATEGY_V1,
  });
}

export const TOURNAMENT_FORMAT_TEMPLATES_V2 = Object.freeze({
  lpv_groups_hl_se_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_groups_hl_se_v1',
    label: 'Группы → Hard/Light → Single Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 6, max: 48 }),
    groupStage: rr,
    tierPolicy: hl,
    playoff: single(true),
    minimumGamesTarget: 3,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_groups_hml_se_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_groups_hml_se_v1',
    label: 'Группы → Hard/Medium/Light → Single Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 8, max: 48 }),
    groupStage: rr,
    tierPolicy: hml,
    playoff: single(true),
    minimumGamesTarget: 3,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_groups_tiers_de_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_groups_tiers_de_v1',
    label: 'Группы → тиры → True Double Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 7, max: 48 }),
    groupStage: rr,
    tierPolicy: autoTiers,
    playoff: double(true),
    minimumGamesTarget: 4,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_modified4_se_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_modified4_se_v1',
    label: 'Modified Pool 4 → Single Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 4, max: 48 }),
    groupStage: modified,
    tierPolicy: autoTiers,
    playoff: single(true),
    minimumGamesTarget: 3,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_modified4_de_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_modified4_de_v1',
    label: 'Modified Pool 4 → True Double Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 8, max: 48 }),
    groupStage: modified,
    tierPolicy: autoTiers,
    playoff: double(true),
    minimumGamesTarget: 4,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_standalone_se_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_standalone_se_v1',
    label: 'Standalone Single Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 2, max: 48 }),
    groupStage: standalone,
    tierPolicy: noTiers,
    playoff: single(true),
    minimumGamesTarget: 1,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_standalone_de_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_standalone_de_v1',
    label: 'Standalone True Double Elimination',
    availability: 'ready',
    teamCount: Object.freeze({ min: 3, max: 48 }),
    groupStage: standalone,
    tierPolicy: noTiers,
    playoff: double(true),
    minimumGamesTarget: 2,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
  lpv_classification_v1: Object.freeze({
    schemaVersion: 2,
    templateVersion: 1,
    id: 'lpv_classification_v1',
    label: 'Классификационная / consolation сетка',
    availability: 'ready',
    teamCount: Object.freeze({ min: 3, max: 48 }),
    groupStage: standalone,
    tierPolicy: noTiers,
    playoff: classification(),
    minimumGamesTarget: 3,
    scheduleDefaults: DEFAULT_SCHEDULE,
  }),
}) satisfies Readonly<Record<TournamentFormatTemplateIdV2, TournamentFormatTemplateV2>>;

export function listTournamentFormatTemplatesV2(): readonly TournamentFormatTemplateV2[] {
  return Object.values(TOURNAMENT_FORMAT_TEMPLATES_V2);
}

export function isTournamentFormatTemplateIdV2(value: string): value is TournamentFormatTemplateIdV2 {
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_FORMAT_TEMPLATES_V2, value);
}

export function getTournamentFormatTemplateV2(id: string): TournamentFormatTemplateV2 {
  const template = isTournamentFormatTemplateIdV2(id) ? TOURNAMENT_FORMAT_TEMPLATES_V2[id] : undefined;
  if (!template) {
    throw new SportsDomainError('UNKNOWN_FORMAT_TEMPLATE', 'Unknown TournamentFormatTemplateV2 id.', { id });
  }
  return template;
}

export function validateTournamentFormatTemplateV2(
  template: TournamentFormatTemplateV2,
): ValidationResult<TournamentFormatTemplateV2> {
  const issues: ValidationIssue[] = [];
  if (template.schemaVersion !== 2 || template.templateVersion !== 1) {
    issues.push({ path: 'version', code: 'INVALID_TEMPLATE_VERSION', message: 'V2 templates require schemaVersion=2 and templateVersion=1.' });
  }
  if (!/^[a-z0-9][a-z0-9_]{2,63}$/.test(template.id)) {
    issues.push({ path: 'id', code: 'INVALID_TEMPLATE_ID', message: 'Template id must be a stable lowercase identifier.' });
  }
  if (
    !Number.isSafeInteger(template.teamCount.min)
    || template.teamCount.min < 2
    || template.teamCount.min > template.teamCount.max
    || template.teamCount.max !== 48
  ) {
    issues.push({ path: 'teamCount', code: 'INVALID_TEMPLATE_TEAM_RANGE', message: 'Template team range must end at 48 and have a valid minimum.' });
  }
  if (!Number.isSafeInteger(template.minimumGamesTarget) || template.minimumGamesTarget < 0) {
    issues.push({ path: 'minimumGamesTarget', code: 'INVALID_MINIMUM_GAMES_TARGET', message: 'Minimum-games target must be non-negative.' });
  }
  if (template.groupStage.enabled) {
    const groupRule = validateMatchRule(template.groupStage.matchRule, 'groupStage.matchRule');
    if (!groupRule.ok) issues.push(...groupRule.issues);
    if (template.tierPolicy.mode === 'none' || !template.tierPolicy.allTeamsContinue) {
      issues.push({ path: 'tierPolicy', code: 'GROUP_TEMPLATE_REQUIRES_TIERS', message: 'Every grouped V2 preset must continue all teams into tiers.' });
    }
    if (
      template.groupStage.format === 'modified_pool_4'
      && (template.groupStage.allowedGroupSizes.length !== 1 || template.groupStage.allowedGroupSizes[0] !== 4)
    ) {
      issues.push({ path: 'groupStage.allowedGroupSizes', code: 'MODIFIED_POOL_REQUIRES_FOUR', message: 'Modified Pool permits only size four.' });
    }
  } else if (template.tierPolicy.mode !== 'none') {
    issues.push({ path: 'tierPolicy', code: 'STANDALONE_TEMPLATE_HAS_TIERS', message: 'Standalone templates cannot declare pool tiers.' });
  }
  const playoffRule = validateMatchRule(template.playoff.matchRule, 'playoff.matchRule');
  if (!playoffRule.ok) issues.push(...playoffRule.issues);
  if (template.playoff.format === 'classification') {
    try {
      assertClassificationStrategy(template.playoff.strategy);
    } catch (error) {
      issues.push({
        path: 'playoff.strategy',
        code: error instanceof SportsDomainError ? error.code : 'INVALID_CLASSIFICATION_STRATEGY',
        message: error instanceof Error ? error.message : 'Classification strategy is invalid.',
      });
    }
  }
  if ((template.playoff.format === 'extension') !== (template.availability === 'extension_only')) {
    issues.push({ path: 'availability', code: 'TEMPLATE_AVAILABILITY_MISMATCH', message: 'Only extension strategies may be marked extension_only.' });
  }
  if (
    template.scheduleDefaults.courtCount !== 4
    || template.scheduleDefaults.allowedCourtCount[0] !== 1
    || template.scheduleDefaults.allowedCourtCount[1] !== 6
    || template.scheduleDefaults.localStartTime !== '09:00'
  ) {
    issues.push({ path: 'scheduleDefaults', code: 'INVALID_SCHEDULE_DEFAULTS', message: 'V1 defaults are four courts, 1-6 allowed and 09:00 start.' });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: template, issues: [] };
}

function templateGroupPartition(template: TournamentFormatTemplateV2, teamCount: number): GroupPartition | null {
  if (!template.groupStage.enabled) return null;
  const partition = partitionGroups(teamCount);
  if (template.groupStage.format === 'modified_pool_4' && !supportsModifiedPool4(partition)) {
    throw new SportsDomainError(
      'MODIFIED_POOL_REQUIRES_ALL_FOURS',
      'Modified Pool template requires a team count that partitions entirely into groups of four.',
      { teamCount, partition },
    );
  }
  return partition;
}

export function materializeTournamentFormatTemplateV2(
  input: MaterializeTournamentFormatInputV2,
): MaterializedTournamentFormatV2 {
  const template = getTournamentFormatTemplateV2(input.templateId);
  const validation = validateTournamentFormatTemplateV2(template);
  if (!validation.ok) {
    throw new SportsDomainError('INVALID_FORMAT_TEMPLATE', 'Tournament format template failed validation.', {
      templateId: template.id,
      issues: validation.issues,
    });
  }
  if (template.groupStage.enabled && input.teamCount === 5) {
    // Preserve the domain-specific alternatives exposed by partitionGroups
    // instead of hiding them behind a generic template-range error.
    partitionGroups(input.teamCount);
  }
  if (!Number.isSafeInteger(input.teamCount) || input.teamCount < template.teamCount.min || input.teamCount > 48) {
    throw new SportsDomainError('FORMAT_TEMPLATE_TEAM_COUNT_UNSUPPORTED', 'Team count is outside this template range.', {
      templateId: template.id,
      teamCount: input.teamCount,
      supported: template.teamCount,
    });
  }
  if (template.playoff.format === 'extension') {
    // Running this through the guarantee analyzer also freezes the public
    // unsupported-strategy diagnostic and prevents an accidental fake topology.
    analyzeMinimumGamesGuarantee({
      teamCount: input.teamCount,
      playoff: { format: 'extension', strategy: template.playoff.strategy },
    });
    throw new SportsDomainError('UNSUPPORTED_FORMAT_STRATEGY', 'Extension-only template cannot be materialized in V1.');
  }

  const groupPartition = templateGroupPartition(template, input.teamCount);
  const tierQuotas = groupPartition && template.tierPolicy.mode !== 'none'
    ? calculateTierQuotas(input.teamCount, groupPartition.groupCount, {
        mode: template.tierPolicy.mode,
        hardCap: template.tierPolicy.hardCap,
      })
    : null;
  const playoffBracketSizes = tierQuotas
    ? [tierQuotas.hard, tierQuotas.medium, tierQuotas.light].filter((size) => size > 0)
    : template.playoff.format === 'classification'
      ? []
      : [input.teamCount];
  const classificationPlan = template.playoff.format === 'classification'
    ? describeClassificationTopology(input.teamCount)
    : null;
  const minimumGamesTarget = input.minimumGamesTarget ?? template.minimumGamesTarget;
  const groupStage = groupPartition && template.groupStage.enabled
    ? template.groupStage.format === 'modified_pool_4'
      ? { format: 'modified_pool_4' as const, groupSizes: groupPartition.capacities as readonly 4[] }
      : { format: 'round_robin_pool' as const, groupSizes: groupPartition.capacities }
    : undefined;
  const minimumGames = assertMinimumGamesTarget({
    teamCount: input.teamCount,
    ...(groupStage ? { groupStage } : {}),
    playoff: template.playoff.format === 'single_elimination'
      ? {
          format: 'single_elimination',
          bracketSizes: playoffBracketSizes,
          bronzeMatch: template.playoff.bronzeMatch,
        }
      : template.playoff.format === 'double_elimination'
        ? {
            format: 'double_elimination',
            bracketSizes: playoffBracketSizes,
            resetFinal: template.playoff.resetFinal,
          }
        : {
            format: 'classification',
            strategy: template.playoff.strategy,
          },
    allTeamsAdvance: true,
    minimumGamesTarget,
  });
  const snapshotWithoutHash = {
    schemaVersion: 2 as const,
    templateVersion: 1 as const,
    templateId: template.id,
    teamCount: input.teamCount,
    groupPartition,
    tierQuotas,
    playoffBracketSizes,
    classificationPlan,
    groupMatchRule: template.groupStage.enabled ? template.groupStage.matchRule : null,
    playoffMatchRule: template.playoff.matchRule,
    playoff: template.playoff,
    scheduleDefaults: template.scheduleDefaults,
    minimumGames,
  };
  return {
    ...snapshotWithoutHash,
    snapshotHash: stableStructuralHash(snapshotWithoutHash),
  };
}
