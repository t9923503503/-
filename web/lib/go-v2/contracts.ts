import type {
  ExactRatioDto,
  ExactStatsDto,
  MatchRule,
  StandingContributionDto,
} from './core';
import type { GoV2RatingPolicySnapshot } from './final-placements';

export type GoV2Risk = 'green' | 'amber' | 'red';

export type GoV2LifecycleState =
  | 'draft'
  | 'registration_locked'
  | 'draw_preview'
  | 'draw_locked'
  | 'stages_ready'
  | 'bracket_preview'
  | 'bracket_locked'
  | 'schedule_draft'
  | 'schedule_published'
  | 'live'
  | 'finished'
  | 'cancelled';

export type GoV2OperationKind =
  | 'registration.lock'
  | 'draw.preview'
  | 'draw.commit'
  | 'draw.unlock.preview'
  | 'draw.unlock.commit'
  | 'stages.materialize'
  | 'bracket.preview'
  | 'bracket.lock'
  | 'schedule.generate.preview'
  | 'schedule.generate.commit'
  | 'schedule.replan.preview'
  | 'schedule.replan.commit'
  | 'schedule.policy.preview'
  | 'schedule.policy.commit'
  | 'schedule.defer.preview'
  | 'schedule.defer.commit'
  | 'schedule.defer.release.preview'
  | 'schedule.defer.release.commit'
  | 'stage.rules.preview'
  | 'stage.rules.commit'
  | 'publication.preview'
  | 'publication.commit'
  | 'match.finish.accept'
  | 'match.finish.reject'
  | 'match.paper_import.preview'
  | 'match.paper_import.commit'
  | 'match.result.revise'
  | 'roster.replacement.preview'
  | 'roster.replacement.commit'
  | 'reserve.promotion.preview'
  | 'reserve.promotion.commit'
  | 'entry.withdrawal.preview'
  | 'entry.withdrawal.commit'
  | 'attendance.preview'
  | 'attendance.commit'
  | 'attendance.reinstate.preview'
  | 'attendance.reinstate.commit'
  | 'disruption.preview'
  | 'disruption.commit'
  | 'disruption.resolve.preview'
  | 'disruption.resolve.commit'
  | 'match.pause_resolution.preview'
  | 'match.pause_resolution.commit'
  | 'court_grant.issue'
  | 'court_grant.rotate'
  | 'court_grant.revoke'
  | 'judge.match.start'
  | 'rating.shadow.commit'
  | 'incident.preview'
  | 'incident.commit'
  | 'mutation.undo.preview'
  | 'mutation.undo.commit';

export type GoV2AttendanceState =
  | 'unknown'
  | 'confirmed'
  | 'checked_in'
  | 'late_hold'
  | 'no_show'
  | 'withdrawn'
  | 'disqualified';

export type GoV2DisruptionKind =
  | 'rain_hold'
  | 'lightning_hold'
  | 'court_damage'
  | 'medical_delay'
  | 'security_pause'
  | 'court_close'
  | 'court_reopen'
  | 'global_pause';

export type GoV2DisruptionScopeKind = 'match' | 'court' | 'session';

export type GoV2PauseResolutionDecision = 'defer' | 'resume_same_court' | 'transfer';

export type GoV2ResultSource =
  | 'judge_review'
  | 'paper_import'
  | 'incident'
  | 'withdrawal'
  | 'cascade'
  | 'undo'
  | 'legacy_admin';

export type GoV2JudgeCommandKind =
  | 'match.start'
  | 'match.pause'
  | 'match.resume'
  | 'score.replace'
  | 'match.finish.request';

export interface GoV2ActorContext {
  id: string;
  role: 'admin' | 'operator' | 'viewer' | 'judge';
}

/** Attached only after the bearer token has been verified server-side. */
export interface GoV2CourtGrantContext {
  grantId: string;
  tournamentId: string;
  scheduleSessionId: string;
  courtId: string;
  deviceId: string;
  expiresAt: string;
}

export interface GoV2CommandEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  expectedVersion: number;
  commandId: string;
  /** Required digest, checked against the server's canonical request digest. */
  requestHash: string;
  deviceId: string;
  /** @deprecated Internal compatibility alias. New clients send commandId. */
  idempotencyKey: string;
  reasonCode: string;
  reasonNote?: string;
  previewId?: string;
  inputHash?: string;
  confirmRed?: boolean;
  redApprovalId?: string;
  payload: TPayload;
}

export interface GoV2AuthorizedCommandEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> extends GoV2CommandEnvelope<TPayload> {
  requestHash: string;
  actor: GoV2ActorContext;
  courtGrant: GoV2CourtGrantContext | null;
}

export interface GoV2PreviewResponse<TResult = Record<string, unknown>> {
  previewId: string;
  operation: GoV2OperationKind;
  aggregateVersion: number;
  inputHash: string;
  risk: GoV2Risk;
  expiresAt: string;
  replayed: boolean;
  commandId?: string;
  requestHash?: string;
  deviceId?: string;
  result: TResult;
}

export interface GoV2CommitResponse<TResult = Record<string, unknown>> {
  operationId: string;
  operation: GoV2OperationKind;
  aggregateVersion: number;
  previewId?: string;
  replayed: boolean;
  commandId?: string;
  requestHash?: string;
  deviceId?: string;
  result: TResult;
}

export interface GoV2AttendancePolicyDto {
  checkInOpenMinutesBefore: number;
  checkInDeadlineMinutesBefore: number;
  gracePeriodMinutes: number;
  technicalResultRequiresDirector: true;
}

export interface GoV2StageRuleChangeDto {
  stageId: string;
  effectiveFromRoundNo: number;
  matchRule: MatchRule;
  affectedMatchIds: string[];
  sourceHash: string;
  activeScheduleVersionId: string;
}

export interface GoV2AttendanceMutationDto {
  entryId: string;
  fromState: GoV2AttendanceState;
  toState: GoV2AttendanceState;
  attendanceVersion: number;
  effectiveAt: string;
  policy: GoV2AttendancePolicyDto;
  checkInOpensAt: string | null;
  checkInDeadlineAt: string | null;
  /** Stable short alias used by admin clients. */
  deadlineAt: string | null;
  isLateAtEffectiveTime: boolean;
  createsTechnicalResult: false;
  nextAction: 'none' | 'incident_preview_required';
}

export type GoV2AttendanceReinstatementDecision =
  | 'keep_awarded_result'
  | 'overturn_and_cascade';

export interface GoV2AttendanceReinstatementDto {
  entryId: string;
  decision: GoV2AttendanceReinstatementDecision;
  toState: 'checked_in' | 'late_hold';
  attendanceVersion: number;
  effectiveAt: string;
  awardedResults: Array<{
    matchId: string;
    matchKey: string;
    stageId: string;
    resultRevisionId: string;
    resultRevisionNo: number;
    resultKind: 'walkover' | 'forfeit' | 'mutual_no_show' | 'admin_award';
    incidentCause: string | null;
    winnerEntryId: string | null;
    loserEntryId: string | null;
  }>;
  affectedMatchIds: string[];
  replayMatchIds: string[];
  deferredAwardedMatchIds: string[];
  excludedSuccessorMatchIds: string[];
  priorScheduleVersionId: string;
  successorScheduleHash: string;
}

export interface GoV2DisruptionPreviewDto {
  disruptionKind: GoV2DisruptionKind;
  scopeKind: GoV2DisruptionScopeKind;
  courtId: string | null;
  matchId: string | null;
  startsAt: string;
  expectedEndAt: string | null;
  affectedMatches: Array<Record<string, unknown>>;
  requiresLiveMatchDecision: boolean;
  requiresScheduleReplan: boolean;
}

export interface GoV2DisruptionResolutionDto {
  disruptionId: string;
  resolution: 'resolved' | 'cancelled';
  scheduleSessionId: string;
  affectedTournamentIds: string[];
  resolvedAt: string;
  resumesMatchesAutomatically: false;
  requiresScheduleReplan: boolean;
}

export interface GoV2PauseResolutionDto {
  matchId: string;
  disruptionId: string | null;
  decision: GoV2PauseResolutionDecision;
  scheduleSessionId: string;
  sourceCourtId: string;
  targetCourtId: string | null;
  priorScheduleVersionId: string;
  successorScheduleVersionId: string | null;
  priorCommandVersion: number;
  resultingCommandVersion: number;
  judgeResumeRequired: boolean;
  scheduleHash: string | null;
}

export interface GoV2CourtPolicyExceptionDto {
  id: string;
  tournamentId: string;
  scheduleSessionId: string;
  stageId: string | null;
  tier: 'hard' | 'medium' | 'light';
  decision: 'approve' | 'revoke';
  allowedCourtIds: string[];
  effectiveFrom: string;
  effectiveUntil: string;
  sourcePreviewId: string;
  successorScheduleVersionId: string;
  supersedesId: string | null;
  reasonCode: string;
  reasonNote: string | null;
  actorId: string;
  createdAt: string;
}

export interface GoV2PaperResultImportPayload extends Record<string, unknown> {
  resultMode: 'paper_import';
  resultKind: 'played';
  actualStartedAt: string;
  actualEndedAt: string;
  actualScore: {
    sets: Array<{ setNo: number; teamA: number; teamB: number }>;
  };
  evidence?: Record<string, unknown>;
}

export interface GoV2AdminPermissions {
  canView: true;
  canOperate: boolean;
  canDirect: boolean;
  canSecondApprove: boolean;
  directorMapping: 'global_admin';
}

export interface GoV2CourtGrantIssueResponse {
  grantId: string;
  tournamentId: string;
  scheduleSessionId: string;
  courtId: string;
  deviceId: string;
  token: string;
  tokenPrefix: string;
  expiresAt: string;
  rotatedFromGrantId: string | null;
}

export interface GoV2JudgeCommandRequest<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  commandId: string;
  requestHash: string;
  reasonCode: string;
  expectedVersion: number;
  deviceId: string;
  command: {
    type: GoV2JudgeCommandKind;
    matchId: string;
    payload: TPayload;
  };
}

export interface GoV2JudgeCommandReceipt {
  commandId: string;
  requestHash: string;
  replayed: boolean;
  accepted: boolean;
  resultingVersion: number;
  matchId: string;
  playState: string;
  liveScore: Record<string, unknown>;
  finishReviewRequired: boolean;
}

export interface GoV2LiveStandingRow {
  entryId: string;
  poolId: string;
  poolSize: 3 | 4;
  poolRank: number;
  initialSeed: number;
  provisional: boolean;
  rankSource: 'live_ledger' | 'final_ledger' | 'placement_metadata';
  metrics: {
    totals: ExactStatsDto;
    ratios: {
      matchPointsPerMatch: ExactRatioDto;
      setRatio: ExactRatioDto;
      rallyPointRatio: ExactRatioDto;
    };
    ledger: readonly StandingContributionDto[];
  };
}

/** Display-only current standings; never a qualification snapshot. */
export interface GoV2LiveStandingTable {
  snapshotId: null;
  stageId: string;
  poolId: string;
  format: 'round_robin_pool' | 'modified_pool_4';
  poolSize: 3 | 4;
  profileCode: 'LPV_V2_LIVE';
  provisional: boolean;
  complete: boolean;
  rankSource: GoV2LiveStandingRow['rankSource'];
  completedMatches: number;
  expectedMatches: number;
  rows: GoV2LiveStandingRow[];
}

export interface GoV2FinalPlacementRowDto {
  entryId: string;
  sourceStageId: string;
  sourceStageKey: string;
  tier: 'hard' | 'medium' | 'light';
  tierPlace: number;
  overallPlace: number;
  sportingTierPlaceRange: readonly [number, number];
  sportingOverallPlaceRange: readonly [number, number];
  initialSeed: number;
  gamesPlayed: number;
  losses: number;
  eliminatedByMatchId: string | null;
  basis: 'championship_match' | 'placement_match' | 'elimination_round' | 'classification_standings' | 'initial_seed_tiebreak';
  lineupSnapshot: {
    matchId: string;
    resultRevisionId: string;
    resultRevisionNo: number;
    rosterRevisionId: string;
    ratingEligibility: 'eligible' | 'ineligible' | 'profile_controlled';
    members: Array<{
      memberOrder: number;
      playerId: string | null;
      displayName: string | null;
      ratingValue: number;
    }>;
  };
}

export interface GoV2FinalPlacementSnapshotDto {
  snapshotId: string;
  aggregateVersion: number;
  sourceKind: 'bracket_v1' | 'classification_v1';
  sourceResultsHash: string;
  standingsHash: string;
  sourceStageIds: string[];
  sourceResultRevisionIds: string[];
  sourceRevisionLineage: Array<Record<string, unknown>>;
  ratingPolicySnapshot: GoV2RatingPolicySnapshot;
  createdBy: string;
  createdAt: string;
  rows: GoV2FinalPlacementRowDto[];
}

export interface GoV2StructureResponse {
  tournament: {
    id: string;
    name: string;
    date: string | null;
    time: string | null;
    location: string | null;
    engineVersion: 2;
    aggregateVersion: number;
    lifecycleState: GoV2LifecycleState;
    activeStageSnapshotId: string | null;
    activeScheduleVersionId: string | null;
    publicationState: 'shadow' | 'published' | 'unpublished';
    publicationRevisionNo: number;
    publicKillSwitchEnabled: boolean;
    metadata: Record<string, unknown>;
  };
  entries: Array<Record<string, unknown>>;
  attendancePolicy: GoV2AttendancePolicyDto;
  attendanceEvents: Array<Record<string, unknown>>;
  /** UI-ready append-only no-show return ledger derived from attendance events. */
  attendanceReinstatements: Array<Record<string, unknown>>;
  stages: Array<Record<string, unknown>>;
  stageEdges: Array<Record<string, unknown>>;
  pools: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
  standings: Array<Record<string, unknown>>;
  /** Display-only rows derived from current pool result revisions. */
  liveStandings: GoV2LiveStandingTable[];
  /** Current authoritative ledger; null while the tournament is not finished. */
  finalPlacements: GoV2FinalPlacementSnapshotDto | null;
  courts: Array<Record<string, unknown>>;
  scheduleSessions: Array<Record<string, unknown>>;
  scheduleVersions: Array<Record<string, unknown>>;
  courtPolicyExceptions: Array<Record<string, unknown>>;
  activeDisruptions: Array<Record<string, unknown>>;
  pauseResolutions: Array<Record<string, unknown>>;
  disruptionResolutions: Array<Record<string, unknown>>;
  deferOverrides: Array<Record<string, unknown>>;
  reservePromotions: Array<Record<string, unknown>>;
  courtSegments: Array<Record<string, unknown>>;
  activeCourtGrants: Array<Record<string, unknown>>;
  ratingProjections: Array<Record<string, unknown>>;
  mutations: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
}

export class GoV2Error extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'GoV2Error';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isGoV2Error(error: unknown): error is GoV2Error {
  return error instanceof GoV2Error;
}

function asObject(value: unknown, field = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GoV2Error(400, 'INVALID_BODY', `${field} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string, maxLength: number): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new GoV2Error(400, 'MISSING_FIELD', `${field} is required`, { field });
  }
  if (normalized.length > maxLength) {
    throw new GoV2Error(400, 'INVALID_FIELD', `${field} is too long`, { field, maxLength });
  }
  return normalized;
}

export function parseGoV2CommandEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown,
): GoV2CommandEnvelope<TPayload> {
  const body = asObject(value);
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new GoV2Error(400, 'INVALID_EXPECTED_VERSION', 'expectedVersion must be a non-negative integer');
  }

  const commandId = nonEmptyString(body.commandId ?? body.idempotencyKey, 'commandId', 200);
  const idempotencyKey = commandId;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(idempotencyKey)) {
    throw new GoV2Error(
      400,
      'INVALID_COMMAND_ID',
      'commandId must contain 8-200 URL-safe characters',
    );
  }

  const deviceId = nonEmptyString(body.deviceId, 'deviceId', 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(deviceId)) {
    throw new GoV2Error(400, 'INVALID_DEVICE_ID', 'deviceId must contain 3-128 URL-safe characters');
  }
  if (body.actor !== undefined || body.courtGrant !== undefined) {
    throw new GoV2Error(
      400,
      'UNTRUSTED_COMMAND_CONTEXT',
      'actor and courtGrant are attached by the server and must not be supplied by a client',
    );
  }
  const requestHashRaw = nonEmptyString(body.requestHash, 'requestHash', 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(requestHashRaw)) {
    throw new GoV2Error(400, 'INVALID_REQUEST_HASH', 'requestHash must be a SHA-256 hex digest');
  }

  const reasonCode = nonEmptyString(body.reasonCode, 'reasonCode', 64).toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(reasonCode)) {
    throw new GoV2Error(400, 'INVALID_REASON_CODE', 'reasonCode has an invalid format');
  }

  const metaKeys = new Set([
    'expectedVersion',
    'commandId',
    'requestHash',
    'deviceId',
    'actor',
    'courtGrant',
    'idempotencyKey',
    'reasonCode',
    'reasonNote',
    'previewId',
    'inputHash',
    'confirmRed',
    'redApprovalId',
    'payload',
  ]);
  const nestedPayload = body.payload === undefined ? {} : asObject(body.payload, 'payload');
  for (const key of Object.keys(nestedPayload)) {
    if (metaKeys.has(key)) {
      throw new GoV2Error(400, 'META_FIELD_INSIDE_PAYLOAD', `${key} must be supplied at the command root`);
    }
  }
  const topLevelPayload = Object.fromEntries(
    Object.entries(body).filter(([key]) => !metaKeys.has(key)),
  );
  // Domain fields are canonical at the command root. Keep nested payload support
  // for early clients, while making a top-level value win on collisions.
  const payload = { ...nestedPayload, ...topLevelPayload };
  const reasonNoteRaw = String(body.reasonNote ?? '').trim();
  const previewIdRaw = String(body.previewId ?? '').trim();
  const inputHashRaw = String(body.inputHash ?? '').trim().toLowerCase();
  if (inputHashRaw && !/^[0-9a-f]{64}$/.test(inputHashRaw)) {
    throw new GoV2Error(400, 'INVALID_INPUT_HASH', 'inputHash must be a SHA-256 hex digest');
  }

  return {
    expectedVersion,
    commandId,
    requestHash: requestHashRaw,
    deviceId,
    idempotencyKey,
    reasonCode,
    reasonNote: reasonNoteRaw || undefined,
    previewId: previewIdRaw || undefined,
    inputHash: inputHashRaw || undefined,
    confirmRed: body.confirmRed === true,
    redApprovalId: String(body.redApprovalId ?? '').trim() || undefined,
    payload: payload as TPayload,
  };
}

export function assertGoV2Uuid(value: unknown, field: string): string {
  const normalized = nonEmptyString(value, field, 64).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new GoV2Error(400, 'INVALID_UUID', `${field} must be a UUID`, { field });
  }
  return normalized;
}

export function normalizeGoV2Risk(value: unknown): GoV2Risk {
  return value === 'red' || value === 'amber' ? value : 'green';
}
