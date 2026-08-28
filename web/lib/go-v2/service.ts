import { createHash } from 'crypto';

import type { PoolClient } from 'pg';

import {
  generateDoubleElimination,
  generateClassificationTopology,
  generateModifiedPool4,
  generateRoundRobinPairings,
  generateSingleElimination,
  getTournamentFormatTemplateV2,
  materializeTournamentFormatTemplateV2,
  MATCH_RULE_PRESETS,
  seedGroupsSnake,
  SportsDomainError,
  swapGroupSlots,
  type BracketParticipant,
  type ExactTierQuotas,
  type GroupDraw,
  type MatchRule,
  type MatchRulePreset,
  type MaterializedTournamentFormatV2,
  type SeedEntry,
  type TierName,
  type TournamentFormatTemplateV2,
  validateMatchRule,
} from './core';
import { persistClassificationStage } from './classification-persistence';
import {
  buildCompetitionTierPipeline,
  type CompetitionTierPipelineDto,
} from './competition';
import {
  solveSchedule,
  validateSchedule,
  SCHEDULE_SOLVER_VERSION,
  type ScheduleAssignment,
  type ScheduleRefereeMode,
  type ScheduleRefereeRequirement,
  type ScheduleSolverInput,
} from './scheduler';
import { buildLpvTierCourtPolicy } from './court-policy';
import {
  applyGoV2CourtPolicyExceptions,
  assertGoV2CourtPolicyExceptionNotExpired,
  parseGoV2CourtPolicyExceptionRequest,
  type GoV2CourtPolicyExceptionBinding,
  type GoV2CourtPolicyExceptionRequest,
} from './court-policy-exceptions';
import {
  buildGoV2ScheduleAssignmentDiff,
  parseGoV2ScheduleDeferRequest,
  parseGoV2ScheduleDeferReleaseRequest,
  scheduleDeferRequiresDirector,
} from './schedule-defer';
import {
  goV2MatchRuleDurationMinutes,
  parseGoV2EffectiveFromRoundNo,
  resolveGoV2StageRuleScope,
  type GoV2StageRuleMatchState,
} from './stage-rules';
import {
  attendanceReinstatementRisk,
  parseGoV2AttendanceReinstatementDecision,
  parseGoV2AttendanceReinstatementTarget,
  uniqueSortedIds,
} from './attendance-reinstatement';

import {
  assertGoV2Uuid,
  GoV2Error,
  type GoV2CommandEnvelope,
  type GoV2CommitResponse,
  type GoV2LifecycleState,
  type GoV2OperationKind,
  type GoV2PreviewResponse,
  type GoV2Risk,
  type GoV2StructureResponse,
  normalizeGoV2Risk,
  parseGoV2CommandEnvelope,
} from './contracts';
import { assertGoV2OperationAuthority } from './authorization';
import {
  advanceAggregateVersion,
  assessDownstreamImpact,
  applyCompensatingUndo,
  appendAuditEvent,
  appendCascadeBatch,
  appendCascadeMatchRows,
  appendIncident,
  appendResultRevision,
  assertExpectedVersion,
  assertReceiptMatches,
  assertTournamentEntryMembership,
  consumeOperationPreview,
  createOperationPreview,
  ensureGoV2StateForUpdate,
  enqueueNotificationOutbox,
  findCommandReceipt,
  getOperationPreviewForUpdate,
  loadMutationMatchSnapshots,
  loadQualificationCascadeScheduleContext,
  loadQualificationCascadeTopologyPlan,
  loadActiveGoV2CourtPolicyExceptions,
  loadScheduleSource,
  loadCompetitionTierSource,
  loadSeedEntries,
  persistBracket,
  persistCompetitionTierBrackets,
  persistGoV2CourtPolicyExceptionRevision,
  persistGoV2StageRuleChange,
  persistQualificationCascadeRematerialization,
  persistGoV2FinalPlacementSnapshot,
  persistPendingReplayQualificationInvalidation,
  persistRetainedQualificationCorrectionSnapshots,
  persistDraw,
  persistDrawUnlock,
  persistEntryWithdrawal,
  persistRegistrationLock,
  persistReservePromotion,
  persistRosterReplacement,
  persistScheduleVersion,
  persistStageGraph,
  previewCompensatingUndo,
  prepareDrawUnlock,
  prepareIncompleteResultPayload,
  prepareNoWinnerResultPayload,
  prepareEntryWithdrawal,
  preparePlayedResultPayload,
  prepareReservePromotion,
  prepareRosterReplacement,
  prepareTechnicalResultPayload,
  readGoV2Structure,
  reconcileGoV2TournamentProgress,
  requireMutationReason,
  resetDownstreamForReplay,
  resolveNoWinnerDownstreamSlots,
  saveCommandReceipt,
  resolveDownstreamSlots,
  withGoV2Transaction,
  type GoV2ImpactPreview,
  type GoV2QualificationCorrectionContext,
  type GoV2QualificationCascadeScheduleContext,
  type CompetitionResultOverride,
  type CompetitionTierSource,
} from './repository';
import {
  consumeGoV2RedApproval,
  persistGoV2AttendanceMutation,
  persistGoV2AttendanceReinstatement,
  persistGoV2Disruption,
  persistGoV2DisruptionResolution,
  persistGoV2FinishReviewDecision,
  persistGoV2PauseResolution,
  prepareGoV2AttendanceMutation,
  prepareGoV2Disruption,
  prepareGoV2DisruptionResolution,
} from './live-operations';

const PUBLIC_NOTIFICATION_OPERATIONS = new Set<GoV2OperationKind>([
  'draw.commit',
  'bracket.lock',
  'schedule.generate.commit',
  'schedule.replan.commit',
  'schedule.policy.commit',
  'schedule.defer.commit',
  'schedule.defer.release.commit',
  'stage.rules.commit',
  'match.finish.accept',
  'match.result.revise',
  'match.paper_import.commit',
  'roster.replacement.commit',
  'reserve.promotion.commit',
  'entry.withdrawal.commit',
  'attendance.commit',
  'attendance.reinstate.commit',
  'disruption.commit',
  'disruption.resolve.commit',
  'match.pause_resolution.commit',
  'incident.commit',
  'mutation.undo.commit',
]);

const PROGRESS_RECONCILIATION_OPERATIONS = new Set<GoV2OperationKind>([
  'match.finish.accept',
  'match.result.revise',
  'entry.withdrawal.commit',
  'attendance.reinstate.commit',
  'match.paper_import.commit',
  'incident.commit',
  'mutation.undo.commit',
]);

export interface GoV2Actor {
  id: string;
  role: 'admin' | 'operator' | 'viewer';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new GoV2Error(400, 'NON_FINITE_NUMBER', 'Request contains a non-finite number');
  }
  return value;
}

function hashObject(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const GO_V2_MATCH_RULE_PRESETS = Object.freeze(Object.keys(MATCH_RULE_PRESETS) as MatchRulePreset[]);
const GO_V2_BRACKET_TYPES = Object.freeze(['single_elimination', 'double_elimination'] as const);
type GoV2BracketType = (typeof GO_V2_BRACKET_TYPES)[number];
type GoV2MaterializedPlayoffFormat = GoV2BracketType | 'classification';

export function resolveGoV2BracketType(value: unknown, path = 'bracketType'): GoV2BracketType {
  const bracketType = String(value ?? 'single_elimination');
  if (!GO_V2_BRACKET_TYPES.includes(bracketType as GoV2BracketType)) {
    throw new GoV2Error(
      422,
      'INVALID_BRACKET_TYPE',
      `${path} must be single_elimination or double_elimination`,
      { path, value: bracketType, allowed: [...GO_V2_BRACKET_TYPES] },
    );
  }
  return bracketType as GoV2BracketType;
}

export function resolveGoV2MatchRule(value: unknown, path = 'matchRule'): MatchRule {
  const configured = asRecord(value);
  const presetValue = value === undefined || value === null
    ? 'single_21'
    : typeof value === 'string'
      ? value
      : configured.preset;
  const preset = String(presetValue ?? '');
  if (!GO_V2_MATCH_RULE_PRESETS.includes(preset as MatchRulePreset)) {
    throw new GoV2Error(
      422,
      'UNKNOWN_MATCH_RULE_PRESET',
      `${path}.preset is not supported by Tournament Engine V2`,
      { path: `${path}.preset`, value: preset, allowed: [...GO_V2_MATCH_RULE_PRESETS] },
    );
  }

  const source = MATCH_RULE_PRESETS[preset as MatchRulePreset];
  const configuredSets = configured.sets;
  if (configuredSets !== undefined && !Array.isArray(configuredSets)) {
    throw new GoV2Error(
      422,
      'INVALID_MATCH_RULE',
      `${path}.sets must be an array when supplied`,
      { path: `${path}.sets` },
    );
  }
  if (configured.setsToWin !== undefined && !Array.isArray(configuredSets)) {
    throw new GoV2Error(
      422,
      'INVALID_MATCH_RULE',
      `${path}.setsToWin requires an explicit sets array`,
      { path: `${path}.setsToWin` },
    );
  }
  const rule: MatchRule = Array.isArray(configuredSets)
    ? {
        preset: preset as MatchRulePreset,
        setsToWin: Number(configured.setsToWin ?? (configuredSets.length === 1 ? 1 : 2)),
        sets: configuredSets.map((rawSet) => {
          const set = asRecord(rawSet);
          return {
            targetPoints: Number(set.targetPoints),
            winBy: Number(set.winBy ?? 2),
            pointCap: set.pointCap == null ? null : Number(set.pointCap),
          };
        }),
      }
    : {
        preset: preset as MatchRulePreset,
        setsToWin: source.setsToWin,
        sets: source.sets.map((set) => ({
          ...set,
          winBy: configured.winBy === undefined ? set.winBy : Number(configured.winBy),
          pointCap: configured.pointCap === undefined
            ? set.pointCap
            : configured.pointCap === null
              ? null
              : Number(configured.pointCap),
        })),
      };
  const validation = validateMatchRule(rule, path);
  if (!validation.ok) {
    throw new GoV2Error(
      422,
      'INVALID_MATCH_RULE',
      `${path} contains an invalid winBy, pointCap or set definition`,
      { path, issues: validation.issues },
    );
  }
  return validation.value;
}

export function parseExactTierQuotas(value: unknown, path = 'tierQuotas'): ExactTierQuotas | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GoV2Error(422, 'INVALID_TIER_QUOTAS', `${path} must be an object`, { path });
  }
  const configured = value as Record<string, unknown>;
  const quotas = {
    hard: configured.hard,
    medium: configured.medium,
    light: configured.light,
  };
  const invalidFields = (['hard', 'medium', 'light'] as const)
    .filter((tier) => !Number.isSafeInteger(quotas[tier]) || Number(quotas[tier]) < 0);
  if (invalidFields.length > 0) {
    throw new GoV2Error(
      422,
      'INVALID_TIER_QUOTAS',
      `${path} must contain non-negative safe integer hard, medium and light values`,
      { path, invalidFields },
    );
  }
  return {
    hard: Number(quotas.hard),
    medium: Number(quotas.medium),
    light: Number(quotas.light),
  };
}

interface LockedTournamentFormatProjection {
  template: TournamentFormatTemplateV2;
  materialized: MaterializedTournamentFormatV2;
  formatSnapshot: Record<string, unknown>;
  poolFormat: 'round_robin_pool' | 'modified_pool_4' | null;
  tierMode: 'auto' | 'two' | 'three' | 'none';
  tierQuotas: ExactTierQuotas | null;
  playoffFormat: GoV2MaterializedPlayoffFormat;
  groupMatchRule: MatchRule | null;
  playoffMatchRule: MatchRule;
  bronzeEnabled: boolean;
  resetFinalEnabled: boolean;
  refereeMode: ScheduleRefereeMode;
}

function lockedFormatMismatch(path: string, supplied: unknown, locked: unknown): never {
  throw new GoV2Error(
    409,
    'LOCKED_FORMAT_OVERRIDE_FORBIDDEN',
    `${path} is fixed by the registration lock and cannot be overridden`,
    { path, supplied, locked },
  );
}

function assertLockedStructuralValue(path: string, supplied: unknown, locked: unknown): void {
  if (supplied !== undefined && hashObject(supplied) !== hashObject(locked)) {
    lockedFormatMismatch(path, supplied, locked);
  }
}

function assertLockedMatchRule(path: string, supplied: unknown, locked: MatchRule): void {
  if (supplied === undefined) return;
  const normalized = resolveGoV2MatchRule(supplied, path);
  if (hashObject(normalized) !== hashObject(locked)) {
    lockedFormatMismatch(path, normalized, locked);
  }
}

async function loadLockedTournamentFormat(
  client: PoolClient,
  tournamentId: string,
): Promise<LockedTournamentFormatProjection> {
  const result = await client.query(
    `SELECT metadata->>'formatTemplateId' AS template_id,
            metadata->'formatTemplateSnapshot' AS template_snapshot
     FROM go_v2_tournament_state
     WHERE tournament_id = $1`,
    [tournamentId],
  );
  const templateId = String(result.rows[0]?.template_id ?? '').trim();
  const storedSnapshot = asRecord(result.rows[0]?.template_snapshot);
  if (!templateId || !Object.keys(storedSnapshot).length) {
    throw new GoV2Error(
      409,
      'FORMAT_TEMPLATE_LOCK_REQUIRED',
      'Registration must lock a TournamentFormatTemplateV2 before draw, stages, bracket or schedule operations',
    );
  }
  try {
    const template = getTournamentFormatTemplateV2(templateId);
    const storedTemplateId = String(storedSnapshot.templateId ?? '');
    const teamCount = Number(storedSnapshot.teamCount);
    if (storedTemplateId !== template.id || !Number.isSafeInteger(teamCount)) {
      throw new GoV2Error(
        409,
        'LOCKED_FORMAT_SNAPSHOT_INVALID',
        'The locked tournament format snapshot has invalid identity or team count',
        { templateId, storedTemplateId, teamCount },
      );
    }
    const materialized = materializeTournamentFormatTemplateV2({
      templateId: template.id,
      teamCount,
    });
    if (hashObject(storedSnapshot) !== hashObject(materialized)) {
      throw new GoV2Error(
        409,
        'LOCKED_FORMAT_SNAPSHOT_MISMATCH',
        'The stored tournament format snapshot does not match its versioned template',
        { templateId, expectedSnapshotHash: materialized.snapshotHash, storedSnapshotHash: storedSnapshot.snapshotHash },
      );
    }
    if (template.playoff.format === 'extension') {
      throw new GoV2Error(
        409,
        'UNSUPPORTED_FORMAT_STRATEGY',
        'The locked extension-only template is not executable in V1',
      );
    }
    const groupMatchRule = materialized.groupMatchRule
      ? resolveGoV2MatchRule(materialized.groupMatchRule, 'locked.groupMatchRule')
      : null;
    const playoffMatchRule = resolveGoV2MatchRule(materialized.playoffMatchRule, 'locked.playoffMatchRule');
    const poolFormat = template.groupStage.enabled ? template.groupStage.format : null;
    const tierMode = template.tierPolicy.mode;
    const tierQuotas = materialized.tierQuotas
      ? {
          hard: materialized.tierQuotas.hard,
          medium: materialized.tierQuotas.medium,
          light: materialized.tierQuotas.light,
        }
      : null;
    const bronzeEnabled = template.playoff.format === 'single_elimination' && template.playoff.bronzeMatch;
    const resetFinalEnabled = template.playoff.format === 'double_elimination' && template.playoff.resetFinal;
    const formatSnapshot: Record<string, unknown> = {
      schemaVersion: materialized.schemaVersion,
      templateVersion: materialized.templateVersion,
      templateId: materialized.templateId,
      snapshotHash: materialized.snapshotHash,
      teamCount: materialized.teamCount,
      groupPartition: materialized.groupPartition,
      poolFormat,
      tierMode,
      tierQuotas: materialized.tierQuotas,
      hardCap: template.tierPolicy.mode === 'none' ? null : template.tierPolicy.hardCap,
      playoffFormat: template.playoff.format,
      bronzeEnabled,
      resetFinalEnabled,
      matchRules: {
        groups: groupMatchRule,
        playoffs: playoffMatchRule,
      },
      minimumGamesTarget: template.minimumGamesTarget,
      scheduleDefaults: materialized.scheduleDefaults,
    };
    return {
      template,
      materialized,
      formatSnapshot,
      poolFormat,
      tierMode,
      tierQuotas,
      playoffFormat: template.playoff.format,
      groupMatchRule,
      playoffMatchRule,
      bronzeEnabled,
      resetFinalEnabled,
      refereeMode: materialized.scheduleDefaults.refereeMode,
    };
  } catch (error) {
    if (error instanceof GoV2Error) throw error;
    if (error instanceof SportsDomainError) {
      throw new GoV2Error(409, error.code, error.message, { ...error.details });
    }
    throw error;
  }
}

function assertLockedFormatConfig(
  payload: Record<string, unknown>,
  locked: LockedTournamentFormatProjection,
): void {
  const config = asRecord(payload.formatConfig);
  assertLockedStructuralValue('formatConfig.templateId', config.templateId, locked.template.id);
  assertLockedStructuralValue('formatConfig.poolMode', config.poolMode, locked.poolFormat);
  assertLockedStructuralValue(
    'formatConfig.groupSizes',
    config.groupSizes,
    locked.materialized.groupPartition?.capacities ?? null,
  );
  const configuredRules = asRecord(config.matchRules);
  if (locked.groupMatchRule) {
    assertLockedMatchRule('formatConfig.matchRules.groups', configuredRules.groups, locked.groupMatchRule);
  } else if (configuredRules.groups !== undefined && configuredRules.groups !== null) {
    lockedFormatMismatch('formatConfig.matchRules.groups', configuredRules.groups, null);
  }
  assertLockedMatchRule('formatConfig.matchRules.playoffs', configuredRules.playoffs, locked.playoffMatchRule);
  assertLockedStructuralValue('formatConfig.tierMode', config.tierMode, locked.tierMode);
  assertLockedStructuralValue(
    'formatConfig.hardCap',
    config.hardCap,
    locked.template.tierPolicy.mode === 'none' ? null : locked.template.tierPolicy.hardCap,
  );
  if (config.tierQuotas !== undefined) {
    const suppliedQuotas = parseExactTierQuotas(config.tierQuotas, 'formatConfig.tierQuotas') ?? null;
    assertLockedStructuralValue('formatConfig.tierQuotas', suppliedQuotas, locked.tierQuotas);
  }
  assertLockedStructuralValue('formatConfig.playoffFormat', config.playoffFormat, locked.playoffFormat);
  assertLockedStructuralValue('formatConfig.bronzeEnabled', config.bronzeEnabled, locked.bronzeEnabled);
  assertLockedStructuralValue('formatConfig.resetFinalEnabled', config.resetFinalEnabled, locked.resetFinalEnabled);
  assertLockedStructuralValue(
    'formatConfig.minimumGamesTarget',
    config.minimumGamesTarget,
    locked.template.minimumGamesTarget,
  );
}

function assertLockedBracketOverrides(
  payload: Record<string, unknown>,
  locked: LockedTournamentFormatProjection,
): void {
  assertLockedFormatConfig(payload, locked);
  assertLockedStructuralValue('tierMode', payload.tierMode, locked.tierMode);
  assertLockedStructuralValue('hardCap', payload.hardCap, locked.template.tierPolicy.mode === 'none'
    ? null
    : locked.template.tierPolicy.hardCap);
  if (payload.tierQuotas !== undefined) {
    const suppliedQuotas = parseExactTierQuotas(payload.tierQuotas) ?? null;
    assertLockedStructuralValue('tierQuotas', suppliedQuotas, locked.tierQuotas);
  }
  assertLockedStructuralValue('bracketType', payload.bracketType, locked.playoffFormat);
  assertLockedStructuralValue('playoffFormat', payload.playoffFormat, locked.playoffFormat);
  assertLockedMatchRule('matchRule', payload.matchRule, locked.playoffMatchRule);
  assertLockedStructuralValue('bronzeMatch', payload.bronzeMatch, locked.bronzeEnabled);
  assertLockedStructuralValue('bronzeEnabled', payload.bronzeEnabled, locked.bronzeEnabled);
  assertLockedStructuralValue('resetFinal', payload.resetFinal, locked.resetFinalEnabled);
  assertLockedStructuralValue('resetFinalEnabled', payload.resetFinalEnabled, locked.resetFinalEnabled);

  const tierSettings = asRecord(payload.tierSettings);
  for (const tier of ['hard', 'medium', 'light'] as const) {
    const setting = asRecord(tierSettings[tier]);
    assertLockedStructuralValue(`tierSettings.${tier}.bracketType`, setting.bracketType, locked.playoffFormat);
    assertLockedMatchRule(`tierSettings.${tier}.matchRule`, setting.matchRule, locked.playoffMatchRule);
    assertLockedStructuralValue(`tierSettings.${tier}.bronzeMatch`, setting.bronzeMatch, locked.bronzeEnabled);
    assertLockedStructuralValue(`tierSettings.${tier}.resetFinal`, setting.resetFinal, locked.resetFinalEnabled);
  }
}

async function projectLockedStageGraphPayload(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const locked = await loadLockedTournamentFormat(client, tournamentId);
  if (!locked.poolFormat || !locked.groupMatchRule || !locked.tierQuotas || !locked.materialized.groupPartition) {
    throw new GoV2Error(
      409,
      'GROUP_STAGES_NOT_AVAILABLE_FOR_LOCKED_TEMPLATE',
      'Standalone formats materialize their playoff directly through bracket preview and lock',
      { templateId: locked.template.id },
    );
  }
  const stagesInput = Array.isArray(payload.stages) ? payload.stages : [];
  const stages = stagesInput.map(asRecord);
  const groupStages = stages.filter((stage) => ['round_robin_pool', 'modified_pool_4'].includes(String(stage.stageType)));
  const tierSplitStages = stages.filter((stage) => String(stage.stageType) === 'tier_split');
  if (groupStages.length !== 1 || tierSplitStages.length !== 1) {
    throw new GoV2Error(
      422,
      'LOCKED_STAGE_GRAPH_SHAPE_MISMATCH',
      'A grouped template requires exactly one group stage and one tier_split stage',
      { groupStageCount: groupStages.length, tierSplitStageCount: tierSplitStages.length },
    );
  }
  const groupStage = groupStages[0];
  if (String(groupStage.stageType) !== locked.poolFormat) {
    lockedFormatMismatch('stages.groups.stageType', groupStage.stageType, locked.poolFormat);
  }
  assertLockedMatchRule('stages.groups.matchRule', groupStage.matchRule, locked.groupMatchRule);
  const groupConfiguration = asRecord(groupStage.configuration);
  assertLockedStructuralValue(
    'stages.groups.configuration.groupSizes',
    groupConfiguration.groupSizes,
    locked.materialized.groupPartition.capacities,
  );

  const tierSplitStage = tierSplitStages[0];
  assertLockedMatchRule('stages.tier_split.matchRule', tierSplitStage.matchRule, locked.groupMatchRule);
  const tierSplitConfiguration = asRecord(tierSplitStage.configuration);
  if (tierSplitConfiguration.tiers !== undefined) {
    assertLockedStructuralValue(
      'stages.tier_split.configuration.tiers',
      parseExactTierQuotas(tierSplitConfiguration.tiers, 'stages.tier_split.configuration.tiers'),
      locked.tierQuotas,
    );
  }
  assertLockedStructuralValue(
    'stages.tier_split.configuration.hardCap',
    tierSplitConfiguration.hardCap,
    locked.template.tierPolicy.mode === 'none' ? null : locked.template.tierPolicy.hardCap,
  );

  const lockedTierCounts: Array<[TierName, number]> = [
    ['hard', locked.tierQuotas.hard],
    ['medium', locked.tierQuotas.medium],
    ['light', locked.tierQuotas.light],
  ];
  const expectedTierCounts = new Map<TierName, number>(
    lockedTierCounts.filter(([, participantCount]) => participantCount > 0),
  );
  const playoffStages = stages.filter((stage) => ['single_elimination', 'double_elimination'].includes(String(stage.stageType)));
  if (playoffStages.length !== expectedTierCounts.size) {
    throw new GoV2Error(
      422,
      'LOCKED_STAGE_GRAPH_TIER_MISMATCH',
      'The stage graph must contain exactly one playoff stage for every non-empty locked tier',
      { expectedTiers: [...expectedTierCounts.keys()], actualTierCount: playoffStages.length },
    );
  }
  const seenTiers = new Set<TierName>();
  for (const stage of playoffStages) {
    const tier = String(stage.tier ?? '') as TierName;
    const participantCount = expectedTierCounts.get(tier);
    if (!participantCount || seenTiers.has(tier)) {
      throw new GoV2Error(
        422,
        'LOCKED_STAGE_GRAPH_TIER_MISMATCH',
        'Playoff stage tier is absent from or duplicated in the locked tier projection',
        { tier },
      );
    }
    seenTiers.add(tier);
    assertLockedStructuralValue(`stages.${tier}.stageType`, stage.stageType, locked.playoffFormat);
    assertLockedMatchRule(`stages.${tier}.matchRule`, stage.matchRule, locked.playoffMatchRule);
    const configuration = asRecord(stage.configuration);
    assertLockedStructuralValue(`stages.${tier}.configuration.participantCount`, configuration.participantCount, participantCount);
    assertLockedStructuralValue(`stages.${tier}.configuration.bronzeEnabled`, configuration.bronzeEnabled, locked.bronzeEnabled);
    assertLockedStructuralValue(`stages.${tier}.configuration.resetFinalEnabled`, configuration.resetFinalEnabled, locked.resetFinalEnabled);
  }

  const activeSnapshot = await client.query(
    `SELECT snapshot.seed_snapshot, snapshot.ranking_rules_snapshot, snapshot.policy_snapshot
     FROM go_v2_tournament_state state
     JOIN go_v2_stage_lock_snapshots snapshot ON snapshot.id = state.active_stage_snapshot_id
     WHERE state.tournament_id = $1`,
    [tournamentId],
  );
  if (!activeSnapshot.rowCount) {
    throw new GoV2Error(409, 'DRAW_LOCK_SNAPSHOT_REQUIRED', 'Lock the draw before materializing grouped stages');
  }
  const sourceSnapshot = activeSnapshot.rows[0];
  const projectedStages = stages.map((stage) => {
    if (stage === groupStage) {
      return {
        ...stage,
        stageType: locked.poolFormat,
        matchRule: locked.groupMatchRule,
        configuration: {
          ...groupConfiguration,
          groupSizes: locked.materialized.groupPartition?.capacities,
        },
      };
    }
    if (stage === tierSplitStage) {
      return {
        ...stage,
        matchRule: locked.groupMatchRule,
        configuration: {
          ...tierSplitConfiguration,
          tiers: locked.materialized.tierQuotas,
          hardCap: locked.template.tierPolicy.mode === 'none' ? null : locked.template.tierPolicy.hardCap,
        },
      };
    }
    if (['single_elimination', 'double_elimination'].includes(String(stage.stageType))) {
      const tier = String(stage.tier) as TierName;
      return {
        ...stage,
        stageType: locked.playoffFormat,
        matchRule: locked.playoffMatchRule,
        configuration: {
          ...asRecord(stage.configuration),
          participantCount: expectedTierCounts.get(tier),
          bronzeEnabled: locked.bronzeEnabled,
          resetFinalEnabled: locked.resetFinalEnabled,
          routingTemplateVersion: locked.playoffFormat === 'double_elimination' ? 'lpv_de_crossover_v1' : null,
        },
      };
    }
    return stage;
  });
  return {
    ...payload,
    stages: projectedStages,
    snapshot: {
      schemaVersion: 2,
      seedSnapshot: sourceSnapshot.seed_snapshot ?? [],
      rankingRulesSnapshot: sourceSnapshot.ranking_rules_snapshot ?? {},
      formatSnapshot: locked.formatSnapshot,
      policySnapshot: sourceSnapshot.policy_snapshot ?? {},
    },
  };
}

function assertBracketParticipantCount(
  participantCount: number,
  bracketType: GoV2BracketType,
  details: Record<string, unknown> = {},
): void {
  if (participantCount === 1) {
    throw new GoV2Error(
      422,
      'SINGLETON_BRACKET_REQUIRES_PLACEMENT',
      'A one-team bracket is not a contest; use a placement policy or merge the team into another tier.',
      {
        ...details,
        participantCount,
        bracketType,
        alternatives: ['placement_from_pool_rank', 'merge_with_adjacent_tier', 'standalone_combined_bracket'],
      },
    );
  }
  const minimum = bracketType === 'double_elimination' ? 3 : 2;
  if (participantCount < minimum) {
    throw new GoV2Error(
      422,
      'BRACKET_REQUIRES_MORE_TEAMS',
      `${bracketType} requires at least ${minimum} teams`,
      { ...details, participantCount, bracketType, minimum },
    );
  }
}

function scheduleTournamentIds(primaryTournamentId: string, payload: Record<string, unknown>): string[] {
  const session = asRecord(payload.session);
  const requested = Array.isArray(payload.sessionTournamentIds)
    ? payload.sessionTournamentIds
    : Array.isArray(session.tournamentIds)
      ? session.tournamentIds
      : [];
  const ids = [...new Set([
    primaryTournamentId,
    ...requested.map((value) => assertGoV2Uuid(value, 'sessionTournamentIds')),
  ])].sort();
  if (ids.length > 8) {
    throw new GoV2Error(422, 'TOO_MANY_SESSION_TOURNAMENTS', 'A schedule session can combine at most eight tournaments');
  }
  return ids;
}

async function assertScheduleVersionSnapshot(
  client: PoolClient,
  primaryTournamentId: string,
  tournamentIds: string[],
  payload: Record<string, unknown>,
): Promise<void> {
  if (tournamentIds.length === 1) return;
  const expected = asRecord(payload.sessionTournamentVersions);
  const rows = await client.query(
    `SELECT t.id::text AS tournament_id,
            COALESCE(state.aggregate_version, 0) AS aggregate_version
     FROM tournaments t
     LEFT JOIN go_v2_tournament_state state ON state.tournament_id = t.id
     WHERE t.id = ANY($1::uuid[])`,
    [tournamentIds],
  );
  if (rows.rowCount !== tournamentIds.length) {
    throw new GoV2Error(404, 'SESSION_TOURNAMENT_NOT_FOUND', 'One or more schedule-session tournaments do not exist');
  }
  for (const row of rows.rows) {
    const tournamentId = String(row.tournament_id);
    if (tournamentId === primaryTournamentId) continue;
    const expectedVersion = Number(expected[tournamentId]);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw new GoV2Error(
        400,
        'SESSION_EXPECTED_VERSION_REQUIRED',
        `sessionTournamentVersions.${tournamentId} must be a non-negative integer`,
      );
    }
    const actualVersion = Number(row.aggregate_version);
    if (actualVersion !== expectedVersion) {
      throw new GoV2Error(409, 'SESSION_VERSION_CONFLICT', 'A linked tournament changed before scheduling', {
        tournamentId,
        expectedVersion,
        actualVersion,
      });
    }
  }
}

async function loadActiveScheduleCommandScope(
  client: PoolClient,
  tournamentId: string,
): Promise<{
  scheduleSessionId: string;
  scheduleVersionId: string;
  sessionKey: string;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  freezeHorizonMinutes: number;
  refereeMode: ScheduleRefereeMode;
  sessionTournamentIds: string[];
  sessionTournamentVersions: Record<string, number>;
  courts: Array<{
    id: string;
    courtNo: number;
    label: string;
    availability: Array<{ start: string; end: string }>;
  }>;
}> {
  const result = await client.query(
    `SELECT session.id::text AS schedule_session_id,
            version.id::text AS schedule_version_id,
            session.session_key, session.timezone, session.window_start,
            session.window_end, session.freeze_horizon_minutes,
            session.referee_mode,
            member.tournament_id::text,
            member_state.aggregate_version,
            member_state.active_schedule_version_id::text AS member_schedule_version_id
     FROM go_v2_tournament_state owner_state
     JOIN go_v2_schedule_versions version
       ON version.id = owner_state.active_schedule_version_id
      AND version.status = 'published'
     JOIN go_v2_schedule_sessions session ON session.id = version.session_id
     JOIN go_v2_schedule_session_tournaments member ON member.session_id = session.id
     JOIN go_v2_tournament_state member_state ON member_state.tournament_id = member.tournament_id
     WHERE owner_state.tournament_id = $1
     ORDER BY member.tournament_id`,
    [tournamentId],
  );
  if (!result.rowCount) {
    throw new GoV2Error(
      409,
      'COURT_POLICY_REQUIRES_PUBLISHED_SCHEDULE',
      'A court-policy exception requires an active published schedule session',
    );
  }
  const scheduleSessionId = String(result.rows[0].schedule_session_id);
  const scheduleVersionId = String(result.rows[0].schedule_version_id);
  const staleMember = result.rows.find((row) => String(row.member_schedule_version_id ?? '') !== scheduleVersionId);
  if (staleMember) {
    throw new GoV2Error(409, 'SHARED_ACTIVE_SESSION_MISMATCH', 'A linked tournament is not on the active shared schedule version', {
      tournamentId: String(staleMember.tournament_id),
      expectedScheduleVersionId: scheduleVersionId,
      activeScheduleVersionId: staleMember.member_schedule_version_id
        ? String(staleMember.member_schedule_version_id)
        : null,
    });
  }
  const sessionTournamentIds = result.rows.map((row) => String(row.tournament_id));
  const courtResult = await client.query(
    `SELECT court.id::text, court.court_no, court.label, membership.available_windows
     FROM go_v2_schedule_session_courts membership
     JOIN go_v2_courts court ON court.id = membership.court_id
     WHERE membership.session_id = $1
     ORDER BY court.court_no, court.id`,
    [scheduleSessionId],
  );
  if (!courtResult.rowCount) {
    throw new GoV2Error(409, 'NO_ACTIVE_COURTS', 'The active schedule session has no configured courts');
  }
  return {
    scheduleSessionId,
    scheduleVersionId,
    sessionKey: String(result.rows[0].session_key),
    timezone: String(result.rows[0].timezone),
    windowStart: new Date(result.rows[0].window_start).toISOString(),
    windowEnd: new Date(result.rows[0].window_end).toISOString(),
    freezeHorizonMinutes: Number(result.rows[0].freeze_horizon_minutes),
    refereeMode: String(result.rows[0].referee_mode) as ScheduleRefereeMode,
    sessionTournamentIds,
    sessionTournamentVersions: Object.fromEntries(result.rows.map((row) => [
      String(row.tournament_id),
      Number(row.aggregate_version),
    ])),
    courts: courtResult.rows.map((row) => ({
      id: String(row.id),
      courtNo: Number(row.court_no),
      label: String(row.label),
      availability: Array.isArray(row.available_windows)
        ? row.available_windows.map((window: unknown) => {
            const normalized = asRecord(window);
            return { start: String(normalized.start), end: String(normalized.end) };
          })
        : [],
    })),
  };
}

interface PreparedGoV2StageRuleChange {
  risk: GoV2Risk;
  activeScope: Awaited<ReturnType<typeof loadActiveScheduleCommandScope>>;
  change: {
    tournamentId: string;
    stageId: string;
    stageType: string;
    effectiveFromRoundNo: number;
    matchRule: MatchRule;
    affectedMatchIds: string[];
    unaffectedMatchIds: string[];
    sourceHash: string;
    activeScheduleVersionId: string;
  };
  impact: Record<string, unknown>;
}

async function prepareGoV2StageRuleChange(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
  options: { lock: boolean },
): Promise<PreparedGoV2StageRuleChange> {
  const stageId = assertGoV2Uuid(payload.stageId, 'stageId');
  const effectiveFromRoundNo = parseGoV2EffectiveFromRoundNo(payload.effectiveFromRoundNo);
  const matchRule = resolveGoV2MatchRule(payload.matchRule ?? payload.rule, 'matchRule');
  const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
  const stageResult = await client.query(
    `SELECT stage.id::text, stage.stage_type, stage.match_rule,
            stage.current_rule_revision_id::text, stage.version,
            state.active_schedule_version_id::text
     FROM go_v2_stages stage
     JOIN go_v2_tournament_state state ON state.tournament_id = stage.tournament_id
     WHERE stage.id = $1 AND stage.tournament_id = $2
     ${options.lock ? 'FOR UPDATE OF stage' : ''}`,
    [stageId, tournamentId],
  );
  if (!stageResult.rowCount) throw new GoV2Error(404, 'STAGE_NOT_FOUND', 'Stage not found');
  const stage = stageResult.rows[0];
  if (String(stage.active_schedule_version_id ?? '') !== activeScope.scheduleVersionId) {
    throw new GoV2Error(
      409,
      'STAGE_RULE_SCHEDULE_STALE',
      'The stage is not bound to the active shared schedule version',
    );
  }
  const matchesResult = await client.query(
    `SELECT match.id::text, match.round_no, match.position,
            match.play_state, match.schedule_state,
            match.current_result_revision_no, match.version,
            match.current_rule_revision_id::text,
            COALESCE(NULLIF(match.match_rule, '{}'::jsonb), stage.match_rule) AS effective_match_rule,
            assignment.id::text AS assignment_id,
            assignment.court_id::text, assignment.planned_start, assignment.planned_end,
            assignment.actual_start, assignment.is_locked
     FROM go_v2_matches match
     JOIN go_v2_stages stage ON stage.id = match.stage_id
     LEFT JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = $3
      AND assignment.match_id = match.id
     WHERE match.stage_id = $1 AND match.tournament_id = $2
     ORDER BY match.round_no, match.position, match.id
     ${options.lock ? 'FOR UPDATE OF match' : ''}`,
    [stageId, tournamentId, activeScope.scheduleVersionId],
  );
  const scopeMatches: GoV2StageRuleMatchState[] = matchesResult.rows.map((row) => ({
    id: String(row.id),
    roundNo: Number(row.round_no),
    playState: String(row.play_state),
    scheduleState: String(row.schedule_state),
    currentResultRevisionNo: Number(row.current_result_revision_no),
    actualStart: row.actual_start ? new Date(row.actual_start).toISOString() : null,
  }));
  const scope = resolveGoV2StageRuleScope({
    stageType: String(stage.stage_type),
    requestedRoundNo: effectiveFromRoundNo,
    matches: scopeMatches,
  });
  const affected = new Set(scope.affectedMatchIds);
  const normalizedMatches = matchesResult.rows.map((row) => {
    const currentRule = resolveGoV2MatchRule(row.effective_match_rule, `match.${String(row.id)}.matchRule`);
    return {
      matchId: String(row.id),
      roundNo: Number(row.round_no),
      position: Number(row.position),
      playState: String(row.play_state),
      scheduleState: String(row.schedule_state),
      currentResultRevisionNo: Number(row.current_result_revision_no),
      matchVersion: Number(row.version),
      currentRuleRevisionId: row.current_rule_revision_id ? String(row.current_rule_revision_id) : null,
      currentRule,
      currentDurationMinutes: goV2MatchRuleDurationMinutes(currentRule),
      nextDurationMinutes: affected.has(String(row.id))
        ? goV2MatchRuleDurationMinutes(matchRule)
        : goV2MatchRuleDurationMinutes(currentRule),
      assignmentId: row.assignment_id ? String(row.assignment_id) : null,
      courtId: row.court_id ? String(row.court_id) : null,
      plannedStart: row.planned_start ? new Date(row.planned_start).toISOString() : null,
      plannedEnd: row.planned_end ? new Date(row.planned_end).toISOString() : null,
      actualStart: row.actual_start ? new Date(row.actual_start).toISOString() : null,
      assignmentLocked: row.is_locked === true,
    };
  });
  const affectedMatches = normalizedMatches.filter((match) => affected.has(match.matchId));
  const newRuleHash = hashObject(matchRule);
  if (affectedMatches.every((match) => hashObject(match.currentRule) === newRuleHash)) {
    throw new GoV2Error(422, 'STAGE_RULE_NO_CHANGE', 'The requested rule already applies to every affected match');
  }
  const freezeCutoff = Date.now() + activeScope.freezeHorizonMinutes * 60_000;
  const frozenMatches = affectedMatches.filter((match) => (
    match.assignmentLocked
    || match.scheduleState === 'locked'
    || match.playState === 'ready'
    || (match.plannedStart !== null && Date.parse(match.plannedStart) <= freezeCutoff)
  ));
  const risk: GoV2Risk = frozenMatches.length > 0 ? 'red' : 'amber';
  const sourceHash = hashObject({
    tournamentId,
    stageId,
    stageType: String(stage.stage_type),
    stageVersion: Number(stage.version),
    stageCurrentRuleRevisionId: stage.current_rule_revision_id ? String(stage.current_rule_revision_id) : null,
    stageRule: resolveGoV2MatchRule(stage.match_rule, 'stage.matchRule'),
    activeScheduleVersionId: activeScope.scheduleVersionId,
    matches: normalizedMatches,
  });
  return {
    risk,
    activeScope,
    change: {
      tournamentId,
      stageId,
      stageType: String(stage.stage_type),
      effectiveFromRoundNo: scope.effectiveFromRoundNo,
      matchRule,
      affectedMatchIds: scope.affectedMatchIds,
      unaffectedMatchIds: scope.unaffectedMatchIds,
      sourceHash,
      activeScheduleVersionId: activeScope.scheduleVersionId,
    },
    impact: {
      stageId,
      stageType: String(stage.stage_type),
      effectiveFromRoundNo: scope.effectiveFromRoundNo,
      affectedMatchCount: affectedMatches.length,
      affectedMatches: affectedMatches.map((match) => ({
        matchId: match.matchId,
        roundNo: match.roundNo,
        currentRule: match.currentRule,
        nextRule: matchRule,
        currentDurationMinutes: match.currentDurationMinutes,
        nextDurationMinutes: match.nextDurationMinutes,
        durationDeltaMinutes: match.nextDurationMinutes - match.currentDurationMinutes,
        published: match.assignmentId !== null,
        frozen: frozenMatches.some((frozen) => frozen.matchId === match.matchId),
      })),
      frozenMatchIds: frozenMatches.map((match) => match.matchId).sort(),
      priorScheduleVersionId: activeScope.scheduleVersionId,
      sourceHash,
    },
  };
}

async function lockLinkedScheduleStates(
  client: PoolClient,
  primaryTournamentId: string,
  payload: Record<string, unknown>,
  operation: 'schedule.generate.commit' | 'schedule.replan.commit' | 'disruption.commit'
    | 'schedule.policy.commit'
    | 'schedule.defer.commit'
    | 'schedule.defer.release.commit'
    | 'stage.rules.commit'
    | 'reserve.promotion.commit'
    | 'attendance.reinstate.commit'
    | 'disruption.resolve.commit' | 'match.pause_resolution.commit'
    | 'incident.commit' | 'mutation.undo.commit',
): Promise<Array<{ tournamentId: string; state: Awaited<ReturnType<typeof ensureGoV2StateForUpdate>> }>> {
  const tournamentIds = scheduleTournamentIds(primaryTournamentId, payload);
  await assertScheduleVersionSnapshot(client, primaryTournamentId, tournamentIds, payload);
  const expected = asRecord(payload.sessionTournamentVersions);
  const linked: Array<{ tournamentId: string; state: Awaited<ReturnType<typeof ensureGoV2StateForUpdate>> }> = [];
  for (const tournamentId of tournamentIds) {
    if (tournamentId === primaryTournamentId) continue;
    const acquired = await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
      [`go-v2:${tournamentId}`],
    );
    if (acquired.rows[0]?.acquired !== true) {
      throw new GoV2Error(409, 'SESSION_TOURNAMENT_BUSY', 'A linked tournament is being changed by another operator', {
        tournamentId,
      });
    }
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const expectedVersion = Number(expected[tournamentId]);
    if (state.aggregateVersion !== expectedVersion) {
      throw new GoV2Error(409, 'SESSION_VERSION_CONFLICT', 'A linked tournament changed before commit', {
        tournamentId,
        expectedVersion,
        actualVersion: state.aggregateVersion,
      });
    }
    assertOperationLifecycle(operation, state.lifecycleState);
    linked.push({ tournamentId, state });
  }
  return linked;
}

function requestHash(
  operation: GoV2OperationKind,
  command: GoV2CommandEnvelope,
  entityId?: string,
): string {
  return hashObject({
    operation,
    entityId: entityId ?? null,
    commandId: command.commandId,
    deviceId: command.deviceId,
    expectedVersion: command.expectedVersion,
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote ?? null,
    previewId: command.previewId ?? null,
    inputHash: command.inputHash ?? null,
    confirmRed: command.confirmRed === true,
    redApprovalId: command.redApprovalId ?? null,
    payload: command.payload,
  });
}

function assertDeclaredRequestHash(command: GoV2CommandEnvelope, actualHash: string): void {
  if (command.requestHash !== actualHash) {
    throw new GoV2Error(409, 'REQUEST_HASH_MISMATCH', 'requestHash does not match the canonical command');
  }
}

function assertGoV2CommitEndpointActive(operation: GoV2OperationKind): void {
  if (operation === 'match.result.revise') {
    throw new GoV2Error(
      410,
      'DIRECT_RESULT_ENDPOINT_RETIRED',
      'Use paper-import preview/commit for a first played result or incident preview/commit for every correction',
    );
  }
}

function lifecycleForOperation(
  operation: GoV2OperationKind,
  current: GoV2LifecycleState,
): GoV2LifecycleState | undefined {
  switch (operation) {
    case 'registration.lock':
      return 'registration_locked';
    case 'draw.commit':
      return 'draw_locked';
    case 'draw.unlock.commit':
      return 'registration_locked';
    case 'stages.materialize':
      return 'stages_ready';
    case 'bracket.lock':
      // A playoff may only become knowable after the published group schedule
      // has produced qualifiers. Never regress the aggregate back from live.
      return current === 'live' || current === 'schedule_published'
        ? current
        : 'bracket_locked';
    case 'schedule.generate.commit':
      return 'schedule_published';
    case 'schedule.replan.commit':
      return current === 'live' ? 'live' : 'schedule_published';
    case 'schedule.policy.commit':
    case 'schedule.defer.commit':
    case 'schedule.defer.release.commit':
    case 'stage.rules.commit':
      return current;
    case 'reserve.promotion.commit':
      return current;
    case 'disruption.commit':
    case 'disruption.resolve.commit':
    case 'match.pause_resolution.commit':
      return current;
    case 'match.finish.accept':
    case 'match.finish.reject':
    case 'match.result.revise':
    case 'match.paper_import.commit':
    case 'incident.commit':
    case 'entry.withdrawal.commit':
    case 'attendance.commit':
    case 'attendance.reinstate.commit':
      // Recording an early administrative result/withdrawal must not skip the
      // remaining draw/materialize/schedule lifecycle. A tournament becomes
      // live only after a schedule has actually been published.
      return current === 'schedule_published' || current === 'live' ? 'live' : current;
    default:
      return undefined;
  }
}

const ALLOWED_LIFECYCLES: Record<GoV2OperationKind, readonly GoV2LifecycleState[]> = {
  'registration.lock': ['draft', 'registration_locked'],
  'draw.preview': ['registration_locked'],
  'draw.commit': ['registration_locked'],
  'draw.unlock.preview': ['draw_locked'],
  'draw.unlock.commit': ['draw_locked'],
  'stages.materialize': ['draw_locked', 'stages_ready'],
  'bracket.preview': ['registration_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'bracket.lock': ['registration_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'schedule.generate.preview': ['stages_ready', 'bracket_locked'],
  'schedule.generate.commit': ['stages_ready', 'bracket_locked'],
  'schedule.replan.preview': ['schedule_published', 'live'],
  'schedule.replan.commit': ['schedule_published', 'live'],
  'schedule.policy.preview': ['schedule_published', 'live'],
  'schedule.policy.commit': ['schedule_published', 'live'],
  'schedule.defer.preview': ['schedule_published', 'live'],
  'schedule.defer.commit': ['schedule_published', 'live'],
  'schedule.defer.release.preview': ['schedule_published', 'live'],
  'schedule.defer.release.commit': ['schedule_published', 'live'],
  'stage.rules.preview': ['schedule_published', 'live'],
  'stage.rules.commit': ['schedule_published', 'live'],
  // Publication has a dedicated CAS-bound service. These entries keep the
  // shared operation contract exhaustive; generic dispatch never handles it.
  'publication.preview': ['schedule_published', 'live', 'finished'],
  'publication.commit': ['schedule_published', 'live', 'finished'],
  'match.finish.accept': ['live'],
  'match.finish.reject': ['live'],
  'match.paper_import.preview': ['schedule_published', 'live'],
  'match.paper_import.commit': ['schedule_published', 'live'],
  // This endpoint is a director-only paper score import for an unfinished,
  // already scheduled match. Corrections of an existing result always go
  // through incident preview/commit so downstream impact cannot be skipped.
  'match.result.revise': ['schedule_published', 'live'],
  'roster.replacement.preview': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'roster.replacement.commit': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'reserve.promotion.preview': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'reserve.promotion.commit': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  // A confirmed entry may withdraw after registration lock and before the
  // draw so a waitlisted reserve can fill the immutable registration quota
  // and be deterministically reseeded. With no materialized matches this is
  // a green audited roster operation; later lifecycle states keep the full
  // sporting-impact workflow below.
  'entry.withdrawal.preview': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'entry.withdrawal.commit': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'attendance.preview': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'attendance.commit': ['registration_locked', 'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live'],
  'attendance.reinstate.preview': ['schedule_published', 'live'],
  'attendance.reinstate.commit': ['schedule_published', 'live'],
  'disruption.preview': ['schedule_published', 'live'],
  'disruption.commit': ['schedule_published', 'live'],
  'disruption.resolve.preview': ['schedule_published', 'live'],
  'disruption.resolve.commit': ['schedule_published', 'live'],
  'match.pause_resolution.preview': ['schedule_published', 'live'],
  'match.pause_resolution.commit': ['schedule_published', 'live'],
  'court_grant.issue': ['schedule_published', 'live'],
  'court_grant.rotate': ['schedule_published', 'live'],
  'court_grant.revoke': ['schedule_published', 'live'],
  'judge.match.start': ['schedule_published', 'live'],
  'rating.shadow.commit': ['finished'],
  'incident.preview': ['draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live', 'finished'],
  'incident.commit': ['draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live', 'finished'],
  'mutation.undo.preview': ['draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live', 'finished'],
  'mutation.undo.commit': ['draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live', 'finished'],
};

function assertOperationLifecycle(
  operation: GoV2OperationKind,
  lifecycleState: GoV2LifecycleState,
): void {
  const allowed = ALLOWED_LIFECYCLES[operation];
  if (!allowed.includes(lifecycleState)) {
    throw new GoV2Error(409, 'INVALID_LIFECYCLE_TRANSITION', `${operation} is not allowed from ${lifecycleState}`, {
      operation,
      lifecycleState,
      allowed,
    });
  }
}

function previewKindForCommit(operation: GoV2OperationKind): GoV2OperationKind | null {
  switch (operation) {
    case 'draw.commit':
      return 'draw.preview';
    case 'draw.unlock.commit':
      return 'draw.unlock.preview';
    case 'bracket.lock':
      return 'bracket.preview';
    case 'schedule.generate.commit':
      return 'schedule.generate.preview';
    case 'schedule.replan.commit':
      return 'schedule.replan.preview';
    case 'schedule.policy.commit':
      return 'schedule.policy.preview';
    case 'schedule.defer.commit':
      return 'schedule.defer.preview';
    case 'schedule.defer.release.commit':
      return 'schedule.defer.release.preview';
    case 'stage.rules.commit':
      return 'stage.rules.preview';
    case 'incident.commit':
      return 'incident.preview';
    case 'roster.replacement.commit':
      return 'roster.replacement.preview';
    case 'reserve.promotion.commit':
      return 'reserve.promotion.preview';
    case 'entry.withdrawal.commit':
      return 'entry.withdrawal.preview';
    case 'attendance.commit':
      return 'attendance.preview';
    case 'attendance.reinstate.commit':
      return 'attendance.reinstate.preview';
    case 'disruption.commit':
      return 'disruption.preview';
    case 'disruption.resolve.commit':
      return 'disruption.resolve.preview';
    case 'match.pause_resolution.commit':
      return 'match.pause_resolution.preview';
    case 'match.paper_import.commit':
      return 'match.paper_import.preview';
    case 'mutation.undo.commit':
      return 'mutation.undo.preview';
    default:
      return null;
  }
}

function riskFromPayload(payload: Record<string, unknown>): GoV2Risk {
  const explicit = normalizeGoV2Risk(payload.risk ?? asRecord(payload.impact).risk);
  if (explicit !== 'green') return explicit;
  const affected = Array.isArray(payload.affectedMatches) ? payload.affectedMatches : [];
  const states = affected.map((item) => String(asRecord(item).playState ?? ''));
  if (states.some((state) => state === 'live' || state === 'final')) return 'red';
  if (affected.length > 0) return 'amber';
  return 'green';
}

function timezoneOffsetMs(at: Date, timezone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    throw new GoV2Error(422, 'INVALID_TIMEZONE', `Unsupported timezone: ${timezone}`);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
    - at.getTime();
}

function zonedDateTime(date: string, time: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new GoV2Error(422, 'INVALID_SESSION_WINDOW', 'Tournament date and schedule times must be valid');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(wallClock);
  candidate = new Date(wallClock - timezoneOffsetMs(candidate, timezone));
  candidate = new Date(wallClock - timezoneOffsetMs(candidate, timezone));
  return candidate.toISOString();
}

export function subtractGoV2BlockedWindows(
  availability: Array<{ start: string; end: string }>,
  blocks: Array<{ start: string; end: string }>,
): Array<{ start: string; end: string }> {
  let remaining = availability.map((window) => ({
    start: Date.parse(window.start),
    end: Date.parse(window.end),
  }));
  const normalizedBlocks = blocks
    .map((block) => ({ start: Date.parse(block.start), end: Date.parse(block.end) }))
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  for (const block of normalizedBlocks) {
    remaining = remaining.flatMap((window) => {
      if (block.end <= window.start || block.start >= window.end) return [window];
      const fragments: Array<{ start: number; end: number }> = [];
      if (block.start > window.start) fragments.push({ start: window.start, end: Math.min(block.start, window.end) });
      if (block.end < window.end) fragments.push({ start: Math.max(block.end, window.start), end: window.end });
      return fragments.filter((fragment) => fragment.end > fragment.start);
    });
  }
  return remaining.map((window) => ({
    start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(),
  }));
}

export function normalizeGoV2AuthoritativeCourtWindows(
  value: unknown,
  courtNo: number,
): Array<{ start: string; end: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new GoV2Error(409, 'AUTHORITATIVE_COURT_WINDOWS_INVALID', `Court ${courtNo} has no stored availability windows`);
  }
  const windows = value.map((rawWindow, index) => {
    const window = asRecord(rawWindow);
    const windowStart = Date.parse(String(window.start ?? ''));
    const windowEnd = Date.parse(String(window.end ?? ''));
    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
      throw new GoV2Error(409, 'AUTHORITATIVE_COURT_WINDOWS_INVALID', `Court ${courtNo} has an invalid stored availability window`, {
        courtNo,
        windowIndex: index,
      });
    }
    return { start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString() };
  }).sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  for (let index = 1; index < windows.length; index += 1) {
    if (Date.parse(windows[index].start) < Date.parse(windows[index - 1].end)) {
      throw new GoV2Error(409, 'AUTHORITATIVE_COURT_WINDOWS_INVALID', `Court ${courtNo} has overlapping stored availability windows`);
    }
  }
  return windows;
}

async function buildAutomaticSchedulePayload(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
  options?: {
    forcedTransfer?: {
      matchId: string;
      targetCourtId: string;
      resumeNotBefore: string;
    };
    forcedDefer?: {
      matchId: string;
      notBefore: string;
    };
    releasedDefer?: {
      matchId: string;
    };
    courtPolicyException?: GoV2CourtPolicyExceptionRequest;
    stageRuleChange?: {
      tournamentId: string;
      stageId: string;
      affectedMatchIds: string[];
      matchRule: MatchRule;
    };
    entrySubstitution?: {
      tournamentId: string;
      fromEntryId: string;
      toEntryId: string;
      fromPlayerIds: string[];
      toPlayerIds: string[];
    };
    attendanceReinstatement?: {
      replayMatchIds: string[];
      excludedMatchIds: string[];
      replayNotBefore: string;
    };
  },
): Promise<{ solverInput: ScheduleSolverInput; session: Record<string, unknown> }> {
  const sessionTournamentIds = scheduleTournamentIds(tournamentId, payload);
  await assertScheduleVersionSnapshot(client, tournamentId, sessionTournamentIds, payload);
  const lockedFormats: LockedTournamentFormatProjection[] = [];
  for (const memberTournamentId of sessionTournamentIds) {
    lockedFormats.push(await loadLockedTournamentFormat(client, memberTournamentId));
  }
  const refereeModes = [...new Set(lockedFormats.map((locked) => locked.refereeMode))];
  if (refereeModes.length !== 1) {
    throw new GoV2Error(
      409,
      'SHARED_SESSION_REFEREE_POLICY_MISMATCH',
      'Every tournament in a shared schedule session must use the same locked referee policy',
      { tournamentIds: sessionTournamentIds, refereeModes },
    );
  }
  const refereeMode = refereeModes[0];
  if (payload.refereeMode !== undefined && String(payload.refereeMode) !== refereeMode) {
    lockedFormatMismatch('refereeMode', payload.refereeMode, refereeMode);
  }
  const scheduleSources: Array<Awaited<ReturnType<typeof loadScheduleSource>>> = [];
  for (const sourceTournamentId of sessionTournamentIds) {
    const loaded = await loadScheduleSource(client, sourceTournamentId);
    const substitution = options?.entrySubstitution?.tournamentId === sourceTournamentId
      ? options.entrySubstitution
      : null;
    const fromPlayerIds = new Set(substitution?.fromPlayerIds ?? []);
    scheduleSources.push({
      ...loaded,
      matches: loaded.matches.map((match) => {
        if (!substitution) return { ...match, tournamentId: sourceTournamentId };
        const teamIds = Array.isArray(match.teamIds) ? match.teamIds.map(String) : [];
        if (!teamIds.includes(substitution.fromEntryId)) {
          return { ...match, tournamentId: sourceTournamentId };
        }
        return {
          ...match,
          tournamentId: sourceTournamentId,
          teamIds: [...new Set(teamIds.map((entryId) => (
            entryId === substitution.fromEntryId ? substitution.toEntryId : entryId
          )))].sort(),
          playerIds: [...new Set([
            ...(Array.isArray(match.playerIds)
              ? match.playerIds.map(String).filter((playerId) => !fromPlayerIds.has(playerId))
              : []),
            ...substitution.toPlayerIds,
          ])].sort(),
        };
      }),
    });
  }
  const dates = [...new Set(scheduleSources.map((item) => item.tournament.date))];
  if (dates.length !== 1) {
    throw new GoV2Error(
      422,
      'SESSION_TOURNAMENT_DATE_MISMATCH',
      'All tournaments in one schedule session must use the same date',
      { dates },
    );
  }
  const stageRuleAffectedMatchIds = new Set(options?.stageRuleChange?.affectedMatchIds ?? []);
  const attendanceReplayMatchIds = new Set(options?.attendanceReinstatement?.replayMatchIds ?? []);
  const attendanceExcludedMatchIds = new Set(options?.attendanceReinstatement?.excludedMatchIds ?? []);
  const source = {
    tournament: scheduleSources[sessionTournamentIds.indexOf(tournamentId)].tournament,
    matches: scheduleSources.flatMap((item) => item.matches)
      .filter((match) => !attendanceExcludedMatchIds.has(String(match.id ?? '')))
      .map((match) => (
      options?.stageRuleChange
      && String(match.tournamentId ?? tournamentId) === options.stageRuleChange.tournamentId
      && String(match.stageId ?? '') === options.stageRuleChange.stageId
      && stageRuleAffectedMatchIds.has(String(match.id ?? ''))
        ? {
            ...match,
            matchRule: options.stageRuleChange.matchRule,
            durationMinutes: goV2MatchRuleDurationMinutes(options.stageRuleChange.matchRule),
          }
        : match
    )),
  };
  if (!source.matches.length) {
    throw new GoV2Error(409, 'NO_SCHEDULABLE_MATCHES', 'Materialize group/bracket matches before generating a schedule');
  }
  const activeDeferOverrides = await client.query(
    `SELECT DISTINCT ON (override.match_id)
            override.match_id::text, override.action, override.defer_mode,
            override.not_before
     FROM go_v2_schedule_defer_overrides override
     WHERE override.match_id = ANY($1::uuid[])
     ORDER BY override.match_id, override.created_at DESC, override.id DESC`,
    [source.matches.map((rawMatch) => String(asRecord(rawMatch).id ?? ''))],
  );
  const deferNotBeforeByMatchId = new Map<string, string>();
  for (const row of activeDeferOverrides.rows) {
    if (String(row.action) !== 'defer' || !row.not_before) continue;
    deferNotBeforeByMatchId.set(String(row.match_id), new Date(row.not_before).toISOString());
  }
  const requestedCourts = Array.isArray(payload.courts) ? payload.courts : [];
  const courtCount = requestedCourts.length || Number(payload.courtCount ?? 4);
  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 6) {
    throw new GoV2Error(422, 'INVALID_COURT_COUNT', 'courtCount must be an integer from 1 to 6');
  }
  let timezone = String(payload.timezone ?? 'Asia/Yekaterinburg');
  let start = zonedDateTime(source.tournament.date, String(payload.startTime ?? '09:00'), timezone);
  let end = zonedDateTime(source.tournament.date, String(payload.endTime ?? '21:00'), timezone);
  if (Date.parse(end) <= Date.parse(start)) {
    end = new Date(Date.parse(end) + 24 * 60 * 60_000).toISOString();
  }
  const normalizeCourtTime = (value: unknown, fallback: string): string => {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    const normalized = /^\d{2}:\d{2}$/.test(text)
      ? zonedDateTime(source.tournament.date, text, timezone)
      : Number.isFinite(Date.parse(text))
        ? new Date(Date.parse(text)).toISOString()
        : '';
    if (!normalized || !Number.isFinite(Date.parse(normalized))) {
      throw new GoV2Error(422, 'INVALID_COURT_AVAILABILITY', `Invalid court availability time: ${text}`);
    }
    return normalized;
  };
  let courts = requestedCourts.length
    ? requestedCourts.map((rawCourt, index) => {
        const court = asRecord(rawCourt);
        const courtNo = Number(court.courtNo ?? index + 1);
        if (!Number.isInteger(courtNo) || courtNo < 1 || courtNo > 6) {
          throw new GoV2Error(422, 'INVALID_COURT_NO', 'courtNo must be an integer from 1 to 6');
        }
        const rawWindows = Array.isArray(court.availability)
          ? court.availability
          : Array.isArray(court.availableWindows)
            ? court.availableWindows
            : [{ start, end }];
        const availability = rawWindows.map((rawWindow) => {
          const window = asRecord(rawWindow);
          const windowStart = normalizeCourtTime(window.start, start);
          const windowEnd = normalizeCourtTime(window.end, end);
          if (
            Date.parse(windowEnd) <= Date.parse(windowStart)
            || Date.parse(windowStart) < Date.parse(start)
            || Date.parse(windowEnd) > Date.parse(end)
          ) {
            throw new GoV2Error(
              422,
              'INVALID_COURT_AVAILABILITY',
              `Court ${courtNo} availability must be a positive interval inside the session window`,
            );
          }
          return { start: windowStart, end: windowEnd };
        }).sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
        for (let windowIndex = 1; windowIndex < availability.length; windowIndex += 1) {
          if (Date.parse(availability[windowIndex].start) < Date.parse(availability[windowIndex - 1].end)) {
            throw new GoV2Error(422, 'OVERLAPPING_COURT_AVAILABILITY', `Court ${courtNo} availability windows overlap`);
          }
        }
        return {
          id: String(court.id ?? `court-${courtNo}`),
          courtNo,
          label: String(court.label ?? `Court ${courtNo}`),
          availability,
        };
      })
    : Array.from({ length: courtCount }, (_, index) => ({
        id: `court-${index + 1}`,
        courtNo: index + 1,
        label: `Court ${index + 1}`,
        availability: [{ start, end }],
      }));
  if (new Set(courts.map((court) => court.id)).size !== courts.length) {
    throw new GoV2Error(422, 'DUPLICATE_COURT_ID', 'Court ids must be unique inside a schedule session');
  }
  if (new Set(courts.map((court) => court.courtNo)).size !== courts.length) {
    throw new GoV2Error(422, 'DUPLICATE_COURT_NO', 'Court numbers must be unique inside a schedule session');
  }
  const sortedCourtNos = courts.map((court) => court.courtNo).sort((left, right) => left - right);
  if (sortedCourtNos.some((courtNo, index) => courtNo !== index + 1)) {
    throw new GoV2Error(
      422,
      'NON_CONTIGUOUS_COURT_NO',
      'Court numbers must form a contiguous sequence starting at 1',
      { courtNos: sortedCourtNos },
    );
  }
  let freezeHorizonMinutes = Number(payload.freezeHorizonMinutes ?? 60);
  if (!Number.isSafeInteger(freezeHorizonMinutes) || freezeHorizonMinutes < 0 || freezeHorizonMinutes > 1440) {
    throw new GoV2Error(422, 'INVALID_FREEZE_HORIZON', 'freezeHorizonMinutes must be an integer from 0 to 1440');
  }
  // Freeze decisions use the server clock. A client-supplied/backdated asOf
  // must never weaken the live horizon.
  const asOf = new Date();
  let freezeCutoff = asOf.getTime() + freezeHorizonMinutes * 60_000;
  let sessionKey = String(payload.sessionKey ?? '').trim();
  const activeSessions = await client.query(
    `SELECT state.tournament_id::text, version.id::text AS version_id,
            version.status AS version_status, session.id::text AS session_id,
            session.session_key, session.label AS session_label,
            session.timezone, session.window_start, session.window_end,
            session.freeze_horizon_minutes
     FROM go_v2_tournament_state state
     LEFT JOIN go_v2_schedule_versions version ON version.id = state.active_schedule_version_id
     LEFT JOIN go_v2_schedule_sessions session ON session.id = version.session_id
     WHERE state.tournament_id = ANY($1::uuid[])`,
    [sessionTournamentIds],
  );
  const hasPublishedSchedule = activeSessions.rows.some((row) => Boolean(row.version_id));
  if (hasPublishedSchedule) {
    const keys = [...new Set(activeSessions.rows.map((row) => String(row.session_key ?? '')).filter(Boolean))];
    const versions = [...new Set(activeSessions.rows.map((row) => String(row.version_id ?? '')).filter(Boolean))];
    const allPublished = activeSessions.rows.every((row) => String(row.version_status) === 'published');
    if (
      activeSessions.rows.length !== sessionTournamentIds.length
      || keys.length !== 1
      || versions.length !== 1
      || !allPublished
    ) {
      throw new GoV2Error(
        409,
        'SHARED_ACTIVE_SESSION_MISMATCH',
        'Replan requires every linked tournament to point to the same published schedule version',
        { sessionTournamentIds, activeSessionKeys: keys, activeScheduleVersionIds: versions },
      );
    }
    const [activeSessionKey] = keys;
    if (sessionKey && sessionKey !== activeSessionKey) {
      throw new GoV2Error(
        409,
        'ACTIVE_SESSION_KEY_MISMATCH',
        'A replan must create the next version of the currently active schedule session',
        { suppliedSessionKey: sessionKey, activeSessionKey },
      );
    }
    sessionKey = activeSessionKey;
  }
  if (!sessionKey) {
    const memberHash = hashObject([...sessionTournamentIds].sort()).slice(0, 16);
    sessionKey = `go-v2-${source.tournament.date}-${memberHash}`;
  }
  const activeSessionIds = [...new Set(
    activeSessions.rows.map((row) => String(row.session_id ?? '')).filter(Boolean),
  )];
  if (hasPublishedSchedule) {
    const authoritativeSession = activeSessions.rows[0];
    timezone = String(authoritativeSession.timezone);
    start = new Date(authoritativeSession.window_start).toISOString();
    end = new Date(authoritativeSession.window_end).toISOString();
    freezeHorizonMinutes = Number(authoritativeSession.freeze_horizon_minutes);
    freezeCutoff = asOf.getTime() + freezeHorizonMinutes * 60_000;
    const authoritativeCourts = await client.query(
      `SELECT court.id::text, court.court_no, court.label, membership.available_windows
       FROM go_v2_schedule_session_courts membership
       JOIN go_v2_courts court ON court.id = membership.court_id
       WHERE membership.session_id = $1
       ORDER BY court.court_no`,
      [activeSessionIds[0]],
    );
    const authoritativeIds = authoritativeCourts.rows.map((row) => String(row.id));
    const authoritativeCourtNos = authoritativeCourts.rows.map((row) => Number(row.court_no));
    const suppliedCourtNos = courts.map((court) => court.courtNo);
    if (
      authoritativeCourtNos.length !== suppliedCourtNos.length
      || authoritativeCourtNos.some((courtNo) => !suppliedCourtNos.includes(courtNo))
    ) {
      throw new GoV2Error(
        409,
        'ACTIVE_SESSION_COURT_MISMATCH',
        'Replan courts must exactly match the authoritative active schedule session',
        {
          authoritativeCourtIds: authoritativeIds,
          authoritativeCourtNos,
          suppliedCourtNos,
        },
      );
    }
    const authoritativeByNo = new Map(
      authoritativeCourts.rows.map((row) => [Number(row.court_no), row]),
    );
    courts = courts.map((court) => {
      const authoritative = authoritativeByNo.get(court.courtNo);
      if (!authoritative) {
        throw new GoV2Error(409, 'ACTIVE_SESSION_COURT_MISMATCH', `Court ${court.courtNo} is absent from the active session`);
      }
      return {
        ...court,
        id: String(authoritative.id),
        label: String(authoritative.label),
        // A replan may narrow availability only through an administrator-owned
        // disruption. Client-provided windows never replace the published
        // session snapshot.
        availability: normalizeGoV2AuthoritativeCourtWindows(
          authoritative.available_windows,
          court.courtNo,
        ),
      };
    });
  }
  const activeDisruptions = await client.query(
    `SELECT disruption.id::text, disruption.schedule_session_id::text,
            disruption.scope_kind, disruption.court_id::text,
            disruption.match_id::text, disruption.disruption_kind,
            disruption.starts_at, disruption.expected_end_at
     FROM go_v2_schedule_disruptions disruption
     WHERE disruption.status = 'active'
       AND disruption.disruption_kind IN (
         'rain_hold', 'lightning_hold', 'court_damage', 'medical_delay',
         'security_pause', 'court_close', 'global_pause'
       )
       AND disruption.starts_at < $2::timestamptz
       AND (
         disruption.schedule_session_id = ANY($3::uuid[])
         OR (
           disruption.schedule_session_id IS NULL
           AND disruption.tournament_id = ANY($4::uuid[])
         )
       )
     ORDER BY disruption.starts_at, disruption.id`,
    [start, end, activeSessionIds, sessionTournamentIds],
  );
  const authoritativeDisruptions = activeDisruptions.rows.map((row) => ({
    id: String(row.id),
    scheduleSessionId: row.schedule_session_id ? String(row.schedule_session_id) : null,
    scopeKind: String(row.scope_kind),
    courtId: row.court_id ? String(row.court_id) : null,
    matchId: row.match_id ? String(row.match_id) : null,
    disruptionKind: String(row.disruption_kind),
    startsAt: new Date(Math.max(Date.parse(start), Date.parse(row.starts_at))).toISOString(),
    // expected_end_at is advisory ETA; only an explicit resolve command removes
    // the authoritative blocked interval from a subsequent solver snapshot.
    expectedEndAt: end,
    advisoryExpectedEndAt: row.expected_end_at
      ? new Date(row.expected_end_at).toISOString()
      : null,
  }));
  courts = courts.map((court) => ({
    ...court,
    availability: subtractGoV2BlockedWindows(
      court.availability,
      authoritativeDisruptions
        .filter((disruption) => (
          disruption.scopeKind === 'session'
          || (disruption.scopeKind === 'court' && disruption.courtId === court.id)
        ))
        .map((disruption) => ({ start: disruption.startsAt, end: disruption.expectedEndAt })),
    ),
  }));
  const activeMatchHoldNotBeforeByMatchId = new Map<string, string>();
  for (const disruption of authoritativeDisruptions) {
    if (disruption.scopeKind === 'match' && disruption.matchId) {
      activeMatchHoldNotBeforeByMatchId.set(disruption.matchId, end);
    }
  }
  const previousWorkingMatchByLane = new Map<string, Record<string, unknown>>();
  const groupMatchIdsByTournament = new Map<string, string[]>();
  for (const rawMatch of source.matches) {
    const match = asRecord(rawMatch);
    if (String(match.stageKind) !== 'pool') continue;
    const ownerId = String(match.tournamentId ?? tournamentId);
    groupMatchIdsByTournament.set(ownerId, [
      ...(groupMatchIdsByTournament.get(ownerId) ?? []),
      String(match.id),
    ]);
  }
  const allTeamIds = [...new Set(source.matches.flatMap((rawMatch) => {
    const match = asRecord(rawMatch);
    return Array.isArray(match.teamIds) ? match.teamIds.map(String) : [];
  }))].sort();
  const poolTeamIds = new Map<string, string[]>();
  for (const rawMatch of source.matches) {
    const match = asRecord(rawMatch);
    if (!match.poolId) continue;
    const poolId = String(match.poolId);
    const current = new Set(poolTeamIds.get(poolId) ?? []);
    for (const teamId of Array.isArray(match.teamIds) ? match.teamIds.map(String) : []) current.add(teamId);
    poolTeamIds.set(poolId, [...current].sort());
  }
  const fixedRefereeCounts = new Map<string, number>();
  const liveEtaOverrides = new Map<string, string>();
  const normalizeLiveEta = (value: unknown): string => {
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
  };
  const rawLiveEtaOverrides = payload.liveEtaOverrides;
  if (Array.isArray(rawLiveEtaOverrides)) {
    for (const rawOverride of rawLiveEtaOverrides) {
      const override = asRecord(rawOverride);
      const matchId = String(override.matchId ?? '').trim();
      const liveEta = normalizeLiveEta(override.liveEta);
      if (matchId && liveEta) liveEtaOverrides.set(matchId, new Date(liveEta).toISOString());
    }
  } else {
    for (const [matchId, liveEta] of Object.entries(asRecord(rawLiveEtaOverrides))) {
      const normalized = normalizeLiveEta(liveEta);
      if (normalized) liveEtaOverrides.set(matchId, normalized);
    }
  }
  const sourceMatchIds = new Set(source.matches.map((rawMatch) => String(asRecord(rawMatch).id ?? '')));
  for (const [matchId, liveEta] of liveEtaOverrides) {
    if (!sourceMatchIds.has(matchId) || !Number.isFinite(Date.parse(liveEta))) {
      throw new GoV2Error(422, 'INVALID_LIVE_ETA_OVERRIDE', 'Every live ETA override must reference a schedulable match and a valid timestamp');
    }
  }
  const tierProfile = source.matches.some((rawMatch) => String(asRecord(rawMatch).tier ?? '') === 'medium')
    ? 'hard_medium_light' as const
    : 'hard_light' as const;
  const persistedCourtPolicyExceptions = hasPublishedSchedule
    ? await loadActiveGoV2CourtPolicyExceptions(client, {
        scheduleSessionId: activeSessionIds[0],
        tournamentIds: sessionTournamentIds,
      })
    : [];
  let candidateCourtPolicyException: GoV2CourtPolicyExceptionBinding | null = null;
  if (options?.courtPolicyException) {
    if (!hasPublishedSchedule || activeSessionIds.length !== 1) {
      throw new GoV2Error(
        409,
        'COURT_POLICY_REQUIRES_PUBLISHED_SCHEDULE',
        'A court-policy exception can only create a successor of one active published schedule',
      );
    }
    const requested = options.courtPolicyException;
    assertGoV2CourtPolicyExceptionNotExpired(requested, asOf);
    const knownCourtIds = new Set(courts.map((court) => court.id));
    const unknownCourtIds = requested.allowedCourtIds.filter((courtId) => !knownCourtIds.has(courtId));
    if (unknownCourtIds.length) {
      throw new GoV2Error(422, 'COURT_POLICY_UNKNOWN_COURT', 'Every allowed court must belong to the active schedule session', {
        unknownCourtIds,
        scheduleSessionId: activeSessionIds[0],
      });
    }
    if (
      Date.parse(requested.effectiveFrom) < Date.parse(start)
      || Date.parse(requested.effectiveUntil) > Date.parse(end)
    ) {
      throw new GoV2Error(422, 'COURT_POLICY_WINDOW_OUTSIDE_SESSION', 'The exception window must be inside the active schedule session', {
        sessionWindow: { start, end },
        exceptionWindow: { start: requested.effectiveFrom, end: requested.effectiveUntil },
      });
    }
    const scopedMatches = source.matches.filter((rawMatch) => {
      const match = asRecord(rawMatch);
      return String(match.tournamentId ?? tournamentId) === tournamentId
        && String(match.stageKind ?? '') !== 'pool'
        && String(match.tier ?? '') === requested.tier
        && (requested.stageId === null || String(match.stageId ?? '') === requested.stageId);
    });
    if (!scopedMatches.length) {
      throw new GoV2Error(422, 'COURT_POLICY_SCOPE_EMPTY', 'No tier match belongs to the requested tournament/stage scope', {
        tier: requested.tier,
        stageId: requested.stageId,
      });
    }
    candidateCourtPolicyException = {
      id: `preview:${hashObject(requested)}`,
      tournamentId,
      scheduleSessionId: activeSessionIds[0],
      decision: 'approve',
      ...requested,
    };
  }
  const courtPolicyExceptions = [
    ...persistedCourtPolicyExceptions,
    ...(candidateCourtPolicyException ? [candidateCourtPolicyException] : []),
  ];
  const appliedCourtPolicyExceptionIds = new Set<string>();
  const matches = source.matches.map((rawMatch) => {
    const match = asRecord(rawMatch);
    const teamIds = Array.isArray(match.teamIds) ? match.teamIds.map(String) : [];
    const playerIds = Array.isArray(match.playerIds) ? match.playerIds.map(String) : [];
    if (!teamIds.length) {
      throw new GoV2Error(409, 'MATCH_PARTICIPANTS_UNRESOLVED', `Match ${String(match.id)} has no possible participants`);
    }
    const tier = match.tier ? String(match.tier) : null;
    const stageKind = match.stageKind as 'pool' | 'playoff' | 'placement' | 'other';
    const strictCourtBinding = buildLpvTierCourtPolicy({
      courts: courts.map((court) => ({ id: court.id, courtNo: court.courtNo })),
      stageKind,
      tier: tier as 'hard' | 'medium' | 'light' | null,
      tierProfile,
    });
    const courtBinding = applyGoV2CourtPolicyExceptions(
      strictCourtBinding,
      {
        tournamentId: String(match.tournamentId ?? tournamentId),
        stageId: match.stageId ? String(match.stageId) : null,
        tier,
        stageKind,
      },
      courtPolicyExceptions,
    );
    for (const exceptionId of courtBinding.appliedExceptionIds) {
      appliedCourtPolicyExceptionIds.add(exceptionId);
    }
    let refereeRequirement: ScheduleRefereeRequirement = refereeMode === 'none'
      ? { kind: 'none' }
      : { kind: 'court_judge' };
    const laneKey = match.poolId
      ? `pool:${String(match.poolId)}`
      : `stage:${String(match.stageId ?? 'unassigned')}:lane:${Math.max(0, Number(match.position ?? 1) - 1) % courtCount}`;
    const previousWorkingMatch = previousWorkingMatchByLane.get(laneKey);
    if ((refereeMode === 'working_team' || refereeMode === 'hybrid') && previousWorkingMatch) {
      const previousTeams = Array.isArray(previousWorkingMatch.teamIds)
        ? previousWorkingMatch.teamIds.map(String)
        : [];
      if (!previousTeams.some((teamId) => teamIds.includes(teamId))) {
        refereeRequirement = {
          kind: 'loser_previous_same_court',
          sourceMatchId: String(previousWorkingMatch.id),
        };
      }
    }
    if (
      (refereeMode === 'working_team' || refereeMode === 'hybrid')
      && refereeRequirement.kind === 'court_judge'
    ) {
      const localCandidates = match.poolId ? (poolTeamIds.get(String(match.poolId)) ?? []) : [];
      const candidates = [...new Set([...localCandidates, ...allTeamIds])]
        .filter((teamId) => !teamIds.includes(teamId))
        .sort((left, right) => (
          (fixedRefereeCounts.get(left) ?? 0) - (fixedRefereeCounts.get(right) ?? 0)
          || left.localeCompare(right)
        ));
      const primaryTeamId = candidates[0];
      if (primaryTeamId) {
        refereeRequirement = { kind: 'idle_team_candidates', candidateTeamIds: candidates };
        fixedRefereeCounts.set(primaryTeamId, (fixedRefereeCounts.get(primaryTeamId) ?? 0) + 1);
      } else if (refereeMode === 'working_team') {
        throw new GoV2Error(
          409,
          'NO_ELIGIBLE_WORKING_TEAM_REFEREE',
          `Match ${String(match.id)} has no idle team available to referee`,
        );
      } else {
        refereeRequirement = { kind: 'court_judge', isFallback: true };
      }
    }
    if (refereeMode === 'working_team' || refereeMode === 'hybrid') {
      previousWorkingMatchByLane.set(laneKey, { ...match, teamIds });
    }
    const published = asRecord(match.published);
    const forcedTransfer = options?.forcedTransfer?.matchId === String(match.id)
      ? options.forcedTransfer
      : null;
    const forcedDefer = options?.forcedDefer?.matchId === String(match.id)
      ? options.forcedDefer
      : null;
    const releasedDefer = options?.releasedDefer?.matchId === String(match.id)
      ? options.releasedDefer
      : null;
    const attendanceReplay = attendanceReplayMatchIds.has(String(match.id));
    const effectivePublishedStart = forcedTransfer?.resumeNotBefore
      ?? liveEtaOverrides.get(String(match.id))
      ?? (match.liveEta
      ? String(match.liveEta)
      : published.start
        ? String(published.start)
        : '');
    const effectiveCourtId = forcedTransfer?.targetCourtId
      ?? (published.courtId ? String(published.courtId) : '');
    const replayAwarePublishedStart = attendanceReplay ? '' : effectivePublishedStart;
    const replayAwareCourtId = attendanceReplay ? '' : effectiveCourtId;
    const publishedPlacement = replayAwareCourtId && replayAwarePublishedStart
      ? { courtId: replayAwareCourtId, start: replayAwarePublishedStart }
      : undefined;
    const lockPublished = Boolean(publishedPlacement) && !forcedDefer && !releasedDefer && (Boolean(forcedTransfer) || (
      match.assignmentLocked === true
      || match.scheduleState === 'locked'
      || match.playState === 'live'
      || match.playState === 'paused'
      || match.playState === 'final'
      || Date.parse(String(publishedPlacement?.start)) <= freezeCutoff
    ));
    // All tier brackets depend on the group barrier, but Hard, Medium and Light
    // are sibling branches and must remain schedulable in parallel.
    const stageDependencies = match.stageKind === 'pool'
      ? []
      : groupMatchIdsByTournament.get(String(match.tournamentId ?? tournamentId)) ?? [];
    const dependencies = [...new Set([
      ...(Array.isArray(match.dependencies) ? match.dependencies.map(String) : []),
      ...stageDependencies,
    ])].filter((dependencyId) => (
      dependencyId !== String(match.id) && sourceMatchIds.has(dependencyId)
    ));
    const compiled = {
      id: String(match.id),
      durationMinutes: Number(match.durationMinutes),
      teamIds,
      playerIds,
      dependencies,
      stageKind,
      tier: tier as 'hard' | 'medium' | 'light' | null,
      stagePriority: Number(match.stagePriority ?? 0),
      minRestMinutes: Number(match.minRestMinutes ?? 0),
      softRestMinutes: Number(match.softRestMinutes ?? 0),
      conditional: match.conditional === true,
      notBefore: [
        attendanceReplay ? options?.attendanceReinstatement?.replayNotBefore : undefined,
        forcedTransfer?.resumeNotBefore,
        forcedDefer?.notBefore ?? (releasedDefer ? undefined : deferNotBeforeByMatchId.get(String(match.id))),
        activeMatchHoldNotBeforeByMatchId.get(String(match.id)),
        hasPublishedSchedule && !publishedPlacement
          ? new Date(Math.max(Date.parse(start), asOf.getTime())).toISOString()
          : undefined,
      ].filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0],
      published: publishedPlacement,
      locked: lockPublished ? publishedPlacement : undefined,
      courtPolicy: courtBinding.courtPolicy,
      courtAffinityPenalties: courtBinding.courtAffinityPenalties,
      refereeRequirement,
    };
    return compiled;
  });
  if (
    candidateCourtPolicyException
    && !appliedCourtPolicyExceptionIds.has(candidateCourtPolicyException.id)
  ) {
    throw new GoV2Error(
      422,
      'COURT_POLICY_EXCEPTION_NO_EFFECT',
      'The requested courts do not broaden the strict tier policy for any scoped match',
      {
        tier: candidateCourtPolicyException.tier,
        stageId: candidateCourtPolicyException.stageId,
        allowedCourtIds: candidateCourtPolicyException.allowedCourtIds,
      },
    );
  }
  const operationBudget = asRecord(payload.operationBudget);
  const solverInput: ScheduleSolverInput = {
    timezone,
    window: { start, end },
    courts,
    matches,
    referee: {
      mode: refereeMode,
      minRestAfterRefMinutes: Number(payload.minRestAfterRefMinutes ?? 0),
    },
    options: {
      quantumMinutes: 5,
      beamWidth: Number(operationBudget.beamWidth ?? 64),
      topK: Number(operationBudget.topK ?? 24),
      maxExpandedStates: Number(operationBudget.maxExpandedStates ?? 250000),
      maxRepairPasses: Number(operationBudget.repairPasses ?? 8),
      maxWallMs: 5000,
    },
  };
  return {
    solverInput,
    session: {
      id: activeSessionIds[0] ?? null,
      sessionKey,
      label: hasPublishedSchedule
        ? String(activeSessions.rows[0].session_label)
        : String(payload.sessionLabel ?? source.tournament.name),
      tournamentIds: sessionTournamentIds,
      timezone,
      windowStart: start,
      windowEnd: end,
      freezeHorizonMinutes,
      timeQuantumMinutes: 5,
      refereeMode,
      asOf: asOf.toISOString(),
      courts: courts.map((court) => ({
        id: court.id,
        courtNo: court.courtNo,
        label: court.label,
        availableWindows: court.availability,
      })),
      authoritativeDisruptions,
      courtPolicyExceptionRevisionIds: [...appliedCourtPolicyExceptionIds]
        .filter((id) => !id.startsWith('preview:'))
        .sort(),
      ...(candidateCourtPolicyException ? {
        courtPolicyExceptionCandidateId: candidateCourtPolicyException.id,
      } : {}),
    },
  };
}

function localClock(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (!hour || !minute) {
    throw new GoV2Error(409, 'CASCADE_SCHEDULE_WINDOW_INVALID', 'Could not restore the active session window');
  }
  return `${hour}:${minute}`;
}

function cascadeScheduleAssignment(
  assignment: GoV2QualificationCascadeScheduleContext['assignments'][number],
): ScheduleAssignment {
  const durationMinutes = Math.round(
    (Date.parse(assignment.plannedEnd) - Date.parse(assignment.plannedStart)) / 60_000,
  );
  return {
    matchId: assignment.matchId,
    courtId: assignment.courtId,
    start: assignment.plannedStart,
    end: assignment.plannedEnd,
    durationMinutes,
    conditional: assignment.isConditional,
    referee: assignment.referee as ScheduleAssignment['referee'],
  };
}

async function publishQualificationCascadeScheduleSuccessor(
  client: PoolClient,
  tournamentId: string,
  expected: GoV2QualificationCascadeScheduleContext | null,
  actorId: string,
  inputHash: string,
  replayedMatchIds: readonly string[] = [],
): Promise<Record<string, unknown> | null> {
  if (!expected) return null;
  const current = await loadQualificationCascadeScheduleContext(client, tournamentId);
  if (!current || current.scheduleVersionId !== expected.scheduleVersionId) {
    throw new GoV2Error(409, 'QUALIFICATION_CASCADE_SCHEDULE_STALE',
      'The published schedule changed after cascade preview', {
        expectedScheduleVersionId: expected.scheduleVersionId,
        actualScheduleVersionId: current?.scheduleVersionId ?? null,
      });
  }
  const schedulePayload: Record<string, unknown> = {
    sessionKey: current.sessionKey,
    sessionLabel: current.label,
    sessionTournamentIds: current.sessionTournamentIds,
    sessionTournamentVersions: current.sessionTournamentVersions,
    timezone: current.timezone,
    startTime: localClock(current.windowStart, current.timezone),
    endTime: localClock(current.windowEnd, current.timezone),
    freezeHorizonMinutes: current.freezeHorizonMinutes,
    refereeMode: current.refereeMode,
    courts: current.courts.map((court) => ({
      id: court.id,
      courtNo: court.courtNo,
      label: court.label,
      availability: court.availableWindows,
    })),
  };
  const automatic = await buildAutomaticSchedulePayload(client, tournamentId, schedulePayload);
  const replayed = new Set(replayedMatchIds);
  const nowMs = Date.now();
  const nextQuantumMs = Math.ceil(nowMs / (5 * 60_000)) * 5 * 60_000;
  const staleReplayAssignments = new Set(current.assignments
    .filter((assignment) => replayed.has(assignment.matchId)
      && Date.parse(assignment.plannedStart) <= nowMs)
    .map((assignment) => assignment.matchId));
  // A replay cannot remain locked to a slot that has already started. Remove
  // only those stale placements from the immutable solver input; future
  // assignments remain eligible for an exact clone.
  const solverInput: ScheduleSolverInput = staleReplayAssignments.size
    ? {
        ...automatic.solverInput,
        matches: automatic.solverInput.matches.map((match) => (
          staleReplayAssignments.has(match.id)
            ? {
                ...match,
                published: undefined,
                locked: undefined,
                notBefore: new Date(Math.max(
                  Date.parse(automatic.solverInput.window.start),
                  nextQuantumMs,
                )).toISOString(),
              }
            : match
        )),
      }
    : automatic.solverInput;
  const priorAssignments = current.assignments.map(cascadeScheduleAssignment);
  const cloneValidation = validateSchedule(solverInput, priorAssignments);
  const canClone = staleReplayAssignments.size === 0
    && cloneValidation.publishable
    && Boolean(cloneValidation.scheduleHash);
  const solverResult = canClone
    ? {
        status: cloneValidation.warnings.length ? 'feasible_with_warnings' as const : 'feasible' as const,
        publishable: true,
        solverVersion: SCHEDULE_SOLVER_VERSION,
        inputHash: cloneValidation.inputHash,
        scheduleHash: cloneValidation.scheduleHash,
        assignments: priorAssignments,
        objective: cloneValidation.objective,
        conflicts: cloneValidation.conflicts,
        warnings: cloneValidation.warnings,
        metrics: {
          elapsedMs: 0,
          expandedStates: 0,
          candidateEvaluations: 0,
          beamPeak: 0,
          repairPasses: 0,
          scheduledMatches: priorAssignments.length,
          totalMatches: automatic.solverInput.matches.length,
        },
      }
    : solveSchedule(solverInput);
  const validation = validateSchedule(solverInput, solverResult.assignments);
  if (!solverResult.publishable || !validation.publishable || !validation.scheduleHash) {
    throw new GoV2Error(409, 'QUALIFICATION_CASCADE_SCHEDULE_REPLAN_INFEASIBLE',
      'The corrected participants cannot be published without violating schedule constraints', {
        cloneConflicts: cloneValidation.conflicts,
        replanConflicts: solverResult.conflicts,
      });
  }
  const persisted = await persistScheduleVersion(client, {
    tournamentId,
    actorId,
    inputHash,
    payload: {
      ...schedulePayload,
      ...automatic,
      solverInput,
      solverResult: {
        ...solverResult,
        inputHash: validation.inputHash,
        scheduleHash: validation.scheduleHash,
        objective: validation.objective,
      },
      independentValidation: validation,
    },
  });
  return {
    mode: canClone ? 'clone' : 'deterministic_replan',
    priorScheduleVersionId: current.scheduleVersionId,
    successorScheduleVersionId: String(persisted.scheduleVersionId ?? ''),
    sessionId: String(persisted.sessionId ?? current.scheduleSessionId),
    scheduleHash: validation.scheduleHash,
    cloneConflicts: cloneValidation.conflicts,
    staleReplayMatchIds: [...staleReplayAssignments].sort(),
    replanWarnings: validation.warnings,
  };
}

interface GoV2AwardedNoShowResult {
  matchId: string;
  matchKey: string;
  stageId: string;
  stageType: string;
  poolId: string | null;
  playState: string;
  scheduleState: string;
  resultRevisionId: string;
  resultRevisionNo: number;
  resultKind: 'walkover' | 'forfeit' | 'mutual_no_show' | 'admin_award';
  incidentCause: string | null;
  winnerEntryId: string | null;
  loserEntryId: string | null;
}

interface GoV2AttendanceReinstatementState {
  entryId: string;
  decision: ReturnType<typeof parseGoV2AttendanceReinstatementDecision>;
  toState: ReturnType<typeof parseGoV2AttendanceReinstatementTarget>;
  attendanceVersion: number;
  effectiveAt: string;
  awardedResults: GoV2AwardedNoShowResult[];
  affectedMatches: GoV2ImpactPreview['affectedMatches'];
  replayMatchIds: string[];
  deferredAwardedMatchIds: string[];
  excludedSuccessorMatchIds: string[];
  qualificationChanges: Array<Record<string, unknown>>;
  resultRouteSnapshots: Awaited<ReturnType<typeof loadMutationMatchSnapshots>>;
  risk: GoV2Risk;
  stateFingerprint: string;
}

async function loadGoV2AwardedNoShowResults(
  client: PoolClient,
  tournamentId: string,
  entryId: string,
): Promise<GoV2AwardedNoShowResult[]> {
  const result = await client.query(
    `SELECT match.id::text AS match_id, match.match_key,
            match.stage_id::text AS stage_id, stage.stage_type,
            match.pool_id::text AS pool_id, match.play_state, match.schedule_state,
            revision.id::text AS result_revision_id, revision.revision_no,
            revision.result_kind, revision.incident_cause,
            revision.winner_entry_id::text, revision.loser_entry_id::text
     FROM go_v2_matches match
     JOIN go_v2_stages stage ON stage.id = match.stage_id
     JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
     WHERE match.tournament_id = $1
       AND EXISTS (
         SELECT 1
         FROM go_v2_match_slot_sources participant
         WHERE participant.match_id = match.id
           AND COALESCE(participant.resolved_entry_id, participant.source_entry_id) = $2
       )
       AND revision.result_kind IN ('walkover', 'forfeit', 'mutual_no_show', 'admin_award')
       AND (
         lower(COALESCE(revision.incident_cause, '')) = 'no_show'
         OR revision.reason_code IN ('no_show', 'attendance_no_show')
       )
     ORDER BY stage.stage_order, match.round_no, match.position, match.id`,
    [tournamentId, entryId],
  );
  return result.rows.map((row) => ({
    matchId: String(row.match_id),
    matchKey: String(row.match_key),
    stageId: String(row.stage_id),
    stageType: String(row.stage_type),
    poolId: row.pool_id ? String(row.pool_id) : null,
    playState: String(row.play_state),
    scheduleState: String(row.schedule_state),
    resultRevisionId: String(row.result_revision_id),
    resultRevisionNo: Number(row.revision_no),
    resultKind: String(row.result_kind) as GoV2AwardedNoShowResult['resultKind'],
    incidentCause: row.incident_cause ? String(row.incident_cause) : null,
    winnerEntryId: row.winner_entry_id ? String(row.winner_entry_id) : null,
    loserEntryId: row.loser_entry_id ? String(row.loser_entry_id) : null,
  }));
}

async function loadGoV2AttendanceReinstatementState(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
  options: { freezeEffectiveAt?: string } = {},
): Promise<GoV2AttendanceReinstatementState> {
  const entryId = assertGoV2Uuid(payload.entryId, 'entryId');
  const decision = parseGoV2AttendanceReinstatementDecision(payload.decision);
  const toState = parseGoV2AttendanceReinstatementTarget(payload.toState);
  const entry = await client.query(
    `SELECT attendance_state, attendance_version, registration_state
     FROM go_v2_entries
     WHERE tournament_id = $1 AND id = $2`,
    [tournamentId, entryId],
  );
  if (!entry.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  if (String(entry.rows[0].attendance_state) !== 'no_show') {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_REQUIRES_NO_SHOW',
      'Only an entry currently marked no_show can use the reinstatement workflow',
      { attendanceState: String(entry.rows[0].attendance_state) },
    );
  }
  if (String(entry.rows[0].registration_state) !== 'confirmed') {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_ENTRY_INELIGIBLE',
      'A withdrawn or disqualified entry cannot be reinstated through attendance',
      { registrationState: String(entry.rows[0].registration_state) },
    );
  }
  const activeMatch = await client.query(
    `SELECT match.id::text AS match_id, match.play_state
     FROM go_v2_matches match
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     WHERE match.tournament_id = $1
       AND COALESCE(source.resolved_entry_id, source.source_entry_id) = $2
       AND match.play_state IN ('live', 'paused')
     ORDER BY match.id LIMIT 1`,
    [tournamentId, entryId],
  );
  if (activeMatch.rowCount) {
    throw new GoV2Error(
      409,
      'ENTRY_MATCH_ACTIVE',
      'A no-show entry cannot be reinstated while one of its matches is live or paused',
      {
        matchId: String(activeMatch.rows[0].match_id),
        playState: String(activeMatch.rows[0].play_state),
      },
    );
  }

  const awardedResults = await loadGoV2AwardedNoShowResults(client, tournamentId, entryId);
  if (decision === 'overturn_and_cascade' && awardedResults.length === 0) {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_NO_AWARD_TO_OVERTURN',
      'No current no-show technical/admin-awarded result exists; choose keep_awarded_result',
    );
  }
  const impacts = decision === 'overturn_and_cascade'
    ? await Promise.all(awardedResults.map((result) => (
        assessDownstreamImpact(client, tournamentId, result.matchId)
      )))
    : [];
  const awardedMatchIds = awardedResults.map((result) => result.matchId);
  const replaySet = new Set(awardedMatchIds);
  const affectedById = new Map<string, GoV2ImpactPreview['affectedMatches'][number]>();
  for (const impact of impacts) {
    for (const match of impact.affectedMatches) {
      if (!replaySet.has(match.matchId)) affectedById.set(match.matchId, match);
    }
  }
  const affectedMatches = [...affectedById.values()]
    .sort((left, right) => left.matchId.localeCompare(right.matchId));
  const qualificationByStage = new Map<string, Record<string, unknown>>();
  for (const impact of impacts) {
    const correction = impact.qualificationCorrection;
    if (!correction) continue;
    qualificationByStage.set(correction.groupStageId, {
      groupStageId: correction.groupStageId,
      priorStandingSnapshotId: correction.standingSnapshotId,
      priorQualificationSnapshotId: correction.qualificationSnapshotId,
      afterState: 'pending_replay',
      replayMatchIds: awardedResults
        .filter((result) => result.stageId === correction.groupStageId)
        .map((result) => result.matchId),
      downstreamStages: correction.downstreamStages,
      blockers: correction.blockers,
    });
  }
  const qualificationChanges = [...qualificationByStage.values()]
    .sort((left, right) => String(left.groupStageId).localeCompare(String(right.groupStageId)));
  const qualificationDownstreamStageIds = new Set(
    qualificationChanges.flatMap((change) => (
      Array.isArray(change.downstreamStages)
        ? change.downstreamStages.map((rawStage) => String(asRecord(rawStage).stageId ?? ''))
        : []
    )).filter(Boolean),
  );
  const deferredAwardedMatchIds = decision === 'overturn_and_cascade'
    ? awardedResults
        .filter((result) => qualificationDownstreamStageIds.has(result.stageId))
        .map((result) => result.matchId)
    : [];
  const deferredAwardedSet = new Set(deferredAwardedMatchIds);
  const replayMatchIds = decision === 'overturn_and_cascade'
    ? awardedMatchIds.filter((matchId) => !deferredAwardedSet.has(matchId))
    : [];
  const resultRouteSnapshots = await loadMutationMatchSnapshots(
    client,
    tournamentId,
    uniqueSortedIds([...awardedMatchIds, ...affectedMatches.map((match) => match.matchId)]),
  );
  const risk = attendanceReinstatementRisk({ decision, affectedMatches });
  const effectiveAt = options.freezeEffectiveAt
    ? new Date(options.freezeEffectiveAt).toISOString()
    : new Date().toISOString();
  const stateFingerprint = hashObject({
    entryId,
    attendanceVersion: Number(entry.rows[0].attendance_version),
    decision,
    toState,
    awardedResults,
    affectedMatches,
    qualificationChanges,
    resultRouteSnapshots,
  });
  return {
    entryId,
    decision,
    toState,
    attendanceVersion: Number(entry.rows[0].attendance_version),
    effectiveAt,
    awardedResults,
    affectedMatches,
    replayMatchIds: uniqueSortedIds(replayMatchIds),
    deferredAwardedMatchIds: uniqueSortedIds(deferredAwardedMatchIds),
    excludedSuccessorMatchIds: decision === 'overturn_and_cascade'
      ? uniqueSortedIds([
          ...affectedMatches.map((match) => match.matchId),
          ...deferredAwardedMatchIds,
        ])
      : [],
    qualificationChanges,
    resultRouteSnapshots,
    risk,
    stateFingerprint,
  };
}

async function prepareGoV2AttendanceReinstatement(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
): Promise<{
  risk: GoV2Risk;
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
  warnings: unknown[];
  conflicts: unknown[];
}> {
  const state = await loadGoV2AttendanceReinstatementState(client, tournamentId, payload);
  const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
  const currentSchedule = await loadQualificationCascadeScheduleContext(client, tournamentId);
  if (!currentSchedule || currentSchedule.scheduleVersionId !== activeScope.scheduleVersionId) {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_SCHEDULE_STALE',
      'The shared active schedule could not be frozen for reinstatement',
    );
  }
  const canonicalPayload: Record<string, unknown> = {
    sessionTournamentIds: activeScope.sessionTournamentIds,
    sessionTournamentVersions: activeScope.sessionTournamentVersions,
    courts: activeScope.courts,
    sessionKey: activeScope.sessionKey,
    timezone: activeScope.timezone,
    startTime: localClock(activeScope.windowStart, activeScope.timezone),
    endTime: localClock(activeScope.windowEnd, activeScope.timezone),
    freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
    refereeMode: activeScope.refereeMode,
  };
  const nextQuantumMs = Math.ceil(Date.now() / (5 * 60_000)) * 5 * 60_000;
  const replayNotBefore = new Date(Math.max(
    nextQuantumMs,
    Date.parse(activeScope.windowStart),
  )).toISOString();
  const automatic = await buildAutomaticSchedulePayload(client, tournamentId, canonicalPayload, {
    attendanceReinstatement: {
      replayMatchIds: state.decision === 'overturn_and_cascade' ? state.replayMatchIds : [],
      excludedMatchIds: state.excludedSuccessorMatchIds,
      replayNotBefore,
    },
  });
  const solverResult = solveSchedule(automatic.solverInput);
  const independentValidation = validateSchedule(automatic.solverInput, solverResult.assignments);
  if (!solverResult.publishable || !independentValidation.publishable || !independentValidation.scheduleHash) {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_SCHEDULE_INFEASIBLE',
      'The entry cannot be reinstated without a valid exact successor shared-session schedule',
      {
        solverStatus: solverResult.status,
        conflicts: [...solverResult.conflicts, ...independentValidation.conflicts],
      },
    );
  }
  const currentByMatchId = new Map(currentSchedule.assignments.map((assignment) => [
    assignment.matchId,
    { courtId: assignment.courtId, start: assignment.plannedStart },
  ] as const));
  const changedAssignments = buildGoV2ScheduleAssignmentDiff(
    currentByMatchId,
    solverResult.assignments as unknown as Array<Record<string, unknown>>,
  );
  const scheduleDiff = {
    kind: 'attendance_reinstatement',
    entryId: state.entryId,
    decision: state.decision,
    removedPendingMatchIds: state.excludedSuccessorMatchIds,
    replayMatchIds: state.replayMatchIds,
    changedAssignments,
    successorAssignments: solverResult.assignments,
  };
  const impact = {
    entryId: state.entryId,
    decision: state.decision,
    awardedResults: state.awardedResults,
    resultRevisions: state.awardedResults.map((result) => ({
      matchId: result.matchId,
      priorResultRevisionId: result.resultRevisionId,
      priorResultRevisionNo: result.resultRevisionNo,
      action: state.decision === 'overturn_and_cascade' ? 'append_void_and_replay' : 'preserve',
    })),
    routes: state.resultRouteSnapshots,
    affectedMatches: state.affectedMatches,
    standings: state.qualificationChanges.map((change) => ({
      groupStageId: change.groupStageId,
      priorStandingSnapshotId: change.priorStandingSnapshotId,
      afterState: change.afterState,
    })),
    qualification: state.qualificationChanges,
    priorScheduleVersionId: activeScope.scheduleVersionId,
    successorScheduleHash: independentValidation.scheduleHash,
    changedAssignments,
    excludedSuccessorMatchIds: state.excludedSuccessorMatchIds,
    deferredAwardedMatchIds: state.deferredAwardedMatchIds,
    replayMatchIds: state.replayMatchIds,
  };
  return {
    risk: state.risk,
    candidate: {
      ...canonicalPayload,
      ...automatic,
      entryId: state.entryId,
      decision: state.decision,
      toState: state.toState,
      attendanceVersion: state.attendanceVersion,
      effectiveAt: state.effectiveAt,
      awardedResults: state.awardedResults,
      affectedMatches: state.affectedMatches,
      replayMatchIds: state.replayMatchIds,
      excludedSuccessorMatchIds: state.excludedSuccessorMatchIds,
      deferredAwardedMatchIds: state.deferredAwardedMatchIds,
      qualificationChanges: state.qualificationChanges,
      resultRouteSnapshots: state.resultRouteSnapshots,
      stateFingerprint: state.stateFingerprint,
      scheduleSessionId: activeScope.scheduleSessionId,
      priorScheduleVersionId: activeScope.scheduleVersionId,
      replayNotBefore,
      solverResult: {
        ...solverResult,
        inputHash: independentValidation.inputHash,
        scheduleHash: independentValidation.scheduleHash,
        objective: independentValidation.objective,
      },
      independentValidation,
      scheduleDiff,
      impact,
    },
    impact,
    warnings: state.decision === 'keep_awarded_result'
      ? ['Prior technical/admin-awarded results remain immutable; only future eligibility is restored.']
      : ['Awarded results are compensated by void revisions; affected descendants wait for replay and qualification.'],
    conflicts: [],
  };
}

export interface CompetitionTierBracketCandidate {
  tier: TierName;
  stageKey: string;
  stageOrder: number;
  bracketType: 'single_elimination' | 'double_elimination';
  matchRule: unknown;
  bronzeEnabled: boolean;
  resetFinalEnabled: boolean;
  participants: BracketParticipant[];
  topology: ReturnType<typeof generateSingleElimination>;
}

/** Pure service-level composition used by bracket preview and DB-free tests. */
export function buildCompetitionBracketCandidate(
  source: CompetitionTierSource,
  payload: Record<string, unknown>,
): {
  sourceHash: string;
  pipeline: CompetitionTierPipelineDto;
  tierBrackets: CompetitionTierBracketCandidate[];
  warnings: string[];
  impact: Record<string, unknown>;
} {
  const formatSnapshot = source.formatSnapshot;
  const rankingRulesSnapshot = source.rankingRulesSnapshot;
  if (!String(formatSnapshot.templateId ?? '').trim()) {
    throw new GoV2Error(
      409,
      'LOCKED_FORMAT_SNAPSHOT_REQUIRED',
      'Qualification and bracket materialization require the immutable TournamentFormatTemplateV2 projection',
    );
  }
  const configuredTierMode = String(formatSnapshot.tierMode ?? '');
  const tierQuotas = parseExactTierQuotas(formatSnapshot.tierQuotas);
  if (!['auto', 'two', 'three', 'manual'].includes(configuredTierMode)) {
    throw new GoV2Error(
      422,
      'INVALID_TIER_MODE',
      'tierMode must be auto, two, three or manual',
      { value: configuredTierMode, allowed: ['auto', 'two', 'three', 'manual'] },
    );
  }
  if (!tierQuotas) {
    throw new GoV2Error(
      409,
      'LOCKED_TIER_QUOTAS_REQUIRED',
      'The immutable format snapshot must contain exact tier quotas',
    );
  }
  const tierMode = configuredTierMode as 'auto' | 'two' | 'three';
  const internalMode = String(rankingRulesSnapshot.internalMatchPointsMode ?? 'total');
  assertLockedStructuralValue('tierMode', payload.tierMode, configuredTierMode);
  if (payload.tierQuotas !== undefined) {
    assertLockedStructuralValue('tierQuotas', parseExactTierQuotas(payload.tierQuotas), tierQuotas);
  }
  assertLockedStructuralValue('hardCap', payload.hardCap, Number(formatSnapshot.hardCap ?? 16));
  assertLockedStructuralValue('internalMatchPointsMode', payload.internalMatchPointsMode, internalMode);
  const pipeline = buildCompetitionTierPipeline({
    pools: source.pools,
    excludedEntryIds: source.excludedEntryIds ?? [],
    tierMode,
    hardCap: Number(formatSnapshot.hardCap ?? 16),
    tierQuotas,
    internalMatchPointsMode: internalMode === 'per_match' ? 'per_match' : 'total',
  });
  const globalBracketType = resolveGoV2BracketType(
    formatSnapshot.playoffFormat,
    'bracketType',
  );
  const formatMatchRules = asRecord(formatSnapshot.matchRules);
  const tierSettings = asRecord(payload.tierSettings);
  const lockedPlayoffRule = resolveGoV2MatchRule(
    formatMatchRules.playoffs,
    'formatSnapshot.matchRules.playoffs',
  );
  assertLockedStructuralValue('bracketType', payload.bracketType, globalBracketType);
  assertLockedStructuralValue('playoffFormat', payload.playoffFormat, globalBracketType);
  assertLockedMatchRule('matchRule', payload.matchRule, lockedPlayoffRule);
  const lockedResetFinal = formatSnapshot.resetFinalEnabled === true;
  const lockedBronze = formatSnapshot.bronzeEnabled === true;
  assertLockedStructuralValue('resetFinal', payload.resetFinal, lockedResetFinal);
  assertLockedStructuralValue('resetFinalEnabled', payload.resetFinalEnabled, lockedResetFinal);
  assertLockedStructuralValue('bronzeMatch', payload.bronzeMatch, lockedBronze);
  assertLockedStructuralValue('bronzeEnabled', payload.bronzeEnabled, lockedBronze);
  const tierOrder: readonly TierName[] = ['hard', 'medium', 'light'];
  const tierBrackets: CompetitionTierBracketCandidate[] = [];
  const warnings: string[] = [];

  for (const [tierIndex, tier] of tierOrder.entries()) {
    const participants = [...pipeline.bracketParticipants[tier]];
    if (!participants.length) continue;
    const target = source.targetStages[tier];
    const setting = asRecord(tierSettings[tier]);
    assertLockedStructuralValue(`tierSettings.${tier}.bracketType`, setting.bracketType, globalBracketType);
    assertLockedMatchRule(`tierSettings.${tier}.matchRule`, setting.matchRule, lockedPlayoffRule);
    assertLockedStructuralValue(`tierSettings.${tier}.resetFinal`, setting.resetFinal, lockedResetFinal);
    assertLockedStructuralValue(`tierSettings.${tier}.bronzeMatch`, setting.bronzeMatch, lockedBronze);
    if (target?.stageType !== undefined && target.stageType !== globalBracketType) {
      lockedFormatMismatch(`${tier}.stageType`, target.stageType, globalBracketType);
    }
    if (target?.matchRule !== undefined) {
      assertLockedMatchRule(`${tier}.stageMatchRule`, target.matchRule, lockedPlayoffRule);
    }
    const bracketType = globalBracketType;
    assertBracketParticipantCount(participants.length, bracketType, { tier });
    const matchRule = lockedPlayoffRule;
    const resetFinalEnabled = bracketType === 'double_elimination'
      && lockedResetFinal;
    const bronzeEnabled = bracketType === 'single_elimination'
      && lockedBronze;
    const topology = bracketType === 'double_elimination'
      ? generateDoubleElimination(participants, {
          resetFinal: resetFinalEnabled,
          idPrefix: `${tier.toUpperCase()}-DE`,
        })
      : generateSingleElimination(participants, {
          bronzeMatch: bronzeEnabled,
          idPrefix: `${tier.toUpperCase()}-SE`,
        });
    warnings.push(...topology.warnings.map((warning) => `${tier}: ${warning}`));
    tierBrackets.push({
      tier,
      stageKey: target?.stageKey ?? `${tier}_playoff`,
      stageOrder: target?.stageOrder ?? tierIndex + 3,
      bracketType,
      matchRule,
      bronzeEnabled,
      resetFinalEnabled,
      participants,
      topology,
    });
  }

  const sourceHash = hashObject({
    groupStageId: source.groupStageId,
    resultRevisionIds: source.resultRevisionIds,
    pipeline,
    tierBrackets: tierBrackets.map((bracket) => ({
      tier: bracket.tier,
      stageKey: bracket.stageKey,
      stageOrder: bracket.stageOrder,
      bracketType: bracket.bracketType,
      matchRule: bracket.matchRule,
      bronzeEnabled: bracket.bronzeEnabled,
      resetFinalEnabled: bracket.resetFinalEnabled,
      topologyHash: bracket.topology.topologyHash,
    })),
  });
  return {
    sourceHash,
    pipeline,
    tierBrackets,
    warnings,
    impact: {
      teamCount: pipeline.teamCount,
      groupCount: pipeline.groupCount,
      quotas: pipeline.quotas,
      tiers: Object.fromEntries(tierBrackets.map((bracket) => [bracket.tier, {
        participantCount: bracket.topology.participantCount,
        capacity: bracket.topology.capacity,
        guaranteedMatchCount: bracket.topology.guaranteedMatchCount,
        maximumMatchCount: bracket.topology.maximumMatchCount,
        earliestRematches: bracket.topology.rematchPreview,
      }])),
    },
  };
}

export interface LockedQualificationCorrectionProjection {
  after: {
    pipelineHash: string;
    quotas: CompetitionTierPipelineDto['quotas'];
    standingRows: CompetitionTierPipelineDto['standingRows'];
    comparisonRows: CompetitionTierPipelineDto['comparisonRows'];
    qualificationRows: CompetitionTierPipelineDto['qualificationRows'];
  };
  changes: {
    standingRows: Array<{
      entryId: string;
      before: { poolRank: number } | null;
      after: { poolRank: number } | null;
    }>;
    qualificationRows: Array<{
      entryId: string;
      before: { tier: string; tierSeed: number; poolRank: number } | null;
      after: { tier: string; tierSeed: number; poolRank: number } | null;
    }>;
    qualificationChanged: boolean;
  };
}

function buildLockedQualificationPipeline(
  source: CompetitionTierSource,
  rulesSnapshot: Record<string, unknown>,
): CompetitionTierPipelineDto {
  const quotas = parseExactTierQuotas(
    rulesSnapshot.quotas,
    'qualification.rulesSnapshot.quotas',
  );
  if (!quotas) {
    throw new GoV2Error(
      409,
      'LOCKED_QUALIFICATION_RULES_INCOMPLETE',
      'The immutable qualification snapshot does not contain exact tier quotas',
    );
  }
  try {
    const internalMode = String(source.rankingRulesSnapshot.internalMatchPointsMode ?? 'total');
    return buildCompetitionTierPipeline({
      pools: source.pools,
      excludedEntryIds: source.excludedEntryIds ?? [],
      tierMode: 'auto',
      hardCap: 16,
      tierQuotas: quotas,
      internalMatchPointsMode: internalMode === 'per_match' ? 'per_match' : 'total',
    });
  } catch (error) {
    if (error instanceof SportsDomainError) {
      throw new GoV2Error(409, error.code, error.message, { ...error.details });
    }
    throw error;
  }
}

function stableTextOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Replays the immutable qualification policy against a proposed group result.
 * The full before ledger remains in the impact object; this helper reports
 * only rank/progression changes alongside the authoritative after snapshot.
 */
export function buildLockedQualificationCorrectionProjection(
  source: CompetitionTierSource,
  rulesSnapshot: Record<string, unknown>,
  before: GoV2QualificationCorrectionContext['before'],
): LockedQualificationCorrectionProjection {
  const pipeline = buildLockedQualificationPipeline(source, rulesSnapshot);

  const beforeStanding = new Map(before.standingRows.map((rawRow) => {
    const row = asRecord(rawRow);
    return [String(row.entryId ?? ''), { poolRank: Number(row.poolRank) }] as const;
  }));
  const afterStanding = new Map(pipeline.standingRows.map((row) => [
    row.entryId,
    { poolRank: row.poolRank },
  ] as const));
  const standingEntryIds = [...new Set([...beforeStanding.keys(), ...afterStanding.keys()])]
    .filter(Boolean)
    .sort(stableTextOrder);
  const standingRows = standingEntryIds.flatMap((entryId) => {
    const prior = beforeStanding.get(entryId) ?? null;
    const next = afterStanding.get(entryId) ?? null;
    return prior?.poolRank === next?.poolRank ? [] : [{ entryId, before: prior, after: next }];
  });

  const normalizeQualification = (rawRow: unknown) => {
    const row = asRecord(rawRow);
    return {
      tier: String(row.tier ?? ''),
      tierSeed: Number(row.tierSeed),
      poolRank: Number(row.poolRank),
    };
  };
  const beforeQualification = new Map(before.qualificationRows.map((rawRow) => {
    const row = asRecord(rawRow);
    return [String(row.entryId ?? ''), normalizeQualification(row)] as const;
  }));
  const afterQualification = new Map(pipeline.qualificationRows.map((row) => [
    row.entryId,
    normalizeQualification(row),
  ] as const));
  const qualificationEntryIds = [
    ...new Set([...beforeQualification.keys(), ...afterQualification.keys()]),
  ].filter(Boolean).sort(stableTextOrder);
  const qualificationRows = qualificationEntryIds.flatMap((entryId) => {
    const prior = beforeQualification.get(entryId) ?? null;
    const next = afterQualification.get(entryId) ?? null;
    const unchanged = prior?.tier === next?.tier
      && prior?.tierSeed === next?.tierSeed
      && prior?.poolRank === next?.poolRank;
    return unchanged ? [] : [{ entryId, before: prior, after: next }];
  });

  return {
    after: {
      pipelineHash: hashObject(pipeline),
      quotas: pipeline.quotas,
      standingRows: pipeline.standingRows,
      comparisonRows: pipeline.comparisonRows,
      qualificationRows: pipeline.qualificationRows,
    },
    changes: {
      standingRows,
      qualificationRows,
      qualificationChanged: qualificationRows.length > 0,
    },
  };
}

async function prepareIncidentResultPayload(
  client: PoolClient,
  tournamentId: string,
  matchId: string,
  payload: Record<string, unknown>,
): Promise<{ payload: Record<string, unknown>; impact: GoV2ImpactPreview }> {
  const resultKind = String(payload.resultKind ?? 'voided');
  if (resultKind === 'played') {
    return preparePlayedResultPayload(client, { tournamentId, matchId, payload });
  }
  if (resultKind === 'incomplete') {
    return prepareIncompleteResultPayload(client, { tournamentId, matchId, payload });
  }
  if (['walkover', 'forfeit', 'admin_award'].includes(resultKind)) {
    return prepareTechnicalResultPayload(client, { tournamentId, matchId, payload });
  }
  if (resultKind === 'mutual_no_show' || resultKind === 'voided') {
    return prepareNoWinnerResultPayload(client, { tournamentId, matchId, payload });
  }
  throw new GoV2Error(
    422,
    'INCIDENT_RESULT_DETAILS_REQUIRED',
    `${resultKind} requires a supported played, technical, incomplete or no-winner result`,
  );
}

function competitionResultOverride(
  matchId: string,
  payload: Record<string, unknown>,
): CompetitionResultOverride {
  const resultKind = String(payload.resultKind ?? 'voided');
  const standingContributions = Array.isArray(payload.standingContributions)
    ? payload.standingContributions.map((row) => asRecord(row))
    : [];
  const winnerEntryId = payload.winnerEntryId ? String(payload.winnerEntryId) : null;
  const loserEntryId = payload.loserEntryId ? String(payload.loserEntryId) : null;
  return {
    matchId,
    resultRevisionToken: `preview:${hashObject({
      resultKind,
      winnerEntryId,
      loserEntryId,
      standingContributions,
    })}`,
    resultKind,
    playState: resultKind === 'voided' ? 'voided' : 'final',
    winnerEntryId,
    loserEntryId,
    standingContributions,
  };
}

async function projectQualificationCorrection(
  client: PoolClient,
  tournamentId: string,
  matchId: string,
  preparedPayload: Record<string, unknown>,
  impact: GoV2ImpactPreview,
): Promise<GoV2ImpactPreview> {
  const correction = impact.qualificationCorrection;
  if (!correction) return impact;
  const source = await loadCompetitionTierSource(client, tournamentId, {
    resultOverride: competitionResultOverride(matchId, preparedPayload),
  });
  const competition = buildCompetitionBracketCandidate(source, {});
  const projection = buildLockedQualificationCorrectionProjection(
    source,
    correction.rulesSnapshot,
    correction.before,
  );
  const cascadePlan = await loadQualificationCascadeTopologyPlan(
    client,
    tournamentId,
    competition.tierBrackets as unknown as Array<Record<string, unknown>>,
  );
  const voidedReplayBlocker = String(preparedPayload.resultKind) === 'voided'
    ? [{
        code: 'VOIDED_TRIGGER_REPLAY_RECOVERY_REQUIRED',
        message: 'Voiding the trigger cannot start replay until a replacement trigger match and schedule are committed atomically.',
        matchId,
      }]
    : [];
  return {
    ...impact,
    qualificationCorrection: {
      ...correction,
      blockers: [...correction.blockers, ...voidedReplayBlocker],
      capabilities: {
        ...correction.capabilities,
        cascadeVoidAndReplay: {
          ...correction.capabilities.cascadeVoidAndReplay,
          available: String(preparedPayload.resultKind) !== 'voided'
            && !correction.blockers.some((blocker) => (
              blocker.code === 'QUALIFICATION_CASCADE_GROUP_DESCENDANT_REPLAY_REQUIRED'
              || blocker.code === 'QUALIFICATION_CASCADE_PLACEMENT_STRATEGY_UNSUPPORTED'
            )),
        },
      },
      after: {
        ...projection.after,
        sourceHash: competition.sourceHash,
        tierBrackets: competition.tierBrackets,
      },
      changes: projection.changes,
      cascadePlan,
    },
  };
}

async function assertGoV2PaperImportTimingAvailable(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    actualStartedAt: string;
    actualEndedAt: string;
  },
): Promise<void> {
  const assignment = await client.query(
    `SELECT version.session_id::text AS schedule_session_id,
            schedule_assignment.court_id::text,
            source.slot_no,
            COALESCE(source.resolved_entry_id, source.source_entry_id)::text AS entry_id
     FROM go_v2_tournament_state state
     JOIN go_v2_schedule_versions version
       ON version.id = state.active_schedule_version_id
      AND version.status = 'published'
     JOIN go_v2_schedule_assignments schedule_assignment
       ON schedule_assignment.schedule_version_id = version.id
      AND schedule_assignment.match_id = $2
     JOIN go_v2_matches match
       ON match.id = schedule_assignment.match_id
      AND match.tournament_id = $1
     JOIN go_v2_match_slot_sources source
       ON source.match_id = match.id
      AND source.slot_no IN (1, 2)
     WHERE state.tournament_id = $1
     ORDER BY source.slot_no
     FOR UPDATE OF match`,
    [input.tournamentId, input.matchId],
  );
  const participants = assignment.rows.map((row) => ({
    slotNo: Number(row.slot_no),
    entryId: row.entry_id ? String(row.entry_id) : null,
  }));
  if (!assignment.rowCount || new Set(participants.map((participant) => participant.entryId).filter(Boolean)).size !== 2) {
    throw new GoV2Error(
      409,
      'PAPER_IMPORT_ASSIGNMENT_MISSING',
      'The match does not have two resolved participants in the active published schedule',
    );
  }
  const scheduleSessionId = String(assignment.rows[0].schedule_session_id);
  const courtId = String(assignment.rows[0].court_id);
  const entryIds = participants.map((participant) => String(participant.entryId));
  const lockedEntries = await client.query(
    `SELECT id::text
     FROM go_v2_entries
     WHERE id = ANY($1::uuid[])
     ORDER BY id
     FOR UPDATE`,
    [entryIds],
  );
  if (lockedEntries.rowCount !== entryIds.length) {
    throw new GoV2Error(409, 'MATCH_PARTICIPANTS_UNRESOLVED', 'A paper protocol participant no longer exists');
  }
  const rosterPlayers = await client.query(
    `SELECT entry.id::text AS entry_id, member.member_order, member.player_id::text
     FROM go_v2_entries entry
     LEFT JOIN go_v2_roster_revision_members member
       ON member.roster_revision_id = entry.current_roster_revision_id
     WHERE entry.id = ANY($1::uuid[])
     ORDER BY entry.id, member.member_order`,
    [entryIds],
  );
  const rosterCounts = new Map<string, number>();
  for (const row of rosterPlayers.rows) {
    if (row.member_order == null) continue;
    const entryId = String(row.entry_id);
    rosterCounts.set(entryId, (rosterCounts.get(entryId) ?? 0) + 1);
  }
  const sessionSize = await client.query(
    `SELECT count(*)::int AS tournament_count
     FROM go_v2_schedule_session_tournaments
     WHERE session_id = $1`,
    [scheduleSessionId],
  );
  const missingIdentity = rosterPlayers.rows.some((row) => row.member_order != null && !row.player_id)
    || entryIds.some((entryId) => rosterCounts.get(entryId) !== 2);
  if (Number(sessionSize.rows[0]?.tournament_count ?? 0) > 1 && missingIdentity) {
    throw new GoV2Error(
      409,
      'PLAYER_IDENTITY_REQUIRED_FOR_SHARED_SESSION',
      'Every paper protocol participant needs a linked player identity in a shared schedule session',
      { entryIds },
    );
  }
  const playerIds = [...new Set(rosterPlayers.rows
    .map((row) => row.player_id ? String(row.player_id) : '')
    .filter(Boolean))].sort();
  if (playerIds.length) {
    const lockedPlayers = await client.query(
      `SELECT id::text
       FROM players
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [playerIds],
    );
    if (lockedPlayers.rowCount !== playerIds.length) {
      throw new GoV2Error(409, 'PLAYER_IDENTITY_STALE', 'A paper protocol player identity no longer exists');
    }
  }
  const conflict = await client.query(
    `SELECT DISTINCT other_match.id::text AS match_id, other_match.match_key,
            other_assignment.court_id::text AS court_id,
            other_assignment.actual_start, other_assignment.actual_end
     FROM go_v2_schedule_versions other_version
     JOIN go_v2_schedule_assignments other_assignment
       ON other_assignment.schedule_version_id = other_version.id
     JOIN go_v2_matches other_match ON other_match.id = other_assignment.match_id
     JOIN go_v2_match_slot_sources other_source ON other_source.match_id = other_match.id
     JOIN go_v2_entries other_entry
       ON other_entry.id = COALESCE(other_source.resolved_entry_id, other_source.source_entry_id)
     LEFT JOIN go_v2_match_lineup_snapshots other_lineup
       ON other_lineup.match_id = other_match.id
      AND other_lineup.entry_id = other_entry.id
      AND other_lineup.result_revision_no = other_match.current_result_revision_no
     LEFT JOIN go_v2_roster_revision_members other_member
       ON other_member.roster_revision_id = COALESCE(
         other_lineup.roster_revision_id,
         other_entry.current_roster_revision_id
       )
     WHERE other_version.session_id = $1
       AND other_version.status = 'published'
       AND other_match.id <> $2
       AND other_assignment.actual_start IS NOT NULL
       AND other_assignment.actual_start < $4::timestamptz
       AND COALESCE(other_assignment.actual_end, 'infinity'::timestamptz) > $3::timestamptz
       AND (
         other_assignment.court_id = $5
         OR other_entry.id = ANY($6::uuid[])
         OR (
           cardinality($7::uuid[]) > 0
           AND other_member.player_id = ANY($7::uuid[])
         )
       )
     ORDER BY other_match.id
     LIMIT 1`,
    [
      scheduleSessionId,
      input.matchId,
      input.actualStartedAt,
      input.actualEndedAt,
      courtId,
      entryIds,
      playerIds,
    ],
  );
  if (conflict.rowCount) {
    throw new GoV2Error(
      409,
      'PAPER_IMPORT_ACTUAL_TIME_CONFLICT',
      'The paper protocol overlaps another actual match on the same court or for the same participant',
      {
        conflictMatchId: String(conflict.rows[0].match_id),
        conflictMatchKey: String(conflict.rows[0].match_key),
        conflictCourtId: String(conflict.rows[0].court_id),
        conflictActualStartedAt: new Date(conflict.rows[0].actual_start).toISOString(),
        conflictActualEndedAt: conflict.rows[0].actual_end
          ? new Date(conflict.rows[0].actual_end).toISOString()
          : null,
      },
    );
  }
}

async function prepareGoV2PaperImport(
  client: PoolClient,
  tournamentId: string,
  matchId: string,
  payload: Record<string, unknown>,
  reasonCode: string,
): Promise<{
  risk: GoV2Risk;
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
}> {
  if (reasonCode !== 'paper_result_import') {
    throw new GoV2Error(
      422,
      'PAPER_IMPORT_REASON_REQUIRED',
      'A paper result import must use reasonCode=paper_result_import',
    );
  }
  const resultKind = String(payload.resultKind ?? 'played');
  if (resultKind !== 'played') {
    throw new GoV2Error(
      422,
      'INCIDENT_WORKFLOW_REQUIRED',
      `${resultKind || 'missing result kind'} requires incident preview/commit`,
    );
  }
  const prepared = await preparePlayedResultPayload(client, {
    tournamentId,
    matchId,
    payload: { ...payload, resultKind: 'played' },
  });
  if (Number(prepared.payload.previousResultRevisionNo ?? 0) > 0) {
    throw new GoV2Error(
      409,
      'INCIDENT_PREVIEW_REQUIRED',
      'An existing result can only be corrected through incident preview/commit',
      prepared.impact as unknown as Record<string, unknown>,
    );
  }
  if (!['scheduled', 'locked'].includes(String(prepared.payload.matchScheduleState ?? ''))) {
    throw new GoV2Error(
      409,
      'PAPER_IMPORT_MATCH_NOT_SCHEDULED',
      'A paper result can only be imported for a match in the active scheduled lifecycle',
    );
  }
  if (!['pending', 'ready', 'live', 'paused'].includes(String(prepared.payload.matchPlayState ?? ''))) {
    throw new GoV2Error(
      409,
      'PAPER_IMPORT_MATCH_STATE_FORBIDDEN',
      `A paper result cannot be imported from ${String(prepared.payload.matchPlayState ?? 'unknown')}`,
    );
  }
  const actualStartedAtMs = Date.parse(String(payload.actualStartedAt ?? ''));
  const actualEndedAtMs = Date.parse(String(payload.actualEndedAt ?? ''));
  if (!Number.isFinite(actualStartedAtMs) || !Number.isFinite(actualEndedAtMs)) {
    throw new GoV2Error(
      422,
      'PAPER_IMPORT_ACTUAL_TIMING_REQUIRED',
      'actualStartedAt and actualEndedAt must be valid timestamps',
    );
  }
  if (actualEndedAtMs < actualStartedAtMs) {
    throw new GoV2Error(422, 'INVALID_ACTUAL_MATCH_WINDOW', 'actualEndedAt must not be before actualStartedAt');
  }
  if (actualEndedAtMs > Date.now() + 2 * 60_000) {
    throw new GoV2Error(
      422,
      'PAPER_IMPORT_FUTURE_RESULT_FORBIDDEN',
      'A paper result cannot finish more than two minutes in the future',
    );
  }
  await assertGoV2PaperImportTimingAvailable(client, {
    tournamentId,
    matchId,
    actualStartedAt: new Date(actualStartedAtMs).toISOString(),
    actualEndedAt: new Date(actualEndedAtMs).toISOString(),
  });
  if (prepared.impact.risk !== 'green') {
    throw new GoV2Error(
      409,
      'INCIDENT_PREVIEW_REQUIRED',
      'A paper import cannot change downstream progress; use incident preview/commit',
      prepared.impact as unknown as Record<string, unknown>,
    );
  }
  return {
    risk: 'green',
    candidate: {
      ...prepared.payload,
      matchId,
      resultMode: 'paper_import',
      resultKind: 'played',
      actualStartedAt: new Date(actualStartedAtMs).toISOString(),
      actualEndedAt: new Date(actualEndedAtMs).toISOString(),
      evidence: {
        ...asRecord(payload.evidence),
        source: 'paper_result_import',
      },
    },
    impact: prepared.impact as unknown as Record<string, unknown>,
  };
}

async function buildPreviewResult(
  client: PoolClient,
  tournamentId: string,
  operation: GoV2OperationKind,
  payload: Record<string, unknown>,
  risk: GoV2Risk,
  reasonCode: string,
): Promise<Record<string, unknown>> {
  try {
    if (operation === 'match.paper_import.preview') {
      const matchId = assertGoV2Uuid(payload.matchId, 'matchId');
      const prepared = await prepareGoV2PaperImport(client, tournamentId, matchId, payload, reasonCode);
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: [],
        conflicts: [],
      };
    }
    if (operation === 'draw.unlock.preview') {
      const prepared = await prepareDrawUnlock(client, { tournamentId, payload });
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: [
          'Unlock removes only the unstarted materialized draw. Immutable snapshots and the audit event remain available.',
        ],
        conflicts: [],
      };
    }

    if (operation === 'draw.preview') {
      // Registration lock is the immutable seed source. The draw request may
      // change only deterministic slot swaps, never the tournament entry set
      // or any sports rule frozen by TournamentFormatTemplateV2.
      const lockedFormat = await loadLockedTournamentFormat(client, tournamentId);
      assertLockedFormatConfig(payload, lockedFormat);
      if (!lockedFormat.poolFormat || !lockedFormat.groupMatchRule || !lockedFormat.materialized.groupPartition) {
        throw new GoV2Error(
          409,
          'GROUP_DRAW_NOT_AVAILABLE_FOR_LOCKED_TEMPLATE',
          'The locked standalone template does not contain a group draw',
          { templateId: lockedFormat.template.id },
        );
      }
      assertLockedStructuralValue('poolFormat', payload.poolFormat, lockedFormat.poolFormat);
      assertLockedMatchRule('matchRule', payload.matchRule, lockedFormat.groupMatchRule);
      const seedEntries: SeedEntry[] = await loadSeedEntries(client, tournamentId);
      if (seedEntries.length !== lockedFormat.materialized.teamCount) {
        throw new GoV2Error(
          409,
          'LOCKED_FORMAT_ENTRY_COUNT_MISMATCH',
          'The confirmed entry set no longer matches the registration format snapshot; unlock registration before drawing',
          { lockedTeamCount: lockedFormat.materialized.teamCount, confirmedEntryCount: seedEntries.length },
        );
      }
      const partition = lockedFormat.materialized.groupPartition;
      const poolFormat = lockedFormat.poolFormat;
      const matchRule = lockedFormat.groupMatchRule;
      let draw: GroupDraw = seedGroupsSnake(seedEntries, partition);
      const swaps = Array.isArray(payload.swaps)
        ? payload.swaps
        : Array.isArray(payload.manualSwaps)
          ? payload.manualSwaps
          : [];
      for (const rawSwap of swaps) {
        const swap = asRecord(rawSwap);
        let left = { groupId: String(swap.leftGroupId ?? ''), slot: Number(swap.leftSlot) };
        let right = { groupId: String(swap.rightGroupId ?? ''), slot: Number(swap.rightSlot) };
        if ((!left.groupId || !right.groupId) && swap.entryA && swap.entryB) {
          for (const group of draw.groups) {
            for (const slot of group.slots) {
              if (slot.entry.entryId === String(swap.entryA)) left = { groupId: group.groupId, slot: slot.slot };
              if (slot.entry.entryId === String(swap.entryB)) right = { groupId: group.groupId, slot: slot.slot };
            }
          }
        }
        draw = swapGroupSlots(
          draw,
          left,
          right,
        );
      }
      const pairings = draw.groups.flatMap((group) => {
        const entries = group.slots.map((slot) => slot.entry);
        return poolFormat === 'modified_pool_4'
          ? generateModifiedPool4(group.groupId, entries)
          : generateRoundRobinPairings(group.groupId, entries);
      });
      return {
        operation,
        risk,
        candidate: {
          ...payload,
          formatConfig: lockedFormat.formatSnapshot,
          lockedFormatSnapshot: lockedFormat.formatSnapshot,
          poolFormat,
          matchRule,
          partition,
          groups: draw.groups.map((group, index) => ({
            ...group,
            label: String.fromCharCode(65 + index),
          })),
          seedSnapshot: draw.seedSnapshot,
          pairings,
        },
        impact: {
          groupCount: partition.groupCount,
          threes: partition.threes,
          fours: partition.fours,
          matchCount: pairings.length,
        },
        warnings: [],
        conflicts: [],
      };
    }

    if (operation === 'bracket.preview') {
      const lockedFormat = await loadLockedTournamentFormat(client, tournamentId);
      assertLockedBracketOverrides(payload, lockedFormat);
      const isStandalone = lockedFormat.poolFormat === null;
      let suppliedParticipants = Array.isArray(payload.participants) ? payload.participants : [];
      if (isStandalone && (lockedFormat.playoffFormat === 'classification' || !suppliedParticipants.length)) {
        suppliedParticipants = (await loadSeedEntries(client, tournamentId)).map((entry) => ({
          entryId: entry.entryId,
          seed: entry.initialSeed,
        }));
      }
      if (!suppliedParticipants.length) {
        const source = await loadCompetitionTierSource(client, tournamentId);
        const competition = buildCompetitionBracketCandidate(source, payload);
        return {
          operation,
          risk,
          candidate: {
            ...payload,
            groupStageId: source.groupStageId,
            sourceHash: competition.sourceHash,
            tierPipeline: competition.pipeline,
            tierBrackets: competition.tierBrackets,
          },
          impact: competition.impact,
          warnings: competition.warnings,
          conflicts: [],
        };
      }
      // Explicit pre-qualified participants remain available for standalone or
      // externally qualified brackets and intentionally bypass group standings.
      const participants: BracketParticipant[] = suppliedParticipants.map((rawParticipant, index) => {
        const participant = asRecord(rawParticipant);
        return {
          entryId: String(participant.entryId ?? ''),
          seed: Number(participant.seed ?? index + 1),
          poolId: participant.poolId ? String(participant.poolId) : undefined,
          poolRank: participant.poolRank == null ? undefined : Number(participant.poolRank),
        };
      });
      if (!isStandalone) {
        throw new GoV2Error(
          409,
          'EXPLICIT_PARTICIPANTS_REQUIRE_STANDALONE_BRACKET',
          'Explicit bracket participants are allowed only for a registration locked as standalone_bracket',
        );
      }
      await assertTournamentEntryMembership(
        client,
        tournamentId,
        participants.map((participant) => participant.entryId),
        { requireAllConfirmed: true, context: 'standalone bracket' },
      );
      const stageOrder = Number(payload.stageOrder ?? 1);
      if (!Number.isSafeInteger(stageOrder) || stageOrder < 1) {
        throw new GoV2Error(422, 'INVALID_STAGE_ORDER', 'stageOrder must be a positive integer');
      }
      const tier = String(payload.tier ?? 'hard');
      if (!['hard', 'medium', 'light'].includes(tier)) {
        throw new GoV2Error(422, 'INVALID_STAGE_TIER', 'tier must be hard, medium or light');
      }
      const matchRule = lockedFormat.playoffMatchRule;
      if (lockedFormat.playoffFormat === 'classification') {
        const idPrefix = String(payload.idPrefix ?? 'CLASS');
        const topology = generateClassificationTopology(participants, { idPrefix });
        return {
          operation,
          risk,
          candidate: {
            ...payload,
            formatConfig: lockedFormat.formatSnapshot,
            lockedFormatSnapshot: lockedFormat.formatSnapshot,
            bracketType: 'classification',
            playoffFormat: 'classification',
            matchRule,
            bronzeEnabled: false,
            bronzeMatch: false,
            resetFinalEnabled: false,
            resetFinal: false,
            participants,
            topology,
            idPrefix,
            stageKey: String(payload.stageKey ?? 'standalone_classification'),
            stageOrder,
            tier,
          },
          impact: {
            participantCount: topology.participantCount,
            roundCount: topology.roundCount,
            realMatchCount: topology.realMatchCount,
            guaranteedMatchCount: topology.realMatchCount,
            maximumMatchCount: topology.realMatchCount,
            minimumGamesGuaranteed: topology.minimumGamesGuaranteed,
            maximumGames: topology.maximumGames,
            structuralIdleAppearances: topology.rounds.reduce(
              (total, round) => total + round.idleEntryIds.length,
              0,
            ),
          },
          warnings: [],
          conflicts: [],
        };
      }
      const bracketType = resolveGoV2BracketType(lockedFormat.playoffFormat);
      assertBracketParticipantCount(participants.length, bracketType, { tier });
      const topology = bracketType === 'double_elimination'
        ? generateDoubleElimination(participants, {
            resetFinal: lockedFormat.resetFinalEnabled,
            idPrefix: String(payload.idPrefix ?? 'DE'),
          })
        : generateSingleElimination(participants, {
            bronzeMatch: lockedFormat.bronzeEnabled,
            idPrefix: String(payload.idPrefix ?? 'SE'),
          });
      return {
        operation,
        risk,
        candidate: {
          ...payload,
          formatConfig: lockedFormat.formatSnapshot,
          lockedFormatSnapshot: lockedFormat.formatSnapshot,
          bracketType,
          matchRule,
          bronzeEnabled: lockedFormat.bronzeEnabled,
          bronzeMatch: lockedFormat.bronzeEnabled,
          resetFinalEnabled: lockedFormat.resetFinalEnabled,
          resetFinal: lockedFormat.resetFinalEnabled,
          participants,
          topology,
          stageKey: String(payload.stageKey ?? 'standalone_bracket'),
          stageOrder,
          tier,
        },
        impact: {
          participantCount: topology.participantCount,
          capacity: topology.capacity,
          guaranteedMatchCount: topology.guaranteedMatchCount,
          maximumMatchCount: topology.maximumMatchCount,
          earliestRematches: topology.rematchPreview,
        },
        warnings: topology.warnings,
        conflicts: [],
      };
    }

    if (operation === 'schedule.generate.preview' || operation === 'schedule.replan.preview') {
      // Matches, participants, dependencies, rest and published locks are always
      // compiled from the authoritative database snapshot. The client controls
      // session preferences only; accepting a supplied solverInput would allow a
      // partial schedule to validate against its own weakened constraints.
      const automatic = await buildAutomaticSchedulePayload(client, tournamentId, payload);
      const solverInput = automatic.solverInput;
      const solverResult = solveSchedule(solverInput);
      const independentValidation = validateSchedule(solverInput, solverResult.assignments);
      return {
        operation,
        risk,
        candidate: { ...payload, ...automatic, solverResult, independentValidation },
        impact: {
          solverStatus: solverResult.status,
          publishable: solverResult.publishable,
          scheduleHash: solverResult.scheduleHash,
          objective: solverResult.objective,
          independentlyValidated: independentValidation.publishable,
        },
        warnings: solverResult.warnings,
        conflicts: solverResult.conflicts,
      };
    }

    if (operation === 'schedule.policy.preview') {
      const policyException = parseGoV2CourtPolicyExceptionRequest(payload);
      const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
      const canonicalPayload = {
        ...payload,
        sessionTournamentIds: activeScope.sessionTournamentIds,
        sessionTournamentVersions: activeScope.sessionTournamentVersions,
        courts: activeScope.courts,
        sessionKey: activeScope.sessionKey,
        timezone: activeScope.timezone,
        startTime: localClock(activeScope.windowStart, activeScope.timezone),
        endTime: localClock(activeScope.windowEnd, activeScope.timezone),
        freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
        refereeMode: activeScope.refereeMode,
      };
      const automatic = await buildAutomaticSchedulePayload(client, tournamentId, canonicalPayload, {
        courtPolicyException: policyException,
      });
      const solverInput = automatic.solverInput;
      const solverResult = solveSchedule(solverInput);
      const independentValidation = validateSchedule(solverInput, solverResult.assignments);
      const currentByMatchId = new Map(solverInput.matches.flatMap((match) => (
        match.published ? [[match.id, match.published] as const] : []
      )));
      const changedAssignments = solverResult.assignments.filter((assignment) => {
        const current = currentByMatchId.get(assignment.matchId);
        return !current
          || current.courtId !== assignment.courtId
          || Date.parse(current.start) !== Date.parse(assignment.start);
      }).map((assignment) => ({
        matchId: assignment.matchId,
        from: currentByMatchId.get(assignment.matchId) ?? null,
        to: {
          courtId: assignment.courtId,
          start: assignment.start,
          end: assignment.end,
          referee: assignment.referee,
        },
      }));
      const scheduleSessionId = String(automatic.session.id ?? '');
      if (!scheduleSessionId) {
        throw new GoV2Error(409, 'COURT_POLICY_REQUIRES_PUBLISHED_SCHEDULE', 'Active schedule session was not resolved');
      }
      return {
        operation,
        risk: 'amber',
        candidate: {
          ...canonicalPayload,
          courtPolicyException: {
            ...policyException,
            tournamentId,
            scheduleSessionId,
            decision: 'approve',
          },
          ...automatic,
          solverResult,
          independentValidation,
          scheduleDiff: {
            kind: 'court_policy_exception',
            changedAssignments,
            successorAssignments: solverResult.assignments,
          },
        },
        impact: {
          policyCode: 'lpv_tier_courts_v1',
          scheduleSessionId,
          tier: policyException.tier,
          stageId: policyException.stageId,
          effectiveFrom: policyException.effectiveFrom,
          effectiveUntil: policyException.effectiveUntil,
          allowedCourtIds: policyException.allowedCourtIds,
          changedAssignments,
          changedMatchCount: changedAssignments.length,
          solverStatus: solverResult.status,
          publishable: solverResult.publishable,
          scheduleHash: solverResult.scheduleHash,
          objective: solverResult.objective,
          independentlyValidated: independentValidation.publishable,
        },
        diagnostics: solverResult.diagnostics ?? null,
        scheduleDiff: {
          kind: 'court_policy_exception',
          changedAssignments,
          successorAssignments: solverResult.assignments,
        },
        warnings: [
          'Director-approved court exception is temporary and applies only to the immutable successor schedule.',
          ...solverResult.warnings,
        ],
        conflicts: solverResult.conflicts,
      };
    }

    if (operation === 'schedule.defer.preview') {
      if (reasonCode !== 'schedule_deferred') {
        throw new GoV2Error(
          422,
          'SCHEDULE_DEFER_REASON_MISMATCH',
          'reasonCode must be schedule_deferred',
        );
      }
      const prepared = await prepareGoV2ScheduleDefer(client, tournamentId, payload);
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        scheduleDiff: asRecord(prepared.candidate.scheduleDiff),
        diagnostics: asRecord(prepared.candidate.solverResult).diagnostics ?? null,
        warnings: prepared.warnings,
        conflicts: prepared.conflicts,
      };
    }

    if (operation === 'schedule.defer.release.preview') {
      if (reasonCode !== 'schedule_defer_released') {
        throw new GoV2Error(
          422,
          'SCHEDULE_DEFER_RELEASE_REASON_MISMATCH',
          'reasonCode must be schedule_defer_released',
        );
      }
      const prepared = await prepareGoV2ScheduleDeferRelease(client, tournamentId, payload);
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        scheduleDiff: asRecord(prepared.candidate.scheduleDiff),
        diagnostics: asRecord(prepared.candidate.solverResult).diagnostics ?? null,
        warnings: prepared.warnings,
        conflicts: prepared.conflicts,
      };
    }

    if (operation === 'stage.rules.preview') {
      if (reasonCode !== 'stage_rule_changed') {
        throw new GoV2Error(
          422,
          'STAGE_RULE_REASON_MISMATCH',
          'reasonCode must be stage_rule_changed',
        );
      }
      const prepared = await prepareGoV2StageRuleChange(client, tournamentId, payload, { lock: false });
      const activeScope = prepared.activeScope;
      const canonicalPayload = {
        ...payload,
        sessionTournamentIds: activeScope.sessionTournamentIds,
        sessionTournamentVersions: activeScope.sessionTournamentVersions,
        courts: activeScope.courts,
        sessionKey: activeScope.sessionKey,
        timezone: activeScope.timezone,
        startTime: localClock(activeScope.windowStart, activeScope.timezone),
        endTime: localClock(activeScope.windowEnd, activeScope.timezone),
        freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
        refereeMode: activeScope.refereeMode,
      };
      const automatic = await buildAutomaticSchedulePayload(client, tournamentId, canonicalPayload, {
        stageRuleChange: prepared.change,
      });
      const solverResult = solveSchedule(automatic.solverInput);
      const independentValidation = validateSchedule(automatic.solverInput, solverResult.assignments);
      const currentByMatchId = new Map(automatic.solverInput.matches.flatMap((match) => (
        match.published ? [[match.id, match.published] as const] : []
      )));
      const changedAssignments = buildGoV2ScheduleAssignmentDiff(
        currentByMatchId,
        solverResult.assignments as unknown as Array<Record<string, unknown>>,
      );
      const scheduleDiff = {
        kind: 'stage_rule_change',
        stageId: prepared.change.stageId,
        effectiveFromRoundNo: prepared.change.effectiveFromRoundNo,
        changedAssignments,
        successorAssignments: solverResult.assignments,
      };
      const impact = {
        ...prepared.impact,
        scheduleSessionId: String(automatic.session.id ?? ''),
        successorScheduleHash: solverResult.scheduleHash,
        solverStatus: solverResult.status,
        publishable: solverResult.publishable && independentValidation.publishable,
        independentlyValidated: independentValidation.publishable,
        objective: solverResult.objective,
        restImpact: {
          maxSoftRestDeficitMinutes: solverResult.objective?.maxSoftRestDeficitMinutes ?? null,
          softRestDeficitMinutes: solverResult.objective?.softRestDeficitMinutes ?? null,
          teamTimelines: solverResult.diagnostics?.teamTimelines ?? [],
        },
        changedAssignmentCount: changedAssignments.length,
      };
      return {
        operation,
        risk: prepared.risk,
        candidate: {
          ...canonicalPayload,
          stageRuleChange: prepared.change,
          ...automatic,
          solverResult,
          independentValidation,
          scheduleDiff,
          impact,
        },
        impact,
        scheduleDiff,
        diagnostics: solverResult.diagnostics ?? null,
        warnings: [
          'The rule is applied uniformly from the nearest complete unstarted round.',
          ...solverResult.warnings,
        ],
        conflicts: [
          ...solverResult.conflicts,
          ...independentValidation.conflicts,
        ],
      };
    }

    if (operation === 'roster.replacement.preview') {
      const entryId = assertGoV2Uuid(payload.entryId, 'entryId');
      const prepared = await prepareRosterReplacement(client, { tournamentId, entryId, payload });
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.risk === 'amber'
          ? ['The draw slot is preserved; published future matches may require notification.']
          : [],
        conflicts: [],
      };
    }

    if (operation === 'reserve.promotion.preview') {
      if (reasonCode !== 'reserve_promoted') {
        throw new GoV2Error(422, 'RESERVE_PROMOTION_REASON_MISMATCH', 'reasonCode must be reserve_promoted');
      }
      const reserveEntryId = assertGoV2Uuid(payload.reserveEntryId, 'reserveEntryId');
      const prepared = await prepareGoV2ReservePromotionPreview(
        client,
        tournamentId,
        reserveEntryId,
        payload,
      );
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.warnings,
        conflicts: prepared.conflicts,
      };
    }

    if (operation === 'attendance.preview') {
      const entryId = assertGoV2Uuid(payload.entryId, 'entryId');
      const prepared = await prepareGoV2AttendanceMutation(client, { tournamentId, entryId, payload });
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.candidate.nextAction === 'incident_preview_required'
          ? ['Attendance never creates a technical result automatically; use incident preview after director review.']
          : [],
        conflicts: [],
      };
    }

    if (operation === 'attendance.reinstate.preview') {
      if (reasonCode !== 'attendance_reinstated') {
        throw new GoV2Error(
          422,
          'ATTENDANCE_REINSTATEMENT_REASON_MISMATCH',
          'reasonCode must be attendance_reinstated',
        );
      }
      const prepared = await prepareGoV2AttendanceReinstatement(client, tournamentId, payload);
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        scheduleDiff: asRecord(prepared.candidate.scheduleDiff),
        diagnostics: asRecord(prepared.candidate.solverResult).diagnostics ?? null,
        warnings: prepared.warnings,
        conflicts: prepared.conflicts,
      };
    }

    if (operation === 'disruption.preview') {
      const prepared = await prepareGoV2Disruption(client, { tournamentId, payload });
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.candidate.requiresLiveMatchDecision
          ? ['A live match is affected. Choose transfer or incomplete result before schedule replan.']
          : prepared.candidate.requiresScheduleReplan
            ? ['Commit records the disruption only; publish a separate schedule replan.']
            : [],
        conflicts: [],
      };
    }

    if (operation === 'disruption.resolve.preview') {
      if (reasonCode !== 'disruption_resolved') {
        throw new GoV2Error(
          422,
          'DISRUPTION_RESOLUTION_REASON_MISMATCH',
          'A disruption resolution must use reasonCode=disruption_resolved',
        );
      }
      const disruptionId = assertGoV2Uuid(payload.disruptionId, 'disruptionId');
      const prepared = await prepareGoV2DisruptionResolution(client, {
        tournamentId,
        disruptionId,
        payload,
      });
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.candidate.pausedMatchIds && Array.isArray(prepared.candidate.pausedMatchIds)
          && prepared.candidate.pausedMatchIds.length
          ? ['Resolving a hold never resumes a paused match; record a separate pause resolution.']
          : [],
        conflicts: [],
      };
    }

    if (operation === 'match.pause_resolution.preview') {
      const decision = String(payload.decision ?? '');
      const expectedReasonCode = decision === 'transfer'
        ? 'live_match_transfer'
        : decision === 'defer'
          ? 'match_pause_deferred'
          : 'match_pause_resume_authorized';
      if (reasonCode !== expectedReasonCode) {
        throw new GoV2Error(
          422,
          'PAUSE_RESOLUTION_REASON_MISMATCH',
          `reasonCode must be ${expectedReasonCode}`,
        );
      }
      const matchId = assertGoV2Uuid(payload.matchId, 'matchId');
      const prepared = await prepareGoV2PauseResolution(client, tournamentId, matchId, payload);
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.warnings,
        conflicts: prepared.conflicts,
      };
    }

    if (operation === 'entry.withdrawal.preview') {
      const entryId = assertGoV2Uuid(payload.entryId, 'entryId');
      const prepared = await prepareEntryWithdrawal(client, { tournamentId, entryId, payload });
      return {
        operation,
        risk: prepared.risk,
        candidate: prepared.candidate,
        impact: prepared.impact,
        warnings: prepared.risk === 'amber'
          ? ['Scheduled matches will be skipped and require a live schedule replan after commit.']
          : [],
        conflicts: [],
      };
    }

    if (operation === 'incident.preview') {
      const triggerMatchId = assertGoV2Uuid(
        payload.triggerMatchId ?? payload.matchId,
        'triggerMatchId',
      );
      const prepared = await prepareIncidentResultPayload(
        client,
        tournamentId,
        triggerMatchId,
        payload,
      );
      const impact = await projectQualificationCorrection(
        client,
        tournamentId,
        triggerMatchId,
        prepared.payload,
        prepared.impact,
      );
      const voidedReplayConflict = String(prepared.payload.resultKind) === 'voided'
        ? [{
            code: 'VOIDED_TRIGGER_REPLAY_RECOVERY_REQUIRED',
            message: 'cascade_void_and_replay is unavailable for a voided trigger without an atomic replacement match and schedule.',
            matchId: triggerMatchId,
          }]
        : [];
      return {
        operation,
        risk: impact.risk,
        candidate: {
          ...prepared.payload,
          triggerMatchId,
          matchId: triggerMatchId,
          impact,
        },
        impact,
        warnings: impact.risk === 'red'
          ? ['The incident reaches locked qualification or downstream progress and requires explicit red confirmation.']
          : impact.qualificationCorrection
            ? ['Qualification is locked. cascade_void_and_replay will append new snapshots and atomically publish a validated successor schedule when one exists.']
            : [],
        conflicts: [
          ...(impact.qualificationCorrection?.blockers ?? []),
          ...voidedReplayConflict.filter((candidate) => (
            !impact.qualificationCorrection?.blockers.some((blocker) => blocker.code === candidate.code)
          )),
        ],
      };
    }

    if (operation === 'mutation.undo.preview') {
      const batchId = assertGoV2Uuid(payload.batchId, 'batchId');
      const impact = await previewCompensatingUndo(client, tournamentId, batchId);
      const undoRisk = normalizeGoV2Risk(impact.risk);
      return {
        operation,
        risk: undoRisk,
        candidate: { batchId, impact },
        impact,
        warnings: undoRisk === 'red'
          ? ['Undo reaches a live/final match and requires explicit red confirmation.']
          : [],
        conflicts: [],
      };
    }
  } catch (error) {
    if (error instanceof GoV2Error) throw error;
    if (error instanceof SportsDomainError) {
      const groupSnapshotConflict = new Set([
        'INCOMPLETE_POOL_STANDING',
        'INCOMPLETE_POOL_LEDGER',
        'INCOMPLETE_MODIFIED_POOL_LEDGER',
        'INCONSISTENT_POOL_MATCH_LEDGER',
        'INVALID_MODIFIED_POOL_FINAL_RANKS',
        'DUPLICATE_COMPETITION_ENTRY',
        'DUPLICATE_INITIAL_SEED',
        'TIER_STANDING_SNAPSHOT_INCOMPLETE',
      ]).has(error.code);
      throw new GoV2Error(groupSnapshotConflict ? 409 : 422, error.code, error.message, { ...error.details });
    }
    throw error;
  }
  return {
    operation,
    risk,
    candidate: payload,
    impact: asRecord(payload.impact),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [],
  };
}

function replayedResponse<T extends Record<string, unknown>>(payload: T): T {
  return { ...payload, replayed: true };
}

export async function getGoV2Structure(tournamentIdRaw: string): Promise<GoV2StructureResponse> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  return readGoV2Structure(tournamentId, { requireEnabled: true });
}

export async function getPublicGoV2Structure(tournamentIdRaw: string): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const structure = await readGoV2Structure(tournamentId, { requirePublic: true });
  const visibleStageIds = new Set(
    structure.stages
      .filter((stage) => ['locked', 'live', 'finished'].includes(String(stage.status ?? '')))
      .map((stage) => String(stage.id)),
  );
  const stages = structure.stages.filter((stage) => visibleStageIds.has(String(stage.id)));
  const stageEdges = structure.stageEdges.filter((edge) => (
    visibleStageIds.has(String(edge.fromStageId))
    && visibleStageIds.has(String(edge.toStageId))
  )).map((edge) => ({
    id: edge.id,
    fromStageId: edge.fromStageId,
    toStageId: edge.toStageId,
    routingKind: edge.routingKind,
    routingConfig: edge.routingConfig,
  }));
  const pools = structure.pools
    .filter((pool) => visibleStageIds.has(String(pool.stageId)))
    .map((pool) => ({
      id: pool.id,
      stageId: pool.stageId,
      poolNo: pool.poolNo,
      label: pool.label,
      capacity: pool.capacity,
      status: pool.status,
      assignments: Array.isArray(pool.assignments)
        ? pool.assignments.map((rawAssignment) => {
            const assignment = asRecord(rawAssignment);
            return {
              entryId: assignment.entryId,
              slotNo: assignment.slotNo,
              sourceSeed: assignment.sourceSeed,
            };
          })
        : [],
    }));
  const matches = structure.matches
    .filter((match) => visibleStageIds.has(String(match.stageId)))
    .map((match) => {
      const safeMatch = { ...match };
      delete safeMatch.activeJudgeDeviceId;
      return safeMatch;
    });
  const publicScheduleMatchIds = new Set(
    matches
      .filter((match) => !['unscheduled', 'skipped', 'cancelled'].includes(String(match.scheduleState ?? '')))
      .map((match) => String(match.id)),
  );
  const visibleEntryIds = new Set<string>();
  for (const pool of pools) {
    for (const rawAssignment of Array.isArray(pool.assignments) ? pool.assignments : []) {
      const entryId = String(asRecord(rawAssignment).entryId ?? '');
      if (entryId) visibleEntryIds.add(entryId);
    }
  }
  for (const match of matches) {
    for (const rawSource of Array.isArray(match.slotSources) ? match.slotSources : []) {
      const source = asRecord(rawSource);
      for (const value of [source.sourceEntryId, source.resolvedEntryId]) {
        const entryId = String(value ?? '');
        if (entryId) visibleEntryIds.add(entryId);
      }
    }
  }
  const timezoneBySessionId = new Map(
    structure.scheduleSessions.map((session) => [
      String(session.id ?? ''),
      String(session.timezone ?? 'Asia/Yekaterinburg'),
    ]),
  );
  const scheduleVersions = structure.scheduleVersions
    .filter((version) => (
      String(version.status) === 'published'
      && String(version.id) === String(structure.tournament.activeScheduleVersionId ?? '')
    ))
    .map((version) => ({
      id: version.id,
      sessionId: version.sessionId,
      versionNo: version.versionNo,
      status: version.status,
      scheduleHash: version.scheduleHash,
      timezone: timezoneBySessionId.get(String(version.sessionId ?? '')) ?? 'Asia/Yekaterinburg',
      assignments: Array.isArray(version.assignments)
        ? version.assignments.filter((rawAssignment) => (
            publicScheduleMatchIds.has(String(asRecord(rawAssignment).matchId ?? ''))
          )).map((rawAssignment) => {
            const assignment = asRecord(rawAssignment);
            return {
              id: assignment.id,
              matchId: assignment.matchId,
              courtNo: assignment.courtNo,
              courtLabel: assignment.courtLabel,
              plannedStart: assignment.plannedStart,
              plannedEnd: assignment.plannedEnd,
              predictedStart: assignment.predictedStart,
              predictedEnd: assignment.predictedEnd,
              actualStart: assignment.actualStart,
              actualEnd: assignment.actualEnd,
              liveEta: assignment.liveEta,
              isConditional: assignment.isConditional,
              refereeDuty: assignment.refereeDuty ? {
                dutyKind: asRecord(assignment.refereeDuty).dutyKind,
                refereeEntryId: asRecord(assignment.refereeDuty).refereeEntryId,
                status: asRecord(assignment.refereeDuty).status,
              } : null,
            };
          })
        : [],
      publishedAt: version.publishedAt,
    }));
  const currentSchedule = scheduleVersions[0] ?? null;
  const immutableStandings = structure.standings
    .filter((standing) => visibleStageIds.has(String(standing.stageId)));
  const immutableStandingStageIds = new Set(
    immutableStandings.map((standing) => String(standing.stageId ?? '')),
  );
  const liveStandings = structure.liveStandings
    .filter((standing) => visibleStageIds.has(String(standing.stageId)))
    .map((standing) => ({
      snapshotId: null,
      stageId: standing.stageId,
      poolId: standing.poolId,
      format: standing.format,
      poolSize: standing.poolSize,
      profileCode: standing.profileCode,
      provisional: standing.provisional,
      complete: standing.complete,
      rankSource: standing.rankSource,
      completedMatches: standing.completedMatches,
      expectedMatches: standing.expectedMatches,
      rows: Array.isArray(standing.rows)
        ? standing.rows.map((rawRow) => {
            const row = asRecord(rawRow);
            return {
              entryId: row.entryId,
              poolId: row.poolId,
              poolSize: row.poolSize,
              poolRank: row.poolRank,
              initialSeed: row.initialSeed,
              provisional: row.provisional,
              rankSource: row.rankSource,
              metrics: row.metrics,
            };
          })
        : [],
    }));
  // Preserve immutable bracket-lock snapshots as the official record. Before
  // a stage has one, expose its current-result table through the established
  // standings field as well as the explicit liveStandings channel.
  const publicStandings = [
    ...immutableStandings,
    ...liveStandings.filter((standing) => !immutableStandingStageIds.has(String(standing.stageId ?? ''))),
  ];

  return {
    tournament: {
      id: structure.tournament.id,
      name: structure.tournament.name,
      date: structure.tournament.date,
      time: structure.tournament.time,
      location: structure.tournament.location,
      engineVersion: 2,
      aggregateVersion: structure.tournament.aggregateVersion,
      lifecycleState: structure.tournament.lifecycleState,
      timezone: currentSchedule?.timezone ?? 'Asia/Yekaterinburg',
    },
    entries: structure.entries.filter((entry) => visibleEntryIds.has(String(entry.id))).map((entry) => ({
      id: entry.id,
      entryNo: entry.entryNo,
      displayName: entry.displayName,
      registrationState: entry.registrationState,
      attendanceState: entry.attendanceState,
      attendanceVersion: entry.attendanceVersion,
      initialSeed: entry.initialSeed,
    })),
    stages,
    stageEdges,
    pools,
    matches,
    standings: publicStandings,
    liveStandings,
    finalPlacements: structure.finalPlacements ? {
      snapshotId: structure.finalPlacements.snapshotId,
      aggregateVersion: structure.finalPlacements.aggregateVersion,
      sourceKind: structure.finalPlacements.sourceKind,
      sourceResultsHash: structure.finalPlacements.sourceResultsHash,
      standingsHash: structure.finalPlacements.standingsHash,
      createdAt: structure.finalPlacements.createdAt,
      rows: structure.finalPlacements.rows.map((row) => ({
        entryId: row.entryId,
        sourceStageId: row.sourceStageId,
        sourceStageKey: row.sourceStageKey,
        tier: row.tier,
        tierPlace: row.tierPlace,
        overallPlace: row.overallPlace,
        sportingTierPlaceRange: row.sportingTierPlaceRange,
        sportingOverallPlaceRange: row.sportingOverallPlaceRange,
        initialSeed: row.initialSeed,
        gamesPlayed: row.gamesPlayed,
        losses: row.losses,
        eliminatedByMatchId: row.eliminatedByMatchId,
        basis: row.basis,
      })),
    } : null,
    courts: structure.courts.map((court) => ({
      id: court.id,
      courtNo: court.courtNo,
      label: court.label,
      venueId: court.venueId,
    })),
    activeDisruptions: structure.activeDisruptions.map((disruption) => ({
      id: disruption.id,
      scopeKind: disruption.scopeKind,
      courtId: disruption.courtId,
      matchId: disruption.matchId,
      disruptionKind: disruption.disruptionKind,
      status: disruption.status,
      startsAt: disruption.startsAt,
      expectedEndAt: disruption.expectedEndAt,
    })),
    currentSchedule,
    scheduleVersions,
  };
}

async function prepareGoV2ReservePromotionPreview(
  client: PoolClient,
  tournamentId: string,
  reserveEntryId: string,
  payload: Record<string, unknown>,
): Promise<{
  risk: GoV2Risk;
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
  warnings: unknown[];
  conflicts: unknown[];
}> {
  const prepared = await prepareReservePromotion(client, {
    tournamentId,
    reserveEntryId,
    payload,
  });
  if (prepared.candidate.requiresSuccessorSchedule !== true) {
    return {
      ...prepared,
      warnings: [],
      conflicts: [],
    };
  }
  const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
  if (activeScope.scheduleVersionId !== String(prepared.candidate.priorScheduleVersionId ?? '')) {
    throw new GoV2Error(
      409,
      'RESERVE_PROMOTION_ACTIVE_SCHEDULE_MISMATCH',
      'The replacement slot and active shared schedule do not have the same lineage',
    );
  }
  const canonicalPayload: Record<string, unknown> = {
    sessionTournamentIds: activeScope.sessionTournamentIds,
    sessionTournamentVersions: activeScope.sessionTournamentVersions,
    courts: activeScope.courts,
    sessionKey: activeScope.sessionKey,
    timezone: activeScope.timezone,
    startTime: localClock(activeScope.windowStart, activeScope.timezone),
    endTime: localClock(activeScope.windowEnd, activeScope.timezone),
    freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
    refereeMode: activeScope.refereeMode,
  };
  const entrySubstitution = {
    tournamentId,
    fromEntryId: String(prepared.candidate.targetEntryId),
    toEntryId: reserveEntryId,
    fromPlayerIds: Array.isArray(prepared.candidate.targetPlayerIds)
      ? prepared.candidate.targetPlayerIds.map(String)
      : [],
    toPlayerIds: Array.isArray(prepared.candidate.reservePlayerIds)
      ? prepared.candidate.reservePlayerIds.map(String)
      : [],
  };
  const automatic = await buildAutomaticSchedulePayload(client, tournamentId, canonicalPayload, {
    entrySubstitution,
  });
  const solverResult = solveSchedule(automatic.solverInput);
  const independentValidation = validateSchedule(automatic.solverInput, solverResult.assignments);
  if (!solverResult.publishable || !independentValidation.publishable || !independentValidation.scheduleHash) {
    throw new GoV2Error(
      409,
      'RESERVE_PROMOTION_SCHEDULE_INFEASIBLE',
      'The reserve cannot enter the shared published schedule without violating court, player, rest or referee constraints',
      { conflicts: [...solverResult.conflicts, ...independentValidation.conflicts] },
    );
  }
  const currentByMatchId = new Map(automatic.solverInput.matches.flatMap((match) => (
    match.published ? [[match.id, match.published] as const] : []
  )));
  const changedAssignments = buildGoV2ScheduleAssignmentDiff(
    currentByMatchId,
    solverResult.assignments as unknown as Array<Record<string, unknown>>,
  );
  const scheduleDiff = {
    kind: 'reserve_promotion',
    reserveEntryId,
    targetEntryId: entrySubstitution.fromEntryId,
    changedAssignments,
    successorAssignments: solverResult.assignments,
  };
  const impact = {
    ...prepared.impact,
    scheduleSessionId: activeScope.scheduleSessionId,
    priorScheduleVersionId: activeScope.scheduleVersionId,
    successorScheduleHash: independentValidation.scheduleHash,
    changedAssignments,
    changedMatchCount: changedAssignments.length,
    solverStatus: solverResult.status,
    publishable: solverResult.publishable && independentValidation.publishable,
    independentlyValidated: independentValidation.publishable,
  };
  return {
    // A full-team identity change inside an already published shared schedule
    // is a red operation: a second director must review the exact frozen
    // assignments and scheduleHash before commit.
    risk: 'red',
    candidate: {
      ...prepared.candidate,
      ...canonicalPayload,
      ...automatic,
      entrySubstitution,
      solverResult,
      independentValidation,
      scheduleDiff,
      impact,
    },
    impact,
    warnings: [
      'The selected draw slot is preserved; a second director must approve the exact successor assignments and scheduleHash frozen in this preview.',
      ...solverResult.warnings,
    ],
    conflicts: [...solverResult.conflicts, ...independentValidation.conflicts],
  };
}

async function prepareGoV2ScheduleDefer(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
): Promise<{
  risk: GoV2Risk;
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
  warnings: unknown[];
  conflicts: unknown[];
}> {
  const request = parseGoV2ScheduleDeferRequest(payload);
  const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
  const currentResult = await client.query(
    `SELECT match.play_state, match.schedule_state,
            assignment.id::text AS assignment_id,
            assignment.court_id::text AS court_id,
            assignment.planned_start, assignment.planned_end,
            assignment.is_locked,
            version.id::text AS schedule_version_id,
            version.schedule_hash AS prior_schedule_hash
     FROM go_v2_matches match
     JOIN go_v2_tournament_state state
       ON state.tournament_id = match.tournament_id
     JOIN go_v2_schedule_versions version
       ON version.id = state.active_schedule_version_id
      AND version.status = 'published'
     JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = version.id
      AND assignment.match_id = match.id
     WHERE match.id = $1 AND match.tournament_id = $2`,
    [request.matchId, tournamentId],
  );
  if (!currentResult.rowCount) {
    throw new GoV2Error(
      404,
      'DEFER_MATCH_NOT_IN_ACTIVE_SCHEDULE',
      'The match is not assigned in the active published schedule',
    );
  }
  const current = currentResult.rows[0];
  const playState = String(current.play_state);
  if (playState !== 'pending' && playState !== 'ready') {
    throw new GoV2Error(
      409,
      'DEFER_MATCH_STATE_FORBIDDEN',
      `Only pending or ready matches can be deferred; ${playState} requires its dedicated workflow`,
      { matchId: request.matchId, playState, allowed: ['pending', 'ready'] },
    );
  }
  if (String(current.schedule_version_id) !== activeScope.scheduleVersionId) {
    throw new GoV2Error(
      409,
      'DEFER_ACTIVE_SESSION_MISMATCH',
      'The match assignment is not part of the shared session active version',
    );
  }

  const nowMs = Date.now();
  const nextQuantumMs = Math.ceil(nowMs / (5 * 60_000)) * 5 * 60_000;
  let effectiveNotBeforeMs: number;
  if (request.deferMode === 'not_before') {
    effectiveNotBeforeMs = Date.parse(request.notBefore as string);
    if (effectiveNotBeforeMs <= nextQuantumMs) {
      throw new GoV2Error(
        422,
        'DEFER_NOT_BEFORE_MUST_BE_FUTURE',
        'notBefore must be later than the next five-minute scheduling quantum',
      );
    }
  } else {
    const queueTail = await client.query(
      `SELECT max(assignment.planned_end) AS queue_tail
       FROM go_v2_schedule_assignments assignment
       JOIN go_v2_matches queued ON queued.id = assignment.match_id
       WHERE assignment.schedule_version_id = $1
         AND assignment.match_id <> $2
         AND queued.play_state IN ('pending', 'ready')
         AND queued.schedule_state NOT IN ('cancelled', 'skipped')`,
      [activeScope.scheduleVersionId, request.matchId],
    );
    effectiveNotBeforeMs = queueTail.rows[0]?.queue_tail
      ? Date.parse(String(queueTail.rows[0].queue_tail))
      : nextQuantumMs;
    effectiveNotBeforeMs = Math.max(nextQuantumMs, effectiveNotBeforeMs);
  }
  if (!Number.isFinite(effectiveNotBeforeMs) || effectiveNotBeforeMs >= Date.parse(activeScope.windowEnd)) {
    throw new GoV2Error(
      422,
      'DEFER_OUTSIDE_SESSION_WINDOW',
      'The deferred lower bound must remain inside the active schedule session window',
      { windowEnd: activeScope.windowEnd },
    );
  }
  const effectiveNotBefore = new Date(effectiveNotBeforeMs).toISOString();
  const requiresDirector = scheduleDeferRequiresDirector({
    assignmentLocked: current.is_locked === true || String(current.schedule_state) === 'locked',
    plannedStart: new Date(current.planned_start).toISOString(),
    freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
    nowMs,
  });
  const latestOverride = await client.query(
    `SELECT id::text, action
     FROM go_v2_schedule_defer_overrides
     WHERE match_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [request.matchId],
  );
  const canonicalPayload: Record<string, unknown> = {
    sessionTournamentIds: activeScope.sessionTournamentIds,
    sessionTournamentVersions: activeScope.sessionTournamentVersions,
    courts: activeScope.courts,
    sessionKey: activeScope.sessionKey,
    timezone: activeScope.timezone,
    startTime: localClock(activeScope.windowStart, activeScope.timezone),
    endTime: localClock(activeScope.windowEnd, activeScope.timezone),
    freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
    refereeMode: activeScope.refereeMode,
  };
  const automatic = await buildAutomaticSchedulePayload(client, tournamentId, canonicalPayload, {
    forcedDefer: { matchId: request.matchId, notBefore: effectiveNotBefore },
  });
  const solverResult = solveSchedule(automatic.solverInput);
  const independentValidation = validateSchedule(automatic.solverInput, solverResult.assignments);
  const currentByMatchId = new Map(automatic.solverInput.matches.flatMap((match) => (
    match.published ? [[match.id, match.published] as const] : []
  )));
  const changedAssignments = buildGoV2ScheduleAssignmentDiff(
    currentByMatchId,
    solverResult.assignments as unknown as Array<Record<string, unknown>>,
  );
  const conflicts = [
    ...solverResult.conflicts,
    ...independentValidation.conflicts,
  ];
  const candidate = {
    ...canonicalPayload,
    ...automatic,
    matchId: request.matchId,
    deferMode: request.deferMode,
    requestedNotBefore: request.notBefore,
    effectiveNotBefore,
    notBefore: effectiveNotBefore,
    scheduleSessionId: activeScope.scheduleSessionId,
    priorScheduleVersionId: activeScope.scheduleVersionId,
    priorScheduleHash: current.prior_schedule_hash ? String(current.prior_schedule_hash) : null,
    priorScheduleAssignmentId: String(current.assignment_id),
    priorCourtId: String(current.court_id),
    priorPlannedStart: new Date(current.planned_start).toISOString(),
    priorPlannedEnd: new Date(current.planned_end).toISOString(),
    playStateSnapshot: playState,
    requiresDirector,
    supersedesDeferOverrideId: latestOverride.rowCount ? String(latestOverride.rows[0].id) : null,
    solverResult,
    independentValidation,
    scheduleDiff: {
      kind: 'schedule_defer',
      matchId: request.matchId,
      deferMode: request.deferMode,
      requestedNotBefore: request.notBefore,
      effectiveNotBefore,
      changedAssignments,
      successorAssignments: solverResult.assignments,
    },
  };
  return {
    risk: requiresDirector ? 'amber' : 'green',
    candidate,
    impact: {
      matchId: request.matchId,
      playState,
      deferMode: request.deferMode,
      requestedNotBefore: request.notBefore,
      effectiveNotBefore,
      priorScheduleVersionId: activeScope.scheduleVersionId,
      scheduleHash: independentValidation.scheduleHash,
      changedAssignments,
      changedMatchCount: changedAssignments.length,
      requiresDirector,
      sportingStateChanged: false,
      solverStatus: solverResult.status,
      publishable: solverResult.publishable && independentValidation.publishable,
    },
    warnings: [
      ...(requiresDirector
        ? ['The selected assignment is locked or inside the freeze horizon; director confirmation is required.']
        : []),
      ...solverResult.warnings,
    ],
    conflicts,
  };
}

async function prepareGoV2ScheduleDeferRelease(
  client: PoolClient,
  tournamentId: string,
  payload: Record<string, unknown>,
): Promise<{
  risk: GoV2Risk;
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
  warnings: unknown[];
  conflicts: unknown[];
}> {
  const request = parseGoV2ScheduleDeferReleaseRequest(payload);
  const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
  const currentResult = await client.query(
    `SELECT match.play_state, match.schedule_state,
            assignment.id::text AS assignment_id,
            assignment.court_id::text AS court_id,
            assignment.planned_start, assignment.planned_end,
            assignment.is_locked,
            version.id::text AS schedule_version_id,
            version.schedule_hash AS prior_schedule_hash
     FROM go_v2_matches match
     JOIN go_v2_tournament_state state
       ON state.tournament_id = match.tournament_id
     JOIN go_v2_schedule_versions version
       ON version.id = state.active_schedule_version_id
      AND version.status = 'published'
     JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = version.id
      AND assignment.match_id = match.id
     WHERE match.id = $1 AND match.tournament_id = $2`,
    [request.matchId, tournamentId],
  );
  if (!currentResult.rowCount) {
    throw new GoV2Error(
      404,
      'DEFER_RELEASE_MATCH_NOT_IN_ACTIVE_SCHEDULE',
      'The match is not assigned in the active published schedule',
    );
  }
  const current = currentResult.rows[0];
  const playState = String(current.play_state);
  if (playState !== 'pending' && playState !== 'ready') {
    throw new GoV2Error(
      409,
      'DEFER_RELEASE_MATCH_STATE_FORBIDDEN',
      `Only pending or ready matches can release a generic defer; current state is ${playState}`,
      { matchId: request.matchId, playState, allowed: ['pending', 'ready'] },
    );
  }
  if (String(current.schedule_version_id) !== activeScope.scheduleVersionId) {
    throw new GoV2Error(
      409,
      'DEFER_RELEASE_ACTIVE_SESSION_MISMATCH',
      'The match assignment is not part of the shared session active version',
    );
  }
  const latestOverride = await client.query(
    `SELECT id::text, action, defer_mode, not_before,
            pause_resolution_id::text, source_preview_id::text,
            successor_schedule_version_id::text
     FROM go_v2_schedule_defer_overrides
     WHERE match_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [request.matchId],
  );
  if (!latestOverride.rowCount || String(latestOverride.rows[0].action) !== 'defer') {
    throw new GoV2Error(
      409,
      'ACTIVE_SCHEDULE_DEFER_REQUIRED',
      'The match has no active defer override to release',
      { matchId: request.matchId },
    );
  }
  const activeOverride = latestOverride.rows[0];
  if (activeOverride.pause_resolution_id) {
    throw new GoV2Error(
      409,
      'PAUSE_RESOLUTION_RELEASE_REQUIRED',
      'A defer created for a paused match must be released through pause-resolution resume or transfer',
      { matchId: request.matchId, pauseResolutionId: String(activeOverride.pause_resolution_id) },
    );
  }
  if (!activeOverride.source_preview_id || !activeOverride.successor_schedule_version_id) {
    throw new GoV2Error(
      409,
      'GENERIC_DEFER_LINEAGE_INVALID',
      'The active defer has no immutable generic preview/schedule lineage',
    );
  }
  const nowMs = Date.now();
  const requiresDirector = scheduleDeferRequiresDirector({
    assignmentLocked: current.is_locked === true || String(current.schedule_state) === 'locked',
    plannedStart: new Date(current.planned_start).toISOString(),
    freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
    nowMs,
  });
  const canonicalPayload: Record<string, unknown> = {
    sessionTournamentIds: activeScope.sessionTournamentIds,
    sessionTournamentVersions: activeScope.sessionTournamentVersions,
    courts: activeScope.courts,
    sessionKey: activeScope.sessionKey,
    timezone: activeScope.timezone,
    startTime: localClock(activeScope.windowStart, activeScope.timezone),
    endTime: localClock(activeScope.windowEnd, activeScope.timezone),
    freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
    refereeMode: activeScope.refereeMode,
  };
  const automatic = await buildAutomaticSchedulePayload(client, tournamentId, canonicalPayload, {
    releasedDefer: { matchId: request.matchId },
  });
  const solverResult = solveSchedule(automatic.solverInput);
  const independentValidation = validateSchedule(automatic.solverInput, solverResult.assignments);
  const currentByMatchId = new Map(automatic.solverInput.matches.flatMap((match) => (
    match.published ? [[match.id, match.published] as const] : []
  )));
  const changedAssignments = buildGoV2ScheduleAssignmentDiff(
    currentByMatchId,
    solverResult.assignments as unknown as Array<Record<string, unknown>>,
  );
  const activeDeferOverrideId = String(activeOverride.id);
  const candidate = {
    ...canonicalPayload,
    ...automatic,
    matchId: request.matchId,
    activeDeferOverrideId,
    releasedDeferMode: String(activeOverride.defer_mode),
    releasedNotBefore: activeOverride.not_before
      ? new Date(activeOverride.not_before).toISOString()
      : null,
    scheduleSessionId: activeScope.scheduleSessionId,
    priorScheduleVersionId: activeScope.scheduleVersionId,
    priorScheduleHash: current.prior_schedule_hash ? String(current.prior_schedule_hash) : null,
    priorScheduleAssignmentId: String(current.assignment_id),
    priorCourtId: String(current.court_id),
    priorPlannedStart: new Date(current.planned_start).toISOString(),
    priorPlannedEnd: new Date(current.planned_end).toISOString(),
    playStateSnapshot: playState,
    requiresDirector,
    solverResult,
    independentValidation,
    scheduleDiff: {
      kind: 'schedule_defer_release',
      matchId: request.matchId,
      activeDeferOverrideId,
      changedAssignments,
      successorAssignments: solverResult.assignments,
    },
  };
  return {
    risk: requiresDirector ? 'amber' : 'green',
    candidate,
    impact: {
      matchId: request.matchId,
      playState,
      activeDeferOverrideId,
      releasedDeferMode: String(activeOverride.defer_mode),
      releasedNotBefore: candidate.releasedNotBefore,
      priorScheduleVersionId: activeScope.scheduleVersionId,
      scheduleHash: independentValidation.scheduleHash,
      changedAssignments,
      changedMatchCount: changedAssignments.length,
      requiresDirector,
      sportingStateChanged: false,
      solverStatus: solverResult.status,
      publishable: solverResult.publishable && independentValidation.publishable,
    },
    warnings: [
      ...(requiresDirector
        ? ['The selected assignment is locked or inside the freeze horizon; director confirmation is required.']
        : []),
      ...solverResult.warnings,
    ],
    conflicts: [...solverResult.conflicts, ...independentValidation.conflicts],
  };
}

async function prepareGoV2PauseResolution(
  client: PoolClient,
  tournamentId: string,
  matchId: string,
  payload: Record<string, unknown>,
): Promise<{
  risk: GoV2Risk;
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
  warnings: string[];
  conflicts: Array<Record<string, unknown>>;
}> {
  const decision = String(payload.decision ?? '');
  if (!['defer', 'resume_same_court', 'transfer'].includes(decision)) {
    throw new GoV2Error(422, 'INVALID_PAUSE_RESOLUTION', 'decision must be defer, resume_same_court or transfer');
  }
  const current = await client.query(
    `SELECT match.id::text AS match_id, match.tournament_id::text,
            match.play_state, match.schedule_state,
            assignment.id::text AS assignment_id,
            assignment.court_id::text AS source_court_id,
            assignment.planned_start, assignment.planned_end,
            assignment.actual_start, assignment.actual_end,
            version.id::text AS schedule_version_id,
            version.session_id::text AS schedule_session_id,
            version.schedule_hash,
            session.session_key, session.label, session.timezone,
            session.window_start, session.window_end,
            session.freeze_horizon_minutes, session.referee_mode,
            COALESCE(live.command_version, 0) AS command_version
     FROM go_v2_matches match
     JOIN go_v2_tournament_state owner_state
       ON owner_state.tournament_id = match.tournament_id
     JOIN go_v2_schedule_versions version
       ON version.id = owner_state.active_schedule_version_id
      AND version.status = 'published'
     JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = version.id
      AND assignment.match_id = match.id
     JOIN go_v2_schedule_sessions session ON session.id = version.session_id
     LEFT JOIN go_v2_live_match_state live ON live.match_id = match.id
     WHERE match.id = $1 AND match.tournament_id = $2`,
    [matchId, tournamentId],
  );
  if (!current.rowCount) {
    throw new GoV2Error(404, 'PAUSED_MATCH_NOT_IN_ACTIVE_SCHEDULE', 'Match is not in the active published schedule');
  }
  const row = current.rows[0];
  if (String(row.play_state) !== 'paused') {
    throw new GoV2Error(409, 'MATCH_NOT_PAUSED', 'Only a paused match can use the pause resolution workflow');
  }
  const scheduleSessionId = String(row.schedule_session_id);
  const unresolvedDisruptionPause = await client.query(
    `SELECT disruption.id::text
     FROM go_v2_disruption_matches affected
     JOIN go_v2_schedule_disruptions disruption ON disruption.id = affected.disruption_id
     WHERE affected.match_id = $1
       AND affected.action = 'review_incomplete'
       AND disruption.schedule_session_id = $2
       AND NOT EXISTS (
         SELECT 1
         FROM go_v2_match_pause_resolutions resolution
         WHERE resolution.match_id = affected.match_id
           AND resolution.disruption_id = affected.disruption_id
       )
     ORDER BY disruption.created_at DESC, disruption.id DESC
     LIMIT 1`,
    [matchId, scheduleSessionId],
  );
  const requiredDisruptionId = unresolvedDisruptionPause.rowCount
    ? String(unresolvedDisruptionPause.rows[0].id)
    : null;
  const disruptionId = payload.disruptionId
    ? assertGoV2Uuid(payload.disruptionId, 'disruptionId')
    : null;
  if (requiredDisruptionId && !disruptionId) {
    throw new GoV2Error(
      422,
      'PAUSE_DISRUPTION_REQUIRED',
      'A disruption-paused match resolution must reference the disruption that caused the pause',
      { requiredDisruptionId },
    );
  }
  if (requiredDisruptionId && disruptionId !== requiredDisruptionId) {
    throw new GoV2Error(
      409,
      'PAUSE_DISRUPTION_MISMATCH',
      'A newer disruption pause still requires its own director decision',
      { requiredDisruptionId, suppliedDisruptionId: disruptionId },
    );
  }
  if (decision === 'transfer' && !disruptionId) {
    throw new GoV2Error(422, 'TRANSFER_DISRUPTION_REQUIRED', 'A live transfer must reference the disruption that paused the match');
  }
  let disruption: Record<string, unknown> | null = null;
  if (disruptionId) {
    const disruptionResult = await client.query(
      `SELECT disruption.id::text, disruption.status,
              disruption.disruption_kind, disruption.scope_kind,
              disruption.court_id::text, disruption.match_id::text
       FROM go_v2_schedule_disruptions disruption
       WHERE disruption.id = $1
         AND disruption.schedule_session_id = $2
         AND (
           EXISTS (
             SELECT 1 FROM go_v2_disruption_matches affected
             WHERE affected.disruption_id = disruption.id AND affected.match_id = $3
           )
           OR disruption.scope_kind = 'session'
           OR (disruption.scope_kind = 'court' AND disruption.court_id = $4)
           OR (disruption.scope_kind = 'match' AND disruption.match_id = $3)
         )`,
      [disruptionId, scheduleSessionId, matchId, row.source_court_id],
    );
    if (!disruptionResult.rowCount) {
      throw new GoV2Error(404, 'DISRUPTION_MATCH_MISMATCH', 'Disruption is not applicable to this paused match');
    }
    disruption = disruptionResult.rows[0];
  }
  const members = await client.query(
    `SELECT member.tournament_id::text, state.aggregate_version
     FROM go_v2_schedule_session_tournaments member
     JOIN go_v2_tournament_state state ON state.tournament_id = member.tournament_id
     WHERE member.session_id = $1
     ORDER BY member.tournament_id`,
    [scheduleSessionId],
  );
  const sessionTournamentIds = members.rows.map((member) => String(member.tournament_id));
  const sessionTournamentVersions = Object.fromEntries(members.rows.map((member) => [
    String(member.tournament_id),
    Number(member.aggregate_version),
  ]));
  const courtsResult = await client.query(
    `SELECT court.id::text, court.court_no, court.label,
            membership.available_windows
     FROM go_v2_schedule_session_courts membership
     JOIN go_v2_courts court ON court.id = membership.court_id
     WHERE membership.session_id = $1 AND court.is_active = true
     ORDER BY court.court_no`,
    [scheduleSessionId],
  );
  const courtIds = courtsResult.rows.map((court) => String(court.id));
  const sourceCourtId = String(row.source_court_id);
  const targetCourtId = decision === 'transfer'
    ? assertGoV2Uuid(payload.targetCourtId, 'targetCourtId')
    : null;
  if (targetCourtId && (!courtIds.includes(targetCourtId) || targetCourtId === sourceCourtId)) {
    throw new GoV2Error(
      422,
      'INVALID_TRANSFER_COURT',
      'targetCourtId must be a different active court in the same schedule session',
    );
  }
  const resolutionCourtId = targetCourtId ?? sourceCourtId;
  if (decision !== 'defer') {
    const holds = await client.query(
      `SELECT id::text, disruption_kind, scope_kind,
              court_id::text, match_id::text, expected_end_at
       FROM go_v2_schedule_disruptions
       WHERE schedule_session_id = $1
         AND status = 'active'
         AND starts_at <= now() + interval '2 minutes'
         AND disruption_kind IN (
           'rain_hold', 'lightning_hold', 'court_damage', 'medical_delay',
           'security_pause', 'court_close', 'global_pause'
         )
         AND (
           scope_kind = 'session'
           OR (scope_kind = 'court' AND court_id = $2)
           OR (scope_kind = 'match' AND match_id = $3)
         )
       ORDER BY starts_at, id`,
      [scheduleSessionId, resolutionCourtId, matchId],
    );
    if (holds.rowCount) {
      throw new GoV2Error(
        409,
        'PAUSE_RESOLUTION_BLOCKED_BY_ACTIVE_HOLD',
        'Resolve the applicable active hold before resuming or transferring this match',
        {
          blockingHolds: holds.rows.map((hold) => ({
            id: String(hold.id),
            disruptionKind: String(hold.disruption_kind),
            scopeKind: String(hold.scope_kind),
            courtId: hold.court_id ? String(hold.court_id) : null,
            matchId: hold.match_id ? String(hold.match_id) : null,
            advisoryExpectedEndAt: hold.expected_end_at
              ? new Date(hold.expected_end_at).toISOString()
              : null,
          })),
        },
      );
    }
  }
  const nowQuantum = Math.ceil(Date.now() / (5 * 60_000)) * 5 * 60_000;
  let deferMode: 'not_before' | 'end_of_queue' | null = null;
  let requestedResume: number;
  if (decision === 'defer') {
    const requestedDeferMode = String(payload.deferMode ?? (payload.notBefore ? 'not_before' : ''));
    if (!['not_before', 'end_of_queue'].includes(requestedDeferMode)) {
      throw new GoV2Error(
        422,
        'DEFER_MODE_REQUIRED',
        'A deferred match requires deferMode=not_before or deferMode=end_of_queue',
      );
    }
    deferMode = requestedDeferMode as Exclude<typeof deferMode, null>;
    if (deferMode === 'not_before') {
      requestedResume = Date.parse(String(payload.notBefore ?? payload.resumeNotBefore ?? ''));
      if (!Number.isFinite(requestedResume) || requestedResume <= nowQuantum) {
        throw new GoV2Error(
          422,
          'DEFER_NOT_BEFORE_REQUIRED',
          'notBefore must be a future timestamp for deferMode=not_before',
        );
      }
    } else {
      const queueTail = await client.query(
        `SELECT max(assignment.planned_end) AS queue_tail
         FROM go_v2_schedule_assignments assignment
         JOIN go_v2_matches queued ON queued.id = assignment.match_id
         WHERE assignment.schedule_version_id = $1
           AND assignment.match_id <> $2
           AND queued.play_state IN ('pending', 'ready')
           AND queued.schedule_state NOT IN ('cancelled', 'skipped')`,
        [row.schedule_version_id, matchId],
      );
      requestedResume = queueTail.rows[0]?.queue_tail
        ? Date.parse(String(queueTail.rows[0].queue_tail))
        : nowQuantum;
    }
  } else {
    requestedResume = payload.resumeNotBefore
      ? Date.parse(String(payload.resumeNotBefore))
      : nowQuantum;
  }
  if (!Number.isFinite(requestedResume)) {
    throw new GoV2Error(422, 'INVALID_RESUME_NOT_BEFORE', 'resumeNotBefore must be a valid timestamp');
  }
  const resumeNotBefore = new Date(Math.max(nowQuantum, requestedResume)).toISOString();
  if (Date.parse(resumeNotBefore) >= Date.parse(row.window_end)) {
    throw new GoV2Error(422, 'TRANSFER_OUTSIDE_SESSION', 'resumeNotBefore must be before the schedule session closes');
  }
  const baseCandidate: Record<string, unknown> = {
    ...payload,
    matchId,
    disruptionId,
    disruptionStatus: disruption ? String(disruption.status) : null,
    decision,
    scheduleSessionId,
    sessionTournamentIds,
    sessionTournamentVersions,
    sourceCourtId,
    targetCourtId,
    priorScheduleVersionId: String(row.schedule_version_id),
    priorScheduleHash: row.schedule_hash ? String(row.schedule_hash) : null,
    priorScheduleAssignmentId: String(row.assignment_id),
    priorCommandVersion: Number(row.command_version),
    resumeNotBefore,
    deferMode,
    notBefore: decision === 'defer' ? resumeNotBefore : null,
    judgeResumeRequired: decision !== 'defer',
    automaticResume: false,
  };
  if (decision !== 'transfer') {
    return {
      risk: decision === 'defer' ? 'green' : 'amber',
      candidate: baseCandidate,
      impact: {
        scheduleVersionChanged: false,
        judgeCommandVersionChanged: false,
        judgeResumeRequired: decision === 'resume_same_court',
        requiresScheduleReplan: decision === 'defer',
      },
      warnings: decision === 'resume_same_court'
        ? ['The match remains paused until a judge explicitly resumes it.']
        : ['The match remains paused; record another resolution when a decision is made.'],
      conflicts: [],
    };
  }
  const schedulePayload: Record<string, unknown> = {
    sessionKey: String(row.session_key),
    sessionLabel: String(row.label),
    sessionTournamentIds,
    sessionTournamentVersions,
    timezone: String(row.timezone),
    startTime: localClock(new Date(row.window_start).toISOString(), String(row.timezone)),
    endTime: localClock(new Date(row.window_end).toISOString(), String(row.timezone)),
    freezeHorizonMinutes: Number(row.freeze_horizon_minutes),
    refereeMode: String(row.referee_mode),
    courts: courtsResult.rows.map((court) => ({
      id: String(court.id),
      courtNo: Number(court.court_no),
      label: String(court.label),
      availability: Array.isArray(court.available_windows) ? court.available_windows : [],
    })),
  };
  const automatic = await buildAutomaticSchedulePayload(client, tournamentId, schedulePayload, {
    forcedTransfer: { matchId, targetCourtId: targetCourtId as string, resumeNotBefore },
  });
  const solverResult = solveSchedule(automatic.solverInput);
  const independentValidation = validateSchedule(automatic.solverInput, solverResult.assignments);
  if (!solverResult.publishable || !independentValidation.publishable || !independentValidation.scheduleHash) {
    throw new GoV2Error(
      409,
      'PAUSE_TRANSFER_SCHEDULE_INFEASIBLE',
      'The paused match cannot be transferred without violating the shared schedule constraints',
      { conflicts: [...solverResult.conflicts, ...independentValidation.conflicts] },
    );
  }
  return {
    risk: 'amber',
    candidate: {
      ...baseCandidate,
      ...schedulePayload,
      ...automatic,
      solverResult,
      independentValidation,
      scheduleDiff: {
        kind: 'paused_match_transfer',
        matchId,
        fromCourtId: sourceCourtId,
        toCourtId: targetCourtId,
        resumeNotBefore,
      },
    },
    impact: {
      scheduleVersionChanged: true,
      priorScheduleVersionId: String(row.schedule_version_id),
      successorScheduleHash: independentValidation.scheduleHash,
      sourceCourtId,
      targetCourtId,
      resumeNotBefore,
      judgeCommandVersionChanged: true,
      judgeResumeRequired: true,
    },
    warnings: ['Publishing the transfer invalidates stale offline judge commands; the target-court judge must resume explicitly.'],
    conflicts: [],
  };
}

export async function previewGoV2Operation(
  tournamentIdRaw: string,
  operation: Extract<GoV2OperationKind, `${string}.preview`>,
  body: unknown,
  actor: GoV2Actor,
): Promise<GoV2PreviewResponse> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const command = parseGoV2CommandEnvelope(body);
  assertGoV2OperationAuthority(operation, actor);
  const hash = requestHash(operation, command);
  assertDeclaredRequestHash(command, hash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.idempotencyKey);
    if (receipt) {
      assertReceiptMatches(receipt, operation, hash);
      return replayedResponse(receipt.responsePayload) as unknown as GoV2PreviewResponse;
    }
    assertOperationLifecycle(operation, state.lifecycleState);
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    const requestedRisk = riskFromPayload(command.payload);
    const result = await buildPreviewResult(
      client,
      tournamentId,
      operation,
      command.payload,
      requestedRisk,
      command.reasonCode,
    );
    const inputHash = hashObject({
      operation,
      aggregateVersion: state.aggregateVersion,
      payload: command.payload,
      canonicalCandidate: result.candidate,
    });
    const risk = normalizeGoV2Risk(result.risk ?? requestedRisk);
    const preview = await createOperationPreview(client, {
      tournamentId,
      operationKind: operation,
      aggregateVersion: state.aggregateVersion,
      inputHash,
      risk,
      payload: command.payload,
      result,
      actorId: actor.id,
    });
    const response: GoV2PreviewResponse = {
      previewId: preview.id,
      operation,
      aggregateVersion: state.aggregateVersion,
      inputHash,
      risk,
      expiresAt: preview.expiresAt,
      replayed: false,
      commandId: command.commandId,
      requestHash: hash,
      deviceId: command.deviceId,
      result,
    };
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.idempotencyKey,
      operationKind: operation,
      expectedVersion: command.expectedVersion,
      resultingVersion: state.aggregateVersion,
      requestHash: hash,
      responsePayload: response as unknown as Record<string, unknown>,
      actorId: actor.id,
      deviceId: command.deviceId,
      actorRole: actor.role,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}

async function applyDomainOperation(
  client: PoolClient,
  input: {
    tournamentId: string;
    operation: GoV2OperationKind;
    command: GoV2CommandEnvelope;
    actor: GoV2Actor;
    inputHash: string;
    aggregateVersion: number;
    effectivePayload: Record<string, unknown>;
    entityId?: string;
    previewId?: string;
    risk: GoV2Risk;
  },
): Promise<Record<string, unknown>> {
  switch (input.operation) {
    case 'registration.lock':
      return persistRegistrationLock(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        inputHash: input.inputHash,
        payload: input.effectivePayload,
      });
    case 'stages.materialize':
      {
        const lockedStagePayload = await projectLockedStageGraphPayload(
          client,
          input.tournamentId,
          input.effectivePayload,
        );
      return persistStageGraph(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: lockedStagePayload,
      });
      }
    case 'draw.commit':
      return persistDraw(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: input.effectivePayload,
      });
    case 'draw.unlock.commit':
      return persistDrawUnlock(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        inputHash: input.inputHash,
        payload: input.effectivePayload,
      });
    case 'bracket.lock':
      if (Array.isArray(input.effectivePayload.tierBrackets)) {
        return persistCompetitionTierBrackets(client, {
          tournamentId: input.tournamentId,
          actorId: input.actor.id,
          aggregateVersion: input.aggregateVersion,
          payload: input.effectivePayload,
        });
      }
      if (String(asRecord(input.effectivePayload.topology).kind ?? '') === 'classification_rounds') {
        return persistClassificationStage(client, {
          tournamentId: input.tournamentId,
          actorId: input.actor.id,
          payload: input.effectivePayload,
        });
      }
      return persistBracket(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        payload: input.effectivePayload,
      });
    case 'schedule.generate.commit':
    case 'schedule.replan.commit':
      return persistScheduleVersion(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: {
          ...input.effectivePayload,
          publicationKind: input.operation === 'schedule.generate.commit' ? 'initial' : 'replan',
          sourcePreviewId: input.previewId ?? null,
        },
      });
    case 'schedule.policy.commit': {
      if (!input.previewId) {
        throw new GoV2Error(400, 'PREVIEW_ID_REQUIRED', 'schedule.policy.commit requires previewId');
      }
      const policyPayload = asRecord(input.effectivePayload.courtPolicyException);
      const policyException = parseGoV2CourtPolicyExceptionRequest(policyPayload);
      const persistedSchedule = await persistScheduleVersion(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: {
          ...input.effectivePayload,
          publicationKind: 'court_policy_exception',
          sourcePreviewId: input.previewId,
        },
      });
      const scheduleSessionId = String(persistedSchedule.sessionId ?? '');
      const successorScheduleVersionId = String(persistedSchedule.scheduleVersionId ?? '');
      if (
        !scheduleSessionId
        || !successorScheduleVersionId
        || scheduleSessionId !== String(policyPayload.scheduleSessionId ?? '')
      ) {
        throw new GoV2Error(
          409,
          'COURT_POLICY_SCHEDULE_LINEAGE_MISMATCH',
          'The successor schedule does not belong to the immutable policy preview session',
        );
      }
      const revision = await persistGoV2CourtPolicyExceptionRevision(client, {
        tournamentId: input.tournamentId,
        scheduleSessionId,
        stageId: policyException.stageId,
        tier: policyException.tier,
        allowedCourtIds: policyException.allowedCourtIds,
        effectiveFrom: policyException.effectiveFrom,
        effectiveUntil: policyException.effectiveUntil,
        sourcePreviewId: input.previewId,
        successorScheduleVersionId,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        actorId: input.actor.id,
      });
      return {
        ...persistedSchedule,
        scheduleHash: String(asRecord(input.effectivePayload.solverResult).scheduleHash ?? ''),
        courtPolicyExceptionRevision: revision,
      };
    }
    case 'schedule.defer.commit': {
      if (!input.previewId) {
        throw new GoV2Error(400, 'PREVIEW_ID_REQUIRED', 'schedule.defer.commit requires previewId');
      }
      const matchId = assertGoV2Uuid(input.effectivePayload.matchId, 'matchId');
      const priorScheduleVersionId = assertGoV2Uuid(
        input.effectivePayload.priorScheduleVersionId,
        'priorScheduleVersionId',
      );
      const effectiveNotBefore = String(input.effectivePayload.effectiveNotBefore ?? '');
      if (!Number.isFinite(Date.parse(effectiveNotBefore))) {
        throw new GoV2Error(409, 'SCHEDULE_DEFER_PREVIEW_STALE', 'Preview has no valid effectiveNotBefore');
      }
      const latestOverride = await client.query(
        `SELECT id::text
         FROM go_v2_schedule_defer_overrides
         WHERE match_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR SHARE`,
        [matchId],
      );
      const latestOverrideId = latestOverride.rowCount ? String(latestOverride.rows[0].id) : null;
      const previewSupersedesId = input.effectivePayload.supersedesDeferOverrideId
        ? String(input.effectivePayload.supersedesDeferOverrideId)
        : null;
      if (latestOverrideId !== previewSupersedesId) {
        throw new GoV2Error(
          409,
          'SCHEDULE_DEFER_PREVIEW_STALE',
          'The current defer instruction changed after preview',
        );
      }
      const persistedSchedule = await persistScheduleVersion(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: {
          ...input.effectivePayload,
          publicationKind: 'schedule_defer',
          sourcePreviewId: input.previewId,
        },
      });
      const scheduleSessionId = assertGoV2Uuid(persistedSchedule.sessionId, 'scheduleSessionId');
      const successorScheduleVersionId = assertGoV2Uuid(
        persistedSchedule.scheduleVersionId,
        'successorScheduleVersionId',
      );
      if (
        scheduleSessionId !== String(input.effectivePayload.scheduleSessionId ?? '')
        || priorScheduleVersionId === successorScheduleVersionId
      ) {
        throw new GoV2Error(
          409,
          'SCHEDULE_DEFER_LINEAGE_MISMATCH',
          'The successor schedule does not follow the immutable defer preview lineage',
        );
      }
      const inserted = await client.query(
        `INSERT INTO go_v2_schedule_defer_overrides (
           tournament_id, schedule_session_id, match_id, action, defer_mode,
           not_before, pause_resolution_id, source_preview_id,
           prior_schedule_version_id, successor_schedule_version_id,
           supersedes_id, reason_code, reason_note, actor_id, command_id
         ) VALUES (
           $1, $2, $3, 'defer', $4, $5, NULL, $6, $7, $8,
           $9, $10, $11, $12, $13
         )
         RETURNING id::text, created_at`,
        [
          input.tournamentId,
          scheduleSessionId,
          matchId,
          String(input.effectivePayload.deferMode),
          effectiveNotBefore,
          input.previewId,
          priorScheduleVersionId,
          successorScheduleVersionId,
          latestOverrideId,
          input.command.reasonCode,
          input.command.reasonNote ?? null,
          input.actor.id,
          input.command.commandId,
        ],
      );
      const deferOverrideId = String(inserted.rows[0].id);
      return {
        ...persistedSchedule,
        scheduleHash: String(asRecord(input.effectivePayload.solverResult).scheduleHash ?? ''),
        deferOverride: {
          id: deferOverrideId,
          matchId,
          deferMode: String(input.effectivePayload.deferMode),
          requestedNotBefore: input.effectivePayload.requestedNotBefore ?? null,
          effectiveNotBefore,
          priorScheduleVersionId,
          successorScheduleVersionId,
          supersedesId: latestOverrideId,
          createdAt: new Date(inserted.rows[0].created_at).toISOString(),
        },
        sportingStateChanged: false,
        compensatingAction: {
          available: true,
          action: 'release',
          supersedesId: deferOverrideId,
          requiresSuccessorSchedule: true,
          previewPath: '/schedule/defer/release/preview',
          commitPath: '/schedule/defer/release/commit',
        },
      };
    }
    case 'schedule.defer.release.commit': {
      if (!input.previewId) {
        throw new GoV2Error(400, 'PREVIEW_ID_REQUIRED', 'schedule.defer.release.commit requires previewId');
      }
      const matchId = assertGoV2Uuid(input.effectivePayload.matchId, 'matchId');
      const priorScheduleVersionId = assertGoV2Uuid(
        input.effectivePayload.priorScheduleVersionId,
        'priorScheduleVersionId',
      );
      const activeDeferOverrideId = assertGoV2Uuid(
        input.effectivePayload.activeDeferOverrideId,
        'activeDeferOverrideId',
      );
      const latestOverride = await client.query(
        `SELECT id::text, action, pause_resolution_id::text
         FROM go_v2_schedule_defer_overrides
         WHERE match_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR SHARE`,
        [matchId],
      );
      if (
        !latestOverride.rowCount
        || String(latestOverride.rows[0].id) !== activeDeferOverrideId
        || String(latestOverride.rows[0].action) !== 'defer'
        || latestOverride.rows[0].pause_resolution_id
      ) {
        throw new GoV2Error(
          409,
          'SCHEDULE_DEFER_RELEASE_PREVIEW_STALE',
          'The active generic defer changed after release preview',
        );
      }
      const persistedSchedule = await persistScheduleVersion(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: {
          ...input.effectivePayload,
          publicationKind: 'schedule_defer',
          sourcePreviewId: input.previewId,
        },
      });
      const scheduleSessionId = assertGoV2Uuid(persistedSchedule.sessionId, 'scheduleSessionId');
      const successorScheduleVersionId = assertGoV2Uuid(
        persistedSchedule.scheduleVersionId,
        'successorScheduleVersionId',
      );
      if (
        scheduleSessionId !== String(input.effectivePayload.scheduleSessionId ?? '')
        || priorScheduleVersionId === successorScheduleVersionId
      ) {
        throw new GoV2Error(
          409,
          'SCHEDULE_DEFER_RELEASE_LINEAGE_MISMATCH',
          'The release successor schedule does not follow the immutable preview lineage',
        );
      }
      const inserted = await client.query(
        `INSERT INTO go_v2_schedule_defer_overrides (
           tournament_id, schedule_session_id, match_id, action, defer_mode,
           not_before, pause_resolution_id, source_preview_id,
           prior_schedule_version_id, successor_schedule_version_id,
           supersedes_id, reason_code, reason_note, actor_id, command_id
         ) VALUES (
           $1, $2, $3, 'release', NULL, NULL, NULL, $4, $5, $6,
           $7, $8, $9, $10, $11
         )
         RETURNING id::text, created_at`,
        [
          input.tournamentId,
          scheduleSessionId,
          matchId,
          input.previewId,
          priorScheduleVersionId,
          successorScheduleVersionId,
          activeDeferOverrideId,
          input.command.reasonCode,
          input.command.reasonNote ?? null,
          input.actor.id,
          input.command.commandId,
        ],
      );
      return {
        ...persistedSchedule,
        scheduleHash: String(asRecord(input.effectivePayload.solverResult).scheduleHash ?? ''),
        deferReleaseOverride: {
          id: String(inserted.rows[0].id),
          matchId,
          action: 'release',
          releasedDeferOverrideId: activeDeferOverrideId,
          priorScheduleVersionId,
          successorScheduleVersionId,
          createdAt: new Date(inserted.rows[0].created_at).toISOString(),
        },
        sportingStateChanged: false,
      };
    }
    case 'stage.rules.commit': {
      if (!input.previewId || !input.entityId) {
        throw new GoV2Error(400, 'PREVIEW_ID_REQUIRED', 'stage.rules.commit requires stageId and previewId');
      }
      const change = asRecord(input.effectivePayload.stageRuleChange);
      const stageId = assertGoV2Uuid(change.stageId, 'stageId');
      const priorScheduleVersionId = assertGoV2Uuid(
        change.activeScheduleVersionId,
        'activeScheduleVersionId',
      );
      const persistedSchedule = await persistScheduleVersion(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: {
          ...input.effectivePayload,
          publicationKind: 'stage_rule_change',
          sourcePreviewId: input.previewId,
        },
      });
      const successorScheduleVersionId = assertGoV2Uuid(
        persistedSchedule.scheduleVersionId,
        'successorScheduleVersionId',
      );
      if (successorScheduleVersionId === priorScheduleVersionId) {
        throw new GoV2Error(
          409,
          'STAGE_RULE_SCHEDULE_LINEAGE_MISMATCH',
          'The rule change must publish a distinct successor schedule version',
        );
      }
      const revision = await persistGoV2StageRuleChange(client, {
        tournamentId: input.tournamentId,
        stageId,
        effectiveFromRoundNo: parseGoV2EffectiveFromRoundNo(change.effectiveFromRoundNo),
        matchRule: resolveGoV2MatchRule(change.matchRule, 'stageRuleChange.matchRule'),
        affectedMatchIds: Array.isArray(change.affectedMatchIds)
          ? change.affectedMatchIds.map(String)
          : [],
        sourcePreviewId: input.previewId,
        successorScheduleVersionId,
        redApprovalId: input.risk === 'red' ? input.command.redApprovalId ?? null : null,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        actorId: input.actor.id,
      });
      return {
        ...persistedSchedule,
        scheduleHash: String(asRecord(input.effectivePayload.solverResult).scheduleHash ?? ''),
        stageRuleRevision: revision,
      };
    }
    case 'match.finish.accept':
    case 'match.finish.reject': {
      if (!input.entityId) throw new GoV2Error(400, 'MATCH_ID_REQUIRED', 'matchId is required');
      return persistGoV2FinishReviewDecision(client, {
        tournamentId: input.tournamentId,
        matchId: input.entityId,
        decision: input.operation === 'match.finish.accept' ? 'accept' : 'reject',
        finishRequestVersion: input.effectivePayload.finishRequestVersion,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
      });
    }
    case 'match.paper_import.commit':
    case 'match.result.revise': {
      if (!input.entityId) throw new GoV2Error(400, 'MATCH_ID_REQUIRED', 'matchId is required');
      const resultImpact = asRecord(input.effectivePayload.impact);
      const impactedMatchIds = Array.isArray(resultImpact.affectedMatches)
        ? resultImpact.affectedMatches.map((rawMatch) => String(asRecord(rawMatch).matchId ?? '')).filter(Boolean)
        : [];
      const correctionSnapshots = await loadMutationMatchSnapshots(
        client,
        input.tournamentId,
        [input.entityId, ...impactedMatchIds],
      );
      const correctionSnapshotById = new Map(correctionSnapshots.map((snapshot) => [snapshot.matchId, snapshot]));
      const triggerSnapshot = correctionSnapshotById.get(input.entityId);
      if (!triggerSnapshot) throw new GoV2Error(404, 'MATCH_NOT_FOUND', 'Match not found');
      const revision = await appendResultRevision(client, {
        tournamentId: input.tournamentId,
        matchId: input.entityId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        resultSource: 'paper_import',
        payload: input.effectivePayload,
      });
      const assignmentTiming = await client.query(
        `UPDATE go_v2_schedule_assignments assignment
         SET actual_start = $3::timestamptz,
             actual_end = $4::timestamptz,
             predicted_start = COALESCE(predicted_start, $3::timestamptz),
             predicted_end = COALESCE(predicted_end, $4::timestamptz)
         FROM go_v2_tournament_state state
         WHERE state.tournament_id = $1
           AND assignment.schedule_version_id = state.active_schedule_version_id
           AND assignment.match_id = $2
          RETURNING assignment.id::text, assignment.schedule_version_id::text,
                    assignment.court_id::text`,
        [
          input.tournamentId,
          input.entityId,
          input.effectivePayload.actualStartedAt,
          input.effectivePayload.actualEndedAt,
        ],
      );
      if (assignmentTiming.rowCount !== 1) {
        throw new GoV2Error(
          409,
          'PAPER_IMPORT_ASSIGNMENT_MISSING',
          'The match is not assigned in the active published schedule',
        );
      }
      const closedSegment = await client.query(
        `UPDATE go_v2_match_court_segments
         SET started_at = COALESCE(started_at, $2::timestamptz),
             ended_at = COALESCE(ended_at, $3::timestamptz),
             closing_score = COALESCE(closing_score, $4::jsonb)
         WHERE match_id = $1 AND ended_at IS NULL
         RETURNING id::text`,
        [
          input.entityId,
          input.effectivePayload.actualStartedAt,
          input.effectivePayload.actualEndedAt,
          JSON.stringify(asRecord(input.effectivePayload.actualScore)),
        ],
      );
      if (!closedSegment.rowCount) {
        await client.query(
          `INSERT INTO go_v2_match_court_segments (
             tournament_id, schedule_session_id, match_id, segment_no,
             schedule_version_id, schedule_assignment_id, court_id,
             started_at, ended_at, opening_score, closing_score,
             lineup_snapshot, created_by
           )
           SELECT $1, version.session_id, $2,
                  COALESCE((SELECT max(segment_no) + 1 FROM go_v2_match_court_segments WHERE match_id = $2), 1),
                  assignment.schedule_version_id, assignment.id, assignment.court_id,
                  $3::timestamptz, $4::timestamptz, '{}'::jsonb, $5::jsonb,
                  COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                      'side', lineup.side,
                      'entryId', lineup.entry_id,
                      'rosterRevisionId', lineup.roster_revision_id
                    ) ORDER BY lineup.side)
                    FROM go_v2_match_lineup_snapshots lineup
                    WHERE lineup.match_id = $2 AND lineup.result_revision_no = $6
                  ), '[]'::jsonb), $7
           FROM go_v2_schedule_assignments assignment
           JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
           WHERE assignment.id = $8`,
          [
            input.tournamentId,
            input.entityId,
            input.effectivePayload.actualStartedAt,
            input.effectivePayload.actualEndedAt,
            JSON.stringify(asRecord(input.effectivePayload.actualScore)),
            revision.revisionNo,
            input.actor.id,
            assignmentTiming.rows[0].id,
          ],
        );
      }
      // Invalidate any queued offline judge command after the director imports
      // the authoritative paper result. The journal remains append-only.
      await client.query(
        `UPDATE go_v2_live_match_state
         SET command_version = command_version + 1,
             finish_requested = false,
             active_device_id = NULL,
             updated_at = now()
         WHERE match_id = $1`,
        [input.entityId],
      );
      const winnerEntryId = String(input.effectivePayload.winnerEntryId ?? '');
      const loserEntryId = String(input.effectivePayload.loserEntryId ?? '');
      const reboundMatchIds = winnerEntryId && loserEntryId
        ? await resolveDownstreamSlots(client, input.entityId, winnerEntryId, loserEntryId, {
            actorId: input.actor.id,
            reasonCode: input.command.reasonCode,
            reasonNote: input.command.reasonNote,
          })
        : [];
      let mutationBatchId: string | null = null;
      if (revision.previousResultRevisionId) {
        const impact = asRecord(input.effectivePayload.impact);
        mutationBatchId = await appendCascadeBatch(client, {
          tournamentId: input.tournamentId,
          actorId: input.actor.id,
          reasonCode: input.command.reasonCode,
          reasonNote: input.command.reasonNote,
          expectedVersion: input.command.expectedVersion,
          committedVersion: input.aggregateVersion,
          mutationKind: 'result_correction',
          risk: input.risk,
          triggerMatchId: input.entityId,
          payload: { impact, reboundMatchIds },
        });
        await appendCascadeMatchRows(client, mutationBatchId, [
          {
            matchId: input.entityId,
            priorResultRevisionId: triggerSnapshot.resultRevisionId,
            newResultRevisionId: revision.resultRevisionId,
            priorScheduleAssignmentId: triggerSnapshot.scheduleAssignmentId,
            newScheduleAssignmentId: triggerSnapshot.scheduleAssignmentId,
            action: 'reroute',
            risk: input.risk,
            diff: {
              winnerEntryId,
              loserEntryId,
              reboundMatchIds,
              priorPlayState: triggerSnapshot.playState,
              newPlayState: 'final',
              priorScheduleState: triggerSnapshot.scheduleState,
              newScheduleState: triggerSnapshot.scheduleState,
              priorWinnerEntryId: triggerSnapshot.winnerEntryId,
              priorLoserEntryId: triggerSnapshot.loserEntryId,
              priorSlots: triggerSnapshot.slots,
            },
          },
          ...reboundMatchIds.map((matchId) => {
            const snapshot = correctionSnapshotById.get(matchId);
            return {
              matchId,
              priorResultRevisionId: snapshot?.resultRevisionId ?? null,
              newResultRevisionId: snapshot?.resultRevisionId ?? null,
              priorScheduleAssignmentId: snapshot?.scheduleAssignmentId ?? null,
              newScheduleAssignmentId: snapshot?.scheduleAssignmentId ?? null,
              action: 'reroute' as const,
              risk: input.risk,
              diff: {
                sourceMatchId: input.entityId,
                priorPlayState: snapshot?.playState ?? 'pending',
                newPlayState: snapshot?.playState ?? 'pending',
                priorScheduleState: snapshot?.scheduleState ?? 'unscheduled',
                newScheduleState: snapshot?.scheduleState ?? 'unscheduled',
                priorSlots: snapshot?.slots ?? [],
              },
            };
          }),
        ]);
      }
      return { ...revision, reboundMatchIds, mutationBatchId };
    }
    case 'roster.replacement.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'ENTRY_ID_REQUIRED', 'entryId is required');
      return persistRosterReplacement(client, {
        tournamentId: input.tournamentId,
        entryId: input.entityId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        inputHash: input.inputHash,
        payload: input.effectivePayload,
      });
    }
    case 'reserve.promotion.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'RESERVE_ENTRY_ID_REQUIRED', 'reserveEntryId is required');
      if (!input.previewId) throw new GoV2Error(400, 'PREVIEW_ID_REQUIRED', 'reserve.promotion.commit requires previewId');
      let persistedSchedule: Record<string, unknown> | null = null;
      if (input.effectivePayload.requiresSuccessorSchedule === true) {
        persistedSchedule = await persistScheduleVersion(client, {
          tournamentId: input.tournamentId,
          actorId: input.actor.id,
          inputHash: input.inputHash,
          payload: {
            ...input.effectivePayload,
            publicationKind: 'reserve_promotion',
            sourcePreviewId: input.previewId,
          },
        });
        if (
          String(persistedSchedule.scheduleVersionId ?? '')
            === String(input.effectivePayload.priorScheduleVersionId ?? '')
        ) {
          throw new GoV2Error(
            409,
            'RESERVE_PROMOTION_SCHEDULE_LINEAGE_MISMATCH',
            'A published reserve promotion requires a distinct successor schedule version',
          );
        }
      }
      const promotion = await persistReservePromotion(client, {
        tournamentId: input.tournamentId,
        reserveEntryId: input.entityId,
        aggregateVersion: input.aggregateVersion,
        actorId: input.actor.id,
        commandId: input.command.commandId,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        inputHash: input.inputHash,
        previewInputHash: String(input.command.inputHash ?? ''),
        previewId: input.previewId,
        redApprovalId: input.risk === 'red' ? input.command.redApprovalId ?? null : null,
        payload: input.effectivePayload,
        successorScheduleVersionId: persistedSchedule
          ? String(persistedSchedule.scheduleVersionId ?? '')
          : null,
      });
      return {
        ...promotion,
        successorSchedule: persistedSchedule,
      };
    }
    case 'entry.withdrawal.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'ENTRY_ID_REQUIRED', 'entryId is required');
      return persistEntryWithdrawal(client, {
        tournamentId: input.tournamentId,
        entryId: input.entityId,
        aggregateVersion: input.aggregateVersion,
        actorId: input.actor.id,
        commandId: input.command.commandId,
        deviceId: input.command.deviceId,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        payload: input.effectivePayload,
      });
    }
    case 'attendance.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'ENTRY_ID_REQUIRED', 'entryId is required');
      return persistGoV2AttendanceMutation(client, {
        tournamentId: input.tournamentId,
        entryId: input.entityId,
        aggregateVersion: input.aggregateVersion,
        actorId: input.actor.id,
        command: input.command,
        payload: input.effectivePayload,
      });
    }
    case 'attendance.reinstate.commit': {
      const entryId = assertGoV2Uuid(input.effectivePayload.entryId, 'entryId');
      const decision = parseGoV2AttendanceReinstatementDecision(input.effectivePayload.decision);
      const awardedResults = Array.isArray(input.effectivePayload.awardedResults)
        ? input.effectivePayload.awardedResults.map(asRecord)
        : [];
      const awardedMatchIds = uniqueSortedIds(
        awardedResults.map((awarded) => String(awarded.matchId ?? '')),
      );
      const awardedMatchSet = new Set(awardedMatchIds);
      const replayMatchIds = uniqueSortedIds(
        Array.isArray(input.effectivePayload.replayMatchIds)
          ? input.effectivePayload.replayMatchIds.map(String)
          : [],
      );
      const affectedMatches = Array.isArray(input.effectivePayload.affectedMatches)
        ? input.effectivePayload.affectedMatches.map((rawMatch) => {
            const match = asRecord(rawMatch);
            return {
              matchId: String(match.matchId),
              playState: String(match.playState),
              scheduleState: String(match.scheduleState),
              currentResultRevisionNo: Number(match.currentResultRevisionNo ?? 0),
            };
          })
        : [];
      const allMutationMatchIds = uniqueSortedIds([
        ...awardedMatchIds,
        ...affectedMatches.map((match) => match.matchId),
      ]);
      const beforeSnapshots = await loadMutationMatchSnapshots(
        client,
        input.tournamentId,
        allMutationMatchIds,
      );
      const beforeByMatchId = new Map(beforeSnapshots.map((snapshot) => [snapshot.matchId, snapshot]));
      let resetRows: Awaited<ReturnType<typeof resetDownstreamForReplay>> = [];
      const resultRevisions: Array<Record<string, unknown>> = [];
      const incidentIds: string[] = [];
      const qualificationSnapshotLineage: Array<Record<string, unknown>> = [];
      let resetLiveProjectionMatchIds: string[] = [];
      let closedCourtSegmentIds: string[] = [];
      let closedScheduleAssignmentIds: string[] = [];
      let mutationBatchId: string | null = null;
      if (decision === 'overturn_and_cascade') {
        resetRows = await resetDownstreamForReplay(client, {
          tournamentId: input.tournamentId,
          impact: {
            triggerMatchId: awardedMatchIds[0],
            risk: input.risk,
            affectedMatches,
          },
          actorId: input.actor.id,
          reasonCode: input.command.reasonCode,
          reasonNote: input.command.reasonNote,
          allowScheduledReplacement: true,
        });
        if (resetRows.length) {
          await client.query(
            `UPDATE go_v2_matches
             SET current_result_revision_no = 0, updated_at = now()
             WHERE tournament_id = $1 AND id = ANY($2::uuid[])`,
            [input.tournamentId, resetRows.map((row) => row.matchId)],
          );
        }
        for (const awarded of awardedResults) {
          const matchId = assertGoV2Uuid(awarded.matchId, 'awardedResults.matchId');
          const incidentId = await appendIncident(client, {
            tournamentId: input.tournamentId,
            actorId: input.actor.id,
            reasonCode: input.command.reasonCode,
            payload: {
              matchId,
              entryId,
              incidentType: 'attendance_reinstatement',
              status: 'resolved',
              details: {
                decision,
                priorResultRevisionId: awarded.resultRevisionId,
                priorResultRevisionNo: awarded.resultRevisionNo,
              },
              evidence: { sourcePreviewId: input.previewId ?? null },
            },
          });
          incidentIds.push(incidentId);
          const revision = await appendResultRevision(client, {
            tournamentId: input.tournamentId,
            matchId,
            actorId: input.actor.id,
            reasonCode: input.command.reasonCode,
            reasonNote: input.command.reasonNote,
            resultSource: 'cascade',
            payload: {
              previousResultRevisionNo: Number(awarded.resultRevisionNo),
              resultKind: 'voided',
              incidentCause: 'attendance_reinstatement',
              advancementEffect: 'none',
              ratingEligibility: 'ineligible',
              declaredResult: {},
              standingContributions: [],
              evidence: {
                attendanceReinstatement: true,
                decision,
                priorResultRevisionId: awarded.resultRevisionId,
                sourcePreviewId: input.previewId ?? null,
              },
            },
          });
          resultRevisions.push({ matchId, ...revision });
          const reopened = await client.query(
            `UPDATE go_v2_matches
             SET current_result_revision_no = 0,
                 winner_entry_id = NULL, loser_entry_id = NULL,
                 play_state = 'pending', schedule_state = 'unscheduled',
                 version = version + 1, updated_at = now()
             WHERE id = $1 AND tournament_id = $2
               AND current_result_revision_no = $3
             RETURNING id`,
            [matchId, input.tournamentId, revision.revisionNo],
          );
          if (!reopened.rowCount) {
            throw new GoV2Error(
              409,
              'ATTENDANCE_REINSTATEMENT_RESULT_STALE',
              'An awarded result changed while it was being reopened',
              { matchId },
            );
          }
        }
        const qualificationChanges = Array.isArray(input.effectivePayload.qualificationChanges)
          ? input.effectivePayload.qualificationChanges.map(asRecord)
          : [];
        for (const change of qualificationChanges) {
          const groupStageId = assertGoV2Uuid(change.groupStageId, 'groupStageId');
          const groupReplayMatchIds = uniqueSortedIds(
            Array.isArray(change.replayMatchIds) ? change.replayMatchIds.map(String) : [],
          );
          qualificationSnapshotLineage.push(
            await persistPendingReplayQualificationInvalidation(client, {
              tournamentId: input.tournamentId,
              aggregateVersion: input.aggregateVersion,
              actorId: input.actor.id,
              groupStageId,
              priorStandingSnapshotId: change.priorStandingSnapshotId
                ? assertGoV2Uuid(change.priorStandingSnapshotId, 'priorStandingSnapshotId')
                : null,
              priorQualificationSnapshotId: assertGoV2Uuid(
                change.priorQualificationSnapshotId,
                'priorQualificationSnapshotId',
              ),
              replayMatchIds: groupReplayMatchIds,
              sourceHash: hashObject({
                operation: 'attendance.reinstate.commit',
                previewId: input.previewId ?? null,
                groupStageId,
                replayMatchIds: groupReplayMatchIds,
                resultRevisionIds: resultRevisions.map((revision) => revision.resultRevisionId),
              }),
            }),
          );
        }
        const closedSegments = await client.query(
          `UPDATE go_v2_match_court_segments segment
           SET ended_at = COALESCE(segment.ended_at, clock_timestamp()),
               closing_score = COALESCE(segment.closing_score, live.live_score)
           FROM go_v2_live_match_state live
           WHERE segment.match_id = live.match_id
             AND segment.match_id = ANY($1::uuid[])
             AND segment.ended_at IS NULL
           RETURNING segment.id::text, segment.schedule_assignment_id::text`,
          [allMutationMatchIds],
        );
        closedCourtSegmentIds = closedSegments.rows.map((row) => String(row.id));
        closedScheduleAssignmentIds = uniqueSortedIds(
          closedSegments.rows.map((row) => String(row.schedule_assignment_id)),
        );
        if (closedScheduleAssignmentIds.length) {
          await client.query(
            `UPDATE go_v2_schedule_assignments
             SET actual_end = COALESCE(actual_end, clock_timestamp())
             WHERE id = ANY($1::uuid[])`,
            [closedScheduleAssignmentIds],
          );
        }
        const resetLiveProjection = await client.query(
          `UPDATE go_v2_live_match_state
           SET command_version = command_version + 1,
               live_score = '{}'::jsonb,
               finish_requested = false,
               active_device_id = NULL,
               started_at = NULL,
               paused_at = NULL,
               updated_at = now()
           WHERE match_id = ANY($1::uuid[])
           RETURNING match_id::text`,
          [allMutationMatchIds],
        );
        resetLiveProjectionMatchIds = resetLiveProjection.rows.map((row) => String(row.match_id));
      }

      const solverInput = input.effectivePayload.solverInput as unknown as ScheduleSolverInput;
      const solverResult = asRecord(input.effectivePayload.solverResult);
      const assignments = Array.isArray(solverResult.assignments) ? solverResult.assignments : [];
      const validation = validateSchedule(solverInput, assignments as never[]);
      if (
        solverResult.publishable !== true
        || !validation.publishable
        || !validation.scheduleHash
        || validation.scheduleHash !== String(solverResult.scheduleHash ?? '')
      ) {
        throw new GoV2Error(
          409,
          'ATTENDANCE_REINSTATEMENT_PREVIEW_STALE',
          'The frozen successor schedule no longer validates',
          { conflicts: validation.conflicts },
        );
      }
      const persistedSchedule = await persistScheduleVersion(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        inputHash: input.inputHash,
        payload: {
          ...input.effectivePayload,
          publicationKind: 'attendance_reinstatement',
          sourcePreviewId: input.previewId ?? null,
          independentValidation: validation,
        },
      });
      const successorScheduleVersionId = String(persistedSchedule.scheduleVersionId ?? '');
      const afterSnapshots = await loadMutationMatchSnapshots(
        client,
        input.tournamentId,
        allMutationMatchIds,
      );
      const afterByMatchId = new Map(afterSnapshots.map((snapshot) => [snapshot.matchId, snapshot]));
      if (decision === 'overturn_and_cascade') {
        mutationBatchId = await appendCascadeBatch(client, {
          tournamentId: input.tournamentId,
          actorId: input.actor.id,
          reasonCode: input.command.reasonCode,
          reasonNote: input.command.reasonNote,
          expectedVersion: input.command.expectedVersion,
          committedVersion: input.aggregateVersion,
          mutationKind: 'cascade_void_and_replay',
          risk: input.risk,
          triggerMatchId: awardedMatchIds[0],
          payload: {
            operation: 'attendance.reinstate.commit',
            entryId,
            decision,
            incidentIds,
            resultRevisions,
            resetRows,
            resetLiveProjectionMatchIds,
            closedCourtSegmentIds,
            closedScheduleAssignmentIds,
            qualificationSnapshotLineage,
            priorScheduleVersionId: input.effectivePayload.priorScheduleVersionId,
            successorScheduleVersionId,
            scheduleHash: validation.scheduleHash,
          },
        });
        const resultRevisionByMatchId = new Map(resultRevisions.map((revision) => [
          String(revision.matchId),
          String(revision.resultRevisionId),
        ]));
        await appendCascadeMatchRows(client, mutationBatchId, allMutationMatchIds.map((matchId) => {
          const prior = beforeByMatchId.get(matchId);
          const next = afterByMatchId.get(matchId);
          const trigger = awardedMatchSet.has(matchId);
          const reset = resetRows.find((row) => row.matchId === matchId);
          return {
            matchId,
            priorResultRevisionId: prior?.resultRevisionId ?? null,
            newResultRevisionId: trigger
              ? resultRevisionByMatchId.get(matchId) ?? null
              : reset?.newResultRevisionId ?? null,
            priorScheduleAssignmentId: prior?.scheduleAssignmentId ?? null,
            newScheduleAssignmentId: next?.scheduleAssignmentId ?? null,
            action: 'replay' as const,
            risk: input.risk,
            diff: {
              operation: 'attendance.reinstate.commit',
              entryId,
              decision,
              trigger,
              scheduledForImmediateReplay: replayMatchIds.includes(matchId),
              priorPlayState: prior?.playState ?? null,
              newPlayState: next?.playState ?? null,
              priorScheduleState: prior?.scheduleState ?? null,
              newScheduleState: next?.scheduleState ?? null,
              priorSlots: prior?.slots ?? [],
              newSlots: next?.slots ?? [],
              successorScheduleVersionId,
            },
          };
        }));
      }
      const attendance = await persistGoV2AttendanceReinstatement(client, {
        tournamentId: input.tournamentId,
        entryId,
        aggregateVersion: input.aggregateVersion,
        actorId: input.actor.id,
        command: input.command,
        payload: {
          ...input.effectivePayload,
          sourcePreviewId: input.previewId ?? null,
          mutationBatchId,
          priorScheduleVersionId: String(input.effectivePayload.priorScheduleVersionId ?? ''),
          successorScheduleVersionId,
          scheduleHash: validation.scheduleHash,
          resultRevisionIds: resultRevisions.map((revision) => revision.resultRevisionId),
          resetLiveProjectionMatchIds,
          closedCourtSegmentIds,
          closedScheduleAssignmentIds,
          qualificationSnapshotLineage,
        },
      });
      return {
        attendance,
        decision,
        awardedResultPolicy: decision,
        priorResultsPreserved: decision === 'keep_awarded_result',
        incidentIds,
        resultRevisions,
        replayMatchIds,
        deferredAwardedMatchIds: Array.isArray(input.effectivePayload.deferredAwardedMatchIds)
          ? input.effectivePayload.deferredAwardedMatchIds.map(String)
          : [],
        resetMatchIds: resetRows.map((row) => row.matchId),
        resetLiveProjectionMatchIds,
        closedCourtSegmentIds,
        closedScheduleAssignmentIds,
        qualificationSnapshotLineage,
        mutationBatchId,
        priorScheduleVersionId: String(input.effectivePayload.priorScheduleVersionId ?? ''),
        successorScheduleVersionId,
        scheduleHash: validation.scheduleHash,
        scheduleDiff: input.effectivePayload.scheduleDiff,
      };
    }
    case 'disruption.commit':
      return persistGoV2Disruption(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        command: input.command,
        payload: input.effectivePayload,
        risk: input.risk,
      });
    case 'disruption.resolve.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'DISRUPTION_ID_REQUIRED', 'disruptionId is required');
      return persistGoV2DisruptionResolution(client, {
        tournamentId: input.tournamentId,
        disruptionId: input.entityId,
        actorId: input.actor.id,
        command: input.command,
        payload: input.effectivePayload,
      });
    }
    case 'match.pause_resolution.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'MATCH_ID_REQUIRED', 'matchId is required');
      let successorScheduleVersionId: string | null = null;
      let successorScheduleAssignmentId: string | null = null;
      if (String(input.effectivePayload.decision) === 'transfer') {
        const solverInput = input.effectivePayload.solverInput as unknown as ScheduleSolverInput;
        const solverResult = asRecord(input.effectivePayload.solverResult);
        const assignments = Array.isArray(solverResult.assignments) ? solverResult.assignments : [];
        const validation = validateSchedule(solverInput, assignments as never[]);
        if (
          solverResult.publishable !== true
          || validation.publishable !== true
          || !validation.scheduleHash
          || String(solverResult.scheduleHash ?? '') !== validation.scheduleHash
        ) {
          throw new GoV2Error(409, 'PAUSE_TRANSFER_PREVIEW_STALE', 'Transfer schedule no longer validates');
        }
        const persisted = await persistScheduleVersion(client, {
          tournamentId: input.tournamentId,
          actorId: input.actor.id,
          inputHash: input.inputHash,
          payload: {
            ...input.effectivePayload,
            publicationKind: 'live_transfer',
            sourcePreviewId: input.previewId ?? null,
            independentValidation: validation,
          },
        });
        successorScheduleVersionId = String(persisted.scheduleVersionId ?? '');
        const successorAssignment = await client.query(
          `SELECT id::text
           FROM go_v2_schedule_assignments
           WHERE schedule_version_id = $1 AND match_id = $2`,
          [successorScheduleVersionId, input.entityId],
        );
        if (!successorAssignment.rowCount) {
          throw new GoV2Error(409, 'TRANSFER_SUCCESSOR_ASSIGNMENT_MISSING', 'Published transfer has no successor match assignment');
        }
        successorScheduleAssignmentId = String(successorAssignment.rows[0].id);
      }
      return persistGoV2PauseResolution(client, {
        tournamentId: input.tournamentId,
        matchId: input.entityId,
        actorId: input.actor.id,
        command: input.command,
        payload: input.effectivePayload,
        successorScheduleVersionId,
        successorScheduleAssignmentId,
      });
    }
    case 'incident.commit': {
      const triggerMatchId = assertGoV2Uuid(
        input.effectivePayload.triggerMatchId ?? input.effectivePayload.matchId,
        'triggerMatchId',
      );
      const resolution = String(input.effectivePayload.resolution ?? 'cascade_void_and_replay');
      if (!['cascade_void_and_replay', 'retain_progression_override'].includes(resolution)) {
        throw new GoV2Error(422, 'INVALID_CASCADE_RESOLUTION', 'Choose cascade_void_and_replay or retain_progression_override');
      }
      if (resolution === 'retain_progression_override' && input.actor.role !== 'admin') {
        throw new GoV2Error(
          403,
          'RETAIN_PROGRESSION_ADMIN_REQUIRED',
          'retain_progression_override is restricted to an administrator',
        );
      }
      const impactInput = asRecord(input.effectivePayload.impact);
      const impact: GoV2ImpactPreview = {
        triggerMatchId,
        risk: input.risk,
        affectedMatches: Array.isArray(impactInput.affectedMatches)
          ? impactInput.affectedMatches.map((rawMatch) => {
              const match = asRecord(rawMatch);
              return {
                matchId: String(match.matchId),
                playState: String(match.playState),
                scheduleState: String(match.scheduleState),
                currentResultRevisionNo: Number(match.currentResultRevisionNo ?? 0),
              };
            })
          : [],
        qualificationCorrection: impactInput.qualificationCorrection
          ? impactInput.qualificationCorrection as unknown as GoV2QualificationCorrectionContext
          : undefined,
      };
      if (
        impact.qualificationCorrection
        && resolution === 'cascade_void_and_replay'
        && impact.qualificationCorrection.capabilities.cascadeVoidAndReplay.available !== true
      ) {
        throw new GoV2Error(
          409,
          'QUALIFICATION_CASCADE_UNAVAILABLE',
          'The locked qualification cannot be atomically rebound onto its frozen bracket topology',
          {
            qualificationSnapshotId: impact.qualificationCorrection.qualificationSnapshotId,
            blockers: impact.qualificationCorrection.blockers,
            capabilities: impact.qualificationCorrection.capabilities,
          },
        );
      }
      const mutationSnapshots = await loadMutationMatchSnapshots(
        client,
        input.tournamentId,
        [triggerMatchId, ...impact.affectedMatches.map((match) => match.matchId)],
      );
      const snapshotByMatchId = new Map(mutationSnapshots.map((snapshot) => [snapshot.matchId, snapshot]));
      const triggerSnapshot = snapshotByMatchId.get(triggerMatchId);
      if (!triggerSnapshot) throw new GoV2Error(404, 'MATCH_NOT_FOUND', 'Trigger match not found');
      const resetRows = resolution === 'cascade_void_and_replay'
        ? await resetDownstreamForReplay(client, {
            tournamentId: input.tournamentId,
            impact,
            actorId: input.actor.id,
            reasonCode: input.command.reasonCode,
            reasonNote: input.command.reasonNote,
            allowScheduledReplacement: Boolean(impact.qualificationCorrection?.activeSchedule),
          })
        : [];
      const incidentId = await appendIncident(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        payload: { ...input.effectivePayload, matchId: triggerMatchId },
      });
      const resultKind = String(input.effectivePayload.resultKind ?? 'voided');
      let resultRevision: Awaited<ReturnType<typeof appendResultRevision>> | null = null;
      let reboundMatchIds: string[] = [];
      let qualificationSnapshotLineage: Record<string, unknown> | null = null;
      let scheduleVersionLineage: Record<string, unknown> | null = null;
      if (resultKind === 'played' || resultKind === 'incomplete' || ['walkover', 'forfeit', 'admin_award'].includes(resultKind)) {
        const prepared = resultKind === 'played'
          ? await preparePlayedResultPayload(client, {
              tournamentId: input.tournamentId,
              matchId: triggerMatchId,
              payload: input.effectivePayload,
            })
          : resultKind === 'incomplete'
            ? await prepareIncompleteResultPayload(client, {
                tournamentId: input.tournamentId,
                matchId: triggerMatchId,
                payload: input.effectivePayload,
              })
            : await prepareTechnicalResultPayload(client, {
                tournamentId: input.tournamentId,
                matchId: triggerMatchId,
                payload: input.effectivePayload,
              });
        const preparedPayload = resolution === 'retain_progression_override'
          ? { ...prepared.payload, advancementEffect: 'retain_existing' }
          : prepared.payload;
        resultRevision = await appendResultRevision(client, {
          tournamentId: input.tournamentId,
          matchId: triggerMatchId,
          actorId: input.actor.id,
          reasonCode: input.command.reasonCode,
          reasonNote: input.command.reasonNote,
          resultSource: 'incident',
          payload: preparedPayload,
        });
        if (resolution === 'cascade_void_and_replay') {
          reboundMatchIds = await resolveDownstreamSlots(
            client,
            triggerMatchId,
            String(prepared.payload.winnerEntryId),
            String(prepared.payload.loserEntryId),
            {
              actorId: input.actor.id,
              reasonCode: input.command.reasonCode,
              reasonNote: input.command.reasonNote,
            },
          );
        }
      } else if (resultKind === 'mutual_no_show' || resultKind === 'voided') {
        resultRevision = await appendResultRevision(client, {
          tournamentId: input.tournamentId,
          matchId: triggerMatchId,
          actorId: input.actor.id,
          reasonCode: input.command.reasonCode,
          reasonNote: input.command.reasonNote,
          resultSource: 'incident',
          payload: {
            ...input.effectivePayload,
            resultKind,
            advancementEffect: 'none',
            ratingEligibility: 'ineligible',
            declaredResult: resultKind === 'mutual_no_show' ? { technical: true, sets: [] } : {},
            standingContributions: [],
          },
        });
        if (resolution === 'cascade_void_and_replay') {
          reboundMatchIds = await resolveNoWinnerDownstreamSlots(client, triggerMatchId, {
            actorId: input.actor.id,
            reasonCode: input.command.reasonCode,
            reasonNote: input.command.reasonNote,
          });
        }
      } else {
        throw new GoV2Error(
          422,
          'INCIDENT_RESULT_DETAILS_REQUIRED',
          `${resultKind} requires a winner or a completed partial-score policy`,
        );
      }
      if (
        impact.qualificationCorrection
        && resolution === 'retain_progression_override'
      ) {
        const correction = impact.qualificationCorrection;
        const source = await loadCompetitionTierSource(client, input.tournamentId);
        const pipeline = buildLockedQualificationPipeline(source, correction.rulesSnapshot);
        const pipelineHash = hashObject(pipeline);
        const previewPipelineHash = String(asRecord(correction.after).pipelineHash ?? '');
        if (!previewPipelineHash || previewPipelineHash !== pipelineHash) {
          throw new GoV2Error(
            409,
            'QUALIFICATION_CORRECTION_PREVIEW_STALE',
            'The corrected standing projection changed while committing; generate a fresh incident preview',
            { previewPipelineHash, pipelineHash },
          );
        }
        const sourceHash = hashObject({
          correctionMode: 'retain_progression_override',
          groupStageId: correction.groupStageId,
          priorQualificationSnapshotId: correction.qualificationSnapshotId,
          resultRevisionIds: source.resultRevisionIds,
          pipelineHash,
        });
        qualificationSnapshotLineage = await persistRetainedQualificationCorrectionSnapshots(client, {
          tournamentId: input.tournamentId,
          aggregateVersion: input.aggregateVersion,
          groupStageId: correction.groupStageId,
          priorStandingSnapshotId: correction.standingSnapshotId,
          priorQualificationSnapshotId: correction.qualificationSnapshotId,
          sourceHash,
          pipeline,
        });
      }
      if (
        impact.qualificationCorrection
        && resolution === 'cascade_void_and_replay'
      ) {
        const correction = impact.qualificationCorrection;
        const previewPlan = correction.cascadePlan;
        if (!previewPlan) {
          throw new GoV2Error(409, 'QUALIFICATION_CASCADE_PREVIEW_STALE',
            'Cascade topology plan is missing; generate a fresh incident preview');
        }
        const source = await loadCompetitionTierSource(client, input.tournamentId);
        const competition = buildCompetitionBracketCandidate(source, {});
        const pipelineHash = hashObject(competition.pipeline);
        const previewPipelineHash = String(asRecord(correction.after).pipelineHash ?? '');
        if (!previewPipelineHash || previewPipelineHash !== pipelineHash) {
          throw new GoV2Error(409, 'QUALIFICATION_CORRECTION_PREVIEW_STALE',
            'The corrected qualification ledger changed while committing', {
              previewPipelineHash,
              pipelineHash,
            });
        }
        const topologyPlan = await loadQualificationCascadeTopologyPlan(
          client,
          input.tournamentId,
          competition.tierBrackets as unknown as Array<Record<string, unknown>>,
        );
        if (
          topologyPlan.topologyShapeHash !== previewPlan.topologyShapeHash
          || topologyPlan.slotBindingHash !== previewPlan.slotBindingHash
        ) {
          throw new GoV2Error(409, 'QUALIFICATION_CASCADE_PREVIEW_STALE',
            'The frozen topology or projected ENTRY bindings changed while committing');
        }
        const sourceHash = hashObject({
          correctionMode: 'cascade_void_and_replay',
          groupStageId: correction.groupStageId,
          priorQualificationSnapshotId: correction.qualificationSnapshotId,
          resultRevisionIds: source.resultRevisionIds,
          pipelineHash,
          topologyShapeHash: topologyPlan.topologyShapeHash,
          slotBindingHash: topologyPlan.slotBindingHash,
        });
        qualificationSnapshotLineage = await persistQualificationCascadeRematerialization(client, {
          tournamentId: input.tournamentId,
          aggregateVersion: input.aggregateVersion,
          groupStageId: correction.groupStageId,
          priorStandingSnapshotId: correction.standingSnapshotId,
          priorQualificationSnapshotId: correction.qualificationSnapshotId,
          sourceHash,
          pipeline: competition.pipeline,
          tierBrackets: competition.tierBrackets as unknown as Array<Record<string, unknown>>,
          expectedTopologyShapeHash: topologyPlan.topologyShapeHash,
          expectedSlotBindingHash: topologyPlan.slotBindingHash,
        });
        scheduleVersionLineage = await publishQualificationCascadeScheduleSuccessor(
          client,
          input.tournamentId,
          correction.activeSchedule,
          input.actor.id,
          sourceHash,
          resetRows.map((row) => row.matchId),
        );
      }
      const postMutationSnapshots = await loadMutationMatchSnapshots(
        client,
        input.tournamentId,
        [triggerMatchId, ...impact.affectedMatches.map((match) => match.matchId)],
      );
      const postSnapshotByMatchId = new Map(
        postMutationSnapshots.map((snapshot) => [snapshot.matchId, snapshot] as const),
      );
      const mutationBatchId = await appendCascadeBatch(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        expectedVersion: input.command.expectedVersion,
        committedVersion: input.aggregateVersion,
        mutationKind: impact.qualificationCorrection
          ? resolution === 'cascade_void_and_replay'
            ? 'cascade_void_and_replay'
            : 'retain_progression_override'
          : 'incident',
        risk: input.risk,
        triggerMatchId,
        payload: {
          ...input.effectivePayload,
          resolution,
          resultRevision,
          reboundMatchIds,
          resetRows,
          qualificationSnapshotLineage,
          scheduleVersionLineage,
        },
      });
      const resetMatchIds = new Set(resetRows.map((row) => row.matchId));
      const downstreamRows = resolution === 'retain_progression_override'
        ? impact.affectedMatches.map((match) => {
            const snapshot = snapshotByMatchId.get(match.matchId);
            return {
              matchId: match.matchId,
              priorResultRevisionId: snapshot?.resultRevisionId ?? null,
              newResultRevisionId: snapshot?.resultRevisionId ?? null,
              priorScheduleAssignmentId: snapshot?.scheduleAssignmentId ?? null,
              newScheduleAssignmentId: postSnapshotByMatchId.get(match.matchId)?.scheduleAssignmentId
                ?? snapshot?.scheduleAssignmentId
                ?? null,
              action: 'retain' as const,
              risk: input.risk,
              diff: {
                resolution,
                priorPlayState: snapshot?.playState ?? match.playState,
                newPlayState: snapshot?.playState ?? match.playState,
                priorScheduleState: snapshot?.scheduleState ?? match.scheduleState,
                newScheduleState: snapshot?.scheduleState ?? match.scheduleState,
                priorSlots: snapshot?.slots ?? [],
              },
            };
          })
        : [
            ...resetRows.map((row) => ({
              ...row,
              newScheduleAssignmentId: postSnapshotByMatchId.get(row.matchId)?.scheduleAssignmentId ?? null,
              diff: {
                ...row.diff,
                resolution,
                qualificationSnapshotLineage,
                scheduleVersionLineage,
              },
            })),
            ...reboundMatchIds.filter((matchId) => !resetMatchIds.has(matchId)).map((matchId) => ({
              matchId,
              priorScheduleAssignmentId: snapshotByMatchId.get(matchId)?.scheduleAssignmentId ?? null,
              newScheduleAssignmentId: postSnapshotByMatchId.get(matchId)?.scheduleAssignmentId ?? null,
              action: 'reroute' as const,
              risk: input.risk,
              diff: { sourceMatchId: triggerMatchId, resolution },
            })),
          ];
      await appendCascadeMatchRows(client, mutationBatchId, [
        {
          matchId: triggerMatchId,
          priorResultRevisionId: triggerSnapshot.resultRevisionId,
          newResultRevisionId: resultRevision?.resultRevisionId,
          priorScheduleAssignmentId: triggerSnapshot.scheduleAssignmentId,
          newScheduleAssignmentId: postSnapshotByMatchId.get(triggerMatchId)?.scheduleAssignmentId
            ?? triggerSnapshot.scheduleAssignmentId,
          action: resultKind === 'voided' ? 'void' : 'reroute',
          risk: input.risk,
          diff: {
            resultKind,
            resolution,
            reboundMatchIds,
            priorPlayState: triggerSnapshot.playState,
            newPlayState: resultKind === 'voided' ? 'voided' : 'final',
            priorScheduleState: triggerSnapshot.scheduleState,
            newScheduleState: triggerSnapshot.scheduleState,
            priorWinnerEntryId: triggerSnapshot.winnerEntryId,
            priorLoserEntryId: triggerSnapshot.loserEntryId,
            priorSlots: triggerSnapshot.slots,
            qualificationSnapshotLineage,
            scheduleVersionLineage,
          },
        },
        ...downstreamRows,
      ]);
      return {
        incidentId,
        mutationBatchId,
        resolution,
        resultRevision,
        reboundMatchIds,
        resetMatchIds: [...resetMatchIds],
        qualificationSnapshotLineage,
        scheduleVersionLineage,
      };
    }
    case 'mutation.undo.commit': {
      if (!input.entityId) throw new GoV2Error(400, 'BATCH_ID_REQUIRED', 'batchId is required');
      const undo = await applyCompensatingUndo(
        client,
        input.tournamentId,
        input.entityId,
        {
          actorId: input.actor.id,
          reasonCode: input.command.reasonCode,
          reasonNote: input.command.reasonNote,
        },
      );
      let restoredRows = undo.restoredRows;
      let qualificationSnapshotLineage: Record<string, unknown> | null = null;
      let scheduleVersionLineage: Record<string, unknown> | null = null;
      if (undo.qualificationUndo?.available === true) {
        const qualificationUndo = undo.qualificationUndo;
        const source = await loadCompetitionTierSource(client, input.tournamentId);
        if (String(qualificationUndo.mode) === 'cascade_void_and_replay') {
          const competition = buildCompetitionBracketCandidate(source, {});
          const topologyPlan = await loadQualificationCascadeTopologyPlan(
            client,
            input.tournamentId,
            competition.tierBrackets as unknown as Array<Record<string, unknown>>,
          );
          const pipelineHash = hashObject(competition.pipeline);
          const sourceHash = hashObject({
            correctionMode: 'compensating_undo_cascade',
            compensatesBatchId: input.entityId,
            groupStageId: qualificationUndo.groupStageId,
            priorQualificationSnapshotId: qualificationUndo.priorQualificationSnapshotId,
            resultRevisionIds: source.resultRevisionIds,
            pipelineHash,
            topologyShapeHash: topologyPlan.topologyShapeHash,
            slotBindingHash: topologyPlan.slotBindingHash,
          });
          qualificationSnapshotLineage = await persistQualificationCascadeRematerialization(client, {
            tournamentId: input.tournamentId,
            aggregateVersion: input.aggregateVersion,
            groupStageId: String(qualificationUndo.groupStageId),
            priorStandingSnapshotId: qualificationUndo.priorStandingSnapshotId
              ? String(qualificationUndo.priorStandingSnapshotId)
              : null,
            priorQualificationSnapshotId: String(qualificationUndo.priorQualificationSnapshotId),
            sourceHash,
            pipeline: competition.pipeline,
            tierBrackets: competition.tierBrackets as unknown as Array<Record<string, unknown>>,
            expectedTopologyShapeHash: topologyPlan.topologyShapeHash,
            expectedSlotBindingHash: topologyPlan.slotBindingHash,
            correctionMode: 'compensating_undo_cascade',
          });
          scheduleVersionLineage = await publishQualificationCascadeScheduleSuccessor(
            client,
            input.tournamentId,
            qualificationUndo.activeSchedule as GoV2QualificationCascadeScheduleContext | null,
            input.actor.id,
            sourceHash,
          );
          const postUndoSnapshots = await loadMutationMatchSnapshots(
            client,
            input.tournamentId,
            restoredRows.map((row) => row.matchId),
          );
          const postUndoByMatch = new Map(postUndoSnapshots.map((row) => [row.matchId, row] as const));
          restoredRows = restoredRows.map((row) => ({
            ...row,
            newScheduleAssignmentId: postUndoByMatch.get(row.matchId)?.scheduleAssignmentId ?? null,
            diff: { ...row.diff, qualificationSnapshotLineage, scheduleVersionLineage },
          }));
        } else {
          const pipeline = buildLockedQualificationPipeline(
            source,
            asRecord(qualificationUndo.rulesSnapshot),
          );
          const pipelineHash = hashObject(pipeline);
          const sourceHash = hashObject({
            correctionMode: 'compensating_undo_retain_progression',
            compensatesBatchId: input.entityId,
            groupStageId: qualificationUndo.groupStageId,
            priorQualificationSnapshotId: qualificationUndo.priorQualificationSnapshotId,
            resultRevisionIds: source.resultRevisionIds,
            pipelineHash,
          });
          qualificationSnapshotLineage = await persistRetainedQualificationCorrectionSnapshots(client, {
            tournamentId: input.tournamentId,
            aggregateVersion: input.aggregateVersion,
            groupStageId: String(qualificationUndo.groupStageId),
            priorStandingSnapshotId: qualificationUndo.priorStandingSnapshotId
              ? String(qualificationUndo.priorStandingSnapshotId)
              : null,
            priorQualificationSnapshotId: String(qualificationUndo.priorQualificationSnapshotId),
            sourceHash,
            pipeline,
            correctionMode: 'compensating_undo_retain_progression',
          });
        }
      }
      const mutationBatchId = await appendCascadeBatch(client, {
        tournamentId: input.tournamentId,
        actorId: input.actor.id,
        reasonCode: input.command.reasonCode,
        reasonNote: input.command.reasonNote,
        expectedVersion: input.command.expectedVersion,
        committedVersion: input.aggregateVersion,
        mutationKind: 'compensating_undo',
        risk: input.risk,
        parentBatchId: input.entityId,
        payload: {
          ...input.effectivePayload,
          restoredRows,
          qualificationSnapshotLineage,
          scheduleVersionLineage,
        },
      });
      await appendCascadeMatchRows(client, mutationBatchId, restoredRows);
      return {
        mutationBatchId,
        compensatesBatchId: input.entityId,
        restoredRows,
        qualificationSnapshotLineage,
        scheduleVersionLineage,
      };
    }
    default:
      return { accepted: true, inputHash: input.inputHash };
  }
}

export async function commitGoV2Operation(
  tournamentIdRaw: string,
  operation: Exclude<GoV2OperationKind, `${string}.preview`>,
  body: unknown,
  actor: GoV2Actor,
  entityIdRaw?: string,
): Promise<GoV2CommitResponse> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const entityId = entityIdRaw ? assertGoV2Uuid(entityIdRaw, 'entityId') : undefined;
  const command = parseGoV2CommandEnvelope(body);
  assertGoV2OperationAuthority(operation, actor);
  assertGoV2CommitEndpointActive(operation);
  const hash = requestHash(operation, command, entityId);
  assertDeclaredRequestHash(command, hash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.idempotencyKey);
    if (receipt) {
      assertReceiptMatches(receipt, operation, hash);
      return replayedResponse(receipt.responsePayload) as unknown as GoV2CommitResponse;
    }
    assertOperationLifecycle(operation, state.lifecycleState);
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);

    const expectedPreviewKind = previewKindForCommit(operation);
    let preview: Awaited<ReturnType<typeof getOperationPreviewForUpdate>> | null = null;
    if (expectedPreviewKind) {
      if (!command.previewId) {
        throw new GoV2Error(400, 'PREVIEW_ID_REQUIRED', `${operation} requires previewId`);
      }
      const previewId = assertGoV2Uuid(command.previewId, 'previewId');
      preview = await getOperationPreviewForUpdate(
        client,
        tournamentId,
        previewId,
        expectedPreviewKind,
        state.aggregateVersion,
      );
      if (!command.inputHash) {
        throw new GoV2Error(400, 'INPUT_HASH_REQUIRED', `${operation} requires inputHash`);
      }
      if (command.inputHash !== preview.inputHash) {
        throw new GoV2Error(409, 'PREVIEW_HASH_MISMATCH', 'inputHash does not match the immutable preview');
      }
    }
    let risk = preview?.risk ?? riskFromPayload(command.payload);
    const previewCandidate = asRecord(preview?.result.candidate);
    let effectivePayload = preview ? previewCandidate : command.payload;
    if (operation === 'schedule.defer.commit') {
      if (command.reasonCode !== 'schedule_deferred') {
        throw new GoV2Error(
          422,
          'SCHEDULE_DEFER_REASON_MISMATCH',
          'reasonCode must be schedule_deferred',
        );
      }
      const matchId = assertGoV2Uuid(effectivePayload.matchId, 'matchId');
      const fresh = await client.query(
        `SELECT match.play_state, match.schedule_state,
                assignment.id::text AS assignment_id,
                assignment.is_locked, assignment.planned_start,
                version.id::text AS schedule_version_id,
                session.freeze_horizon_minutes
         FROM go_v2_matches match
         JOIN go_v2_tournament_state owner_state
           ON owner_state.tournament_id = match.tournament_id
         JOIN go_v2_schedule_versions version
           ON version.id = owner_state.active_schedule_version_id
          AND version.status = 'published'
         JOIN go_v2_schedule_assignments assignment
           ON assignment.schedule_version_id = version.id
          AND assignment.match_id = match.id
         JOIN go_v2_schedule_sessions session ON session.id = version.session_id
         WHERE match.id = $1 AND match.tournament_id = $2`,
        [matchId, tournamentId],
      );
      if (!fresh.rowCount) {
        throw new GoV2Error(409, 'SCHEDULE_DEFER_PREVIEW_STALE', 'The deferred match left the active schedule');
      }
      const row = fresh.rows[0];
      const playState = String(row.play_state);
      if (playState !== 'pending' && playState !== 'ready') {
        throw new GoV2Error(
          409,
          'DEFER_MATCH_STATE_FORBIDDEN',
          `Only pending or ready matches can be deferred; current state is ${playState}`,
        );
      }
      if (
        String(row.schedule_version_id) !== String(effectivePayload.priorScheduleVersionId ?? '')
        || String(row.assignment_id) !== String(effectivePayload.priorScheduleAssignmentId ?? '')
      ) {
        throw new GoV2Error(
          409,
          'SCHEDULE_DEFER_PREVIEW_STALE',
          'The active schedule assignment changed after defer preview',
        );
      }
      const requiresDirector = scheduleDeferRequiresDirector({
        assignmentLocked: row.is_locked === true || String(row.schedule_state) === 'locked',
        plannedStart: new Date(row.planned_start).toISOString(),
        freezeHorizonMinutes: Number(row.freeze_horizon_minutes),
        nowMs: Date.now(),
      });
      if (requiresDirector && actor.role !== 'admin') {
        throw new GoV2Error(
          403,
          'TOURNAMENT_DIRECTOR_REQUIRED',
          'Deferring a locked or freeze-horizon assignment requires tournament director confirmation',
          { matchId, freezeHorizonMinutes: Number(row.freeze_horizon_minutes) },
        );
      }
      effectivePayload = { ...effectivePayload, requiresDirector };
      risk = requiresDirector ? 'amber' : risk;
    }
    if (operation === 'schedule.defer.release.commit') {
      if (command.reasonCode !== 'schedule_defer_released') {
        throw new GoV2Error(
          422,
          'SCHEDULE_DEFER_RELEASE_REASON_MISMATCH',
          'reasonCode must be schedule_defer_released',
        );
      }
      const matchId = assertGoV2Uuid(effectivePayload.matchId, 'matchId');
      const activeDeferOverrideId = assertGoV2Uuid(
        effectivePayload.activeDeferOverrideId,
        'activeDeferOverrideId',
      );
      const fresh = await client.query(
        `SELECT match.play_state, match.schedule_state,
                assignment.id::text AS assignment_id,
                assignment.is_locked, assignment.planned_start,
                version.id::text AS schedule_version_id,
                session.freeze_horizon_minutes,
                defer.id::text AS defer_override_id,
                defer.action AS defer_action,
                defer.pause_resolution_id::text
         FROM go_v2_matches match
         JOIN go_v2_tournament_state owner_state
           ON owner_state.tournament_id = match.tournament_id
         JOIN go_v2_schedule_versions version
           ON version.id = owner_state.active_schedule_version_id
          AND version.status = 'published'
         JOIN go_v2_schedule_assignments assignment
           ON assignment.schedule_version_id = version.id
          AND assignment.match_id = match.id
         JOIN go_v2_schedule_sessions session ON session.id = version.session_id
         LEFT JOIN LATERAL (
           SELECT override.id, override.action, override.pause_resolution_id
           FROM go_v2_schedule_defer_overrides override
           WHERE override.match_id = match.id
           ORDER BY override.created_at DESC, override.id DESC
           LIMIT 1
         ) defer ON true
         WHERE match.id = $1 AND match.tournament_id = $2`,
        [matchId, tournamentId],
      );
      if (!fresh.rowCount) {
        throw new GoV2Error(409, 'SCHEDULE_DEFER_RELEASE_PREVIEW_STALE', 'The match left the active schedule');
      }
      const row = fresh.rows[0];
      const playState = String(row.play_state);
      if (playState !== 'pending' && playState !== 'ready') {
        throw new GoV2Error(
          409,
          'DEFER_RELEASE_MATCH_STATE_FORBIDDEN',
          `Only pending or ready matches can release a generic defer; current state is ${playState}`,
        );
      }
      if (
        String(row.schedule_version_id) !== String(effectivePayload.priorScheduleVersionId ?? '')
        || String(row.assignment_id) !== String(effectivePayload.priorScheduleAssignmentId ?? '')
        || String(row.defer_override_id ?? '') !== activeDeferOverrideId
        || String(row.defer_action ?? '') !== 'defer'
        || row.pause_resolution_id
      ) {
        throw new GoV2Error(
          409,
          'SCHEDULE_DEFER_RELEASE_PREVIEW_STALE',
          'The schedule assignment or active generic defer changed after preview',
        );
      }
      const requiresDirector = scheduleDeferRequiresDirector({
        assignmentLocked: row.is_locked === true || String(row.schedule_state) === 'locked',
        plannedStart: new Date(row.planned_start).toISOString(),
        freezeHorizonMinutes: Number(row.freeze_horizon_minutes),
        nowMs: Date.now(),
      });
      if (requiresDirector && actor.role !== 'admin') {
        throw new GoV2Error(
          403,
          'TOURNAMENT_DIRECTOR_REQUIRED',
          'Releasing a defer for a locked or freeze-horizon assignment requires tournament director confirmation',
          { matchId, freezeHorizonMinutes: Number(row.freeze_horizon_minutes) },
        );
      }
      effectivePayload = { ...effectivePayload, requiresDirector };
      risk = requiresDirector ? 'amber' : risk;
    }
    if (operation === 'match.finish.accept' || operation === 'match.finish.reject') {
      // A director supplies only the CAS token for the judge request. Score,
      // participants, winner and result semantics are derived from locked
      // server state inside persistGoV2FinishReviewDecision.
      effectivePayload = { finishRequestVersion: command.payload.finishRequestVersion };
      risk = 'green';
    }
    let linkedScheduleStates: Array<{
      tournamentId: string;
      state: Awaited<ReturnType<typeof ensureGoV2StateForUpdate>>;
    }> = [];
    if (preview && (operation === 'incident.commit' || operation === 'mutation.undo.commit')) {
      const resolution = String(command.payload.resolution ?? '').trim();
      if (resolution) effectivePayload = { ...effectivePayload, resolution };
    }
    if (
      operation === 'mutation.undo.commit'
      && String(effectivePayload.batchId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Undo preview does not belong to the batch in this URL');
    }
    if (
      operation === 'roster.replacement.commit'
      && String(effectivePayload.entryId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Replacement preview does not belong to the entry in this URL');
    }
    if (
      operation === 'reserve.promotion.commit'
      && String(effectivePayload.reserveEntryId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Reserve-promotion preview does not belong to the reserve in this URL');
    }
    if (
      operation === 'entry.withdrawal.commit'
      && String(effectivePayload.entryId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Withdrawal preview does not belong to the entry in this URL');
    }
    if (
      operation === 'attendance.commit'
      && String(effectivePayload.entryId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Attendance preview does not belong to the entry in this URL');
    }
    if (operation === 'attendance.reinstate.commit') {
      if (command.reasonCode !== 'attendance_reinstated') {
        throw new GoV2Error(
          422,
          'ATTENDANCE_REINSTATEMENT_REASON_MISMATCH',
          'reasonCode must be attendance_reinstated',
        );
      }
      const fresh = await loadGoV2AttendanceReinstatementState(
        client,
        tournamentId,
        {
          entryId: effectivePayload.entryId,
          decision: effectivePayload.decision,
          toState: effectivePayload.toState,
        },
        { freezeEffectiveAt: String(effectivePayload.effectiveAt ?? '') },
      );
      if (
        fresh.stateFingerprint !== String(effectivePayload.stateFingerprint ?? '')
        || fresh.attendanceVersion !== Number(effectivePayload.attendanceVersion)
      ) {
        throw new GoV2Error(
          409,
          'ATTENDANCE_REINSTATEMENT_PREVIEW_STALE',
          'Attendance, awarded results or downstream lineage changed after preview',
          {
            previewStateFingerprint: effectivePayload.stateFingerprint ?? null,
            currentStateFingerprint: fresh.stateFingerprint,
          },
        );
      }
      if (fresh.risk === 'red' && preview?.risk !== 'red') {
        throw new GoV2Error(
          409,
          'ATTENDANCE_REINSTATEMENT_RISK_ESCALATED',
          'A downstream match became live/final; generate a fresh red preview',
        );
      }
      const activeScope = await loadActiveScheduleCommandScope(client, tournamentId);
      if (activeScope.scheduleVersionId !== String(effectivePayload.priorScheduleVersionId ?? '')) {
        throw new GoV2Error(
          409,
          'ATTENDANCE_REINSTATEMENT_SCHEDULE_STALE',
          'The active shared-session schedule changed after preview',
          {
            previewScheduleVersionId: effectivePayload.priorScheduleVersionId ?? null,
            activeScheduleVersionId: activeScope.scheduleVersionId,
          },
        );
      }
      const canonicalPayload: Record<string, unknown> = {
        sessionTournamentIds: activeScope.sessionTournamentIds,
        sessionTournamentVersions: activeScope.sessionTournamentVersions,
        courts: activeScope.courts,
        sessionKey: activeScope.sessionKey,
        timezone: activeScope.timezone,
        startTime: localClock(activeScope.windowStart, activeScope.timezone),
        endTime: localClock(activeScope.windowEnd, activeScope.timezone),
        freezeHorizonMinutes: activeScope.freezeHorizonMinutes,
        refereeMode: activeScope.refereeMode,
      };
      linkedScheduleStates = await lockLinkedScheduleStates(
        client,
        tournamentId,
        canonicalPayload,
        operation,
      );
      const commitCanonical = await buildAutomaticSchedulePayload(
        client,
        tournamentId,
        canonicalPayload,
        {
          attendanceReinstatement: {
            replayMatchIds: fresh.decision === 'overturn_and_cascade' ? fresh.replayMatchIds : [],
            excludedMatchIds: fresh.excludedSuccessorMatchIds,
            replayNotBefore: String(effectivePayload.replayNotBefore ?? ''),
          },
        },
      );
      const previewSolverResult = asRecord(effectivePayload.solverResult);
      const previewAssignments = Array.isArray(previewSolverResult.assignments)
        ? previewSolverResult.assignments
        : [];
      const validation = validateSchedule(
        commitCanonical.solverInput,
        previewAssignments as never[],
      );
      if (
        !validation.publishable
        || !validation.scheduleHash
        || validation.scheduleHash !== String(previewSolverResult.scheduleHash ?? '')
      ) {
        throw new GoV2Error(
          409,
          'ATTENDANCE_REINSTATEMENT_PREVIEW_STALE',
          'The exact successor schedule changed after preview; generate a fresh reinstatement preview',
          {
            previewScheduleHash: previewSolverResult.scheduleHash ?? null,
            validatedScheduleHash: validation.scheduleHash,
            conflicts: validation.conflicts,
          },
        );
      }
      effectivePayload = {
        ...effectivePayload,
        ...canonicalPayload,
        ...commitCanonical,
        awardedResults: fresh.awardedResults,
        affectedMatches: fresh.affectedMatches,
        replayMatchIds: fresh.replayMatchIds,
        deferredAwardedMatchIds: fresh.deferredAwardedMatchIds,
        excludedSuccessorMatchIds: fresh.excludedSuccessorMatchIds,
        qualificationChanges: fresh.qualificationChanges,
        resultRouteSnapshots: fresh.resultRouteSnapshots,
        solverResult: {
          ...previewSolverResult,
          inputHash: validation.inputHash,
          scheduleHash: validation.scheduleHash,
          objective: validation.objective,
          warnings: validation.warnings,
          publishable: true,
        },
        independentValidation: validation,
      };
      risk = fresh.risk;
    }
    if (
      operation === 'match.paper_import.commit'
      && String(effectivePayload.matchId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Paper import preview does not belong to the match in this URL');
    }
    if (
      operation === 'stage.rules.commit'
      && String(asRecord(effectivePayload.stageRuleChange).stageId ?? '') !== String(entityId ?? '')
    ) {
      throw new GoV2Error(409, 'PREVIEW_ENTITY_MISMATCH', 'Stage-rule preview does not belong to the stage in this URL');
    }
    if (operation === 'mutation.undo.commit' && entityId) {
      const freshUndo = await previewCompensatingUndo(client, tournamentId, entityId);
      const freshUndoRisk = normalizeGoV2Risk(freshUndo.risk);
      if (freshUndoRisk === 'red' && preview?.risk !== 'red') {
        throw new GoV2Error(409, 'UNDO_PREVIEW_RISK_ESCALATED',
          'A downstream match changed after undo preview; generate a fresh red preview');
      }
      const previewQualificationUndo = asRecord(asRecord(asRecord(effectivePayload.impact).qualificationUndo));
      const freshQualificationUndo = asRecord(freshUndo.qualificationUndo);
      const previewUndoSchedule = asRecord(previewQualificationUndo.activeSchedule);
      const freshUndoSchedule = asRecord(freshQualificationUndo.activeSchedule);
      if (
        String(previewQualificationUndo.priorQualificationSnapshotId ?? '')
          !== String(freshQualificationUndo.priorQualificationSnapshotId ?? '')
        || String(previewUndoSchedule.scheduleVersionId ?? '')
          !== String(freshUndoSchedule.scheduleVersionId ?? '')
        || hashObject(asRecord(previewUndoSchedule.sessionTournamentVersions))
          !== hashObject(asRecord(freshUndoSchedule.sessionTournamentVersions))
      ) {
        throw new GoV2Error(409, 'QUALIFICATION_UNDO_PREVIEW_STALE',
          'Qualification or schedule lineage changed after undo preview');
      }
      effectivePayload = { ...effectivePayload, impact: freshUndo };
      risk = freshUndoRisk;
      if (
        String(freshQualificationUndo.mode ?? '') === 'cascade_void_and_replay'
        && freshUndoSchedule.scheduleVersionId
      ) {
        linkedScheduleStates = await lockLinkedScheduleStates(
          client,
          tournamentId,
          {
            sessionTournamentIds: freshUndoSchedule.sessionTournamentIds,
            sessionTournamentVersions: freshUndoSchedule.sessionTournamentVersions,
          },
          'mutation.undo.commit',
        );
      }
    }
    if (operation === 'stage.rules.commit') {
      const previewChange = asRecord(effectivePayload.stageRuleChange);
      const fresh = await prepareGoV2StageRuleChange(client, tournamentId, previewChange, { lock: true });
      if (
        fresh.change.sourceHash !== String(previewChange.sourceHash ?? '')
        || hashObject(fresh.change.affectedMatchIds) !== hashObject(previewChange.affectedMatchIds)
      ) {
        throw new GoV2Error(
          409,
          'STAGE_RULE_PREVIEW_STALE',
          'The stage, affected round or active schedule changed after preview',
          {
            previewSourceHash: previewChange.sourceHash ?? null,
            currentSourceHash: fresh.change.sourceHash,
          },
        );
      }
      if (fresh.risk === 'red' && preview?.risk !== 'red') {
        throw new GoV2Error(
          409,
          'STAGE_RULE_PREVIEW_RISK_ESCALATED',
          'An affected match entered the freeze horizon; generate a fresh red preview',
        );
      }
      risk = fresh.risk;
    }
    if (operation === 'reserve.promotion.commit') {
      if (!entityId) throw new GoV2Error(400, 'RESERVE_ENTRY_ID_REQUIRED', 'reserveEntryId is required');
      if (command.reasonCode !== 'reserve_promoted') {
        throw new GoV2Error(422, 'RESERVE_PROMOTION_REASON_MISMATCH', 'reasonCode must be reserve_promoted');
      }
      const fresh = await prepareReservePromotion(client, {
        tournamentId,
        reserveEntryId: entityId,
        payload: effectivePayload,
        lock: true,
      });
      if (String(fresh.candidate.sourceHash ?? '') !== String(effectivePayload.sourceHash ?? '')) {
        throw new GoV2Error(
          409,
          'RESERVE_PROMOTION_PREVIEW_STALE',
          'Reserve, target slot or draw state changed after preview',
        );
      }
      risk = fresh.risk;
      effectivePayload = {
        ...effectivePayload,
        reserveRosterRevisionId: fresh.candidate.reserveRosterRevisionId,
        reservePlayerIds: fresh.candidate.reservePlayerIds,
        targetPlayerIds: fresh.candidate.targetPlayerIds,
        priorEntriesSnapshot: fresh.candidate.priorEntriesSnapshot,
        resultingEntriesSnapshot: fresh.candidate.resultingEntriesSnapshot,
        slotDiff: fresh.candidate.slotDiff,
      };
      if (fresh.candidate.requiresSuccessorSchedule === true) {
        risk = 'red';
        linkedScheduleStates = await lockLinkedScheduleStates(
          client,
          tournamentId,
          effectivePayload,
          'reserve.promotion.commit',
        );
        const entrySubstitution = {
          tournamentId,
          fromEntryId: assertGoV2Uuid(fresh.candidate.targetEntryId, 'targetEntryId'),
          toEntryId: entityId,
          fromPlayerIds: Array.isArray(fresh.candidate.targetPlayerIds)
            ? fresh.candidate.targetPlayerIds.map(String)
            : [],
          toPlayerIds: Array.isArray(fresh.candidate.reservePlayerIds)
            ? fresh.candidate.reservePlayerIds.map(String)
            : [],
        };
        const commitCanonical = await buildAutomaticSchedulePayload(
          client,
          tournamentId,
          { ...effectivePayload, asOf: new Date().toISOString() },
          { entrySubstitution },
        );
        const previewSolverResult = asRecord(effectivePayload.solverResult);
        const previewAssignments = Array.isArray(previewSolverResult.assignments)
          ? previewSolverResult.assignments
          : [];
        const commitValidation = validateSchedule(
          commitCanonical.solverInput,
          previewAssignments as never[],
        );
        if (
          previewSolverResult.publishable !== true
          || !commitValidation.publishable
          || !commitValidation.scheduleHash
          || String(previewSolverResult.scheduleHash ?? '') !== commitValidation.scheduleHash
        ) {
          throw new GoV2Error(
            409,
            'RESERVE_PROMOTION_SCHEDULE_PREVIEW_STALE',
            'The reserve roster, shared session or exact successor schedule changed after preview',
            {
              previewScheduleHash: previewSolverResult.scheduleHash ?? null,
              validatedScheduleHash: commitValidation.scheduleHash,
              conflicts: commitValidation.conflicts,
            },
          );
        }
        effectivePayload = {
          ...effectivePayload,
          ...commitCanonical,
          entrySubstitution,
          solverResult: {
            ...previewSolverResult,
            inputHash: commitValidation.inputHash,
            scheduleHash: commitValidation.scheduleHash,
            objective: commitValidation.objective,
            warnings: commitValidation.warnings,
            publishable: true,
          },
          independentValidation: commitValidation,
        };
      } else if (effectivePayload.solverResult || effectivePayload.priorScheduleVersionId) {
        throw new GoV2Error(
          409,
          'RESERVE_PROMOTION_SCHEDULE_PREVIEW_STALE',
          'A pre-draw reserve promotion cannot commit a schedule payload',
        );
      }
    }
    if (
      operation === 'schedule.generate.commit'
      || operation === 'schedule.replan.commit'
      || operation === 'schedule.policy.commit'
      || operation === 'schedule.defer.commit'
      || operation === 'schedule.defer.release.commit'
      || operation === 'stage.rules.commit'
      || operation === 'disruption.commit'
      || operation === 'disruption.resolve.commit'
      || operation === 'match.pause_resolution.commit'
    ) {
      const normalizedTournamentIds = scheduleTournamentIds(tournamentId, effectivePayload);
      effectivePayload = {
        ...effectivePayload,
        sessionTournamentIds: normalizedTournamentIds,
        session: { ...asRecord(effectivePayload.session), tournamentIds: normalizedTournamentIds },
      };
      linkedScheduleStates = await lockLinkedScheduleStates(
        client,
        tournamentId,
        effectivePayload,
        operation,
      );
    }
    if (
      operation === 'schedule.generate.commit'
      || operation === 'schedule.replan.commit'
      || operation === 'schedule.policy.commit'
      || operation === 'schedule.defer.commit'
      || operation === 'schedule.defer.release.commit'
      || operation === 'stage.rules.commit'
    ) {
      // The rolling freeze horizon and live ETA are commit-time constraints.
      // Preview assignments can publish only if the fresh canonical validator
      // still accepts them without moving a newly frozen match.
      const commitCanonical = await buildAutomaticSchedulePayload(
        client,
        tournamentId,
        { ...effectivePayload, asOf: new Date().toISOString() },
        operation === 'schedule.policy.commit'
          ? {
              courtPolicyException: parseGoV2CourtPolicyExceptionRequest(
                asRecord(effectivePayload.courtPolicyException),
              ),
            }
          : operation === 'schedule.defer.commit'
            ? {
                forcedDefer: {
                  matchId: assertGoV2Uuid(effectivePayload.matchId, 'matchId'),
                  notBefore: String(effectivePayload.effectiveNotBefore ?? ''),
                },
              }
            : operation === 'schedule.defer.release.commit'
              ? {
                  releasedDefer: {
                    matchId: assertGoV2Uuid(effectivePayload.matchId, 'matchId'),
                  },
                }
            : operation === 'stage.rules.commit'
              ? {
                  stageRuleChange: asRecord(effectivePayload.stageRuleChange) as unknown as {
                    tournamentId: string;
                    stageId: string;
                    affectedMatchIds: string[];
                    matchRule: MatchRule;
                  },
                }
            : undefined,
      );
      const previewSolverResult = asRecord(effectivePayload.solverResult);
      const previewAssignments = Array.isArray(previewSolverResult.assignments)
        ? previewSolverResult.assignments
        : [];
      const commitValidation = validateSchedule(
        commitCanonical.solverInput,
        previewAssignments as never[],
      );
      if (!commitValidation.publishable || !commitValidation.scheduleHash) {
        throw new GoV2Error(
          409,
          operation === 'schedule.generate.commit'
            ? 'SCHEDULE_GENERATE_PREVIEW_STALE'
            : operation === 'schedule.policy.commit'
              ? 'COURT_POLICY_PREVIEW_STALE'
              : operation === 'schedule.defer.commit'
                ? 'SCHEDULE_DEFER_PREVIEW_STALE'
                : operation === 'schedule.defer.release.commit'
                  ? 'SCHEDULE_DEFER_RELEASE_PREVIEW_STALE'
                : operation === 'stage.rules.commit'
                  ? 'STAGE_RULE_PREVIEW_STALE'
              : 'SCHEDULE_REPLAN_PREVIEW_STALE',
          operation === 'schedule.generate.commit'
            ? 'The tournament or court snapshot changed after preview; generate a fresh schedule preview'
            : operation === 'schedule.policy.commit'
              ? 'The session, strict court policy or schedule changed after preview; generate a fresh policy preview'
              : operation === 'schedule.defer.commit'
                ? 'The match or shared schedule changed after defer preview; generate a fresh preview'
                : operation === 'schedule.defer.release.commit'
                  ? 'The active defer or shared schedule changed after release preview; generate a fresh preview'
                : operation === 'stage.rules.commit'
                  ? 'The affected rounds or shared schedule changed after rule preview; generate a fresh preview'
              : 'Live ETA or the rolling freeze horizon changed after preview; generate a fresh replan preview',
          { conflicts: commitValidation.conflicts },
        );
      }
      if (
        (operation === 'schedule.defer.commit'
          || operation === 'schedule.defer.release.commit'
          || operation === 'stage.rules.commit')
        && String(previewSolverResult.scheduleHash ?? '') !== commitValidation.scheduleHash
      ) {
        throw new GoV2Error(
          409,
          operation === 'schedule.defer.commit'
            ? 'SCHEDULE_DEFER_PREVIEW_STALE'
            : operation === 'schedule.defer.release.commit'
              ? 'SCHEDULE_DEFER_RELEASE_PREVIEW_STALE'
              : 'STAGE_RULE_PREVIEW_STALE',
          operation === 'schedule.defer.commit'
            ? 'The exact successor schedule hash changed after preview; generate a fresh defer preview'
            : operation === 'schedule.defer.release.commit'
              ? 'The exact successor schedule hash changed after preview; generate a fresh release preview'
            : 'The exact successor schedule hash changed after preview; generate a fresh rule preview',
          {
            previewScheduleHash: previewSolverResult.scheduleHash ?? null,
            validatedScheduleHash: commitValidation.scheduleHash,
          },
        );
      }
      effectivePayload = {
        ...effectivePayload,
        ...commitCanonical,
        solverResult: {
          ...previewSolverResult,
          inputHash: commitValidation.inputHash,
          scheduleHash: commitValidation.scheduleHash,
          objective: commitValidation.objective,
          warnings: commitValidation.warnings,
          publishable: true,
        },
        independentValidation: commitValidation,
      };
    }
    if (
      operation === 'schedule.generate.commit'
      || operation === 'schedule.replan.commit'
      || operation === 'schedule.policy.commit'
      || operation === 'schedule.defer.commit'
      || operation === 'schedule.defer.release.commit'
      || operation === 'stage.rules.commit'
    ) {
      const solverInput = effectivePayload.solverInput as unknown as ScheduleSolverInput;
      const solverResult = asRecord(effectivePayload.solverResult);
      const assignments = Array.isArray(solverResult.assignments) ? solverResult.assignments : [];
      const validation = validateSchedule(solverInput, assignments as never[]);
      if (
        solverResult.publishable !== true
        || validation.publishable !== true
        || !solverResult.scheduleHash
        || solverResult.scheduleHash !== validation.scheduleHash
      ) {
        throw new GoV2Error(422, 'SCHEDULE_VALIDATION_FAILED', 'Independent schedule validation rejected publication', {
          solverStatus: solverResult.status,
          solverScheduleHash: solverResult.scheduleHash ?? null,
          validatorScheduleHash: validation.scheduleHash,
          conflicts: validation.conflicts,
        });
      }
      effectivePayload = { ...effectivePayload, independentValidation: validation };
    }
    if (operation === 'disruption.commit') {
      // Judge commands intentionally use a match-level CAS and do not bump the
      // tournament aggregate. Recompute affected live states while holding the
      // same tournament advisory lock so an amber preview cannot silently pause
      // a match that started after the preview.
      const freshDisruption = await prepareGoV2Disruption(client, {
        tournamentId,
        payload: effectivePayload,
      });
      if (freshDisruption.risk === 'red' && preview?.risk !== 'red') {
        throw new GoV2Error(
          409,
          'DISRUPTION_PREVIEW_RISK_ESCALATED',
          'A match became live after the disruption preview; generate a fresh red preview and obtain second approval',
          freshDisruption.impact,
        );
      }
      effectivePayload = freshDisruption.candidate;
      risk = freshDisruption.risk;
    }
    if (operation === 'disruption.resolve.commit') {
      if (!entityId) throw new GoV2Error(400, 'DISRUPTION_ID_REQUIRED', 'disruptionId is required');
      const freshResolution = await prepareGoV2DisruptionResolution(client, {
        tournamentId,
        disruptionId: entityId,
        payload: effectivePayload,
      });
      if (
        hashObject(freshResolution.candidate.sessionTournamentVersions)
          !== hashObject(effectivePayload.sessionTournamentVersions)
      ) {
        throw new GoV2Error(
          409,
          'DISRUPTION_RESOLUTION_PREVIEW_STALE',
          'The shared schedule session changed after the resolution preview',
        );
      }
      effectivePayload = freshResolution.candidate;
      risk = freshResolution.risk;
    }
    if (operation === 'match.pause_resolution.commit') {
      if (!entityId) throw new GoV2Error(400, 'MATCH_ID_REQUIRED', 'matchId is required');
      const freshResolution = await prepareGoV2PauseResolution(
        client,
        tournamentId,
        entityId,
        effectivePayload,
      );
      const previewValidation = asRecord(effectivePayload.independentValidation);
      const freshValidation = asRecord(freshResolution.candidate.independentValidation);
      if (
        String(freshResolution.candidate.priorScheduleVersionId ?? '')
          !== String(effectivePayload.priorScheduleVersionId ?? '')
        || Number(freshResolution.candidate.priorCommandVersion)
          !== Number(effectivePayload.priorCommandVersion)
        || String(freshResolution.candidate.decision ?? '') !== String(effectivePayload.decision ?? '')
        || String(freshResolution.candidate.targetCourtId ?? '') !== String(effectivePayload.targetCourtId ?? '')
        || String(freshResolution.candidate.deferMode ?? '') !== String(effectivePayload.deferMode ?? '')
        || String(freshResolution.candidate.notBefore ?? '') !== String(effectivePayload.notBefore ?? '')
        || String(freshValidation.scheduleHash ?? '') !== String(previewValidation.scheduleHash ?? '')
      ) {
        throw new GoV2Error(
          409,
          'PAUSE_RESOLUTION_PREVIEW_STALE',
          'Match, hold or shared schedule changed after pause resolution preview',
        );
      }
      effectivePayload = freshResolution.candidate;
      risk = freshResolution.risk;
    }
    if (operation === 'match.paper_import.commit') {
      if (!entityId) throw new GoV2Error(400, 'MATCH_ID_REQUIRED', 'matchId is required');
      const freshPaperImport = await prepareGoV2PaperImport(
        client,
        tournamentId,
        entityId,
        effectivePayload,
        command.reasonCode,
      );
      if (
        String(freshPaperImport.candidate.actualStartedAt ?? '')
          !== String(effectivePayload.actualStartedAt ?? '')
        || String(freshPaperImport.candidate.actualEndedAt ?? '')
          !== String(effectivePayload.actualEndedAt ?? '')
        || hashObject(asRecord(freshPaperImport.candidate.actualScore))
          !== hashObject(asRecord(effectivePayload.actualScore))
      ) {
        throw new GoV2Error(
          409,
          'PAPER_IMPORT_PREVIEW_STALE',
          'Match state or paper protocol changed after preview',
        );
      }
      effectivePayload = freshPaperImport.candidate;
      risk = freshPaperImport.risk;
    }
    if (operation === 'match.result.revise') {
      if (!entityId) throw new GoV2Error(400, 'MATCH_ID_REQUIRED', 'matchId is required');
      if (String(effectivePayload.resultMode ?? '') !== 'paper_import') {
        throw new GoV2Error(
          422,
          'PAPER_IMPORT_MODE_REQUIRED',
          'Direct result entry is reserved for a paper_import of an unfinished played match',
        );
      }
      if (command.reasonCode !== 'paper_result_import') {
        throw new GoV2Error(
          422,
          'PAPER_IMPORT_REASON_REQUIRED',
          'A paper result import must use reasonCode=paper_result_import',
        );
      }
      const resultKind = String(effectivePayload.resultKind ?? '');
      if (resultKind !== 'played') {
        throw new GoV2Error(
          422,
          'INCIDENT_WORKFLOW_REQUIRED',
          `${resultKind || 'missing result kind'} requires incident preview/commit because advancement may be null or policy-dependent`,
        );
      }
      const prepared = await preparePlayedResultPayload(client, {
        tournamentId,
        matchId: entityId,
        payload: effectivePayload,
      });
      if (Number(prepared.payload.previousResultRevisionNo ?? 0) > 0) {
        throw new GoV2Error(
          409,
          'INCIDENT_PREVIEW_REQUIRED',
          'An existing result can only be corrected through incident preview/commit',
          prepared.impact as unknown as Record<string, unknown>,
        );
      }
      if (!['scheduled', 'locked'].includes(String(prepared.payload.matchScheduleState ?? ''))) {
        throw new GoV2Error(
          409,
          'PAPER_IMPORT_MATCH_NOT_SCHEDULED',
          'A paper result can only be imported for a match in the active scheduled lifecycle',
        );
      }
      if (!['pending', 'ready', 'live', 'paused'].includes(String(prepared.payload.matchPlayState ?? ''))) {
        throw new GoV2Error(
          409,
          'PAPER_IMPORT_MATCH_STATE_FORBIDDEN',
          `A paper result cannot be imported from ${String(prepared.payload.matchPlayState ?? 'unknown')}`,
        );
      }
      const actualStartedAtMs = Date.parse(String(effectivePayload.actualStartedAt ?? ''));
      const actualEndedAtMs = Date.parse(String(effectivePayload.actualEndedAt ?? ''));
      if (!Number.isFinite(actualStartedAtMs) || !Number.isFinite(actualEndedAtMs)) {
        throw new GoV2Error(
          422,
          'PAPER_IMPORT_ACTUAL_TIMING_REQUIRED',
          'actualStartedAt and actualEndedAt must be valid timestamps',
        );
      }
      if (actualEndedAtMs < actualStartedAtMs) {
        throw new GoV2Error(422, 'INVALID_ACTUAL_MATCH_WINDOW', 'actualEndedAt must not be before actualStartedAt');
      }
      if (actualEndedAtMs > Date.now() + 2 * 60_000) {
        throw new GoV2Error(
          422,
          'PAPER_IMPORT_FUTURE_RESULT_FORBIDDEN',
          'A paper result cannot finish more than two minutes in the future',
        );
      }
      effectivePayload = {
        ...prepared.payload,
        resultMode: 'paper_import',
        actualStartedAt: new Date(actualStartedAtMs).toISOString(),
        actualEndedAt: new Date(actualEndedAtMs).toISOString(),
        evidence: {
          ...asRecord(effectivePayload.evidence),
          source: 'paper_result_import',
        },
      };
      risk = prepared.impact.risk;
      if (risk !== 'green') {
        throw new GoV2Error(
          409,
          'INCIDENT_PREVIEW_REQUIRED',
          'A direct paper result cannot change downstream progress; use incident preview/commit',
          prepared.impact as unknown as Record<string, unknown>,
        );
      }
    }
    if (operation === 'incident.commit') {
      const triggerMatchId = assertGoV2Uuid(
        effectivePayload.triggerMatchId ?? effectivePayload.matchId,
        'triggerMatchId',
      );
      // Never trust the preview's downstream capability. Re-read the locked
      // qualification lineage and replay the proposed result against the
      // authoritative group ledger while the tournament aggregate is locked.
      const prepared = await prepareIncidentResultPayload(
        client,
        tournamentId,
        triggerMatchId,
        effectivePayload,
      );
      const freshImpact = await projectQualificationCorrection(
        client,
        tournamentId,
        triggerMatchId,
        prepared.payload,
        prepared.impact,
      );
      const correction = freshImpact.qualificationCorrection;
      const requestedResolution = String(
        command.payload.resolution ?? effectivePayload.resolution ?? '',
      ).trim();
      const resolution = requestedResolution || 'cascade_void_and_replay';
      if (!['cascade_void_and_replay', 'retain_progression_override'].includes(resolution)) {
        throw new GoV2Error(
          422,
          'INVALID_CASCADE_RESOLUTION',
          'Choose cascade_void_and_replay or retain_progression_override',
        );
      }
      if (correction) {
        if (!requestedResolution) {
          throw new GoV2Error(
            409,
            'QUALIFICATION_CORRECTION_RESOLUTION_REQUIRED',
            'Locked qualification correction requires an explicit retain or cascade resolution',
            { blockers: correction.blockers, capabilities: correction.capabilities },
          );
        }
        const previewCorrection = asRecord(asRecord(previewCandidate.impact).qualificationCorrection);
        const previewQualificationSnapshotId = String(previewCorrection.qualificationSnapshotId ?? '');
        const previewPipelineHash = String(asRecord(previewCorrection.after).pipelineHash ?? '');
        const freshPipelineHash = String(asRecord(correction.after).pipelineHash ?? '');
        const previewPlan = asRecord(previewCorrection.cascadePlan);
        const freshPlan = correction.cascadePlan;
        const previewSchedule = asRecord(previewCorrection.activeSchedule);
        const freshSchedule = correction.activeSchedule;
        if (
          (previewQualificationSnapshotId && previewQualificationSnapshotId !== correction.qualificationSnapshotId)
          || (previewPipelineHash && previewPipelineHash !== freshPipelineHash)
          || String(previewPlan.topologyShapeHash ?? '') !== String(freshPlan?.topologyShapeHash ?? '')
          || String(previewPlan.slotBindingHash ?? '') !== String(freshPlan?.slotBindingHash ?? '')
          || String(previewSchedule.scheduleVersionId ?? '') !== String(freshSchedule?.scheduleVersionId ?? '')
          || hashObject(asRecord(previewSchedule.sessionTournamentVersions))
            !== hashObject(freshSchedule?.sessionTournamentVersions ?? {})
        ) {
          throw new GoV2Error(
            409,
            'QUALIFICATION_CORRECTION_PREVIEW_STALE',
            'Standing or qualification inputs changed after preview; generate a fresh incident preview',
            {
              previewQualificationSnapshotId,
              qualificationSnapshotId: correction.qualificationSnapshotId,
              previewPipelineHash,
              pipelineHash: freshPipelineHash,
              previewScheduleVersionId: previewSchedule.scheduleVersionId ?? null,
              scheduleVersionId: freshSchedule?.scheduleVersionId ?? null,
            },
          );
        }
        if (resolution === 'cascade_void_and_replay') {
          if (correction.capabilities.cascadeVoidAndReplay.available !== true) {
            throw new GoV2Error(
              409,
              'QUALIFICATION_CASCADE_UNAVAILABLE',
              'The correction cannot be rebound onto the frozen bracket topology',
              { blockers: correction.blockers, capabilities: correction.capabilities },
            );
          }
          if (freshSchedule) {
            linkedScheduleStates = await lockLinkedScheduleStates(
              client,
              tournamentId,
              {
                sessionTournamentIds: freshSchedule.sessionTournamentIds,
                sessionTournamentVersions: freshSchedule.sessionTournamentVersions,
              },
              'incident.commit',
            );
          }
        }
        if (resolution === 'retain_progression_override' && actor.role !== 'admin') {
          throw new GoV2Error(
            403,
            'RETAIN_PROGRESSION_ADMIN_REQUIRED',
            'retain_progression_override is restricted to an administrator',
          );
        }
      }
      if (
        resolution === 'cascade_void_and_replay'
        && String(prepared.payload.resultKind) === 'voided'
      ) {
        throw new GoV2Error(
          409,
          'VOIDED_TRIGGER_REPLAY_RECOVERY_REQUIRED',
          'A voided trigger cannot be replayed without atomically creating a replacement trigger match and schedule',
          { triggerMatchId, resolution },
        );
      }
      effectivePayload = {
        ...prepared.payload,
        triggerMatchId,
        matchId: triggerMatchId,
        resolution,
        impact: freshImpact,
      };
      risk = freshImpact.risk;
    }
    if (operation === 'incident.commit' && risk === 'red') {
      const resolution = String(effectivePayload.resolution ?? '');
      if (!['cascade_void_and_replay', 'retain_progression_override'].includes(resolution)) {
        throw new GoV2Error(
          409,
          'CASCADE_RESOLUTION_REQUIRED',
          'A red incident requires an explicit cascade_void_and_replay or retain_progression_override resolution',
        );
      }
    }
    if (risk === 'red') {
      if (!preview || !command.redApprovalId) {
        throw new GoV2Error(
          409,
          'SECOND_APPROVAL_REQUIRED',
          'A red operation requires approval from a different administrator',
        );
      }
      await consumeGoV2RedApproval(client, {
        tournamentId,
        previewId: preview.id,
        approvalId: assertGoV2Uuid(command.redApprovalId, 'redApprovalId'),
        requesterId: actor.id,
      });
      if (command.confirmRed !== true) {
        throw new GoV2Error(409, 'RED_CONFIRMATION_REQUIRED', 'This operation affects live/final matches; set confirmRed=true');
      }
    }
    const nextState = await advanceAggregateVersion(
      client,
      tournamentId,
      lifecycleForOperation(operation, state.lifecycleState),
    );
    const linkedNextStates: Array<{ tournamentId: string; aggregateVersion: number }> = [];
    for (const linked of linkedScheduleStates) {
      const linkedNext = await advanceAggregateVersion(
        client,
        linked.tournamentId,
        operation === 'incident.commit' || operation === 'mutation.undo.commit'
          ? linked.state.lifecycleState
          : lifecycleForOperation(operation, linked.state.lifecycleState),
      );
      linkedNextStates.push({
        tournamentId: linked.tournamentId,
        aggregateVersion: linkedNext.aggregateVersion,
      });
    }
    const appliedDomainResult = await applyDomainOperation(client, {
      tournamentId,
      operation,
      command,
      actor,
      inputHash: hash,
      aggregateVersion: nextState.aggregateVersion,
      effectivePayload,
      entityId,
      previewId: preview?.id,
      risk,
    });
    const progress = PROGRESS_RECONCILIATION_OPERATIONS.has(operation)
      ? await reconcileGoV2TournamentProgress(client, tournamentId)
      : null;
    const finalPlacements = progress?.lifecycleState === 'finished'
      ? await persistGoV2FinalPlacementSnapshot(client, {
          tournamentId,
          aggregateVersion: nextState.aggregateVersion,
          actorId: actor.id,
        })
      : null;
    const domainResult = progress
      ? { ...appliedDomainResult, progress, finalPlacements }
      : appliedDomainResult;
    if (preview) await consumeOperationPreview(client, preview.id);
    const operationId = await appendAuditEvent(client, {
      tournamentId,
      aggregateVersion: nextState.aggregateVersion,
      eventType: operation,
      entityType: entityId
        ? operation === 'match.result.revise'
          || operation === 'match.paper_import.commit'
          || operation === 'match.finish.accept'
          || operation === 'match.finish.reject'
          ? 'match'
          : operation === 'roster.replacement.commit'
              || operation === 'reserve.promotion.commit'
              || operation === 'entry.withdrawal.commit'
            ? 'entry'
            : operation === 'stage.rules.commit'
              ? 'stage'
            : 'mutation_batch'
        : undefined,
      entityId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote,
      actorId: actor.id,
      idempotencyKey: command.idempotencyKey,
      diffPayload: {
        risk,
        previewId: preview?.id ?? null,
        redApprovalId: risk === 'red' ? command.redApprovalId ?? null : null,
        confirmedRed: risk === 'red' ? command.confirmRed === true : false,
        inputHash: hash,
        payload: effectivePayload,
        result: domainResult,
      },
    });
    for (const linked of linkedNextStates) {
      await appendAuditEvent(client, {
        tournamentId: linked.tournamentId,
        aggregateVersion: linked.aggregateVersion,
        eventType: operation,
        reasonCode: command.reasonCode,
        reasonNote: command.reasonNote,
        actorId: actor.id,
        idempotencyKey: `linked-${hashObject({
          rootIdempotencyKey: command.idempotencyKey,
          tournamentId: linked.tournamentId,
        })}`,
        diffPayload: {
          linkedScheduleCommandTournamentId: tournamentId,
          inputHash: hash,
          result: domainResult,
        },
      });
    }
    if (PUBLIC_NOTIFICATION_OPERATIONS.has(operation)) {
      await enqueueNotificationOutbox(client, {
        tournamentId,
        aggregateVersion: nextState.aggregateVersion,
        eventType: operation,
        payload: { operationId, operation, result: domainResult },
      });
      for (const linked of linkedNextStates) {
        await enqueueNotificationOutbox(client, {
          tournamentId: linked.tournamentId,
          aggregateVersion: linked.aggregateVersion,
          eventType: operation,
          payload: {
            operationId,
            operation,
            linkedScheduleCommandTournamentId: tournamentId,
            result: domainResult,
          },
        });
      }
    }
    const response: GoV2CommitResponse = {
      operationId,
      operation,
      aggregateVersion: nextState.aggregateVersion,
      previewId: preview?.id,
      replayed: false,
      commandId: command.commandId,
      requestHash: hash,
      deviceId: command.deviceId,
      result: domainResult,
    };
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.idempotencyKey,
      operationKind: operation,
      expectedVersion: command.expectedVersion,
      resultingVersion: nextState.aggregateVersion,
      requestHash: hash,
      responsePayload: response as unknown as Record<string, unknown>,
      actorId: actor.id,
      deviceId: command.deviceId,
      actorRole: actor.role,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}

export function goV2ErrorResponse(error: unknown, context: string): Response {
  if (error instanceof GoV2Error) {
    return Response.json(
      { error: error.message, code: error.code, details: error.details ?? null },
      { status: error.status },
    );
  }
  const pgCode = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : '';
  if (pgCode === '42P01' || pgCode === '42703') {
    return Response.json(
      { error: 'Tournament V2 database schema is not installed', code: 'SCHEMA_NOT_READY' },
      { status: 503 },
    );
  }
  console.error(`[go-v2] ${context}:`, error);
  return Response.json({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 });
}
