import { createHash } from 'crypto';

import type { PoolClient, QueryResultRow } from 'pg';

import { getPool } from '@/lib/db';
import type {
  CompetitionTierPipelineDto,
  CompetitionPoolFormat,
  LockedCompetitionPool,
  LockedModifiedPool4,
  LockedRoundRobinPool,
  ModifiedPoolStandingEntry,
} from './competition';
import { persistClassificationFinalPlacementSnapshot } from './classification-persistence';
import {
  completeIncompleteMatchScore,
  getTournamentFormatTemplateV2,
  isTerminalSetScore,
  materializeTournamentFormatTemplateV2,
  rankLivePoolStandings,
  rankPoolStandings,
  resolveCompleteBracketPlacements,
  SportsDomainError,
  toPoolStandingInputsDto,
} from './core';
import type {
  BracketMatch,
  BracketTopology,
  ChampionSource,
  PoolStandingEntryInput,
  MatchRule,
  SlotSource,
  StandingContribution,
  TierName,
} from './core';
import {
  GO_V2_DEFAULT_RATING_POLICY,
  mergeGoV2TierBracketPlacements,
  type GoV2CompletedTierBracket,
  type GoV2FinalPlacementLineupSnapshot,
  type GoV2FinalPlacementSourceKind,
  type GoV2PersistedFinalPlacementRow,
} from './final-placements';
import {
  assertGoV2Uuid,
  GoV2Error,
  type GoV2LiveStandingTable,
  type GoV2LifecycleState,
  type GoV2OperationKind,
  type GoV2Risk,
  type GoV2StructureResponse,
} from './contracts';
import type { GoV2CourtPolicyExceptionBinding } from './court-policy-exceptions';

export interface GoV2StateRow {
  tournamentId: string;
  aggregateVersion: number;
  lifecycleState: GoV2LifecycleState;
  activeStageSnapshotId: string | null;
  activeScheduleVersionId: string | null;
  metadata: Record<string, unknown>;
}

export interface GoV2CommandReceipt {
  operationKind: string;
  requestHash: string;
  responsePayload: Record<string, unknown>;
  resultingVersion: number;
}

export interface GoV2PreviewRow {
  id: string;
  operationKind: string;
  aggregateVersion: number;
  inputHash: string;
  risk: GoV2Risk;
  result: Record<string, unknown>;
  expiresAt: string;
  consumedAt: string | null;
}

export interface GoV2ImpactPreview {
  triggerMatchId: string;
  risk: GoV2Risk;
  affectedMatches: Array<{
    matchId: string;
    playState: string;
    scheduleState: string;
    currentResultRevisionNo: number;
  }>;
  qualificationCorrection?: GoV2QualificationCorrectionContext;
}

export interface GoV2QualificationCorrectionBlocker {
  code: string;
  message: string;
  matchId?: string;
  stageId?: string;
  scheduleAssignmentId?: string;
  details?: Record<string, unknown>;
}

export interface GoV2QualificationCorrectionContext {
  groupStageId: string;
  standingSnapshotId: string | null;
  qualificationSnapshotId: string;
  rulesSnapshot: Record<string, unknown>;
  before: {
    standingRows: Array<Record<string, unknown>>;
    qualificationRows: Array<Record<string, unknown>>;
  };
  downstreamStages: Array<{
    stageId: string;
    stageKey: string;
    stageType: string;
    tier: string | null;
    status: string;
  }>;
  blockers: GoV2QualificationCorrectionBlocker[];
  capabilities: {
    cascadeVoidAndReplay: {
      available: boolean;
      requiresAtomicRematerialization: true;
      requiresAtomicScheduleReplan: boolean;
    };
    retainProgressionOverride: {
      available: true;
      requiredRole: 'admin';
      preservesBracketParticipants: true;
    };
  };
  activeSchedule: GoV2QualificationCascadeScheduleContext | null;
  after?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  cascadePlan?: GoV2QualificationCascadeTopologyPlan;
}

export interface GoV2QualificationCascadeScheduleAssignment {
  assignmentId: string;
  matchId: string;
  courtId: string;
  plannedStart: string;
  plannedEnd: string;
  liveEta: string | null;
  isLocked: boolean;
  lockReason: string | null;
  isConditional: boolean;
  referee: Record<string, unknown>;
}

export interface GoV2QualificationCascadeScheduleContext {
  scheduleVersionId: string;
  scheduleSessionId: string;
  scheduleHash: string | null;
  inputHash: string;
  sessionKey: string;
  label: string;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  freezeHorizonMinutes: number;
  timeQuantumMinutes: number;
  refereeMode: string;
  sessionTournamentIds: string[];
  sessionTournamentVersions: Record<string, number>;
  courts: Array<{
    id: string;
    courtNo: number;
    label: string;
    availableWindows: Array<Record<string, unknown>>;
  }>;
  assignments: GoV2QualificationCascadeScheduleAssignment[];
}

export interface GoV2QualificationCascadeTopologyPlan {
  topologyShapeHash: string;
  slotBindingHash: string;
  stages: Array<{
    stageId: string;
    stageKey: string;
    tier: string;
    topologyHash: string;
    priorTopologyHash: string | null;
    participantSeeds: Array<{ entryId: string; seed: number }>;
  }>;
  slotChanges: Array<{
    stageId: string;
    matchId: string;
    matchKey: string;
    slotNo: number;
    priorEntryId: string | null;
    nextEntryId: string;
  }>;
  affectedMatchIds: string[];
}

export interface CompetitionResultOverride {
  matchId: string;
  resultRevisionToken: string;
  resultKind: string;
  playState: 'final' | 'voided';
  winnerEntryId: string | null;
  loserEntryId: string | null;
  standingContributions: Array<Record<string, unknown>>;
}

export interface CompetitionTierTargetStage {
  tier: TierName;
  stageKey: string;
  stageOrder: number;
  stageType: 'single_elimination' | 'double_elimination';
  matchRule: unknown;
  configuration: Record<string, unknown>;
}

export interface CompetitionTierSource {
  groupStageId: string;
  format: CompetitionPoolFormat;
  pools: LockedCompetitionPool[];
  formatSnapshot: Record<string, unknown>;
  rankingRulesSnapshot: Record<string, unknown>;
  targetStages: Partial<Record<TierName, CompetitionTierTargetStage>>;
  resultRevisionIds: string[];
  excludedEntryIds?: string[];
}

export interface CompetitionTierSourceRows {
  groupStage: Record<string, unknown>;
  assignments: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
  targetStages: Array<Record<string, unknown>>;
}

export interface LiveStandingSourceRows {
  stages: Array<Record<string, unknown>>;
  pools: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
}

export interface GoV2StageProgressMatch {
  matchId: string;
  playState: string;
  currentResultRevisionNo: number;
  isConditional: boolean;
  conditionState: string;
  metadata: Record<string, unknown>;
}

export interface GoV2StageProgressSummary {
  stageId: string;
  stageKey: string;
  stageType: string;
  previousStatus: string;
  status: string;
  matchCount: number;
  requiredMatchCount: number;
  completedRequiredMatchCount: number;
  pendingRequiredMatchIds: string[];
  complete: boolean;
  hasStarted: boolean;
}

export interface GoV2TournamentProgressSummary {
  previousLifecycleState: GoV2LifecycleState;
  lifecycleState: GoV2LifecycleState;
  lifecycleChanged: boolean;
  reopened: boolean;
  hasMatchBearingPlayoff: boolean;
  allMatchBearingStagesComplete: boolean;
  stages: GoV2StageProgressSummary[];
}

export interface GoV2FinalPlacementSnapshotRecord {
  snapshotId: string;
  aggregateVersion: number;
  sourceKind: GoV2FinalPlacementSourceKind;
  sourceResultsHash: string;
  standingsHash: string;
  sourceStageIds: string[];
  sourceResultRevisionIds: string[];
  sourceRevisionLineage: Array<Record<string, unknown>>;
  ratingPolicySnapshot: typeof GO_V2_DEFAULT_RATING_POLICY;
  createdBy: string;
  createdAt: string;
  created: boolean;
  rows: GoV2PersistedFinalPlacementRow[];
}

export const GO_V2_WITHDRAWAL_CAUSES = [
  'injury_before_match',
  'medical_withdrawal',
  'no_show',
  'refusal_to_play',
  'game_disqualification_future',
  'anti_doping_disqualification',
  'administrative_withdrawal',
] as const;

export type GoV2WithdrawalCause = typeof GO_V2_WITHDRAWAL_CAUSES[number];

export interface GoV2WithdrawalCauseRule {
  cause: GoV2WithdrawalCause;
  registrationState: 'withdrawn' | 'disqualified';
  fivbLoserMatchPoints: 0 | 1;
  resultKind: 'walkover' | 'forfeit';
}

/**
 * Sports semantics attached to a withdrawal reason. The caller still decides
 * whether the FIVB profile applies; this allowlist prevents arbitrary client
 * strings from silently changing standing contributions.
 */
export function resolveGoV2WithdrawalCauseRule(cause: unknown): GoV2WithdrawalCauseRule {
  const normalized = String(cause ?? '').trim();
  if (!(GO_V2_WITHDRAWAL_CAUSES as readonly string[]).includes(normalized)) {
    throw new GoV2Error(
      422,
      'INVALID_WITHDRAWAL_CAUSE',
      'withdrawalCause must be one of the supported Tournament Engine V2 causes',
      { allowedCauses: [...GO_V2_WITHDRAWAL_CAUSES] },
    );
  }
  const typedCause = normalized as GoV2WithdrawalCause;
  return {
    cause: typedCause,
    registrationState: ['game_disqualification_future', 'anti_doping_disqualification'].includes(typedCause)
      ? 'disqualified'
      : 'withdrawn',
    fivbLoserMatchPoints: ['injury_before_match', 'medical_withdrawal'].includes(typedCause) ? 1 : 0,
    resultKind: typedCause === 'no_show' ? 'walkover' : 'forfeit',
  };
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new GoV2Error(500, 'INVALID_DATABASE_VERSION', 'Database returned an unsafe aggregate version');
  }
  return parsed;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Pair rating is always server-derived from the two locked member ratings. */
export function deriveGoV2PairRating(entry: unknown): number {
  const members = Array.isArray(record(entry).members) ? record(entry).members as unknown[] : [];
  if (members.length !== 2) {
    throw new GoV2Error(422, 'INVALID_PAIR_ROSTER', 'A Tournament Engine V2 pair requires exactly two members');
  }
  const ratings = members.map((member, index) => {
    const rating = Number(record(member).ratingValue);
    if (!Number.isSafeInteger(rating)) {
      throw new GoV2Error(
        422,
        'INVALID_MEMBER_RATING',
        `Pair member ${index + 1} rating must be a safe integer`,
      );
    }
    return rating;
  });
  const sum = ratings[0] + ratings[1];
  if (!Number.isSafeInteger(sum)) {
    throw new GoV2Error(422, 'INVALID_ENTRY_RATING', 'Pair rating sum must be a safe integer');
  }
  return sum;
}

function goV2RosterMemberIdentity(member: unknown): string {
  const value = record(member);
  const playerId = String(value.playerId ?? value.player_id ?? '').trim().toLowerCase();
  if (playerId) return `id:${playerId}`;
  const displayName = String(value.displayName ?? value.display_name ?? '').trim().toLocaleLowerCase('ru-RU');
  return displayName ? `name:${displayName}` : '';
}

export function sharesGoV2OriginalPairMember(baseline: unknown[], candidate: unknown[]): boolean {
  const baselineIdentities = new Set(baseline.map(goV2RosterMemberIdentity).filter(Boolean));
  return candidate.some((member) => baselineIdentities.has(goV2RosterMemberIdentity(member)));
}

function canonicalRepositoryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalRepositoryValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalRepositoryValue(entry)]),
    );
  }
  return value;
}

function stableRepositoryHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalRepositoryValue(value))).digest('hex');
}

export interface GoV2DrawUnlockSeedInput {
  entryId: string;
  initialSeed: number;
  ratingSnapshotValue: number;
  confirmedAt: string | Date;
}

export function parseGoV2DrawUnlockReseed(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') {
    throw new GoV2Error(422, 'DRAW_UNLOCK_RESEED_INVALID', 'reseed must be a boolean');
  }
  return value;
}

/** Deterministic seed plan used by draw-unlock preview and commit. */
export function planGoV2DrawUnlockSeeds(
  entries: readonly GoV2DrawUnlockSeedInput[],
  reseed: boolean,
): Array<{ entryId: string; seed: number }> {
  const normalized = entries.map((entry) => {
    const entryId = String(entry.entryId ?? '').trim();
    const initialSeed = Number(entry.initialSeed);
    const ratingSnapshotValue = Number(entry.ratingSnapshotValue);
    const confirmedAtMs = new Date(entry.confirmedAt).getTime();
    if (
      !entryId
      || !Number.isSafeInteger(initialSeed)
      || initialSeed < 1
      || !Number.isSafeInteger(ratingSnapshotValue)
      || !Number.isFinite(confirmedAtMs)
    ) {
      throw new GoV2Error(409, 'DRAW_UNLOCK_SEED_INPUT_INVALID', 'Confirmed seed input is incomplete or invalid', {
        entryId,
        initialSeed: entry.initialSeed,
        ratingSnapshotValue: entry.ratingSnapshotValue,
        confirmedAt: entry.confirmedAt,
      });
    }
    return { entryId, initialSeed, ratingSnapshotValue, confirmedAtMs };
  });
  if (new Set(normalized.map((entry) => entry.entryId)).size !== normalized.length) {
    throw new GoV2Error(409, 'DRAW_UNLOCK_ENTRY_SET_INVALID', 'Confirmed entries must be unique before reseeding');
  }
  if (!reseed) {
    if (new Set(normalized.map((entry) => entry.initialSeed)).size !== normalized.length) {
      throw new GoV2Error(409, 'DRAW_UNLOCK_SEED_INPUT_INVALID', 'Current confirmed seeds are not unique');
    }
    return normalized
      .map((entry) => ({ entryId: entry.entryId, seed: entry.initialSeed }))
      .sort((left, right) => left.seed - right.seed || stableTextCompare(left.entryId, right.entryId));
  }
  return normalized
    .sort((left, right) => (
      right.ratingSnapshotValue - left.ratingSnapshotValue
      || left.confirmedAtMs - right.confirmedAtMs
      || stableTextCompare(left.entryId, right.entryId)
    ))
    .map((entry, index) => ({ entryId: entry.entryId, seed: index + 1 }));
}

function matchRuleJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.trim()) return { preset: value.trim() };
  return record(value);
}

function mapState(row: QueryResultRow): GoV2StateRow {
  return {
    tournamentId: String(row.tournament_id),
    aggregateVersion: numeric(row.aggregate_version),
    lifecycleState: String(row.lifecycle_state) as GoV2LifecycleState,
    activeStageSnapshotId: row.active_stage_snapshot_id ? String(row.active_stage_snapshot_id) : null,
    activeScheduleVersionId: row.active_schedule_version_id ? String(row.active_schedule_version_id) : null,
    metadata: record(row.metadata),
  };
}

async function assertTournamentExists(client: PoolClient, tournamentId: string): Promise<void> {
  const found = await client.query(`SELECT 1 FROM tournaments WHERE id = $1`, [tournamentId]);
  if (!found.rowCount) {
    throw new GoV2Error(404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
  }
}

export async function withGoV2Transaction<T>(
  tournamentId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`go-v2:${tournamentId}`]);
    await assertTournamentExists(client, tournamentId);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureGoV2StateForUpdate(
  client: PoolClient,
  tournamentId: string,
): Promise<GoV2StateRow> {
  const enabled = await client.query(
    `SELECT COALESCE(go_engine_version, 1) AS go_engine_version
     FROM tournaments
     WHERE id = $1
     FOR UPDATE`,
    [tournamentId],
  );
  if (!enabled.rowCount || Number(enabled.rows[0].go_engine_version) !== 2) {
    throw new GoV2Error(404, 'GO_V2_NOT_ENABLED', 'Tournament Engine V2 is not enabled for this tournament');
  }
  await client.query(
    `INSERT INTO go_v2_tournament_state (tournament_id, engine_version)
     VALUES ($1, 2)
     ON CONFLICT (tournament_id) DO NOTHING`,
    [tournamentId],
  );
  const result = await client.query(
    `SELECT tournament_id, aggregate_version, lifecycle_state,
            active_stage_snapshot_id, active_schedule_version_id, metadata
     FROM go_v2_tournament_state
     WHERE tournament_id = $1
     FOR UPDATE`,
    [tournamentId],
  );
  if (!result.rowCount) {
    throw new GoV2Error(500, 'STATE_INITIALIZATION_FAILED', 'Could not initialize tournament V2 state');
  }
  return mapState(result.rows[0]);
}

export function assertExpectedVersion(state: GoV2StateRow, expectedVersion: number): void {
  if (state.aggregateVersion !== expectedVersion) {
    throw new GoV2Error(409, 'VERSION_CONFLICT', 'Tournament was changed by another operator', {
      expectedVersion,
      actualVersion: state.aggregateVersion,
    });
  }
}

export async function requireMutationReason(
  client: PoolClient,
  reasonCode: string,
  reasonNote?: string,
): Promise<void> {
  const result = await client.query(
    `SELECT requires_note
     FROM go_v2_mutation_reason_catalog
     WHERE code = $1 AND is_active = true`,
    [reasonCode],
  );
  if (!result.rowCount) {
    throw new GoV2Error(422, 'UNKNOWN_REASON_CODE', `Unknown or inactive reasonCode: ${reasonCode}`);
  }
  if (result.rows[0].requires_note === true && !String(reasonNote ?? '').trim()) {
    throw new GoV2Error(422, 'REASON_NOTE_REQUIRED', `reasonNote is required for ${reasonCode}`);
  }
}

export async function findCommandReceipt(
  client: PoolClient,
  tournamentId: string,
  idempotencyKey: string,
): Promise<GoV2CommandReceipt | null> {
  const result = await client.query(
    `SELECT operation_kind, request_hash, response_payload, resulting_version
     FROM go_v2_command_receipts
     WHERE tournament_id = $1 AND idempotency_key = $2`,
    [tournamentId, idempotencyKey],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    operationKind: String(row.operation_kind),
    requestHash: String(row.request_hash),
    responsePayload: record(row.response_payload),
    resultingVersion: numeric(row.resulting_version),
  };
}

export function assertReceiptMatches(
  receipt: GoV2CommandReceipt,
  operationKind: string,
  requestHash: string,
): void {
  if (receipt.operationKind !== operationKind || receipt.requestHash !== requestHash) {
    throw new GoV2Error(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'idempotencyKey was already used for a different request',
    );
  }
}

export async function saveCommandReceipt(
  client: PoolClient,
  input: {
    tournamentId: string;
    idempotencyKey: string;
    operationKind: string;
    expectedVersion: number;
    resultingVersion: number;
    requestHash: string;
    responsePayload: Record<string, unknown>;
    actorId: string;
    deviceId?: string;
    actorRole?: string;
    courtGrantId?: string | null;
    clientRequestHash?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO go_v2_command_receipts (
       tournament_id, idempotency_key, operation_kind, expected_version,
       resulting_version, request_hash, response_payload, actor_id,
       command_id, client_request_hash, device_id, actor_snapshot, court_grant_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13)`,
    [
      input.tournamentId,
      input.idempotencyKey,
      input.operationKind,
      input.expectedVersion,
      input.resultingVersion,
      input.requestHash,
      JSON.stringify(input.responsePayload),
      input.actorId,
      input.idempotencyKey,
      input.clientRequestHash ?? null,
      input.deviceId ?? 'legacy-admin-web',
      JSON.stringify({ id: input.actorId, role: input.actorRole ?? 'operator' }),
      input.courtGrantId ?? null,
    ],
  );
}

export async function createOperationPreview(
  client: PoolClient,
  input: {
    tournamentId: string;
    operationKind: GoV2OperationKind;
    aggregateVersion: number;
    inputHash: string;
    risk: GoV2Risk;
    payload: Record<string, unknown>;
    result: Record<string, unknown>;
    actorId: string;
  },
): Promise<GoV2PreviewRow> {
  // Previews are append-only once created. Retire an expired preview, or a
  // still-active preview that another operator is replacing, by using the
  // single permitted one-way transition. This keeps approvals bound to the
  // exact preview row they reviewed instead of rewriting that row in place.
  await client.query(
    `UPDATE go_v2_operation_previews
     SET consumed_at = now()
     WHERE tournament_id = $1
       AND operation_kind = $2
       AND input_hash = $3
       AND aggregate_version = $4
       AND consumed_at IS NULL
       AND (expires_at <= now() OR created_by <> $5)`,
    [
      input.tournamentId,
      input.operationKind,
      input.inputHash,
      input.aggregateVersion,
      input.actorId,
    ],
  );
  const inserted = await client.query(
    `INSERT INTO go_v2_operation_previews (
       tournament_id, operation_kind, aggregate_version, input_hash, risk,
       payload, result, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      ON CONFLICT (tournament_id, operation_kind, input_hash, aggregate_version)
        WHERE consumed_at IS NULL
      DO NOTHING
     RETURNING id, operation_kind, aggregate_version, input_hash, risk,
               result, expires_at, consumed_at`,
    [
      input.tournamentId,
      input.operationKind,
      input.aggregateVersion,
      input.inputHash,
      input.risk,
      JSON.stringify(input.payload),
      JSON.stringify(input.result),
      input.actorId,
    ],
  );
  if (inserted.rowCount) return mapPreview(inserted.rows[0]);

  const existing = await client.query(
    `SELECT id, operation_kind, aggregate_version, input_hash, risk,
            result, expires_at, consumed_at
     FROM go_v2_operation_previews
     WHERE tournament_id = $1
       AND operation_kind = $2
       AND input_hash = $3
       AND aggregate_version = $4
       AND consumed_at IS NULL`,
    [input.tournamentId, input.operationKind, input.inputHash, input.aggregateVersion],
  );
  if (!existing.rowCount) {
    throw new GoV2Error(
      409,
      'PREVIEW_APPEND_CONFLICT',
      'The active operation preview changed concurrently; generate a new preview',
    );
  }
  return mapPreview(existing.rows[0]);
}

function mapPreview(row: QueryResultRow): GoV2PreviewRow {
  return {
    id: String(row.id),
    operationKind: String(row.operation_kind),
    aggregateVersion: numeric(row.aggregate_version),
    inputHash: String(row.input_hash),
    risk: String(row.risk) as GoV2Risk,
    result: record(row.result),
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : null,
  };
}

export async function getOperationPreviewForUpdate(
  client: PoolClient,
  tournamentId: string,
  previewId: string,
  expectedKind: GoV2OperationKind,
  aggregateVersion: number,
): Promise<GoV2PreviewRow> {
  const result = await client.query(
    `SELECT id, operation_kind, aggregate_version, input_hash, risk,
            result, expires_at, consumed_at
     FROM go_v2_operation_previews
     WHERE id = $1 AND tournament_id = $2
     FOR UPDATE`,
    [previewId, tournamentId],
  );
  if (!result.rowCount) {
    throw new GoV2Error(404, 'PREVIEW_NOT_FOUND', 'Preview not found');
  }
  const preview = mapPreview(result.rows[0]);
  if (preview.operationKind !== expectedKind) {
    throw new GoV2Error(409, 'PREVIEW_OPERATION_MISMATCH', 'Preview belongs to another operation');
  }
  if (preview.aggregateVersion !== aggregateVersion) {
    throw new GoV2Error(409, 'PREVIEW_STALE', 'Preview is based on an older tournament version');
  }
  if (preview.consumedAt) {
    throw new GoV2Error(409, 'PREVIEW_ALREADY_CONSUMED', 'Preview was already committed');
  }
  if (Date.parse(preview.expiresAt) <= Date.now()) {
    throw new GoV2Error(410, 'PREVIEW_EXPIRED', 'Preview has expired');
  }
  return preview;
}

export async function consumeOperationPreview(client: PoolClient, previewId: string): Promise<void> {
  await client.query(
    `UPDATE go_v2_operation_previews
     SET consumed_at = now()
     WHERE id = $1 AND consumed_at IS NULL`,
    [previewId],
  );
}

export async function advanceAggregateVersion(
  client: PoolClient,
  tournamentId: string,
  lifecycleState?: GoV2LifecycleState,
): Promise<GoV2StateRow> {
  const result = await client.query(
    `UPDATE go_v2_tournament_state
     SET aggregate_version = aggregate_version + 1,
         lifecycle_state = COALESCE($2, lifecycle_state),
         updated_at = now()
     WHERE tournament_id = $1
     RETURNING tournament_id, aggregate_version, lifecycle_state,
               active_stage_snapshot_id, active_schedule_version_id, metadata`,
    [tournamentId, lifecycleState ?? null],
  );
  if (!result.rowCount) {
    throw new GoV2Error(500, 'STATE_UPDATE_FAILED', 'Could not advance tournament version');
  }
  return mapState(result.rows[0]);
}

function hasOwnMetadataKey(metadata: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(metadata, key);
}

/**
 * Derives a stage status from persisted match facts. A real result is complete
 * only while its active result pointer is present. Runtime BYEs are the sole
 * result-less finals: their explicit metadata marker makes them complete
 * without inventing a result revision. A conditional reset whose condition is
 * false is outside the required ledger and therefore cannot hold the stage
 * open.
 */
export function deriveGoV2StageProgress(input: {
  stageId: string;
  stageKey: string;
  stageType: string;
  status: string;
  matches: GoV2StageProgressMatch[];
}): GoV2StageProgressSummary {
  const requiredMatches = input.matches.filter((match) => !(
    match.isConditional && match.conditionState === 'false'
  ));
  const completedRequiredMatches = requiredMatches.filter((match) => {
    const finalState = match.playState === 'final' || match.playState === 'voided';
    if (!finalState) return false;
    if (match.currentResultRevisionNo > 0) return true;
    return hasOwnMetadataKey(match.metadata, 'byeAutoAdvance');
  });
  const completedIds = new Set(completedRequiredMatches.map((match) => match.matchId));
  const pendingRequiredMatchIds = requiredMatches
    .filter((match) => !completedIds.has(match.matchId))
    .map((match) => match.matchId)
    .sort(stableTextCompare);
  const hasStarted = requiredMatches.some((match) => (
    match.currentResultRevisionNo > 0
    || match.playState === 'live'
    || ((match.playState === 'final' || match.playState === 'voided')
      && hasOwnMetadataKey(match.metadata, 'byeAutoAdvance'))
  ));
  const complete = input.matches.length > 0 && pendingRequiredMatchIds.length === 0;
  let status = input.status;
  if (['locked', 'live', 'finished'].includes(input.status)) {
    if (complete) status = 'finished';
    else if (hasStarted || input.status === 'live' || input.status === 'finished') status = 'live';
    else status = 'locked';
  }
  return {
    stageId: input.stageId,
    stageKey: input.stageKey,
    stageType: input.stageType,
    previousStatus: input.status,
    status,
    matchCount: input.matches.length,
    requiredMatchCount: requiredMatches.length,
    completedRequiredMatchCount: completedRequiredMatches.length,
    pendingRequiredMatchIds,
    complete,
    hasStarted,
  };
}

/**
 * Reconciles stage and tournament lifecycle inside the caller's transaction.
 * `finished` is the V2 storage/API name for a completed tournament. The
 * transition is reversible: an approved cascade or compensating undo that
 * reopens a required match moves `finished` back to `live`.
 */
export async function reconcileGoV2TournamentProgress(
  client: PoolClient,
  tournamentId: string,
): Promise<GoV2TournamentProgressSummary> {
  const stateResult = await client.query(
    `SELECT lifecycle_state
     FROM go_v2_tournament_state
     WHERE tournament_id = $1
     FOR UPDATE`,
    [tournamentId],
  );
  if (!stateResult.rowCount) {
    throw new GoV2Error(500, 'STATE_NOT_FOUND', 'Tournament V2 state is missing');
  }
  const previousLifecycleState = String(stateResult.rows[0].lifecycle_state) as GoV2LifecycleState;
  const stagesResult = await client.query(
    `SELECT id::text AS stage_id, stage_key, stage_type, status
     FROM go_v2_stages
     WHERE tournament_id = $1
     ORDER BY stage_order, tier NULLS FIRST, id
     FOR UPDATE`,
    [tournamentId],
  );
  const matchesResult = await client.query(
    `SELECT id::text AS match_id, stage_id::text, play_state,
            current_result_revision_no, is_conditional, condition_state, metadata
     FROM go_v2_matches
     WHERE tournament_id = $1
     ORDER BY stage_id, round_no, position, id`,
    [tournamentId],
  );
  const matchesByStage = new Map<string, GoV2StageProgressMatch[]>();
  for (const row of matchesResult.rows) {
    const stageId = String(row.stage_id);
    const matches = matchesByStage.get(stageId) ?? [];
    matches.push({
      matchId: String(row.match_id),
      playState: String(row.play_state),
      currentResultRevisionNo: numeric(row.current_result_revision_no),
      isConditional: row.is_conditional === true,
      conditionState: String(row.condition_state),
      metadata: record(row.metadata),
    });
    matchesByStage.set(stageId, matches);
  }
  const stages = stagesResult.rows.map((row) => deriveGoV2StageProgress({
    stageId: String(row.stage_id),
    stageKey: String(row.stage_key),
    stageType: String(row.stage_type),
    status: String(row.status),
    matches: matchesByStage.get(String(row.stage_id)) ?? [],
  }));
  for (const stage of stages) {
    if (stage.status === stage.previousStatus) continue;
    await client.query(
      `UPDATE go_v2_stages
       SET status = $2, version = version + 1, updated_at = now()
       WHERE id = $1`,
      [stage.stageId, stage.status],
    );
  }
  const matchBearingStages = stages.filter((stage) => stage.matchCount > 0);
  const hasMatchBearingPlayoff = matchBearingStages.some((stage) => (
    stage.stageType === 'single_elimination'
    || stage.stageType === 'double_elimination'
    || stage.stageType === 'placement_match'
  ));
  const allMatchBearingStagesComplete = matchBearingStages.length > 0
    && matchBearingStages.every((stage) => stage.complete);
  let lifecycleState = previousLifecycleState;
  if (
    (previousLifecycleState === 'live' || previousLifecycleState === 'finished')
    && hasMatchBearingPlayoff
    && allMatchBearingStagesComplete
  ) {
    lifecycleState = 'finished';
  } else if (previousLifecycleState === 'finished' && !allMatchBearingStagesComplete) {
    lifecycleState = 'live';
  }
  if (lifecycleState !== previousLifecycleState) {
    await client.query(
      `UPDATE go_v2_tournament_state
       SET lifecycle_state = $2, updated_at = now()
       WHERE tournament_id = $1`,
      [tournamentId, lifecycleState],
    );
  }
  return {
    previousLifecycleState,
    lifecycleState,
    lifecycleChanged: lifecycleState !== previousLifecycleState,
    reopened: previousLifecycleState === 'finished' && lifecycleState === 'live',
    hasMatchBearingPlayoff,
    allMatchBearingStagesComplete,
    stages,
  };
}

function finalPlacementInteger(value: unknown, field: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new GoV2Error(500, 'INVALID_FINAL_PLACEMENT_DATA', `Stored ${field} is invalid`, {
      field,
      value,
    });
  }
  return parsed;
}

function finalPlacementTier(value: unknown): TierName {
  if (value === 'medium' || value === 'light') return value;
  if (value === 'hard' || value == null || value === '') return 'hard';
  throw new GoV2Error(409, 'INVALID_FINAL_PLACEMENT_TIER', 'A playoff stage has an unsupported tier', {
    tier: value,
  });
}

function finalPlacementSourceKind(value: unknown): GoV2FinalPlacementSourceKind {
  if (value === 'bracket_v1' || value === 'classification_v1') return value;
  throw new GoV2Error(
    500,
    'FINAL_PLACEMENT_SOURCE_KIND_INVALID',
    'Final-placement snapshot has an unsupported source strategy',
    { sourceKind: value },
  );
}

function finalPlacementBasis(value: unknown): GoV2PersistedFinalPlacementRow['basis'] {
  const basis = String(value ?? '');
  if (
    basis === 'championship_match'
    || basis === 'placement_match'
    || basis === 'elimination_round'
    || basis === 'classification_standings'
    || basis === 'initial_seed_tiebreak'
  ) return basis;
  throw new GoV2Error(500, 'INVALID_FINAL_PLACEMENT_BASIS', 'Stored final-placement basis is invalid', {
    basis,
  });
}

function finalPlacementCapacity(value: unknown, participantCount: number): 2 | 4 | 8 | 16 | 32 | 64 {
  const stored = Number(value);
  if ([2, 4, 8, 16, 32, 64].includes(stored)) return stored as 2 | 4 | 8 | 16 | 32 | 64;
  let capacity = 2;
  while (capacity < participantCount) capacity *= 2;
  if (![2, 4, 8, 16, 32, 64].includes(capacity)) {
    throw new GoV2Error(409, 'INVALID_FINAL_PLACEMENT_CAPACITY', 'Bracket capacity cannot be reconstructed', {
      participantCount,
    });
  }
  return capacity as 2 | 4 | 8 | 16 | 32 | 64;
}

export function orderFinalPlacementMatchesTopologically(matches: readonly BracketMatch[]): BracketMatch[] {
  const matchById = new Map(matches.map((match) => [match.matchId, match]));
  if (matchById.size !== matches.length) {
    throw new GoV2Error(409, 'FINAL_PLACEMENT_DUPLICATE_MATCH', 'Bracket match IDs must be unique');
  }
  const phaseOrder: Record<BracketMatch['phase'], number> = {
    upper: 0,
    lower: 1,
    grand_final: 2,
    bronze: 3,
  };
  const stableMatchCompare = (left: BracketMatch, right: BracketMatch): number => (
    phaseOrder[left.phase] - phaseOrder[right.phase]
    || left.round - right.round
    || left.position - right.position
    || stableTextCompare(left.matchId, right.matchId)
  );
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(matches.map((match) => [match.matchId, 0]));
  for (const match of matches) {
    const dependencies = new Set(
      [match.sourceA, match.sourceB]
        .filter((source): source is Extract<SlotSource, { kind: 'MATCH_WINNER' | 'MATCH_LOSER' }> => (
          source.kind === 'MATCH_WINNER' || source.kind === 'MATCH_LOSER'
        ))
        .map((source) => source.matchId),
    );
    for (const dependencyId of dependencies) {
      if (!matchById.has(dependencyId)) {
        throw new GoV2Error(
          409,
          'FINAL_PLACEMENT_ROUTE_DEPENDENCY_MISSING',
          'Bracket route references a match outside its immutable stage topology',
          { matchId: match.matchId, dependencyMatchId: dependencyId },
        );
      }
      indegree.set(match.matchId, (indegree.get(match.matchId) ?? 0) + 1);
      outgoing.set(dependencyId, [...(outgoing.get(dependencyId) ?? []), match.matchId]);
    }
  }
  const ready = matches.filter((match) => indegree.get(match.matchId) === 0).sort(stableMatchCompare);
  const ordered: BracketMatch[] = [];
  while (ready.length) {
    const current = ready.shift() as BracketMatch;
    ordered.push(current);
    for (const targetId of (outgoing.get(current.matchId) ?? []).sort(stableTextCompare)) {
      const remaining = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) {
        ready.push(matchById.get(targetId) as BracketMatch);
        ready.sort(stableMatchCompare);
      }
    }
  }
  if (ordered.length !== matches.length) {
    throw new GoV2Error(409, 'FINAL_PLACEMENT_ROUTE_CYCLE', 'Bracket route lineage contains a cycle', {
      unresolvedMatchIds: matches
        .filter((match) => !ordered.some((entry) => entry.matchId === match.matchId))
        .map((match) => match.matchId)
        .sort(stableTextCompare),
    });
  }
  return ordered;
}

function finalPlacementLineupFromJson(value: unknown): GoV2FinalPlacementLineupSnapshot {
  const lineup = record(value);
  const ratingEligibility = String(lineup.ratingEligibility ?? 'eligible');
  if (!['eligible', 'ineligible', 'profile_controlled'].includes(ratingEligibility)) {
    throw new GoV2Error(500, 'INVALID_FINAL_LINEUP_ELIGIBILITY', 'Stored lineup rating eligibility is invalid');
  }
  const members = Array.isArray(lineup.members) ? lineup.members.map((rawMember) => {
    const member = record(rawMember);
    return {
      memberOrder: finalPlacementInteger(member.memberOrder, 'lineup.memberOrder', 1),
      playerId: member.playerId ? String(member.playerId) : null,
      displayName: member.displayName == null ? null : String(member.displayName),
      ratingValue: finalPlacementInteger(member.ratingValue, 'lineup.ratingValue'),
    };
  }) : [];
  return {
    matchId: String(lineup.matchId ?? ''),
    resultRevisionId: String(lineup.resultRevisionId ?? ''),
    resultRevisionNo: finalPlacementInteger(lineup.resultRevisionNo, 'lineup.resultRevisionNo', 1),
    rosterRevisionId: String(lineup.rosterRevisionId ?? ''),
    ratingEligibility: ratingEligibility as GoV2FinalPlacementLineupSnapshot['ratingEligibility'],
    members,
  };
}

async function loadGoV2FinalPlacementSnapshotById(
  client: PoolClient,
  snapshotId: string,
  created = false,
): Promise<GoV2FinalPlacementSnapshotRecord> {
  const snapshot = await client.query(
    `SELECT id::text, aggregate_version, source_kind, source_results_hash,
            standings_hash, source_stage_ids::text[], source_result_revision_ids::text[],
            source_revision_lineage, rating_policy_snapshot, created_by, created_at
     FROM go_v2_final_placement_snapshots
     WHERE id = $1`,
    [snapshotId],
  );
  if (!snapshot.rowCount) {
    throw new GoV2Error(500, 'FINAL_PLACEMENT_SNAPSHOT_NOT_FOUND', 'Final-placement snapshot disappeared');
  }
  const rows = await client.query(
    `SELECT row.entry_id::text, row.source_stage_id::text, stage.stage_key,
            row.tier, row.tier_place, row.overall_place,
            row.sporting_tier_place_from, row.sporting_tier_place_to,
            row.sporting_overall_place_from, row.sporting_overall_place_to,
            row.initial_seed, row.games_played, row.losses,
            row.eliminated_by_match_id::text, row.basis, row.lineup_snapshot
     FROM go_v2_final_placement_rows row
     JOIN go_v2_stages stage ON stage.id = row.source_stage_id
     WHERE row.snapshot_id = $1
     ORDER BY row.overall_place`,
    [snapshotId],
  );
  const header = snapshot.rows[0];
  return {
    snapshotId: String(header.id),
    aggregateVersion: finalPlacementInteger(header.aggregate_version, 'aggregateVersion'),
    sourceKind: finalPlacementSourceKind(header.source_kind),
    sourceResultsHash: String(header.source_results_hash),
    standingsHash: String(header.standings_hash),
    sourceStageIds: Array.isArray(header.source_stage_ids) ? header.source_stage_ids.map(String) : [],
    sourceResultRevisionIds: Array.isArray(header.source_result_revision_ids)
      ? header.source_result_revision_ids.map(String)
      : [],
    sourceRevisionLineage: Array.isArray(header.source_revision_lineage)
      ? header.source_revision_lineage.map(record)
      : [],
    ratingPolicySnapshot: record(header.rating_policy_snapshot) as unknown as typeof GO_V2_DEFAULT_RATING_POLICY,
    createdBy: String(header.created_by),
    createdAt: new Date(header.created_at).toISOString(),
    created,
    rows: rows.rows.map((row) => ({
      entryId: String(row.entry_id),
      sourceStageId: String(row.source_stage_id),
      sourceStageKey: String(row.stage_key),
      tier: finalPlacementTier(row.tier),
      tierPlace: finalPlacementInteger(row.tier_place, 'tierPlace', 1),
      overallPlace: finalPlacementInteger(row.overall_place, 'overallPlace', 1),
      sportingTierPlaceRange: [
        finalPlacementInteger(row.sporting_tier_place_from, 'sportingTierPlaceFrom', 1),
        finalPlacementInteger(row.sporting_tier_place_to, 'sportingTierPlaceTo', 1),
      ] as const,
      sportingOverallPlaceRange: [
        finalPlacementInteger(row.sporting_overall_place_from, 'sportingOverallPlaceFrom', 1),
        finalPlacementInteger(row.sporting_overall_place_to, 'sportingOverallPlaceTo', 1),
      ] as const,
      initialSeed: finalPlacementInteger(row.initial_seed, 'initialSeed', 1),
      gamesPlayed: finalPlacementInteger(row.games_played, 'gamesPlayed'),
      losses: finalPlacementInteger(row.losses, 'losses'),
      eliminatedByMatchId: row.eliminated_by_match_id ? String(row.eliminated_by_match_id) : null,
      basis: finalPlacementBasis(row.basis),
      lineupSnapshot: finalPlacementLineupFromJson(row.lineup_snapshot),
    })),
  };
}

export async function loadLatestGoV2FinalPlacementSnapshot(
  client: PoolClient,
  tournamentId: string,
): Promise<GoV2FinalPlacementSnapshotRecord | null> {
  const result = await client.query(
    `SELECT id::text
     FROM go_v2_final_placement_snapshots
     WHERE tournament_id = $1
     ORDER BY aggregate_version DESC, created_at DESC, id DESC
     LIMIT 1`,
    [tournamentId],
  );
  return result.rowCount
    ? loadGoV2FinalPlacementSnapshotById(client, String(result.rows[0].id))
    : null;
}

/**
 * Reconstructs persisted SE/DE or classification topology and active outcomes
 * server-side, freezes deciding lineups and appends the official ledger.
 */
export async function persistGoV2FinalPlacementSnapshot(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    actorId: string;
  },
): Promise<GoV2FinalPlacementSnapshotRecord> {
  const unsupported = await client.query(
    `SELECT stage.id::text, stage.stage_key
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1
       AND stage.stage_type = 'placement_match'
       AND stage.status <> 'voided'
       AND EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id)
     LIMIT 1`,
    [input.tournamentId],
  );
  if (unsupported.rowCount) {
    const classification = await persistClassificationFinalPlacementSnapshot(client, input);
    return loadGoV2FinalPlacementSnapshotById(client, classification.snapshotId, classification.created);
  }

  const stageResult = await client.query(
    `SELECT stage.id::text, stage.stage_key, stage.stage_order, stage.stage_type,
            stage.tier, stage.status, stage.configuration
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1
       AND stage.stage_type IN ('single_elimination', 'double_elimination')
       AND stage.status <> 'voided'
       AND EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id)
     ORDER BY stage.stage_order, stage.tier NULLS FIRST, stage.id`,
    [input.tournamentId],
  );
  if (!stageResult.rowCount) {
    throw new GoV2Error(409, 'FINAL_PLACEMENT_BRACKET_REQUIRED', 'No materialized SE/DE bracket is available');
  }
  const unfinished = stageResult.rows.filter((row) => String(row.status) !== 'finished');
  if (unfinished.length) {
    throw new GoV2Error(409, 'FINAL_PLACEMENT_BRACKET_INCOMPLETE', 'Every tier bracket must be finished', {
      stageIds: unfinished.map((row) => String(row.id)),
    });
  }
  const stageIds = stageResult.rows.map((row) => String(row.id));
  const matchResult = await client.query(
    `SELECT match.id::text, match.stage_id::text, match.match_key,
            match.round_no, match.position, match.bracket_side,
            match.is_conditional, match.condition_state, match.play_state, match.metadata,
            revision.id::text AS result_revision_id, revision.revision_no,
            revision.result_kind, revision.winner_entry_id::text,
            revision.loser_entry_id::text, revision.advancement_effect,
            revision.rating_eligibility,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'slotNo', source.slot_no,
                'sourceType', source.source_type,
                'routeSourceType', source.route_source_type,
                'sourceEntryId', source.source_entry_id,
                'routeSourceMatchId', source.route_source_match_id,
                'resolvedEntryId', source.resolved_entry_id,
                'entryInitialSeed', entry.initial_seed
              ) ORDER BY source.slot_no)
              FROM go_v2_match_slot_sources source
              LEFT JOIN go_v2_entries entry ON entry.id = source.source_entry_id
              WHERE source.match_id = match.id
            ), '[]'::jsonb) AS slot_sources
     FROM go_v2_matches match
     LEFT JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
     WHERE match.stage_id::text = ANY($1::text[])
     ORDER BY match.stage_id, match.created_at, match.round_no, match.position, match.id`,
    [stageIds],
  );
  const lineupResult = await client.query(
    `SELECT lineup.match_id::text, lineup.entry_id::text,
            lineup.roster_revision_id::text, lineup.side,
            revision.id::text AS result_revision_id, revision.revision_no,
            revision.rating_eligibility,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'memberOrder', member.member_order,
                'playerId', member.player_id,
                'displayName', member.display_name,
                'ratingValue', member.rating_value
              ) ORDER BY member.member_order)
              FROM go_v2_roster_revision_members member
              WHERE member.roster_revision_id = lineup.roster_revision_id
            ), '[]'::jsonb) AS members
     FROM go_v2_match_lineup_snapshots lineup
     JOIN go_v2_matches match ON match.id = lineup.match_id
     JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
      AND lineup.result_revision_no = revision.revision_no
     WHERE match.stage_id::text = ANY($1::text[])
     ORDER BY lineup.match_id, lineup.side`,
    [stageIds],
  );
  const qualificationSeedResult = await client.query(
    `SELECT DISTINCT ON (row.entry_id, row.tier)
            row.entry_id::text, row.tier, row.seed
     FROM go_v2_qualification_snapshot_rows row
     JOIN go_v2_qualification_snapshots snapshot ON snapshot.id = row.snapshot_id
     JOIN go_v2_stages source_stage ON source_stage.id = snapshot.source_stage_id
     WHERE source_stage.tournament_id = $1
     ORDER BY row.entry_id, row.tier, snapshot.aggregate_version DESC, snapshot.created_at DESC, snapshot.id DESC`,
    [input.tournamentId],
  );
  const sourceLineageResult = await client.query(
    `SELECT stage.id::text AS stage_id, stage.stage_key, stage.stage_order,
            stage.stage_type, stage.tier,
            match.id::text AS match_id, match.match_key, match.round_no,
            match.position, match.bracket_side, match.is_conditional,
            match.condition_state, match.play_state,
            revision.id::text AS result_revision_id, revision.revision_no,
            revision.result_kind, revision.winner_entry_id::text,
            revision.loser_entry_id::text, revision.advancement_effect,
            revision.rating_eligibility
     FROM go_v2_stages stage
     JOIN go_v2_matches match ON match.stage_id = stage.id
     LEFT JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
     WHERE stage.tournament_id = $1 AND stage.status <> 'voided'
     ORDER BY stage.stage_order, stage.tier NULLS FIRST,
              match.created_at, match.round_no, match.position, match.id`,
    [input.tournamentId],
  );
  const qualificationSeeds = new Map(qualificationSeedResult.rows.map((row) => [
    `${String(row.tier)}:${String(row.entry_id)}`,
    finalPlacementInteger(row.seed, 'qualificationSeed', 1),
  ]));
  const lineupsByMatchEntry = new Map<string, GoV2FinalPlacementLineupSnapshot>();
  for (const row of lineupResult.rows) {
    const matchId = String(row.match_id);
    const entryId = String(row.entry_id);
    lineupsByMatchEntry.set(`${matchId}:${entryId}`, finalPlacementLineupFromJson({
      matchId,
      resultRevisionId: row.result_revision_id,
      resultRevisionNo: row.revision_no,
      rosterRevisionId: row.roster_revision_id,
      ratingEligibility: row.rating_eligibility,
      members: row.members,
    }));
  }

  const matchesByStage = new Map<string, typeof matchResult.rows>();
  for (const row of matchResult.rows) {
    const stageId = String(row.stage_id);
    matchesByStage.set(stageId, [...(matchesByStage.get(stageId) ?? []), row]);
  }
  const completedBrackets: GoV2CompletedTierBracket[] = [];
  const stageMatchRows = new Map<string, typeof matchResult.rows>();

  for (const stageRow of stageResult.rows) {
    const stageId = String(stageRow.id);
    const stageType = String(stageRow.stage_type) as 'single_elimination' | 'double_elimination';
    const tier = finalPlacementTier(stageRow.tier);
    const configuration = record(stageRow.configuration);
    const rows = matchesByStage.get(stageId) ?? [];
    stageMatchRows.set(stageId, rows);
    const configuredSeeds = new Map<string, number>();
    if (Array.isArray(configuration.participantSeeds)) {
      for (const rawParticipant of configuration.participantSeeds) {
        const participant = record(rawParticipant);
        const entryId = String(participant.entryId ?? '');
        const seed = Number(participant.seed);
        if (entryId && Number.isSafeInteger(seed) && seed >= 1) configuredSeeds.set(entryId, seed);
      }
    }
    const sourceFor = (rawSource: unknown): SlotSource => {
      const source = record(rawSource);
      const kind = String(source.routeSourceType ?? source.sourceType ?? '');
      if (kind === 'ENTRY') {
        const entryId = String(source.sourceEntryId ?? source.resolvedEntryId ?? '');
        const seed = configuredSeeds.get(entryId)
          ?? qualificationSeeds.get(`${tier}:${entryId}`)
          ?? Number(source.entryInitialSeed);
        if (!entryId || !Number.isSafeInteger(seed) || seed < 1) {
          throw new GoV2Error(409, 'FINAL_PLACEMENT_SEED_MISSING', 'Bracket participant seed cannot be reconstructed', {
            stageId,
            entryId,
          });
        }
        return { kind: 'ENTRY', entryId, initialSeed: seed };
      }
      if (kind === 'MATCH_WINNER' || kind === 'MATCH_LOSER') {
        const matchId = String(source.routeSourceMatchId ?? '');
        if (!matchId) {
          throw new GoV2Error(409, 'FINAL_PLACEMENT_ROUTE_MISSING', 'Bracket route lineage is incomplete', {
            stageId,
          });
        }
        return { kind, matchId };
      }
      throw new GoV2Error(409, 'FINAL_PLACEMENT_ROUTE_UNSUPPORTED', 'A real bracket match has an unsupported source', {
        stageId,
        sourceKind: kind,
      });
    };
    const bracketMatches: BracketMatch[] = rows.map((row) => {
      const slots = Array.isArray(row.slot_sources) ? row.slot_sources : [];
      if (slots.length !== 2) {
        throw new GoV2Error(409, 'FINAL_PLACEMENT_SLOTS_INCOMPLETE', 'Every real bracket match requires two routes', {
          matchId: String(row.id),
        });
      }
      return {
        matchId: String(row.id),
        phase: String(row.bracket_side) as BracketMatch['phase'],
        round: finalPlacementInteger(row.round_no, 'roundNo', 1),
        position: finalPlacementInteger(row.position, 'position', 1),
        sourceA: sourceFor(slots[0]),
        sourceB: sourceFor(slots[1]),
        conditional: row.is_conditional === true,
        ...(row.is_conditional === true ? {
          condition: {
            kind: 'LOWER_BRACKET_WINNER_WON_GF1' as const,
            grandFinalMatchId: String(
              rows.find((candidate) => (
                String(candidate.bracket_side) === 'grand_final'
                && candidate.is_conditional !== true
              ))?.id ?? '',
            ),
          },
        } : {}),
        ...(record(row.metadata).publicLabel ? { publicLabel: String(record(row.metadata).publicLabel) } : {}),
      };
    });
    const orderedBracketMatches = orderFinalPlacementMatchesTopologically(bracketMatches);
    const participants = new Set<string>();
    for (const match of orderedBracketMatches) {
      for (const source of [match.sourceA, match.sourceB]) {
        if (source.kind === 'ENTRY') participants.add(source.entryId);
      }
    }
    const finals = orderedBracketMatches.filter((match) => (
      stageType === 'single_elimination' ? match.phase === 'upper' : match.phase === 'grand_final'
    )).sort((left, right) => left.round - right.round || left.position - right.position);
    const grandFinalOne = stageType === 'single_elimination'
      ? finals[finals.length - 1]
      : finals.find((match) => !match.conditional) ?? finals[finals.length - 1];
    const reset = finals.find((match) => match.conditional);
    if (!grandFinalOne) {
      throw new GoV2Error(409, 'FINAL_PLACEMENT_FINAL_MISSING', 'A bracket final cannot be reconstructed', { stageId });
    }
    const resetCondition = {
      kind: 'LOWER_BRACKET_WINNER_WON_GF1' as const,
      grandFinalMatchId: grandFinalOne.matchId,
    };
    const championSource: ChampionSource = reset
      ? {
          kind: 'CONDITIONAL_MATCH_WINNER',
          matchId: reset.matchId,
          fallback: { kind: 'MATCH_WINNER', matchId: grandFinalOne.matchId },
          condition: resetCondition,
        }
      : { kind: 'MATCH_WINNER', matchId: grandFinalOne.matchId };
    const topology: BracketTopology = {
      kind: stageType,
      participantCount: participants.size,
      capacity: finalPlacementCapacity(configuration.capacity, participants.size),
      templateVersion: stageType === 'double_elimination' ? 'lpv_de_crossover_v1' : 'lpv_se_v1',
      matches: orderedBracketMatches.map((match) => match.conditional ? { ...match, condition: resetCondition } : match),
      byeAdvances: [],
      championSource,
      guaranteedMatchCount: orderedBracketMatches.filter((match) => !match.conditional).length,
      maximumMatchCount: orderedBracketMatches.length,
      rematchPreview: [],
      warnings: Array.isArray(configuration.warnings) ? configuration.warnings.map(String) : [],
      topologyHash: String(configuration.topologyHash ?? stableRepositoryHash(orderedBracketMatches)),
    };
    const outcomes = rows.flatMap((row) => {
      const inactiveConditional = row.is_conditional === true && String(row.condition_state) === 'false';
      if (inactiveConditional) return [];
      if (
        String(row.play_state) !== 'final'
        || !row.result_revision_id
        || !row.winner_entry_id
        || !row.loser_entry_id
      ) {
        throw new GoV2Error(409, 'FINAL_PLACEMENT_OUTCOME_INCOMPLETE', 'Every active bracket match needs a final winner and loser', {
          stageId,
          matchId: String(row.id),
          playState: String(row.play_state),
          resultRevisionId: row.result_revision_id ? String(row.result_revision_id) : null,
        });
      }
      return [{
        matchId: String(row.id),
        winnerEntryId: String(row.winner_entry_id),
        loserEntryId: String(row.loser_entry_id),
      }];
    });
    try {
      completedBrackets.push({
        stageId,
        stageKey: String(stageRow.stage_key),
        stageOrder: finalPlacementInteger(stageRow.stage_order, 'stageOrder', 1),
        tier,
        result: resolveCompleteBracketPlacements(topology, outcomes),
      });
    } catch (error) {
      if (error instanceof SportsDomainError) {
        throw new GoV2Error(409, `FINAL_PLACEMENT_${error.code}`, error.message, error.details);
      }
      throw error;
    }
  }

  let placementDrafts: ReturnType<typeof mergeGoV2TierBracketPlacements>;
  try {
    placementDrafts = mergeGoV2TierBracketPlacements(completedBrackets);
  } catch (error) {
    if (error instanceof SportsDomainError) {
      throw new GoV2Error(409, error.code, error.message, error.details);
    }
    throw error;
  }
  const placements: GoV2PersistedFinalPlacementRow[] = placementDrafts.map((placement) => {
    const rows = stageMatchRows.get(placement.sourceStageId) ?? [];
    const rowsWithEntry = rows.filter((row) => lineupsByMatchEntry.has(`${String(row.id)}:${placement.entryId}`));
    let decidingMatchId = placement.eliminatedByMatchId;
    if (placement.basis === 'championship_match') {
      const grandFinalRows = rowsWithEntry.filter((row) => String(row.bracket_side) === 'grand_final');
      decidingMatchId = (grandFinalRows.length
        ? grandFinalRows
        : rowsWithEntry.filter((row) => String(row.bracket_side) === 'upper'))
        .sort((left, right) => Number(right.round_no) - Number(left.round_no) || String(right.id).localeCompare(String(left.id)))[0]?.id;
    } else if (placement.basis === 'placement_match') {
      decidingMatchId = rowsWithEntry.find((row) => String(row.bracket_side) === 'bronze')?.id
        ?? placement.eliminatedByMatchId;
    }
    const lineupSnapshot = decidingMatchId
      ? lineupsByMatchEntry.get(`${String(decidingMatchId)}:${placement.entryId}`)
      : undefined;
    if (!lineupSnapshot) {
      throw new GoV2Error(409, 'FINAL_PLACEMENT_LINEUP_MISSING', 'The placement-deciding immutable lineup is missing', {
        entryId: placement.entryId,
        sourceStageId: placement.sourceStageId,
        decidingMatchId: decidingMatchId ? String(decidingMatchId) : null,
      });
    }
    return { ...placement, lineupSnapshot };
  });
  const sourceRevisionLineage: Array<Record<string, unknown>> = sourceLineageResult.rows.map((row) => ({
    stageId: String(row.stage_id),
    stageKey: String(row.stage_key),
    stageOrder: Number(row.stage_order),
    stageType: String(row.stage_type),
    tier: row.tier ? String(row.tier) : null,
    matchId: String(row.match_id),
    matchKey: String(row.match_key),
    round: Number(row.round_no),
    position: Number(row.position),
    phase: row.bracket_side ? String(row.bracket_side) : null,
    conditional: row.is_conditional === true,
    conditionState: String(row.condition_state),
    playState: String(row.play_state),
    resultRevisionId: row.result_revision_id ? String(row.result_revision_id) : null,
    resultRevisionNo: row.result_revision_id ? Number(row.revision_no) : null,
    resultKind: row.result_kind ? String(row.result_kind) : null,
    winnerEntryId: row.winner_entry_id ? String(row.winner_entry_id) : null,
    loserEntryId: row.loser_entry_id ? String(row.loser_entry_id) : null,
    advancementEffect: row.advancement_effect ? String(row.advancement_effect) : null,
    ratingEligibility: row.rating_eligibility ? String(row.rating_eligibility) : null,
  })).sort((left, right) => (
    Number(left.stageOrder) - Number(right.stageOrder)
    || stableTextCompare(String(left.stageId), String(right.stageId))
    || Number(left.round) - Number(right.round)
    || stableTextCompare(String(left.phase ?? ''), String(right.phase ?? ''))
    || Number(left.position) - Number(right.position)
    || stableTextCompare(String(left.matchId), String(right.matchId))
  ));
  const sourceResultRevisionIds = sourceRevisionLineage
    .map((row) => String(row.resultRevisionId ?? ''))
    .filter(Boolean);
  const sourceStageIds = completedBrackets
    .sort((left, right) => left.stageOrder - right.stageOrder || stableTextCompare(left.stageId, right.stageId))
    .map((stage) => stage.stageId);
  const sourceResultsHash = stableRepositoryHash({
    schemaVersion: 1,
    sourceKind: 'bracket_v1',
    sourceStageIds,
    sourceRevisionLineage,
  });
  const standingsHash = stableRepositoryHash({
    schemaVersion: 1,
    rows: placements.map((row) => ({
      entryId: row.entryId,
      tier: row.tier,
      tierPlace: row.tierPlace,
      overallPlace: row.overallPlace,
      sportingTierPlaceRange: row.sportingTierPlaceRange,
      sportingOverallPlaceRange: row.sportingOverallPlaceRange,
      initialSeed: row.initialSeed,
      basis: row.basis,
      creditedLineup: {
        rosterRevisionId: row.lineupSnapshot.rosterRevisionId,
        ratingEligibility: row.lineupSnapshot.ratingEligibility,
        members: row.lineupSnapshot.members.map((member) => ({
          memberOrder: member.memberOrder,
          playerId: member.playerId,
          ratingValue: member.ratingValue,
        })),
      },
    })),
    ratingPolicy: GO_V2_DEFAULT_RATING_POLICY,
  });
  const inserted = await client.query(
    `INSERT INTO go_v2_final_placement_snapshots (
       tournament_id, schema_version, aggregate_version, source_kind,
       source_results_hash, standings_hash, source_stage_ids,
       source_result_revision_ids, source_revision_lineage,
       rating_policy_snapshot, created_by
     ) VALUES ($1, 1, $2, 'bracket_v1', $3, $4, $5::uuid[], $6::uuid[], $7::jsonb, $8::jsonb, $9)
     ON CONFLICT (tournament_id, source_results_hash) DO NOTHING
     RETURNING id::text`,
    [
      input.tournamentId,
      input.aggregateVersion,
      sourceResultsHash,
      standingsHash,
      sourceStageIds,
      sourceResultRevisionIds,
      JSON.stringify(sourceRevisionLineage),
      JSON.stringify(GO_V2_DEFAULT_RATING_POLICY),
      input.actorId,
    ],
  );
  let snapshotId: string;
  const created = Boolean(inserted.rowCount);
  if (created) {
    snapshotId = String(inserted.rows[0].id);
    for (const row of placements) {
      await client.query(
        `INSERT INTO go_v2_final_placement_rows (
           snapshot_id, entry_id, source_stage_id, tier, tier_place, overall_place,
           sporting_tier_place_from, sporting_tier_place_to,
           sporting_overall_place_from, sporting_overall_place_to,
           initial_seed, games_played, losses, eliminated_by_match_id, basis, lineup_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
        [
          snapshotId,
          row.entryId,
          row.sourceStageId,
          row.tier,
          row.tierPlace,
          row.overallPlace,
          row.sportingTierPlaceRange[0],
          row.sportingTierPlaceRange[1],
          row.sportingOverallPlaceRange[0],
          row.sportingOverallPlaceRange[1],
          row.initialSeed,
          row.gamesPlayed,
          row.losses,
          row.eliminatedByMatchId,
          row.basis,
          JSON.stringify(row.lineupSnapshot),
        ],
      );
    }
  } else {
    const existing = await client.query(
      `SELECT id::text
       FROM go_v2_final_placement_snapshots
       WHERE tournament_id = $1 AND source_results_hash = $2`,
      [input.tournamentId, sourceResultsHash],
    );
    if (!existing.rowCount) {
      throw new GoV2Error(500, 'FINAL_PLACEMENT_INSERT_RACE', 'Could not resolve the immutable placement snapshot');
    }
    snapshotId = String(existing.rows[0].id);
  }
  return loadGoV2FinalPlacementSnapshotById(client, snapshotId, created);
}

export async function appendAuditEvent(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    eventType: GoV2OperationKind;
    entityType?: string;
    entityId?: string;
    reasonCode: string;
    reasonNote?: string;
    actorId: string;
    idempotencyKey: string;
    diffPayload: Record<string, unknown>;
  },
): Promise<string> {
  const result = await client.query(
    `INSERT INTO go_v2_audit_events (
       tournament_id, aggregate_version, event_type, entity_type, entity_id,
       reason_code, reason_note, actor_id, idempotency_key, diff_payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING id`,
    [
      input.tournamentId,
      input.aggregateVersion,
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      input.reasonCode,
      input.reasonNote ?? null,
      input.actorId,
      input.idempotencyKey,
      JSON.stringify(input.diffPayload),
    ],
  );
  return String(result.rows[0].id);
}

export async function enqueueNotificationOutbox(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  for (const channel of ['website', 'telegram'] as const) {
    await client.query(
      `INSERT INTO go_v2_notification_outbox (
         tournament_id, aggregate_version, channel, recipient_key,
         event_type, payload, dedup_key
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        input.tournamentId,
        input.aggregateVersion,
        channel,
        `tournament:${input.tournamentId}`,
        input.eventType,
        JSON.stringify(input.payload),
        `go-v2:${input.tournamentId}:${input.aggregateVersion}:${channel}:${input.eventType}`,
      ],
    );
  }
}

export async function setActiveScheduleVersion(
  client: PoolClient,
  tournamentId: string,
  scheduleVersionId: string,
): Promise<void> {
  await client.query(
    `UPDATE go_v2_tournament_state
     SET active_schedule_version_id = $2, updated_at = now()
     WHERE tournament_id = $1`,
    [tournamentId, scheduleVersionId],
  );
}

/**
 * Resolves a published loser-duty only after its source result is known.
 * Candidate reservations remain on the row for audit/validator replay; the
 * concrete public referee is represented by the existing `entry` duty shape.
 */
export async function materializeLoserRefereeDuties(
  client: PoolClient,
  input: {
    sourceMatchId: string;
    loserEntryId: string | null;
    resultRevisionNo: number;
  },
): Promise<string[]> {
  const duties = await client.query(
    `SELECT duty.id::text AS duty_id, duty.candidate_entry_ids
     FROM go_v2_referee_duties duty
     WHERE (
       duty.source_match_id = $1
       OR duty.metadata->>'sourceMatchId' = $1::text
     )
       AND (
         duty.duty_kind = 'loser_previous_same_court'
         OR duty.metadata->>'sourceDutyKind' = 'loser_previous_same_court'
       )
     ORDER BY duty.id
     FOR UPDATE`,
    [input.sourceMatchId],
  );
  const dutyIds = duties.rows.map((row) => String(row.duty_id));
  if (!dutyIds.length) return [];
  if (input.loserEntryId) {
    const incompatibleDutyIds = duties.rows
      .filter((row) => (
        !Array.isArray(row.candidate_entry_ids)
        || !row.candidate_entry_ids.map(String).includes(input.loserEntryId as string)
      ))
      .map((row) => String(row.duty_id));
    if (incompatibleDutyIds.length) {
      throw new GoV2Error(
        409,
        'LOSER_REFEREE_CANDIDATE_MISMATCH',
        'The actual loser was not reserved for a published loser-referee duty',
        {
          sourceMatchId: input.sourceMatchId,
          loserEntryId: input.loserEntryId,
          dutyIds: incompatibleDutyIds,
          requiredOperation: 'schedule.replan.preview',
        },
      );
    }
  }
  await client.query(
    input.loserEntryId
      ? `UPDATE go_v2_referee_duties
         SET duty_kind = 'entry',
             referee_entry_id = $2,
             source_match_id = NULL,
             status = 'planned',
             metadata = metadata || jsonb_build_object(
               'sourceDutyKind', 'loser_previous_same_court',
               'sourceMatchId', $1::text,
               'resolvedFromResultRevisionNo', $3::int,
               'resolutionState', 'actual_loser_bound'
             )
         WHERE id::text = ANY($4::text[])`
      : `UPDATE go_v2_referee_duties
         SET duty_kind = 'loser_previous_same_court',
             referee_entry_id = NULL,
             source_match_id = $1,
             status = 'released',
             metadata = metadata || jsonb_build_object(
               'sourceDutyKind', 'loser_previous_same_court',
               'sourceMatchId', $1::text,
               'resolvedFromResultRevisionNo', $3::int,
               'resolutionState', 'no_loser_requires_replan'
             )
         WHERE id::text = ANY($4::text[])`,
    [input.sourceMatchId, input.loserEntryId, input.resultRevisionNo, dutyIds],
  );
  return dutyIds;
}

export async function appendResultRevision(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
    /** Internal-only source used by compensating undo; never read from payload. */
    lineupSourceRevisionNo?: number;
    /** Trusted server provenance; client payload never selects this value. */
    resultSource?: 'judge_review' | 'paper_import' | 'incident' | 'withdrawal' | 'cascade' | 'undo' | 'legacy_admin';
    payload: Record<string, unknown>;
  },
): Promise<{
  resultRevisionId: string;
  revisionNo: number;
  previousResultRevisionId: string | null;
  resolvedRefereeDutyIds: string[];
}> {
  const match = await client.query(
    `SELECT id, current_result_revision_no
     FROM go_v2_matches
     WHERE id = $1 AND tournament_id = $2
     FOR UPDATE`,
    [input.matchId, input.tournamentId],
  );
  if (!match.rowCount) {
    throw new GoV2Error(404, 'MATCH_NOT_FOUND', 'Match not found');
  }
  const requestedResultKind = String(input.payload.resultKind ?? 'played');
  const currentResultRevisionNo = numeric(match.rows[0].current_result_revision_no ?? 0);
  const payloadPreviousRevisionNo = Number(input.payload.previousResultRevisionNo ?? 0);
  if (!Number.isSafeInteger(payloadPreviousRevisionNo) || payloadPreviousRevisionNo < 0) {
    throw new GoV2Error(422, 'INVALID_PREVIOUS_RESULT_REVISION', 'previousResultRevisionNo must be a non-negative integer');
  }
  if (payloadPreviousRevisionNo > 0 && payloadPreviousRevisionNo !== currentResultRevisionNo) {
    throw new GoV2Error(
      409,
      'RESULT_REVISION_STALE',
      'The current result revision changed while the correction was being prepared',
      { expectedRevisionNo: payloadPreviousRevisionNo, currentRevisionNo: currentResultRevisionNo },
    );
  }
  const lineupSourceRevisionNo = input.lineupSourceRevisionNo ?? payloadPreviousRevisionNo;
  if (!Number.isSafeInteger(lineupSourceRevisionNo) || lineupSourceRevisionNo < 0) {
    throw new GoV2Error(500, 'INVALID_LINEUP_SOURCE_REVISION', 'Internal lineup source revision must be a non-negative integer');
  }
  const previous = await client.query(
    `SELECT id, revision_no FROM go_v2_match_result_revisions
     WHERE match_id = $1
     ORDER BY revision_no DESC LIMIT 1`,
    [input.matchId],
  );
  // The active pointer may deliberately be cleared by a compensating undo.
  // Revision numbers remain append-only and therefore always follow max().
  const revisionNo = numeric(previous.rows[0]?.revision_no ?? 0) + 1;
  // A score/result correction belongs to the lineup that played the match,
  // even if the entry roster has since changed. A replay has no active
  // previous revision pointer and therefore snapshots the current lineup.
  if (lineupSourceRevisionNo > 0) {
    await client.query(
      `INSERT INTO go_v2_match_lineup_snapshots (
         match_id, result_revision_no, entry_id, roster_revision_id, side
       )
       SELECT match_id, $2, entry_id, roster_revision_id, side
       FROM go_v2_match_lineup_snapshots
       WHERE match_id = $1 AND result_revision_no = $3
       ON CONFLICT DO NOTHING`,
      [input.matchId, revisionNo, lineupSourceRevisionNo],
    );
  } else {
    await client.query(
      `INSERT INTO go_v2_match_lineup_snapshots (
         match_id, result_revision_no, entry_id, roster_revision_id, side
       )
       SELECT source.match_id, $2, source.resolved_entry_id,
              entry.current_roster_revision_id, source.slot_no
       FROM go_v2_match_slot_sources source
       JOIN go_v2_entries entry ON entry.id = source.resolved_entry_id
       WHERE source.match_id = $1
         AND source.slot_no IN (1, 2)
         AND entry.current_roster_revision_id IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [input.matchId, revisionNo],
    );
  }
  const lineup = await client.query(
    `SELECT count(*)::int AS count,
            bool_and(source.resolved_entry_id = lineup.entry_id) AS matches_current_slots
     FROM go_v2_match_lineup_snapshots lineup
     LEFT JOIN go_v2_match_slot_sources source
       ON source.match_id = lineup.match_id AND source.slot_no = lineup.side
     WHERE lineup.match_id = $1 AND lineup.result_revision_no = $2`,
    [input.matchId, revisionNo],
  );
  const lineupCount = numeric(lineup.rows[0]?.count);
  if (requestedResultKind !== 'voided' && lineupCount !== 2) {
    throw new GoV2Error(
      409,
      'MATCH_LINEUP_UNRESOLVED',
      'Both participants require a locked roster revision before recording a result',
    );
  }
  if (
    requestedResultKind !== 'voided'
    && lineupCount === 2
    && lineup.rows[0]?.matches_current_slots !== true
  ) {
    throw new GoV2Error(
      409,
      'MATCH_LINEUP_CHANGED_DURING_RESULT',
      'Match participants changed while the result revision was being prepared',
    );
  }
  const resultKind = requestedResultKind;
  const resultSource = String(input.resultSource ?? 'legacy_admin');
  if (![
    'judge_review', 'paper_import', 'incident', 'withdrawal',
    'cascade', 'undo', 'legacy_admin',
  ].includes(resultSource)) {
    throw new GoV2Error(500, 'INVALID_RESULT_SOURCE', 'Internal result source is not supported');
  }
  const winnerEntryId = input.payload.winnerEntryId ? String(input.payload.winnerEntryId) : null;
  const loserEntryId = input.payload.loserEntryId ? String(input.payload.loserEntryId) : null;
  const inserted = await client.query(
    `INSERT INTO go_v2_match_result_revisions (
       match_id, revision_no, supersedes_revision_id, result_kind, incident_cause,
       actual_score, declared_result, winner_entry_id, loser_entry_id,
       advancement_effect, rating_eligibility, reason_code, reason_note,
       evidence, author_id, result_source
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9,
       $10, $11, $12, $13, $14::jsonb, $15, $16
     ) RETURNING id`,
    [
      input.matchId,
      revisionNo,
      previous.rows[0]?.id ?? null,
      resultKind,
      input.payload.incidentCause ? String(input.payload.incidentCause) : null,
      input.payload.actualScore == null ? null : JSON.stringify(input.payload.actualScore),
      JSON.stringify(record(input.payload.declaredResult)),
      winnerEntryId,
      loserEntryId,
      String(input.payload.advancementEffect ?? 'advance_winner'),
      String(input.payload.ratingEligibility ?? 'eligible'),
      input.reasonCode,
      input.reasonNote ?? null,
      JSON.stringify(record(input.payload.evidence)),
      input.actorId,
      resultSource,
    ],
  );
  const resultRevisionId = String(inserted.rows[0].id);

  const contributions = Array.isArray(input.payload.standingContributions)
    ? input.payload.standingContributions
    : [];
  for (const rawContribution of contributions) {
    const contribution = record(rawContribution);
    await client.query(
      `INSERT INTO go_v2_match_standing_contributions (
         result_revision_id, entry_id, matches_played, match_points,
         sets_for, sets_against, rallies_for, rallies_against, counts_for_ranking
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        resultRevisionId,
        String(contribution.entryId ?? ''),
        Number(contribution.matchesPlayed ?? 0),
        Number(contribution.matchPoints ?? 0),
        Number(contribution.setsFor ?? 0),
        Number(contribution.setsAgainst ?? 0),
        Number(contribution.ralliesFor ?? 0),
        Number(contribution.ralliesAgainst ?? 0),
        contribution.countsForRanking !== false,
      ],
    );
  }

  await client.query(
    `UPDATE go_v2_matches
     SET current_result_revision_no = $2,
         winner_entry_id = $3,
         loser_entry_id = $4,
         play_state = CASE WHEN $5 = 'voided' THEN 'voided' ELSE 'final' END,
         version = version + 1,
         updated_at = now()
     WHERE id = $1`,
    [input.matchId, revisionNo, winnerEntryId, loserEntryId, resultKind],
  );
  const resolvedRefereeDutyIds = await materializeLoserRefereeDuties(client, {
    sourceMatchId: input.matchId,
    loserEntryId,
    resultRevisionNo: revisionNo,
  });
  return {
    resultRevisionId,
    revisionNo,
    previousResultRevisionId: previous.rows[0]?.id ? String(previous.rows[0].id) : null,
    resolvedRefereeDutyIds,
  };
}

/**
 * Loads the complete published session lineage used by a qualification
 * cascade.  A session is accepted only when every member still points at the
 * same published version; callers may therefore use the returned versions as
 * a multi-tournament CAS snapshot.
 */
export async function loadQualificationCascadeScheduleContext(
  client: PoolClient,
  tournamentId: string,
): Promise<GoV2QualificationCascadeScheduleContext | null> {
  const active = await client.query(
    `SELECT version.id::text AS schedule_version_id,
            version.session_id::text AS schedule_session_id,
            version.schedule_hash, version.input_hash,
            session.session_key, session.label, session.timezone,
            session.window_start, session.window_end,
            session.freeze_horizon_minutes, session.time_quantum_minutes,
            session.referee_mode
     FROM go_v2_tournament_state state
     JOIN go_v2_schedule_versions version ON version.id = state.active_schedule_version_id
     JOIN go_v2_schedule_sessions session ON session.id = version.session_id
     WHERE state.tournament_id = $1 AND version.status = 'published'
     LIMIT 1`,
    [tournamentId],
  );
  if (!active.rowCount) return null;
  const activeRow = active.rows[0];
  const scheduleVersionId = String(activeRow.schedule_version_id);
  const scheduleSessionId = String(activeRow.schedule_session_id);
  const members = await client.query(
    `SELECT membership.tournament_id::text AS tournament_id,
            state.aggregate_version, state.active_schedule_version_id::text,
            COALESCE(t.go_engine_version, 0) AS go_engine_version
     FROM go_v2_schedule_session_tournaments membership
     JOIN tournaments t ON t.id = membership.tournament_id
     JOIN go_v2_tournament_state state ON state.tournament_id = membership.tournament_id
     WHERE membership.session_id = $1
     ORDER BY membership.tournament_id
     FOR SHARE OF state`,
    [scheduleSessionId],
  );
  if (!members.rowCount || members.rows.some((row) => (
    String(row.active_schedule_version_id ?? '') !== scheduleVersionId
    || Number(row.go_engine_version) !== 2
  ))) {
    throw new GoV2Error(
      409,
      'CASCADE_ACTIVE_SESSION_LINEAGE_MISMATCH',
      'Every V2 member of the active schedule session must point to the same published version',
      { scheduleSessionId, scheduleVersionId },
    );
  }
  const courtsResult = await client.query(
    `SELECT court.id::text, court.court_no, court.label, membership.available_windows
     FROM go_v2_schedule_session_courts membership
     JOIN go_v2_courts court ON court.id = membership.court_id
     WHERE membership.session_id = $1
     ORDER BY court.court_no, court.id`,
    [scheduleSessionId],
  );
  const assignmentResult = await client.query(
    `SELECT assignment.id::text AS assignment_id,
            assignment.match_id::text AS match_id,
            assignment.court_id::text AS court_id,
            assignment.planned_start, assignment.planned_end,
            assignment.live_eta, assignment.is_locked, assignment.lock_reason,
            assignment.is_conditional,
            duty.duty_kind, duty.referee_entry_id::text,
            duty.source_match_id::text, duty.candidate_entry_ids,
            duty.metadata AS duty_metadata
     FROM go_v2_schedule_assignments assignment
     LEFT JOIN LATERAL (
       SELECT candidate.*
       FROM go_v2_referee_duties candidate
       WHERE candidate.schedule_assignment_id = assignment.id
         AND candidate.status <> 'released'
       ORDER BY candidate.created_at DESC, candidate.id DESC
       LIMIT 1
     ) duty ON true
     WHERE assignment.schedule_version_id = $1
     ORDER BY assignment.planned_start, assignment.court_id, assignment.match_id`,
    [scheduleVersionId],
  );
  const toReferee = (row: QueryResultRow): Record<string, unknown> => {
    const kind = String(row.duty_kind ?? '');
    if (!kind) return { kind: 'none', reservedTeamIds: [] };
    if (kind === 'staff') {
      return {
        kind: 'court_judge',
        reservedTeamIds: [],
        ...(record(row.duty_metadata).isFallback === true ? { isFallback: true } : {}),
      };
    }
    if (kind === 'entry') {
      return { kind: 'fixed_team', reservedTeamIds: [String(row.referee_entry_id)] };
    }
    if (kind === 'loser_previous_same_court') {
      return {
        kind: 'loser_previous_same_court',
        sourceMatchId: String(row.source_match_id),
        reservedTeamIds: Array.isArray(row.candidate_entry_ids)
          ? row.candidate_entry_ids.map(String)
          : [],
      };
    }
    return {
      kind: 'fixed_team',
      reservedTeamIds: Array.isArray(row.candidate_entry_ids)
        ? row.candidate_entry_ids.slice(0, 1).map(String)
        : [],
    };
  };
  return {
    scheduleVersionId,
    scheduleSessionId,
    scheduleHash: activeRow.schedule_hash ? String(activeRow.schedule_hash) : null,
    inputHash: String(activeRow.input_hash),
    sessionKey: String(activeRow.session_key),
    label: String(activeRow.label),
    timezone: String(activeRow.timezone),
    windowStart: new Date(activeRow.window_start).toISOString(),
    windowEnd: new Date(activeRow.window_end).toISOString(),
    freezeHorizonMinutes: numeric(activeRow.freeze_horizon_minutes),
    timeQuantumMinutes: numeric(activeRow.time_quantum_minutes),
    refereeMode: String(activeRow.referee_mode),
    sessionTournamentIds: members.rows.map((row) => String(row.tournament_id)),
    sessionTournamentVersions: Object.fromEntries(members.rows.map((row) => [
      String(row.tournament_id),
      numeric(row.aggregate_version),
    ])),
    courts: courtsResult.rows.map((row) => ({
      id: String(row.id),
      courtNo: numeric(row.court_no),
      label: String(row.label),
      availableWindows: Array.isArray(row.available_windows) ? row.available_windows : [],
    })),
    assignments: assignmentResult.rows.map((row) => ({
      assignmentId: String(row.assignment_id),
      matchId: String(row.match_id),
      courtId: String(row.court_id),
      plannedStart: new Date(row.planned_start).toISOString(),
      plannedEnd: new Date(row.planned_end).toISOString(),
      liveEta: row.live_eta ? new Date(row.live_eta).toISOString() : null,
      isLocked: row.is_locked === true,
      lockReason: row.lock_reason ? String(row.lock_reason) : null,
      isConditional: row.is_conditional === true,
      referee: toReferee(row),
    })),
  };
}

export async function assessDownstreamImpact(
  client: PoolClient,
  tournamentId: string,
  triggerMatchId: string,
): Promise<GoV2ImpactPreview> {
  // Tier brackets are ENTRY-seeded from an immutable qualification snapshot,
  // so their dependency is not represented by MATCH_WINNER/MATCH_LOSER edges.
  // Load that lineage explicitly: previews may calculate an authoritative
  // before/after projection, while commit capability remains fail-closed.
  const lockedQualification = await client.query(
    `SELECT source_stage.id::text AS group_stage_id,
            qualification.id::text AS qualification_snapshot_id,
            qualification.rules_snapshot,
            standing.id::text AS standing_snapshot_id
     FROM go_v2_matches trigger_match
     JOIN go_v2_stages source_stage ON source_stage.id = trigger_match.stage_id
     JOIN LATERAL (
       SELECT snapshot.*
       FROM go_v2_qualification_snapshots snapshot
       WHERE snapshot.source_stage_id = source_stage.id
       ORDER BY snapshot.created_at DESC, snapshot.id DESC
       LIMIT 1
     ) qualification ON true
     LEFT JOIN LATERAL (
       SELECT snapshot.id
       FROM go_v2_standing_snapshots snapshot
       WHERE snapshot.stage_id = source_stage.id
       ORDER BY snapshot.created_at DESC, snapshot.id DESC
       LIMIT 1
     ) standing ON true
     WHERE trigger_match.id = $1 AND trigger_match.tournament_id = $2
       AND trigger_match.current_result_revision_no > 0
       AND source_stage.stage_type IN ('round_robin_pool', 'modified_pool_4')
     LIMIT 1`,
    [triggerMatchId, tournamentId],
  );
  const result = await client.query(
    `WITH RECURSIVE affected AS (
       SELECT m.id, m.stage_id, m.play_state, m.schedule_state, m.current_result_revision_no, 0 AS depth
       FROM go_v2_matches m
       WHERE m.id = $1 AND m.tournament_id = $2
       UNION
       SELECT next_match.id, next_match.stage_id, next_match.play_state, next_match.schedule_state,
              next_match.current_result_revision_no, affected.depth + 1
       FROM affected
       JOIN go_v2_match_slot_sources source ON source.route_source_match_id = affected.id
       JOIN go_v2_matches next_match ON next_match.id = source.match_id
       WHERE affected.depth < 128
     )
     SELECT id, stage_id, play_state, schedule_state, current_result_revision_no, min(depth) AS depth
     FROM affected
     GROUP BY id, stage_id, play_state, schedule_state, current_result_revision_no
     ORDER BY min(depth), id`,
    [triggerMatchId, tournamentId],
  );
  if (!result.rowCount) throw new GoV2Error(404, 'MATCH_NOT_FOUND', 'Trigger match not found');
  const affectedById = new Map(result.rows.slice(1).map((row) => [String(row.id), {
    matchId: String(row.id),
    playState: String(row.play_state),
    scheduleState: String(row.schedule_state),
    currentResultRevisionNo: numeric(row.current_result_revision_no),
  }] as const));
  let qualificationCorrection: GoV2QualificationCorrectionContext | undefined;
  if (lockedQualification.rowCount) {
    const locked = lockedQualification.rows[0];
    const groupStageId = String(locked.group_stage_id);
    const qualificationSnapshotId = String(locked.qualification_snapshot_id);
    const standingSnapshotId = locked.standing_snapshot_id ? String(locked.standing_snapshot_id) : null;
    const standingRows = standingSnapshotId
      ? await queryValues(client,
          `SELECT jsonb_build_object(
             'entryId', row.entry_id,
             'poolId', row.pool_id,
             'poolRank', row.pool_rank,
             'comparisonRank', row.comparison_rank,
             'metrics', row.metrics,
             'tieBreakTrace', row.tie_break_trace
           ) AS value
           FROM go_v2_standing_snapshot_rows row
           WHERE row.snapshot_id = $1
           ORDER BY row.pool_id, row.pool_rank, row.entry_id`,
          [standingSnapshotId],
        )
      : [];
    const qualificationRows = await queryValues(client,
      `SELECT jsonb_build_object(
         'entryId', row.entry_id,
         'tier', row.tier,
         'tierSeed', row.seed,
         'poolId', row.source_pool_id,
         'poolRank', row.source_pool_rank,
         'metrics', row.metrics
       ) AS value
       FROM go_v2_qualification_snapshot_rows row
       WHERE row.snapshot_id = $1
       ORDER BY CASE row.tier WHEN 'hard' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                row.seed, row.entry_id`,
      [qualificationSnapshotId],
    );
    const downstream = await client.query(
      `SELECT stage.id::text AS stage_id, stage.stage_key, stage.stage_type,
              stage.tier, stage.status AS stage_status,
              match.id::text AS match_id, match.play_state, match.schedule_state,
              match.current_result_revision_no,
              assignment.id::text AS schedule_assignment_id
       FROM go_v2_stages stage
       LEFT JOIN go_v2_matches match ON match.stage_id = stage.id
       LEFT JOIN go_v2_tournament_state state ON state.tournament_id = stage.tournament_id
       LEFT JOIN go_v2_schedule_assignments assignment
         ON assignment.schedule_version_id = state.active_schedule_version_id
        AND assignment.match_id = match.id
       WHERE stage.tournament_id = $1
         AND stage.stage_type IN ('single_elimination', 'double_elimination', 'placement_match')
         AND stage.status <> 'voided'
       ORDER BY stage.stage_order, stage.id, match.round_no, match.position, match.id`,
      [tournamentId],
    );
    const downstreamStages = new Map<string, {
      stageId: string;
      stageKey: string;
      stageType: string;
      tier: string | null;
      status: string;
    }>();
    const blockers: GoV2QualificationCorrectionBlocker[] = result.rows.slice(1)
      .filter((row) => String(row.stage_id) === groupStageId)
      .map((row) => ({
        code: 'QUALIFICATION_CASCADE_GROUP_DESCENDANT_REPLAY_REQUIRED',
        message: 'A corrected group match feeds another group match; qualification cannot be rebuilt until that match is replayed.',
        matchId: String(row.id),
        stageId: groupStageId,
      }));
    let requiresAtomicScheduleReplan = false;
    for (const row of downstream.rows) {
      const stageId = String(row.stage_id);
      downstreamStages.set(stageId, {
        stageId,
        stageKey: String(row.stage_key),
        stageType: String(row.stage_type),
        tier: row.tier ? String(row.tier) : null,
        status: String(row.stage_status),
      });
      if (!row.match_id) continue;
      const matchId = String(row.match_id);
      if (
        String(row.stage_type) === 'placement_match'
        && !blockers.some((blocker) => (
          blocker.code === 'QUALIFICATION_CASCADE_PLACEMENT_STRATEGY_UNSUPPORTED'
          && blocker.stageId === stageId
        ))
      ) {
        blockers.push({
          code: 'QUALIFICATION_CASCADE_PLACEMENT_STRATEGY_UNSUPPORTED',
          message: 'This materialized placement strategy cannot yet rebind qualification ENTRY slots safely.',
          stageId,
          details: { stageKey: String(row.stage_key) },
        });
      }
      const match = {
        matchId,
        playState: String(row.play_state),
        scheduleState: String(row.schedule_state),
        currentResultRevisionNo: numeric(row.current_result_revision_no),
      };
      affectedById.set(matchId, match);
      if (row.schedule_assignment_id) {
        requiresAtomicScheduleReplan = true;
      }
      if (
        ['ready', 'live', 'final'].includes(match.playState)
        || match.currentResultRevisionNo > 0
      ) {
        blockers.push({
          code: 'QUALIFICATION_DOWNSTREAM_PROGRESS_LOCKED',
          message: 'A qualification-seeded downstream match has started or already has a result revision.',
          matchId,
          stageId,
          details: {
            playState: match.playState,
            currentResultRevisionNo: match.currentResultRevisionNo,
          },
        });
      }
    }
    const activeSchedule = await loadQualificationCascadeScheduleContext(client, tournamentId);
    requiresAtomicScheduleReplan = requiresAtomicScheduleReplan || activeSchedule !== null;
    qualificationCorrection = {
      groupStageId,
      standingSnapshotId,
      qualificationSnapshotId,
      rulesSnapshot: record(locked.rules_snapshot),
      before: { standingRows, qualificationRows },
      downstreamStages: [...downstreamStages.values()],
      blockers,
      capabilities: {
        cascadeVoidAndReplay: {
          available: !blockers.some((blocker) => (
            blocker.code === 'QUALIFICATION_CASCADE_GROUP_DESCENDANT_REPLAY_REQUIRED'
            || blocker.code === 'QUALIFICATION_CASCADE_PLACEMENT_STRATEGY_UNSUPPORTED'
          )),
          requiresAtomicRematerialization: true,
          requiresAtomicScheduleReplan,
        },
        retainProgressionOverride: {
          available: true,
          requiredRole: 'admin',
          preservesBracketParticipants: true,
        },
      },
      activeSchedule,
    };
  }
  const affectedMatches = [...affectedById.values()]
    .sort((left, right) => stableTextCompare(left.matchId, right.matchId));
  const qualificationHasRedState = Boolean(qualificationCorrection) && affectedMatches.some((match) => (
    ['ready', 'live', 'final'].includes(match.playState)
    || ['scheduled', 'locked'].includes(match.scheduleState)
  ));
  const risk: GoV2Risk = qualificationHasRedState
    ? 'red'
    : affectedMatches.some((match) => match.playState === 'live' || match.playState === 'final')
    ? 'red'
    : affectedMatches.some((match) =>
        match.playState === 'ready' || ['scheduled', 'locked'].includes(match.scheduleState))
      ? 'amber'
      : qualificationCorrection
        ? 'amber'
        : 'green';
  return { triggerMatchId, risk, affectedMatches, qualificationCorrection };
}

function matchRulePreset(value: unknown): string {
  if (typeof value === 'string') return value;
  return String(record(value).preset ?? 'single_21');
}

function matchRuleDefinition(value: unknown): {
  preset: string;
  setsToWin: number;
  sets: Array<{ target: number; winBy: number; pointCap: number | null }>;
} {
  const preset = matchRulePreset(value);
  const configured = record(value);
  const configuredSets = Array.isArray(configured.sets) ? configured.sets : [];
  if (configuredSets.length) {
    return {
      preset,
      setsToWin: Number(configured.setsToWin ?? (configuredSets.length === 1 ? 1 : 2)),
      sets: configuredSets.map((rawSet) => {
        const set = record(rawSet);
        return {
          target: Number(set.targetPoints),
          winBy: Number(set.winBy ?? 2),
          pointCap: set.pointCap == null ? null : Number(set.pointCap),
        };
      }),
    };
  }
  if (preset === 'best_of_3_15') {
    return { preset, setsToWin: 2, sets: [15, 15, 15].map((target) => ({ target, winBy: 2, pointCap: null })) };
  }
  if (preset === 'best_of_3_21_15') {
    return { preset, setsToWin: 2, sets: [21, 21, 15].map((target) => ({ target, winBy: 2, pointCap: null })) };
  }
  return { preset: 'single_21', setsToWin: 1, sets: [{ target: 21, winBy: 2, pointCap: null }] };
}

function resultRatingEligibility(value: unknown, fallback: 'eligible' | 'ineligible' | 'profile_controlled'): string {
  const normalized = String(value ?? fallback);
  if (!['eligible', 'ineligible', 'profile_controlled'].includes(normalized)) {
    throw new GoV2Error(
      422,
      'INVALID_RATING_ELIGIBILITY',
      'ratingEligibility must be eligible, ineligible or profile_controlled',
    );
  }
  return normalized;
}

async function loadMatchResultContext(
  client: PoolClient,
  tournamentId: string,
  matchId: string,
): Promise<{
  teamAId: string;
  teamBId: string;
  matchRule: unknown;
  currentResultRevisionNo: number;
  scheduleState: string;
  playState: string;
}> {
  const result = await client.query(
    `SELECT
       COALESCE(NULLIF(m.match_rule, '{}'::jsonb), s.match_rule) AS match_rule,
       m.current_result_revision_no, m.schedule_state, m.play_state,
       m.is_conditional, m.condition_state,
       max(source.resolved_entry_id::text) FILTER (WHERE source.slot_no = 1) AS team_a_id,
       max(source.resolved_entry_id::text) FILTER (WHERE source.slot_no = 2) AS team_b_id
     FROM go_v2_matches m
     JOIN go_v2_stages s ON s.id = m.stage_id
     LEFT JOIN go_v2_match_slot_sources source ON source.match_id = m.id
     WHERE m.id = $1 AND m.tournament_id = $2
     GROUP BY m.id, s.match_rule`,
    [matchId, tournamentId],
  );
  if (!result.rowCount) throw new GoV2Error(404, 'MATCH_NOT_FOUND', 'Match not found');
  const row = result.rows[0];
  if (row.is_conditional === true && String(row.condition_state) !== 'true') {
    throw new GoV2Error(
      409,
      'CONDITIONAL_MATCH_NOT_ACTIVE',
      'A conditional match cannot receive a result until its condition is true',
    );
  }
  if (String(row.schedule_state) === 'cancelled' || String(row.play_state) === 'voided') {
    throw new GoV2Error(
      409,
      'MATCH_RESULT_STATE_FORBIDDEN',
      'A cancelled or voided match requires an explicit administrative recovery before a result can be recorded',
    );
  }
  if (!row.team_a_id || !row.team_b_id) {
    throw new GoV2Error(409, 'MATCH_PARTICIPANTS_UNRESOLVED', 'Both match participants must be resolved before recording a result');
  }
  return {
    teamAId: String(row.team_a_id),
    teamBId: String(row.team_b_id),
    matchRule: row.match_rule,
    currentResultRevisionNo: numeric(row.current_result_revision_no),
    scheduleState: String(row.schedule_state),
    playState: String(row.play_state),
  };
}

export async function preparePlayedResultPayload(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    payload: Record<string, unknown>;
  },
): Promise<{ payload: Record<string, unknown>; impact: GoV2ImpactPreview }> {
  const context = await loadMatchResultContext(client, input.tournamentId, input.matchId);
  const score = record(input.payload.actualScore ?? input.payload.declaredResult);
  const setsInput = Array.isArray(score.sets) ? score.sets : [];
  const rule = matchRuleDefinition(context.matchRule);
  if (!setsInput.length || setsInput.length > rule.sets.length) {
    throw new GoV2Error(422, 'INVALID_SET_COUNT', `Score for ${rule.preset} has an invalid number of sets`);
  }
  let setsA = 0;
  let setsB = 0;
  let ralliesA = 0;
  let ralliesB = 0;
  const normalizedSets: Array<{ setNo: number; teamA: number; teamB: number }> = [];
  for (let index = 0; index < setsInput.length; index += 1) {
    if (setsA === rule.setsToWin || setsB === rule.setsToWin) {
      throw new GoV2Error(422, 'SETS_AFTER_MATCH_FINISHED', 'Score contains a set after the match was already won');
    }
    const rawSet = record(setsInput[index]);
    const teamA = Number(rawSet.teamA);
    const teamB = Number(rawSet.teamB);
    if (!Number.isInteger(teamA) || !Number.isInteger(teamB) || teamA < 0 || teamB < 0 || teamA === teamB) {
      throw new GoV2Error(422, 'INVALID_SET_SCORE', `Set ${index + 1} has an invalid score`);
    }
    const setRule = rule.sets[index];
    const terminal = isTerminalSetScore(teamA, teamB, {
      targetPoints: setRule.target,
      winBy: setRule.winBy,
      pointCap: setRule.pointCap,
    });
    if (!terminal) {
      throw new GoV2Error(422, 'INCOMPLETE_SET_SCORE', `Set ${index + 1} has not reached ${setRule.target} with a ${setRule.winBy}-point margin`);
    }
    if (teamA > teamB) setsA += 1;
    else setsB += 1;
    ralliesA += teamA;
    ralliesB += teamB;
    normalizedSets.push({ setNo: index + 1, teamA, teamB });
  }
  if (setsA !== rule.setsToWin && setsB !== rule.setsToWin) {
    throw new GoV2Error(422, 'MATCH_SCORE_INCOMPLETE', `A ${rule.preset} match must be played to ${rule.setsToWin} won set(s)`);
  }
  const winnerEntryId = setsA > setsB ? context.teamAId : context.teamBId;
  const loserEntryId = setsA > setsB ? context.teamBId : context.teamAId;
  const impact = await assessDownstreamImpact(client, input.tournamentId, input.matchId);
  return {
    payload: {
      ...input.payload,
      resultKind: 'played',
      incidentCause: String(input.payload.incidentCause ?? input.payload.cause ?? 'played'),
      actualScore: { sets: normalizedSets },
      declaredResult: { sets: normalizedSets },
      winnerEntryId,
      loserEntryId,
      advancementEffect: 'advance_winner',
      ratingEligibility: resultRatingEligibility(input.payload.ratingEligibility, 'eligible'),
      standingContributions: [
        {
          entryId: context.teamAId,
          matchesPlayed: 1,
          matchPoints: setsA > setsB ? 2 : 1,
          setsFor: setsA,
          setsAgainst: setsB,
          ralliesFor: ralliesA,
          ralliesAgainst: ralliesB,
          countsForRanking: true,
        },
        {
          entryId: context.teamBId,
          matchesPlayed: 1,
          matchPoints: setsB > setsA ? 2 : 1,
          setsFor: setsB,
          setsAgainst: setsA,
          ralliesFor: ralliesB,
          ralliesAgainst: ralliesA,
          countsForRanking: true,
        },
      ],
      impact,
      previousResultRevisionNo: context.currentResultRevisionNo,
      matchScheduleState: context.scheduleState,
      matchPlayState: context.playState,
    },
    impact,
  };
}

export async function prepareTechnicalResultPayload(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    payload: Record<string, unknown>;
  },
): Promise<{ payload: Record<string, unknown>; impact: GoV2ImpactPreview }> {
  const context = await loadMatchResultContext(client, input.tournamentId, input.matchId);
  const absentEntryId = String(input.payload.absentEntryId ?? input.payload.entryId ?? '');
  const suppliedWinner = String(input.payload.winnerEntryId ?? '');
  if (absentEntryId && suppliedWinner && absentEntryId === suppliedWinner) {
    throw new GoV2Error(
      422,
      'CONTRADICTORY_TECHNICAL_RESULT',
      'The absent entry cannot also be the declared technical winner',
    );
  }
  let winnerEntryId = suppliedWinner;
  if (!winnerEntryId && absentEntryId === context.teamAId) winnerEntryId = context.teamBId;
  if (!winnerEntryId && absentEntryId === context.teamBId) winnerEntryId = context.teamAId;
  if (winnerEntryId !== context.teamAId && winnerEntryId !== context.teamBId) {
    throw new GoV2Error(
      422,
      'INCIDENT_SIDE_REQUIRED',
      'Technical result requires absentEntryId/entryId or winnerEntryId matching a participant',
      { participants: [context.teamAId, context.teamBId] },
    );
  }
  const loserEntryId = winnerEntryId === context.teamAId ? context.teamBId : context.teamAId;
  const rule = matchRuleDefinition(context.matchRule);
  const wonSets = rule.setsToWin;
  const declaredSets = rule.sets.slice(0, wonSets).map((setRule, index) => ({
    setNo: index + 1,
    teamA: winnerEntryId === context.teamAId ? setRule.target : 0,
    teamB: winnerEntryId === context.teamBId ? setRule.target : 0,
  }));
  const rallies = declaredSets.reduce(
    (totals, set) => ({ a: totals.a + set.teamA, b: totals.b + set.teamB }),
    { a: 0, b: 0 },
  );
  const setsA = winnerEntryId === context.teamAId ? wonSets : 0;
  const setsB = winnerEntryId === context.teamBId ? wonSets : 0;
  const standingProfile = String(
    input.payload.standingContributionProfile
      ?? input.payload.withdrawalStandingsPolicy
      ?? 'LPV_DECLARED_SCORE',
  );
  const fivbLedger = standingProfile === 'FIVB_2026_MATCH_LEDGER';
  const withdrawalCause = input.payload.withdrawalCause == null
    ? null
    : resolveGoV2WithdrawalCauseRule(input.payload.withdrawalCause);
  const fivbLoserMatchPoints = fivbLedger && withdrawalCause
    ? withdrawalCause.fivbLoserMatchPoints
    : 0;
  const impact = await assessDownstreamImpact(client, input.tournamentId, input.matchId);
  return {
    payload: {
      ...input.payload,
      resultKind: String(input.payload.resultKind ?? 'forfeit'),
      incidentCause: String(input.payload.incidentCause ?? input.payload.cause ?? 'admin_incident'),
      actualScore: null,
      declaredResult: { sets: declaredSets, technical: true },
      winnerEntryId,
      loserEntryId,
      advancementEffect: 'advance_winner',
      ratingEligibility: resultRatingEligibility(input.payload.ratingEligibility, 'profile_controlled'),
      standingContributions: [
        {
          entryId: context.teamAId,
          matchesPlayed: 1,
          matchPoints: winnerEntryId === context.teamAId ? 2 : fivbLoserMatchPoints,
          setsFor: setsA,
          setsAgainst: setsB,
          ralliesFor: fivbLedger && winnerEntryId === context.teamAId ? 0 : rallies.a,
          ralliesAgainst: fivbLedger && winnerEntryId === context.teamAId ? 0 : rallies.b,
          countsForRanking: true,
        },
        {
          entryId: context.teamBId,
          matchesPlayed: 1,
          matchPoints: winnerEntryId === context.teamBId ? 2 : fivbLoserMatchPoints,
          setsFor: setsB,
          setsAgainst: setsA,
          ralliesFor: fivbLedger && winnerEntryId === context.teamBId ? 0 : rallies.b,
          ralliesAgainst: fivbLedger && winnerEntryId === context.teamBId ? 0 : rallies.a,
          countsForRanking: true,
        },
      ],
      impact,
      previousResultRevisionNo: context.currentResultRevisionNo,
    },
    impact,
  };
}

export async function prepareIncompleteResultPayload(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    payload: Record<string, unknown>;
  },
): Promise<{ payload: Record<string, unknown>; impact: GoV2ImpactPreview }> {
  const context = await loadMatchResultContext(client, input.tournamentId, input.matchId);
  const retiredEntryId = String(
    input.payload.retiredEntryId
      ?? input.payload.injuredEntryId
      ?? input.payload.entryId
      ?? '',
  );
  if (retiredEntryId !== context.teamAId && retiredEntryId !== context.teamBId) {
    throw new GoV2Error(
      422,
      'INCIDENT_SIDE_REQUIRED',
      'Incomplete result requires retiredEntryId/injuredEntryId matching a participant',
      { participants: [context.teamAId, context.teamBId] },
    );
  }
  const winnerEntryId = retiredEntryId === context.teamAId ? context.teamBId : context.teamAId;
  const winnerSide = winnerEntryId === context.teamAId ? 'A' : 'B';
  const score = record(input.payload.actualScore);
  const rawSets = Array.isArray(score.sets)
    ? score.sets.map((rawSet) => {
        const set = record(rawSet);
        return { teamA: Number(set.teamA), teamB: Number(set.teamB) };
      })
    : [];
  const configuredRule = matchRuleDefinition(context.matchRule);
  let completion: ReturnType<typeof completeIncompleteMatchScore>;
  try {
    completion = completeIncompleteMatchScore(
      {
        setsToWin: configuredRule.setsToWin,
        sets: configuredRule.sets.map((set) => ({
          targetPoints: set.target,
          winBy: set.winBy,
          pointCap: set.pointCap,
        })),
      },
      rawSets,
      winnerSide,
    );
  } catch (error) {
    if (error instanceof SportsDomainError) {
      throw new GoV2Error(422, error.code, error.message, { ...error.details });
    }
    throw error;
  }
  const impact = await assessDownstreamImpact(client, input.tournamentId, input.matchId);
  return {
    payload: {
      ...input.payload,
      resultKind: 'incomplete',
      incidentCause: String(input.payload.incidentCause ?? input.payload.cause ?? 'injury_retirement'),
      actualScore: { sets: completion.actualSets },
      declaredResult: { sets: completion.declaredSets, technical: true, incomplete: true },
      winnerEntryId,
      loserEntryId: retiredEntryId,
      advancementEffect: 'advance_winner',
      ratingEligibility: resultRatingEligibility(input.payload.ratingEligibility, 'eligible'),
      standingContributions: [
        {
          entryId: context.teamAId,
          matchesPlayed: 1,
          matchPoints: winnerEntryId === context.teamAId ? 2 : 1,
          setsFor: completion.setsA,
          setsAgainst: completion.setsB,
          ralliesFor: completion.actualRalliesA,
          ralliesAgainst: completion.actualRalliesB,
          countsForRanking: true,
        },
        {
          entryId: context.teamBId,
          matchesPlayed: 1,
          matchPoints: winnerEntryId === context.teamBId ? 2 : 1,
          setsFor: completion.setsB,
          setsAgainst: completion.setsA,
          ralliesFor: completion.actualRalliesB,
          ralliesAgainst: completion.actualRalliesA,
          countsForRanking: true,
        },
      ],
      impact,
      previousResultRevisionNo: context.currentResultRevisionNo,
    },
    impact,
  };
}

export async function prepareNoWinnerResultPayload(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    payload: Record<string, unknown>;
  },
): Promise<{ payload: Record<string, unknown>; impact: GoV2ImpactPreview }> {
  const context = await loadMatchResultContext(client, input.tournamentId, input.matchId);
  const resultKind = String(input.payload.resultKind ?? 'voided');
  if (resultKind !== 'mutual_no_show' && resultKind !== 'voided') {
    throw new GoV2Error(422, 'NO_WINNER_RESULT_KIND_INVALID', 'No-winner result must be mutual_no_show or voided');
  }
  const impact = await assessDownstreamImpact(client, input.tournamentId, input.matchId);
  return {
    payload: {
      ...input.payload,
      resultKind,
      incidentCause: String(input.payload.incidentCause ?? input.payload.cause ?? 'admin_incident'),
      actualScore: null,
      declaredResult: resultKind === 'mutual_no_show' ? { technical: true, sets: [] } : {},
      winnerEntryId: null,
      loserEntryId: null,
      advancementEffect: 'none',
      ratingEligibility: 'ineligible',
      standingContributions: [],
      impact,
      previousResultRevisionNo: context.currentResultRevisionNo,
    },
    impact,
  };
}

interface GoV2AutomationActor {
  actorId: string;
  reasonCode: string;
  reasonNote?: string;
}

async function autoSettleWithdrawnMatches(
  client: PoolClient,
  matchIds: string[],
  actor?: GoV2AutomationActor,
): Promise<string[]> {
  const pendingIds = [...new Set(matchIds)].filter(Boolean);
  if (!pendingIds.length) return [];
  const result = await client.query(
    `SELECT match.id::text AS match_id, match.tournament_id::text AS tournament_id,
            match.play_state, match.schedule_state,
            match.current_result_revision_no, match.is_conditional, match.condition_state,
            source.slot_no, source.resolved_entry_id::text AS entry_id,
            entry.registration_state, entry.metadata AS entry_metadata
     FROM go_v2_matches match
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     LEFT JOIN go_v2_entries entry ON entry.id = source.resolved_entry_id
     WHERE match.id::text = ANY($1::text[])
     ORDER BY match.id, source.slot_no`,
    [pendingIds],
  );
  const grouped = new Map<string, {
    tournamentId: string;
    playState: string;
    scheduleState: string;
    currentResultRevisionNo: number;
    isConditional: boolean;
    conditionState: string;
    slots: Array<{ entryId: string | null; registrationState: string; metadata: Record<string, unknown> }>;
  }>();
  for (const row of result.rows) {
    const matchId = String(row.match_id);
    const current = grouped.get(matchId) ?? {
      tournamentId: String(row.tournament_id),
      playState: String(row.play_state),
      scheduleState: String(row.schedule_state),
      currentResultRevisionNo: numeric(row.current_result_revision_no),
      isConditional: row.is_conditional === true,
      conditionState: String(row.condition_state),
      slots: [],
    };
    current.slots.push({
      entryId: row.entry_id ? String(row.entry_id) : null,
      registrationState: String(row.registration_state ?? ''),
      metadata: record(row.entry_metadata),
    });
    grouped.set(matchId, current);
  }
  const cascaded = new Set<string>();
  for (const [matchId, match] of grouped) {
    if (
      match.currentResultRevisionNo > 0
      || ['live', 'final', 'voided'].includes(match.playState)
      || (match.isConditional && match.conditionState !== 'true')
    ) continue;
    const inactive = match.slots.filter((slot) => (
      slot.entryId && ['withdrawn', 'disqualified'].includes(slot.registrationState)
    ));
    if (!inactive.length) continue;
    const resolved = match.slots.filter((slot) => slot.entryId);
    if (resolved.length < 2) {
      // The opponent will be known only after another bracket result. Remove
      // the non-game from the live schedule now; the next route resolution will
      // settle it automatically.
      await client.query(
        `UPDATE go_v2_matches SET schedule_state = 'skipped', updated_at = now()
         WHERE id = $1 AND schedule_state NOT IN ('cancelled', 'skipped')`,
        [matchId],
      );
      continue;
    }
    const metadata = inactive[0]?.metadata ?? {};
    const effectiveActor: GoV2AutomationActor = actor ?? {
      actorId: String(metadata.withdrawalActorId ?? ''),
      reasonCode: String(metadata.withdrawalReasonCode ?? 'admin_override'),
      reasonNote: metadata.withdrawalReasonNote ? String(metadata.withdrawalReasonNote) : undefined,
    };
    if (!effectiveActor.actorId) {
      throw new GoV2Error(
        409,
        'WITHDRAWAL_AUTOMATION_CONTEXT_REQUIRED',
        'A deferred withdrawal route requires the original audited actor context',
        { matchId },
      );
    }
    if (inactive.length === 2) {
      await appendResultRevision(client, {
        tournamentId: match.tournamentId,
        matchId,
        actorId: effectiveActor.actorId,
        reasonCode: effectiveActor.reasonCode,
        reasonNote: effectiveActor.reasonNote,
        resultSource: 'withdrawal',
        payload: {
          resultKind: 'mutual_no_show',
          incidentCause: 'withdrawal',
          declaredResult: { technical: true, sets: [] },
          advancementEffect: 'none',
          ratingEligibility: 'ineligible',
          standingContributions: [],
        },
      });
      await client.query(
        `UPDATE go_v2_matches SET schedule_state = 'skipped', updated_at = now() WHERE id = $1`,
        [matchId],
      );
      for (const routedId of await resolveNoWinnerDownstreamSlots(client, matchId, effectiveActor)) {
        cascaded.add(routedId);
      }
      continue;
    }
    const withdrawnEntryId = String(inactive[0].entryId);
    const tournamentId = match.tournamentId;
    const policy = String(metadata.withdrawalStandingsPolicy ?? 'LPV_PRESERVE_PLAYED_FORFEIT_FUTURE');
    const causeRule = resolveGoV2WithdrawalCauseRule(metadata.withdrawalCause);
    const technical = await prepareTechnicalResultPayload(client, {
      tournamentId,
      matchId,
      payload: {
        resultKind: causeRule.resultKind,
        absentEntryId: withdrawnEntryId,
        cause: causeRule.cause,
        withdrawalCause: causeRule.cause,
        standingContributionProfile: policy === 'FIVB_2026_MATCH_LEDGER'
          ? 'FIVB_2026_MATCH_LEDGER'
          : 'LPV_DECLARED_SCORE',
      },
    });
    await appendResultRevision(client, {
      tournamentId,
      matchId,
      actorId: effectiveActor.actorId,
      reasonCode: effectiveActor.reasonCode,
      reasonNote: effectiveActor.reasonNote,
      resultSource: 'withdrawal',
      payload: technical.payload,
    });
    await client.query(
      `UPDATE go_v2_matches SET schedule_state = 'skipped', updated_at = now() WHERE id = $1`,
      [matchId],
    );
    for (const routedId of await resolveDownstreamSlots(
      client,
      matchId,
      String(technical.payload.winnerEntryId),
      String(technical.payload.loserEntryId),
      effectiveActor,
    )) cascaded.add(routedId);
  }
  return [...cascaded].sort(stableTextCompare);
}

async function propagateRuntimeByes(
  client: PoolClient,
  matchIds: string[],
  actor?: GoV2AutomationActor,
  visited = new Set<string>(),
): Promise<string[]> {
  const cascaded = new Set<string>();
  for (const matchId of [...new Set(matchIds)].filter(Boolean)) {
    if (visited.has(matchId)) continue;
    visited.add(matchId);
    const sourceResult = await client.query(
      `SELECT match.play_state, match.current_result_revision_no,
              source.slot_no, source.source_type, source.resolved_entry_id::text AS entry_id,
              entry.registration_state
       FROM go_v2_matches match
       JOIN go_v2_match_slot_sources source ON source.match_id = match.id
       LEFT JOIN go_v2_entries entry ON entry.id = source.resolved_entry_id
       WHERE match.id = $1
       ORDER BY source.slot_no`,
      [matchId],
    );
    if (!sourceResult.rowCount) continue;
    const rows = sourceResult.rows;
    if (
      numeric(rows[0].current_result_revision_no) > 0
      || ['live', 'final', 'voided'].includes(String(rows[0].play_state))
      || !rows.some((row) => String(row.source_type) === 'BYE')
    ) continue;
    const resolvedEntries = [...new Set(rows.map((row) => String(row.entry_id ?? '')).filter(Boolean))];
    if (resolvedEntries.length > 1) continue;
    if (resolvedEntries.length === 1) {
      const [winnerEntryId] = resolvedEntries;
      const winnerRow = rows.find((row) => String(row.entry_id ?? '') === winnerEntryId);
      if (['withdrawn', 'disqualified'].includes(String(winnerRow?.registration_state ?? ''))) {
        await client.query(
          `UPDATE go_v2_matches
           SET play_state = 'voided', schedule_state = 'skipped',
               winner_entry_id = NULL, loser_entry_id = NULL,
               metadata = metadata || jsonb_build_object('byeAutoAdvance', false, 'inactiveEntryId', $2::text),
               version = version + 1, updated_at = now()
           WHERE id = $1`,
          [matchId, winnerEntryId],
        );
        for (const id of await resolveNoWinnerDownstreamSlots(client, matchId, actor, visited)) cascaded.add(id);
        continue;
      }
      await client.query(
        `UPDATE go_v2_matches
         SET play_state = 'final', schedule_state = 'skipped',
             winner_entry_id = $2, loser_entry_id = NULL,
             metadata = metadata || jsonb_build_object('byeAutoAdvance', true),
             version = version + 1, updated_at = now()
         WHERE id = $1`,
        [matchId, winnerEntryId],
      );
      for (const id of await routeRuntimeByeWinnerDownstream(
        client,
        matchId,
        winnerEntryId,
        actor,
        visited,
      )) cascaded.add(id);
      continue;
    }
    if (rows.every((row) => String(row.source_type) === 'BYE')) {
      await client.query(
        `UPDATE go_v2_matches
         SET play_state = 'voided', schedule_state = 'skipped',
             winner_entry_id = NULL, loser_entry_id = NULL,
             metadata = metadata || jsonb_build_object('byeAutoAdvance', false),
             version = version + 1, updated_at = now()
         WHERE id = $1`,
        [matchId],
      );
      for (const id of await resolveNoWinnerDownstreamSlots(client, matchId, actor, visited)) cascaded.add(id);
    }
  }
  return [...cascaded].sort(stableTextCompare);
}

async function routeRuntimeByeWinnerDownstream(
  client: PoolClient,
  matchId: string,
  winnerEntryId: string,
  actor?: GoV2AutomationActor,
  visited = new Set<string>(),
): Promise<string[]> {
  const winnerRoutes = await client.query(
    `UPDATE go_v2_match_slot_sources
     SET source_type = route_source_type,
         source_match_id = route_source_match_id,
         resolved_entry_id = $2,
         resolution_version = resolution_version + 1
     WHERE route_source_match_id = $1 AND route_source_type = 'MATCH_WINNER'
     RETURNING match_id::text`,
    [matchId, winnerEntryId],
  );
  const loserRoutes = await client.query(
    `UPDATE go_v2_match_slot_sources
     SET source_type = 'BYE', source_match_id = NULL, resolved_entry_id = NULL,
         resolution_version = resolution_version + 1
     WHERE route_source_match_id = $1 AND route_source_type = 'MATCH_LOSER'
     RETURNING match_id::text`,
    [matchId],
  );
  const targetIds = [...new Set([
    ...winnerRoutes.rows.map((row) => String(row.match_id)),
    ...loserRoutes.rows.map((row) => String(row.match_id)),
  ])];
  const cascaded = new Set(targetIds);
  for (const id of await autoSettleWithdrawnMatches(client, targetIds, actor)) cascaded.add(id);
  for (const id of await propagateRuntimeByes(client, targetIds, actor, visited)) cascaded.add(id);
  return [...cascaded].sort(stableTextCompare);
}

export async function resolveNoWinnerDownstreamSlots(
  client: PoolClient,
  matchId: string,
  actor?: GoV2AutomationActor,
  visited = new Set<string>(),
): Promise<string[]> {
  const converted = await client.query(
    `UPDATE go_v2_match_slot_sources
     SET source_type = 'BYE', source_match_id = NULL, resolved_entry_id = NULL,
         resolution_version = resolution_version + 1
     WHERE route_source_match_id = $1
       AND route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER')
     RETURNING match_id::text`,
    [matchId],
  );
  const targetIds = [...new Set(converted.rows.map((row) => String(row.match_id)))];
  const cascaded = new Set(targetIds);
  for (const id of await propagateRuntimeByes(client, targetIds, actor, visited)) cascaded.add(id);
  return [...cascaded].sort(stableTextCompare);
}

export async function resolveDownstreamSlots(
  client: PoolClient,
  matchId: string,
  winnerEntryId: string,
  loserEntryId: string,
  actor?: GoV2AutomationActor,
): Promise<string[]> {
  const result = await client.query(
    `UPDATE go_v2_match_slot_sources
     SET source_type = route_source_type,
         source_match_id = route_source_match_id,
         resolved_entry_id = CASE route_source_type
           WHEN 'MATCH_WINNER' THEN $2::uuid
           WHEN 'MATCH_LOSER' THEN $3::uuid
           ELSE resolved_entry_id
         END,
         resolution_version = resolution_version + 1
     WHERE route_source_match_id = $1
       AND route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER')
     RETURNING match_id::text`,
    [matchId, winnerEntryId, loserEntryId],
  );
  const lowerFinalist = await client.query(
    `SELECT resolved_entry_id::text AS entry_id
     FROM go_v2_match_slot_sources
     WHERE match_id = $1 AND slot_no = 2`,
    [matchId],
  );
  const resetRequired = String(lowerFinalist.rows[0]?.entry_id ?? '') === winnerEntryId;
  await client.query(
    `UPDATE go_v2_matches conditional_match
     SET condition_state = CASE WHEN $2 THEN 'true' ELSE 'false' END,
          schedule_state = CASE
            WHEN NOT $2 THEN 'skipped'
            WHEN EXISTS (
              SELECT 1
              FROM go_v2_tournament_state state
              JOIN go_v2_schedule_assignments assignment
                ON assignment.schedule_version_id = state.active_schedule_version_id
               AND assignment.match_id = conditional_match.id
              WHERE state.tournament_id = conditional_match.tournament_id
                AND assignment.is_locked = true
            ) THEN 'locked'
            WHEN EXISTS (
              SELECT 1
              FROM go_v2_tournament_state state
              JOIN go_v2_schedule_assignments assignment
                ON assignment.schedule_version_id = state.active_schedule_version_id
               AND assignment.match_id = conditional_match.id
              WHERE state.tournament_id = conditional_match.tournament_id
            ) THEN 'scheduled'
            ELSE 'unscheduled'
          END,
          updated_at = now()
     WHERE conditional_match.is_conditional = true
       AND conditional_match.condition_kind = 'grand_final_reset'
       AND EXISTS (
         SELECT 1 FROM go_v2_match_slot_sources source
          WHERE source.match_id = conditional_match.id AND source.route_source_match_id = $1
        )`,
    [matchId, resetRequired],
  );
  const targetIds = [...new Set(result.rows.map((row) => String(row.match_id)))];
  const cascaded = new Set(targetIds);
  for (const id of await autoSettleWithdrawnMatches(client, targetIds, actor)) cascaded.add(id);
  for (const id of await propagateRuntimeByes(client, targetIds, actor)) cascaded.add(id);
  return [...cascaded].sort(stableTextCompare);
}

export interface GoV2MutationMatchSnapshot {
  matchId: string;
  playState: string;
  scheduleState: string;
  winnerEntryId: string | null;
  loserEntryId: string | null;
  resultRevisionId: string | null;
  scheduleAssignmentId: string | null;
  slots: Array<Record<string, unknown>>;
}

export async function loadMutationMatchSnapshots(
  client: PoolClient,
  tournamentId: string,
  matchIds: string[],
): Promise<GoV2MutationMatchSnapshot[]> {
  const uniqueMatchIds = [...new Set(matchIds)].filter(Boolean);
  if (!uniqueMatchIds.length) return [];
  const result = await client.query(
    `SELECT match.id::text AS match_id, match.play_state, match.schedule_state,
            match.winner_entry_id::text, match.loser_entry_id::text,
            revision.id::text AS result_revision_id,
             assignment.id::text AS schedule_assignment_id,
             COALESCE(jsonb_agg(jsonb_build_object(
              'slotNo', source.slot_no,
              'sourceType', source.source_type,
              'sourceEntryId', source.source_entry_id,
              'sourcePoolId', source.source_pool_id,
              'sourceMatchId', source.source_match_id,
              'sourceRank', source.source_rank,
              'resolvedEntryId', source.resolved_entry_id
            ) ORDER BY source.slot_no) FILTER (WHERE source.match_id IS NOT NULL), '[]'::jsonb) AS slots
     FROM go_v2_matches match
     LEFT JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id AND revision.revision_no = match.current_result_revision_no
     LEFT JOIN go_v2_tournament_state state ON state.tournament_id = match.tournament_id
     LEFT JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = state.active_schedule_version_id
      AND assignment.match_id = match.id
     LEFT JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     WHERE match.tournament_id = $1 AND match.id = ANY($2::uuid[])
     GROUP BY match.id, revision.id, assignment.id`,
    [tournamentId, uniqueMatchIds],
  );
  return result.rows.map((row) => ({
    matchId: String(row.match_id),
    playState: String(row.play_state),
    scheduleState: String(row.schedule_state),
    winnerEntryId: row.winner_entry_id ? String(row.winner_entry_id) : null,
    loserEntryId: row.loser_entry_id ? String(row.loser_entry_id) : null,
    resultRevisionId: row.result_revision_id ? String(row.result_revision_id) : null,
    scheduleAssignmentId: row.schedule_assignment_id ? String(row.schedule_assignment_id) : null,
    slots: Array.isArray(row.slots) ? row.slots : [],
  }));
}

export async function appendCascadeMatchRows(
  client: PoolClient,
  batchId: string,
  rows: Array<{
    matchId: string;
    priorResultRevisionId?: string | null;
    newResultRevisionId?: string | null;
    priorScheduleAssignmentId?: string | null;
    newScheduleAssignmentId?: string | null;
    action: 'unchanged' | 'reroute' | 'void' | 'replay' | 'reschedule' | 'retain';
    risk: GoV2Risk;
    diff: Record<string, unknown>;
  }>,
): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO go_v2_cascade_mutation_matches (
         batch_id, match_id, prior_result_revision_id, new_result_revision_id,
         prior_schedule_assignment_id, new_schedule_assignment_id,
         action, risk, diff_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (batch_id, match_id) DO UPDATE SET
         prior_result_revision_id = EXCLUDED.prior_result_revision_id,
         new_result_revision_id = EXCLUDED.new_result_revision_id,
         prior_schedule_assignment_id = EXCLUDED.prior_schedule_assignment_id,
         new_schedule_assignment_id = EXCLUDED.new_schedule_assignment_id,
         action = EXCLUDED.action, risk = EXCLUDED.risk, diff_payload = EXCLUDED.diff_payload`,
      [
        batchId,
        row.matchId,
        row.priorResultRevisionId ?? null,
        row.newResultRevisionId ?? null,
        row.priorScheduleAssignmentId ?? null,
        row.newScheduleAssignmentId ?? null,
        row.action,
        row.risk,
        JSON.stringify(row.diff),
      ],
    );
  }
}

export async function resetDownstreamForReplay(
  client: PoolClient,
  input: {
    tournamentId: string;
    impact: GoV2ImpactPreview;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
    allowScheduledReplacement?: boolean;
  },
): Promise<Array<{
  matchId: string;
  priorResultRevisionId: string | null;
  newResultRevisionId: string | null;
  priorScheduleAssignmentId: string | null;
  newScheduleAssignmentId: string | null;
  action: 'replay' | 'reroute';
  risk: GoV2Risk;
  diff: Record<string, unknown>;
}>> {
  const rows = [];
  for (const affected of input.impact.affectedMatches) {
    const before = await client.query(
      `SELECT m.play_state, m.schedule_state, m.winner_entry_id, m.loser_entry_id,
              latest.id::text AS result_revision_id,
               assignment.id::text AS schedule_assignment_id,
               COALESCE(jsonb_agg(jsonb_build_object(
                'slotNo', source.slot_no,
                'sourceType', source.source_type,
                'sourceEntryId', source.source_entry_id,
                'sourcePoolId', source.source_pool_id,
                'sourceMatchId', source.source_match_id,
                'sourceRank', source.source_rank,
                'resolvedEntryId', source.resolved_entry_id
              ) ORDER BY source.slot_no) FILTER (WHERE source.match_id IS NOT NULL), '[]'::jsonb) AS slots
       FROM go_v2_matches m
       LEFT JOIN go_v2_match_result_revisions latest
         ON latest.match_id = m.id AND latest.revision_no = m.current_result_revision_no
       LEFT JOIN go_v2_tournament_state state ON state.tournament_id = m.tournament_id
       LEFT JOIN go_v2_schedule_assignments assignment
         ON assignment.schedule_version_id = state.active_schedule_version_id
        AND assignment.match_id = m.id
       LEFT JOIN go_v2_match_slot_sources source ON source.match_id = m.id
       WHERE m.id = $1 AND m.tournament_id = $2
       GROUP BY m.id, latest.id, assignment.id`,
      [affected.matchId, input.tournamentId],
    );
    if (!before.rowCount) continue;
    const prior = before.rows[0];
    if (prior.schedule_assignment_id && input.allowScheduledReplacement !== true) {
      throw new GoV2Error(
        409,
        'CASCADE_REPLAY_REQUIRES_ATOMIC_SCHEDULE_REPLAN',
        'A scheduled descendant can be replayed only together with a validated replacement schedule version',
        {
          matchId: affected.matchId,
          scheduleAssignmentId: String(prior.schedule_assignment_id),
        },
      );
    }
    let newResultRevisionId: string | null = null;
    if (affected.currentResultRevisionNo > 0 || affected.playState === 'live' || affected.playState === 'final') {
      const voidRevision = await appendResultRevision(client, {
        tournamentId: input.tournamentId,
        matchId: affected.matchId,
        actorId: input.actorId,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        resultSource: 'cascade',
        payload: {
          resultKind: 'voided',
          advancementEffect: 'none',
          ratingEligibility: 'ineligible',
          declaredResult: {},
          evidence: { cascade: true },
          standingContributions: [],
        },
      });
      newResultRevisionId = voidRevision.resultRevisionId;
    }
    await client.query(
      `UPDATE go_v2_match_slot_sources
       SET resolved_entry_id = NULL, resolution_version = resolution_version + 1
       WHERE match_id = $1 AND source_type <> 'ENTRY'`,
      [affected.matchId],
    );
    await client.query(
      `UPDATE go_v2_matches
       SET play_state = 'pending',
           schedule_state = 'unscheduled',
           condition_state = CASE
             WHEN is_conditional AND condition_kind = 'grand_final_reset' THEN 'pending'
             ELSE condition_state
           END,
           winner_entry_id = NULL, loser_entry_id = NULL, version = version + 1,
           updated_at = now()
       WHERE id = $1`,
      [affected.matchId],
    );
    rows.push({
      matchId: affected.matchId,
      priorResultRevisionId: prior.result_revision_id ? String(prior.result_revision_id) : null,
      newResultRevisionId,
      priorScheduleAssignmentId: prior.schedule_assignment_id ? String(prior.schedule_assignment_id) : null,
      newScheduleAssignmentId: null,
      action: newResultRevisionId ? 'replay' as const : 'reroute' as const,
      risk: input.impact.risk,
      diff: {
        priorPlayState: String(prior.play_state),
        priorScheduleState: String(prior.schedule_state),
        newPlayState: 'pending',
        newScheduleState: 'unscheduled',
        priorWinnerEntryId: prior.winner_entry_id ? String(prior.winner_entry_id) : null,
        priorLoserEntryId: prior.loser_entry_id ? String(prior.loser_entry_id) : null,
        priorSlots: Array.isArray(prior.slots) ? prior.slots : [],
      },
    });
  }
  const resetMatchIds = rows.map((row) => row.matchId);
  if (resetMatchIds.length) {
    // Clearing a descendant must not erase the already-final result of an
    // unaffected sibling branch (for example QF2 feeding the replayed SF).
    // Rehydrate every MATCH_* slot from its source match's current pointers;
    // affected upstream matches remain null until they are replayed.
    await client.query(
       `UPDATE go_v2_match_slot_sources source
       SET source_type = source.route_source_type,
           source_match_id = source.route_source_match_id,
           resolved_entry_id = CASE source.route_source_type
             WHEN 'MATCH_WINNER' THEN upstream.winner_entry_id
             WHEN 'MATCH_LOSER' THEN upstream.loser_entry_id
             ELSE source.resolved_entry_id
           END,
           resolution_version = resolution_version + 1
       FROM go_v2_matches upstream
       WHERE source.match_id::text = ANY($1::text[])
         AND source.route_source_match_id = upstream.id
         AND source.route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER')`,
       [resetMatchIds],
     );
  }
  return rows;
}

export async function previewCompensatingUndo(
  client: PoolClient,
  tournamentId: string,
  batchId: string,
): Promise<Record<string, unknown>> {
  const batch = await client.query(
    `SELECT batch.id, batch.mutation_kind, batch.risk, batch.state,
            batch.trigger_match_id, batch.diff_payload, batch.created_at,
            EXISTS (
              SELECT 1 FROM go_v2_cascade_mutation_batches undo
              WHERE undo.parent_batch_id = batch.id
                AND undo.mutation_kind = 'compensating_undo'
                AND undo.state = 'committed'
            ) AS already_undone
     FROM go_v2_cascade_mutation_batches batch
     WHERE batch.id = $1 AND batch.tournament_id = $2`,
    [batchId, tournamentId],
  );
  if (!batch.rowCount) throw new GoV2Error(404, 'MUTATION_BATCH_NOT_FOUND', 'Mutation batch not found');
  if (String(batch.rows[0].state) !== 'committed') {
    throw new GoV2Error(409, 'MUTATION_NOT_COMMITTED', 'Only a committed mutation can be undone');
  }
  if (batch.rows[0].already_undone === true) {
    throw new GoV2Error(409, 'MUTATION_ALREADY_UNDONE', 'This mutation already has a committed compensating undo');
  }
  const lockedQualification = await client.query(
    `SELECT qualification.id::text AS qualification_snapshot_id,
            qualification.rules_snapshot,
            source_stage.id::text AS group_stage_id,
            playoff.id::text AS playoff_stage_id, playoff.status
     FROM go_v2_cascade_mutation_matches child
     JOIN go_v2_matches match ON match.id = child.match_id
     JOIN go_v2_stages source_stage ON source_stage.id = match.stage_id
     JOIN go_v2_qualification_snapshots qualification
       ON qualification.source_stage_id = source_stage.id
     JOIN go_v2_stages playoff
       ON playoff.tournament_id = source_stage.tournament_id
      AND playoff.stage_type IN ('single_elimination', 'double_elimination', 'placement_match')
      AND playoff.status IN ('locked', 'live', 'finished')
     WHERE child.batch_id = $1
       AND source_stage.stage_type IN ('round_robin_pool', 'modified_pool_4')
     ORDER BY qualification.created_at DESC, playoff.stage_order
     LIMIT 1`,
    [batchId],
  );
  const batchDiff = record(batch.rows[0].diff_payload);
  const retainedLineage = record(batchDiff.qualificationSnapshotLineage);
  const correction = record(record(batchDiff.impact).qualificationCorrection);
  const isRetainedQualificationCorrection = (
    ['incident', 'retain_progression_override'].includes(String(batch.rows[0].mutation_kind))
    && String(batchDiff.resolution) === 'retain_progression_override'
    && Boolean(retainedLineage.qualificationSnapshotId)
    && Boolean(retainedLineage.standingSnapshotId)
    && Boolean(correction.groupStageId)
  );
  const isCascadeQualificationCorrection = (
    String(batch.rows[0].mutation_kind) === 'cascade_void_and_replay'
    && String(batchDiff.resolution) === 'cascade_void_and_replay'
    && Boolean(retainedLineage.qualificationSnapshotId)
    && Boolean(retainedLineage.standingSnapshotId)
    && Boolean(correction.groupStageId)
  );
  let qualificationUndo: Record<string, unknown> | null = null;
  if (lockedQualification.rowCount) {
    const latestQualificationSnapshotId = String(lockedQualification.rows[0].qualification_snapshot_id);
    if (!isRetainedQualificationCorrection && !isCascadeQualificationCorrection) {
      throw new GoV2Error(
        409,
        'QUALIFICATION_UNDO_REQUIRES_DEDICATED_CASCADE',
        'Undo would change a group ledger after qualification was locked; standings, tiers and schedule must be rematerialized together',
        {
          qualificationSnapshotId: latestQualificationSnapshotId,
          playoffStageId: String(lockedQualification.rows[0].playoff_stage_id),
          playoffStageStatus: String(lockedQualification.rows[0].status),
          undoCapability: { available: false, reason: 'not_a_qualification_correction_batch' },
        },
      );
    }
    if (latestQualificationSnapshotId !== String(retainedLineage.qualificationSnapshotId)) {
      throw new GoV2Error(
        409,
        'QUALIFICATION_UNDO_LINEAGE_NOT_LATEST',
        'A newer qualification correction exists; retained corrections must be undone newest first',
        {
          retainedQualificationSnapshotId: String(retainedLineage.qualificationSnapshotId),
          latestQualificationSnapshotId,
          undoCapability: { available: false, reason: 'newer_qualification_snapshot_exists' },
        },
      );
    }
    qualificationUndo = {
      available: true,
      mode: isCascadeQualificationCorrection
        ? 'cascade_void_and_replay'
        : 'retain_progression_override',
      groupStageId: String(lockedQualification.rows[0].group_stage_id),
      rulesSnapshot: record(lockedQualification.rows[0].rules_snapshot),
      priorStandingSnapshotId: String(retainedLineage.standingSnapshotId),
      priorQualificationSnapshotId: latestQualificationSnapshotId,
      originalLineage: retainedLineage,
      activeSchedule: isCascadeQualificationCorrection
        ? await loadQualificationCascadeScheduleContext(client, tournamentId)
        : null,
    };
  }
  const children = await client.query(
    `SELECT child.match_id::text AS match_id, child.prior_result_revision_id::text,
            child.new_result_revision_id::text,
            child.prior_schedule_assignment_id::text,
            child.new_schedule_assignment_id::text,
            child.action, child.risk,
            child.diff_payload, match.play_state, match.schedule_state
     FROM go_v2_cascade_mutation_matches child
     JOIN go_v2_matches match ON match.id = child.match_id
     WHERE child.batch_id = $1
     ORDER BY child.match_id`,
    [batchId],
  );
  const affectedMatches = children.rows.map((row) => ({
    matchId: String(row.match_id),
    playState: String(row.play_state),
    scheduleState: String(row.schedule_state),
    priorResultRevisionId: row.prior_result_revision_id ? String(row.prior_result_revision_id) : null,
    newResultRevisionId: row.new_result_revision_id ? String(row.new_result_revision_id) : null,
    priorScheduleAssignmentId: row.prior_schedule_assignment_id ? String(row.prior_schedule_assignment_id) : null,
    newScheduleAssignmentId: row.new_schedule_assignment_id ? String(row.new_schedule_assignment_id) : null,
    action: String(row.action),
  }));
  const risk: GoV2Risk = affectedMatches.some((match) => match.playState === 'live' || match.playState === 'final')
    ? 'red'
    : affectedMatches.some((match) => ['scheduled', 'locked'].includes(match.scheduleState))
      ? 'amber'
      : 'green';
  return {
    batchId,
    mutationKind: String(batch.rows[0].mutation_kind),
    triggerMatchId: batch.rows[0].trigger_match_id ? String(batch.rows[0].trigger_match_id) : null,
    originalRisk: String(batch.rows[0].risk),
    risk,
    affectedMatches,
    undoCapability: qualificationUndo ?? { available: true, mode: 'generic_compensating_undo' },
    qualificationUndo,
  };
}

export async function applyCompensatingUndo(
  client: PoolClient,
  tournamentId: string,
  originalBatchId: string,
  actor: { actorId: string; reasonCode: string; reasonNote?: string },
): Promise<{
  restoredRows: Array<{
    matchId: string;
    priorResultRevisionId: string | null;
    newResultRevisionId: string | null;
    priorScheduleAssignmentId: string | null;
    newScheduleAssignmentId: string | null;
    action: 'replay' | 'reroute' | 'retain';
    risk: GoV2Risk;
    diff: Record<string, unknown>;
  }>;
  qualificationUndo: Record<string, unknown> | null;
}> {
  const preview = await previewCompensatingUndo(client, tournamentId, originalBatchId);
  const childResult = await client.query(
    `SELECT child.match_id::text AS match_id, child.prior_result_revision_id::text,
            child.new_result_revision_id::text,
            child.prior_schedule_assignment_id::text,
            child.new_schedule_assignment_id::text,
            child.action, child.diff_payload, match.play_state, match.schedule_state
     FROM go_v2_cascade_mutation_matches child
     JOIN go_v2_matches match ON match.id = child.match_id
     WHERE child.batch_id = $1
     ORDER BY child.match_id`,
    [originalBatchId],
  );
  const restored = [];
  // Restore every route first. UUID ordering is unrelated to DAG ordering, and
  // compensating a downstream result before its upstream slot is restored can
  // otherwise capture/validate the wrong lineup.
  for (const child of childResult.rows) {
    if (String(child.action) === 'retain') continue;
    const matchId = String(child.match_id);
    const diff = record(child.diff_payload);
    const priorSlots = Array.isArray(diff.priorSlots) ? diff.priorSlots : [];
    for (const rawSlot of priorSlots) {
      const slot = record(rawSlot);
      if (!slot.sourceType) {
        await client.query(
          `UPDATE go_v2_match_slot_sources
           SET resolved_entry_id = $3, resolution_version = resolution_version + 1
           WHERE match_id = $1 AND slot_no = $2`,
          [matchId, Number(slot.slotNo), slot.resolvedEntryId ? String(slot.resolvedEntryId) : null],
        );
        continue;
      }
      await client.query(
        `UPDATE go_v2_match_slot_sources
         SET source_type = $3,
             source_entry_id = $4,
             source_pool_id = $5,
             source_match_id = $6,
             source_rank = $7,
             resolved_entry_id = $8,
             resolution_version = resolution_version + 1
         WHERE match_id = $1 AND slot_no = $2`,
        [
          matchId,
          Number(slot.slotNo),
          String(slot.sourceType),
          slot.sourceEntryId ? String(slot.sourceEntryId) : null,
          slot.sourcePoolId ? String(slot.sourcePoolId) : null,
          slot.sourceMatchId ? String(slot.sourceMatchId) : null,
          slot.sourceRank == null ? null : Number(slot.sourceRank),
          slot.resolvedEntryId ? String(slot.resolvedEntryId) : null,
        ],
      );
    }
  }
  for (const child of childResult.rows) {
    const matchId = String(child.match_id);
    const diff = record(child.diff_payload);
    const priorResultRevisionId = child.prior_result_revision_id
      ? String(child.prior_result_revision_id)
      : null;
    const priorScheduleAssignmentId = child.prior_schedule_assignment_id
      ? String(child.prior_schedule_assignment_id)
      : null;
    const newScheduleAssignmentId = child.new_schedule_assignment_id
      ? String(child.new_schedule_assignment_id)
      : null;
    if (String(child.action) === 'retain') {
      restored.push({
        matchId,
        priorResultRevisionId: child.new_result_revision_id ? String(child.new_result_revision_id) : null,
        newResultRevisionId: child.new_result_revision_id ? String(child.new_result_revision_id) : null,
        priorScheduleAssignmentId: newScheduleAssignmentId,
        newScheduleAssignmentId,
        action: 'retain' as const,
        risk: String(preview.risk) as GoV2Risk,
        diff: {
          compensatesBatchId: originalBatchId,
          noOp: true,
          retainedPlayState: String(child.play_state),
          retainedScheduleState: String(child.schedule_state),
        },
      });
      continue;
    }
    let winnerEntryId: string | null = null;
    let loserEntryId: string | null = null;
    if (priorResultRevisionId) {
      const prior = await client.query(
        `SELECT revision.revision_no, revision.result_kind, revision.incident_cause, revision.actual_score,
                revision.declared_result, revision.winner_entry_id::text,
                revision.loser_entry_id::text, revision.advancement_effect,
                revision.rating_eligibility, revision.evidence,
                COALESCE(jsonb_agg(jsonb_build_object(
                  'entryId', contribution.entry_id,
                  'matchesPlayed', contribution.matches_played,
                  'matchPoints', contribution.match_points,
                  'setsFor', contribution.sets_for,
                  'setsAgainst', contribution.sets_against,
                  'ralliesFor', contribution.rallies_for,
                  'ralliesAgainst', contribution.rallies_against,
                  'countsForRanking', contribution.counts_for_ranking
                )) FILTER (WHERE contribution.result_revision_id IS NOT NULL), '[]'::jsonb) AS contributions
         FROM go_v2_match_result_revisions revision
         LEFT JOIN go_v2_match_standing_contributions contribution
           ON contribution.result_revision_id = revision.id
         WHERE revision.id = $1 AND revision.match_id = $2
         GROUP BY revision.id`,
        [priorResultRevisionId, matchId],
      );
      if (!prior.rowCount) throw new GoV2Error(409, 'UNDO_REVISION_MISSING', 'Prior result revision is unavailable');
      winnerEntryId = prior.rows[0].winner_entry_id ? String(prior.rows[0].winner_entry_id) : null;
      loserEntryId = prior.rows[0].loser_entry_id ? String(prior.rows[0].loser_entry_id) : null;
      const compensatingRevision = await appendResultRevision(client, {
        tournamentId,
        matchId,
        actorId: actor.actorId,
        reasonCode: actor.reasonCode,
        reasonNote: actor.reasonNote,
        lineupSourceRevisionNo: Number(prior.rows[0].revision_no),
        resultSource: 'undo',
        payload: {
          resultKind: String(prior.rows[0].result_kind),
          incidentCause: prior.rows[0].incident_cause ? String(prior.rows[0].incident_cause) : 'compensating_undo',
          actualScore: prior.rows[0].actual_score,
          declaredResult: record(prior.rows[0].declared_result),
          winnerEntryId,
          loserEntryId,
          advancementEffect: String(prior.rows[0].advancement_effect),
          ratingEligibility: String(prior.rows[0].rating_eligibility),
          evidence: { ...record(prior.rows[0].evidence), compensatesBatchId: originalBatchId },
          standingContributions: Array.isArray(prior.rows[0].contributions) ? prior.rows[0].contributions : [],
        },
      });
      await client.query(
        `UPDATE go_v2_matches
         SET schedule_state = $2, updated_at = now()
         WHERE id = $1`,
        [
          matchId,
          String(diff.priorScheduleState ?? child.schedule_state),
        ],
      );
      child.compensating_revision_id = compensatingRevision.resultRevisionId;
    } else {
      winnerEntryId = diff.priorWinnerEntryId ? String(diff.priorWinnerEntryId) : null;
      loserEntryId = diff.priorLoserEntryId ? String(diff.priorLoserEntryId) : null;
      await client.query(
        `UPDATE go_v2_matches
         SET current_result_revision_no = 0, winner_entry_id = $4, loser_entry_id = $5,
              play_state = $2, schedule_state = $3, version = version + 1, updated_at = now()
         WHERE id = $1`,
        [
          matchId,
          String(diff.priorPlayState ?? child.play_state),
          String(diff.priorScheduleState ?? child.schedule_state),
          winnerEntryId,
          loserEntryId,
        ],
      );
      await materializeLoserRefereeDuties(client, {
        sourceMatchId: matchId,
        loserEntryId: null,
        resultRevisionNo: 0,
      });
    }
    if (winnerEntryId && loserEntryId && String(diff.resolution ?? '') !== 'retain_progression_override') {
      await resolveDownstreamSlots(client, matchId, winnerEntryId, loserEntryId, actor);
    } else if (
      winnerEntryId
      && !loserEntryId
      && String(diff.priorPlayState ?? '') === 'final'
      && String(diff.resolution ?? '') !== 'retain_progression_override'
    ) {
      await routeRuntimeByeWinnerDownstream(client, matchId, winnerEntryId, actor);
    }
    restored.push({
      matchId,
      priorResultRevisionId: child.new_result_revision_id ? String(child.new_result_revision_id) : null,
      newResultRevisionId: child.compensating_revision_id
        ? String(child.compensating_revision_id)
        : priorResultRevisionId,
      priorScheduleAssignmentId: newScheduleAssignmentId,
      newScheduleAssignmentId: priorScheduleAssignmentId,
      action: winnerEntryId ? 'retain' as const : 'reroute' as const,
      risk: String(preview.risk) as GoV2Risk,
      diff: { compensatesBatchId: originalBatchId },
    });
  }
  return {
    restoredRows: restored,
    qualificationUndo: preview.qualificationUndo
      ? record(preview.qualificationUndo)
      : null,
  };
}

export async function appendIncident(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    reasonCode: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const status = String(input.payload.status ?? 'open');
  if (!['open', 'resolved', 'dismissed'].includes(status)) {
    throw new GoV2Error(422, 'INVALID_INCIDENT_STATUS', 'Incident status must be open, resolved or dismissed');
  }
  const result = await client.query(
    `INSERT INTO go_v2_incidents (
       tournament_id, match_id, entry_id, incident_type, status,
       reason_code, details, evidence, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
     RETURNING id`,
    [
      input.tournamentId,
      input.payload.matchId ? String(input.payload.matchId) : null,
      input.payload.entryId ? String(input.payload.entryId) : null,
      String(input.payload.incidentType ?? 'admin_incident'),
      status,
      input.reasonCode,
      JSON.stringify(record(input.payload.details)),
      JSON.stringify(record(input.payload.evidence)),
      input.actorId,
    ],
  );
  return String(result.rows[0].id);
}

export async function appendCascadeBatch(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
    expectedVersion: number;
    committedVersion: number;
    mutationKind: string;
    risk: GoV2Risk;
    triggerMatchId?: string;
    parentBatchId?: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const result = await client.query(
    `INSERT INTO go_v2_cascade_mutation_batches (
       tournament_id, trigger_match_id, parent_batch_id, mutation_kind, risk,
       state, reason_code, reason_note, author_id, expected_version,
       committed_version, diff_payload, committed_at
     ) VALUES ($1, $2, $3, $4, $5, 'committed', $6, $7, $8, $9, $10, $11::jsonb, now())
     RETURNING id`,
    [
      input.tournamentId,
      input.triggerMatchId ?? null,
      input.parentBatchId ?? null,
      input.mutationKind,
      input.risk,
      input.reasonCode,
      input.reasonNote ?? null,
      input.actorId,
      input.expectedVersion,
      input.committedVersion,
      JSON.stringify(input.payload),
    ],
  );
  return String(result.rows[0].id);
}

export async function persistRegistrationLock(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
    inputHash: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const suppliedEntries = Array.isArray(input.payload.entries) ? input.payload.entries : [];
  const derivedEntries = suppliedEntries.length
    ? suppliedEntries
    : await deriveRegistrationEntries(client, input.tournamentId);
  const formatMode = String(input.payload.formatMode ?? 'groups_playoff');
  const formatTemplateId = String(
    input.payload.formatTemplateId
      ?? (formatMode === 'standalone_bracket' ? 'lpv_standalone_se_v1' : 'lpv_groups_hl_se_v1'),
  ).trim();
  let formatTemplate: ReturnType<typeof getTournamentFormatTemplateV2>;
  try {
    formatTemplate = getTournamentFormatTemplateV2(formatTemplateId);
  } catch (error) {
    if (error instanceof SportsDomainError) {
      throw new GoV2Error(422, error.code, error.message, { ...error.details });
    }
    throw error;
  }
  const templateFormatMode = formatTemplate.groupStage.enabled
    ? 'groups_playoff'
    : 'standalone_bracket';
  if (formatMode !== templateFormatMode) {
    throw new GoV2Error(
      422,
      'FORMAT_MODE_TEMPLATE_MISMATCH',
      `formatMode ${formatMode} is incompatible with ${formatTemplateId}`,
      { formatMode, formatTemplateId, expectedFormatMode: templateFormatMode },
    );
  }
  const minimumEntries = formatMode === 'standalone_bracket' ? 2 : 3;
  if (derivedEntries.length < minimumEntries || derivedEntries.length > 48) {
    throw new GoV2Error(
      derivedEntries.length === 0 ? 409 : 422,
      derivedEntries.length === 0 ? 'ENTRIES_REQUIRED' : 'INVALID_ENTRY_COUNT',
      derivedEntries.length === 0
        ? 'No confirmed pairs were found; provide payload.entries or complete the tournament roster'
        : `Registration lock for ${formatMode} requires ${minimumEntries}-48 entries`,
      { derivedEntryCount: derivedEntries.length, minimum: minimumEntries, maximum: 48, formatMode },
    );
  }
  if (derivedEntries.length === 5 && formatMode !== 'standalone_bracket') {
    throw new GoV2Error(
      422,
      'GROUP_FORMAT_UNAVAILABLE_FOR_FIVE',
      'A five-team group stage is unavailable; add a sixth team or use standalone_bracket',
      { entryCount: 5, allowedAlternatives: ['add_sixth_entry', 'standalone_bracket'] },
    );
  }
  let formatTemplateSnapshot: ReturnType<typeof materializeTournamentFormatTemplateV2>;
  try {
    formatTemplateSnapshot = materializeTournamentFormatTemplateV2({
      templateId: formatTemplate.id,
      teamCount: derivedEntries.length,
    });
  } catch (error) {
    if (error instanceof SportsDomainError) {
      throw new GoV2Error(422, error.code, error.message, { ...error.details });
    }
    throw error;
  }
  const entriesInput = derivedEntries
    .map((value, index) => {
      const entry = record(value);
      const members = Array.isArray(entry.members) ? entry.members : [];
      // The aggregate supplied by a browser/import is informational only. The
      // locked seed rating is authoritative sum(member1, member2).
      const ratingValue = deriveGoV2PairRating({ members });
      const confirmedAt = entry.confirmedAt ? String(entry.confirmedAt) : null;
      const confirmedAtMs = confirmedAt ? Date.parse(confirmedAt) : Number.MAX_SAFE_INTEGER;
      if (confirmedAt && !Number.isFinite(confirmedAtMs)) {
        throw new GoV2Error(422, 'INVALID_ENTRY_RATING', `Entry ${index + 1} has an invalid rating or confirmation time`);
      }
      return {
        ...entry,
        entryNo: Number(entry.entryNo ?? index + 1),
        ratingSnapshotValue: ratingValue,
        confirmedAt,
        stableKey: String(entry.entryId ?? entry.entryNo ?? index + 1),
        confirmedAtMs,
      };
    })
    .sort((left, right) =>
      Number(right.ratingSnapshotValue) - Number(left.ratingSnapshotValue)
      || left.confirmedAtMs - right.confirmedAtMs
      || left.stableKey.localeCompare(right.stableKey),
    )
    .map((entry, index) => ({ ...entry, initialSeed: index + 1 }));
  const entryNumbers = entriesInput.map((entry) => Number(entry.entryNo));
  if (new Set(entryNumbers).size !== entryNumbers.length) {
    throw new GoV2Error(422, 'DUPLICATE_ENTRY_NO', 'entryNo must be unique within a tournament');
  }
  const suppliedEntryIds = suppliedEntries
    .map((value) => String(record(value).entryId ?? '').trim())
    .filter(Boolean);
  if (suppliedEntryIds.length) {
    const foreignEntry = await client.query(
      `SELECT id::text AS entry_id, tournament_id::text AS tournament_id
       FROM go_v2_entries
       WHERE id::text = ANY($1::text[])
         AND tournament_id <> $2
       LIMIT 1`,
      [suppliedEntryIds, input.tournamentId],
    );
    if (foreignEntry.rowCount) {
      throw new GoV2Error(
        409,
        'ENTRY_TOURNAMENT_MISMATCH',
        'Registration lock cannot reuse an entry owned by another tournament',
        {
          entryId: String(foreignEntry.rows[0].entry_id),
          ownerTournamentId: String(foreignEntry.rows[0].tournament_id),
        },
      );
    }
  }
  const entryIds: string[] = [];
  const ratingLines: Array<{ entryId: string; ratingSum: number; seed: number }> = [];
  for (let index = 0; index < entriesInput.length; index += 1) {
    const rawEntry = record(entriesInput[index]);
    const entryNo = Number(rawEntry.entryNo ?? index + 1);
    const displayName = String(rawEntry.displayName ?? '').trim();
    if (!displayName || !Number.isInteger(entryNo) || entryNo < 1) {
      throw new GoV2Error(422, 'INVALID_ENTRY', `Entry ${index + 1} has invalid entryNo or displayName`);
    }
    const ratingValue = Number(rawEntry.ratingSnapshotValue ?? 0);
    const initialSeed = index + 1;
    if (!Number.isInteger(ratingValue) || !Number.isInteger(initialSeed) || initialSeed < 1) {
      throw new GoV2Error(422, 'INVALID_ENTRY_RATING', `Entry ${index + 1} has invalid rating or seed`);
    }
    const upserted = await client.query(
      `INSERT INTO go_v2_entries (
         id, tournament_id, entry_no, display_name, registration_state,
         rating_snapshot_value, initial_seed, confirmed_at, metadata
       ) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, 'confirmed', $5, $6,
                 COALESCE($7::timestamptz, now()), $8::jsonb)
       ON CONFLICT (tournament_id, entry_no) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         registration_state = 'confirmed',
         rating_snapshot_value = EXCLUDED.rating_snapshot_value,
         initial_seed = EXCLUDED.initial_seed,
         confirmed_at = EXCLUDED.confirmed_at,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING id`,
      [
        rawEntry.entryId ? String(rawEntry.entryId) : null,
        input.tournamentId,
        entryNo,
        displayName,
        ratingValue,
        initialSeed,
        rawEntry.confirmedAt ? String(rawEntry.confirmedAt) : null,
        JSON.stringify(record(rawEntry.metadata)),
      ],
    );
    const entryId = String(upserted.rows[0].id);
    entryIds.push(entryId);
    ratingLines.push({ entryId, ratingSum: ratingValue, seed: initialSeed });

    const members = Array.isArray(rawEntry.members) ? rawEntry.members : [];
    if (members.length !== 2) {
      throw new GoV2Error(422, 'INVALID_PAIR_ROSTER', `Entry ${entryNo} requires exactly two roster members`);
    }
    const revisionResult = await client.query(
      `INSERT INTO go_v2_roster_revisions (
         entry_id, revision_no, reason_code, reason_note, author_id
       ) VALUES (
         $1,
         COALESCE((SELECT max(revision_no) + 1 FROM go_v2_roster_revisions WHERE entry_id = $1), 1),
         $2, $3, $4
       ) RETURNING id`,
      [entryId, input.reasonCode, input.reasonNote ?? null, input.actorId],
    );
    const revisionId = String(revisionResult.rows[0].id);
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const member = record(members[memberIndex]);
      const playerId = member.playerId ? String(member.playerId) : null;
      const memberName = String(member.displayName ?? '').trim() || null;
      if (!playerId && !memberName) {
        throw new GoV2Error(422, 'INVALID_ROSTER_MEMBER', `Entry ${entryNo} member ${memberIndex + 1} is empty`);
      }
      await client.query(
        `INSERT INTO go_v2_roster_revision_members (
           roster_revision_id, member_order, player_id, display_name, rating_value
         ) VALUES ($1, $2, $3, $4, $5)`,
        [revisionId, memberIndex + 1, playerId, memberName, Number(member.ratingValue ?? 0)],
      );
    }
    await client.query(
      `UPDATE go_v2_entries SET current_roster_revision_id = $2, updated_at = now() WHERE id = $1`,
      [entryId, revisionId],
    );
  }

  // An explicit re-lock is an exact roster snapshot. Entries omitted from the
  // submitted set must no longer leak into loadSeedEntries()/the next draw.
  if (suppliedEntries.length) {
    await client.query(
      `UPDATE go_v2_entries
       SET registration_state = 'withdrawn',
           metadata = metadata || jsonb_build_object(
             'registrationRelockOmittedAt', now(),
             'registrationRelockReasonCode', $3::text
           ),
           updated_at = now()
       WHERE tournament_id = $1
         AND registration_state = 'confirmed'
         AND NOT (id = ANY($2::uuid[]))`,
      [input.tournamentId, entryIds, input.reasonCode],
    );
  }

  const ratingSnapshotInput = record(input.payload.ratingSnapshot);
  const ratingSnapshotHash = stableRepositoryHash({
    schemaVersion: Number(ratingSnapshotInput.schemaVersion ?? 1),
    sourceKind: String(ratingSnapshotInput.sourceKind ?? 'lpvolley_rating'),
    payload: ratingSnapshotInput,
    entries: ratingLines,
  });
  const ratingSnapshot = await client.query(
    `WITH inserted AS (
       INSERT INTO go_v2_rating_snapshots (
         tournament_id, schema_version, source_kind, captured_by, input_hash, payload
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (tournament_id, input_hash) DO NOTHING
       RETURNING id
     )
     SELECT id FROM inserted
     UNION ALL
     SELECT id FROM go_v2_rating_snapshots
     WHERE tournament_id = $1 AND input_hash = $5
     LIMIT 1`,
    [
      input.tournamentId,
      Number(ratingSnapshotInput.schemaVersion ?? 1),
      String(ratingSnapshotInput.sourceKind ?? 'lpvolley_rating'),
      input.actorId,
      ratingSnapshotHash,
      JSON.stringify(ratingSnapshotInput),
    ],
  );
  const ratingSnapshotId = String(ratingSnapshot.rows[0].id);
  for (const line of ratingLines) {
    await client.query(
      `INSERT INTO go_v2_rating_snapshot_entries (snapshot_id, entry_id, rating_sum, seed)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (snapshot_id, entry_id) DO NOTHING`,
      [ratingSnapshotId, line.entryId, line.ratingSum, line.seed],
    );
  }
  await client.query(
    `UPDATE go_v2_tournament_state
     SET metadata = metadata || jsonb_build_object(
           'formatMode', $2::text,
           'formatTemplateId', $3::text,
           'formatTemplateSchemaVersion', $4::int,
           'formatTemplateVersion', $5::int,
           'formatTemplateSnapshot', $6::jsonb
         ),
         updated_at = now()
     WHERE tournament_id = $1`,
    [
      input.tournamentId,
      formatMode,
      formatTemplate.id,
      formatTemplate.schemaVersion,
      formatTemplate.templateVersion,
      JSON.stringify(formatTemplateSnapshot),
    ],
  );
  return {
    entryIds,
    ratingSnapshotId,
    entryCount: entryIds.length,
    formatMode,
    formatTemplateId: formatTemplate.id,
    formatTemplateSchemaVersion: formatTemplate.schemaVersion,
    formatTemplateVersion: formatTemplate.templateVersion,
    formatTemplateSnapshot,
    source: suppliedEntries.length ? 'payload' : 'existing_roster',
  };
}

async function deriveRegistrationEntries(
  client: PoolClient,
  tournamentId: string,
): Promise<Array<Record<string, unknown>>> {
  const existing = await client.query(
    `SELECT
       entry.id::text AS entry_id, entry.entry_no, entry.display_name,
       entry.rating_snapshot_value, entry.confirmed_at, entry.metadata,
       COALESCE(jsonb_agg(jsonb_build_object(
         'playerId', member.player_id,
         'displayName', member.display_name,
         'ratingValue', member.rating_value
       ) ORDER BY member.member_order) FILTER (WHERE member.roster_revision_id IS NOT NULL), '[]'::jsonb) AS members
     FROM go_v2_entries entry
     LEFT JOIN go_v2_roster_revision_members member
       ON member.roster_revision_id = entry.current_roster_revision_id
     WHERE entry.tournament_id = $1 AND entry.registration_state = 'confirmed'
     GROUP BY entry.id
     ORDER BY entry.initial_seed NULLS LAST, entry.entry_no`,
    [tournamentId],
  );
  if (existing.rowCount && existing.rows.every((row) => Array.isArray(row.members) && row.members.length > 0)) {
    return existing.rows.map((row) => ({
      entryId: String(row.entry_id),
      entryNo: Number(row.entry_no),
      displayName: String(row.display_name),
      ratingSnapshotValue: Number(row.rating_snapshot_value ?? 0),
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      metadata: record(row.metadata),
      members: Array.isArray(row.members) ? row.members : [],
    }));
  }

  const legacyTeams = await client.query(
    `SELECT
       gt.id::text AS legacy_team_id,
       gt.seed,
       gt.team_idx,
       gt.rating_snapshot,
       p1.id::text AS player1_id,
       p1.name AS player1_name,
       p2.id::text AS player2_id,
       p2.name AS player2_name,
       COALESCE(CASE
         WHEN t.division = 'Женский' THEN p1.rating_w
         WHEN t.division = 'Микст' THEN p1.rating_mix
         ELSE p1.rating_m
       END, 0) AS player1_rating,
       COALESCE(CASE
         WHEN t.division = 'Женский' THEN p2.rating_w
         WHEN t.division = 'Микст' THEN p2.rating_mix
         ELSE p2.rating_m
       END, 0) AS player2_rating
     FROM go_team gt
     JOIN go_group gg ON gg.id = gt.group_id
     JOIN go_round gr ON gr.id = gg.round_id AND gr.round_no = 1
     JOIN tournaments t ON t.id = gr.tournament_id
     LEFT JOIN players p1 ON p1.id = gt.player1_id
     LEFT JOIN players p2 ON p2.id = gt.player2_id
     WHERE gr.tournament_id = $1
       AND COALESCE(gt.is_bye, false) = false
       AND gt.player1_id IS NOT NULL
       AND gt.player2_id IS NOT NULL
     ORDER BY gt.seed NULLS LAST, gg.group_no, gt.team_idx`,
    [tournamentId],
  );
  if (legacyTeams.rowCount) {
    return legacyTeams.rows.map((row, index) => ({
      entryNo: index + 1,
      displayName: `${String(row.player1_name ?? '')} / ${String(row.player2_name ?? '')}`,
      confirmedAt: null,
      ratingSnapshotValue: Number(row.rating_snapshot ?? 0),
      initialSeed: Number(row.seed ?? index + 1),
      metadata: { legacyTeamId: String(row.legacy_team_id) },
      members: [
        {
          playerId: String(row.player1_id),
          displayName: String(row.player1_name ?? ''),
          ratingValue: Number(row.player1_rating ?? 0),
        },
        {
          playerId: String(row.player2_id),
          displayName: String(row.player2_name ?? ''),
          ratingValue: Number(row.player2_rating ?? 0),
        },
      ],
    }));
  }

  const roster = await client.query(
    `SELECT
       tp.player_id::text AS player_id,
       p.name AS player_name,
       tp.position,
       tp.registered_at,
       COALESCE(CASE
         WHEN t.division = 'Женский' THEN p.rating_w
         WHEN t.division = 'Микст' THEN p.rating_mix
         ELSE p.rating_m
       END, 0) AS rating_value
     FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     JOIN tournaments t ON t.id = tp.tournament_id
     WHERE tp.tournament_id = $1 AND tp.is_waitlist = false
     ORDER BY tp.position, tp.registered_at, tp.player_id`,
    [tournamentId],
  );
  if (!roster.rowCount || roster.rows.length % 2 !== 0) {
    throw new GoV2Error(
      409,
      'ENTRIES_REQUIRED',
      'The confirmed participant roster does not contain complete pairs',
      {
        confirmedPlayerCount: roster.rows.length,
        required: 'an even number of players ordered as pairs, or payload.entries',
      },
    );
  }
  const pairs: Array<Record<string, unknown>> = [];
  for (let index = 0; index < roster.rows.length; index += 2) {
    const first = roster.rows[index];
    const second = roster.rows[index + 1];
    pairs.push({
      entryNo: pairs.length + 1,
      displayName: `${String(first.player_name)} / ${String(second.player_name)}`,
      confirmedAt: first.registered_at,
      ratingSnapshotValue: Number(first.rating_value ?? 0) + Number(second.rating_value ?? 0),
      members: [
        {
          playerId: String(first.player_id),
          displayName: String(first.player_name),
          ratingValue: Number(first.rating_value ?? 0),
        },
        {
          playerId: String(second.player_id),
          displayName: String(second.player_name),
          ratingValue: Number(second.rating_value ?? 0),
        },
      ],
    });
  }
  pairs.sort((left, right) => {
    const ratingDifference = Number(right.ratingSnapshotValue ?? 0) - Number(left.ratingSnapshotValue ?? 0);
    return ratingDifference || Number(left.entryNo) - Number(right.entryNo);
  });
  return pairs.map((entry, index) => ({ ...entry, entryNo: index + 1, initialSeed: index + 1 }));
}

export async function persistStageGraph(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    inputHash: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const stagesInput = Array.isArray(input.payload.stages) ? input.payload.stages : [];
  if (!stagesInput.length) {
    throw new GoV2Error(422, 'EMPTY_STAGE_GRAPH', 'At least one stage is required');
  }
  const allowedStageTypes = new Set([
    'round_robin_pool',
    'modified_pool_4',
    'tier_split',
    'single_elimination',
    'double_elimination',
    'placement_match',
  ]);
  const allowedTiers = new Set(['hard', 'medium', 'light']);
  const stageKeys = new Set<string>();
  const stageOrders = new Set<number>();
  const stages = stagesInput.map((rawStage) => {
    const stage = record(rawStage);
    const stageKey = String(stage.stageKey ?? '').trim();
    if (!stageKey) throw new GoV2Error(422, 'INVALID_STAGE', 'stageKey is required');
    if (stageKeys.has(stageKey)) {
      throw new GoV2Error(422, 'DUPLICATE_STAGE_KEY', 'stageKey must be unique inside a stage graph', { stageKey });
    }
    stageKeys.add(stageKey);
    const stageOrder = Number(stage.stageOrder);
    const stageType = String(stage.stageType ?? '');
    const tier = stage.tier == null || stage.tier === '' ? null : String(stage.tier);
    if (!Number.isSafeInteger(stageOrder) || stageOrder < 1) {
      throw new GoV2Error(422, 'INVALID_STAGE_ORDER', 'stageOrder must be a positive integer');
    }
    if (stageOrders.has(stageOrder)) {
      throw new GoV2Error(422, 'DUPLICATE_STAGE_ORDER', 'stageOrder must be unique inside a stage graph', { stageOrder });
    }
    stageOrders.add(stageOrder);
    if (!allowedStageTypes.has(stageType)) {
      throw new GoV2Error(422, 'INVALID_STAGE_TYPE', 'stageType is not supported by Tournament Engine V2');
    }
    if (tier !== null && !allowedTiers.has(tier)) {
      throw new GoV2Error(422, 'INVALID_STAGE_TIER', 'tier must be hard, medium, light or null');
    }
    return {
      stageKey,
      stageOrder,
      stageType,
      tier,
      matchRule: matchRuleJson(stage.matchRule),
      configuration: record(stage.configuration),
    };
  });

  const edgesInput = Array.isArray(input.payload.edges) ? input.payload.edges : [];
  const allowedRoutingKinds = new Set(['all', 'pool_rank', 'tier_split', 'winner', 'loser', 'custom']);
  const edgeKeys = new Set<string>();
  const edges = edgesInput.map((rawEdge) => {
    const edge = record(rawEdge);
    const fromStageKey = String(edge.fromStageKey ?? '').trim();
    const toStageKey = String(edge.toStageKey ?? '').trim();
    if (!stageKeys.has(fromStageKey) || !stageKeys.has(toStageKey)) {
      throw new GoV2Error(422, 'INVALID_STAGE_EDGE', 'Stage edge references an unknown stageKey');
    }
    if (fromStageKey === toStageKey) {
      throw new GoV2Error(422, 'STAGE_GRAPH_SELF_EDGE', 'A stage cannot depend on itself', { stageKey: fromStageKey });
    }
    const routingKind = String(edge.routingKind ?? 'all');
    if (!allowedRoutingKinds.has(routingKind)) {
      throw new GoV2Error(422, 'INVALID_STAGE_ROUTING_KIND', 'routingKind is not supported by Tournament Engine V2');
    }
    const edgeKey = `${fromStageKey}\u0000${toStageKey}\u0000${routingKind}`;
    if (edgeKeys.has(edgeKey)) {
      throw new GoV2Error(422, 'DUPLICATE_STAGE_EDGE', 'The same stage edge cannot be declared twice', {
        fromStageKey,
        toStageKey,
        routingKind,
      });
    }
    edgeKeys.add(edgeKey);
    return {
      fromStageKey,
      toStageKey,
      routingKind,
      routingConfig: record(edge.routingConfig),
    };
  });

  // A stage graph is a sports dependency DAG, not merely a set of rows that
  // happen to satisfy foreign keys. Validate it before writing any lock state.
  const adjacency = new Map(stages.map((stage) => [stage.stageKey, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.fromStageKey)?.push(edge.toStageKey);
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const path: string[] = [];
  const visit = (stageKey: string): void => {
    const state = visitState.get(stageKey);
    if (state === 'visited') return;
    if (state === 'visiting') {
      const cycleStart = Math.max(0, path.indexOf(stageKey));
      throw new GoV2Error(422, 'STAGE_GRAPH_CYCLE', 'Stage dependencies must form an acyclic graph', {
        cycle: [...path.slice(cycleStart), stageKey],
      });
    }
    visitState.set(stageKey, 'visiting');
    path.push(stageKey);
    for (const next of adjacency.get(stageKey) ?? []) visit(next);
    path.pop();
    visitState.set(stageKey, 'visited');
  };
  for (const stage of stages) visit(stage.stageKey);

  const snapshot = record(input.payload.snapshot);
  const snapshotHash = stableRepositoryHash({
    schemaVersion: Number(snapshot.schemaVersion ?? 1),
    seedSnapshot: snapshot.seedSnapshot ?? [],
    rankingRulesSnapshot: record(snapshot.rankingRulesSnapshot),
    formatSnapshot: record(snapshot.formatSnapshot),
    policySnapshot: record(snapshot.policySnapshot),
  });
  const insertedSnapshot = await client.query(
    `WITH inserted AS (
       INSERT INTO go_v2_stage_lock_snapshots (
         tournament_id, schema_version, seed_snapshot, ranking_rules_snapshot,
         format_snapshot, policy_snapshot, snapshot_hash, locked_by
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
       ON CONFLICT (tournament_id, snapshot_hash) DO NOTHING
       RETURNING id
     )
     SELECT id FROM inserted
     UNION ALL
     SELECT id FROM go_v2_stage_lock_snapshots
     WHERE tournament_id = $1 AND snapshot_hash = $7
     LIMIT 1`,
    [
      input.tournamentId,
      Number(snapshot.schemaVersion ?? 1),
      JSON.stringify(snapshot.seedSnapshot ?? []),
      JSON.stringify(record(snapshot.rankingRulesSnapshot)),
      JSON.stringify(record(snapshot.formatSnapshot)),
      JSON.stringify(record(snapshot.policySnapshot)),
      snapshotHash,
      input.actorId,
    ],
  );
  const snapshotId = String(insertedSnapshot.rows[0].id);

  const requestedStageKeys = stages.map((stage) => stage.stageKey);
  const materialized = await client.query(
    `SELECT stage.stage_key, stage.stage_order, stage.stage_type, stage.tier,
            stage.match_rule, stage.configuration
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1
       AND stage.stage_key = ANY($2::text[])
       AND EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id)
     FOR UPDATE`,
    [input.tournamentId, requestedStageKeys],
  );
  const requestedByKey = new Map(stages.map((stage) => [stage.stageKey, stage]));
  for (const row of materialized.rows) {
    const requested = requestedByKey.get(String(row.stage_key));
    if (!requested) continue;
    const storedConfig = record(row.configuration);
    const requestedComparison = requested.configuration.comparisonPolicy;
    const storedComparison = storedConfig.comparisonPolicy;
    const changed = Number(row.stage_order) !== requested.stageOrder
      || String(row.stage_type) !== requested.stageType
      || (row.tier == null ? null : String(row.tier)) !== requested.tier
      || stableRepositoryHash(record(row.match_rule)) !== stableRepositoryHash(requested.matchRule)
      || (
        requestedComparison !== undefined
        && storedComparison !== undefined
        && String(requestedComparison) !== String(storedComparison)
      );
    if (changed) {
      throw new GoV2Error(
        409,
        'MATERIALIZED_STAGE_DEFINITION_IMMUTABLE',
        'A stage with materialized matches cannot change type, order, tier or match rule; replace the draw/bracket through its dedicated preview flow',
        { stageKey: requested.stageKey },
      );
    }
  }

  const staleMaterialized = await client.query(
    `SELECT stage.stage_key
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1
       AND NOT (stage.stage_key = ANY($2::text[]))
       AND EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id)
     ORDER BY stage.stage_order
     LIMIT 1
     FOR UPDATE`,
    [input.tournamentId, requestedStageKeys],
  );
  if (staleMaterialized.rowCount) {
    throw new GoV2Error(
      409,
      'STALE_MATERIALIZED_STAGE_REQUIRES_EXPLICIT_REBUILD',
      'A materialized stage cannot be removed by replacing only the stage graph',
      { stageKey: String(staleMaterialized.rows[0].stage_key) },
    );
  }

  // Re-materialization is exact-set replacement. Old non-materialized branches
  // and their edges must not leak into the active immutable snapshot.
  await client.query(`DELETE FROM go_v2_stage_edges WHERE tournament_id = $1`, [input.tournamentId]);
  await client.query(
    `DELETE FROM go_v2_stages
     WHERE tournament_id = $1 AND NOT (stage_key = ANY($2::text[]))`,
    [input.tournamentId, requestedStageKeys],
  );

  const stageIdsByKey = new Map<string, string>();
  for (const stage of stages) {
    const inserted = await client.query(
      `INSERT INTO go_v2_stages (
         tournament_id, stage_key, stage_order, stage_type, tier, status,
         lock_snapshot_id, match_rule, configuration
       ) VALUES ($1, $2, $3, $4, $5, 'locked', $6, $7::jsonb, $8::jsonb)
       ON CONFLICT (tournament_id, stage_key) DO UPDATE SET
         stage_order = EXCLUDED.stage_order,
         stage_type = EXCLUDED.stage_type,
         tier = EXCLUDED.tier,
         status = 'locked',
         lock_snapshot_id = EXCLUDED.lock_snapshot_id,
         match_rule = EXCLUDED.match_rule,
         configuration = EXCLUDED.configuration,
         version = go_v2_stages.version + 1,
         updated_at = now()
       RETURNING id`,
      [
         input.tournamentId,
         stage.stageKey,
         stage.stageOrder,
         stage.stageType,
         stage.tier,
         snapshotId,
         JSON.stringify(stage.matchRule),
         JSON.stringify(stage.configuration),
       ],
     );
    stageIdsByKey.set(stage.stageKey, String(inserted.rows[0].id));
  }
  for (const edge of edges) {
    const fromStageId = stageIdsByKey.get(edge.fromStageKey) as string;
    const toStageId = stageIdsByKey.get(edge.toStageKey) as string;
    await client.query(
      `INSERT INTO go_v2_stage_edges (
         tournament_id, from_stage_id, to_stage_id, routing_kind, routing_config
       ) VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (from_stage_id, to_stage_id, routing_kind)
       DO UPDATE SET routing_config = EXCLUDED.routing_config`,
      [
         input.tournamentId,
         fromStageId,
         toStageId,
         edge.routingKind,
         JSON.stringify(edge.routingConfig),
       ],
     );
  }
  await client.query(
    `UPDATE go_v2_tournament_state
     SET active_stage_snapshot_id = $2, updated_at = now()
     WHERE tournament_id = $1`,
    [input.tournamentId, snapshotId],
  );
  return {
    stageSnapshotId: snapshotId,
    stages: Array.from(stageIdsByKey, ([stageKey, id]) => ({ stageKey, id })),
    edgeCount: edges.length,
  };
}

export async function prepareRosterReplacement(
  client: PoolClient,
  input: {
    tournamentId: string;
    entryId: string;
    payload: Record<string, unknown>;
  },
): Promise<{ risk: GoV2Risk; candidate: Record<string, unknown>; impact: Record<string, unknown> }> {
  const entryResult = await client.query(
    `SELECT e.id::text, e.display_name, e.initial_seed, e.rating_snapshot_value,
            e.current_roster_revision_id::text,
            COALESCE(state.lifecycle_state, 'draft') AS lifecycle_state
     FROM go_v2_entries e
     LEFT JOIN go_v2_tournament_state state ON state.tournament_id = e.tournament_id
     WHERE e.id = $1 AND e.tournament_id = $2`,
    [input.entryId, input.tournamentId],
  );
  if (!entryResult.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  const entry = entryResult.rows[0];
  if (!entry.current_roster_revision_id) {
    throw new GoV2Error(409, 'ROSTER_NOT_LOCKED', 'Entry has no current roster revision');
  }
  const memberResult = await client.query(
    `SELECT member_order, player_id::text, display_name, rating_value
     FROM go_v2_roster_revision_members
     WHERE roster_revision_id = $1
     ORDER BY member_order`,
    [entry.current_roster_revision_id],
  );
  const currentMembers = memberResult.rows.map((row) => ({
    memberOrder: Number(row.member_order),
    playerId: row.player_id ? String(row.player_id) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    ratingValue: Number(row.rating_value ?? 0),
  }));
  let members: Array<Record<string, unknown>>;
  if (Array.isArray(input.payload.members)) {
    members = input.payload.members.map((rawMember, index) => ({
      ...record(rawMember),
      memberOrder: index + 1,
    }));
  } else {
    const replaceMemberOrder = Number(input.payload.replaceMemberOrder);
    if (!Number.isInteger(replaceMemberOrder) || replaceMemberOrder < 1 || replaceMemberOrder > currentMembers.length) {
      throw new GoV2Error(422, 'INVALID_MEMBER_ORDER', 'replaceMemberOrder must point to a current roster member');
    }
    const replacement = record(input.payload.replacementMember);
    members = currentMembers.map((member) => (
      member.memberOrder === replaceMemberOrder
        ? { ...replacement, memberOrder: replaceMemberOrder }
        : { ...member }
    ));
  }
  if (members.length !== 2) {
    throw new GoV2Error(422, 'INVALID_PAIR_ROSTER', 'A roster revision requires exactly two members');
  }
  const playerIds = new Set<string>();
  const normalizedMembers = members.map((rawMember, index) => {
    const member = record(rawMember);
    const playerId = String(member.playerId ?? '').trim().toLowerCase() || null;
    const displayName = String(member.displayName ?? '').trim() || null;
    if (!playerId && !displayName) {
      throw new GoV2Error(422, 'INVALID_ROSTER_MEMBER', `Roster member ${index + 1} is empty`);
    }
    if (playerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(playerId)) {
      throw new GoV2Error(422, 'INVALID_PLAYER_ID', `Roster member ${index + 1} playerId must be a UUID`);
    }
    if (playerId && playerIds.has(playerId)) {
      throw new GoV2Error(422, 'DUPLICATE_ROSTER_MEMBER', 'The same player cannot occupy two roster positions');
    }
    if (playerId) playerIds.add(playerId);
    const ratingValue = Number(member.ratingValue ?? 0);
    if (!Number.isSafeInteger(ratingValue)) {
      throw new GoV2Error(422, 'INVALID_MEMBER_RATING', `Roster member ${index + 1} rating must be an integer`);
    }
    return { memberOrder: index + 1, playerId, displayName, ratingValue };
  });
  const memberKey = (member: { playerId: string | null; displayName: string | null; ratingValue: number }) =>
    `${member.playerId ?? ''}|${(member.displayName ?? '').trim().toLocaleLowerCase('ru-RU')}|${member.ratingValue}`;
  const changedMemberOrders = normalizedMembers
    .filter((member, index) => !currentMembers[index] || memberKey(member) !== memberKey(currentMembers[index]))
    .map((member) => member.memberOrder);
  if (currentMembers.length !== normalizedMembers.length) {
    for (let index = Math.min(currentMembers.length, normalizedMembers.length); index < Math.max(currentMembers.length, normalizedMembers.length); index += 1) {
      if (!changedMemberOrders.includes(index + 1)) changedMemberOrders.push(index + 1);
    }
  }
  if (!changedMemberOrders.length) {
    throw new GoV2Error(422, 'ROSTER_UNCHANGED', 'Replacement does not change the roster');
  }
  const activity = await client.query(
    `SELECT
       bool_or(match.play_state IN ('live', 'paused')) AS has_live,
       bool_or(match.play_state IN ('live', 'final') AND match.current_result_revision_no > 0) AS has_started,
       COALESCE(array_agg(DISTINCT match.id::text)
         FILTER (WHERE match.play_state IN ('pending', 'ready')
                   AND match.schedule_state NOT IN ('cancelled', 'skipped')), ARRAY[]::text[]) AS future_match_ids
     FROM go_v2_matches match
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     WHERE match.tournament_id = $1
       AND COALESCE(source.resolved_entry_id, source.source_entry_id) = $2`,
    [input.tournamentId, input.entryId],
  );
  const hasLive = activity.rows[0]?.has_live === true;
  const hasStarted = activity.rows[0]?.has_started === true;
  const replacementPolicy = String(input.payload.replacementPolicy ?? 'LPV_LOCAL_ONE_PLAYER');
  if (!['LPV_LOCAL_ONE_PLAYER', 'FIVB_2026_NO_REPLACEMENT_AFTER_START'].includes(replacementPolicy)) {
    throw new GoV2Error(422, 'INVALID_REPLACEMENT_POLICY', 'Unknown roster replacement policy');
  }
  if (hasLive) {
    throw new GoV2Error(409, 'ENTRY_MATCH_ACTIVE', 'A roster cannot change while the entry has a live or paused match');
  }
  if (hasStarted && replacementPolicy === 'FIVB_2026_NO_REPLACEMENT_AFTER_START') {
    throw new GoV2Error(409, 'FIVB_REPLACEMENT_AFTER_START_FORBIDDEN', 'FIVB profile forbids replacement after the first match');
  }
  if (hasStarted && currentMembers.length !== normalizedMembers.length) {
    throw new GoV2Error(409, 'ROSTER_SIZE_CHANGE_AFTER_START_FORBIDDEN', 'Roster size cannot change after the first real match');
  }
  if (hasStarted && changedMemberOrders.length !== 1) {
    throw new GoV2Error(409, 'FULL_TEAM_REPLACEMENT_AFTER_START_FORBIDDEN', 'Only one player may be replaced after the stage has started');
  }
  if (hasStarted && changedMemberOrders.length === 1) {
    const changedIndex = changedMemberOrders[0] - 1;
    const currentIdentity = currentMembers[changedIndex]?.playerId
      ?? (currentMembers[changedIndex]?.displayName ?? '').trim().toLocaleLowerCase('ru-RU');
    const nextIdentity = normalizedMembers[changedIndex]?.playerId
      ?? (normalizedMembers[changedIndex]?.displayName ?? '').trim().toLocaleLowerCase('ru-RU');
    if (currentIdentity === nextIdentity) {
      throw new GoV2Error(
        409,
        'ROSTER_IDENTITY_UNCHANGED_AFTER_START',
        'After the first real match an administrative replacement must exchange one player identity, not only edit rating or spelling',
      );
    }
  }
  let baselineRosterRevisionId: string | null = null;
  if (hasStarted) {
    const baseline = await client.query(
      `WITH first_real_lineup AS (
         SELECT lineup.roster_revision_id
         FROM go_v2_match_lineup_snapshots lineup
         JOIN go_v2_matches match ON match.id = lineup.match_id
         JOIN go_v2_match_result_revisions revision
           ON revision.match_id = lineup.match_id
          AND revision.revision_no = lineup.result_revision_no
         WHERE match.tournament_id = $1 AND lineup.entry_id = $2
         ORDER BY revision.created_at, lineup.match_id, lineup.result_revision_no
         LIMIT 1
       )
       SELECT baseline.roster_revision_id::text AS roster_revision_id,
              member.player_id::text AS player_id,
              member.display_name, member.rating_value
       FROM first_real_lineup baseline
       JOIN go_v2_roster_revision_members member
         ON member.roster_revision_id = baseline.roster_revision_id
       ORDER BY member.member_order`,
      [input.tournamentId, input.entryId],
    );
    if (baseline.rows.length !== 2) {
      throw new GoV2Error(
        409,
        'ROSTER_BASELINE_MISSING_AFTER_START',
        'The immutable lineup from the first real match is required before replacing a player after start',
      );
    }
    baselineRosterRevisionId = String(baseline.rows[0].roster_revision_id);
    const baselineMembers = baseline.rows.map((row) => ({
      playerId: row.player_id ? String(row.player_id) : null,
      displayName: row.display_name ? String(row.display_name) : null,
      ratingValue: Number(row.rating_value ?? 0),
    }));
    if (!sharesGoV2OriginalPairMember(baselineMembers, normalizedMembers)) {
      throw new GoV2Error(
        409,
        'FULL_TEAM_REPLACEMENT_AFTER_START_FORBIDDEN',
        'At least one player from the immutable first-match lineup must remain after every later replacement',
        { baselineRosterRevisionId },
      );
    }
  }
  const lifecycleState = String(entry.lifecycle_state);
  const beforeDrawLock = lifecycleState === 'registration_locked';
  const risk: GoV2Risk = beforeDrawLock ? 'green' : 'amber';
  const ratingSnapshotValue = deriveGoV2PairRating({ members: normalizedMembers });
  const futureMatchIds = Array.isArray(activity.rows[0]?.future_match_ids)
    ? activity.rows[0].future_match_ids.map(String).sort(stableTextCompare)
    : [];
  const impact = {
    entryId: input.entryId,
    previousRosterRevisionId: String(entry.current_roster_revision_id),
    changedMemberOrders: changedMemberOrders.sort((left, right) => left - right),
    hasStarted,
    baselineRosterRevisionId,
    preserveDrawSlot: !beforeDrawLock,
    reseedBeforeDraw: beforeDrawLock,
    futureMatchIds,
  };
  return {
    risk,
    candidate: {
      ...input.payload,
      entryId: input.entryId,
      previousRosterRevisionId: String(entry.current_roster_revision_id),
      members: normalizedMembers,
      ratingSnapshotValue,
      replacementPolicy,
      impact,
    },
    impact,
  };
}

export async function persistRosterReplacement(
  client: PoolClient,
  input: {
    tournamentId: string;
    entryId: string;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
    inputHash: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const prepared = await prepareRosterReplacement(client, {
    tournamentId: input.tournamentId,
    entryId: input.entryId,
    payload: input.payload,
  });
  const candidate = prepared.candidate;
  if (String(candidate.previousRosterRevisionId) !== String(input.payload.previousRosterRevisionId)) {
    throw new GoV2Error(409, 'ROSTER_REVISION_CONFLICT', 'Roster changed after the replacement preview');
  }
  const revision = await client.query(
    `INSERT INTO go_v2_roster_revisions (
       entry_id, revision_no, effective_from, reason_code, reason_note, author_id
     ) VALUES (
       $1,
       COALESCE((SELECT max(revision_no) + 1 FROM go_v2_roster_revisions WHERE entry_id = $1), 1),
       now(), $2, $3, $4
     ) RETURNING id, revision_no`,
    [input.entryId, input.reasonCode, input.reasonNote ?? null, input.actorId],
  );
  const rosterRevisionId = String(revision.rows[0].id);
  const members = Array.isArray(candidate.members) ? candidate.members : [];
  for (const rawMember of members) {
    const member = record(rawMember);
    await client.query(
      `INSERT INTO go_v2_roster_revision_members (
         roster_revision_id, member_order, player_id, display_name, rating_value
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        rosterRevisionId,
        Number(member.memberOrder),
        member.playerId ? String(member.playerId) : null,
        member.displayName ? String(member.displayName) : null,
        Number(member.ratingValue ?? 0),
      ],
    );
  }
  await client.query(
    `UPDATE go_v2_entries
     SET current_roster_revision_id = $2,
         rating_snapshot_value = $3,
         updated_at = now()
     WHERE id = $1 AND tournament_id = $4`,
    [input.entryId, rosterRevisionId, Number(candidate.ratingSnapshotValue), input.tournamentId],
  );
  if (record(candidate.impact).reseedBeforeDraw === true) {
    await client.query(
      `WITH ranked AS (
         SELECT id, row_number() OVER (
           ORDER BY rating_snapshot_value DESC,
                    COALESCE(confirmed_at, created_at), id
         )::int AS seed
         FROM go_v2_entries
         WHERE tournament_id = $1 AND registration_state = 'confirmed'
       )
       UPDATE go_v2_entries entry
       SET initial_seed = ranked.seed, updated_at = now()
       FROM ranked WHERE entry.id = ranked.id`,
      [input.tournamentId],
    );
    const snapshot = await client.query(
      `INSERT INTO go_v2_rating_snapshots (
         tournament_id, schema_version, source_kind, captured_by, input_hash, payload
       ) VALUES ($1, 1, 'roster_replacement', $2, $3, $4::jsonb)
       RETURNING id`,
      [
        input.tournamentId,
        input.actorId,
        input.inputHash,
        JSON.stringify({ entryId: input.entryId, rosterRevisionId, reasonCode: input.reasonCode }),
      ],
    );
    await client.query(
      `INSERT INTO go_v2_rating_snapshot_entries (snapshot_id, entry_id, rating_sum, seed)
       SELECT $1, id, rating_snapshot_value, initial_seed
       FROM go_v2_entries
       WHERE tournament_id = $2 AND registration_state = 'confirmed'`,
      [snapshot.rows[0].id, input.tournamentId],
    );
  }
  return {
    entryId: input.entryId,
    rosterRevisionId,
    revisionNo: Number(revision.rows[0].revision_no),
    ratingSnapshotValue: Number(candidate.ratingSnapshotValue),
    impact: candidate.impact,
  };
}

interface GoV2ReserveSeedRow {
  entryId: string;
  registrationState: string;
  ratingSnapshotValue: number;
  initialSeed: number | null;
  confirmedAt: string;
}

export function planGoV2ReservePromotionSeeds(
  rows: readonly GoV2ReserveSeedRow[],
  reserveEntryId: string,
): {
  priorSeeds: Array<{ entryId: string; seed: number | null }>;
  resultingSeeds: Array<{ entryId: string; seed: number }>;
} {
  const reserve = rows.find((row) => row.entryId === reserveEntryId);
  if (!reserve || reserve.registrationState !== 'waitlist') {
    throw new GoV2Error(409, 'RESERVE_NOT_WAITLISTED', 'Only a waitlisted entry can be promoted');
  }
  const candidates = rows.filter((row) => (
    row.registrationState === 'confirmed' || row.entryId === reserveEntryId
  ));
  if (new Set(candidates.map((row) => row.entryId)).size !== candidates.length) {
    throw new GoV2Error(409, 'RESERVE_SEED_INPUT_INVALID', 'Reserve seed input contains duplicate entries');
  }
  const normalized = candidates.map((row) => {
    const confirmedAtMs = Date.parse(row.confirmedAt);
    if (!Number.isFinite(confirmedAtMs) || !Number.isSafeInteger(row.ratingSnapshotValue)) {
      throw new GoV2Error(409, 'RESERVE_SEED_INPUT_INVALID', 'Reserve seed input is not deterministic', {
        entryId: row.entryId,
      });
    }
    return { ...row, confirmedAtMs };
  });
  normalized.sort((left, right) => (
    right.ratingSnapshotValue - left.ratingSnapshotValue
    || left.confirmedAtMs - right.confirmedAtMs
    || stableTextCompare(left.entryId, right.entryId)
  ));
  return {
    priorSeeds: rows
      .filter((row) => row.registrationState === 'confirmed')
      .map((row) => ({ entryId: row.entryId, seed: row.initialSeed }))
      .sort((left, right) => (
        (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER)
        || stableTextCompare(left.entryId, right.entryId)
      )),
    resultingSeeds: normalized.map((row, index) => ({ entryId: row.entryId, seed: index + 1 })),
  };
}

export async function prepareReservePromotion(
  client: PoolClient,
  input: {
    tournamentId: string;
    reserveEntryId: string;
    payload: Record<string, unknown>;
    lock?: boolean;
  },
): Promise<{ risk: GoV2Risk; candidate: Record<string, unknown>; impact: Record<string, unknown> }> {
  const reserveResult = await client.query(
    `SELECT reserve.id::text, reserve.entry_no, reserve.display_name,
            reserve.registration_state, reserve.attendance_state,
            reserve.rating_snapshot_value, reserve.initial_seed,
            COALESCE(reserve.confirmed_at, reserve.created_at) AS confirmed_at,
            reserve.current_roster_revision_id::text,
            state.lifecycle_state, state.active_schedule_version_id::text,
            state.metadata AS tournament_metadata
     FROM go_v2_entries reserve
     JOIN go_v2_tournament_state state ON state.tournament_id = reserve.tournament_id
     WHERE reserve.id = $1 AND reserve.tournament_id = $2
     ${input.lock ? 'FOR UPDATE OF reserve, state' : ''}`,
    [input.reserveEntryId, input.tournamentId],
  );
  if (!reserveResult.rowCount) throw new GoV2Error(404, 'RESERVE_NOT_FOUND', 'Reserve entry not found');
  const reserve = reserveResult.rows[0];
  if (String(reserve.registration_state) !== 'waitlist') {
    throw new GoV2Error(409, 'RESERVE_NOT_WAITLISTED', 'Only a waitlisted entry can be promoted', {
      reserveEntryId: input.reserveEntryId,
      registrationState: String(reserve.registration_state),
    });
  }
  if (!reserve.current_roster_revision_id) {
    throw new GoV2Error(409, 'RESERVE_ROSTER_NOT_LOCKED', 'The reserve has no immutable roster revision');
  }
  const reserveMembersResult = await client.query(
    `SELECT member_order, player_id::text, display_name, rating_value
     FROM go_v2_roster_revision_members
     WHERE roster_revision_id = $1
     ORDER BY member_order`,
    [reserve.current_roster_revision_id],
  );
  if (reserveMembersResult.rows.length !== 2) {
    throw new GoV2Error(409, 'INVALID_RESERVE_PAIR_ROSTER', 'A promoted reserve must contain exactly two players');
  }
  const reserveMembers = reserveMembersResult.rows.map((row) => ({
    memberOrder: Number(row.member_order),
    playerId: row.player_id ? String(row.player_id) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    ratingValue: Number(row.rating_value ?? 0),
  }));
  const reservePlayerIds = reserveMembers
    .map((member) => member.playerId)
    .filter((playerId): playerId is string => Boolean(playerId));
  if (new Set(reservePlayerIds).size !== reservePlayerIds.length) {
    throw new GoV2Error(409, 'DUPLICATE_RESERVE_PLAYER', 'The same player cannot occupy both reserve roster positions');
  }

  const lifecycleState = String(reserve.lifecycle_state) as GoV2LifecycleState;
  const beforeDrawLock = lifecycleState === 'registration_locked';
  const afterDrawLock = [
    'draw_locked', 'stages_ready', 'bracket_locked', 'schedule_published', 'live',
  ].includes(lifecycleState);
  if (!beforeDrawLock && !afterDrawLock) {
    throw new GoV2Error(409, 'RESERVE_PROMOTION_LIFECYCLE_FORBIDDEN', 'Reserve promotion is allowed only after registration lock and before the first match', {
      lifecycleState,
    });
  }

  const activityResult = await client.query(
    `SELECT
       bool_or(match.play_state IN ('live', 'paused', 'final')
         OR match.current_result_revision_no > 0
         OR match.winner_entry_id IS NOT NULL
         OR match.loser_entry_id IS NOT NULL) AS has_match_activity,
       COALESCE(array_agg(match.id::text ORDER BY match.id)
         FILTER (WHERE match.play_state IN ('live', 'paused', 'final')
           OR match.current_result_revision_no > 0
           OR match.winner_entry_id IS NOT NULL
           OR match.loser_entry_id IS NOT NULL), ARRAY[]::text[]) AS active_match_ids
     FROM go_v2_matches match
     WHERE match.tournament_id = $1`,
    [input.tournamentId],
  );
  const activeMatchIds = Array.isArray(activityResult.rows[0]?.active_match_ids)
    ? activityResult.rows[0].active_match_ids.map(String)
    : [];
  if (activityResult.rows[0]?.has_match_activity === true) {
    throw new GoV2Error(
      409,
      'FULL_TEAM_PROMOTION_AFTER_START_FORBIDDEN',
      'A full reserve team cannot replace an entry after any real match or result has started',
      { activeMatchIds },
    );
  }

  const targetEntryId = input.payload.targetEntryId
    ? assertGoV2Uuid(input.payload.targetEntryId, 'targetEntryId')
    : null;
  if (afterDrawLock && !targetEntryId) {
    throw new GoV2Error(
      422,
      'RESERVE_TARGET_REQUIRED_AFTER_DRAW',
      'targetEntryId is required after draw lock so the exact sporting slot is preserved',
    );
  }
  if (beforeDrawLock && targetEntryId) {
    throw new GoV2Error(
      422,
      'RESERVE_TARGET_NOT_ALLOWED_BEFORE_DRAW',
      'Before draw lock the reserve joins the confirmed roster and is deterministically reseeded; no target slot is used',
    );
  }
  if (targetEntryId === input.reserveEntryId) {
    throw new GoV2Error(422, 'RESERVE_TARGET_SELF', 'A reserve cannot replace itself');
  }

  let target: QueryResultRow | null = null;
  let slotSnapshot: Array<Record<string, unknown>> = [];
  let targetPlayerIds: string[] = [];
  if (targetEntryId) {
    const targetResult = await client.query(
      `SELECT target.id::text, target.entry_no, target.display_name,
              target.registration_state, target.attendance_state,
              target.rating_snapshot_value, target.initial_seed,
              target.current_roster_revision_id::text
       FROM go_v2_entries target
       WHERE target.id = $1 AND target.tournament_id = $2
       ${input.lock ? 'FOR UPDATE OF target' : ''}`,
      [targetEntryId, input.tournamentId],
    );
    if (!targetResult.rowCount) throw new GoV2Error(404, 'RESERVE_TARGET_NOT_FOUND', 'Replacement target entry not found');
    const targetRow = targetResult.rows[0] as QueryResultRow;
    target = targetRow;
    const eligibleTarget = String(targetRow.registration_state) === 'withdrawn'
      || (
        String(targetRow.registration_state) === 'confirmed'
        && String(targetRow.attendance_state) === 'no_show'
      );
    if (!eligibleTarget) {
      throw new GoV2Error(
        409,
        'RESERVE_TARGET_NOT_WITHDRAWN_OR_NO_SHOW',
        'After draw lock a reserve may replace only a withdrawn or confirmed no-show entry',
        {
          targetEntryId,
          registrationState: String(targetRow.registration_state),
          attendanceState: String(targetRow.attendance_state),
        },
      );
    }
    if (!Number.isSafeInteger(Number(targetRow.initial_seed)) || Number(targetRow.initial_seed) < 1) {
      throw new GoV2Error(409, 'RESERVE_TARGET_SEED_MISSING', 'The selected draw slot has no locked seed');
    }
    if (!targetRow.current_roster_revision_id) {
      throw new GoV2Error(409, 'RESERVE_TARGET_ROSTER_MISSING', 'The selected draw slot has no locked roster revision');
    }
    const targetMembers = await client.query(
      `SELECT player_id::text
       FROM go_v2_roster_revision_members
       WHERE roster_revision_id = $1 AND player_id IS NOT NULL
       ORDER BY member_order`,
      [targetRow.current_roster_revision_id],
    );
    targetPlayerIds = targetMembers.rows.map((row) => String(row.player_id));

    const poolSlots = await client.query(
      `SELECT assignment.pool_id::text, assignment.slot_no, assignment.source_seed,
              stage.id::text AS stage_id
       FROM go_v2_pool_assignments assignment
       JOIN go_v2_pools pool ON pool.id = assignment.pool_id
       JOIN go_v2_stages stage ON stage.id = pool.stage_id
       WHERE stage.tournament_id = $1 AND assignment.entry_id = $2
       ORDER BY stage.stage_order, pool.pool_no, assignment.slot_no`,
      [input.tournamentId, targetEntryId],
    );
    const matchSlots = await client.query(
      `SELECT source.match_id::text, source.slot_no, source.source_type,
              source.source_entry_id::text, source.resolved_entry_id::text,
              source.resolution_version
       FROM go_v2_match_slot_sources source
       JOIN go_v2_matches match ON match.id = source.match_id
       WHERE match.tournament_id = $1
         AND (source.source_entry_id = $2 OR source.resolved_entry_id = $2)
       ORDER BY match.created_at, source.slot_no`,
      [input.tournamentId, targetEntryId],
    );
    slotSnapshot = [
      ...poolSlots.rows.map((row) => ({
        slotKind: 'POOL_ASSIGNMENT',
        stageId: String(row.stage_id),
        poolId: String(row.pool_id),
        slotNo: Number(row.slot_no),
        sourceSeed: row.source_seed == null ? null : Number(row.source_seed),
        fromEntryId: targetEntryId,
        toEntryId: input.reserveEntryId,
      })),
      ...matchSlots.rows.map((row) => ({
        slotKind: 'MATCH_SLOT',
        matchId: String(row.match_id),
        slotNo: Number(row.slot_no),
        sourceType: String(row.source_type),
        sourceEntryId: row.source_entry_id ? String(row.source_entry_id) : null,
        resolvedEntryId: row.resolved_entry_id ? String(row.resolved_entry_id) : null,
        resolutionVersion: Number(row.resolution_version),
        fromEntryId: targetEntryId,
        toEntryId: input.reserveEntryId,
      })),
    ];
    if (!slotSnapshot.length) {
      throw new GoV2Error(409, 'RESERVE_TARGET_SLOT_NOT_MATERIALIZED', 'The selected entry has no materialized pool or bracket slot to preserve');
    }
    const reserveAlreadySlotted = await client.query(
      `SELECT EXISTS (
         SELECT 1
         FROM go_v2_pool_assignments assignment
         JOIN go_v2_pools pool ON pool.id = assignment.pool_id
         JOIN go_v2_stages stage ON stage.id = pool.stage_id
         WHERE stage.tournament_id = $1 AND assignment.entry_id = $2
       ) OR EXISTS (
         SELECT 1
         FROM go_v2_match_slot_sources source
         JOIN go_v2_matches match ON match.id = source.match_id
         WHERE match.tournament_id = $1
           AND (source.source_entry_id = $2 OR source.resolved_entry_id = $2)
       ) AS already_slotted`,
      [input.tournamentId, input.reserveEntryId],
    );
    if (reserveAlreadySlotted.rows[0]?.already_slotted === true) {
      throw new GoV2Error(409, 'RESERVE_ALREADY_SLOTTED', 'The waitlisted reserve is already referenced by the locked structure');
    }
  }

  if (reservePlayerIds.length) {
    const conflicts = await client.query(
      `SELECT DISTINCT entry.id::text AS entry_id, member.player_id::text AS player_id
       FROM go_v2_entries entry
       JOIN go_v2_roster_revision_members member
         ON member.roster_revision_id = entry.current_roster_revision_id
       WHERE entry.tournament_id = $1
         AND entry.registration_state = 'confirmed'
         AND entry.id <> COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
         AND member.player_id = ANY($2::uuid[])
       ORDER BY entry.id, member.player_id`,
      [input.tournamentId, reservePlayerIds, targetEntryId],
    );
    if (conflicts.rowCount) {
      throw new GoV2Error(409, 'RESERVE_PLAYER_ALREADY_CONFIRMED', 'A reserve player already belongs to another confirmed entry', {
        conflicts: conflicts.rows.map((row) => ({
          entryId: String(row.entry_id),
          playerId: String(row.player_id),
        })),
      });
    }
  }

  const allEntriesResult = await client.query(
    `SELECT id::text, registration_state, rating_snapshot_value, initial_seed,
            COALESCE(confirmed_at, created_at) AS confirmed_at
     FROM go_v2_entries
     WHERE tournament_id = $1
       AND (registration_state = 'confirmed' OR id = $2)
     ORDER BY id`,
    [input.tournamentId, input.reserveEntryId],
  );
  const seedRows: GoV2ReserveSeedRow[] = allEntriesResult.rows.map((row) => ({
    entryId: String(row.id),
    registrationState: String(row.registration_state),
    ratingSnapshotValue: Number(row.rating_snapshot_value ?? 0),
    initialSeed: row.initial_seed == null ? null : Number(row.initial_seed),
    confirmedAt: new Date(row.confirmed_at).toISOString(),
  }));
  let priorSeeds: Array<{ entryId: string; seed: number | null }>;
  let resultingSeeds: Array<{ entryId: string; seed: number }>;
  let resultingFormatSnapshot: Record<string, unknown> | null = null;
  let lockedCapacity: number | null = null;
  if (beforeDrawLock) {
    ({ priorSeeds, resultingSeeds } = planGoV2ReservePromotionSeeds(seedRows, input.reserveEntryId));
    const teamCount = resultingSeeds.length;
    const tournamentMetadata = record(reserve.tournament_metadata);
    const lockedFormatSnapshot = record(tournamentMetadata.formatTemplateSnapshot);
    lockedCapacity = Number(lockedFormatSnapshot.teamCount);
    if (!Number.isSafeInteger(lockedCapacity) || lockedCapacity < 2 || lockedCapacity > 48) {
      throw new GoV2Error(
        409,
        'LOCKED_FORMAT_CAPACITY_MISSING',
        'Registration lock has no immutable team capacity for reserve promotion',
      );
    }
    if (teamCount > lockedCapacity) {
      throw new GoV2Error(
        409,
        'NO_RESERVE_VACANCY',
        'The locked registration quota is already full; a reserve can only fill an existing vacancy',
        {
          lockedCapacity,
          confirmedEntryCount: teamCount - 1,
          requestedEntryCount: teamCount,
        },
      );
    }
    const formatTemplateId = String(tournamentMetadata.formatTemplateId ?? '').trim();
    if (!formatTemplateId) {
      throw new GoV2Error(409, 'LOCKED_FORMAT_TEMPLATE_MISSING', 'Registration lock has no format template for deterministic reserve promotion');
    }
    if (
      String(lockedFormatSnapshot.templateId ?? '') !== formatTemplateId
      || Number(lockedFormatSnapshot.teamCount) !== lockedCapacity
    ) {
      throw new GoV2Error(
        409,
        'LOCKED_FORMAT_SNAPSHOT_MISMATCH',
        'The immutable registration capacity does not match its locked format template',
      );
    }
    // Reserve promotion consumes a vacancy in the immutable registration
    // snapshot. It must never silently expand/re-materialize the format.
    resultingFormatSnapshot = lockedFormatSnapshot;
    const existingStructure = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM go_v2_stages
         WHERE tournament_id = $1 AND status <> 'voided'
       ) AS has_structure`,
      [input.tournamentId],
    );
    if (existingStructure.rows[0]?.has_structure === true) {
      throw new GoV2Error(409, 'PRE_DRAW_STRUCTURE_ALREADY_MATERIALIZED', 'Unlock/remove the materialized structure before a pre-draw reserve promotion');
    }
  } else {
    priorSeeds = seedRows
      .filter((row) => row.registrationState === 'confirmed')
      .map((row) => ({ entryId: row.entryId, seed: row.initialSeed }));
    const targetSeed = Number(target?.initial_seed);
    resultingSeeds = priorSeeds
      .filter((row) => row.entryId !== targetEntryId)
      .map((row) => ({ entryId: row.entryId, seed: Number(row.seed) }));
    resultingSeeds.push({ entryId: input.reserveEntryId, seed: targetSeed });
    resultingSeeds.sort((left, right) => left.seed - right.seed || stableTextCompare(left.entryId, right.entryId));
  }

  const promotionMode = beforeDrawLock ? 'pre_draw_reseed' : 'post_draw_slot_replace';
  const activeScheduleVersionId = reserve.active_schedule_version_id
    ? String(reserve.active_schedule_version_id)
    : null;
  const priorEntriesSnapshot = {
    reserve: {
      entryId: input.reserveEntryId,
      entryNo: Number(reserve.entry_no),
      displayName: String(reserve.display_name),
      registrationState: String(reserve.registration_state),
      attendanceState: String(reserve.attendance_state),
      initialSeed: reserve.initial_seed == null ? null : Number(reserve.initial_seed),
      rosterRevisionId: String(reserve.current_roster_revision_id),
    },
    target: target ? {
      entryId: targetEntryId,
      entryNo: Number(target.entry_no),
      displayName: String(target.display_name),
      registrationState: String(target.registration_state),
      attendanceState: String(target.attendance_state),
      initialSeed: Number(target.initial_seed),
      rosterRevisionId: target.current_roster_revision_id ? String(target.current_roster_revision_id) : null,
    } : null,
    seeds: priorSeeds,
  };
  const resultingEntriesSnapshot = {
    reserve: {
      entryId: input.reserveEntryId,
      registrationState: 'confirmed',
      initialSeed: resultingSeeds.find((row) => row.entryId === input.reserveEntryId)?.seed ?? null,
      sourceRosterRevisionId: String(reserve.current_roster_revision_id),
    },
    target: target ? {
      entryId: targetEntryId,
      registrationState: 'withdrawn',
      initialSeed: null,
    } : null,
    seeds: resultingSeeds,
    formatSnapshot: resultingFormatSnapshot,
  };
  const sourceHash = stableRepositoryHash({
    lifecycleState,
    activeScheduleVersionId,
    reserveRosterRevisionId: String(reserve.current_roster_revision_id),
    reserveMembers,
    targetEntryId,
    priorEntriesSnapshot,
    resultingEntriesSnapshot,
    slotSnapshot,
  });
  const impact = {
    promotionMode,
    reserveEntryId: input.reserveEntryId,
    targetEntryId,
    lifecycleState,
    activeMatchIds,
    priorEntriesSnapshot,
    resultingEntriesSnapshot,
    slotDiff: slotSnapshot,
    reseedBeforeDraw: beforeDrawLock,
    preserveDrawSlot: afterDrawLock,
    lockedCapacity,
    vacanciesBeforePromotion: beforeDrawLock && lockedCapacity !== null
      ? lockedCapacity - priorSeeds.length
      : null,
    vacanciesAfterPromotion: beforeDrawLock && lockedCapacity !== null
      ? lockedCapacity - resultingSeeds.length
      : null,
    priorScheduleVersionId: activeScheduleVersionId,
    requiresSuccessorSchedule: Boolean(activeScheduleVersionId),
  };
  return {
    risk: afterDrawLock ? 'amber' : 'green',
    candidate: {
      reserveEntryId: input.reserveEntryId,
      targetEntryId,
      promotionMode,
      lifecycleState,
      sourceHash,
      reserveRosterRevisionId: String(reserve.current_roster_revision_id),
      reserveMembers,
      reservePlayerIds,
      targetPlayerIds,
      priorEntriesSnapshot,
      resultingEntriesSnapshot,
      slotDiff: slotSnapshot,
      resultingFormatSnapshot,
      lockedCapacity,
      priorScheduleVersionId: activeScheduleVersionId,
      requiresSuccessorSchedule: Boolean(activeScheduleVersionId),
      impact,
    },
    impact,
  };
}

export async function persistReservePromotion(
  client: PoolClient,
  input: {
    tournamentId: string;
    reserveEntryId: string;
    aggregateVersion: number;
    actorId: string;
    commandId: string;
    reasonCode: string;
    reasonNote?: string;
    inputHash: string;
    previewInputHash: string;
    previewId: string;
    redApprovalId?: string | null;
    payload: Record<string, unknown>;
    successorScheduleVersionId?: string | null;
  },
): Promise<Record<string, unknown>> {
  if (input.reasonCode !== 'reserve_promoted') {
    throw new GoV2Error(422, 'RESERVE_PROMOTION_REASON_MISMATCH', 'reasonCode must be reserve_promoted');
  }
  const reasonNote = String(input.reasonNote ?? '').trim();
  if (!reasonNote) throw new GoV2Error(422, 'REASON_NOTE_REQUIRED', 'Reserve promotion requires a director note');
  // commitGoV2Operation has already re-read and locked the reserve/target
  // facts and independently validated the frozen successor assignments. Do
  // not prepare or solve again here: persistScheduleVersion may already have
  // advanced the active schedule pointer inside this same atomic transaction.
  const candidate = input.payload;
  const promotionMode = String(candidate.promotionMode);
  const targetEntryId = candidate.targetEntryId ? String(candidate.targetEntryId) : null;
  const priorScheduleVersionId = candidate.priorScheduleVersionId
    ? String(candidate.priorScheduleVersionId)
    : null;
  const successorScheduleVersionId = input.successorScheduleVersionId ?? null;
  if (Boolean(priorScheduleVersionId) !== Boolean(successorScheduleVersionId)) {
    throw new GoV2Error(409, 'RESERVE_PROMOTION_SCHEDULE_LINEAGE_MISMATCH', 'Reserve promotion schedule lineage does not match its immutable preview');
  }

  const rosterRevision = await client.query(
    `INSERT INTO go_v2_roster_revisions (
       entry_id, revision_no, effective_from, reason_code, reason_note, author_id
     ) VALUES (
       $1,
       COALESCE((SELECT max(revision_no) + 1 FROM go_v2_roster_revisions WHERE entry_id = $1), 1),
       now(), $2, $3, $4
     ) RETURNING id::text, revision_no`,
    [input.reserveEntryId, input.reasonCode, reasonNote, input.actorId],
  );
  const reserveRosterRevisionId = String(rosterRevision.rows[0].id);
  const rosterMembersInserted = await client.query(
    `INSERT INTO go_v2_roster_revision_members (
       roster_revision_id, member_order, player_id, display_name, rating_value
     )
     SELECT $1, member_order, player_id, display_name, rating_value
     FROM go_v2_roster_revision_members
     WHERE roster_revision_id = $2
     ORDER BY member_order`,
    [reserveRosterRevisionId, String(candidate.reserveRosterRevisionId)],
  );
  if (rosterMembersInserted.rowCount !== 2) {
    throw new GoV2Error(409, 'RESERVE_ROSTER_PREVIEW_STALE', 'The reserve roster changed after preview');
  }

  if (promotionMode === 'pre_draw_reseed') {
    const resultingSeeds = Array.isArray(record(candidate.resultingEntriesSnapshot).seeds)
      ? record(candidate.resultingEntriesSnapshot).seeds as Array<Record<string, unknown>>
      : [];
    const promoted = await client.query(
      `UPDATE go_v2_entries
       SET registration_state = 'confirmed',
           current_roster_revision_id = $3,
           confirmed_at = COALESCE(confirmed_at, now()),
           metadata = metadata || jsonb_build_object(
             'reservePromotedAt', now(),
             'reservePromotionPreviewId', $4::text
           ),
           updated_at = now()
       WHERE id = $1 AND tournament_id = $2 AND registration_state = 'waitlist'`,
      [input.reserveEntryId, input.tournamentId, reserveRosterRevisionId, input.previewId],
    );
    if (promoted.rowCount !== 1) {
      throw new GoV2Error(409, 'RESERVE_PROMOTION_PREVIEW_STALE', 'The reserve is no longer waitlisted');
    }
    for (const rawSeed of resultingSeeds) {
      const seed = record(rawSeed);
      const reseeded = await client.query(
        `UPDATE go_v2_entries SET initial_seed = $3, updated_at = now()
         WHERE id = $1 AND tournament_id = $2 AND registration_state = 'confirmed'`,
        [String(seed.entryId), input.tournamentId, Number(seed.seed)],
      );
      if (reseeded.rowCount !== 1) {
        throw new GoV2Error(409, 'RESERVE_PROMOTION_PREVIEW_STALE', 'A reseeded entry changed after preview', {
          entryId: String(seed.entryId),
        });
      }
    }
    const stateUpdated = await client.query(
      `UPDATE go_v2_tournament_state
       SET metadata = metadata || jsonb_build_object(
             'reservePromotionPreviewId', $2::text
           ),
           updated_at = now()
       WHERE tournament_id = $1`,
      [input.tournamentId, input.previewId],
    );
    if (stateUpdated.rowCount !== 1) {
      throw new GoV2Error(409, 'RESERVE_PROMOTION_PREVIEW_STALE', 'Tournament format state changed after preview');
    }
  } else {
    if (!targetEntryId) throw new GoV2Error(409, 'RESERVE_TARGET_REQUIRED_AFTER_DRAW', 'Promotion target disappeared');
    const withdrawnTarget = await client.query(
      `UPDATE go_v2_entries
       SET registration_state = 'withdrawn', initial_seed = NULL,
           metadata = metadata || jsonb_build_object(
             'replacedByReserveEntryId', $3::text,
             'reservePromotionPreviewId', $4::text,
             'reserveReplacedAt', now()
           ),
           updated_at = now()
       WHERE id = $1 AND tournament_id = $2`,
      [targetEntryId, input.tournamentId, input.reserveEntryId, input.previewId],
    );
    if (withdrawnTarget.rowCount !== 1) {
      throw new GoV2Error(409, 'RESERVE_PROMOTION_PREVIEW_STALE', 'The selected target changed after preview');
    }
    const resultingReserve = record(record(candidate.resultingEntriesSnapshot).reserve);
    const promoted = await client.query(
      `UPDATE go_v2_entries
       SET registration_state = 'confirmed', initial_seed = $3,
           current_roster_revision_id = $4,
           confirmed_at = COALESCE(confirmed_at, now()),
           metadata = metadata || jsonb_build_object(
             'promotedIntoEntryId', $5::text,
             'reservePromotionPreviewId', $6::text,
             'reservePromotedAt', now()
           ),
           updated_at = now()
       WHERE id = $1 AND tournament_id = $2 AND registration_state = 'waitlist'`,
      [
        input.reserveEntryId,
        input.tournamentId,
        Number(resultingReserve.initialSeed),
        reserveRosterRevisionId,
        targetEntryId,
        input.previewId,
      ],
    );
    if (promoted.rowCount !== 1) {
      throw new GoV2Error(409, 'RESERVE_PROMOTION_PREVIEW_STALE', 'The reserve is no longer waitlisted');
    }
    const reboundPools = await client.query(
      `UPDATE go_v2_pool_assignments assignment
       SET entry_id = $3, assigned_by = $4,
           assignment_reason = 'reserve_promotion'
       FROM go_v2_pools pool, go_v2_stages stage
       WHERE assignment.pool_id = pool.id
         AND pool.stage_id = stage.id
         AND stage.tournament_id = $1
         AND assignment.entry_id = $2`,
      [input.tournamentId, targetEntryId, input.reserveEntryId, input.actorId],
    );
    const reboundMatches = await client.query(
      `UPDATE go_v2_match_slot_sources source
       SET source_entry_id = CASE WHEN source.source_entry_id = $2 THEN $3 ELSE source.source_entry_id END,
           resolved_entry_id = CASE WHEN source.resolved_entry_id = $2 THEN $3 ELSE source.resolved_entry_id END,
           resolution_version = source.resolution_version + 1
       FROM go_v2_matches match
       WHERE source.match_id = match.id
         AND match.tournament_id = $1
         AND (source.source_entry_id = $2 OR source.resolved_entry_id = $2)`,
      [input.tournamentId, targetEntryId, input.reserveEntryId],
    );
    const slotDiff = Array.isArray(candidate.slotDiff) ? candidate.slotDiff.map(record) : [];
    const expectedPoolSlots = slotDiff.filter((slot) => slot.slotKind === 'POOL_ASSIGNMENT').length;
    const expectedMatchSlots = slotDiff.filter((slot) => slot.slotKind === 'MATCH_SLOT').length;
    if (
      Number(reboundPools.rowCount ?? 0) !== expectedPoolSlots
      || Number(reboundMatches.rowCount ?? 0) !== expectedMatchSlots
    ) {
      throw new GoV2Error(
        409,
        'RESERVE_PROMOTION_SLOT_PREVIEW_STALE',
        'The exact pool/bracket slot set changed after preview',
        {
          expectedPoolSlots,
          updatedPoolSlots: Number(reboundPools.rowCount ?? 0),
          expectedMatchSlots,
          updatedMatchSlots: Number(reboundMatches.rowCount ?? 0),
        },
      );
    }
  }

  const ratingSnapshot = await client.query(
    `INSERT INTO go_v2_rating_snapshots (
       tournament_id, schema_version, source_kind, captured_by, input_hash, payload
     ) VALUES ($1, 1, $2, $3, $4, $5::jsonb)
     RETURNING id::text`,
    [
      input.tournamentId,
      promotionMode === 'pre_draw_reseed' ? 'reserve_promotion_reseed' : 'reserve_promotion_slot_preserved',
      input.actorId,
      input.inputHash,
      JSON.stringify({
        reserveEntryId: input.reserveEntryId,
        targetEntryId,
        sourcePreviewId: input.previewId,
        sourceHash: candidate.sourceHash,
      }),
    ],
  );
  const ratingSnapshotId = String(ratingSnapshot.rows[0].id);
  await client.query(
    `INSERT INTO go_v2_rating_snapshot_entries (snapshot_id, entry_id, rating_sum, seed)
     SELECT $1, id, rating_snapshot_value, initial_seed
     FROM go_v2_entries
     WHERE tournament_id = $2 AND registration_state = 'confirmed'
     ORDER BY initial_seed`,
    [ratingSnapshotId, input.tournamentId],
  );

  const scheduleHash = successorScheduleVersionId
    ? String(record(input.payload.solverResult).scheduleHash ?? '')
    : null;
  const revision = await client.query(
    `INSERT INTO go_v2_reserve_promotion_revisions (
       tournament_id, reserve_entry_id, target_entry_id, promotion_mode,
       reserve_roster_revision_id, rating_snapshot_id, source_preview_id, red_approval_id,
       prior_schedule_version_id, successor_schedule_version_id, schedule_hash,
       expected_aggregate_version, resulting_aggregate_version,
       source_hash, input_hash, request_hash, prior_entries_snapshot, resulting_entries_snapshot,
       slot_diff, schedule_diff, reason_code, reason_note, actor_id, command_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb,
       $19::jsonb, $20::jsonb, $21, $22, $23, $24
     ) RETURNING id::text, created_at`,
    [
      input.tournamentId,
      input.reserveEntryId,
      targetEntryId,
      promotionMode,
      reserveRosterRevisionId,
      ratingSnapshotId,
      input.previewId,
      input.redApprovalId ?? null,
      priorScheduleVersionId,
      successorScheduleVersionId,
      scheduleHash,
      input.aggregateVersion - 1,
      input.aggregateVersion,
      String(candidate.sourceHash),
      input.previewInputHash,
      input.inputHash,
      JSON.stringify(candidate.priorEntriesSnapshot),
      JSON.stringify(candidate.resultingEntriesSnapshot),
      JSON.stringify(candidate.slotDiff),
      JSON.stringify(record(input.payload.scheduleDiff)),
      input.reasonCode,
      reasonNote,
      input.actorId,
      input.commandId,
    ],
  );
  return {
    reservePromotionRevisionId: String(revision.rows[0].id),
    reserveEntryId: input.reserveEntryId,
    targetEntryId,
    promotionMode,
    reserveRosterRevisionId,
    ratingSnapshotId,
    redApprovalId: input.redApprovalId ?? null,
    priorScheduleVersionId,
    successorScheduleVersionId,
    scheduleHash,
    slotDiff: candidate.slotDiff,
    resultingEntriesSnapshot: candidate.resultingEntriesSnapshot,
    createdAt: new Date(revision.rows[0].created_at).toISOString(),
  };
}

const WITHDRAWAL_POLICIES = new Set([
  'LPV_PRESERVE_PLAYED_FORFEIT_FUTURE',
  'FIVB_2026_MATCH_LEDGER',
  'LOCAL_REDUCE_TO_THREE_ANNUL_RESULTS',
  'LOCAL_FORFEIT_ALL',
]);

export async function prepareEntryWithdrawal(
  client: PoolClient,
  input: { tournamentId: string; entryId: string; payload: Record<string, unknown> },
): Promise<{ risk: GoV2Risk; candidate: Record<string, unknown>; impact: Record<string, unknown> }> {
  const entryResult = await client.query(
    `SELECT id::text, registration_state, display_name
     FROM go_v2_entries WHERE id = $1 AND tournament_id = $2`,
    [input.entryId, input.tournamentId],
  );
  if (!entryResult.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  if (!['confirmed', 'pending'].includes(String(entryResult.rows[0].registration_state))) {
    throw new GoV2Error(409, 'ENTRY_NOT_ACTIVE', 'Only an active entry can be withdrawn');
  }
  const policy = String(
    input.payload.withdrawalStandingsPolicy ?? 'LPV_PRESERVE_PLAYED_FORFEIT_FUTURE',
  );
  if (!WITHDRAWAL_POLICIES.has(policy)) {
    throw new GoV2Error(422, 'INVALID_WITHDRAWAL_POLICY', 'Unknown withdrawal standings policy');
  }
  const causeRule = resolveGoV2WithdrawalCauseRule(input.payload.withdrawalCause);
  const matchResult = await client.query(
    `SELECT match.id::text AS match_id, match.play_state, match.schedule_state,
            match.current_result_revision_no, stage.id::text AS stage_id,
            stage.stage_type, stage.status AS stage_status,
            match.pool_id::text, pool.capacity AS pool_capacity,
            max(COALESCE(source.resolved_entry_id, source.source_entry_id)::text)
              FILTER (WHERE COALESCE(source.resolved_entry_id, source.source_entry_id) <> $2) AS opponent_entry_id
     FROM go_v2_matches match
     JOIN go_v2_stages stage ON stage.id = match.stage_id
     LEFT JOIN go_v2_pools pool ON pool.id = match.pool_id
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     WHERE match.tournament_id = $1
     GROUP BY match.id, stage.id, pool.id
     HAVING bool_or(COALESCE(source.resolved_entry_id, source.source_entry_id) = $2)
     ORDER BY stage.stage_order, match.round_no, match.position`,
    [input.tournamentId, input.entryId],
  );
  if (matchResult.rows.some((row) => ['live', 'paused'].includes(String(row.play_state)))) {
    throw new GoV2Error(
      409,
      'ENTRY_MATCH_ACTIVE',
      'Resolve the live/paused match (resume, transfer or incomplete result) before withdrawing the team',
    );
  }
  const poolMatches = matchResult.rows.filter((row) => Boolean(row.pool_id));
  const completedPoolStage = poolMatches.length > 0 && poolMatches.every((row) => (
    String(row.stage_status) === 'finished'
    && ['final', 'voided'].includes(String(row.play_state))
  ));
  const fivbAntiDopingPoolRewrite = (
    policy === 'FIVB_2026_MATCH_LEDGER'
    && causeRule.cause === 'anti_doping_disqualification'
    && poolMatches.length > 0
    && !completedPoolStage
  );
  const preserveCompletedPoolRank = policy === 'FIVB_2026_MATCH_LEDGER' && completedPoolStage;
  if (
    policy === 'LOCAL_REDUCE_TO_THREE_ANNUL_RESULTS'
    && (
      poolMatches.length === 0
      || matchResult.rows.some((row) => (
        !row.pool_id
        || Number(row.pool_capacity) !== 4
        || String(row.stage_type) !== 'round_robin_pool'
      ))
    )
  ) {
    throw new GoV2Error(
      409,
      'REDUCE_TO_THREE_REQUIRES_RR_POOL_OF_FOUR',
      'Pool reduction is valid only for a locked round-robin pool of four',
    );
  }
  const mutatesPlayed = (
    policy === 'LOCAL_REDUCE_TO_THREE_ANNUL_RESULTS'
    || policy === 'LOCAL_FORFEIT_ALL'
    || fivbAntiDopingPoolRewrite
  );
  if (fivbAntiDopingPoolRewrite) {
    const poolStageIds = [...new Set(poolMatches.map((row) => String(row.stage_id)).filter(Boolean))];
    const qualification = await client.query(
      `SELECT qualification.id::text AS qualification_snapshot_id,
              qualification.source_stage_id::text AS source_stage_id,
              qualification.created_at
       FROM go_v2_qualification_snapshots qualification
       JOIN go_v2_stages source_stage ON source_stage.id = qualification.source_stage_id
       WHERE source_stage.tournament_id = $1
         AND qualification.source_stage_id::text = ANY($2::text[])
       ORDER BY qualification.created_at DESC
       LIMIT 1`,
      [input.tournamentId, poolStageIds],
    );
    if (qualification.rowCount) {
      throw new GoV2Error(
        409,
        'FIVB_ANTIDOPING_POOL_CASCADE_REQUIRED',
        'The anti-doping pool disqualification would invalidate an immutable qualification snapshot and requires a dedicated atomic cascade',
        {
          withdrawalCause: causeRule.cause,
          qualificationSnapshotId: String(qualification.rows[0].qualification_snapshot_id),
          sourceStageId: String(qualification.rows[0].source_stage_id),
          requiredOperation: 'anti_doping_pool_cascade',
        },
      );
    }
    for (const row of poolMatches.filter((match) => String(match.play_state) === 'final')) {
      const downstream = await assessDownstreamImpact(client, input.tournamentId, String(row.match_id));
      if (downstream.affectedMatches.length > 0) {
        throw new GoV2Error(
          409,
          'FIVB_ANTIDOPING_POOL_CASCADE_REQUIRED',
          'The anti-doping pool disqualification reaches routed matches and requires a dedicated atomic cascade',
          {
            withdrawalCause: causeRule.cause,
            triggerMatchId: String(row.match_id),
            affectedMatches: downstream.affectedMatches,
            requiredOperation: 'anti_doping_pool_cascade',
          },
        );
      }
    }
  }
  if (mutatesPlayed && !fivbAntiDopingPoolRewrite) {
    const hasFinalPoolResult = matchResult.rows.some((match) => (
      match.pool_id && String(match.play_state) === 'final'
    ));
    if (hasFinalPoolResult) {
      const lockedCompetition = await client.query(
        `SELECT playoff.id::text AS playoff_stage_id, playoff.status,
                qualification.id::text AS qualification_snapshot_id
         FROM go_v2_stages source_stage
         JOIN go_v2_qualification_snapshots qualification
           ON qualification.source_stage_id = source_stage.id
         JOIN go_v2_stages playoff
           ON playoff.tournament_id = source_stage.tournament_id
          AND playoff.stage_type IN ('single_elimination', 'double_elimination', 'placement_match')
          AND playoff.status IN ('locked', 'live', 'finished')
         WHERE source_stage.tournament_id = $1
           AND source_stage.stage_type IN ('round_robin_pool', 'modified_pool_4')
         ORDER BY qualification.created_at DESC, playoff.stage_order
         LIMIT 1`,
        [input.tournamentId],
      );
      if (lockedCompetition.rowCount) {
        throw new GoV2Error(
          409,
          'WITHDRAWAL_QUALIFICATION_CASCADE_REQUIRED',
          'This local withdrawal policy would invalidate a locked qualification snapshot; rebuild qualification and playoff through an explicit cascade',
          {
            qualificationSnapshotId: String(lockedCompetition.rows[0].qualification_snapshot_id),
            playoffStageId: String(lockedCompetition.rows[0].playoff_stage_id),
            playoffStageStatus: String(lockedCompetition.rows[0].status),
          },
        );
      }
    }
    for (const row of matchResult.rows.filter((match) => String(match.play_state) === 'final')) {
      const downstream = await assessDownstreamImpact(client, input.tournamentId, String(row.match_id));
      if (downstream.affectedMatches.length > 0) {
        throw new GoV2Error(
          409,
          'WITHDRAWAL_DOWNSTREAM_CASCADE_REQUIRED',
          'This local withdrawal policy would rewrite an already-routed result; resolve it through match incident cascades first',
          { triggerMatchId: String(row.match_id), affectedMatches: downstream.affectedMatches },
        );
      }
    }
  }
  const affectedMatches = matchResult.rows.map((row) => {
    const completed = ['final', 'voided'].includes(String(row.play_state));
    let action: 'preserve' | 'void' | 'forfeit' | 'fivb_anti_doping_forfeit';
    if (fivbAntiDopingPoolRewrite) {
      action = row.pool_id ? 'fivb_anti_doping_forfeit' : completed ? 'preserve' : 'forfeit';
    } else if (mutatesPlayed || !completed) {
      action = policy === 'LOCAL_REDUCE_TO_THREE_ANNUL_RESULTS' ? 'void' : 'forfeit';
    } else {
      action = 'preserve';
    }
    return {
      matchId: String(row.match_id),
      playState: String(row.play_state),
      scheduleState: String(row.schedule_state),
      currentResultRevisionNo: Number(row.current_result_revision_no ?? 0),
      stageType: String(row.stage_type),
      poolId: row.pool_id ? String(row.pool_id) : null,
      opponentEntryId: row.opponent_entry_id ? String(row.opponent_entry_id) : null,
      action,
    };
  });
  const changedMatches = affectedMatches.filter((match) => match.action !== 'preserve');
  const routedMatches = new Map<string, {
    matchId: string;
    playState: string;
    scheduleState: string;
    currentResultRevisionNo: number;
  }>();
  for (const match of changedMatches) {
    const routed = await assessDownstreamImpact(client, input.tournamentId, match.matchId);
    for (const downstream of routed.affectedMatches) routedMatches.set(downstream.matchId, downstream);
  }
  const allImpactMatches = [...changedMatches, ...routedMatches.values()];
  const risk: GoV2Risk = allImpactMatches.some((match) => (
    match.playState === 'live'
    || match.playState === 'final'
  )) ? 'red' : allImpactMatches.some((match) => (
    match.playState === 'final' || ['scheduled', 'locked'].includes(match.scheduleState)
  )) ? 'amber' : 'green';
  const impact = {
    entryId: input.entryId,
    policy,
    withdrawalCause: causeRule.cause,
    registrationState: causeRule.registrationState,
    affectedMatches,
    routedMatches: [...routedMatches.values()],
    playedResultsPreserved: !mutatesPlayed,
    preserveCompletedPoolRank,
    fivbAntiDopingPoolRewrite,
  };
  return {
    risk,
    candidate: {
      ...input.payload,
      entryId: input.entryId,
      withdrawalStandingsPolicy: policy,
      withdrawalCause: causeRule.cause,
      registrationState: causeRule.registrationState,
      preserveCompletedPoolRank,
      impact,
    },
    impact,
  };
}

export async function persistEntryWithdrawal(
  client: PoolClient,
  input: {
    tournamentId: string;
    entryId: string;
    aggregateVersion: number;
    actorId: string;
    commandId: string;
    deviceId: string;
    reasonCode: string;
    reasonNote?: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const prepared = await prepareEntryWithdrawal(client, {
    tournamentId: input.tournamentId,
    entryId: input.entryId,
    payload: input.payload,
  });
  const policy = String(prepared.candidate.withdrawalStandingsPolicy);
  const causeRule = resolveGoV2WithdrawalCauseRule(prepared.candidate.withdrawalCause);
  const registrationState = String(prepared.candidate.registrationState);
  if (registrationState !== causeRule.registrationState) {
    throw new GoV2Error(409, 'WITHDRAWAL_PREVIEW_STALE', 'Withdrawal registration state no longer matches its cause');
  }
  const preserveCompletedPoolRank = prepared.candidate.preserveCompletedPoolRank === true;
  const matches = Array.isArray(record(prepared.candidate.impact).affectedMatches)
    ? record(prepared.candidate.impact).affectedMatches as Array<Record<string, unknown>>
    : [];
  const resultRevisions: Array<Record<string, unknown>> = [];
  const reboundMatchIds = new Set<string>();
  const attendance = await client.query(
    `SELECT attendance_state, attendance_version
     FROM go_v2_entries
     WHERE id = $1 AND tournament_id = $2
     FOR UPDATE`,
    [input.entryId, input.tournamentId],
  );
  if (!attendance.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  const priorAttendanceState = String(attendance.rows[0].attendance_state);
  const priorAttendanceVersion = Number(attendance.rows[0].attendance_version);
  const nextAttendanceVersion = priorAttendanceVersion + 1;
  const changedEntry = await client.query(
    `UPDATE go_v2_entries
     SET registration_state = $3,
         attendance_state = $3,
         attendance_changed_at = clock_timestamp(),
         attendance_version = $5,
         metadata = metadata || $4::jsonb,
         updated_at = now()
     WHERE id = $1 AND tournament_id = $2 AND attendance_version = $6
     RETURNING attendance_changed_at`,
    [
      input.entryId,
      input.tournamentId,
      registrationState,
      JSON.stringify({
        withdrawalStandingsPolicy: policy,
        withdrawalCause: causeRule.cause,
        withdrawalRegistrationState: registrationState,
        withdrawalPreserveCompletedPoolRank: preserveCompletedPoolRank,
        withdrawalReasonCode: input.reasonCode,
        withdrawalReasonNote: input.reasonNote ?? null,
        withdrawalActorId: input.actorId,
        withdrawalTournamentId: input.tournamentId,
        withdrawnAt: new Date().toISOString(),
      }),
      nextAttendanceVersion,
      priorAttendanceVersion,
    ],
  );
  if (!changedEntry.rowCount) {
    throw new GoV2Error(409, 'ATTENDANCE_VERSION_CONFLICT', 'Attendance changed while committing withdrawal');
  }
  const attendanceEvent = await client.query(
    `INSERT INTO go_v2_attendance_events (
       tournament_id, entry_id, aggregate_version, attendance_version,
       from_state, to_state, effective_at, reason_code, reason_note,
       actor_id, command_id, device_id, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     RETURNING id::text`,
    [
      input.tournamentId,
      input.entryId,
      input.aggregateVersion,
      nextAttendanceVersion,
      priorAttendanceState,
      registrationState,
      changedEntry.rows[0].attendance_changed_at,
      input.reasonCode,
      input.reasonNote ?? null,
      input.actorId,
      input.commandId,
      input.deviceId,
      JSON.stringify({
        source: 'entry.withdrawal.commit',
        withdrawalStandingsPolicy: policy,
        withdrawalCause: causeRule.cause,
        technicalResultCreatedAutomatically: false,
      }),
    ],
  );
  for (const rawMatch of matches) {
    const match = record(rawMatch);
    const action = String(match.action);
    if (action === 'preserve') continue;
    const matchId = String(match.matchId);
    const opponentEntryId = String(match.opponentEntryId ?? '');
    if (action === 'void') {
      const revision = await appendResultRevision(client, {
        tournamentId: input.tournamentId,
        matchId,
        actorId: input.actorId,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        resultSource: 'withdrawal',
        payload: {
          resultKind: 'voided',
          incidentCause: causeRule.cause,
          withdrawalCause: causeRule.cause,
          declaredResult: {},
          advancementEffect: 'none',
          ratingEligibility: 'ineligible',
          standingContributions: [],
        },
      });
      resultRevisions.push({ matchId, ...revision, action: 'void' });
    } else if (!opponentEntryId) {
      // A MATCH_WINNER/MATCH_LOSER opponent may not be known yet. Keep this as
      // an audited deferred forfeit; resolveDownstreamSlots will settle it as
      // soon as the other slot materializes.
      resultRevisions.push({ matchId, action: 'deferred_forfeit' });
    } else {
      const technical = await prepareTechnicalResultPayload(client, {
        tournamentId: input.tournamentId,
        matchId,
        payload: {
          resultKind: causeRule.resultKind,
          absentEntryId: input.entryId,
          cause: causeRule.cause,
          withdrawalCause: causeRule.cause,
          standingContributionProfile: policy === 'FIVB_2026_MATCH_LEDGER'
            ? 'FIVB_2026_MATCH_LEDGER'
            : 'LPV_DECLARED_SCORE',
        },
      });
      const revision = await appendResultRevision(client, {
        tournamentId: input.tournamentId,
        matchId,
        actorId: input.actorId,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        resultSource: 'withdrawal',
        payload: technical.payload,
      });
      resultRevisions.push({ matchId, ...revision, action });
      for (const reboundId of await resolveDownstreamSlots(
        client,
        matchId,
        String(technical.payload.winnerEntryId),
        String(technical.payload.loserEntryId),
        {
          actorId: input.actorId,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote,
        },
      )) reboundMatchIds.add(reboundId);
    }
    await client.query(
      `UPDATE go_v2_matches SET schedule_state = 'skipped', updated_at = now()
       WHERE id = $1 AND schedule_state NOT IN ('cancelled', 'skipped')`,
      [matchId],
    );
  }
  return {
    entryId: input.entryId,
    registrationState,
    attendanceState: registrationState,
    attendanceVersion: nextAttendanceVersion,
    attendanceEventId: String(attendanceEvent.rows[0].id),
    withdrawalStandingsPolicy: policy,
    withdrawalCause: causeRule.cause,
    preserveCompletedPoolRank,
    resultRevisions,
    reboundMatchIds: [...reboundMatchIds].sort(stableTextCompare),
  };
}

export async function loadSeedEntries(
  client: PoolClient,
  tournamentId: string,
): Promise<Array<{ entryId: string; rating: number; confirmedAt: string; initialSeed: number }>> {
  const result = await client.query(
    `SELECT id::text AS entry_id, rating_snapshot_value, initial_seed,
            COALESCE(confirmed_at, created_at) AS confirmed_at
     FROM go_v2_entries
     WHERE tournament_id = $1 AND registration_state = 'confirmed'
     ORDER BY initial_seed NULLS LAST, entry_no`,
    [tournamentId],
  );
  return result.rows.map((row) => ({
    entryId: String(row.entry_id),
    rating: Number(row.rating_snapshot_value ?? 0),
    confirmedAt: new Date(row.confirmed_at).toISOString(),
    initialSeed: Number(row.initial_seed ?? 0),
  }));
}

/**
 * Converts database-shaped rows into the pure competition input. Kept public
 * so source semantics can be tested without a PostgreSQL connection.
 */
export function assembleCompetitionTierSource(rows: CompetitionTierSourceRows): CompetitionTierSource {
  const stage = rows.groupStage;
  const groupStageId = String(stage.groupStageId ?? '');
  const format = String(stage.format ?? '') as CompetitionPoolFormat;
  const stageStatus = String(stage.status ?? '');
  if (!groupStageId || !['round_robin_pool', 'modified_pool_4'].includes(format)) {
    throw new GoV2Error(409, 'LOCKED_GROUP_STAGE_REQUIRED', 'A locked V2 group stage is required before qualification');
  }
  if (!['locked', 'live', 'finished'].includes(stageStatus)) {
    throw new GoV2Error(409, 'GROUP_STAGE_NOT_LOCKED', 'The group stage must be locked before qualification', {
      groupStageId,
      status: stageStatus,
    });
  }

  const poolBuilders = new Map<string, {
    poolId: string;
    poolSize: 3 | 4;
    status: string;
    entries: Array<PoolStandingEntryInput & { ledger: StandingContribution[] }>;
  }>();
  const seenEntries = new Set<string>();
  const excludedEntryIds = new Set<string>();
  for (const rawAssignment of rows.assignments) {
    const poolId = String(rawAssignment.poolId ?? '');
    const entryId = String(rawAssignment.entryId ?? '');
    const capacity = Number(rawAssignment.poolSize);
    const poolStatus = String(rawAssignment.poolStatus ?? '');
    const initialSeed = Number(rawAssignment.initialSeed ?? rawAssignment.sourceSeed);
    if (!poolId || !entryId || (capacity !== 3 && capacity !== 4)) {
      throw new GoV2Error(409, 'INCOMPLETE_GROUP_ASSIGNMENTS', 'A locked pool assignment is incomplete', {
        poolId,
        entryId,
        capacity,
      });
    }
    if (!['locked', 'live', 'finished'].includes(poolStatus)) {
      throw new GoV2Error(409, 'POOL_NOT_LOCKED', 'Every pool must be locked before qualification', {
        poolId,
        status: poolStatus,
      });
    }
    if (!Number.isSafeInteger(initialSeed) || initialSeed < 1 || seenEntries.has(entryId)) {
      throw new GoV2Error(409, 'INVALID_LOCKED_POOL_ASSIGNMENT', 'Entries and initial seeds must be complete and unique', {
        poolId,
        entryId,
        initialSeed,
      });
    }
    const builder = poolBuilders.get(poolId) ?? {
      poolId,
      poolSize: capacity as 3 | 4,
      status: poolStatus,
      entries: [],
    };
    if (builder.poolSize !== capacity) {
      throw new GoV2Error(409, 'INCONSISTENT_POOL_SIZE', 'Pool assignments disagree about the locked capacity', {
        poolId,
      });
    }
    builder.entries.push({ entryId, initialSeed, ledger: [] });
    poolBuilders.set(poolId, builder);
    seenEntries.add(entryId);
    const entryMetadata = record(rawAssignment.entryMetadata);
    const preserveCompletedPoolRank = entryMetadata.withdrawalPreserveCompletedPoolRank === true;
    if (
      ['withdrawn', 'disqualified'].includes(String(rawAssignment.registrationState ?? 'confirmed'))
      && !preserveCompletedPoolRank
    ) {
      excludedEntryIds.add(entryId);
    }
  }
  if (!poolBuilders.size) {
    throw new GoV2Error(409, 'LOCKED_POOLS_REQUIRED', 'No locked pools were found for the group stage');
  }
  for (const pool of poolBuilders.values()) {
    if (pool.entries.length !== pool.poolSize) {
      throw new GoV2Error(409, 'INCOMPLETE_GROUP_ASSIGNMENTS', 'Pool assignments do not fill the locked capacity', {
        poolId: pool.poolId,
        expected: pool.poolSize,
        actual: pool.entries.length,
      });
    }
    if (format === 'modified_pool_4' && pool.poolSize !== 4) {
      throw new GoV2Error(409, 'MODIFIED_POOL_REQUIRES_FOUR', 'Modified Pool qualification requires only four-team pools', {
        poolId: pool.poolId,
      });
    }
  }

  const entryPool = new Map<string, string>();
  const entries = new Map<string, PoolStandingEntryInput & { ledger: StandingContribution[] }>();
  for (const pool of poolBuilders.values()) {
    for (const entry of pool.entries) {
      entryPool.set(entry.entryId, pool.poolId);
      entries.set(entry.entryId, entry);
    }
  }

  const finalRanks = new Map<string, 1 | 2 | 3 | 4>();
  const matchesByPool = new Map<string, number>();
  const resultRevisionIds = new Set<string>();
  const incompleteMatches: Array<Record<string, unknown>> = [];
  for (const rawMatch of rows.matches) {
    const matchId = String(rawMatch.matchId ?? '');
    const poolId = String(rawMatch.poolId ?? '');
    const playState = String(rawMatch.playState ?? '');
    const resultRevisionId = String(rawMatch.resultRevisionId ?? '');
    const resultKind = String(rawMatch.resultKind ?? '');
    const teamAId = String(rawMatch.teamAId ?? '');
    const teamBId = String(rawMatch.teamBId ?? '');
    const pool = poolBuilders.get(poolId);
    if (!pool) {
      throw new GoV2Error(409, 'GROUP_MATCH_POOL_MISMATCH', 'A group match references an unknown locked pool', {
        matchId,
        poolId,
      });
    }
    matchesByPool.set(poolId, (matchesByPool.get(poolId) ?? 0) + 1);
    if (
      !matchId
      || !resultRevisionId
      || !['final', 'voided'].includes(playState)
      || !teamAId
      || !teamBId
      || teamAId === teamBId
      || entryPool.get(teamAId) !== poolId
      || entryPool.get(teamBId) !== poolId
    ) {
      incompleteMatches.push({ matchId, poolId, playState, resultRevisionId: resultRevisionId || null });
      continue;
    }
    resultRevisionIds.add(resultRevisionId);
    const contributions = Array.isArray(rawMatch.contributions) ? rawMatch.contributions : [];
    const byEntry = new Map(contributions.map((value) => {
      const contribution = record(value);
      return [String(contribution.entryId ?? ''), contribution] as const;
    }));
    for (const [teamId, opponentId] of [[teamAId, teamBId], [teamBId, teamAId]] as const) {
      let contribution = byEntry.get(teamId);
      if (!contribution && ['mutual_no_show', 'voided'].includes(resultKind)) {
        contribution = {
          entryId: teamId,
          matchesPlayed: 0,
          matchPoints: 0,
          setsFor: 0,
          setsAgainst: 0,
          ralliesFor: 0,
          ralliesAgainst: 0,
          countsForRanking: false,
        };
      }
      if (!contribution) {
        incompleteMatches.push({ matchId, poolId, missingContributionFor: teamId, resultKind });
        continue;
      }
      entries.get(teamId)?.ledger.push({
        matchId,
        teamId,
        opponentId,
        matchPoints: Number(contribution.matchPoints ?? 0),
        setsFor: Number(contribution.setsFor ?? 0),
        setsAgainst: Number(contribution.setsAgainst ?? 0),
        pointsFor: Number(contribution.ralliesFor ?? 0),
        pointsAgainst: Number(contribution.ralliesAgainst ?? 0),
        counted: contribution.countsForRanking !== false && Number(contribution.matchesPlayed ?? 1) > 0,
      });
    }

    if (format === 'modified_pool_4') {
      const metadata = record(rawMatch.metadata);
      const placementRange = Array.isArray(metadata.placementRange) ? metadata.placementRange.map(Number) : [];
      if (placementRange.length === 2) {
        const winnerEntryId = String(rawMatch.winnerEntryId ?? '');
        const loserEntryId = String(rawMatch.loserEntryId ?? '');
        const winnerRank = placementRange[0];
        const loserRank = placementRange[1];
        if (
          !winnerEntryId
          || !loserEntryId
          || ![1, 3].includes(winnerRank)
          || loserRank !== winnerRank + 1
          || entryPool.get(winnerEntryId) !== poolId
          || entryPool.get(loserEntryId) !== poolId
        ) {
          incompleteMatches.push({ matchId, poolId, placementRange, missingPlacementResult: true });
        } else {
          finalRanks.set(winnerEntryId, winnerRank as 1 | 3);
          finalRanks.set(loserEntryId, loserRank as 2 | 4);
        }
      }
    }
  }

  for (const pool of poolBuilders.values()) {
    const expectedMatches = format === 'modified_pool_4'
      ? 4
      : pool.poolSize * (pool.poolSize - 1) / 2;
    const actualMatches = matchesByPool.get(pool.poolId) ?? 0;
    if (actualMatches !== expectedMatches) {
      incompleteMatches.push({ poolId: pool.poolId, expectedMatches, actualMatches });
    }
  }
  if (incompleteMatches.length) {
    throw new GoV2Error(409, 'GROUP_STAGE_INCOMPLETE', 'All group matches need final standing contributions before bracket preview', {
      incompleteMatches,
    });
  }

  const pools: LockedCompetitionPool[] = [...poolBuilders.values()]
    .sort((left, right) => stableTextCompare(left.poolId, right.poolId))
    .map((pool) => {
      const sortedEntries = [...pool.entries].sort((left, right) => left.initialSeed - right.initialSeed);
      if (format === 'modified_pool_4') {
        const modifiedEntries: ModifiedPoolStandingEntry[] = sortedEntries.map((entry) => {
          const finalRank = finalRanks.get(entry.entryId);
          if (!finalRank) {
            throw new GoV2Error(409, 'MODIFIED_POOL_PLACEMENTS_INCOMPLETE', 'Both Modified Pool placement matches must be final', {
              poolId: pool.poolId,
              entryId: entry.entryId,
            });
          }
          return { ...entry, finalRank };
        });
        return {
          poolId: pool.poolId,
          poolSize: 4,
          locked: true,
          format: 'modified_pool_4',
          entries: modifiedEntries,
        } satisfies LockedModifiedPool4;
      }
      return {
        poolId: pool.poolId,
        poolSize: pool.poolSize,
        locked: true,
        format: 'round_robin_pool',
        entries: sortedEntries,
      } satisfies LockedRoundRobinPool;
    });

  const targetStages: Partial<Record<TierName, CompetitionTierTargetStage>> = {};
  for (const rawTarget of rows.targetStages) {
    const tier = String(rawTarget.tier ?? '') as TierName;
    const stageType = String(rawTarget.stageType ?? '');
    if (!['hard', 'medium', 'light'].includes(tier)) continue;
    if (stageType !== 'single_elimination' && stageType !== 'double_elimination') continue;
    targetStages[tier] = {
      tier,
      stageKey: String(rawTarget.stageKey ?? `${tier}_playoff`),
      stageOrder: Number(rawTarget.stageOrder),
      stageType,
      matchRule: rawTarget.matchRule,
      configuration: record(rawTarget.configuration),
    };
  }
  return {
    groupStageId,
    format,
    pools,
    formatSnapshot: record(stage.formatSnapshot),
    rankingRulesSnapshot: record(stage.rankingRulesSnapshot),
    targetStages,
    resultRevisionIds: [...resultRevisionIds].sort(stableTextCompare),
    excludedEntryIds: [...excludedEntryIds].sort(stableTextCompare),
  };
}

export async function loadCompetitionTierSource(
  client: PoolClient,
  tournamentId: string,
  options: { resultOverride?: CompetitionResultOverride } = {},
): Promise<CompetitionTierSource> {
  const stageResult = await client.query(
    `SELECT s.id::text AS group_stage_id, s.stage_type AS format, s.status,
            COALESCE(snapshot.format_snapshot, '{}'::jsonb) AS format_snapshot,
            COALESCE(snapshot.ranking_rules_snapshot, '{}'::jsonb) AS ranking_rules_snapshot
     FROM go_v2_stages s
     LEFT JOIN go_v2_stage_lock_snapshots snapshot ON snapshot.id = s.lock_snapshot_id
     WHERE s.tournament_id = $1
       AND s.stage_type IN ('round_robin_pool', 'modified_pool_4')
     ORDER BY CASE WHEN s.stage_key = 'groups' THEN 0 ELSE 1 END, s.stage_order
     LIMIT 1`,
    [tournamentId],
  );
  if (!stageResult.rowCount) {
    throw new GoV2Error(409, 'LOCKED_GROUP_STAGE_REQUIRED', 'Materialize and lock the group stage before bracket preview');
  }
  const groupStageId = String(stageResult.rows[0].group_stage_id);
  const assignmentsResult = await client.query(
    `SELECT p.id::text AS pool_id, p.capacity AS pool_size, p.status AS pool_status,
            assignment.entry_id::text AS entry_id,
            COALESCE(entry.initial_seed, assignment.source_seed) AS initial_seed,
            entry.registration_state, entry.metadata AS entry_metadata
     FROM go_v2_pools p
     JOIN go_v2_pool_assignments assignment ON assignment.pool_id = p.id
     JOIN go_v2_entries entry ON entry.id = assignment.entry_id
     WHERE p.stage_id = $1
     ORDER BY p.pool_no, assignment.slot_no`,
    [groupStageId],
  );
  const matchesResult = await client.query(
    `SELECT m.id::text AS match_id, m.pool_id::text AS pool_id,
            m.round_no, m.position, m.play_state, m.metadata,
            revision.id::text AS result_revision_id, revision.result_kind,
            m.winner_entry_id::text AS winner_entry_id,
            m.loser_entry_id::text AS loser_entry_id,
            max(COALESCE(source.resolved_entry_id, source.source_entry_id)::text)
              FILTER (WHERE source.slot_no = 1) AS team_a_id,
            max(COALESCE(source.resolved_entry_id, source.source_entry_id)::text)
              FILTER (WHERE source.slot_no = 2) AS team_b_id,
            COALESCE(jsonb_agg(jsonb_build_object(
              'entryId', contribution.entry_id,
              'matchesPlayed', contribution.matches_played,
              'matchPoints', contribution.match_points,
              'setsFor', contribution.sets_for,
              'setsAgainst', contribution.sets_against,
              'ralliesFor', contribution.rallies_for,
              'ralliesAgainst', contribution.rallies_against,
              'countsForRanking', contribution.counts_for_ranking
            )) FILTER (WHERE contribution.entry_id IS NOT NULL), '[]'::jsonb) AS contributions
     FROM go_v2_matches m
     LEFT JOIN go_v2_match_result_revisions revision
       ON revision.match_id = m.id AND revision.revision_no = m.current_result_revision_no
     LEFT JOIN go_v2_match_standing_contributions contribution
       ON contribution.result_revision_id = revision.id
     LEFT JOIN go_v2_match_slot_sources source ON source.match_id = m.id
     WHERE m.stage_id = $1
     GROUP BY m.id, revision.id
     ORDER BY m.pool_id, m.round_no, m.position`,
    [groupStageId],
  );
  const targetsResult = await client.query(
    `SELECT tier, stage_key, stage_order, stage_type, match_rule, configuration
     FROM go_v2_stages
     WHERE tournament_id = $1 AND tier IS NOT NULL
       AND stage_type IN ('single_elimination', 'double_elimination')
       AND status <> 'voided'
     ORDER BY stage_order, tier`,
    [tournamentId],
  );
  if (
    options.resultOverride
    && !matchesResult.rows.some((row) => String(row.match_id) === options.resultOverride?.matchId)
  ) {
    throw new GoV2Error(
      409,
      'QUALIFICATION_CORRECTION_MATCH_MISMATCH',
      'The proposed result does not belong to the locked qualification source stage',
      { matchId: options.resultOverride.matchId, groupStageId },
    );
  }
  return assembleCompetitionTierSource({
    groupStage: {
      groupStageId,
      format: stageResult.rows[0].format,
      status: stageResult.rows[0].status,
      formatSnapshot: stageResult.rows[0].format_snapshot,
      rankingRulesSnapshot: stageResult.rows[0].ranking_rules_snapshot,
    },
    assignments: assignmentsResult.rows.map((row) => ({
      poolId: row.pool_id,
      poolSize: row.pool_size,
      poolStatus: row.pool_status,
      entryId: row.entry_id,
      initialSeed: row.initial_seed,
      registrationState: row.registration_state,
      entryMetadata: row.entry_metadata,
    })),
    matches: matchesResult.rows.map((row) => {
      const resultOverride = options.resultOverride;
      const isOverridden = resultOverride?.matchId === String(row.match_id);
      return {
        matchId: row.match_id,
        poolId: row.pool_id,
        roundNo: row.round_no,
        position: row.position,
        playState: isOverridden ? resultOverride.playState : row.play_state,
        metadata: row.metadata,
        resultRevisionId: isOverridden ? resultOverride.resultRevisionToken : row.result_revision_id,
        resultKind: isOverridden ? resultOverride.resultKind : row.result_kind,
        winnerEntryId: isOverridden ? resultOverride.winnerEntryId : row.winner_entry_id,
        loserEntryId: isOverridden ? resultOverride.loserEntryId : row.loser_entry_id,
        teamAId: row.team_a_id,
        teamBId: row.team_b_id,
        contributions: isOverridden
          ? resultOverride.standingContributions
          : Array.isArray(row.contributions) ? row.contributions : [],
      };
    }),
    targetStages: targetsResult.rows.map((row) => ({
      tier: row.tier,
      stageKey: row.stage_key,
      stageOrder: row.stage_order,
      stageType: row.stage_type,
      matchRule: row.match_rule,
      configuration: row.configuration,
    })),
  });
}

function stableTextCompare(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export async function assertTournamentEntryMembership(
  client: PoolClient,
  tournamentId: string,
  entryIds: string[],
  options: {
    requireAllConfirmed?: boolean;
    allowInactiveWithPreservedPoolRank?: boolean;
    context?: string;
  } = {},
): Promise<void> {
  const normalized = entryIds.map((entryId) => String(entryId ?? '').trim()).filter(Boolean);
  const unique = [...new Set(normalized)];
  if (!unique.length) {
    throw new GoV2Error(422, 'TOURNAMENT_ENTRIES_REQUIRED', `${options.context ?? 'operation'} has no tournament entries`);
  }
  if (unique.length !== normalized.length) {
    throw new GoV2Error(422, 'DUPLICATE_TOURNAMENT_ENTRY', `${options.context ?? 'operation'} contains a duplicate entry`);
  }
  const membership = await client.query(
    `SELECT count(*)::int AS matched_count,
            (SELECT count(*)::int FROM go_v2_entries all_entry
             WHERE all_entry.tournament_id = $1 AND all_entry.registration_state = 'confirmed') AS confirmed_count
     FROM go_v2_entries entry
     WHERE entry.tournament_id = $1
       AND (
         entry.registration_state = 'confirmed'
         OR (
           $3::boolean
           AND entry.registration_state IN ('withdrawn', 'disqualified')
           AND entry.metadata->>'withdrawalPreserveCompletedPoolRank' = 'true'
         )
       )
       AND entry.id::text = ANY($2::text[])`,
    [tournamentId, unique, options.allowInactiveWithPreservedPoolRank === true],
  );
  const matchedCount = numeric(membership.rows[0]?.matched_count);
  const confirmedCount = numeric(membership.rows[0]?.confirmed_count);
  if (matchedCount !== unique.length) {
    throw new GoV2Error(
      409,
      'ENTRY_TOURNAMENT_MISMATCH',
      `${options.context ?? 'operation'} references an entry outside this tournament or registration snapshot`,
      { suppliedCount: unique.length, matchedCount },
    );
  }
  if (options.requireAllConfirmed === true && confirmedCount !== unique.length) {
    throw new GoV2Error(
      409,
      'TOURNAMENT_ENTRY_SET_INCOMPLETE',
      `${options.context ?? 'operation'} must contain every confirmed entry exactly once`,
      { suppliedCount: unique.length, confirmedCount },
    );
  }
}

interface QualificationCascadeCurrentStage {
  stageId: string;
  stageKey: string;
  tier: string;
  stageType: string;
  configuration: Record<string, unknown>;
  matches: Array<{
    matchId: string;
    matchKey: string;
    phase: string;
    round: number;
    position: number;
    conditional: boolean;
    slots: Array<{
      slotNo: number;
      routeSourceType: string;
      routeSourceMatchKey: string | null;
      sourceEntryId: string | null;
      resolvedEntryId: string | null;
    }>;
  }>;
}

/** Keeps the frozen coordinates/routes and permits only direct ENTRY rebinding. */
export function buildQualificationCascadeTopologyPlan(
  currentStages: QualificationCascadeCurrentStage[],
  expectedTierBrackets: Array<Record<string, unknown>>,
): GoV2QualificationCascadeTopologyPlan {
  const expectedByTier = new Map(expectedTierBrackets.map((rawBracket) => {
    const bracket = record(rawBracket);
    return [String(bracket.tier ?? ''), bracket] as const;
  }));
  const currentByTier = new Map(currentStages.map((stage) => [stage.tier, stage] as const));
  const expectedTiers = [...expectedByTier.keys()].filter(Boolean).sort(stableTextCompare);
  const currentTiers = [...currentByTier.keys()].filter(Boolean).sort(stableTextCompare);
  if (
    expectedTiers.length !== currentTiers.length
    || expectedTiers.some((tier, index) => tier !== currentTiers[index])
  ) {
    throw new GoV2Error(409, 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH',
      'Locked tier stages no longer match the fixed qualification quotas',
      { expectedTiers, currentTiers });
  }
  const stages: GoV2QualificationCascadeTopologyPlan['stages'] = [];
  const slotChanges: GoV2QualificationCascadeTopologyPlan['slotChanges'] = [];
  const affectedMatchIds: string[] = [];
  const shapeRows: Array<Record<string, unknown>> = [];
  const bindingRows: Array<Record<string, unknown>> = [];
  for (const tier of expectedTiers) {
    const bracket = expectedByTier.get(tier) as Record<string, unknown>;
    const current = currentByTier.get(tier) as QualificationCascadeCurrentStage;
    const topology = record(bracket.topology);
    const expectedMatches = Array.isArray(topology.matches)
      ? topology.matches.map((rawMatch) => record(rawMatch))
      : [];
    if (
      current.stageKey !== String(bracket.stageKey ?? `${tier}_playoff`)
      || current.stageType !== String(bracket.bracketType ?? topology.kind ?? '')
      || Number(current.configuration.capacity) !== Number(topology.capacity)
      || String(current.configuration.templateVersion ?? '') !== String(topology.templateVersion ?? '')
      || Boolean(current.configuration.bronzeEnabled) !== Boolean(bracket.bronzeEnabled)
      || Boolean(current.configuration.resetFinalEnabled) !== Boolean(bracket.resetFinalEnabled)
    ) {
      throw new GoV2Error(409, 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH',
        'A locked tier bracket changed type, capacity or template after qualification',
        { tier, stageId: current.stageId });
    }
    const currentByKey = new Map(current.matches.map((match) => [match.matchKey, match] as const));
    const expectedKeys = expectedMatches.map((match) => String(match.matchId ?? '')).sort(stableTextCompare);
    const currentKeys = [...currentByKey.keys()].sort(stableTextCompare);
    if (expectedKeys.length !== currentKeys.length || expectedKeys.some((key, index) => key !== currentKeys[index])) {
      throw new GoV2Error(409, 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH',
        'A locked tier bracket match set is incompatible with the fresh tier seeds',
        { tier, expectedKeys, currentKeys });
    }
    for (const expectedMatch of expectedMatches) {
      const matchKey = String(expectedMatch.matchId ?? '');
      const currentMatch = currentByKey.get(matchKey) as QualificationCascadeCurrentStage['matches'][number];
      if (
        currentMatch.phase !== String(expectedMatch.phase ?? '')
        || currentMatch.round !== Number(expectedMatch.round)
        || currentMatch.position !== Number(expectedMatch.position)
        || currentMatch.conditional !== (expectedMatch.conditional === true)
      ) {
        throw new GoV2Error(409, 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH',
          'A locked bracket coordinate or conditional slot changed',
          { tier, matchKey, matchId: currentMatch.matchId });
      }
      affectedMatchIds.push(currentMatch.matchId);
      const slotByNo = new Map(currentMatch.slots.map((slot) => [slot.slotNo, slot] as const));
      for (const [slotNo, rawExpectedSource] of [[1, expectedMatch.sourceA], [2, expectedMatch.sourceB]] as const) {
        const expectedSource = record(rawExpectedSource);
        const expectedKind = String(expectedSource.kind ?? '');
        const currentSlot = slotByNo.get(slotNo);
        if (!currentSlot || currentSlot.routeSourceType !== expectedKind) {
          throw new GoV2Error(409, 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH',
            'A locked bracket route source changed kind',
            { tier, matchKey, slotNo, expectedKind, actualKind: currentSlot?.routeSourceType ?? null });
        }
        if (expectedKind === 'MATCH_WINNER' || expectedKind === 'MATCH_LOSER') {
          const expectedSourceMatchKey = String(expectedSource.matchId ?? '');
          if (currentSlot.routeSourceMatchKey !== expectedSourceMatchKey) {
            throw new GoV2Error(409, 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH',
              'A locked MATCH_* route points to a different bracket node',
              { tier, matchKey, slotNo, expectedSourceMatchKey, actualSourceMatchKey: currentSlot.routeSourceMatchKey });
          }
        } else if (expectedKind === 'ENTRY') {
          const nextEntryId = String(expectedSource.entryId ?? '');
          if (!nextEntryId) {
            throw new GoV2Error(409, 'QUALIFICATION_CASCADE_ENTRY_BINDING_INVALID',
              'A projected ENTRY slot has no entry id');
          }
          const priorEntryId = currentSlot.sourceEntryId ?? currentSlot.resolvedEntryId;
          if (priorEntryId !== nextEntryId) {
            slotChanges.push({ stageId: current.stageId, matchId: currentMatch.matchId,
              matchKey, slotNo, priorEntryId, nextEntryId });
          }
          bindingRows.push({ tier, matchKey, slotNo, entryId: nextEntryId });
        }
        shapeRows.push({ tier, stageKey: current.stageKey, stageType: current.stageType,
          matchKey, phase: currentMatch.phase, round: currentMatch.round,
          position: currentMatch.position, conditional: currentMatch.conditional,
          slotNo, sourceKind: expectedKind,
          sourceMatchKey: ['MATCH_WINNER', 'MATCH_LOSER'].includes(expectedKind)
            ? String(expectedSource.matchId ?? '') : null });
      }
    }
    const participantSeeds = (Array.isArray(bracket.participants) ? bracket.participants : [])
      .map((rawParticipant) => {
        const participant = record(rawParticipant);
        return { entryId: String(participant.entryId ?? ''), seed: Number(participant.seed) };
      })
      .filter((participant) => Boolean(participant.entryId)
        && Number.isSafeInteger(participant.seed) && participant.seed > 0)
      .sort((left, right) => left.seed - right.seed || stableTextCompare(left.entryId, right.entryId));
    if (participantSeeds.length !== Number(topology.participantCount)) {
      throw new GoV2Error(409, 'QUALIFICATION_CASCADE_PARTICIPANT_SEEDS_INVALID',
        'Every projected bracket participant must retain an exact tier seed', { tier });
    }
    stages.push({ stageId: current.stageId, stageKey: current.stageKey, tier,
      topologyHash: String(topology.topologyHash ?? ''),
      priorTopologyHash: current.configuration.topologyHash
        ? String(current.configuration.topologyHash) : null,
      participantSeeds });
  }
  return {
    topologyShapeHash: stableRepositoryHash(shapeRows),
    slotBindingHash: stableRepositoryHash(bindingRows),
    stages,
    slotChanges: slotChanges.sort((left, right) => stableTextCompare(left.matchId, right.matchId)
      || left.slotNo - right.slotNo),
    affectedMatchIds: [...new Set(affectedMatchIds)].sort(stableTextCompare),
  };
}

export async function loadQualificationCascadeTopologyPlan(
  client: PoolClient,
  tournamentId: string,
  expectedTierBrackets: Array<Record<string, unknown>>,
): Promise<GoV2QualificationCascadeTopologyPlan> {
  const stages = await client.query(
    `SELECT id::text AS stage_id, stage_key, tier, stage_type, configuration
     FROM go_v2_stages WHERE tournament_id = $1 AND tier IS NOT NULL
       AND stage_type IN ('single_elimination', 'double_elimination') AND status <> 'voided'
     ORDER BY stage_order, tier`, [tournamentId]);
  const slots = await client.query(
    `SELECT stage.id::text AS stage_id, match.id::text AS match_id, match.match_key,
            match.bracket_side, match.round_no, match.position, match.is_conditional,
            source.slot_no, source.route_source_type, upstream.match_key AS route_source_match_key,
            source.source_entry_id::text, source.resolved_entry_id::text
     FROM go_v2_stages stage JOIN go_v2_matches match ON match.stage_id = stage.id
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     LEFT JOIN go_v2_matches upstream ON upstream.id = source.route_source_match_id
     WHERE stage.tournament_id = $1 AND stage.tier IS NOT NULL
       AND stage.stage_type IN ('single_elimination', 'double_elimination') AND stage.status <> 'voided'
     ORDER BY stage.stage_order, match.round_no, match.position, match.id, source.slot_no`,
    [tournamentId]);
  const byStage = new Map<string, Map<string, QualificationCascadeCurrentStage['matches'][number]>>();
  for (const row of slots.rows) {
    const stageId = String(row.stage_id);
    const stageMatches = byStage.get(stageId) ?? new Map();
    const matchId = String(row.match_id);
    const match = stageMatches.get(matchId) ?? { matchId, matchKey: String(row.match_key),
      phase: String(row.bracket_side), round: numeric(row.round_no), position: numeric(row.position),
      conditional: row.is_conditional === true, slots: [] };
    match.slots.push({ slotNo: numeric(row.slot_no), routeSourceType: String(row.route_source_type),
      routeSourceMatchKey: row.route_source_match_key ? String(row.route_source_match_key) : null,
      sourceEntryId: row.source_entry_id ? String(row.source_entry_id) : null,
      resolvedEntryId: row.resolved_entry_id ? String(row.resolved_entry_id) : null });
    stageMatches.set(matchId, match);
    byStage.set(stageId, stageMatches);
  }
  return buildQualificationCascadeTopologyPlan(stages.rows.map((row) => ({
    stageId: String(row.stage_id), stageKey: String(row.stage_key), tier: String(row.tier),
    stageType: String(row.stage_type), configuration: record(row.configuration),
    matches: [...(byStage.get(String(row.stage_id))?.values() ?? [])],
  })), expectedTierBrackets);
}

export async function loadScheduleSource(
  client: PoolClient,
  tournamentId: string,
): Promise<{
  tournament: { date: string; name: string; location: string | null };
  matches: Array<Record<string, unknown>>;
}> {
  const tournamentResult = await client.query(
    `SELECT COALESCE(date::text, CURRENT_DATE::text) AS date, name, location
     FROM tournaments WHERE id = $1`,
    [tournamentId],
  );
  if (!tournamentResult.rowCount) throw new GoV2Error(404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
  const rosterPlayersResult = await client.query(
    `SELECT entry.id::text AS entry_id,
            COALESCE(array_agg(member.player_id::text ORDER BY member.member_order)
              FILTER (WHERE member.player_id IS NOT NULL), ARRAY[]::text[]) AS player_ids
     FROM go_v2_entries entry
     LEFT JOIN go_v2_roster_revision_members member
       ON member.roster_revision_id = entry.current_roster_revision_id
     WHERE entry.tournament_id = $1
     GROUP BY entry.id`,
    [tournamentId],
  );
  const playerIdsByEntry = new Map<string, string[]>(
    rosterPlayersResult.rows.map((row) => [
      String(row.entry_id),
      Array.isArray(row.player_ids) ? row.player_ids.map(String) : [],
    ]),
  );
  const matchResult = await client.query(
    `SELECT
       m.id::text AS match_id, m.stage_id::text AS stage_id, m.pool_id::text AS pool_id,
       m.match_key, m.round_no, m.position, m.bracket_side,
       m.is_conditional, m.schedule_state, m.play_state,
       s.stage_type, s.tier, s.stage_order,
       COALESCE(NULLIF(m.match_rule, '{}'::jsonb), s.match_rule) AS match_rule,
       assignment.planned_start, assignment.planned_end, assignment.live_eta,
       assignment.is_locked AS assignment_locked,
       assignment.court_id::text AS assignment_court_id,
       assignment_court.court_no AS assignment_court_no,
       COALESCE(jsonb_agg(jsonb_build_object(
         'slotNo', source.slot_no,
         'sourceType', source.source_type,
         'sourceEntryId', source.source_entry_id,
         'sourceMatchId', source.source_match_id,
         'resolvedEntryId', source.resolved_entry_id
       ) ORDER BY source.slot_no) FILTER (WHERE source.match_id IS NOT NULL), '[]'::jsonb) AS sources
     FROM go_v2_matches m
     JOIN go_v2_stages s ON s.id = m.stage_id
     LEFT JOIN go_v2_tournament_state tournament_state ON tournament_state.tournament_id = m.tournament_id
     LEFT JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = tournament_state.active_schedule_version_id
      AND assignment.match_id = m.id
     LEFT JOIN go_v2_courts assignment_court ON assignment_court.id = assignment.court_id
     LEFT JOIN go_v2_match_slot_sources source ON source.match_id = m.id
     WHERE m.tournament_id = $1
       AND m.play_state <> 'voided'
       AND m.schedule_state NOT IN ('skipped', 'cancelled')
       AND (m.play_state <> 'final' OR assignment.id IS NOT NULL)
     GROUP BY m.id, s.id, assignment.id, assignment_court.court_no
     ORDER BY s.stage_order, m.round_no, m.position, m.id`,
    [tournamentId],
  );
  const explicitDependencyResult = await client.query(
    `SELECT dependency.match_id::text,
            dependency.depends_on_match_id::text,
            dependency.ordinal
     FROM go_v2_match_dependencies dependency
     JOIN go_v2_matches match ON match.id = dependency.match_id
     WHERE match.tournament_id = $1
     ORDER BY dependency.match_id, dependency.ordinal, dependency.depends_on_match_id`,
    [tournamentId],
  );
  const explicitDependenciesByMatch = new Map<string, string[]>();
  for (const dependency of explicitDependencyResult.rows) {
    const matchId = String(dependency.match_id);
    explicitDependenciesByMatch.set(matchId, [
      ...(explicitDependenciesByMatch.get(matchId) ?? []),
      String(dependency.depends_on_match_id),
    ]);
  }
  const rows = matchResult.rows.map((row) => ({
    id: String(row.match_id),
    stageId: String(row.stage_id),
    poolId: row.pool_id ? String(row.pool_id) : null,
    matchKey: String(row.match_key),
    roundNo: Number(row.round_no),
    position: Number(row.position),
    bracketSide: row.bracket_side ? String(row.bracket_side) : null,
    conditional: row.is_conditional === true,
    scheduleState: String(row.schedule_state),
    playState: String(row.play_state),
    stageType: String(row.stage_type),
    tier: row.tier ? String(row.tier) : null,
    stageOrder: Number(row.stage_order),
    matchRule: row.match_rule,
    published: row.planned_start && row.assignment_court_id
      ? { courtId: String(row.assignment_court_id), start: new Date(row.planned_start).toISOString() }
      : null,
    publishedEnd: row.planned_end ? new Date(row.planned_end).toISOString() : null,
    liveEta: row.live_eta ? new Date(row.live_eta).toISOString() : null,
    assignmentLocked: row.assignment_locked === true,
    sources: Array.isArray(row.sources) ? row.sources : [],
  }));
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const possibleTeamCache = new Map<string, string[]>();
  const possibleTeams = (matchId: string, seen = new Set<string>()): string[] => {
    const cached = possibleTeamCache.get(matchId);
    if (cached) return [...cached];
    if (seen.has(matchId)) return [];
    const nextSeen = new Set(seen).add(matchId);
    const match = byId.get(matchId);
    if (!match) return [];
    const teams = new Set<string>();
    for (const rawSource of match.sources as unknown[]) {
      const source = record(rawSource);
      const resolved = source.resolvedEntryId ? String(source.resolvedEntryId) : '';
      const direct = source.sourceEntryId ? String(source.sourceEntryId) : '';
      if (resolved) teams.add(resolved);
      else if (direct) teams.add(direct);
      else if (source.sourceMatchId) {
        for (const entryId of possibleTeams(String(source.sourceMatchId), nextSeen)) teams.add(entryId);
      }
    }
    const result = [...teams].sort();
    possibleTeamCache.set(matchId, result);
    return [...result];
  };
  const matches = rows.map((row) => {
    const dependencies = [...new Set(
      [
        ...(row.sources as unknown[])
          .map((source) => String(record(source).sourceMatchId ?? '')),
        ...(explicitDependenciesByMatch.get(String(row.id)) ?? []),
      ].filter((sourceMatchId) => Boolean(sourceMatchId) && byId.has(sourceMatchId)),
    )];
    const preset = matchRulePreset(row.matchRule);
    const durationMinutes = preset === 'best_of_3_15' ? 40 : preset === 'best_of_3_21_15' ? 50 : 20;
    const teamIds = possibleTeams(String(row.id));
    const playerIds = [...new Set(teamIds.flatMap((entryId) => playerIdsByEntry.get(entryId) ?? []))].sort();
    return {
      id: row.id,
      stageId: row.stageId,
      poolId: row.poolId,
      stageOrder: row.stageOrder,
      roundNo: row.roundNo,
      position: row.position,
      durationMinutes,
      teamIds,
      playerIds,
      dependencies,
      stageKind: row.stageType === 'round_robin_pool' || row.stageType === 'modified_pool_4'
        ? 'pool'
        : row.stageType === 'placement_match'
          ? 'placement'
          : 'playoff',
      tier: row.tier,
      stagePriority: 1000 - row.stageOrder,
      minRestMinutes: row.stageType === 'round_robin_pool' || row.stageType === 'modified_pool_4'
        ? 0
        : durationMinutes,
      softRestMinutes: durationMinutes,
      conditional: row.conditional,
      metadata: {
        stageId: row.stageId,
        stageOrder: row.stageOrder,
        poolId: row.poolId,
        roundNo: row.roundNo,
        position: row.position,
        bracketSide: row.bracketSide,
      },
      published: row.published,
      assignmentLocked: row.assignmentLocked,
      liveEta: row.liveEta,
    };
  });
  return {
    tournament: {
      date: String(tournamentResult.rows[0].date),
      name: String(tournamentResult.rows[0].name ?? ''),
      location: tournamentResult.rows[0].location ? String(tournamentResult.rows[0].location) : null,
    },
    matches,
  };
}

export async function prepareDrawUnlock(
  client: PoolClient,
  input: {
    tournamentId: string;
    payload: Record<string, unknown>;
  },
): Promise<{
  risk: 'amber';
  candidate: Record<string, unknown>;
  impact: Record<string, unknown>;
}> {
  const reseed = parseGoV2DrawUnlockReseed(input.payload.reseed);
  const stages = await client.query(
    `SELECT id::text, stage_key, status, version, lock_snapshot_id::text
     FROM go_v2_stages
     WHERE tournament_id = $1
       AND stage_type IN ('round_robin_pool', 'modified_pool_4')
       AND status <> 'voided'
     ORDER BY stage_order, id
     FOR UPDATE`,
    [input.tournamentId],
  );
  if (stages.rows.length !== 1) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_STAGE_REQUIRED',
      'Exactly one active locked group stage is required before the draw can be unlocked',
      { activeGroupStageCount: stages.rows.length },
    );
  }
  const stage = stages.rows[0];
  if (String(stage.status) !== 'locked') {
    throw new GoV2Error(409, 'DRAW_UNLOCK_STAGE_NOT_LOCKED', 'Only an unstarted locked draw can be unlocked', {
      stageId: String(stage.id),
      status: String(stage.status),
    });
  }
  if (!stage.lock_snapshot_id) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_SNAPSHOT_REQUIRED',
      'A locked draw without its immutable stage snapshot cannot be unlocked destructively',
      { stageId: String(stage.id) },
    );
  }
  const stageId = String(stage.id);
  const matches = await client.query(
    `SELECT id::text, match_key, play_state, schedule_state,
            current_result_revision_no, winner_entry_id::text, loser_entry_id::text
     FROM go_v2_matches
     WHERE stage_id = $1
     ORDER BY round_no, position, id
     FOR UPDATE`,
    [stageId],
  );
  const activeMatches = matches.rows.filter((row) => (
    String(row.play_state) !== 'pending'
    || Number(row.current_result_revision_no ?? 0) > 0
    || row.winner_entry_id != null
    || row.loser_entry_id != null
  ));
  if (activeMatches.length) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_MATCH_ACTIVITY_BLOCKED',
      'A draw cannot be unlocked after any group match has started or received a result',
      { matchIds: activeMatches.map((row) => String(row.id)) },
    );
  }
  const downstream = await client.query(
    `SELECT DISTINCT downstream_match.id::text AS match_id
     FROM go_v2_match_slot_sources source
     JOIN go_v2_matches downstream_match ON downstream_match.id = source.match_id
     LEFT JOIN go_v2_matches upstream
       ON upstream.id = COALESCE(source.route_source_match_id, source.source_match_id)
     LEFT JOIN go_v2_pools upstream_pool ON upstream_pool.id = source.source_pool_id
     WHERE downstream_match.stage_id <> $1
       AND (upstream.stage_id = $1 OR upstream_pool.stage_id = $1)
     ORDER BY downstream_match.id`,
    [stageId],
  );
  const downstreamState = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM go_v2_stage_edges edge
         WHERE edge.tournament_id = $1
           AND (edge.from_stage_id = $2 OR edge.to_stage_id = $2)
       ) AS has_stage_edges,
       EXISTS (
         SELECT 1 FROM go_v2_standing_snapshots snapshot
         WHERE snapshot.stage_id = $2
       ) AS has_standings,
       EXISTS (
         SELECT 1 FROM go_v2_qualification_snapshots snapshot
         WHERE snapshot.source_stage_id = $2
       ) AS has_qualification`,
    [input.tournamentId, stageId],
  );
  const downstreamFacts = downstreamState.rows[0] ?? {};
  if (
    downstream.rowCount
    || downstreamFacts.has_stage_edges === true
    || downstreamFacts.has_standings === true
    || downstreamFacts.has_qualification === true
  ) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_DOWNSTREAM_BLOCKED',
      'Remove no data automatically after stage materialization or qualification; use an explicit cascade workflow',
      {
        downstreamMatchIds: downstream.rows.map((row) => String(row.match_id)),
        hasStageEdges: downstreamFacts.has_stage_edges === true,
        hasStandingSnapshots: downstreamFacts.has_standings === true,
        hasQualificationSnapshots: downstreamFacts.has_qualification === true,
      },
    );
  }
  const scheduleAssignments = await client.query(
    `SELECT assignment.id::text AS assignment_id, assignment.match_id::text AS match_id,
            version.id::text AS schedule_version_id, version.status
     FROM go_v2_schedule_assignments assignment
     JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
     JOIN go_v2_matches match ON match.id = assignment.match_id
     WHERE match.stage_id = $1
     ORDER BY version.version_no, assignment.id`,
    [stageId],
  );
  if (scheduleAssignments.rowCount || matches.rows.some((row) => String(row.schedule_state) !== 'unscheduled')) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_SCHEDULE_BLOCKED',
      'A draw with any draft, published or historical schedule assignment cannot be unlocked destructively',
      {
        assignments: scheduleAssignments.rows.map((row) => ({
          assignmentId: String(row.assignment_id),
          matchId: String(row.match_id),
          scheduleVersionId: String(row.schedule_version_id),
          status: String(row.status),
        })),
      },
    );
  }
  const liveJournal = await client.query(
    `SELECT DISTINCT match.id::text AS match_id
     FROM go_v2_matches match
     WHERE match.stage_id = $1
       AND (
         EXISTS (SELECT 1 FROM go_v2_live_match_state live WHERE live.match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_judge_command_journal journal WHERE journal.match_id = match.id)
       )
     ORDER BY match.id`,
    [stageId],
  );
  if (liveJournal.rowCount) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_LIVE_JOURNAL_BLOCKED',
      'A draw cannot be removed after a judge device created match state or command history',
      { matchIds: liveJournal.rows.map((row) => String(row.match_id)) },
    );
  }
  const immutableHistory = await client.query(
    `SELECT match.id::text AS match_id,
            ARRAY_REMOVE(ARRAY[
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_match_result_revisions row WHERE row.match_id = match.id) THEN 'result_revision' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_match_lineup_snapshots row WHERE row.match_id = match.id) THEN 'lineup_snapshot' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_cascade_mutation_matches row WHERE row.match_id = match.id) THEN 'cascade_mutation' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_cascade_mutation_batches row WHERE row.trigger_match_id = match.id) THEN 'cascade_trigger' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_incidents row WHERE row.match_id = match.id) THEN 'incident' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_disruption_matches row WHERE row.match_id = match.id) THEN 'disruption' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_referee_duties row WHERE row.source_match_id = match.id) THEN 'referee_duty' END,
              CASE WHEN EXISTS (SELECT 1 FROM go_v2_final_placement_rows row WHERE row.eliminated_by_match_id = match.id) THEN 'final_placement' END
            ], NULL) AS dependencies
     FROM go_v2_matches match
     WHERE match.stage_id = $1
       AND (
         EXISTS (SELECT 1 FROM go_v2_match_result_revisions row WHERE row.match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_match_lineup_snapshots row WHERE row.match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_cascade_mutation_matches row WHERE row.match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_cascade_mutation_batches row WHERE row.trigger_match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_incidents row WHERE row.match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_disruption_matches row WHERE row.match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_referee_duties row WHERE row.source_match_id = match.id)
         OR EXISTS (SELECT 1 FROM go_v2_final_placement_rows row WHERE row.eliminated_by_match_id = match.id)
       )
     ORDER BY match.id`,
    [stageId],
  );
  if (immutableHistory.rowCount) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_IMMUTABLE_HISTORY_BLOCKED',
      'A draw cannot be removed after immutable or incident history references one of its matches',
      {
        matches: immutableHistory.rows.map((row) => ({
          matchId: String(row.match_id),
          dependencies: Array.isArray(row.dependencies) ? row.dependencies.map(String) : [],
        })),
      },
    );
  }
  const pools = await client.query(
    `SELECT pool.id::text, pool.pool_no, pool.label,
            COALESCE(jsonb_agg(jsonb_build_object(
              'entryId', assignment.entry_id,
              'slot', assignment.slot_no,
              'sourceSeed', assignment.source_seed
            ) ORDER BY assignment.slot_no) FILTER (WHERE assignment.entry_id IS NOT NULL), '[]'::jsonb) AS slots
     FROM go_v2_pools pool
     LEFT JOIN go_v2_pool_assignments assignment ON assignment.pool_id = pool.id
     WHERE pool.stage_id = $1
     GROUP BY pool.id, pool.pool_no, pool.label
     ORDER BY pool.pool_no, pool.id`,
    [stageId],
  );
  const entries = await client.query(
    `SELECT id::text, initial_seed, rating_snapshot_value,
            COALESCE(confirmed_at, created_at) AS confirmed_at
     FROM go_v2_entries
     WHERE tournament_id = $1 AND registration_state = 'confirmed'
     ORDER BY id`,
    [input.tournamentId],
  );
  const seedInputs = entries.rows.map((row) => ({
    entryId: String(row.id),
    initialSeed: Number(row.initial_seed),
    ratingSnapshotValue: Number(row.rating_snapshot_value ?? 0),
    confirmedAt: row.confirmed_at as Date | string,
  }));
  const priorSeeds = planGoV2DrawUnlockSeeds(seedInputs, false);
  const nextSeeds = planGoV2DrawUnlockSeeds(seedInputs, reseed);
  const impact = {
    stageId,
    stageKey: String(stage.stage_key),
    stageVersion: Number(stage.version),
    stageSnapshotId: stage.lock_snapshot_id ? String(stage.lock_snapshot_id) : null,
    removedPoolCount: pools.rows.length,
    removedMatchCount: matches.rows.length,
    removedMatchIds: matches.rows.map((row) => String(row.id)),
    removedGroups: pools.rows.map((row) => ({
      poolId: String(row.id),
      poolNo: Number(row.pool_no),
      label: String(row.label),
      slots: Array.isArray(row.slots) ? row.slots : [],
    })),
    reseed,
    priorSeeds,
    nextSeeds,
  };
  return {
    risk: 'amber',
    candidate: {
      reseed,
      drawStateHash: stableRepositoryHash(impact),
      impact,
    },
    impact,
  };
}

export async function persistDrawUnlock(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
    inputHash: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const prepared = await prepareDrawUnlock(client, {
    tournamentId: input.tournamentId,
    payload: input.payload,
  });
  if (
    String(input.payload.drawStateHash ?? '') !== String(prepared.candidate.drawStateHash)
    || (input.payload.reseed === true) !== (prepared.candidate.reseed === true)
  ) {
    throw new GoV2Error(
      409,
      'DRAW_UNLOCK_PREVIEW_STALE',
      'The locked draw or reseed choice changed after preview; generate a new unlock preview',
    );
  }
  const impact = record(prepared.impact);
  const stageId = String(impact.stageId);
  const removedMatchIds = Array.isArray(impact.removedMatchIds)
    ? impact.removedMatchIds.map(String)
    : [];
  await client.query(
    `DELETE FROM go_v2_match_slot_sources
     WHERE match_id = ANY($1::uuid[])`,
    [removedMatchIds],
  );
  const deletedMatches = await client.query(`DELETE FROM go_v2_matches WHERE stage_id = $1`, [stageId]);
  if (Number(deletedMatches.rowCount ?? 0) !== removedMatchIds.length) {
    throw new GoV2Error(409, 'DRAW_UNLOCK_MATCH_SET_STALE', 'The materialized match set changed during draw unlock');
  }
  const expectedPoolCount = Number(impact.removedPoolCount ?? 0);
  const deletedPools = await client.query(`DELETE FROM go_v2_pools WHERE stage_id = $1`, [stageId]);
  if (Number(deletedPools.rowCount ?? 0) !== expectedPoolCount) {
    throw new GoV2Error(409, 'DRAW_UNLOCK_POOL_SET_STALE', 'The materialized pool set changed during draw unlock');
  }
  const voidedStage = await client.query(
    `UPDATE go_v2_stages
     SET status = 'voided',
         configuration = configuration || jsonb_build_object(
           'lastDrawUnlockInputHash', $2::text,
           'lastDrawUnlockReasonCode', $3::text,
           'lastDrawUnlockReasonNote', $4::text,
           'lastDrawUnlockedAt', now()
         ),
         version = version + 1,
         updated_at = now()
     WHERE id = $1 AND tournament_id = $5 AND status = 'locked' AND version = $6`,
    [
      stageId,
      input.inputHash,
      input.reasonCode,
      input.reasonNote ?? null,
      input.tournamentId,
      Number(impact.stageVersion),
    ],
  );
  if (Number(voidedStage.rowCount ?? 0) !== 1) {
    throw new GoV2Error(409, 'DRAW_UNLOCK_STAGE_STALE', 'The locked group stage changed during draw unlock');
  }
  let ratingSnapshotId: string | null = null;
  const nextSeeds = Array.isArray(impact.nextSeeds) ? impact.nextSeeds.map(record) : [];
  if (prepared.candidate.reseed === true) {
    for (const row of nextSeeds) {
      const updated = await client.query(
        `UPDATE go_v2_entries
         SET initial_seed = $3, updated_at = now()
         WHERE id = $1 AND tournament_id = $2 AND registration_state = 'confirmed'
         RETURNING id`,
        [String(row.entryId), input.tournamentId, Number(row.seed)],
      );
      if (updated.rowCount !== 1) {
        throw new GoV2Error(409, 'DRAW_UNLOCK_ENTRY_SET_STALE', 'The confirmed entry set changed after preview');
      }
    }
    const ratingSnapshot = await client.query(
      `INSERT INTO go_v2_rating_snapshots (
         tournament_id, schema_version, source_kind, captured_by, input_hash, payload
       ) VALUES ($1, 1, 'draw_unlock_reseed', $2, $3, $4::jsonb)
       RETURNING id`,
      [
        input.tournamentId,
        input.actorId,
        input.inputHash,
        JSON.stringify({
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote ?? null,
          priorStageSnapshotId: impact.stageSnapshotId ?? null,
          priorSeeds: impact.priorSeeds ?? [],
          nextSeeds,
        }),
      ],
    );
    ratingSnapshotId = String(ratingSnapshot.rows[0].id);
    await client.query(
      `INSERT INTO go_v2_rating_snapshot_entries (snapshot_id, entry_id, rating_sum, seed)
       SELECT $1, id, rating_snapshot_value, initial_seed
       FROM go_v2_entries
       WHERE tournament_id = $2 AND registration_state = 'confirmed'`,
      [ratingSnapshotId, input.tournamentId],
    );
  }
  const clearedState = await client.query(
    `UPDATE go_v2_tournament_state
     SET active_stage_snapshot_id = NULL, updated_at = now()
     WHERE tournament_id = $1`,
    [input.tournamentId],
  );
  if (Number(clearedState.rowCount ?? 0) !== 1) {
    throw new GoV2Error(409, 'DRAW_UNLOCK_STATE_STALE', 'Tournament state changed during draw unlock');
  }
  return {
    ...impact,
    ratingSnapshotId,
    lifecycleState: 'registration_locked',
  };
}

export async function persistDraw(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    inputHash: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const groups = Array.isArray(input.payload.groups) ? input.payload.groups : [];
  const pairings = Array.isArray(input.payload.pairings) ? input.payload.pairings : [];
  if (!groups.length) throw new GoV2Error(422, 'DRAW_GROUPS_REQUIRED', 'Committed draw has no groups');
  const drawEntryIds = groups.flatMap((rawGroup) => {
    const group = record(rawGroup);
    return (Array.isArray(group.slots) ? group.slots : []).map((rawSlot) => {
      const slot = record(rawSlot);
      return String(record(slot.entry).entryId ?? slot.entryId ?? '');
    });
  });
  await assertTournamentEntryMembership(client, input.tournamentId, drawEntryIds, {
    requireAllConfirmed: true,
    context: 'draw',
  });
  const poolFormat = String(input.payload.poolFormat ?? 'round_robin_pool');
  const lockedFormatSnapshot = record(input.payload.lockedFormatSnapshot);
  if (
    Number(lockedFormatSnapshot.schemaVersion) !== 2
    || !String(lockedFormatSnapshot.templateId ?? '').trim()
    || !String(lockedFormatSnapshot.snapshotHash ?? '').trim()
  ) {
    throw new GoV2Error(
      409,
      'LOCKED_FORMAT_SNAPSHOT_REQUIRED',
      'Draw commit requires the server-projected immutable TournamentFormatTemplateV2 snapshot',
    );
  }
  const snapshotPayload = {
    seedSnapshot: input.payload.seedSnapshot ?? [],
    rankingRulesSnapshot: input.payload.rankingRulesSnapshot ?? {},
    formatSnapshot: lockedFormatSnapshot,
    policySnapshot: input.payload.policySnapshot ?? {},
  };
  const stageSnapshotHash = stableRepositoryHash({
    schemaVersion: 2,
    ...snapshotPayload,
  });
  const snapshotResult = await client.query(
    `WITH inserted AS (
       INSERT INTO go_v2_stage_lock_snapshots (
         tournament_id, schema_version, seed_snapshot, ranking_rules_snapshot,
         format_snapshot, policy_snapshot, snapshot_hash, locked_by
       ) VALUES ($1, 2, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
       ON CONFLICT (tournament_id, snapshot_hash) DO NOTHING
       RETURNING id
     )
     SELECT id FROM inserted
     UNION ALL
     SELECT id FROM go_v2_stage_lock_snapshots
     WHERE tournament_id = $1 AND snapshot_hash = $6
     LIMIT 1`,
    [
      input.tournamentId,
      JSON.stringify(snapshotPayload.seedSnapshot),
      JSON.stringify(snapshotPayload.rankingRulesSnapshot),
      JSON.stringify(snapshotPayload.formatSnapshot),
      JSON.stringify(snapshotPayload.policySnapshot),
      stageSnapshotHash,
      input.actorId,
    ],
  );
  const snapshotId = String(snapshotResult.rows[0].id);
  const stageResult = await client.query(
    `INSERT INTO go_v2_stages (
       tournament_id, stage_key, stage_order, stage_type, status,
       lock_snapshot_id, match_rule, configuration
     ) VALUES ($1, 'groups', 1, $2, 'locked', $3, $4::jsonb, $5::jsonb)
     ON CONFLICT (tournament_id, stage_key) DO UPDATE SET
       stage_type = EXCLUDED.stage_type,
       status = 'locked',
       lock_snapshot_id = EXCLUDED.lock_snapshot_id,
       match_rule = EXCLUDED.match_rule,
       configuration = EXCLUDED.configuration,
       version = go_v2_stages.version + 1,
       updated_at = now()
     RETURNING id`,
    [
      input.tournamentId,
      poolFormat,
      snapshotId,
      JSON.stringify(matchRuleJson(input.payload.matchRule)),
      JSON.stringify({ comparisonPolicy: input.payload.comparisonPolicy ?? 'equal_two_matches' }),
    ],
  );
  const stageId = String(stageResult.rows[0].id);
  const started = await client.query(
    `SELECT 1 FROM go_v2_matches WHERE stage_id = $1 AND play_state <> 'pending' LIMIT 1`,
    [stageId],
  );
  if (started.rowCount) {
    throw new GoV2Error(409, 'DRAW_ALREADY_STARTED', 'Cannot replace a draw after a group match has started');
  }
  const downstream = await client.query(
    `SELECT 1
     FROM go_v2_match_slot_sources source
     JOIN go_v2_matches upstream ON upstream.id = source.route_source_match_id
     JOIN go_v2_matches downstream_match ON downstream_match.id = source.match_id
     WHERE upstream.stage_id = $1 AND downstream_match.stage_id <> $1
     LIMIT 1`,
    [stageId],
  );
  if (downstream.rowCount) {
    throw new GoV2Error(409, 'DRAW_HAS_DOWNSTREAM_STAGES', 'Unlock/remove downstream stages before replacing the draw');
  }
  await client.query(
    `DELETE FROM go_v2_match_slot_sources
     WHERE match_id IN (SELECT id FROM go_v2_matches WHERE stage_id = $1)`,
    [stageId],
  );
  await client.query(`DELETE FROM go_v2_pools WHERE stage_id = $1`, [stageId]);

  const poolIdByLogicalId = new Map<string, string>();
  for (let index = 0; index < groups.length; index += 1) {
    const group = record(groups[index]);
    const logicalId = String(group.groupId ?? `POOL-${index + 1}`);
    const pool = await client.query(
      `INSERT INTO go_v2_pools (stage_id, pool_no, label, capacity, status)
       VALUES ($1, $2, $3, $4, 'locked') RETURNING id`,
      [stageId, index + 1, String(group.label ?? String.fromCharCode(65 + index)), Number(group.capacity)],
    );
    const poolId = String(pool.rows[0].id);
    poolIdByLogicalId.set(logicalId, poolId);
    const slots = Array.isArray(group.slots) ? group.slots : [];
    for (const rawSlot of slots) {
      const slot = record(rawSlot);
      const entry = record(slot.entry);
      await client.query(
        `INSERT INTO go_v2_pool_assignments (
           pool_id, entry_id, slot_no, source_seed, assigned_by, assignment_reason
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          poolId,
          String(entry.entryId ?? slot.entryId ?? ''),
          Number(slot.slot),
          Number(entry.initialSeed ?? slot.sourceSeed ?? 0) || null,
          input.actorId,
          String(slot.assignmentReason ?? 'snake_seed'),
        ],
      );
    }
  }

  const matchIdByLogicalId = new Map<string, string>();
  for (const rawPairing of pairings) {
    const pairing = record(rawPairing);
    const logicalMatchId = String(pairing.matchId ?? '');
    const poolId = poolIdByLogicalId.get(String(pairing.poolId ?? ''));
    if (!logicalMatchId || !poolId) {
      throw new GoV2Error(422, 'INVALID_POOL_PAIRING', 'Pairing references an unknown pool or match key');
    }
    const placementRange = Array.isArray(pairing.placementRange)
      ? pairing.placementRange.map(Number)
      : null;
    const matchResult = await client.query(
      `INSERT INTO go_v2_matches (
         tournament_id, stage_id, pool_id, match_key, round_no, position,
         bracket_side, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
      [
        input.tournamentId,
        stageId,
        poolId,
        logicalMatchId,
        Number(pairing.round),
        Number(pairing.position),
         null,
        JSON.stringify({ placementRange }),
      ],
    );
    matchIdByLogicalId.set(logicalMatchId, String(matchResult.rows[0].id));
  }
  for (const rawPairing of pairings) {
    const pairing = record(rawPairing);
    const matchId = matchIdByLogicalId.get(String(pairing.matchId)) as string;
    for (const [slotNo, rawSource] of [[1, pairing.sourceA], [2, pairing.sourceB]] as const) {
      const source = record(rawSource);
      const sourceType = String(source.kind ?? '');
      await client.query(
        `INSERT INTO go_v2_match_slot_sources (
           match_id, slot_no, source_type, source_entry_id, source_match_id,
           route_source_type, route_source_match_id, resolved_entry_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          slotNo,
          sourceType,
          sourceType === 'ENTRY' ? String(source.entryId) : null,
          sourceType === 'MATCH_WINNER' || sourceType === 'MATCH_LOSER'
            ? matchIdByLogicalId.get(String(source.matchId)) ?? null
            : null,
          sourceType,
          sourceType === 'MATCH_WINNER' || sourceType === 'MATCH_LOSER'
            ? matchIdByLogicalId.get(String(source.matchId)) ?? null
            : null,
          sourceType === 'ENTRY' ? String(source.entryId) : null,
        ],
      );
    }
  }
  await client.query(
    `UPDATE go_v2_tournament_state
     SET active_stage_snapshot_id = $2, updated_at = now()
     WHERE tournament_id = $1`,
    [input.tournamentId, snapshotId],
  );
  return {
    stageId,
    stageSnapshotId: snapshotId,
    poolIds: Array.from(poolIdByLogicalId.values()),
    matchCount: pairings.length,
  };
}

export async function persistBracket(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const topology = record(input.payload.topology);
  const matches = Array.isArray(topology.matches) ? topology.matches : [];
  if (!matches.length) throw new GoV2Error(422, 'BRACKET_MATCHES_REQUIRED', 'Bracket topology has no matches');
  const directEntryIds = matches.flatMap((rawMatch) => {
    const match = record(rawMatch);
    return [match.sourceA, match.sourceB]
      .map((rawSource) => record(rawSource))
      .filter((source) => String(source.kind ?? '') === 'ENTRY')
      .map((source) => String(source.entryId ?? ''));
  });
  await assertTournamentEntryMembership(client, input.tournamentId, directEntryIds, {
    context: 'bracket',
    allowInactiveWithPreservedPoolRank: true,
  });
  const tier = String(input.payload.tier ?? 'hard');
  const existingTarget = await client.query(
    `SELECT stage_key, stage_order, match_rule
     FROM go_v2_stages
     WHERE tournament_id = $1 AND tier = $2
       AND stage_type IN ('single_elimination', 'double_elimination')
       AND status <> 'voided'
     ORDER BY stage_order LIMIT 1`,
    [input.tournamentId, tier],
  );
  const stageKey = String(input.payload.stageKey ?? existingTarget.rows[0]?.stage_key ?? `${tier}_playoff`);
  const stageOrder = Number(input.payload.stageOrder ?? existingTarget.rows[0]?.stage_order ?? 3);
  const bracketType = String(topology.kind ?? input.payload.bracketType ?? 'single_elimination');
  const participantSeedByEntry = new Map<string, number>();
  const rememberParticipantSeed = (value: unknown): void => {
    const source = record(value);
    if (String(source.kind ?? '') !== 'ENTRY') return;
    const entryId = String(source.entryId ?? '');
    const seed = Number(source.initialSeed ?? source.seed);
    if (!entryId || !Number.isSafeInteger(seed) || seed < 1) return;
    const prior = participantSeedByEntry.get(entryId);
    if (prior !== undefined && prior !== seed) {
      throw new GoV2Error(422, 'BRACKET_PARTICIPANT_SEED_MISMATCH', 'Bracket entry has conflicting seeds', {
        entryId,
        seeds: [prior, seed],
      });
    }
    participantSeedByEntry.set(entryId, seed);
  };
  for (const rawMatch of matches) {
    const match = record(rawMatch);
    rememberParticipantSeed(match.sourceA);
    rememberParticipantSeed(match.sourceB);
  }
  if (Array.isArray(topology.byeAdvances)) {
    for (const rawAdvance of topology.byeAdvances) {
      rememberParticipantSeed(record(rawAdvance).advancedSource);
    }
  }
  if (Array.isArray(input.payload.participants)) {
    for (const rawParticipant of input.payload.participants) {
      const participant = record(rawParticipant);
      rememberParticipantSeed({
        kind: 'ENTRY',
        entryId: participant.entryId,
        initialSeed: participant.seed ?? participant.initialSeed,
      });
    }
  }
  const participantSeeds = [...participantSeedByEntry.entries()]
    .map(([entryId, seed]) => ({ entryId, seed }))
    .sort((left, right) => left.seed - right.seed || stableTextCompare(left.entryId, right.entryId));
  const activeSnapshot = await client.query(
    `SELECT active_stage_snapshot_id FROM go_v2_tournament_state WHERE tournament_id = $1`,
    [input.tournamentId],
  );
  let lockSnapshotId = activeSnapshot.rows[0]?.active_stage_snapshot_id
    ? String(activeSnapshot.rows[0].active_stage_snapshot_id)
    : null;
  if (!lockSnapshotId) {
    const lockedFormatSnapshot = record(input.payload.lockedFormatSnapshot);
    if (
      Number(lockedFormatSnapshot.schemaVersion) !== 2
      || !String(lockedFormatSnapshot.templateId ?? '').trim()
      || !String(lockedFormatSnapshot.snapshotHash ?? '').trim()
    ) {
      throw new GoV2Error(
        409,
        'LOCKED_FORMAT_SNAPSHOT_REQUIRED',
        'Standalone bracket lock requires the immutable TournamentFormatTemplateV2 snapshot',
      );
    }
    const snapshotPayload = {
      schemaVersion: 2,
      seedSnapshot: input.payload.participants ?? [],
      rankingRulesSnapshot: {},
      formatSnapshot: lockedFormatSnapshot,
      policySnapshot: {},
    };
    const snapshotHash = stableRepositoryHash(snapshotPayload);
    const insertedSnapshot = await client.query(
      `WITH inserted AS (
         INSERT INTO go_v2_stage_lock_snapshots (
           tournament_id, schema_version, seed_snapshot, ranking_rules_snapshot,
           format_snapshot, policy_snapshot, snapshot_hash, locked_by
         ) VALUES ($1, 2, $2::jsonb, '{}'::jsonb, $3::jsonb, '{}'::jsonb, $4, $5)
         ON CONFLICT (tournament_id, snapshot_hash) DO NOTHING
         RETURNING id
       )
       SELECT id FROM inserted
       UNION ALL
       SELECT id FROM go_v2_stage_lock_snapshots
       WHERE tournament_id = $1 AND snapshot_hash = $4
       LIMIT 1`,
      [
        input.tournamentId,
        JSON.stringify(snapshotPayload.seedSnapshot),
        JSON.stringify(lockedFormatSnapshot),
        snapshotHash,
        input.actorId,
      ],
    );
    lockSnapshotId = String(insertedSnapshot.rows[0].id);
    await client.query(
      `UPDATE go_v2_tournament_state
       SET active_stage_snapshot_id = $2, updated_at = now()
       WHERE tournament_id = $1`,
      [input.tournamentId, lockSnapshotId],
    );
  }
  const stageResult = await client.query(
    `INSERT INTO go_v2_stages (
       tournament_id, stage_key, stage_order, stage_type, tier, status,
       lock_snapshot_id, match_rule, configuration
     ) VALUES ($1, $2, $3, $4, $5, 'locked', $6, $7::jsonb, $8::jsonb)
     ON CONFLICT (tournament_id, stage_key) DO UPDATE SET
       stage_order = EXCLUDED.stage_order, stage_type = EXCLUDED.stage_type,
       tier = EXCLUDED.tier, status = 'locked', lock_snapshot_id = EXCLUDED.lock_snapshot_id,
       match_rule = EXCLUDED.match_rule,
       configuration = EXCLUDED.configuration, version = go_v2_stages.version + 1,
       updated_at = now()
     RETURNING id`,
    [
      input.tournamentId,
      stageKey,
      stageOrder,
      bracketType,
      tier,
      lockSnapshotId,
      JSON.stringify(matchRuleJson(input.payload.matchRule ?? existingTarget.rows[0]?.match_rule)),
      JSON.stringify({
        capacity: topology.capacity,
        templateVersion: topology.templateVersion,
        topologyHash: topology.topologyHash,
        championSource: topology.championSource,
        participantSeeds,
        bronzeEnabled: bracketType === 'single_elimination'
          && input.payload.bronzeMatch !== false
          && input.payload.bronzeEnabled !== false,
        resetFinalEnabled: bracketType === 'double_elimination'
          && input.payload.resetFinal !== false
          && input.payload.resetFinalEnabled !== false,
        warnings: topology.warnings ?? [],
      }),
    ],
  );
  const stageId = String(stageResult.rows[0].id);
  const started = await client.query(
    `SELECT 1 FROM go_v2_matches WHERE stage_id = $1 AND play_state <> 'pending' LIMIT 1`,
    [stageId],
  );
  if (started.rowCount) throw new GoV2Error(409, 'BRACKET_ALREADY_STARTED', 'Cannot replace a started bracket');
  const downstream = await client.query(
    `SELECT source.match_id::text
     FROM go_v2_match_slot_sources source
     JOIN go_v2_matches upstream ON upstream.id = source.route_source_match_id
     JOIN go_v2_matches downstream_match ON downstream_match.id = source.match_id
     WHERE upstream.stage_id = $1 AND downstream_match.stage_id <> $1
     LIMIT 1`,
    [stageId],
  );
  if (downstream.rowCount) {
    throw new GoV2Error(409, 'BRACKET_HAS_DOWNSTREAM_REFERENCES', 'Cannot replace a bracket referenced by a downstream stage');
  }
  const publishedAssignments = await client.query(
    `SELECT 1
     FROM go_v2_schedule_assignments assignment
     JOIN go_v2_matches match ON match.id = assignment.match_id
     JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
     WHERE match.stage_id = $1 AND version.status = 'published'
     LIMIT 1`,
    [stageId],
  );
  if (publishedAssignments.rowCount) {
    throw new GoV2Error(409, 'BRACKET_ALREADY_PUBLISHED', 'Replan or supersede the published bracket schedule before replacing it');
  }
  await client.query(
    `DELETE FROM go_v2_match_slot_sources
     WHERE match_id IN (SELECT id FROM go_v2_matches WHERE stage_id = $1)`,
    [stageId],
  );
  await client.query(`DELETE FROM go_v2_matches WHERE stage_id = $1`, [stageId]);
  const matchIdByLogicalId = new Map<string, string>();
  for (const rawMatch of matches) {
    const match = record(rawMatch);
    const logicalId = String(match.matchId ?? '');
    const conditional = match.conditional === true;
    const inserted = await client.query(
      `INSERT INTO go_v2_matches (
         tournament_id, stage_id, match_key, round_no, position, bracket_side,
         is_conditional, condition_kind, condition_state, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [
        input.tournamentId,
        stageId,
        logicalId,
        Number(match.round),
        Number(match.position),
        String(match.phase),
        conditional,
        conditional ? 'grand_final_reset' : null,
        conditional ? 'pending' : 'not_applicable',
        JSON.stringify({ publicLabel: match.publicLabel ?? null, condition: match.condition ?? null }),
      ],
    );
    matchIdByLogicalId.set(logicalId, String(inserted.rows[0].id));
  }
  for (const rawMatch of matches) {
    const match = record(rawMatch);
    const matchId = matchIdByLogicalId.get(String(match.matchId)) as string;
    for (const [slotNo, rawSource] of [[1, match.sourceA], [2, match.sourceB]] as const) {
      const source = record(rawSource);
      const sourceType = String(source.kind ?? '');
      await client.query(
        `INSERT INTO go_v2_match_slot_sources (
           match_id, slot_no, source_type, source_entry_id, source_match_id,
           route_source_type, route_source_match_id, resolved_entry_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          matchId,
          slotNo,
          sourceType,
          sourceType === 'ENTRY' ? String(source.entryId) : null,
          sourceType === 'MATCH_WINNER' || sourceType === 'MATCH_LOSER'
            ? matchIdByLogicalId.get(String(source.matchId)) ?? null
            : null,
          sourceType,
          sourceType === 'MATCH_WINNER' || sourceType === 'MATCH_LOSER'
            ? matchIdByLogicalId.get(String(source.matchId)) ?? null
            : null,
          sourceType === 'ENTRY' ? String(source.entryId) : null,
        ],
      );
    }
  }
  const materializedMatchIds = [...matchIdByLogicalId.values()];
  const automaticallyRouted = new Set(await autoSettleWithdrawnMatches(client, materializedMatchIds));
  for (const routedId of await propagateRuntimeByes(client, materializedMatchIds)) {
    automaticallyRouted.add(routedId);
  }
  return {
    stageId,
    stageKey,
    tier,
    topologyHash: topology.topologyHash,
    matchCount: matches.length,
    automaticallyRoutedMatchIds: [...automaticallyRouted].sort(stableTextCompare),
  };
}

/** Persists one immutable qualification decision and every generated tier bracket. */
export async function persistCompetitionTierBrackets(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    aggregateVersion: number;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const pipeline = record(input.payload.tierPipeline);
  const standingRows = Array.isArray(pipeline.standingRows) ? pipeline.standingRows : [];
  const qualificationRows = Array.isArray(pipeline.qualificationRows) ? pipeline.qualificationRows : [];
  const tierBrackets = Array.isArray(input.payload.tierBrackets) ? input.payload.tierBrackets : [];
  const groupStageId = String(input.payload.groupStageId ?? '');
  const sourceHash = String(input.payload.sourceHash ?? '');
  if (!groupStageId || !sourceHash || !standingRows.length || !qualificationRows.length || !tierBrackets.length) {
    throw new GoV2Error(
      422,
      'COMPETITION_BRACKET_SNAPSHOT_REQUIRED',
      'Bracket lock requires its immutable standing, qualification and tier topology preview',
    );
  }
  const sourceStage = await client.query(
    `SELECT 1 FROM go_v2_stages
     WHERE id = $1 AND tournament_id = $2
       AND stage_type IN ('round_robin_pool', 'modified_pool_4')`,
    [groupStageId, input.tournamentId],
  );
  if (!sourceStage.rowCount) {
    throw new GoV2Error(409, 'GROUP_STAGE_SNAPSHOT_MISMATCH', 'Bracket preview no longer belongs to this group stage');
  }

  const standingSnapshotResult = await client.query(
    `INSERT INTO go_v2_standing_snapshots (
       stage_id, aggregate_version, profile_code, input_hash
     ) VALUES ($1, $2, 'LPV_V2', $3)
     RETURNING id`,
    [groupStageId, input.aggregateVersion, sourceHash],
  );
  const standingSnapshotId = String(standingSnapshotResult.rows[0]?.id ?? '');
  if (!standingSnapshotId) throw new GoV2Error(500, 'STANDING_SNAPSHOT_FAILED', 'Could not persist standing snapshot');
  const qualificationByEntry = new Map(
    qualificationRows.map((rawRow) => {
      const row = record(rawRow);
      return [String(row.entryId ?? ''), row] as const;
    }),
  );
  const comparisonRows = Array.isArray(pipeline.comparisonRows) ? pipeline.comparisonRows : [];
  const comparisonByEntry = new Map(
    comparisonRows.map((rawRow) => {
      const row = record(rawRow);
      return [String(row.entryId ?? ''), row] as const;
    }),
  );
  for (const rawStanding of standingRows) {
    const standing = record(rawStanding);
    const entryId = String(standing.entryId ?? '');
    const qualification = qualificationByEntry.get(entryId);
    await client.query(
      `INSERT INTO go_v2_standing_snapshot_rows (
         snapshot_id, pool_id, entry_id, pool_rank, comparison_rank,
         metrics, tie_break_trace
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       ON CONFLICT (snapshot_id, entry_id) DO NOTHING`,
      [
        standingSnapshotId,
        String(standing.poolId ?? ''),
        entryId,
        Number(standing.poolRank),
        qualification ? Number(qualification.tierSeed) : null,
        JSON.stringify({
          totals: standing.totals ?? {},
          ratios: standing.ratios ?? {},
          ledger: standing.ledger ?? [],
          comparison: comparisonByEntry.get(entryId) ?? {},
        }),
        JSON.stringify([
          'match_points',
          'set_ratio',
          'rally_point_ratio',
          'initial_seed',
        ]),
      ],
    );
  }

  const qualificationSnapshotResult = await client.query(
    `INSERT INTO go_v2_qualification_snapshots (
       source_stage_id, standing_snapshot_id, aggregate_version,
       rules_snapshot, input_hash, lineage_payload
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
     RETURNING id`,
    [
      groupStageId,
      standingSnapshotId,
      input.aggregateVersion,
      JSON.stringify({
        format: pipeline.format,
        quotas: pipeline.quotas ?? {},
        teamCount: pipeline.teamCount,
        groupCount: pipeline.groupCount,
        sourceHash,
      }),
      sourceHash,
      JSON.stringify({ correctionMode: 'initial_lock', standingSnapshotId }),
    ],
  );
  const qualificationSnapshotId = String(qualificationSnapshotResult.rows[0]?.id ?? '');
  if (!qualificationSnapshotId) {
    throw new GoV2Error(500, 'QUALIFICATION_SNAPSHOT_FAILED', 'Could not persist qualification snapshot');
  }
  for (const rawQualification of qualificationRows) {
    const qualification = record(rawQualification);
    await client.query(
      `INSERT INTO go_v2_qualification_snapshot_rows (
         snapshot_id, entry_id, tier, seed, source_pool_id,
         source_pool_rank, metrics
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (snapshot_id, entry_id) DO NOTHING`,
      [
        qualificationSnapshotId,
        String(qualification.entryId ?? ''),
        String(qualification.tier ?? ''),
        Number(qualification.tierSeed),
        String(qualification.poolId ?? ''),
        Number(qualification.poolRank),
        JSON.stringify({ comparison: qualification.comparison ?? {} }),
      ],
    );
  }

  const brackets: Record<string, unknown>[] = [];
  for (const rawBracket of tierBrackets) {
    const bracket = record(rawBracket);
    brackets.push(await persistBracket(client, {
      tournamentId: input.tournamentId,
      actorId: input.actorId,
      payload: bracket,
    }));
  }
  return {
    standingSnapshotId,
    qualificationSnapshotId,
    sourceHash,
    brackets,
  };
}

/**
 * Records corrected official standings while deliberately preserving the
 * already-published qualification decision. Both snapshots are append-only;
 * bracket matches and their audit-addressable ids are never replaced.
 */
export async function persistRetainedQualificationCorrectionSnapshots(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    groupStageId: string;
    priorStandingSnapshotId: string | null;
    priorQualificationSnapshotId: string;
    sourceHash: string;
    pipeline: CompetitionTierPipelineDto;
    correctionMode?: 'retain_progression_override' | 'compensating_undo_retain_progression';
  },
): Promise<Record<string, unknown>> {
  const correctionMode = input.correctionMode ?? 'retain_progression_override';
  const lineage = await client.query(
    `SELECT qualification.rules_snapshot,
            count(row.entry_id)::int AS qualification_row_count
     FROM go_v2_qualification_snapshots qualification
     JOIN go_v2_stages stage ON stage.id = qualification.source_stage_id
     LEFT JOIN go_v2_qualification_snapshot_rows row ON row.snapshot_id = qualification.id
     WHERE qualification.id = $1
       AND qualification.source_stage_id = $2
       AND stage.tournament_id = $3
     GROUP BY qualification.id`,
    [input.priorQualificationSnapshotId, input.groupStageId, input.tournamentId],
  );
  if (!lineage.rowCount) {
    throw new GoV2Error(
      409,
      'QUALIFICATION_CORRECTION_LINEAGE_STALE',
      'The retained qualification snapshot no longer belongs to this tournament and group stage',
    );
  }
  const standingRows = Array.isArray(input.pipeline.standingRows) ? input.pipeline.standingRows : [];
  if (!standingRows.length) {
    throw new GoV2Error(409, 'QUALIFICATION_CORRECTION_STANDINGS_EMPTY', 'Corrected standing snapshot has no rows');
  }
  const priorQualificationRows = await client.query(
    `SELECT entry_id::text AS entry_id, seed
     FROM go_v2_qualification_snapshot_rows
     WHERE snapshot_id = $1
     ORDER BY entry_id`,
    [input.priorQualificationSnapshotId],
  );
  const retainedSeedByEntry = new Map(
    priorQualificationRows.rows.map((row) => [String(row.entry_id), Number(row.seed)] as const),
  );
  const comparisonByEntry = new Map(
    input.pipeline.comparisonRows.map((row) => [String(row.entryId), row] as const),
  );
  const standingSnapshotResult = await client.query(
    `INSERT INTO go_v2_standing_snapshots (
       stage_id, supersedes_snapshot_id, aggregate_version, profile_code,
       input_hash, lineage_payload
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      input.groupStageId,
      input.priorStandingSnapshotId,
      input.aggregateVersion,
      correctionMode === 'compensating_undo_retain_progression'
        ? 'LPV_V2_COMPENSATING_UNDO_RETAIN'
        : 'LPV_V2_RETAIN_PROGRESSION_OVERRIDE',
      input.sourceHash,
      JSON.stringify({
        correctionMode,
        priorStandingSnapshotId: input.priorStandingSnapshotId,
        priorQualificationSnapshotId: input.priorQualificationSnapshotId,
      }),
    ],
  );
  const standingSnapshotId = String(standingSnapshotResult.rows[0]?.id ?? '');
  if (!standingSnapshotId) throw new GoV2Error(500, 'STANDING_SNAPSHOT_FAILED', 'Could not persist corrected standing snapshot');
  for (const rawStanding of standingRows) {
    const standing = record(rawStanding);
    const entryId = String(standing.entryId ?? '');
    await client.query(
      `INSERT INTO go_v2_standing_snapshot_rows (
         snapshot_id, pool_id, entry_id, pool_rank, comparison_rank,
         metrics, tie_break_trace
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        standingSnapshotId,
        String(standing.poolId ?? ''),
        entryId,
        Number(standing.poolRank),
        retainedSeedByEntry.get(entryId) ?? null,
        JSON.stringify({
          totals: standing.totals ?? {},
          ratios: standing.ratios ?? {},
          ledger: standing.ledger ?? [],
          comparison: comparisonByEntry.get(entryId) ?? {},
          progressionRetained: true,
        }),
        JSON.stringify([
          'match_points',
          'set_ratio',
          'rally_point_ratio',
          'initial_seed',
        ]),
      ],
    );
  }
  const rulesSnapshot = {
    ...record(lineage.rows[0].rules_snapshot),
    correctionMode,
    retainedFromQualificationSnapshotId: input.priorQualificationSnapshotId,
    correctedStandingSnapshotId: standingSnapshotId,
    correctedSourceHash: input.sourceHash,
  };
  const qualificationSnapshotResult = await client.query(
    `INSERT INTO go_v2_qualification_snapshots (
       source_stage_id, standing_snapshot_id, supersedes_snapshot_id,
       aggregate_version, rules_snapshot, input_hash, lineage_payload
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
     RETURNING id`,
    [
      input.groupStageId,
      standingSnapshotId,
      input.priorQualificationSnapshotId,
      input.aggregateVersion,
      JSON.stringify(rulesSnapshot),
      input.sourceHash,
      JSON.stringify({
        correctionMode,
        priorStandingSnapshotId: input.priorStandingSnapshotId,
        standingSnapshotId,
        priorQualificationSnapshotId: input.priorQualificationSnapshotId,
      }),
    ],
  );
  const qualificationSnapshotId = String(qualificationSnapshotResult.rows[0]?.id ?? '');
  if (!qualificationSnapshotId) {
    throw new GoV2Error(500, 'QUALIFICATION_SNAPSHOT_FAILED', 'Could not persist retained qualification snapshot');
  }
  const copied = await client.query(
    `INSERT INTO go_v2_qualification_snapshot_rows (
       snapshot_id, entry_id, tier, seed, source_pool_id,
       source_pool_rank, metrics
     )
     SELECT $1, entry_id, tier, seed, source_pool_id, source_pool_rank,
            metrics || jsonb_build_object(
              'progressionRetained', true,
              'retainedFromQualificationSnapshotId', $2::text
            )
     FROM go_v2_qualification_snapshot_rows
     WHERE snapshot_id = $2`,
    [qualificationSnapshotId, input.priorQualificationSnapshotId],
  );
  const expectedRows = Number(lineage.rows[0].qualification_row_count ?? 0);
  if (copied.rowCount !== expectedRows) {
    throw new GoV2Error(
      409,
      'QUALIFICATION_CORRECTION_COPY_INCOMPLETE',
      'Retained qualification rows changed while the correction was being committed',
      { expectedRows, copiedRows: copied.rowCount },
    );
  }
  return {
    correctionMode,
    priorStandingSnapshotId: input.priorStandingSnapshotId,
    standingSnapshotId,
    priorQualificationSnapshotId: input.priorQualificationSnapshotId,
    qualificationSnapshotId,
    sourceHash: input.sourceHash,
    retainedQualificationRows: copied.rowCount,
  };
}

/**
 * Appends corrected standing/qualification snapshots and atomically rebinds
 * only direct ENTRY slots on the already-locked bracket topology.
 */
export async function persistQualificationCascadeRematerialization(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    groupStageId: string;
    priorStandingSnapshotId: string | null;
    priorQualificationSnapshotId: string;
    sourceHash: string;
    pipeline: CompetitionTierPipelineDto;
    tierBrackets: Array<Record<string, unknown>>;
    expectedTopologyShapeHash: string;
    expectedSlotBindingHash: string;
    correctionMode?: 'cascade_void_and_replay' | 'compensating_undo_cascade';
  },
): Promise<Record<string, unknown>> {
  const correctionMode = input.correctionMode ?? 'cascade_void_and_replay';
  const latest = await client.query(
    `SELECT qualification.id::text AS qualification_snapshot_id,
            qualification.rules_snapshot
     FROM go_v2_qualification_snapshots qualification
     JOIN go_v2_stages stage ON stage.id = qualification.source_stage_id
     WHERE qualification.source_stage_id = $1 AND stage.tournament_id = $2
     ORDER BY qualification.created_at DESC, qualification.id DESC
     LIMIT 1 FOR SHARE OF qualification`,
    [input.groupStageId, input.tournamentId],
  );
  if (
    !latest.rowCount
    || String(latest.rows[0].qualification_snapshot_id) !== input.priorQualificationSnapshotId
  ) {
    throw new GoV2Error(409, 'QUALIFICATION_CORRECTION_LINEAGE_STALE',
      'A newer qualification snapshot exists; generate a fresh impact preview', {
        expectedQualificationSnapshotId: input.priorQualificationSnapshotId,
        actualQualificationSnapshotId: latest.rows[0]?.qualification_snapshot_id ?? null,
      });
  }
  const topologyPlan = await loadQualificationCascadeTopologyPlan(
    client,
    input.tournamentId,
    input.tierBrackets,
  );
  if (
    topologyPlan.topologyShapeHash !== input.expectedTopologyShapeHash
    || topologyPlan.slotBindingHash !== input.expectedSlotBindingHash
  ) {
    throw new GoV2Error(409, 'QUALIFICATION_CASCADE_PREVIEW_STALE',
      'Tier seed bindings changed after preview; generate a fresh cascade preview', {
        expectedTopologyShapeHash: input.expectedTopologyShapeHash,
        topologyShapeHash: topologyPlan.topologyShapeHash,
        expectedSlotBindingHash: input.expectedSlotBindingHash,
        slotBindingHash: topologyPlan.slotBindingHash,
      });
  }
  const qualificationRows = [...input.pipeline.qualificationRows];
  const qualificationByEntry = new Map(qualificationRows.map((row) => [row.entryId, row] as const));
  const comparisonByEntry = new Map(input.pipeline.comparisonRows.map((row) => [row.entryId, row] as const));
  const standingLineage = {
    correctionMode,
    supersedesStandingSnapshotId: input.priorStandingSnapshotId,
    supersedesQualificationSnapshotId: input.priorQualificationSnapshotId,
    topologyShapeHash: topologyPlan.topologyShapeHash,
    slotBindingHash: topologyPlan.slotBindingHash,
  };
  const standing = await client.query(
    `INSERT INTO go_v2_standing_snapshots (
       stage_id, supersedes_snapshot_id, aggregate_version, profile_code,
       input_hash, lineage_payload
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
    [input.groupStageId, input.priorStandingSnapshotId, input.aggregateVersion,
      correctionMode === 'compensating_undo_cascade'
        ? 'LPV_V2_COMPENSATING_UNDO_CASCADE' : 'LPV_V2_CASCADE_REPLAY',
      input.sourceHash, JSON.stringify(standingLineage)],
  );
  const standingSnapshotId = String(standing.rows[0]?.id ?? '');
  if (!standingSnapshotId) {
    throw new GoV2Error(500, 'STANDING_SNAPSHOT_FAILED', 'Could not append cascade standing snapshot');
  }
  for (const row of input.pipeline.standingRows) {
    const qualification = qualificationByEntry.get(row.entryId);
    await client.query(
      `INSERT INTO go_v2_standing_snapshot_rows (
         snapshot_id, pool_id, entry_id, pool_rank, comparison_rank, metrics, tie_break_trace
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [standingSnapshotId, row.poolId, row.entryId, row.poolRank,
        qualification?.tierSeed ?? null,
        JSON.stringify({ totals: row.totals ?? {}, ratios: row.ratios ?? {},
          ledger: row.ledger ?? [], comparison: comparisonByEntry.get(row.entryId) ?? {} }),
        JSON.stringify(['match_points', 'set_ratio', 'rally_point_ratio', 'initial_seed'])],
    );
  }
  const rulesSnapshot = {
    ...record(latest.rows[0].rules_snapshot),
    format: input.pipeline.format,
    quotas: input.pipeline.quotas,
    teamCount: input.pipeline.teamCount,
    groupCount: input.pipeline.groupCount,
    correctionMode,
    sourceHash: input.sourceHash,
    topologyShapeHash: topologyPlan.topologyShapeHash,
    slotBindingHash: topologyPlan.slotBindingHash,
    correctedStandingSnapshotId: standingSnapshotId,
    supersedesQualificationSnapshotId: input.priorQualificationSnapshotId,
  };
  const qualification = await client.query(
    `INSERT INTO go_v2_qualification_snapshots (
       source_stage_id, standing_snapshot_id, supersedes_snapshot_id,
       aggregate_version, rules_snapshot, input_hash, lineage_payload
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb) RETURNING id`,
    [input.groupStageId, standingSnapshotId, input.priorQualificationSnapshotId,
      input.aggregateVersion, JSON.stringify(rulesSnapshot), input.sourceHash,
      JSON.stringify({ ...standingLineage, standingSnapshotId })],
  );
  const qualificationSnapshotId = String(qualification.rows[0]?.id ?? '');
  if (!qualificationSnapshotId) {
    throw new GoV2Error(500, 'QUALIFICATION_SNAPSHOT_FAILED', 'Could not append cascade qualification snapshot');
  }
  for (const row of qualificationRows) {
    await client.query(
      `INSERT INTO go_v2_qualification_snapshot_rows (
         snapshot_id, entry_id, tier, seed, source_pool_id, source_pool_rank, metrics
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [qualificationSnapshotId, row.entryId, row.tier, row.tierSeed,
        row.poolId, row.poolRank, JSON.stringify({ comparison: row.comparison })],
    );
  }
  for (const change of topologyPlan.slotChanges) {
    const rebound = await client.query(
      `UPDATE go_v2_match_slot_sources
       SET source_type = 'ENTRY', source_entry_id = $3, source_pool_id = NULL,
           source_match_id = NULL, source_rank = NULL, resolved_entry_id = $3,
           resolution_version = resolution_version + 1
       WHERE match_id = $1 AND slot_no = $2 AND route_source_type = 'ENTRY'
         AND source_entry_id IS NOT DISTINCT FROM $4::uuid
       RETURNING match_id`,
      [change.matchId, change.slotNo, change.nextEntryId, change.priorEntryId],
    );
    if (rebound.rowCount !== 1) {
      throw new GoV2Error(409, 'QUALIFICATION_CASCADE_ENTRY_BINDING_STALE',
        'A direct bracket seed changed while the cascade was committing', change);
    }
  }
  for (const stage of topologyPlan.stages) {
    const reboundStage = await client.query(
      `UPDATE go_v2_stages
       SET configuration = configuration || jsonb_build_object(
             'topologyHash', $2::text,
             'participantSeeds', $3::jsonb,
             'qualificationSnapshotId', $4::text
           ),
           version = version + 1, updated_at = now()
       WHERE id = $1 AND tournament_id = $5`,
      [stage.stageId, stage.topologyHash, JSON.stringify(stage.participantSeeds),
        qualificationSnapshotId, input.tournamentId],
    );
    if (reboundStage.rowCount !== 1) {
      throw new GoV2Error(
        409,
        'QUALIFICATION_CASCADE_STAGE_STALE',
        'A locked tier stage changed while the qualification cascade was committing',
        { stageId: stage.stageId, stageKey: stage.stageKey },
      );
    }
  }
  return {
    correctionMode,
    priorStandingSnapshotId: input.priorStandingSnapshotId,
    standingSnapshotId,
    priorQualificationSnapshotId: input.priorQualificationSnapshotId,
    qualificationSnapshotId,
    sourceHash: input.sourceHash,
    topologyPlan,
  };
}

/**
 * Appends a truthful pending-replay standing/qualification marker without
 * deleting the historical decision it supersedes. Direct tier seeds become
 * runtime BYEs while their immutable ENTRY route lineage is preserved; a
 * later bracket lock/cascade can therefore bind the replayed standings again.
 */
export async function persistPendingReplayQualificationInvalidation(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    actorId: string;
    groupStageId: string;
    priorStandingSnapshotId: string | null;
    priorQualificationSnapshotId: string;
    replayMatchIds: string[];
    sourceHash: string;
  },
): Promise<Record<string, unknown>> {
  const latest = await client.query(
    `SELECT qualification.id::text AS qualification_snapshot_id,
            qualification.rules_snapshot,
            standing.id::text AS standing_snapshot_id
     FROM go_v2_qualification_snapshots qualification
     JOIN go_v2_stages stage ON stage.id = qualification.source_stage_id
     LEFT JOIN LATERAL (
       SELECT candidate.id
       FROM go_v2_standing_snapshots candidate
       WHERE candidate.stage_id = qualification.source_stage_id
       ORDER BY candidate.created_at DESC, candidate.id DESC
       LIMIT 1
     ) standing ON true
     WHERE qualification.source_stage_id = $1 AND stage.tournament_id = $2
     ORDER BY qualification.created_at DESC, qualification.id DESC
     LIMIT 1
     FOR SHARE OF qualification`,
    [input.groupStageId, input.tournamentId],
  );
  if (
    !latest.rowCount
    || String(latest.rows[0].qualification_snapshot_id) !== input.priorQualificationSnapshotId
    || String(latest.rows[0].standing_snapshot_id ?? '') !== String(input.priorStandingSnapshotId ?? '')
  ) {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_QUALIFICATION_STALE',
      'Standing or qualification lineage changed after reinstatement preview',
      {
        groupStageId: input.groupStageId,
        expectedStandingSnapshotId: input.priorStandingSnapshotId,
        actualStandingSnapshotId: latest.rows[0]?.standing_snapshot_id ?? null,
        expectedQualificationSnapshotId: input.priorQualificationSnapshotId,
        actualQualificationSnapshotId: latest.rows[0]?.qualification_snapshot_id ?? null,
      },
    );
  }
  const lineage = {
    correctionMode: 'attendance_reinstatement_pending_replay',
    replayMatchIds: [...new Set(input.replayMatchIds)].sort(stableTextCompare),
    supersedesStandingSnapshotId: input.priorStandingSnapshotId,
    supersedesQualificationSnapshotId: input.priorQualificationSnapshotId,
    sourceHash: input.sourceHash,
  };
  const standing = await client.query(
    `INSERT INTO go_v2_standing_snapshots (
       stage_id, supersedes_snapshot_id, aggregate_version,
       profile_code, input_hash, lineage_payload
     ) VALUES ($1, $2, $3, 'LPV_V2_ATTENDANCE_REPLAY_PENDING', $4, $5::jsonb)
     RETURNING id::text`,
    [
      input.groupStageId,
      input.priorStandingSnapshotId,
      input.aggregateVersion,
      input.sourceHash,
      JSON.stringify(lineage),
    ],
  );
  const standingSnapshotId = String(standing.rows[0].id);
  const rulesSnapshot = {
    ...record(latest.rows[0].rules_snapshot),
    qualificationState: 'pending_replay',
    pendingReplayMatchIds: lineage.replayMatchIds,
    sourceHash: input.sourceHash,
  };
  const qualification = await client.query(
    `INSERT INTO go_v2_qualification_snapshots (
       source_stage_id, standing_snapshot_id, supersedes_snapshot_id,
       aggregate_version, rules_snapshot, input_hash, lineage_payload
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
     RETURNING id::text`,
    [
      input.groupStageId,
      standingSnapshotId,
      input.priorQualificationSnapshotId,
      input.aggregateVersion,
      JSON.stringify(rulesSnapshot),
      input.sourceHash,
      JSON.stringify({ ...lineage, standingSnapshotId }),
    ],
  );
  const qualificationSnapshotId = String(qualification.rows[0].id);
  const invalidatedSlots = await client.query(
    `UPDATE go_v2_match_slot_sources source
     SET source_type = 'BYE', source_entry_id = NULL, source_pool_id = NULL,
         source_match_id = NULL, source_rank = NULL, resolved_entry_id = NULL,
         resolution_version = resolution_version + 1
     FROM go_v2_matches match
     JOIN go_v2_stages stage ON stage.id = match.stage_id
     WHERE source.match_id = match.id
       AND stage.tournament_id = $1
       AND stage.tier IS NOT NULL
       AND stage.status <> 'voided'
       AND source.route_source_type = 'ENTRY'
     RETURNING source.match_id::text, source.slot_no`,
    [input.tournamentId],
  );
  const updatedStages = await client.query(
    `UPDATE go_v2_stages
     SET configuration = configuration || jsonb_build_object(
           'qualificationSnapshotId', $2::text,
           'qualificationState', 'pending_replay',
           'pendingReplayMatchIds', $3::jsonb,
           'participantSeeds', '[]'::jsonb
         ),
         version = version + 1,
         updated_at = now()
     WHERE tournament_id = $1 AND tier IS NOT NULL AND status <> 'voided'
     RETURNING id::text`,
    [input.tournamentId, qualificationSnapshotId, JSON.stringify(lineage.replayMatchIds)],
  );
  return {
    correctionMode: 'attendance_reinstatement_pending_replay',
    groupStageId: input.groupStageId,
    priorStandingSnapshotId: input.priorStandingSnapshotId,
    standingSnapshotId,
    priorQualificationSnapshotId: input.priorQualificationSnapshotId,
    qualificationSnapshotId,
    replayMatchIds: lineage.replayMatchIds,
    invalidatedSlots: invalidatedSlots.rows.map((row) => ({
      matchId: String(row.match_id),
      slotNo: Number(row.slot_no),
    })),
    affectedStageIds: updatedStages.rows.map((row) => String(row.id)),
    actorId: input.actorId,
    sourceHash: input.sourceHash,
  };
}

export async function persistScheduleVersion(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    inputHash: string;
  payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const session = record(input.payload.session);
  const sessionTournamentIds = [...new Set([
    input.tournamentId,
    ...(Array.isArray(input.payload.sessionTournamentIds)
      ? input.payload.sessionTournamentIds.map(String)
      : Array.isArray(session.tournamentIds)
        ? session.tournamentIds.map(String)
        : []),
  ])].sort(stableTextCompare);
  const solver = record(input.payload.solverResult ?? input.payload.solver);
  const solverInput = record(input.payload.solverInput);
  const solverWindow = record(solverInput.window);
  const sessionKey = String(session.sessionKey ?? `tournament-${input.tournamentId}`);
  const windowStart = String(session.windowStart ?? solverWindow.start ?? '');
  const windowEnd = String(session.windowEnd ?? solverWindow.end ?? '');
  if (!windowStart || !windowEnd) {
    throw new GoV2Error(422, 'INVALID_SCHEDULE_SESSION', 'session.windowStart and session.windowEnd are required');
  }
  const sessionResult = await client.query(
    `INSERT INTO go_v2_schedule_sessions (
       session_key, label, timezone, window_start, window_end,
       freeze_horizon_minutes, time_quantum_minutes, referee_mode, configuration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (session_key) DO UPDATE SET
        label = go_v2_schedule_sessions.label,
        timezone = go_v2_schedule_sessions.timezone,
        window_start = go_v2_schedule_sessions.window_start,
        window_end = go_v2_schedule_sessions.window_end,
        freeze_horizon_minutes = go_v2_schedule_sessions.freeze_horizon_minutes,
        time_quantum_minutes = go_v2_schedule_sessions.time_quantum_minutes,
        referee_mode = go_v2_schedule_sessions.referee_mode,
        configuration = go_v2_schedule_sessions.configuration,
        updated_at = now()
     RETURNING id`,
    [
      sessionKey,
      String(session.label ?? sessionKey),
      String(session.timezone ?? solverInput.timezone ?? 'Asia/Yekaterinburg'),
      windowStart,
      windowEnd,
      Number(session.freezeHorizonMinutes ?? 60),
      Number(session.timeQuantumMinutes ?? 5),
      String(session.refereeMode ?? 'none'),
      JSON.stringify(record(session.configuration)),
    ],
  );
  const sessionId = String(sessionResult.rows[0].id);
  await client.query(`SELECT id FROM go_v2_schedule_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
  const linkedTournaments = await client.query(
    `SELECT tournament_id::text
     FROM go_v2_schedule_session_tournaments
     WHERE session_id = $1`,
    [sessionId],
  );
  const unexpectedLinkedIds = linkedTournaments.rows
    .map((row) => String(row.tournament_id))
    .filter((tournamentId) => !sessionTournamentIds.includes(tournamentId));
  if (unexpectedLinkedIds.length) {
    throw new GoV2Error(
      409,
      'SCHEDULE_SESSION_MEMBERSHIP_MISMATCH',
      'A published shared session cannot silently drop linked tournaments',
      { sessionId, unexpectedLinkedIds },
    );
  }
  for (const [index, memberTournamentId] of sessionTournamentIds.entries()) {
    await client.query(
      `INSERT INTO go_v2_schedule_session_tournaments (session_id, tournament_id, priority)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, tournament_id) DO UPDATE SET priority = EXCLUDED.priority`,
      [sessionId, memberTournamentId, Number(session.priority ?? 0) - index],
    );
  }

  const venueKey = String(session.venueKey ?? `session-${sessionKey}`);
  const suppliedCourts = Array.isArray(session.courts) && session.courts.length
    ? session.courts
    : Array.isArray(solverInput.courts) && solverInput.courts.length
      ? solverInput.courts
      : [];
  const courtsInput = suppliedCourts.length
    ? suppliedCourts.map((rawCourt, index) => {
        const court = record(rawCourt);
        return {
          ...court,
          courtNo: court.courtNo ?? index + 1,
          availableWindows: court.availableWindows ?? court.availability ?? [],
        };
      })
    : [1, 2, 3, 4].map((courtNo) => ({ courtNo, label: `Court ${courtNo}` }));
  if (courtsInput.length < 1 || courtsInput.length > 6) {
    throw new GoV2Error(422, 'INVALID_COURT_COUNT', 'A schedule session requires 1-6 courts');
  }
  const courtIdByNo = new Map<number, string>();
  const courtIdBySolverId = new Map<string, string>();
  for (const rawCourt of courtsInput) {
    const court = record(rawCourt);
    const courtNo = Number(court.courtNo);
    if (!Number.isInteger(courtNo) || courtNo < 1 || courtNo > 6 || courtIdByNo.has(courtNo)) {
      throw new GoV2Error(422, 'INVALID_COURT', 'Court numbers must be unique integers from 1 to 6');
    }
    const courtResult = await client.query(
      `INSERT INTO go_v2_courts (venue_key, court_no, label, affinity, is_active)
       VALUES ($1, $2, $3, $4::jsonb, true)
        ON CONFLICT (venue_key, court_no) DO UPDATE SET
          label = go_v2_courts.label,
          affinity = go_v2_courts.affinity,
          is_active = go_v2_courts.is_active
       RETURNING id`,
      [
        venueKey,
        courtNo,
        String(court.label ?? `Court ${courtNo}`),
        JSON.stringify(record(court.affinity)),
      ],
    );
    const courtId = String(courtResult.rows[0].id);
    courtIdByNo.set(courtNo, courtId);
    courtIdBySolverId.set(String(court.id ?? courtNo), courtId);
    await client.query(
      `INSERT INTO go_v2_schedule_session_courts (session_id, court_id, available_windows)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (session_id, court_id) DO UPDATE SET
         available_windows = CASE
           WHEN EXISTS (
             SELECT 1 FROM go_v2_schedule_versions existing
             WHERE existing.session_id = EXCLUDED.session_id
           ) THEN go_v2_schedule_session_courts.available_windows
           ELSE EXCLUDED.available_windows
         END`,
      [sessionId, courtId, JSON.stringify(Array.isArray(court.availableWindows) ? court.availableWindows : [])],
    );
  }

  const versionNoResult = await client.query(
    `SELECT COALESCE(max(version_no), 0) + 1 AS version_no
     FROM go_v2_schedule_versions WHERE session_id = $1`,
    [sessionId],
  );
  const versionNo = numeric(versionNoResult.rows[0].version_no);
  const solverStatus = String(solver.status ?? 'feasible');
  const assignments = Array.isArray(solver.assignments) ? solver.assignments : [];
  const expectedAssignmentCount = Array.isArray(solverInput.matches) ? solverInput.matches.length : assignments.length;
  if (
    !['feasible', 'feasible_with_warnings'].includes(solverStatus)
    || solver.publishable !== true
    || !String(solver.scheduleHash ?? '')
    || assignments.length === 0
    || assignments.length !== expectedAssignmentCount
  ) {
    throw new GoV2Error(422, 'SCHEDULE_NOT_FEASIBLE', 'Only a validated feasible schedule can be published', {
      solverStatus,
      publishable: solver.publishable === true,
      assignmentCount: assignments.length,
      expectedAssignmentCount,
      hasScheduleHash: Boolean(solver.scheduleHash),
    });
  }
  const assignmentMatchIds = [...new Set(assignments.map((rawAssignment) => String(record(rawAssignment).matchId ?? '')))];
  const assignmentOwners = await client.query(
    `SELECT id::text, tournament_id::text
     FROM go_v2_matches
     WHERE id = ANY($1::uuid[])`,
    [assignmentMatchIds],
  );
  if (
    assignmentOwners.rows.length !== assignmentMatchIds.length
    || assignmentOwners.rows.some((row) => !sessionTournamentIds.includes(String(row.tournament_id)))
  ) {
    throw new GoV2Error(
      409,
      'SCHEDULE_ASSIGNMENT_TOURNAMENT_MISMATCH',
      'Every assignment must belong to a tournament locked into this schedule command',
    );
  }
  const assignedOwnerIds = new Set(assignmentOwners.rows.map((row) => String(row.tournament_id)));
  const emptyTournamentIds = sessionTournamentIds.filter((tournamentId) => !assignedOwnerIds.has(tournamentId));
  if (emptyTournamentIds.length) {
    throw new GoV2Error(
      422,
      'SESSION_TOURNAMENT_HAS_NO_ASSIGNMENTS',
      'Every tournament in a shared session must contribute at least one scheduled match',
      { emptyTournamentIds },
    );
  }
  const basedOnVersionResult = await client.query(
    `SELECT id::text
     FROM go_v2_schedule_versions
     WHERE session_id = $1 AND status = 'published'
     ORDER BY version_no DESC
     LIMIT 1
     FOR UPDATE`,
    [sessionId],
  );
  const basedOnVersionId = basedOnVersionResult.rows[0]?.id
    ? String(basedOnVersionResult.rows[0].id)
    : null;
  const priorAssignmentResult = basedOnVersionId
    ? await client.query(
        `SELECT match_id::text, live_eta, is_locked, lock_reason,
                predicted_start, predicted_end, actual_start, actual_end
         FROM go_v2_schedule_assignments
         WHERE schedule_version_id = $1`,
        [basedOnVersionId],
      )
    : { rows: [] };
  const priorAssignmentByMatchId = new Map(
    priorAssignmentResult.rows.map((row) => [String(row.match_id), row]),
  );
  await client.query(
    `UPDATE go_v2_schedule_versions
     SET status = 'superseded'
     WHERE session_id = $1 AND status = 'published'`,
    [sessionId],
  );
  const versionResult = await client.query(
    `INSERT INTO go_v2_schedule_versions (
       session_id, version_no, status, solver_status, solver_version, input_hash,
       schedule_hash, elapsed_ms, expanded_states, repair_passes, objective,
       conflicts, based_on_version_id, created_by, published_at,
       publication_kind, source_preview_id, input_snapshot,
       validator_result, diff_snapshot
     ) VALUES ($1, $2, 'published', $3, $4, $5, $6, $7, $8, $9,
               $10::jsonb, $11::jsonb, $12, $13, now(),
               $14, $15, $16::jsonb, $17::jsonb, $18::jsonb)
     RETURNING id`,
    [
      sessionId,
      versionNo,
      solverStatus,
      String(solver.solverVersion ?? 'go-v2-foundation'),
      String(solver.inputHash ?? input.inputHash),
      solver.scheduleHash ? String(solver.scheduleHash) : null,
      Number(solver.elapsedMs ?? record(solver.metrics).elapsedMs ?? 0),
      Number(solver.expandedStates ?? record(solver.metrics).expandedStates ?? 0),
      Number(solver.repairPasses ?? record(solver.metrics).repairPasses ?? 0),
      JSON.stringify(record(solver.objective)),
      JSON.stringify(Array.isArray(solver.conflicts) ? solver.conflicts : []),
      basedOnVersionId,
      input.actorId,
      String(input.payload.publicationKind ?? (versionNo === 1 ? 'initial' : 'replan')),
      input.payload.sourcePreviewId ? String(input.payload.sourcePreviewId) : null,
      JSON.stringify({
        solverInput,
        session,
        authoritativeDisruptions: Array.isArray(session.authoritativeDisruptions)
          ? session.authoritativeDisruptions
          : [],
      }),
      JSON.stringify(record(input.payload.independentValidation)),
      JSON.stringify(record(input.payload.scheduleDiff)),
    ],
  );
  const scheduleVersionId = String(versionResult.rows[0].id);
  const liveEtaOverrides = new Map<string, string>();
  if (Array.isArray(input.payload.liveEtaOverrides)) {
    for (const rawOverride of input.payload.liveEtaOverrides) {
      const override = record(rawOverride);
      if (override.matchId && override.liveEta) {
        liveEtaOverrides.set(String(override.matchId), String(override.liveEta));
      }
    }
  } else {
    for (const [matchId, liveEta] of Object.entries(record(input.payload.liveEtaOverrides))) {
      if (liveEta) liveEtaOverrides.set(matchId, String(liveEta));
    }
  }
  const replayMatchIds = new Set(
    Array.isArray(input.payload.replayMatchIds)
      ? input.payload.replayMatchIds.map(String)
      : [],
  );
  const loserDutySourceMatchIds = new Set<string>();
  for (const rawAssignment of assignments) {
    const assignment = record(rawAssignment);
    const assignmentMatchId = String(assignment.matchId ?? '');
    // A replay receives a fresh runtime assignment. Historical actual timing,
    // live ETA and locks remain on the superseded schedule version.
    const priorAssignment = replayMatchIds.has(assignmentMatchId)
      ? undefined
      : priorAssignmentByMatchId.get(assignmentMatchId);
    const assignmentCourtId = assignment.courtId
      ? courtIdBySolverId.get(String(assignment.courtId)) ?? String(assignment.courtId)
      : courtIdByNo.get(Number(assignment.courtNo));
    if (!assignmentCourtId) {
      throw new GoV2Error(422, 'UNKNOWN_ASSIGNMENT_COURT', 'Schedule assignment references an unknown court');
    }
    const assignmentResult = await client.query(
      `INSERT INTO go_v2_schedule_assignments (
         schedule_version_id, match_id, court_id, planned_start, planned_end,
         predicted_start, predicted_end, actual_start, actual_end,
         live_eta, is_locked, lock_reason, is_conditional
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        scheduleVersionId,
        assignmentMatchId,
        assignmentCourtId,
        String(assignment.plannedStart ?? assignment.start ?? ''),
        String(assignment.plannedEnd ?? assignment.end ?? ''),
        assignment.predictedStart
          ? String(assignment.predictedStart)
          : priorAssignment?.predicted_start ?? null,
        assignment.predictedEnd
          ? String(assignment.predictedEnd)
          : priorAssignment?.predicted_end ?? null,
        priorAssignment?.actual_start ?? null,
        priorAssignment?.actual_end ?? null,
        (replayMatchIds.has(assignmentMatchId) ? null : liveEtaOverrides.get(assignmentMatchId))
          ?? (assignment.liveEta
          ? String(assignment.liveEta)
          : priorAssignment?.live_eta
            ? new Date(priorAssignment.live_eta).toISOString()
            : null),
        assignment.isLocked === true || priorAssignment?.is_locked === true,
        assignment.lockReason
          ? String(assignment.lockReason)
          : priorAssignment?.lock_reason
            ? String(priorAssignment.lock_reason)
            : null,
        assignment.isConditional === true || assignment.conditional === true,
      ],
    );
    const assignmentId = String(assignmentResult.rows[0].id);
    const referee = record(assignment.referee);
    const refereeKind = String(referee.kind ?? 'none');
    if (refereeKind !== 'none') {
      const reservedTeamIds = Array.isArray(referee.reservedTeamIds)
        ? referee.reservedTeamIds.map((entryId) => String(entryId))
        : [];
      const dutyKind = refereeKind === 'court_judge'
        ? 'staff'
        : refereeKind === 'fixed_team'
          ? 'entry'
          : 'loser_previous_same_court';
      if (dutyKind === 'loser_previous_same_court') {
        loserDutySourceMatchIds.add(String(referee.sourceMatchId ?? ''));
      }
      await client.query(
        `INSERT INTO go_v2_referee_duties (
           schedule_assignment_id, duty_kind, referee_entry_id,
           source_match_id, candidate_entry_ids, metadata
         ) VALUES ($1, $2, $3, $4, $5::uuid[], $6::jsonb)`,
        [
          assignmentId,
          dutyKind,
          dutyKind === 'entry' ? reservedTeamIds[0] ?? null : null,
          dutyKind === 'loser_previous_same_court' ? String(referee.sourceMatchId ?? '') : null,
          dutyKind === 'loser_previous_same_court' ? reservedTeamIds : [],
          JSON.stringify({ isFallback: referee.isFallback === true }),
        ],
      );
    }
    await client.query(
      `UPDATE go_v2_matches
       SET schedule_state = CASE WHEN schedule_state = 'locked' THEN 'locked' ELSE 'scheduled' END,
           updated_at = now()
       WHERE id = $1 AND tournament_id = ANY($2::uuid[])`,
      [String(assignment.matchId ?? ''), sessionTournamentIds],
    );
  }
  if (loserDutySourceMatchIds.size) {
    const completedSources = await client.query(
      `SELECT id::text AS match_id, loser_entry_id::text AS loser_entry_id,
              current_result_revision_no
       FROM go_v2_matches
       WHERE id::text = ANY($1::text[])
         AND current_result_revision_no > 0`,
      [[...loserDutySourceMatchIds].filter(Boolean)],
    );
    for (const source of completedSources.rows) {
      await materializeLoserRefereeDuties(client, {
        sourceMatchId: String(source.match_id),
        loserEntryId: source.loser_entry_id ? String(source.loser_entry_id) : null,
        resultRevisionNo: numeric(source.current_result_revision_no),
      });
    }
  }
  for (const memberTournamentId of sessionTournamentIds) {
    await setActiveScheduleVersion(client, memberTournamentId, scheduleVersionId);
  }
  return {
    sessionId,
    scheduleVersionId,
    sessionTournamentIds,
    versionNo,
    assignmentCount: assignments.length,
    status: 'published',
  };
}

export async function loadActiveGoV2CourtPolicyExceptions(
  client: PoolClient,
  input: {
    scheduleSessionId: string;
    tournamentIds: string[];
  },
): Promise<GoV2CourtPolicyExceptionBinding[]> {
  const result = await client.query(
    `SELECT revision.id::text, revision.tournament_id::text,
            revision.schedule_session_id::text, revision.stage_id::text,
            revision.tier, revision.decision, revision.allowed_court_ids,
            revision.effective_from, revision.effective_until
     FROM go_v2_court_policy_exception_revisions revision
     WHERE revision.schedule_session_id = $1
       AND revision.tournament_id = ANY($2::uuid[])
       AND revision.decision = 'approve'
       AND NOT EXISTS (
         SELECT 1
         FROM go_v2_court_policy_exception_revisions successor
         WHERE successor.supersedes_id = revision.id
       )
     ORDER BY revision.created_at, revision.id`,
    [input.scheduleSessionId, input.tournamentIds],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    tournamentId: String(row.tournament_id),
    scheduleSessionId: String(row.schedule_session_id),
    stageId: row.stage_id ? String(row.stage_id) : null,
    tier: String(row.tier) as GoV2CourtPolicyExceptionBinding['tier'],
    decision: 'approve' as const,
    allowedCourtIds: Array.isArray(row.allowed_court_ids)
      ? row.allowed_court_ids.map(String).sort()
      : [],
    effectiveFrom: new Date(row.effective_from).toISOString(),
    effectiveUntil: new Date(row.effective_until).toISOString(),
  }));
}

export async function persistGoV2CourtPolicyExceptionRevision(
  client: PoolClient,
  input: {
    tournamentId: string;
    scheduleSessionId: string;
    stageId: string | null;
    tier: GoV2CourtPolicyExceptionBinding['tier'];
    allowedCourtIds: string[];
    effectiveFrom: string;
    effectiveUntil: string;
    sourcePreviewId: string;
    successorScheduleVersionId: string;
    supersedesId?: string | null;
    reasonCode: string;
    reasonNote?: string;
    actorId: string;
  },
): Promise<Record<string, unknown>> {
  const reasonNote = String(input.reasonNote ?? '').trim();
  if (!reasonNote) {
    throw new GoV2Error(
      422,
      'REASON_NOTE_REQUIRED',
      'A director must explain every court-policy exception',
    );
  }
  const result = await client.query(
    `INSERT INTO go_v2_court_policy_exception_revisions (
       tournament_id, schedule_session_id, stage_id, tier, decision,
       allowed_court_ids, effective_from, effective_until,
       source_preview_id, successor_schedule_version_id, supersedes_id,
       reason_code, reason_note, actor_id, actor_role
     ) VALUES ($1, $2, $3, $4, 'approve', $5::uuid[], $6, $7,
               $8, $9, $10, $11, $12, $13, 'director')
     RETURNING id::text, created_at`,
    [
      input.tournamentId,
      input.scheduleSessionId,
      input.stageId,
      input.tier,
      input.allowedCourtIds,
      input.effectiveFrom,
      input.effectiveUntil,
      input.sourcePreviewId,
      input.successorScheduleVersionId,
      input.supersedesId ?? null,
      input.reasonCode,
      reasonNote,
      input.actorId,
    ],
  );
  return {
    id: String(result.rows[0].id),
    tournamentId: input.tournamentId,
    scheduleSessionId: input.scheduleSessionId,
    stageId: input.stageId,
    tier: input.tier,
    decision: 'approve',
    allowedCourtIds: input.allowedCourtIds,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil,
    sourcePreviewId: input.sourcePreviewId,
    successorScheduleVersionId: input.successorScheduleVersionId,
    supersedesId: input.supersedesId ?? null,
    reasonCode: input.reasonCode,
    reasonNote,
    actorId: input.actorId,
    createdAt: new Date(result.rows[0].created_at).toISOString(),
  };
}

export async function persistGoV2StageRuleChange(
  client: PoolClient,
  input: {
    tournamentId: string;
    stageId: string;
    effectiveFromRoundNo: number;
    matchRule: MatchRule;
    affectedMatchIds: string[];
    sourcePreviewId: string;
    successorScheduleVersionId: string;
    redApprovalId?: string | null;
    reasonCode: string;
    reasonNote?: string;
    actorId: string;
  },
): Promise<Record<string, unknown>> {
  const reasonNote = String(input.reasonNote ?? '').trim();
  if (!reasonNote) {
    throw new GoV2Error(422, 'REASON_NOTE_REQUIRED', 'A director must explain every stage rule change');
  }
  const stageResult = await client.query(
    `SELECT stage.id::text, stage.stage_type, stage.match_rule,
            stage.current_rule_revision_id::text
     FROM go_v2_stages stage
     WHERE stage.id = $1 AND stage.tournament_id = $2
     FOR UPDATE`,
    [input.stageId, input.tournamentId],
  );
  if (!stageResult.rowCount) throw new GoV2Error(404, 'STAGE_NOT_FOUND', 'Stage not found');
  const stage = stageResult.rows[0];
  const matchResult = await client.query(
    `SELECT match.id::text, match.round_no, match.match_rule,
            match.current_rule_revision_id::text
     FROM go_v2_matches match
     WHERE match.stage_id = $1 AND match.tournament_id = $2
     ORDER BY match.round_no, match.position, match.id
     FOR UPDATE`,
    [input.stageId, input.tournamentId],
  );
  const expectedAffectedIds = String(stage.stage_type) === 'round_robin_pool'
    || String(stage.stage_type) === 'modified_pool_4'
    ? matchResult.rows.map((row) => String(row.id)).sort()
    : matchResult.rows
        .filter((row) => Number(row.round_no) >= input.effectiveFromRoundNo)
        .map((row) => String(row.id))
        .sort();
  const suppliedAffectedIds = [...new Set(input.affectedMatchIds)].sort();
  if (
    expectedAffectedIds.length !== suppliedAffectedIds.length
    || expectedAffectedIds.some((matchId, index) => matchId !== suppliedAffectedIds[index])
  ) {
    throw new GoV2Error(
      409,
      'STAGE_RULE_SCOPE_STALE',
      'The immutable preview no longer covers the complete effective rounds',
      { expectedAffectedIds, suppliedAffectedIds },
    );
  }

  const priorStageRule = record(stage.match_rule);
  const newRule = record(input.matchRule);
  const newRuleHash = stableRepositoryHash(newRule);
  const stageLedger = await client.query(
    `SELECT id::text, revision_no, rule_hash
     FROM go_v2_stage_rule_revisions
     WHERE stage_id = $1
     ORDER BY revision_no DESC
     LIMIT 1
     FOR UPDATE`,
    [input.stageId],
  );
  const originalStageRevisionId = stage.current_rule_revision_id
    ? String(stage.current_rule_revision_id)
    : null;
  let currentStageRevisionId = originalStageRevisionId;
  let nextStageRevisionNo = stageLedger.rowCount ? Number(stageLedger.rows[0].revision_no) + 1 : 1;
  if (stageLedger.rowCount && currentStageRevisionId !== String(stageLedger.rows[0].id)) {
    throw new GoV2Error(409, 'STAGE_RULE_POINTER_STALE', 'Stage rule pointer does not reference the latest immutable revision');
  }
  if (
    stageLedger.rowCount
    && String(stageLedger.rows[0].rule_hash) !== stableRepositoryHash(priorStageRule)
  ) {
    throw new GoV2Error(409, 'STAGE_RULE_PROJECTION_STALE', 'Stage rule projection does not match its immutable revision');
  }
  if (!currentStageRevisionId) {
    const baseline = await client.query(
      `INSERT INTO go_v2_stage_rule_revisions (
         tournament_id, stage_id, revision_no, revision_kind,
         effective_from_round_no, rule_snapshot, rule_hash, supersedes_id,
         source_preview_id, red_approval_id, successor_schedule_version_id,
         reason_code, reason_note, actor_id
       ) VALUES ($1, $2, 1, 'initial', 1, $3::jsonb, $4, NULL,
                 $5, $6, $7, $8, $9, $10)
       RETURNING id::text`,
      [
        input.tournamentId,
        input.stageId,
        JSON.stringify(priorStageRule),
        stableRepositoryHash(priorStageRule),
        input.sourcePreviewId,
        input.redApprovalId ?? null,
        input.successorScheduleVersionId,
        input.reasonCode,
        reasonNote,
        input.actorId,
      ],
    );
    currentStageRevisionId = String(baseline.rows[0].id);
    nextStageRevisionNo = 2;
  }
  const newStageRevision = await client.query(
    `INSERT INTO go_v2_stage_rule_revisions (
       tournament_id, stage_id, revision_no, revision_kind,
       effective_from_round_no, rule_snapshot, rule_hash, supersedes_id,
       source_preview_id, red_approval_id, successor_schedule_version_id,
       reason_code, reason_note, actor_id
     ) VALUES ($1, $2, $3, 'future_round', $4, $5::jsonb, $6, $7,
               $8, $9, $10, $11, $12, $13)
     RETURNING id::text, revision_no, created_at`,
    [
      input.tournamentId,
      input.stageId,
      nextStageRevisionNo,
      input.effectiveFromRoundNo,
      JSON.stringify(newRule),
      newRuleHash,
      currentStageRevisionId,
      input.sourcePreviewId,
      input.redApprovalId ?? null,
      input.successorScheduleVersionId,
      input.reasonCode,
      reasonNote,
      input.actorId,
    ],
  );
  const newStageRevisionId = String(newStageRevision.rows[0].id);
  const affected = new Set(suppliedAffectedIds);
  const projectedMatchRevisionIds: string[] = [];

  for (const row of matchResult.rows) {
    const matchId = String(row.id);
    const storedMatchRule = record(row.match_rule);
    const effectivePriorRule = Object.keys(storedMatchRule).length > 0 ? storedMatchRule : priorStageRule;
    let currentMatchRevisionId = row.current_rule_revision_id ? String(row.current_rule_revision_id) : null;
    const matchLedger = await client.query(
      `SELECT id::text, revision_no, rule_hash
       FROM go_v2_match_rule_revisions
       WHERE match_id = $1
       ORDER BY revision_no DESC
       LIMIT 1
       FOR UPDATE`,
      [matchId],
    );
    let nextMatchRevisionNo = matchLedger.rowCount ? Number(matchLedger.rows[0].revision_no) + 1 : 1;
    if (matchLedger.rowCount && currentMatchRevisionId !== String(matchLedger.rows[0].id)) {
      throw new GoV2Error(409, 'MATCH_RULE_POINTER_STALE', 'Match rule pointer does not reference its latest immutable revision', {
        matchId,
      });
    }
    if (
      matchLedger.rowCount
      && String(matchLedger.rows[0].rule_hash) !== stableRepositoryHash(effectivePriorRule)
    ) {
      throw new GoV2Error(409, 'MATCH_RULE_PROJECTION_STALE', 'Match rule projection does not match its immutable revision', {
        matchId,
      });
    }
    if (!currentMatchRevisionId) {
      const baseline = await client.query(
        `INSERT INTO go_v2_match_rule_revisions (
           tournament_id, match_id, stage_rule_revision_id, revision_no,
           revision_kind, rule_snapshot, rule_hash, supersedes_id,
           source_preview_id, successor_schedule_version_id,
           reason_code, reason_note, actor_id
         ) VALUES ($1, $2, $3, 1, 'stage_projection', $4::jsonb, $5, NULL,
                   $6, $7, $8, $9, $10)
         RETURNING id::text`,
        [
          input.tournamentId,
          matchId,
          currentStageRevisionId,
          JSON.stringify(effectivePriorRule),
          stableRepositoryHash(effectivePriorRule),
          input.sourcePreviewId,
          input.successorScheduleVersionId,
          input.reasonCode,
          reasonNote,
          input.actorId,
        ],
      );
      currentMatchRevisionId = String(baseline.rows[0].id);
      nextMatchRevisionNo = 2;
      const baselineProjection = await client.query(
        `UPDATE go_v2_matches
         SET match_rule = $2::jsonb, current_rule_revision_id = $3,
             version = version + 1, updated_at = now()
         WHERE id = $1`,
        [matchId, JSON.stringify(effectivePriorRule), currentMatchRevisionId],
      );
      if (!baselineProjection.rowCount) {
        throw new GoV2Error(409, 'MATCH_RULE_POINTER_STALE', 'Match disappeared while creating its baseline rule revision', {
          matchId,
        });
      }
    }
    if (!affected.has(matchId)) continue;
    const projection = await client.query(
      `INSERT INTO go_v2_match_rule_revisions (
         tournament_id, match_id, stage_rule_revision_id, revision_no,
         revision_kind, rule_snapshot, rule_hash, supersedes_id,
         source_preview_id, successor_schedule_version_id,
         reason_code, reason_note, actor_id
       ) VALUES ($1, $2, $3, $4, 'stage_projection', $5::jsonb, $6, $7,
                 $8, $9, $10, $11, $12)
       RETURNING id::text`,
      [
        input.tournamentId,
        matchId,
        newStageRevisionId,
        nextMatchRevisionNo,
        JSON.stringify(newRule),
        newRuleHash,
        currentMatchRevisionId,
        input.sourcePreviewId,
        input.successorScheduleVersionId,
        input.reasonCode,
        reasonNote,
        input.actorId,
      ],
    );
    const projectionId = String(projection.rows[0].id);
    projectedMatchRevisionIds.push(projectionId);
    const matchUpdate = await client.query(
      `UPDATE go_v2_matches
       SET match_rule = $2::jsonb, current_rule_revision_id = $3,
           version = version + 1, updated_at = now()
       WHERE id = $1 AND current_rule_revision_id = $4`,
      [matchId, JSON.stringify(newRule), projectionId, currentMatchRevisionId],
    );
    if (!matchUpdate.rowCount) {
      throw new GoV2Error(409, 'MATCH_RULE_POINTER_STALE', 'Match rule pointer changed during commit', { matchId });
    }
  }
  const stageUpdate = await client.query(
    `UPDATE go_v2_stages
     SET match_rule = $3::jsonb, current_rule_revision_id = $4,
         version = version + 1, updated_at = now()
     WHERE id = $1 AND tournament_id = $2
       AND current_rule_revision_id IS NOT DISTINCT FROM $5::uuid
     RETURNING version`,
    [input.stageId, input.tournamentId, JSON.stringify(newRule), newStageRevisionId, originalStageRevisionId],
  );
  if (!stageUpdate.rowCount) {
    throw new GoV2Error(409, 'STAGE_RULE_POINTER_STALE', 'Stage rule pointer changed during commit');
  }
  return {
    stageId: input.stageId,
    stageRuleRevisionId: newStageRevisionId,
    stageRuleRevisionNo: Number(newStageRevision.rows[0].revision_no),
    effectiveFromRoundNo: input.effectiveFromRoundNo,
    affectedMatchIds: suppliedAffectedIds,
    matchRuleRevisionIds: projectedMatchRevisionIds,
    ruleHash: newRuleHash,
    successorScheduleVersionId: input.successorScheduleVersionId,
    createdAt: new Date(newStageRevision.rows[0].created_at).toISOString(),
  };
}

async function queryValues(client: PoolClient, sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await client.query(sql, params);
  return result.rows.map((row) => record(row.value));
}

/**
 * Materializes display-only standings from the current result revision of each
 * completed pool match. These rows never replace immutable qualification
 * snapshots. Stored per-team match points are authoritative: malformed or
 * one-sided contribution ledgers fail closed instead of being reconstructed
 * from a public score with an assumed points scheme.
 */
export function assembleLivePoolStandings(source: LiveStandingSourceRows): GoV2LiveStandingTable[] {
  const stagesById = new Map(
    source.stages.map((rawStage) => {
      const stage = record(rawStage);
      return [String(stage.id ?? stage.stageId ?? ''), stage] as const;
    }),
  );
  const matchesByPool = new Map<string, Array<Record<string, unknown>>>();
  for (const rawMatch of source.matches) {
    const match = record(rawMatch);
    const poolId = String(match.poolId ?? '');
    if (!poolId) continue;
    const poolMatches = matchesByPool.get(poolId) ?? [];
    poolMatches.push(match);
    matchesByPool.set(poolId, poolMatches);
  }

  return [...source.pools]
    .sort((left, right) => (
      numeric(record(left).poolNo ?? 0) - numeric(record(right).poolNo ?? 0)
      || stableTextCompare(String(record(left).id ?? ''), String(record(right).id ?? ''))
    ))
    .flatMap((rawPool) => {
      const pool = record(rawPool);
      const poolId = String(pool.id ?? pool.poolId ?? '');
      const stageId = String(pool.stageId ?? '');
      const stage = stagesById.get(stageId);
      const format = String(stage?.stageType ?? '');
      if (!poolId || !stage || !['round_robin_pool', 'modified_pool_4'].includes(format)) return [];
      const rankingRules = record(stage.rankingRulesSnapshot);
      const matchPointsMode = String(rankingRules.internalMatchPointsMode ?? 'total');
      if (matchPointsMode !== 'total' && matchPointsMode !== 'per_match') {
        throw new GoV2Error(409, 'LIVE_STANDING_POINTS_MODE_INVALID', 'The locked stage has an unsupported match-points ranking mode', {
          stageId,
          matchPointsMode,
        });
      }

      const capacity = Number(pool.capacity ?? pool.poolSize);
      if (capacity !== 3 && capacity !== 4) {
        throw new GoV2Error(409, 'LIVE_STANDING_POOL_SIZE_INVALID', 'Live standings require a pool of three or four', {
          poolId,
          capacity,
        });
      }
      if (format === 'modified_pool_4' && capacity !== 4) {
        throw new GoV2Error(409, 'LIVE_STANDING_MODIFIED_POOL_SIZE_INVALID', 'Modified Pool live standings require four entries', {
          poolId,
          capacity,
        });
      }

      const assignments = Array.isArray(pool.assignments) ? pool.assignments.map(record) : [];
      const ledgerByEntry = new Map<string, StandingContribution[]>();
      const entries: PoolStandingEntryInput[] = assignments.map((assignment) => {
        const entryId = String(assignment.entryId ?? '');
        const initialSeed = Number(assignment.sourceSeed ?? assignment.initialSeed);
        const ledger: StandingContribution[] = [];
        ledgerByEntry.set(entryId, ledger);
        return { entryId, initialSeed, ledger };
      });
      if (entries.length !== capacity || ledgerByEntry.size !== capacity) {
        throw new GoV2Error(409, 'LIVE_STANDING_ASSIGNMENTS_INCOMPLETE', 'Pool assignments must fill the locked capacity', {
          poolId,
          expected: capacity,
          actual: entries.length,
        });
      }

      const poolMatches = [...(matchesByPool.get(poolId) ?? [])]
        .sort((left, right) => (
          Number(left.roundNo ?? 0) - Number(right.roundNo ?? 0)
          || Number(left.position ?? 0) - Number(right.position ?? 0)
          || stableTextCompare(String(left.matchId ?? left.id ?? ''), String(right.matchId ?? right.id ?? ''))
        ));
      const expectedMatches = format === 'modified_pool_4'
        ? 4
        : capacity * (capacity - 1) / 2;
      if (poolMatches.length !== expectedMatches) {
        throw new GoV2Error(409, 'LIVE_STANDING_MATCH_TOPOLOGY_INVALID', 'The locked pool has an unexpected number of matches', {
          poolId,
          expectedMatches,
          actualMatches: poolMatches.length,
        });
      }

      let completedMatches = 0;
      const placementRanks = new Map<string, number>();
      for (const match of poolMatches) {
        const matchId = String(match.matchId ?? match.id ?? '');
        const playState = String(match.playState ?? '');
        const resultRevisionId = String(match.resultRevisionId ?? '');
        if (!resultRevisionId) {
          if (playState === 'final' || playState === 'voided') {
            throw new GoV2Error(409, 'LIVE_STANDING_CURRENT_RESULT_MISSING', 'A completed pool match has no current result revision', {
              poolId,
              matchId,
            });
          }
          continue;
        }
        if (playState !== 'final' && playState !== 'voided') {
          throw new GoV2Error(409, 'LIVE_STANDING_RESULT_STATE_INVALID', 'A current pool result revision must belong to a completed match', {
            poolId,
            matchId,
            playState,
          });
        }

        const teamAId = String(match.teamAId ?? '');
        const teamBId = String(match.teamBId ?? '');
        if (
          !matchId
          || !teamAId
          || !teamBId
          || teamAId === teamBId
          || !ledgerByEntry.has(teamAId)
          || !ledgerByEntry.has(teamBId)
        ) {
          throw new GoV2Error(409, 'LIVE_STANDING_PARTICIPANTS_INVALID', 'Completed pool match participants must resolve inside the same pool', {
            poolId,
            matchId,
            teamAId,
            teamBId,
          });
        }

        const resultKind = String(match.resultKind ?? '');
        let contributions = Array.isArray(match.contributions) ? match.contributions.map(record) : [];
        if (!contributions.length && ['mutual_no_show', 'voided'].includes(resultKind)) {
          contributions = [teamAId, teamBId].map((entryId) => ({
            entryId,
            matchesPlayed: 0,
            matchPoints: 0,
            setsFor: 0,
            setsAgainst: 0,
            ralliesFor: 0,
            ralliesAgainst: 0,
            countsForRanking: false,
          }));
        }
        const contributionsByEntry = new Map(
          contributions.map((contribution) => [String(contribution.entryId ?? ''), contribution] as const),
        );
        if (
          contributions.length !== 2
          || contributionsByEntry.size !== 2
          || !contributionsByEntry.has(teamAId)
          || !contributionsByEntry.has(teamBId)
        ) {
          throw new GoV2Error(409, 'LIVE_STANDING_CONTRIBUTIONS_INCOMPLETE', 'A completed pool match needs reciprocal standing contributions', {
            poolId,
            matchId,
            participantIds: [teamAId, teamBId],
            contributionEntryIds: [...contributionsByEntry.keys()].sort(stableTextCompare),
          });
        }

        for (const [teamId, opponentId] of [[teamAId, teamBId], [teamBId, teamAId]] as const) {
          const contribution = contributionsByEntry.get(teamId)!;
          const matchesPlayed = Number(contribution.matchesPlayed);
          if (matchesPlayed !== 0 && matchesPlayed !== 1) {
            throw new GoV2Error(409, 'LIVE_STANDING_MATCH_COUNT_INVALID', 'One match contribution must count as zero or one match', {
              poolId,
              matchId,
              teamId,
              matchesPlayed,
            });
          }
          ledgerByEntry.get(teamId)!.push({
            matchId,
            teamId,
            opponentId,
            matchPoints: exactDatabaseStandingInteger(contribution.matchPoints, 'matchPoints', { poolId, matchId, teamId }),
            setsFor: exactDatabaseStandingInteger(contribution.setsFor, 'setsFor', { poolId, matchId, teamId }),
            setsAgainst: exactDatabaseStandingInteger(contribution.setsAgainst, 'setsAgainst', { poolId, matchId, teamId }),
            pointsFor: exactDatabaseStandingInteger(contribution.ralliesFor, 'ralliesFor', { poolId, matchId, teamId }),
            pointsAgainst: exactDatabaseStandingInteger(contribution.ralliesAgainst, 'ralliesAgainst', { poolId, matchId, teamId }),
            counted: contribution.countsForRanking !== false && matchesPlayed === 1,
          });
        }
        completedMatches += 1;

        if (format === 'modified_pool_4') {
          const metadata = record(match.metadata);
          if (metadata.placementRange != null) {
            const placementRange = Array.isArray(metadata.placementRange)
              ? metadata.placementRange.map(Number)
              : [];
            if (
              placementRange.length !== 2
              || !((placementRange[0] === 1 && placementRange[1] === 2)
                || (placementRange[0] === 3 && placementRange[1] === 4))
            ) {
              throw new GoV2Error(409, 'LIVE_STANDING_PLACEMENT_METADATA_INVALID', 'Modified Pool placement metadata is invalid', {
                poolId,
                matchId,
                placementRange,
              });
            }
            const winnerEntryId = String(match.winnerEntryId ?? '');
            const loserEntryId = String(match.loserEntryId ?? '');
            if (
              ![teamAId, teamBId].includes(winnerEntryId)
              || ![teamAId, teamBId].includes(loserEntryId)
              || winnerEntryId === loserEntryId
            ) {
              throw new GoV2Error(409, 'LIVE_STANDING_PLACEMENT_RESULT_INVALID', 'Modified Pool placement match has no reciprocal winner and loser', {
                poolId,
                matchId,
                winnerEntryId,
                loserEntryId,
              });
            }
            placementRanks.set(winnerEntryId, placementRange[0]);
            placementRanks.set(loserEntryId, placementRange[1]);
          }
        }
      }

      const complete = completedMatches === expectedMatches;
      if (format === 'modified_pool_4') {
        const invalidEntry = entries.find((entry) => (
          entry.ledger.length > 2 || (complete && entry.ledger.length !== 2)
        ));
        if (invalidEntry) {
          throw new GoV2Error(409, 'LIVE_STANDING_MODIFIED_LEDGER_INVALID', 'Each Modified Pool entry may have only an opening and placement match', {
            poolId,
            entryId: invalidEntry.entryId,
            expected: complete ? 2 : '0..2',
            actual: invalidEntry.ledger.length,
          });
        }
      }
      let ranked = format === 'round_robin_pool' && complete
        ? rankPoolStandings({ poolId, poolSize: capacity, entries }, { matchPointsMode })
        : rankLivePoolStandings({ poolId, poolSize: capacity, entries }, { matchPointsMode });
      let rankSource: GoV2LiveStandingTable['rankSource'] = complete ? 'final_ledger' : 'live_ledger';
      if (format === 'modified_pool_4' && complete) {
        if (placementRanks.size !== capacity || new Set(placementRanks.values()).size !== capacity) {
          throw new GoV2Error(409, 'LIVE_STANDING_PLACEMENTS_INCOMPLETE', 'Completed Modified Pool requires final placement metadata for every entry', {
            poolId,
            placementEntryIds: [...placementRanks.keys()].sort(stableTextCompare),
          });
        }
        ranked = ranked
          .map((row) => ({ ...row, poolRank: placementRanks.get(row.entryId)! }))
          .sort((left, right) => left.poolRank - right.poolRank || stableTextCompare(left.entryId, right.entryId));
        rankSource = 'placement_metadata';
      }

      const provisional = !complete;
      const rows = toPoolStandingInputsDto(ranked).map((row) => ({
        entryId: row.entryId,
        poolId: row.poolId,
        poolSize: row.poolSize,
        poolRank: row.poolRank,
        initialSeed: row.initialSeed,
        provisional,
        rankSource,
        metrics: {
          totals: row.totals,
          ratios: row.ratios,
          ledger: row.ledger,
        },
      }));
      return [{
        snapshotId: null,
        stageId,
        poolId,
        format: format as GoV2LiveStandingTable['format'],
        poolSize: capacity,
        profileCode: 'LPV_V2_LIVE',
        provisional,
        complete,
        rankSource,
        completedMatches,
        expectedMatches,
        rows,
      }];
    });
}

function exactDatabaseStandingInteger(
  value: unknown,
  field: string,
  details: Record<string, unknown>,
): bigint {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : value;
  if (
    (typeof normalized === 'bigint' && normalized >= BigInt(0))
    || (typeof normalized === 'number' && Number.isSafeInteger(normalized) && normalized >= 0)
  ) {
    return typeof normalized === 'bigint' ? normalized : BigInt(normalized);
  }
  throw new GoV2Error(409, 'LIVE_STANDING_VALUE_INVALID', `Stored ${field} is not an exact non-negative integer`, {
    ...details,
    field,
    value,
  });
}

export async function readGoV2Structure(
  tournamentId: string,
  options: { requireEnabled?: boolean; requirePublic?: boolean } = {},
): Promise<GoV2StructureResponse> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const base = await client.query(
      `SELECT t.id, t.name, t.date::text AS date, t.time::text AS time, t.location,
              COALESCE(t.go_engine_version, 1) AS go_engine_version,
              COALESCE(s.aggregate_version, 0) AS aggregate_version,
              COALESCE(s.lifecycle_state, 'draft') AS lifecycle_state,
              s.active_stage_snapshot_id,
              s.active_schedule_version_id,
              COALESCE(s.publication_state, 'shadow') AS publication_state,
              COALESCE(s.publication_revision_no, 0) AS publication_revision_no,
              COALESCE((COALESCE(t.settings, '{}'::jsonb)->>'goV2PublicEnabled')::boolean, false)
                AS go_v2_public_enabled,
              COALESCE(s.metadata, '{}'::jsonb) AS metadata
       FROM tournaments t
       LEFT JOIN go_v2_tournament_state s ON s.tournament_id = t.id
       WHERE t.id = $1`,
      [tournamentId],
    );
    if (!base.rowCount) {
      throw new GoV2Error(404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
    }
    if ((options.requireEnabled === true || options.requirePublic === true)
        && Number(base.rows[0].go_engine_version) !== 2) {
      throw new GoV2Error(404, 'GO_V2_NOT_ENABLED', 'Tournament Engine V2 is not enabled for this tournament');
    }
    if (options.requirePublic === true && (
      String(base.rows[0].publication_state) !== 'published'
      || base.rows[0].go_v2_public_enabled !== true
    )) {
      throw new GoV2Error(404, 'GO_V2_NOT_PUBLISHED', 'Tournament Engine V2 is not published');
    }
    const state = mapState({ ...base.rows[0], tournament_id: base.rows[0].id });

    const entries = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', e.id, 'entryNo', e.entry_no, 'displayName', e.display_name,
         'registrationState', e.registration_state, 'ratingSnapshotValue', e.rating_snapshot_value,
         'initialSeed', e.initial_seed, 'confirmedAt', e.confirmed_at,
         'attendanceState', e.attendance_state,
         'attendanceChangedAt', e.attendance_changed_at,
         'attendanceVersion', e.attendance_version,
         'currentRosterRevisionId', e.current_roster_revision_id, 'metadata', e.metadata,
         'members', COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'memberOrder', member.member_order, 'playerId', member.player_id,
             'displayName', member.display_name, 'ratingValue', member.rating_value
           ) ORDER BY member.member_order)
           FROM go_v2_roster_revision_members member
           WHERE member.roster_revision_id = e.current_roster_revision_id
         ), '[]'::jsonb)
       ) AS value
       FROM go_v2_entries e WHERE e.tournament_id = $1 ORDER BY e.entry_no`, [tournamentId]);

    const stages = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', s.id, 'stageKey', s.stage_key, 'stageOrder', s.stage_order,
         'stageType', s.stage_type, 'tier', s.tier, 'status', s.status,
          'lockSnapshotId', s.lock_snapshot_id, 'matchRule', s.match_rule,
          'currentRuleRevisionId', s.current_rule_revision_id,
         'configuration', s.configuration, 'version', s.version,
         'rankingRulesSnapshot', COALESCE(snapshot.ranking_rules_snapshot, '{}'::jsonb)
       ) AS value
       FROM go_v2_stages s
       LEFT JOIN go_v2_stage_lock_snapshots snapshot ON snapshot.id = s.lock_snapshot_id
       WHERE s.tournament_id = $1 ORDER BY s.stage_order, s.tier NULLS FIRST`, [tournamentId]);

    const stageEdges = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', edge.id,
         'fromStageId', edge.from_stage_id,
         'toStageId', edge.to_stage_id,
         'routingKind', edge.routing_kind,
         'routingConfig', edge.routing_config,
         'createdAt', edge.created_at
       ) AS value
       FROM go_v2_stage_edges edge
       WHERE edge.tournament_id = $1
       ORDER BY edge.created_at, edge.id`, [tournamentId]);

    const pools = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', p.id, 'stageId', p.stage_id, 'poolNo', p.pool_no,
         'label', p.label, 'capacity', p.capacity, 'status', p.status,
         'assignments', COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'entryId', a.entry_id, 'slotNo', a.slot_no, 'sourceSeed', a.source_seed,
             'assignedBy', a.assigned_by, 'assignmentReason', a.assignment_reason
           ) ORDER BY a.slot_no)
           FROM go_v2_pool_assignments a WHERE a.pool_id = p.id
         ), '[]'::jsonb)
       ) AS value
       FROM go_v2_pools p
       JOIN go_v2_stages s ON s.id = p.stage_id
       WHERE s.tournament_id = $1 ORDER BY s.stage_order, p.pool_no`, [tournamentId]);

    const matches = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', m.id, 'stageId', m.stage_id, 'poolId', m.pool_id,
         'matchKey', m.match_key, 'roundNo', m.round_no, 'position', m.position,
         'bracketSide', m.bracket_side, 'scheduleState', m.schedule_state,
         'playState', m.play_state, 'isConditional', m.is_conditional,
         'conditionKind', m.condition_kind, 'conditionState', m.condition_state,
          'winnerEntryId', m.winner_entry_id, 'loserEntryId', m.loser_entry_id,
           'currentResultRevisionNo', m.current_result_revision_no, 'version', m.version,
           'matchRule', COALESCE(NULLIF(m.match_rule, '{}'::jsonb), stage_rule.match_rule),
           'currentRuleRevisionId', m.current_rule_revision_id,
          'commandVersion', COALESCE(live.command_version, 0),
          'liveScore', COALESCE(live.live_score, '{}'::jsonb),
          'finishReviewRequired', COALESCE(live.finish_requested, false),
          'activeJudgeDeviceId', live.active_device_id,
         'result', CASE WHEN latest_result.id IS NULL THEN NULL ELSE jsonb_build_object(
           'revisionNo', latest_result.revision_no,
            'resultKind', latest_result.result_kind,
            'resultSource', latest_result.result_source,
           'incidentCause', latest_result.incident_cause,
           'actualScore', latest_result.actual_score,
           'declaredResult', latest_result.declared_result,
           'winnerEntryId', latest_result.winner_entry_id,
           'loserEntryId', latest_result.loser_entry_id,
           'advancementEffect', latest_result.advancement_effect,
           'ratingEligibility', latest_result.rating_eligibility,
           'createdAt', latest_result.created_at
         ) END,
         'slotSources', COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'slotNo', ss.slot_no, 'sourceType', ss.source_type,
             'sourceEntryId', ss.source_entry_id, 'sourcePoolId', ss.source_pool_id,
             'sourceMatchId', ss.source_match_id, 'sourceRank', ss.source_rank,
             'resolvedEntryId', ss.resolved_entry_id
           ) ORDER BY ss.slot_no)
           FROM go_v2_match_slot_sources ss WHERE ss.match_id = m.id
         ), '[]'::jsonb),
         'dependencyMatchIds', COALESCE((
           SELECT jsonb_agg(dependency.depends_on_match_id ORDER BY dependency.ordinal)
           FROM go_v2_match_dependencies dependency
           WHERE dependency.match_id = m.id
         ), '[]'::jsonb)
       ) AS value
         FROM go_v2_matches m
         JOIN go_v2_stages stage_rule ON stage_rule.id = m.stage_id
         LEFT JOIN go_v2_live_match_state live ON live.match_id = m.id
        LEFT JOIN LATERAL (
         SELECT revision.id, revision.revision_no, revision.result_kind,
                revision.incident_cause, revision.actual_score, revision.declared_result,
                revision.winner_entry_id, revision.loser_entry_id,
                 revision.advancement_effect, revision.rating_eligibility,
                 revision.result_source, revision.created_at
         FROM go_v2_match_result_revisions revision
         WHERE revision.match_id = m.id
           AND revision.revision_no = m.current_result_revision_no
         LIMIT 1
       ) latest_result ON true
       WHERE m.tournament_id = $1
       ORDER BY m.created_at, m.round_no, m.position`, [tournamentId]);

    const liveStandingMatchesResult = await client.query(
      `SELECT m.id::text AS match_id, m.stage_id::text AS stage_id,
              m.pool_id::text AS pool_id, m.round_no, m.position,
              m.play_state, m.metadata,
              revision.id::text AS result_revision_id, revision.result_kind,
              m.winner_entry_id::text AS winner_entry_id,
              m.loser_entry_id::text AS loser_entry_id,
              max(COALESCE(source.resolved_entry_id, source.source_entry_id)::text)
                FILTER (WHERE source.slot_no = 1) AS team_a_id,
              max(COALESCE(source.resolved_entry_id, source.source_entry_id)::text)
                FILTER (WHERE source.slot_no = 2) AS team_b_id,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'entryId', contribution.entry_id,
                'matchesPlayed', contribution.matches_played,
                'matchPoints', contribution.match_points,
                'setsFor', contribution.sets_for,
                'setsAgainst', contribution.sets_against,
                'ralliesFor', contribution.rallies_for,
                'ralliesAgainst', contribution.rallies_against,
                'countsForRanking', contribution.counts_for_ranking
              )) FILTER (WHERE contribution.entry_id IS NOT NULL), '[]'::jsonb) AS contributions
       FROM go_v2_matches m
       JOIN go_v2_stages stage ON stage.id = m.stage_id
       LEFT JOIN go_v2_match_result_revisions revision
         ON revision.match_id = m.id
        AND revision.revision_no = m.current_result_revision_no
       LEFT JOIN go_v2_match_standing_contributions contribution
         ON contribution.result_revision_id = revision.id
       LEFT JOIN go_v2_match_slot_sources source ON source.match_id = m.id
       WHERE m.tournament_id = $1
         AND m.pool_id IS NOT NULL
         AND stage.stage_type IN ('round_robin_pool', 'modified_pool_4')
       GROUP BY m.id, revision.id
       ORDER BY m.pool_id, m.round_no, m.position`,
      [tournamentId],
    );
    const liveStandings = assembleLivePoolStandings({
      stages,
      pools,
      matches: liveStandingMatchesResult.rows.map((row) => ({
        matchId: row.match_id,
        stageId: row.stage_id,
        poolId: row.pool_id,
        roundNo: row.round_no,
        position: row.position,
        playState: row.play_state,
        metadata: row.metadata,
        resultRevisionId: row.result_revision_id,
        resultKind: row.result_kind,
        winnerEntryId: row.winner_entry_id,
        loserEntryId: row.loser_entry_id,
        teamAId: row.team_a_id,
        teamBId: row.team_b_id,
        contributions: Array.isArray(row.contributions) ? row.contributions : [],
      })),
    });

    const attendancePolicyResult = await client.query(
      `SELECT check_in_open_minutes_before, check_in_deadline_minutes_before,
              grace_period_minutes, technical_result_requires_director
       FROM go_v2_attendance_policies WHERE tournament_id = $1`,
      [tournamentId],
    );
    const attendancePolicy = attendancePolicyResult.rowCount
      ? {
          checkInOpenMinutesBefore: Number(attendancePolicyResult.rows[0].check_in_open_minutes_before),
          checkInDeadlineMinutesBefore: Number(attendancePolicyResult.rows[0].check_in_deadline_minutes_before),
          gracePeriodMinutes: Number(attendancePolicyResult.rows[0].grace_period_minutes),
          technicalResultRequiresDirector: true as const,
        }
      : {
          checkInOpenMinutesBefore: 60,
          checkInDeadlineMinutesBefore: 15,
          gracePeriodMinutes: 5,
          technicalResultRequiresDirector: true as const,
        };

    const attendanceEvents = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', event.id, 'entryId', event.entry_id,
         'attendanceVersion', event.attendance_version,
         'fromState', event.from_state, 'toState', event.to_state,
         'effectiveAt', event.effective_at, 'reasonCode', event.reason_code,
         'reasonNote', event.reason_note, 'actorId', event.actor_id,
         'deviceId', event.device_id, 'payload', event.payload,
         'createdAt', event.created_at
       ) AS value
       FROM go_v2_attendance_events event
       WHERE event.tournament_id = $1
       ORDER BY event.created_at DESC LIMIT 200`, [tournamentId]);
    const attendanceReinstatements = attendanceEvents.filter((event) => (
      String(record(event.payload).operation ?? '') === 'attendance.reinstate.commit'
      && String(event.reasonCode ?? '') === 'attendance_reinstated'
      && String(event.fromState ?? '') === 'no_show'
    )).map((event) => ({
      ...event,
      decision: record(event.payload).decision ?? null,
      priorScheduleVersionId: record(event.payload).priorScheduleVersionId ?? null,
      successorScheduleVersionId: record(event.payload).successorScheduleVersionId ?? null,
      scheduleHash: record(event.payload).scheduleHash ?? null,
      mutationBatchId: record(event.payload).mutationBatchId ?? null,
      replayMatchIds: record(event.payload).replayMatchIds ?? [],
      deferredAwardedMatchIds: record(event.payload).deferredAwardedMatchIds ?? [],
      resultRevisionIds: record(event.payload).resultRevisionIds ?? [],
      qualificationSnapshotLineage: record(event.payload).qualificationSnapshotLineage ?? [],
    }));

    const courts = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', court.id, 'courtNo', court.court_no, 'label', court.label,
         'venueId', court.venue_id, 'venueKey', court.venue_key,
         'affinity', court.affinity, 'isActive', court.is_active
       ) AS value
       FROM go_v2_courts court
       WHERE EXISTS (
         SELECT 1
         FROM go_v2_schedule_session_courts session_court
         JOIN go_v2_schedule_session_tournaments member ON member.session_id = session_court.session_id
         WHERE session_court.court_id = court.id AND member.tournament_id = $1
       )
       ORDER BY court.court_no`, [tournamentId]);

    const activeDisruptions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', disruption.id, 'scheduleSessionId', disruption.schedule_session_id,
         'scopeKind', disruption.scope_kind, 'courtId', disruption.court_id,
         'matchId', disruption.match_id, 'disruptionKind', disruption.disruption_kind,
         'status', disruption.status, 'startsAt', disruption.starts_at,
         'expectedEndAt', disruption.expected_end_at, 'impact', disruption.impact_snapshot,
         'createdAt', disruption.created_at
       ) AS value
       FROM go_v2_schedule_disruptions disruption
       WHERE disruption.status = 'active'
         AND (
           disruption.tournament_id = $1
           OR disruption.schedule_session_id IN (
             SELECT member.session_id
             FROM go_v2_schedule_session_tournaments member
             WHERE member.tournament_id = $1
           )
         )
       ORDER BY disruption.starts_at DESC`, [tournamentId]);

    const pauseResolutions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', resolution.id, 'matchId', resolution.match_id,
         'disruptionId', resolution.disruption_id, 'decision', resolution.decision,
         'scheduleSessionId', resolution.schedule_session_id,
         'sourceCourtId', resolution.source_court_id,
         'targetCourtId', resolution.target_court_id,
         'priorScheduleVersionId', resolution.prior_schedule_version_id,
         'successorScheduleVersionId', resolution.successor_schedule_version_id,
         'priorCommandVersion', resolution.prior_command_version,
         'resultingCommandVersion', resolution.resulting_command_version,
         'reasonCode', resolution.reason_code, 'reasonNote', resolution.reason_note,
         'actorId', resolution.actor_id, 'createdAt', resolution.created_at
       ) AS value
       FROM go_v2_match_pause_resolutions resolution
       WHERE resolution.tournament_id = $1
       ORDER BY resolution.created_at DESC, resolution.id DESC
       LIMIT 200`, [tournamentId]);

    const disruptionResolutions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', resolution.id, 'disruptionId', resolution.disruption_id,
         'scheduleSessionId', resolution.schedule_session_id,
         'resolution', resolution.resolution, 'priorStatus', resolution.prior_status,
         'resultingStatus', resolution.resulting_status,
         'affectedSnapshot', resolution.affected_snapshot,
         'reasonCode', resolution.reason_code, 'reasonNote', resolution.reason_note,
         'actorId', resolution.actor_id, 'commandId', resolution.command_id,
         'resolvedAt', resolution.resolved_at
       ) AS value
       FROM go_v2_disruption_resolutions resolution
       JOIN go_v2_schedule_session_tournaments member
         ON member.session_id = resolution.schedule_session_id
       WHERE member.tournament_id = $1
       ORDER BY resolution.resolved_at DESC, resolution.id DESC
       LIMIT 200`, [tournamentId]);

    const deferOverrides = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', override.id, 'matchId', override.match_id,
         'scheduleSessionId', override.schedule_session_id,
         'action', override.action, 'deferMode', override.defer_mode,
         'notBefore', override.not_before,
         'pauseResolutionId', override.pause_resolution_id,
         'sourcePreviewId', override.source_preview_id,
         'priorScheduleVersionId', override.prior_schedule_version_id,
         'successorScheduleVersionId', override.successor_schedule_version_id,
         'supersedesId', override.supersedes_id,
         'supersededById', successor.id,
         'isActive', (
           override.action = 'defer'
           AND successor.id IS NULL
           AND override.id = (
             SELECT latest.id
             FROM go_v2_schedule_defer_overrides latest
             WHERE latest.match_id = override.match_id
             ORDER BY latest.created_at DESC, latest.id DESC
             LIMIT 1
           )
         ),
         'isGeneric', override.pause_resolution_id IS NULL,
         'canRelease', (
           override.action = 'defer'
           AND override.pause_resolution_id IS NULL
           AND successor.id IS NULL
           AND override.id = (
             SELECT latest.id
             FROM go_v2_schedule_defer_overrides latest
             WHERE latest.match_id = override.match_id
             ORDER BY latest.created_at DESC, latest.id DESC
             LIMIT 1
           )
           AND match.play_state IN ('pending', 'ready')
         ),
         'matchPlayState', match.play_state,
         'reasonCode', override.reason_code, 'reasonNote', override.reason_note,
         'actorId', override.actor_id, 'commandId', override.command_id,
         'createdAt', override.created_at
       ) AS value
       FROM go_v2_schedule_defer_overrides override
       JOIN go_v2_matches match ON match.id = override.match_id
       LEFT JOIN LATERAL (
         SELECT child.id
         FROM go_v2_schedule_defer_overrides child
         WHERE child.supersedes_id = override.id
         ORDER BY child.created_at DESC, child.id DESC
         LIMIT 1
       ) successor ON true
       WHERE override.tournament_id = $1
       ORDER BY override.created_at DESC, override.id DESC
       LIMIT 200`, [tournamentId]);

    const reservePromotions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', promotion.id,
         'reserveEntryId', promotion.reserve_entry_id,
         'targetEntryId', promotion.target_entry_id,
         'promotionMode', promotion.promotion_mode,
         'reserveRosterRevisionId', promotion.reserve_roster_revision_id,
         'ratingSnapshotId', promotion.rating_snapshot_id,
         'sourcePreviewId', promotion.source_preview_id,
         'redApprovalId', promotion.red_approval_id,
         'priorScheduleVersionId', promotion.prior_schedule_version_id,
         'successorScheduleVersionId', promotion.successor_schedule_version_id,
         'scheduleHash', promotion.schedule_hash,
         'expectedAggregateVersion', promotion.expected_aggregate_version,
         'resultingAggregateVersion', promotion.resulting_aggregate_version,
         'sourceHash', promotion.source_hash,
         'priorEntriesSnapshot', promotion.prior_entries_snapshot,
         'resultingEntriesSnapshot', promotion.resulting_entries_snapshot,
         'slotDiff', promotion.slot_diff,
         'scheduleDiff', promotion.schedule_diff,
         'reasonCode', promotion.reason_code,
         'reasonNote', promotion.reason_note,
         'actorId', promotion.actor_id,
         'commandId', promotion.command_id,
         'createdAt', promotion.created_at
       ) AS value
       FROM go_v2_reserve_promotion_revisions promotion
       WHERE promotion.tournament_id = $1
       ORDER BY promotion.created_at DESC, promotion.id DESC
       LIMIT 200`, [tournamentId]);

    const courtSegments = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', segment.id, 'matchId', segment.match_id,
         'scheduleSessionId', segment.schedule_session_id,
         'segmentNo', segment.segment_no,
         'scheduleVersionId', segment.schedule_version_id,
         'scheduleAssignmentId', segment.schedule_assignment_id,
         'courtId', segment.court_id,
         'pauseResolutionId', segment.pause_resolution_id,
         'authorizedAt', segment.authorized_at,
         'startedAt', segment.started_at, 'endedAt', segment.ended_at,
         'openingScore', segment.opening_score, 'closingScore', segment.closing_score,
         'lineupSnapshot', segment.lineup_snapshot,
         'createdBy', segment.created_by, 'createdAt', segment.created_at
       ) AS value
       FROM go_v2_match_court_segments segment
       WHERE segment.tournament_id = $1
       ORDER BY segment.match_id, segment.segment_no
       LIMIT 1000`, [tournamentId]);

    const activeCourtGrants = await queryValues(client,
       `SELECT jsonb_build_object(
         'grantId', grant.id, 'courtId', grant.court_id,
         'deviceId', grant.device_id, 'prefix', grant.token_prefix,
         'tokenPrefix', grant.token_prefix,
         'issuedAt', grant.issued_at, 'expiresAt', grant.expires_at,
         'lastUsedAt', grant.last_used_at, 'revokedAt', grant.revoked_at
       ) AS value
       FROM go_v2_court_grants grant
       JOIN go_v2_schedule_session_tournaments session_member
         ON session_member.session_id = grant.schedule_session_id
       WHERE session_member.tournament_id = $1
         AND grant.revoked_at IS NULL
         AND grant.expires_at > now()
       ORDER BY grant.issued_at DESC`, [tournamentId]);

    const ratingProjections = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', projection.id, 'standingsHash', projection.standings_hash,
         'mode', projection.projection_mode, 'status', projection.status,
         'sourceSnapshotIds', projection.source_snapshot_ids,
         'sourceFinalPlacementSnapshotId', projection.source_final_placement_snapshot_id,
         'createdBy', projection.created_by, 'createdAt', projection.created_at,
         'appliedAt', projection.applied_at
       ) AS value
       FROM go_v2_rating_projection_runs projection
       WHERE projection.tournament_id = $1
       ORDER BY projection.created_at DESC`, [tournamentId]);

    const scheduleSessions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', ss.id, 'sessionKey', ss.session_key, 'label', ss.label,
         'timezone', ss.timezone, 'windowStart', ss.window_start, 'windowEnd', ss.window_end,
         'freezeHorizonMinutes', ss.freeze_horizon_minutes,
         'timeQuantumMinutes', ss.time_quantum_minutes, 'refereeMode', ss.referee_mode,
         'configuration', ss.configuration,
         'tournamentIds', COALESCE((
           SELECT jsonb_agg(member.tournament_id ORDER BY member.priority DESC, member.tournament_id)
           FROM go_v2_schedule_session_tournaments member
           WHERE member.session_id = ss.id
         ), '[]'::jsonb)
       ) AS value
       FROM go_v2_schedule_sessions ss
       JOIN go_v2_schedule_session_tournaments st ON st.session_id = ss.id
       WHERE st.tournament_id = $1 ORDER BY ss.window_start`, [tournamentId]);

    const courtPolicyExceptions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', revision.id,
         'tournamentId', revision.tournament_id,
         'scheduleSessionId', revision.schedule_session_id,
         'stageId', revision.stage_id,
         'tier', revision.tier,
         'decision', revision.decision,
         'allowedCourtIds', revision.allowed_court_ids,
         'effectiveFrom', revision.effective_from,
         'effectiveUntil', revision.effective_until,
         'sourcePreviewId', revision.source_preview_id,
         'successorScheduleVersionId', revision.successor_schedule_version_id,
         'supersedesId', revision.supersedes_id,
         'reasonCode', revision.reason_code,
         'reasonNote', revision.reason_note,
         'actorId', revision.actor_id,
         'createdAt', revision.created_at
       ) AS value
       FROM go_v2_court_policy_exception_revisions revision
       WHERE revision.tournament_id = $1
       ORDER BY revision.created_at DESC, revision.id DESC
       LIMIT 200`, [tournamentId]);

    const scheduleVersions = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', sv.id, 'sessionId', sv.session_id, 'versionNo', sv.version_no,
         'status', sv.status, 'solverStatus', sv.solver_status,
         'solverVersion', sv.solver_version, 'inputHash', sv.input_hash,
         'scheduleHash', sv.schedule_hash, 'elapsedMs', sv.elapsed_ms,
         'expandedStates', sv.expanded_states, 'repairPasses', sv.repair_passes,
         'objective', sv.objective, 'conflicts', sv.conflicts,
         'basedOnVersionId', sv.based_on_version_id, 'createdAt', sv.created_at,
         'publishedAt', sv.published_at,
         'assignments', COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id', sa.id, 'matchId', sa.match_id, 'courtId', sa.court_id,
             'courtNo', c.court_no, 'courtLabel', c.label,
              'plannedStart', sa.planned_start, 'plannedEnd', sa.planned_end,
              'predictedStart', sa.predicted_start, 'predictedEnd', sa.predicted_end,
              'actualStart', sa.actual_start, 'actualEnd', sa.actual_end,
              'liveEta', sa.live_eta, 'isLocked', sa.is_locked,
              'lockReason', sa.lock_reason, 'isConditional', sa.is_conditional,
              'refereeDuty', (
                SELECT jsonb_build_object(
                  'id', duty.id, 'dutyKind', duty.duty_kind,
                  'refereeEntryId', duty.referee_entry_id,
                  'sourceMatchId', duty.source_match_id,
                  'candidateEntryIds', duty.candidate_entry_ids,
                  'status', duty.status, 'metadata', duty.metadata
                )
                FROM go_v2_referee_duties duty
                WHERE duty.schedule_assignment_id = sa.id
                ORDER BY duty.created_at DESC
                LIMIT 1
              )
            ) ORDER BY sa.planned_start, c.court_no)
           FROM go_v2_schedule_assignments sa
           JOIN go_v2_courts c ON c.id = sa.court_id
           JOIN go_v2_matches scheduled_match ON scheduled_match.id = sa.match_id
           WHERE sa.schedule_version_id = sv.id AND scheduled_match.tournament_id = $1
         ), '[]'::jsonb)
       ) AS value
       FROM go_v2_schedule_versions sv
       JOIN go_v2_schedule_session_tournaments st ON st.session_id = sv.session_id
       WHERE st.tournament_id = $1 ORDER BY sv.created_at DESC`, [tournamentId]);

    const standings = await queryValues(client,
      `SELECT jsonb_build_object(
         'snapshotId', ss.id, 'stageId', ss.stage_id,
         'aggregateVersion', ss.aggregate_version, 'profileCode', ss.profile_code,
         'inputHash', ss.input_hash, 'createdAt', ss.created_at,
         'rows', COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'poolId', sr.pool_id, 'entryId', sr.entry_id, 'poolRank', sr.pool_rank,
             'comparisonRank', sr.comparison_rank, 'metrics', sr.metrics,
             'tieBreakTrace', sr.tie_break_trace
           ) ORDER BY sr.pool_rank NULLS LAST, sr.comparison_rank NULLS LAST)
           FROM go_v2_standing_snapshot_rows sr WHERE sr.snapshot_id = ss.id
         ), '[]'::jsonb)
       ) AS value
       FROM go_v2_standing_snapshots ss
       JOIN go_v2_stages s ON s.id = ss.stage_id
       WHERE s.tournament_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM go_v2_standing_snapshots newer
           WHERE newer.stage_id = ss.stage_id AND newer.aggregate_version > ss.aggregate_version
         )
       ORDER BY s.stage_order`, [tournamentId]);

    const finalPlacements = state.lifecycleState === 'finished'
      ? await loadLatestGoV2FinalPlacementSnapshot(client, tournamentId)
      : null;

    const mutations = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', b.id, 'triggerMatchId', b.trigger_match_id, 'parentBatchId', b.parent_batch_id,
         'mutationKind', b.mutation_kind, 'risk', b.risk, 'state', b.state,
         'reasonCode', b.reason_code, 'reasonNote', b.reason_note,
         'authorId', b.author_id, 'expectedVersion', b.expected_version,
         'committedVersion', b.committed_version, 'diff', b.diff_payload,
         'createdAt', b.created_at, 'committedAt', b.committed_at
       ) AS value
       FROM go_v2_cascade_mutation_batches b
       WHERE b.tournament_id = $1 ORDER BY b.created_at DESC LIMIT 100`, [tournamentId]);

    const audit = await queryValues(client,
      `SELECT jsonb_build_object(
         'id', a.id, 'aggregateVersion', a.aggregate_version, 'eventType', a.event_type,
         'entityType', a.entity_type, 'entityId', a.entity_id, 'reasonCode', a.reason_code,
         'reasonNote', a.reason_note, 'actorId', a.actor_id,
         'idempotencyKey', a.idempotency_key, 'diff', a.diff_payload, 'createdAt', a.created_at
       ) AS value
       FROM go_v2_audit_events a WHERE a.tournament_id = $1
       ORDER BY a.aggregate_version DESC LIMIT 200`, [tournamentId]);

    await client.query('COMMIT');
    return {
      tournament: {
        id: tournamentId,
        name: String(base.rows[0].name ?? ''),
        date: base.rows[0].date ? String(base.rows[0].date) : null,
        time: base.rows[0].time ? String(base.rows[0].time) : null,
        location: base.rows[0].location ? String(base.rows[0].location) : null,
        engineVersion: 2,
        aggregateVersion: state.aggregateVersion,
        lifecycleState: state.lifecycleState,
        activeStageSnapshotId: state.activeStageSnapshotId,
        activeScheduleVersionId: state.activeScheduleVersionId,
        publicationState: String(base.rows[0].publication_state ?? 'shadow') as 'shadow' | 'published' | 'unpublished',
        publicationRevisionNo: Number(base.rows[0].publication_revision_no ?? 0),
        publicKillSwitchEnabled: base.rows[0].go_v2_public_enabled === true,
        metadata: state.metadata,
      },
      entries,
      attendancePolicy,
      attendanceEvents,
      attendanceReinstatements,
      stages,
      stageEdges,
      pools,
      matches,
      standings,
      liveStandings,
      finalPlacements,
      courts,
      scheduleSessions,
      scheduleVersions,
      courtPolicyExceptions,
      activeDisruptions,
      pauseResolutions,
      disruptionResolutions,
      deferOverrides,
      reservePromotions,
      courtSegments,
      activeCourtGrants,
      ratingProjections,
      mutations,
      audit,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
