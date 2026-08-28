import { createHash, createHmac, randomUUID } from 'crypto';

import type { PoolClient } from 'pg';

import { getPool } from '@/lib/db';

import type {
  GoV2ActorContext,
  GoV2AttendanceMutationDto,
  GoV2AttendancePolicyDto,
  GoV2AttendanceState,
  GoV2CommandEnvelope,
  GoV2CourtGrantIssueResponse,
  GoV2DisruptionKind,
  GoV2DisruptionPreviewDto,
  GoV2DisruptionResolutionDto,
  GoV2DisruptionScopeKind,
  GoV2JudgeCommandKind,
  GoV2JudgeCommandReceipt,
  GoV2PauseResolutionDto,
  GoV2Risk,
} from './contracts';
import {
  assertGoV2Uuid,
  GoV2Error,
  parseGoV2CommandEnvelope,
} from './contracts';
import {
  isTerminalSetScore,
  MATCH_RULE_PRESETS,
  SportsDomainError,
  validateMatchRule,
  type MatchRule,
  type MatchRulePreset,
  type SetRule,
} from './core';
import {
  buildGoV2RatingShadowProjection,
} from './final-placements';
import {
  advanceAggregateVersion,
  appendAuditEvent,
  appendResultRevision,
  assertExpectedVersion,
  assertReceiptMatches,
  ensureGoV2StateForUpdate,
  findCommandReceipt,
  persistGoV2FinalPlacementSnapshot,
  preparePlayedResultPayload,
  requireMutationReason,
  resolveDownstreamSlots,
  saveCommandReceipt,
  withGoV2Transaction,
} from './repository';

const ATTENDANCE_STATES = new Set<GoV2AttendanceState>([
  'unknown',
  'confirmed',
  'checked_in',
  'late_hold',
  'no_show',
  'withdrawn',
  'disqualified',
]);

const DISRUPTION_KINDS = new Set<GoV2DisruptionKind>([
  'rain_hold',
  'lightning_hold',
  'court_damage',
  'medical_delay',
  'security_pause',
  'court_close',
  'court_reopen',
  'global_pause',
]);

const JUDGE_COMMAND_KINDS = new Set<GoV2JudgeCommandKind>([
  'match.start',
  'match.pause',
  'match.resume',
  'score.replace',
  'match.finish.request',
]);

const JUDGE_REASON_CODES: Readonly<Record<GoV2JudgeCommandKind, string>> = Object.freeze({
  'match.start': 'judge_match_start',
  'match.pause': 'judge_match_pause',
  'match.resume': 'judge_match_resume',
  'score.replace': 'judge_score_entry',
  'match.finish.request': 'judge_finish_request',
});

const JUDGE_BLOCKING_DISRUPTIONS = Object.freeze([
  'rain_hold',
  'lightning_hold',
  'court_damage',
  'medical_delay',
  'security_pause',
  'court_close',
  'global_pause',
] as const);

interface GoV2JudgeReadinessBlocker {
  code: string;
  message: string;
}

interface GoV2JudgeBlockingHold {
  id: string;
  disruptionKind: string;
  courtId: string | null;
  matchId: string | null;
  startsAt: string;
  expectedEndAt: string | null;
}

export interface GoV2ValidatedJudgeLiveScore {
  liveScore: {
    currentSet: number;
    points: { a: number; b: number };
    sets: Array<{ a: number; b: number }>;
  };
  finished: boolean;
  winnerSide: 'A' | 'B' | null;
  setsA: number;
  setsB: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function deriveGoV2CourtGrantToken(
  secret: string,
  grantId: string,
  commandId: string,
  targetDeviceId: string,
): string {
  return createHmac('sha256', secret)
    .update(`lpv-go-v2-grant-v1:${grantId}:${commandId}:${targetDeviceId}`)
    .digest('base64url');
}

function goV2CourtGrantTokenSecret(): string {
  const configured = String(
    process.env.GO_V2_COURT_TOKEN_SECRET || process.env.ADMIN_SESSION_SECRET || '',
  ).trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new GoV2Error(
      503,
      'COURT_GRANT_SECRET_NOT_CONFIGURED',
      'Court writer grants are unavailable until a server token secret is configured',
    );
  }
  return 'lpv-go-v2-dev-only-court-token-secret-change-me';
}

function requiredText(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > maxLength) {
    throw new GoV2Error(400, 'INVALID_FIELD', `${field} is required and must be at most ${maxLength} characters`, {
      field,
    });
  }
  return normalized;
}

function isoTimestamp(value: unknown, field: string, fallback?: Date): string {
  const parsed = value == null || value === '' ? fallback : new Date(String(value));
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new GoV2Error(422, 'INVALID_TIMESTAMP', `${field} must be an ISO timestamp`, { field });
  }
  return parsed.toISOString();
}

export function normalizeGoV2DisruptionRequest(
  payload: Record<string, unknown>,
  serverNowMs = Date.now(),
): {
  disruptionKind: GoV2DisruptionKind;
  scopeKind: GoV2DisruptionScopeKind;
  courtId: string | null;
  matchId: string | null;
  startsAt: string;
  expectedEndAt: string | null;
} {
  const disruptionKind = String(payload.disruptionKind ?? payload.kind ?? '') as GoV2DisruptionKind;
  if (!DISRUPTION_KINDS.has(disruptionKind)) {
    throw new GoV2Error(422, 'INVALID_DISRUPTION_KIND', 'Unsupported schedule disruption', {
      allowedKinds: [...DISRUPTION_KINDS],
    });
  }
  if (disruptionKind === 'court_reopen') {
    throw new GoV2Error(
      422,
      'DISRUPTION_RESOLVE_ENDPOINT_REQUIRED',
      'Reopening a court must resolve the active court disruption by id; it is not a new disruption',
    );
  }
  const courtScoped = ['court_close', 'court_damage'].includes(disruptionKind);
  const matchScoped = disruptionKind === 'medical_delay';
  const scopeKind: GoV2DisruptionScopeKind = courtScoped ? 'court' : matchScoped ? 'match' : 'session';
  const courtId = payload.courtId ? assertGoV2Uuid(payload.courtId, 'courtId') : null;
  const matchId = payload.matchId ? assertGoV2Uuid(payload.matchId, 'matchId') : null;
  if (courtScoped !== Boolean(courtId)) {
    throw new GoV2Error(
      422,
      'INVALID_DISRUPTION_SCOPE',
      courtScoped ? `${disruptionKind} requires courtId` : `${disruptionKind} must not specify courtId`,
    );
  }
  if (matchScoped !== Boolean(matchId) || (!matchScoped && matchId)) {
    throw new GoV2Error(
      422,
      'INVALID_DISRUPTION_SCOPE',
      matchScoped ? 'medical_delay requires matchId' : `${disruptionKind} must not specify matchId`,
    );
  }
  const startsAt = isoTimestamp(payload.startsAt, 'startsAt', new Date(serverNowMs));
  if (Math.abs(Date.parse(startsAt) - serverNowMs) > 2 * 60_000) {
    throw new GoV2Error(
      422,
      'DISRUPTION_EFFECTIVE_TIME_OUT_OF_RANGE',
      'A live hold must start within two minutes of the server clock',
      { startsAt, serverTime: new Date(serverNowMs).toISOString(), toleranceSeconds: 120 },
    );
  }
  const expectedEndAt = payload.expectedEndAt
    ? isoTimestamp(payload.expectedEndAt, 'expectedEndAt')
    : null;
  if (expectedEndAt && expectedEndAt <= startsAt) {
    throw new GoV2Error(422, 'INVALID_DISRUPTION_WINDOW', 'expectedEndAt must be after startsAt');
  }
  return { disruptionKind, scopeKind, courtId, matchId, startsAt, expectedEndAt };
}

function normalizeStoredJudgeMatchRule(value: unknown): MatchRule {
  const configured = typeof value === 'string' ? { preset: value } : record(value);
  const preset = String(configured.preset ?? 'single_21') as MatchRulePreset;
  const fallback = MATCH_RULE_PRESETS[preset];
  if (!fallback) {
    throw new GoV2Error(409, 'INVALID_STORED_MATCH_RULE', 'The stored match rule uses an unsupported preset', {
      preset,
    });
  }
  const configuredSets = configured.sets;
  if (configuredSets !== undefined && !Array.isArray(configuredSets)) {
    throw new GoV2Error(409, 'INVALID_STORED_MATCH_RULE', 'The stored match rule sets must be an array');
  }
  const sets = Array.isArray(configuredSets)
    ? configuredSets.map((rawSet, index) => {
        const item = record(rawSet);
        const base = fallback.sets[index] ?? fallback.sets[fallback.sets.length - 1];
        return {
          targetPoints: Number(item.targetPoints ?? base?.targetPoints),
          winBy: Number(item.winBy ?? base?.winBy ?? 2),
          pointCap: item.pointCap === undefined
            ? (base?.pointCap ?? null)
            : item.pointCap === null
              ? null
              : Number(item.pointCap),
        };
      })
    : fallback.sets.map((set) => ({
        ...set,
        winBy: configured.winBy === undefined ? set.winBy : Number(configured.winBy),
        pointCap: configured.pointCap === undefined
          ? set.pointCap
          : configured.pointCap === null
            ? null
            : Number(configured.pointCap),
      }));
  const candidate: MatchRule = {
    preset,
    setsToWin: Number(configured.setsToWin ?? fallback.setsToWin),
    sets,
  };
  const validation = validateMatchRule(candidate, 'storedMatchRule');
  if (!validation.ok) {
    throw new GoV2Error(409, 'INVALID_STORED_MATCH_RULE', 'The stored match rule is invalid', {
      issues: validation.issues,
    });
  }
  return validation.value;
}

function judgePoints(value: unknown, field: string): { a: number; b: number } {
  const item = record(value);
  const a = Number(item.a);
  const b = Number(item.b);
  if (!Number.isSafeInteger(a) || a < 0 || !Number.isSafeInteger(b) || b < 0) {
    throw new GoV2Error(422, 'INVALID_LIVE_SCORE_POINTS', `${field} must contain non-negative integer a/b points`, {
      field,
    });
  }
  return { a, b };
}

function assertReachableJudgeSetPoints(
  points: { a: number; b: number },
  rule: SetRule,
  setNo: number,
): void {
  const leader = Math.max(points.a, points.b);
  const trailer = Math.min(points.a, points.b);
  if (rule.pointCap !== null && leader > rule.pointCap) {
    throw new GoV2Error(422, 'LIVE_SCORE_EXCEEDS_POINT_CAP', `Set ${setNo} exceeds its point cap`, {
      setNo,
      pointCap: rule.pointCap,
    });
  }
  if (isTerminalSetScore(points.a, points.b, rule)) return;
  if (rule.pointCap !== null && leader === rule.pointCap) {
    throw new GoV2Error(422, 'LIVE_SCORE_PAST_SET_END', `Set ${setNo} cannot continue at its point cap`, {
      setNo,
      pointCap: rule.pointCap,
    });
  }
  if (leader >= rule.targetPoints && leader - trailer >= rule.winBy) {
    throw new GoV2Error(422, 'LIVE_SCORE_PAST_SET_END', `Set ${setNo} contains points after it was decided`, {
      setNo,
    });
  }
}

/**
 * Authoritative server validation for judge score replacement and finish
 * requests. It intentionally accepts a terminal current-set score (the judge
 * UI writes the point first, then closes the set), but a finish request must
 * contain only closed sets and exactly one match winner.
 */
export function validateGoV2JudgeLiveScore(
  matchRuleValue: unknown,
  liveScoreValue: unknown,
  options: { requireFinished?: boolean; requireShape?: boolean } = {},
): GoV2ValidatedJudgeLiveScore {
  const rule = normalizeStoredJudgeMatchRule(matchRuleValue);
  const score = record(liveScoreValue);
  if (options.requireShape !== false && (
    !Object.prototype.hasOwnProperty.call(score, 'currentSet')
    || !Object.prototype.hasOwnProperty.call(score, 'points')
    || !Array.isArray(score.sets)
  )) {
    throw new GoV2Error(422, 'INVALID_LIVE_SCORE_SHAPE', 'liveScore requires currentSet, points and sets');
  }
  const rawSets = Array.isArray(score.sets) ? score.sets : [];
  if (rawSets.length > rule.sets.length) {
    throw new GoV2Error(422, 'LIVE_SCORE_SET_COUNT_EXCEEDED', 'Score contains more sets than the match rule allows');
  }
  const sets = rawSets.map((rawSet, index) => judgePoints(rawSet, `sets[${index}]`));
  const points = score.points === undefined && options.requireShape === false
    ? { a: 0, b: 0 }
    : judgePoints(score.points, 'points');
  const currentSet = Number(score.currentSet ?? sets.length + 1);
  if (!Number.isSafeInteger(currentSet) || currentSet !== sets.length + 1) {
    throw new GoV2Error(422, 'LIVE_SCORE_CURRENT_SET_MISMATCH', 'currentSet must be one-based and follow the closed sets', {
      expected: sets.length + 1,
      actual: currentSet,
    });
  }

  let setsA = 0;
  let setsB = 0;
  for (let index = 0; index < sets.length; index += 1) {
    if (setsA === rule.setsToWin || setsB === rule.setsToWin) {
      throw new GoV2Error(422, 'LIVE_SCORE_SETS_AFTER_MATCH_WIN', 'Score contains a set after the match was decided', {
        setNo: index + 1,
      });
    }
    const setRule = rule.sets[index];
    const setScore = sets[index];
    if (!setRule || !isTerminalSetScore(setScore.a, setScore.b, setRule)) {
      throw new GoV2Error(422, 'LIVE_SCORE_INCOMPLETE_CLOSED_SET', `Closed set ${index + 1} is not terminal under the match rule`, {
        setNo: index + 1,
      });
    }
    if (setScore.a > setScore.b) setsA += 1;
    else setsB += 1;
  }

  const finished = setsA === rule.setsToWin || setsB === rule.setsToWin;
  if (finished) {
    if (points.a !== 0 || points.b !== 0) {
      throw new GoV2Error(422, 'LIVE_SCORE_POINTS_AFTER_MATCH_WIN', 'Current-set points must be 0:0 after the match is decided');
    }
  } else {
    const setRule = rule.sets[sets.length];
    if (!setRule) {
      throw new GoV2Error(422, 'LIVE_SCORE_SET_COUNT_EXCEEDED', 'The match rule has no current set');
    }
    assertReachableJudgeSetPoints(points, setRule, sets.length + 1);
  }
  if (options.requireFinished && !finished) {
    throw new GoV2Error(422, 'MATCH_SCORE_INCOMPLETE', `One participant must win ${rule.setsToWin} set(s) before finish can be requested`);
  }
  return {
    liveScore: { currentSet, points, sets },
    finished,
    winnerSide: finished ? (setsA === rule.setsToWin ? 'A' : 'B') : null,
    setsA,
    setsB,
  };
}

export type GoV2FinishReviewDecision = 'accept' | 'reject';

interface GoV2FinishReviewDependencies {
  preparePlayedResultPayload: typeof preparePlayedResultPayload;
  appendResultRevision: typeof appendResultRevision;
  resolveDownstreamSlots: typeof resolveDownstreamSlots;
}

const GO_V2_FINISH_REVIEW_DEPENDENCIES: GoV2FinishReviewDependencies = {
  preparePlayedResultPayload,
  appendResultRevision,
  resolveDownstreamSlots,
};

function requiredJudgeCommandVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new GoV2Error(
      422,
      'INVALID_FINISH_REQUEST_VERSION',
      'finishRequestVersion must be the positive judge command version that created the review request',
    );
  }
  return version;
}

/**
 * Applies a director decision to the authoritative judge finish request.
 *
 * The caller owns the tournament transaction/command receipt. This function
 * additionally locks the match and its live row, then performs a match-level
 * CAS so an admin page cannot accept an older request after an offline judge
 * command was rebased. Scores, participants and winner/loser IDs are always
 * derived from server state; none are accepted from the director payload.
 */
export async function persistGoV2FinishReviewDecision(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    decision: GoV2FinishReviewDecision;
    finishRequestVersion: unknown;
    actorId: string;
    reasonCode: string;
    reasonNote?: string;
  },
  dependencyOverrides: Partial<GoV2FinishReviewDependencies> = {},
): Promise<Record<string, unknown>> {
  const dependencies = {
    ...GO_V2_FINISH_REVIEW_DEPENDENCIES,
    ...dependencyOverrides,
  };
  const expectedJudgeCommandVersion = requiredJudgeCommandVersion(input.finishRequestVersion);
  const match = await client.query(
    `SELECT match.id::text, match.play_state, match.schedule_state,
            match.current_result_revision_no,
            COALESCE(NULLIF(match.match_rule, '{}'::jsonb), stage.match_rule) AS match_rule,
            assignment.id::text AS assignment_id
     FROM go_v2_matches match
     JOIN go_v2_stages stage ON stage.id = match.stage_id
     LEFT JOIN LATERAL (
       SELECT candidate.id
       FROM go_v2_schedule_assignments candidate
       JOIN go_v2_tournament_state state
         ON state.tournament_id = match.tournament_id
        AND state.active_schedule_version_id = candidate.schedule_version_id
       WHERE candidate.match_id = match.id
       LIMIT 1
     ) assignment ON true
     WHERE match.id = $1 AND match.tournament_id = $2
     FOR UPDATE OF match`,
    [input.matchId, input.tournamentId],
  );
  if (!match.rowCount) throw new GoV2Error(404, 'MATCH_NOT_FOUND', 'Match not found');

  const live = await client.query(
    `SELECT command_version, live_score, finish_requested
     FROM go_v2_live_match_state
     WHERE match_id = $1
     FOR UPDATE`,
    [input.matchId],
  );
  if (!live.rowCount) {
    throw new GoV2Error(409, 'FINISH_REQUEST_NOT_PENDING', 'The match has no pending judge finish request');
  }
  const currentJudgeCommandVersion = Number(live.rows[0].command_version);
  if (currentJudgeCommandVersion !== expectedJudgeCommandVersion) {
    throw new GoV2Error(
      409,
      'FINISH_REVIEW_VERSION_CONFLICT',
      'The judge score or finish request changed after the director loaded it',
      {
        expectedVersion: expectedJudgeCommandVersion,
        actualVersion: currentJudgeCommandVersion,
      },
    );
  }
  if (live.rows[0].finish_requested !== true) {
    throw new GoV2Error(409, 'FINISH_REQUEST_NOT_PENDING', 'The judge finish request is no longer pending');
  }
  const playState = String(match.rows[0].play_state);
  if (!['live', 'paused'].includes(playState)) {
    throw new GoV2Error(
      409,
      'FINISH_REVIEW_STATE_FORBIDDEN',
      `A finish request can only be reviewed while the match is live or paused, not ${playState}`,
    );
  }

  if (input.decision === 'reject') {
    const rejected = await client.query(
      `UPDATE go_v2_live_match_state
       SET finish_requested = false,
           command_version = command_version + 1,
           updated_at = now()
       WHERE match_id = $1
         AND command_version = $2
         AND finish_requested = true
       RETURNING command_version, live_score`,
      [input.matchId, expectedJudgeCommandVersion],
    );
    if (!rejected.rowCount) {
      throw new GoV2Error(409, 'FINISH_REVIEW_VERSION_CONFLICT', 'The finish request changed during rejection');
    }
    return {
      decision: 'reject',
      matchId: input.matchId,
      playState,
      scorePreserved: true,
      liveScore: record(rejected.rows[0].live_score),
      finishReviewRequired: false,
      priorJudgeCommandVersion: expectedJudgeCommandVersion,
      resultingJudgeCommandVersion: Number(rejected.rows[0].command_version),
    };
  }

  if (Number(match.rows[0].current_result_revision_no ?? 0) !== 0) {
    throw new GoV2Error(409, 'MATCH_ALREADY_RESULTED', 'A live finish request cannot overwrite an existing result revision');
  }
  const validatedScore = validateGoV2JudgeLiveScore(
    match.rows[0].match_rule,
    live.rows[0].live_score,
    { requireFinished: true, requireShape: true },
  );
  const participants = await loadJudgeMatchParticipants(client, input.matchId);
  const participantBySlot = new Map(participants.map((participant) => [Number(participant.slotNo), participant]));
  const teamA = participantBySlot.get(1);
  const teamB = participantBySlot.get(2);
  const participantIds = [teamA?.entryId, teamB?.entryId].map((value) => String(value ?? '')).filter(Boolean);
  if (
    participants.length !== 2
    || participantIds.length !== 2
    || new Set(participantIds).size !== 2
    || teamA?.entryTournamentId !== input.tournamentId
    || teamB?.entryTournamentId !== input.tournamentId
  ) {
    throw new GoV2Error(
      409,
      'MATCH_PARTICIPANTS_UNRESOLVED',
      'Both distinct participants must still resolve to entries in the owning tournament',
    );
  }
  const [teamAId, teamBId] = participantIds;
  const winnerEntryId = validatedScore.winnerSide === 'A' ? teamAId : teamBId;
  const loserEntryId = validatedScore.winnerSide === 'A' ? teamBId : teamAId;
  const serverScore = {
    sets: validatedScore.liveScore.sets.map((set, index) => ({
      setNo: index + 1,
      teamA: set.a,
      teamB: set.b,
    })),
  };
  const prepared = await dependencies.preparePlayedResultPayload(client, {
    tournamentId: input.tournamentId,
    matchId: input.matchId,
    payload: {
      actualScore: serverScore,
      incidentCause: 'played',
      ratingEligibility: 'eligible',
      evidence: {
        source: 'judge_finish_request',
        judgeCommandVersion: expectedJudgeCommandVersion,
        acceptedBy: input.actorId,
      },
    },
  });
  if (
    String(prepared.payload.winnerEntryId ?? '') !== winnerEntryId
    || String(prepared.payload.loserEntryId ?? '') !== loserEntryId
  ) {
    throw new GoV2Error(500, 'FINISH_RESULT_DERIVATION_MISMATCH', 'Server score and participant derivation disagree');
  }
  const revision = await dependencies.appendResultRevision(client, {
    tournamentId: input.tournamentId,
    matchId: input.matchId,
    actorId: input.actorId,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    resultSource: 'judge_review',
    payload: prepared.payload,
  });
  const reboundMatchIds = await dependencies.resolveDownstreamSlots(
    client,
    input.matchId,
    winnerEntryId,
    loserEntryId,
    {
      actorId: input.actorId,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
    },
  );
  const assignmentId = String(match.rows[0].assignment_id ?? '');
  if (!assignmentId) {
    throw new GoV2Error(409, 'ACTIVE_SCHEDULE_ASSIGNMENT_NOT_FOUND', 'The finish request has no active schedule assignment');
  }
  const ended = await client.query(
    `UPDATE go_v2_schedule_assignments
     SET actual_end = COALESCE(actual_end, clock_timestamp())
     WHERE id = $1 AND match_id = $2
     RETURNING actual_end`,
    [assignmentId, input.matchId],
  );
  if (!ended.rowCount) {
    throw new GoV2Error(409, 'ACTIVE_SCHEDULE_ASSIGNMENT_NOT_FOUND', 'The active assignment changed during finish review');
  }
  const accepted = await client.query(
    `UPDATE go_v2_live_match_state
     SET finish_requested = false,
         command_version = command_version + 1,
         updated_at = now()
     WHERE match_id = $1
       AND command_version = $2
       AND finish_requested = true
     RETURNING command_version, live_score`,
    [input.matchId, expectedJudgeCommandVersion],
  );
  if (!accepted.rowCount) {
    throw new GoV2Error(409, 'FINISH_REVIEW_VERSION_CONFLICT', 'The finish request changed during acceptance');
  }
  const actualEndValue = ended.rows[0].actual_end;
  await client.query(
    `UPDATE go_v2_match_court_segments
     SET ended_at = COALESCE(ended_at, $2::timestamptz),
         closing_score = COALESCE(closing_score, $3::jsonb)
     WHERE match_id = $1 AND ended_at IS NULL`,
    [input.matchId, actualEndValue, JSON.stringify(record(accepted.rows[0].live_score))],
  );
  return {
    decision: 'accept',
    matchId: input.matchId,
    previousPlayState: playState,
    playState: 'final',
    resultKind: 'played',
    resultRevisionId: revision.resultRevisionId,
    resultRevisionNo: revision.revisionNo,
    winnerEntryId,
    loserEntryId,
    actualScore: serverScore,
    actualEnd: actualEndValue instanceof Date ? actualEndValue.toISOString() : String(actualEndValue),
    reboundMatchIds,
    resolvedRefereeDutyIds: revision.resolvedRefereeDutyIds,
    liveScore: record(accepted.rows[0].live_score),
    finishReviewRequired: false,
    priorJudgeCommandVersion: expectedJudgeCommandVersion,
    resultingJudgeCommandVersion: Number(accepted.rows[0].command_version),
  };
}

function assertDeclaredHash(declared: string, actual: string): void {
  if (declared !== actual) {
    throw new GoV2Error(409, 'REQUEST_HASH_MISMATCH', 'requestHash does not match the canonical command');
  }
}

function attendanceTransitionAllowed(from: GoV2AttendanceState, to: GoV2AttendanceState): boolean {
  if (from === to) return true;
  if (from === 'disqualified' || from === 'withdrawn') return false;
  // Returning after no_show is standings-aware and director-only. Keeping it
  // out of the ordinary attendance mutation prevents a late check-in from
  // silently bypassing already-awarded results and their route lineage.
  if (from === 'no_show') return false;
  if (from === 'unknown' || from === 'confirmed') {
    return ['confirmed', 'checked_in', 'late_hold', 'no_show'].includes(to);
  }
  if (from === 'checked_in') return ['late_hold', 'no_show'].includes(to);
  if (from === 'late_hold') return ['checked_in', 'no_show'].includes(to);
  return false;
}

async function loadAttendancePolicy(
  client: PoolClient,
  tournamentId: string,
): Promise<GoV2AttendancePolicyDto> {
  await client.query(
    `INSERT INTO go_v2_attendance_policies (tournament_id)
     VALUES ($1)
     ON CONFLICT (tournament_id) DO NOTHING`,
    [tournamentId],
  );
  const result = await client.query(
    `SELECT check_in_open_minutes_before, check_in_deadline_minutes_before,
            grace_period_minutes, technical_result_requires_director
     FROM go_v2_attendance_policies
     WHERE tournament_id = $1`,
    [tournamentId],
  );
  return {
    checkInOpenMinutesBefore: Number(result.rows[0].check_in_open_minutes_before),
    checkInDeadlineMinutesBefore: Number(result.rows[0].check_in_deadline_minutes_before),
    gracePeriodMinutes: Number(result.rows[0].grace_period_minutes),
    technicalResultRequiresDirector: true,
  };
}

async function firstScheduledEntryMatch(
  client: PoolClient,
  tournamentId: string,
  entryId: string,
): Promise<{ firstStart: string | null; finalTechnicalMatches: number }> {
  const result = await client.query(
    `SELECT min(assignment.planned_start) AS first_start,
            count(*) FILTER (
              WHERE match.play_state = 'final'
                AND revision.result_kind IN ('walkover', 'forfeit', 'admin_award')
            )::int AS final_technical_matches
     FROM go_v2_matches match
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     LEFT JOIN go_v2_tournament_state state ON state.tournament_id = match.tournament_id
     LEFT JOIN go_v2_schedule_assignments assignment
       ON assignment.match_id = match.id
      AND assignment.schedule_version_id = state.active_schedule_version_id
     LEFT JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
     WHERE match.tournament_id = $1
       AND COALESCE(source.resolved_entry_id, source.source_entry_id) = $2`,
    [tournamentId, entryId],
  );
  return {
    firstStart: result.rows[0]?.first_start
      ? new Date(result.rows[0].first_start).toISOString()
      : null,
    finalTechnicalMatches: Number(result.rows[0]?.final_technical_matches ?? 0),
  };
}

export async function prepareGoV2AttendanceMutation(
  client: PoolClient,
  input: { tournamentId: string; entryId: string; payload: Record<string, unknown> },
): Promise<{
  risk: GoV2Risk;
  candidate: GoV2AttendanceMutationDto & Record<string, unknown>;
  impact: Record<string, unknown>;
}> {
  const entry = await client.query(
    `SELECT id::text, attendance_state, attendance_version, registration_state
     FROM go_v2_entries
     WHERE tournament_id = $1 AND id = $2`,
    [input.tournamentId, input.entryId],
  );
  if (!entry.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  const fromState = String(entry.rows[0].attendance_state) as GoV2AttendanceState;
  const toState = String(input.payload.attendanceState ?? input.payload.toState ?? '') as GoV2AttendanceState;
  if (!ATTENDANCE_STATES.has(toState)) {
    throw new GoV2Error(422, 'INVALID_ATTENDANCE_STATE', 'Unsupported attendance state', {
      allowedStates: [...ATTENDANCE_STATES],
    });
  }
  if (toState === 'withdrawn' || toState === 'disqualified') {
    throw new GoV2Error(
      409,
      'WITHDRAWAL_WORKFLOW_REQUIRED',
      'Withdrawal/disqualification must use the standings-aware withdrawal preview and commit workflow',
    );
  }
  if (!attendanceTransitionAllowed(fromState, toState)) {
    if (fromState === 'no_show' && (toState === 'checked_in' || toState === 'late_hold')) {
      throw new GoV2Error(
        409,
        'ATTENDANCE_REINSTATEMENT_WORKFLOW_REQUIRED',
        'Use attendance/reinstate preview and commit to return an entry after no_show',
      );
    }
    throw new GoV2Error(409, 'INVALID_ATTENDANCE_TRANSITION', `${fromState} cannot transition to ${toState}`);
  }
  const activeMatch = await client.query(
    `SELECT match.id::text AS match_id, match.play_state
     FROM go_v2_matches match
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     WHERE match.tournament_id = $1
       AND COALESCE(source.resolved_entry_id, source.source_entry_id) = $2
       AND match.play_state IN ('live', 'paused')
     ORDER BY match.id
     LIMIT 1`,
    [input.tournamentId, input.entryId],
  );
  if (activeMatch.rowCount && fromState !== toState) {
    throw new GoV2Error(
      409,
      'ENTRY_MATCH_ACTIVE',
      'Attendance eligibility cannot change while the entry has a live or paused match',
      {
        matchId: String(activeMatch.rows[0].match_id),
        playState: String(activeMatch.rows[0].play_state),
      },
    );
  }

  const effectiveAt = isoTimestamp(input.payload.effectiveAt, 'effectiveAt', new Date());
  const policy = await loadAttendancePolicy(client, input.tournamentId);
  const schedule = await firstScheduledEntryMatch(client, input.tournamentId, input.entryId);
  const checkInOpensAt = schedule.firstStart
    ? new Date(new Date(schedule.firstStart).getTime() - policy.checkInOpenMinutesBefore * 60_000).toISOString()
    : null;
  const checkInDeadlineAt = schedule.firstStart
    ? new Date(new Date(schedule.firstStart).getTime() - policy.checkInDeadlineMinutesBefore * 60_000).toISOString()
    : null;
  const isLateAtEffectiveTime = Boolean(
    checkInDeadlineAt && new Date(effectiveAt) >= new Date(checkInDeadlineAt),
  );
  if (toState === 'confirmed' && isLateAtEffectiveTime && input.payload.allowLateConfirmation !== true) {
    throw new GoV2Error(
      409,
      'LATE_HOLD_REQUIRED',
      'The confirmation deadline has passed; use late_hold until the entry checks in',
      { deadlineAt: checkInDeadlineAt, firstMatchAt: schedule.firstStart },
    );
  }
  if (toState === 'checked_in' && schedule.firstStart) {
    const opensAt = new Date(String(checkInOpensAt));
    if (new Date(effectiveAt) < opensAt && input.payload.allowEarlyCheckIn !== true) {
      throw new GoV2Error(409, 'CHECK_IN_NOT_OPEN', 'Check-in is not open for this entry', {
        opensAt: opensAt.toISOString(),
        firstMatchAt: schedule.firstStart,
      });
    }
  }
  if (toState === 'no_show') {
    if (!schedule.firstStart) {
      throw new GoV2Error(409, 'NO_SHOW_REQUIRES_SCHEDULE', 'No-show requires a published first match');
    }
    const eligibleAt = new Date(new Date(schedule.firstStart).getTime() + policy.gracePeriodMinutes * 60_000);
    if (new Date(effectiveAt) < eligibleAt) {
      throw new GoV2Error(409, 'NO_SHOW_GRACE_PERIOD_ACTIVE', 'The configured no-show grace period has not elapsed', {
        eligibleAt: eligibleAt.toISOString(),
      });
    }
  }

  const risk: GoV2Risk = toState === 'no_show' ? 'amber' : 'green';
  const nextAction = toState === 'no_show'
    ? 'incident_preview_required'
    : 'none';
  return {
    risk,
    candidate: {
      ...input.payload,
      entryId: input.entryId,
      fromState,
      toState,
      attendanceVersion: Number(entry.rows[0].attendance_version),
      effectiveAt,
      policy,
      checkInOpensAt,
      checkInDeadlineAt,
      deadlineAt: checkInDeadlineAt,
      isLateAtEffectiveTime,
      createsTechnicalResult: false,
      nextAction,
    },
    impact: {
      firstMatchAt: schedule.firstStart,
      checkInOpensAt,
      checkInDeadlineAt,
      deadlineAt: checkInDeadlineAt,
      isLateAtEffectiveTime,
      finalTechnicalMatches: schedule.finalTechnicalMatches,
      technicalResultCreated: false,
      requiresIncidentPreview: nextAction === 'incident_preview_required',
    },
  };
}

export async function persistGoV2AttendanceMutation(
  client: PoolClient,
  input: {
    tournamentId: string;
    entryId: string;
    aggregateVersion: number;
    actorId: string;
    command: GoV2CommandEnvelope;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const locked = await client.query(
    `SELECT attendance_state, attendance_version
     FROM go_v2_entries
     WHERE tournament_id = $1 AND id = $2
     FOR UPDATE`,
    [input.tournamentId, input.entryId],
  );
  if (!locked.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  const fromState = String(locked.rows[0].attendance_state) as GoV2AttendanceState;
  const expectedFrom = String(input.payload.fromState ?? '');
  const expectedAttendanceVersion = Number(input.payload.attendanceVersion);
  if (fromState !== expectedFrom || Number(locked.rows[0].attendance_version) !== expectedAttendanceVersion) {
    throw new GoV2Error(409, 'ATTENDANCE_PREVIEW_STALE', 'Attendance changed after preview');
  }
  const toState = String(input.payload.toState) as GoV2AttendanceState;
  if (!attendanceTransitionAllowed(fromState, toState)) {
    throw new GoV2Error(409, 'INVALID_ATTENDANCE_TRANSITION', `${fromState} cannot transition to ${toState}`);
  }
  const nextVersion = expectedAttendanceVersion + 1;
  await client.query(
    `UPDATE go_v2_entries
     SET attendance_state = $3, attendance_changed_at = $4, attendance_version = $5,
         updated_at = now()
     WHERE tournament_id = $1 AND id = $2`,
    [input.tournamentId, input.entryId, toState, input.payload.effectiveAt, nextVersion],
  );
  const event = await client.query(
    `INSERT INTO go_v2_attendance_events (
       tournament_id, entry_id, aggregate_version, attendance_version,
       from_state, to_state, effective_at, reason_code, reason_note,
       actor_id, command_id, device_id, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     RETURNING id::text, created_at`,
    [
      input.tournamentId,
      input.entryId,
      input.aggregateVersion,
      nextVersion,
      fromState,
      toState,
      input.payload.effectiveAt,
      input.command.reasonCode,
      input.command.reasonNote ?? null,
      input.actorId,
      input.command.commandId,
      input.command.deviceId,
      JSON.stringify({ ...input.payload, technicalResultCreated: false }),
    ],
  );
  return {
    eventId: event.rows[0].id,
    entryId: input.entryId,
    fromState,
    toState,
    attendanceVersion: nextVersion,
    createsTechnicalResult: false,
    nextAction: input.payload.nextAction ?? 'none',
  };
}

export async function persistGoV2AttendanceReinstatement(
  client: PoolClient,
  input: {
    tournamentId: string;
    entryId: string;
    aggregateVersion: number;
    actorId: string;
    command: GoV2CommandEnvelope;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const locked = await client.query(
    `SELECT attendance_state, attendance_version
     FROM go_v2_entries
     WHERE tournament_id = $1 AND id = $2
     FOR UPDATE`,
    [input.tournamentId, input.entryId],
  );
  if (!locked.rowCount) throw new GoV2Error(404, 'ENTRY_NOT_FOUND', 'Tournament entry not found');
  const fromState = String(locked.rows[0].attendance_state) as GoV2AttendanceState;
  const expectedAttendanceVersion = Number(input.payload.attendanceVersion);
  if (
    fromState !== 'no_show'
    || Number(locked.rows[0].attendance_version) !== expectedAttendanceVersion
  ) {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_PREVIEW_STALE',
      'Attendance changed after the reinstatement preview',
    );
  }
  const toState = String(input.payload.toState) as GoV2AttendanceState;
  if (toState !== 'checked_in' && toState !== 'late_hold') {
    throw new GoV2Error(
      422,
      'ATTENDANCE_REINSTATEMENT_TARGET_INVALID',
      'A reinstated entry must become checked_in or late_hold',
    );
  }
  const activeMatch = await client.query(
    `SELECT match.id::text AS match_id, match.play_state
     FROM go_v2_matches match
     JOIN go_v2_match_slot_sources source ON source.match_id = match.id
     WHERE match.tournament_id = $1
       AND COALESCE(source.resolved_entry_id, source.source_entry_id) = $2
       AND match.play_state IN ('live', 'paused')
     ORDER BY match.id
     LIMIT 1`,
    [input.tournamentId, input.entryId],
  );
  if (activeMatch.rowCount) {
    throw new GoV2Error(
      409,
      'ENTRY_MATCH_ACTIVE',
      'Attendance eligibility cannot change while the entry has a live or paused match',
      {
        matchId: String(activeMatch.rows[0].match_id),
        playState: String(activeMatch.rows[0].play_state),
      },
    );
  }
  const nextVersion = expectedAttendanceVersion + 1;
  const updated = await client.query(
    `UPDATE go_v2_entries
     SET attendance_state = $3, attendance_changed_at = $4,
         attendance_version = $5, updated_at = now()
     WHERE tournament_id = $1 AND id = $2
       AND attendance_state = 'no_show' AND attendance_version = $6
     RETURNING id`,
    [
      input.tournamentId,
      input.entryId,
      toState,
      input.payload.effectiveAt,
      nextVersion,
      expectedAttendanceVersion,
    ],
  );
  if (!updated.rowCount) {
    throw new GoV2Error(
      409,
      'ATTENDANCE_REINSTATEMENT_PREVIEW_STALE',
      'Attendance changed while the reinstatement was committing',
    );
  }
  const eventPayload = {
    operation: 'attendance.reinstate.commit',
    decision: String(input.payload.decision),
    priorResultsPreserved: String(input.payload.decision) === 'keep_awarded_result',
    technicalResultCreated: false,
    sourcePreviewId: input.payload.sourcePreviewId ?? null,
    stateFingerprint: input.payload.stateFingerprint ?? null,
    priorScheduleVersionId: input.payload.priorScheduleVersionId ?? null,
    successorScheduleVersionId: input.payload.successorScheduleVersionId ?? null,
    scheduleHash: input.payload.scheduleHash ?? null,
    mutationBatchId: input.payload.mutationBatchId ?? null,
    replayMatchIds: Array.isArray(input.payload.replayMatchIds)
      ? input.payload.replayMatchIds.map(String)
      : [],
    deferredAwardedMatchIds: Array.isArray(input.payload.deferredAwardedMatchIds)
      ? input.payload.deferredAwardedMatchIds.map(String)
      : [],
    resetLiveProjectionMatchIds: Array.isArray(input.payload.resetLiveProjectionMatchIds)
      ? input.payload.resetLiveProjectionMatchIds.map(String)
      : [],
    closedCourtSegmentIds: Array.isArray(input.payload.closedCourtSegmentIds)
      ? input.payload.closedCourtSegmentIds.map(String)
      : [],
    closedScheduleAssignmentIds: Array.isArray(input.payload.closedScheduleAssignmentIds)
      ? input.payload.closedScheduleAssignmentIds.map(String)
      : [],
    resultRevisionIds: Array.isArray(input.payload.resultRevisionIds)
      ? input.payload.resultRevisionIds.map(String)
      : [],
    qualificationSnapshotLineage: Array.isArray(input.payload.qualificationSnapshotLineage)
      ? input.payload.qualificationSnapshotLineage
      : [],
  };
  const event = await client.query(
    `INSERT INTO go_v2_attendance_events (
       tournament_id, entry_id, aggregate_version, attendance_version,
       from_state, to_state, effective_at, reason_code, reason_note,
       actor_id, command_id, device_id, payload
     ) VALUES ($1, $2, $3, $4, 'no_show', $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING id::text, created_at`,
    [
      input.tournamentId,
      input.entryId,
      input.aggregateVersion,
      nextVersion,
      toState,
      input.payload.effectiveAt,
      input.command.reasonCode,
      input.command.reasonNote ?? null,
      input.actorId,
      input.command.commandId,
      input.command.deviceId,
      JSON.stringify(eventPayload),
    ],
  );
  return {
    eventId: String(event.rows[0].id),
    entryId: input.entryId,
    fromState: 'no_show',
    toState,
    attendanceVersion: nextVersion,
    decision: String(input.payload.decision),
    technicalResultCreated: false,
  };
}

export async function prepareGoV2Disruption(
  client: PoolClient,
  input: { tournamentId: string; payload: Record<string, unknown> },
): Promise<{
  risk: GoV2Risk;
  candidate: GoV2DisruptionPreviewDto & Record<string, unknown>;
  impact: Record<string, unknown>;
}> {
  const {
    disruptionKind,
    scopeKind,
    courtId,
    matchId,
    startsAt,
    expectedEndAt,
  } = normalizeGoV2DisruptionRequest(input.payload);
  const sessionResult = await client.query(
    `SELECT version.id::text AS schedule_version_id, version.session_id::text,
            COALESCE(jsonb_object_agg(
              member.tournament_id::text,
              member_state.aggregate_version
            ) FILTER (WHERE member.tournament_id IS NOT NULL), '{}'::jsonb) AS tournament_versions,
            COALESCE(array_agg(DISTINCT member.tournament_id::text ORDER BY member.tournament_id::text)
              FILTER (WHERE member.tournament_id IS NOT NULL), ARRAY[]::text[]) AS tournament_ids
     FROM go_v2_tournament_state state
     JOIN go_v2_schedule_versions version ON version.id = state.active_schedule_version_id
     JOIN go_v2_schedule_session_tournaments member ON member.session_id = version.session_id
     JOIN go_v2_tournament_state member_state
       ON member_state.tournament_id = member.tournament_id
      AND member_state.active_schedule_version_id = version.id
     WHERE state.tournament_id = $1
     GROUP BY version.id
     HAVING count(member.tournament_id) = (
       SELECT count(*) FROM go_v2_schedule_session_tournaments expected
       WHERE expected.session_id = version.session_id
     )`,
    [input.tournamentId],
  );
  if (!sessionResult.rowCount) {
    throw new GoV2Error(409, 'ACTIVE_SCHEDULE_SESSION_REQUIRED', 'A disruption requires an active published schedule session');
  }
  const scheduleSessionId = String(sessionResult.rows[0].session_id);
  const scheduleVersionId = String(sessionResult.rows[0].schedule_version_id);
  const sessionTournamentIds = Array.isArray(sessionResult.rows[0].tournament_ids)
    ? sessionResult.rows[0].tournament_ids.map(String)
    : [];
  const sessionTournamentVersions = record(sessionResult.rows[0].tournament_versions);
  if (courtId) {
    const membership = await client.query(
      `SELECT 1
       FROM go_v2_schedule_session_courts session_court
       WHERE session_court.session_id = $1 AND session_court.court_id = $2
       LIMIT 1`,
      [scheduleSessionId, courtId],
    );
    if (!membership.rowCount) {
      throw new GoV2Error(404, 'COURT_NOT_IN_TOURNAMENT_SESSION', 'Court does not belong to this tournament schedule');
    }
  }
  if (matchId) {
    const membership = await client.query(
      `SELECT 1
       FROM go_v2_schedule_assignments assignment
       JOIN go_v2_matches match ON match.id = assignment.match_id
       WHERE assignment.schedule_version_id = $1
         AND match.id = $2
         AND match.tournament_id = ANY($3::uuid[])
       LIMIT 1`,
      [scheduleVersionId, matchId, sessionTournamentIds],
    );
    if (!membership.rowCount) {
      throw new GoV2Error(404, 'MATCH_NOT_IN_TOURNAMENT_SESSION', 'Match does not belong to the active shared schedule session');
    }
  }

  const affected = await client.query(
        `SELECT match.id::text AS match_id, match.tournament_id::text, match.play_state, match.schedule_state,
                assignment.id::text AS schedule_assignment_id,
                assignment.planned_start, assignment.planned_end,
                assignment.actual_start, assignment.actual_end,
                assignment.court_id::text AS court_id
         FROM go_v2_schedule_assignments assignment
         JOIN go_v2_matches match ON match.id = assignment.match_id
         WHERE assignment.schedule_version_id = $1
           AND match.tournament_id = ANY($2::uuid[])
           AND ($3::uuid IS NULL OR assignment.court_id = $3)
           AND ($5::uuid IS NULL OR match.id = $5)
           AND (
             match.play_state IN ('live', 'paused')
             OR COALESCE(assignment.actual_end, assignment.predicted_end, assignment.planned_end) > $4::timestamptz
           )
           -- expected_end_at is advisory only. While the disruption is active,
           -- every match after starts_at remains affected until an explicit
           -- resolve/cancel command closes the hold.
          ORDER BY assignment.planned_start`,
        [scheduleVersionId, sessionTournamentIds, courtId, startsAt, matchId],
      );
  const affectedMatches = affected.rows.map((row) => ({
    matchId: String(row.match_id),
    tournamentId: String(row.tournament_id),
    playState: String(row.play_state),
    scheduleState: String(row.schedule_state),
    scheduleAssignmentId: String(row.schedule_assignment_id),
    courtId: String(row.court_id),
    plannedStart: new Date(row.planned_start).toISOString(),
    plannedEnd: new Date(row.planned_end).toISOString(),
    action: ['live', 'paused'].includes(String(row.play_state))
      ? 'review_incomplete'
      : 'replan',
  }));
  const requiresLiveMatchDecision = affectedMatches.some((match) => ['live', 'paused'].includes(match.playState));
  const requiresScheduleReplan = affectedMatches.length > 0;
  // Creating an urgent safety hold is intentionally an operator action. It may
  // pause a live match, but never decides its result or resumes it; those
  // director-only choices are separate commands.
  const risk: GoV2Risk = requiresScheduleReplan ? 'amber' : 'green';
  const candidate: GoV2DisruptionPreviewDto & Record<string, unknown> = {
    ...input.payload,
    disruptionKind,
    scopeKind,
    courtId,
    matchId,
    startsAt,
    expectedEndAt,
    scheduleSessionId,
    scheduleVersionId,
    sessionTournamentIds,
    sessionTournamentVersions,
    affectedMatches,
    requiresLiveMatchDecision,
    requiresScheduleReplan,
  };
  return {
    risk,
    candidate,
    impact: {
      affectedMatches,
      requiresLiveMatchDecision,
      requiresScheduleReplan,
      automaticScheduleMutation: false,
      nextAction: requiresScheduleReplan ? 'schedule.replan.preview' : 'none',
    },
  };
}

export async function persistGoV2Disruption(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    command: GoV2CommandEnvelope;
    payload: Record<string, unknown>;
    risk: GoV2Risk;
  },
): Promise<Record<string, unknown>> {
  const disruptionKind = String(input.payload.disruptionKind) as GoV2DisruptionKind;
  const scheduleSessionId = assertGoV2Uuid(input.payload.scheduleSessionId, 'scheduleSessionId');
  await client.query(`SELECT id FROM go_v2_schedule_sessions WHERE id = $1 FOR UPDATE`, [scheduleSessionId]);
  // expectedEndAt is an ETA only. A hold remains active and blocking until a
  // director explicitly resolves/cancels it.
  const effectiveNow = Date.parse(String(input.payload.startsAt)) <= Date.now() + 2 * 60_000;
  const inserted = await client.query(
    `INSERT INTO go_v2_schedule_disruptions (
       tournament_id, schedule_session_id, court_id, match_id, scope_kind, disruption_kind,
       starts_at, expected_end_at, reason_code, reason_note, created_by,
       impact_snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING id::text`,
    [
      input.tournamentId,
      scheduleSessionId,
      input.payload.courtId ?? null,
      input.payload.matchId ?? null,
      input.payload.scopeKind,
      disruptionKind,
      input.payload.startsAt,
      input.payload.expectedEndAt ?? null,
      input.command.reasonCode,
      input.command.reasonNote ?? null,
      input.actorId,
      JSON.stringify(input.payload),
    ],
  );
  const disruptionId = String(inserted.rows[0].id);
  const affectedMatches = Array.isArray(input.payload.affectedMatches)
    ? input.payload.affectedMatches.map(record)
    : [];
  const pausedMatchIds: string[] = [];
  for (const match of affectedMatches) {
    await client.query(
      `INSERT INTO go_v2_disruption_matches (
         disruption_id, match_id, prior_schedule_assignment_id, action, risk
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        disruptionId,
        match.matchId,
        match.scheduleAssignmentId ?? null,
        match.action ?? 'replan',
        input.risk,
      ],
    );
    if (effectiveNow && String(match.playState) === 'live') {
      const paused = await client.query(
        `UPDATE go_v2_matches
         SET play_state = 'paused', version = version + 1, updated_at = now()
         WHERE id = $1 AND play_state = 'live'
         RETURNING id::text`,
        [match.matchId],
      );
      if (paused.rowCount) {
        pausedMatchIds.push(String(paused.rows[0].id));
        await client.query(
          `UPDATE go_v2_schedule_assignments
           SET actual_start = COALESCE(actual_start, now())
           WHERE id = $1`,
          [match.scheduleAssignmentId],
        );
        await client.query(
          `INSERT INTO go_v2_live_match_state (match_id, command_version, paused_at, updated_at)
           VALUES ($1, 1, now(), now())
           ON CONFLICT (match_id) DO UPDATE SET
             command_version = go_v2_live_match_state.command_version + 1,
             paused_at = now(), updated_at = now()`,
          [match.matchId],
        );
      }
    }
  }
  return {
    disruptionId,
    disruptionKind,
    affectedMatchIds: affectedMatches.map((match) => String(match.matchId)),
    affectedTournamentIds: [...new Set(affectedMatches.map((match) => String(match.tournamentId)))].sort(),
    pausedMatchIds,
    operatorDecisionRequired: pausedMatchIds.length > 0,
    incompleteResultCreated: false,
    automaticScheduleMutation: false,
    nextActions: [
      ...(pausedMatchIds.length ? ['choose_transfer_or_incomplete'] : []),
      ...(input.payload.requiresScheduleReplan ? ['schedule.replan.preview'] : []),
    ],
  };
}

export async function prepareGoV2DisruptionResolution(
  client: PoolClient,
  input: { tournamentId: string; disruptionId: string; payload: Record<string, unknown> },
): Promise<{
  risk: GoV2Risk;
  candidate: GoV2DisruptionResolutionDto & Record<string, unknown>;
  impact: Record<string, unknown>;
}> {
  const resolution = String(input.payload.resolution ?? 'resolved');
  if (!['resolved', 'cancelled'].includes(resolution)) {
    throw new GoV2Error(422, 'INVALID_DISRUPTION_RESOLUTION', 'resolution must be resolved or cancelled');
  }
  const disruption = await client.query(
    `SELECT disruption.id::text, disruption.tournament_id::text,
            disruption.schedule_session_id::text, disruption.court_id::text,
            disruption.match_id::text, disruption.scope_kind,
            disruption.disruption_kind, disruption.status,
            disruption.starts_at, disruption.expected_end_at,
            min(active_version.id::text) AS active_schedule_version_id,
            COALESCE(array_agg(DISTINCT member.tournament_id::text ORDER BY member.tournament_id::text)
              FILTER (WHERE member.tournament_id IS NOT NULL), ARRAY[]::text[]) AS tournament_ids,
            COALESCE(jsonb_object_agg(member.tournament_id::text, state.aggregate_version)
              FILTER (WHERE member.tournament_id IS NOT NULL), '{}'::jsonb) AS tournament_versions,
            COALESCE(array_agg(DISTINCT affected.match_id::text ORDER BY affected.match_id::text)
              FILTER (WHERE affected.match_id IS NOT NULL), ARRAY[]::text[]) AS affected_match_ids,
            COALESCE(array_agg(DISTINCT paused.id::text ORDER BY paused.id::text)
              FILTER (WHERE paused.id IS NOT NULL), ARRAY[]::text[]) AS paused_match_ids
     FROM go_v2_schedule_disruptions disruption
     JOIN go_v2_schedule_session_tournaments member
       ON member.session_id = disruption.schedule_session_id
     JOIN go_v2_tournament_state state ON state.tournament_id = member.tournament_id
     JOIN go_v2_schedule_versions active_version
       ON active_version.id = state.active_schedule_version_id
      AND active_version.session_id = disruption.schedule_session_id
      AND active_version.status = 'published'
     LEFT JOIN go_v2_disruption_matches affected ON affected.disruption_id = disruption.id
     LEFT JOIN go_v2_matches paused
       ON paused.id = affected.match_id AND paused.play_state = 'paused'
     WHERE disruption.id = $1
       AND EXISTS (
         SELECT 1 FROM go_v2_schedule_session_tournaments requested
         WHERE requested.session_id = disruption.schedule_session_id
           AND requested.tournament_id = $2
       )
     GROUP BY disruption.id
     HAVING count(DISTINCT active_version.id) = 1
        AND count(DISTINCT member.tournament_id) = (
          SELECT count(*)
          FROM go_v2_schedule_session_tournaments expected
          WHERE expected.session_id = disruption.schedule_session_id
        )`,
    [input.disruptionId, input.tournamentId],
  );
  if (!disruption.rowCount) {
    throw new GoV2Error(404, 'DISRUPTION_NOT_FOUND', 'Disruption does not belong to the active shared schedule session');
  }
  const row = disruption.rows[0];
  if (String(row.status) !== 'active') {
    throw new GoV2Error(409, 'DISRUPTION_ALREADY_RESOLVED', 'Only an active disruption can be resolved');
  }
  const sessionTournamentIds = Array.isArray(row.tournament_ids) ? row.tournament_ids.map(String) : [];
  const affectedMatchIds = Array.isArray(row.affected_match_ids) ? row.affected_match_ids.map(String) : [];
  const pausedMatchIds = Array.isArray(row.paused_match_ids) ? row.paused_match_ids.map(String) : [];
  const requiresScheduleReplan = affectedMatchIds.length > 0;
  const candidate: GoV2DisruptionResolutionDto & Record<string, unknown> = {
    ...input.payload,
    disruptionId: input.disruptionId,
    disruptionKind: String(row.disruption_kind),
    scopeKind: String(row.scope_kind),
    courtId: row.court_id ? String(row.court_id) : null,
    matchId: row.match_id ? String(row.match_id) : null,
    resolution: resolution as 'resolved' | 'cancelled',
    scheduleSessionId: String(row.schedule_session_id),
    scheduleVersionId: String(row.active_schedule_version_id),
    affectedTournamentIds: sessionTournamentIds,
    sessionTournamentIds,
    sessionTournamentVersions: record(row.tournament_versions),
    affectedMatchIds,
    pausedMatchIds,
    startsAt: new Date(row.starts_at).toISOString(),
    advisoryExpectedEndAt: row.expected_end_at ? new Date(row.expected_end_at).toISOString() : null,
    resolvedAt: new Date().toISOString(),
    resumesMatchesAutomatically: false,
    requiresScheduleReplan,
  };
  return {
    risk: requiresScheduleReplan || pausedMatchIds.length ? 'amber' : 'green',
    candidate,
    impact: {
      affectedMatchIds,
      pausedMatchIds,
      resumesMatchesAutomatically: false,
      requiresScheduleReplan,
      nextActions: [
        ...(pausedMatchIds.length ? ['match.pause_resolution.preview'] : []),
        ...(requiresScheduleReplan ? ['schedule.replan.preview'] : []),
      ],
    },
  };
}

export async function persistGoV2DisruptionResolution(
  client: PoolClient,
  input: {
    tournamentId: string;
    disruptionId: string;
    actorId: string;
    command: GoV2CommandEnvelope;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  if (input.command.reasonCode !== 'disruption_resolved') {
    throw new GoV2Error(
      422,
      'DISRUPTION_RESOLUTION_REASON_MISMATCH',
      'A disruption resolution must use reasonCode=disruption_resolved',
    );
  }
  const resolution = String(input.payload.resolution);
  const updated = await client.query(
    `UPDATE go_v2_schedule_disruptions disruption
     SET status = $3,
         resolved_at = clock_timestamp(),
         resolved_by = $4
     WHERE disruption.id = $1
       AND disruption.status = 'active'
       AND EXISTS (
         SELECT 1
         FROM go_v2_schedule_session_tournaments member
         JOIN go_v2_tournament_state state ON state.tournament_id = member.tournament_id
         JOIN go_v2_schedule_versions active_version
           ON active_version.id = state.active_schedule_version_id
          AND active_version.session_id = member.session_id
          AND active_version.status = 'published'
         WHERE member.session_id = disruption.schedule_session_id
           AND member.tournament_id = $2
       )
     RETURNING disruption.id::text, disruption.schedule_session_id::text,
               disruption.disruption_kind, disruption.court_id::text,
               disruption.match_id::text, disruption.scope_kind,
               disruption.resolved_at`,
    [input.disruptionId, input.tournamentId, resolution, input.actorId],
  );
  if (!updated.rowCount) {
    throw new GoV2Error(409, 'DISRUPTION_RESOLUTION_STALE', 'Disruption is no longer active');
  }
  const row = updated.rows[0];
  const resolutionLedger = await client.query(
    `INSERT INTO go_v2_disruption_resolutions (
       disruption_id, schedule_session_id, resolution, prior_status,
       resulting_status, affected_snapshot, reason_code, reason_note,
       actor_id, command_id, resolved_at
     ) VALUES ($1, $2, $3, 'active', $3, $4::jsonb, $5, $6, $7, $8, $9)
     RETURNING id::text`,
    [
      input.disruptionId,
      row.schedule_session_id,
      resolution,
      JSON.stringify({
        affectedMatchIds: Array.isArray(input.payload.affectedMatchIds)
          ? input.payload.affectedMatchIds.map(String)
          : [],
        pausedMatchIds: Array.isArray(input.payload.pausedMatchIds)
          ? input.payload.pausedMatchIds.map(String)
          : [],
        sessionTournamentIds: Array.isArray(input.payload.sessionTournamentIds)
          ? input.payload.sessionTournamentIds.map(String)
          : [],
        sessionTournamentVersions: record(input.payload.sessionTournamentVersions),
        advisoryExpectedEndAt: input.payload.advisoryExpectedEndAt ?? null,
      }),
      input.command.reasonCode,
      input.command.reasonNote ?? null,
      input.actorId,
      input.command.commandId,
      row.resolved_at,
    ],
  );
  return {
    disruptionResolutionId: String(resolutionLedger.rows[0].id),
    disruptionId: String(row.id),
    disruptionKind: String(row.disruption_kind),
    scopeKind: String(row.scope_kind),
    courtId: row.court_id ? String(row.court_id) : null,
    matchId: row.match_id ? String(row.match_id) : null,
    scheduleSessionId: String(row.schedule_session_id),
    resolution,
    resolvedAt: new Date(row.resolved_at).toISOString(),
    resumesMatchesAutomatically: false,
    pausedMatchIds: Array.isArray(input.payload.pausedMatchIds)
      ? input.payload.pausedMatchIds.map(String)
      : [],
    requiresScheduleReplan: input.payload.requiresScheduleReplan === true,
    nextActions: [
      ...(Array.isArray(input.payload.pausedMatchIds) && input.payload.pausedMatchIds.length
        ? ['match.pause_resolution.preview']
        : []),
      ...(input.payload.requiresScheduleReplan === true ? ['schedule.replan.preview'] : []),
    ],
  };
}

export async function persistGoV2PauseResolution(
  client: PoolClient,
  input: {
    tournamentId: string;
    matchId: string;
    actorId: string;
    command: GoV2CommandEnvelope;
    payload: Record<string, unknown>;
    successorScheduleVersionId?: string | null;
    successorScheduleAssignmentId?: string | null;
  },
): Promise<GoV2PauseResolutionDto & Record<string, unknown>> {
  const decision = String(input.payload.decision);
  const expectedReasonCode = decision === 'transfer'
    ? 'live_match_transfer'
    : decision === 'defer'
      ? 'match_pause_deferred'
      : 'match_pause_resume_authorized';
  if (input.command.reasonCode !== expectedReasonCode) {
    throw new GoV2Error(422, 'PAUSE_RESOLUTION_REASON_MISMATCH', `reasonCode must be ${expectedReasonCode}`);
  }
  const locked = await client.query(
    `SELECT match.play_state,
             assignment.id::text AS assignment_id,
             assignment.court_id::text AS source_court_id,
             assignment.schedule_version_id::text AS schedule_version_id,
             assignment.actual_start,
             version.session_id::text AS schedule_session_id,
             COALESCE(live.command_version, 0) AS command_version,
             COALESCE(live.live_score, '{}'::jsonb) AS live_score,
             live.started_at
     FROM go_v2_matches match
     JOIN go_v2_schedule_assignments assignment
       ON assignment.match_id = match.id
      AND assignment.schedule_version_id = $3
     JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
     JOIN go_v2_live_match_state live ON live.match_id = match.id
     WHERE match.id = $1 AND match.tournament_id = $2
     FOR UPDATE OF match, assignment, live`,
    [input.matchId, input.tournamentId, input.payload.priorScheduleVersionId],
  );
  if (!locked.rowCount || String(locked.rows[0].play_state) !== 'paused') {
    throw new GoV2Error(409, 'PAUSE_RESOLUTION_STALE', 'Match is no longer paused on the previewed schedule assignment');
  }
  const priorCommandVersion = Number(locked.rows[0].command_version);
  if (priorCommandVersion !== Number(input.payload.priorCommandVersion)) {
    throw new GoV2Error(409, 'PAUSE_RESOLUTION_STALE', 'Judge state changed after pause resolution preview');
  }
  const transfer = decision === 'transfer';
  if (transfer && (!input.successorScheduleVersionId || !input.successorScheduleAssignmentId)) {
    throw new GoV2Error(409, 'TRANSFER_SUCCESSOR_REQUIRED', 'A transfer requires a published successor assignment');
  }
  const resultingCommandVersion = priorCommandVersion + (transfer ? 1 : 0);
  if (transfer) {
    await client.query(
      `UPDATE go_v2_live_match_state
       SET command_version = $2,
           active_device_id = NULL,
           paused_at = COALESCE(paused_at, now()),
           updated_at = now()
       WHERE match_id = $1`,
      [input.matchId, resultingCommandVersion],
    );
  }
  const inserted = await client.query(
    `INSERT INTO go_v2_match_pause_resolutions (
       tournament_id, schedule_session_id, match_id, disruption_id,
       decision, source_court_id, target_court_id,
       prior_schedule_version_id, successor_schedule_version_id,
       prior_schedule_assignment_id, successor_schedule_assignment_id,
       prior_command_version, resulting_command_version,
       reason_code, reason_note, actor_id, command_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id::text, created_at`,
    [
      input.tournamentId,
      locked.rows[0].schedule_session_id,
      input.matchId,
      input.payload.disruptionId ?? null,
      decision,
      locked.rows[0].source_court_id,
      transfer ? input.payload.targetCourtId : null,
      locked.rows[0].schedule_version_id,
      input.successorScheduleVersionId ?? null,
      locked.rows[0].assignment_id,
      input.successorScheduleAssignmentId ?? null,
      priorCommandVersion,
      resultingCommandVersion,
      input.command.reasonCode,
      input.command.reasonNote ?? null,
      input.actorId,
      input.command.commandId,
    ],
  );
  const pauseResolutionId = String(inserted.rows[0].id);
  const latestDefer = await client.query(
    `SELECT id::text, action
     FROM go_v2_schedule_defer_overrides
     WHERE match_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [input.matchId],
  );
  let deferOverrideId: string | null = null;
  if (decision === 'defer') {
    const deferMode = String(input.payload.deferMode ?? 'not_before');
    const notBefore = String(input.payload.notBefore ?? input.payload.resumeNotBefore ?? '');
    const defer = await client.query(
      `INSERT INTO go_v2_schedule_defer_overrides (
         tournament_id, schedule_session_id, match_id, action, defer_mode,
         not_before, pause_resolution_id, supersedes_id,
         reason_code, reason_note, actor_id, command_id
       ) VALUES ($1, $2, $3, 'defer', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id::text`,
      [
        input.tournamentId,
        locked.rows[0].schedule_session_id,
        input.matchId,
        deferMode,
        notBefore,
        pauseResolutionId,
        latestDefer.rows[0]?.id ?? null,
        input.command.reasonCode,
        input.command.reasonNote ?? null,
        input.actorId,
        input.command.commandId,
      ],
    );
    deferOverrideId = String(defer.rows[0].id);
  } else if (latestDefer.rowCount && String(latestDefer.rows[0].action) === 'defer') {
    const released = await client.query(
      `INSERT INTO go_v2_schedule_defer_overrides (
         tournament_id, schedule_session_id, match_id, action,
         pause_resolution_id, supersedes_id,
         reason_code, reason_note, actor_id, command_id
       ) VALUES ($1, $2, $3, 'release', $4, $5, $6, $7, $8, $9)
       RETURNING id::text`,
      [
        input.tournamentId,
        locked.rows[0].schedule_session_id,
        input.matchId,
        pauseResolutionId,
        latestDefer.rows[0].id,
        input.command.reasonCode,
        input.command.reasonNote ?? null,
        input.actorId,
        input.command.commandId,
      ],
    );
    deferOverrideId = String(released.rows[0].id);
  }

  let courtSegmentId: string | null = null;
  if (transfer) {
    const lineup = await client.query(
      `SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'slotNo', source.slot_no,
                'entryId', COALESCE(source.resolved_entry_id, source.source_entry_id),
                'rosterRevisionId', entry.current_roster_revision_id
              ) ORDER BY source.slot_no), '[]'::jsonb) AS value
       FROM go_v2_match_slot_sources source
       LEFT JOIN go_v2_entries entry
         ON entry.id = COALESCE(source.resolved_entry_id, source.source_entry_id)
       WHERE source.match_id = $1 AND source.slot_no IN (1, 2)`,
      [input.matchId],
    );
    const lineupSnapshot = lineup.rows[0]?.value ?? [];
    await client.query(
      `INSERT INTO go_v2_match_court_segments (
         tournament_id, schedule_session_id, match_id, segment_no,
         schedule_version_id, schedule_assignment_id, court_id,
         started_at, opening_score, lineup_snapshot, created_by
       )
       SELECT $1, $2, $3, 1, $4, $5, $6,
              COALESCE($7::timestamptz, $8::timestamptz, clock_timestamp()),
              $9::jsonb, $10::jsonb, $11
       WHERE NOT EXISTS (
         SELECT 1 FROM go_v2_match_court_segments WHERE match_id = $3
       )`,
      [
        input.tournamentId,
        locked.rows[0].schedule_session_id,
        input.matchId,
        locked.rows[0].schedule_version_id,
        locked.rows[0].assignment_id,
        locked.rows[0].source_court_id,
        locked.rows[0].actual_start,
        locked.rows[0].started_at,
        JSON.stringify(record(locked.rows[0].live_score)),
        JSON.stringify(lineupSnapshot),
        input.actorId,
      ],
    );
    await client.query(
      `UPDATE go_v2_match_court_segments
       SET ended_at = COALESCE(ended_at, clock_timestamp()),
           closing_score = COALESCE(closing_score, $2::jsonb)
       WHERE match_id = $1 AND ended_at IS NULL`,
      [input.matchId, JSON.stringify(record(locked.rows[0].live_score))],
    );
    const targetSegment = await client.query(
      `INSERT INTO go_v2_match_court_segments (
         tournament_id, schedule_session_id, match_id, segment_no,
         schedule_version_id, schedule_assignment_id, court_id,
         pause_resolution_id, opening_score, lineup_snapshot, created_by
       ) VALUES (
         $1, $2, $3,
         COALESCE((SELECT max(segment_no) + 1 FROM go_v2_match_court_segments WHERE match_id = $3), 1),
         $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10
       )
       RETURNING id::text`,
      [
        input.tournamentId,
        locked.rows[0].schedule_session_id,
        input.matchId,
        input.successorScheduleVersionId,
        input.successorScheduleAssignmentId,
        input.payload.targetCourtId,
        pauseResolutionId,
        JSON.stringify(record(locked.rows[0].live_score)),
        JSON.stringify(lineupSnapshot),
        input.actorId,
      ],
    );
    courtSegmentId = String(targetSegment.rows[0].id);
  }
  return {
    pauseResolutionId,
    matchId: input.matchId,
    disruptionId: input.payload.disruptionId ? String(input.payload.disruptionId) : null,
    decision: decision as GoV2PauseResolutionDto['decision'],
    scheduleSessionId: String(locked.rows[0].schedule_session_id),
    sourceCourtId: String(locked.rows[0].source_court_id),
    targetCourtId: transfer ? String(input.payload.targetCourtId) : null,
    priorScheduleVersionId: String(locked.rows[0].schedule_version_id),
    successorScheduleVersionId: input.successorScheduleVersionId ?? null,
    priorCommandVersion,
    resultingCommandVersion,
    judgeResumeRequired: decision === 'resume_same_court' || transfer,
    scheduleHash: transfer ? String(input.payload.independentValidation
      ? record(input.payload.independentValidation).scheduleHash ?? ''
      : '') || null : null,
    createdAt: new Date(inserted.rows[0].created_at).toISOString(),
    deferOverrideId,
    courtSegmentId,
    requiresScheduleReplan: decision === 'defer',
    playState: 'paused',
    automaticResume: false,
  };
}

function grantRequestHash(
  operation: 'court_grant.issue' | 'court_grant.rotate' | 'court_grant.revoke',
  tournamentId: string,
  courtId: string,
  command: GoV2CommandEnvelope,
  grantId?: string,
): string {
  return hash({
    operation,
    tournamentId,
    courtId,
    grantId: grantId ?? null,
    expectedVersion: command.expectedVersion,
    commandId: command.commandId,
    deviceId: command.deviceId,
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote ?? null,
    payload: command.payload,
  });
}

async function assertCourtSessionMembership(
  client: PoolClient,
  tournamentId: string,
  courtId: string,
): Promise<string> {
  const court = await client.query(
    `SELECT session.id::text AS session_id
     FROM go_v2_tournament_state state
     JOIN go_v2_schedule_versions version ON version.id = state.active_schedule_version_id
     JOIN go_v2_schedule_sessions session ON session.id = version.session_id
     JOIN go_v2_schedule_session_tournaments member
       ON member.session_id = session.id AND member.tournament_id = state.tournament_id
     JOIN go_v2_schedule_session_courts session_court ON session_court.session_id = session.id
     WHERE session_court.court_id = $1 AND state.tournament_id = $2
     LIMIT 1`,
    [courtId, tournamentId],
  );
  if (!court.rowCount) {
    throw new GoV2Error(404, 'COURT_NOT_IN_TOURNAMENT_SESSION', 'Court does not belong to this tournament schedule');
  }
  return String(court.rows[0].session_id);
}

export async function issueGoV2CourtGrant(
  tournamentIdRaw: string,
  courtIdRaw: string,
  body: unknown,
  actor: GoV2ActorContext,
  rotatedFromGrantIdRaw?: string,
): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const courtId = assertGoV2Uuid(courtIdRaw, 'courtId');
  const rotatedFromGrantId = rotatedFromGrantIdRaw
    ? assertGoV2Uuid(rotatedFromGrantIdRaw, 'grantId')
    : undefined;
  const operation = rotatedFromGrantId ? 'court_grant.rotate' : 'court_grant.issue';
  const command = parseGoV2CommandEnvelope(body);
  const requestHash = grantRequestHash(operation, tournamentId, courtId, command, rotatedFromGrantId);
  assertDeclaredHash(command.requestHash, requestHash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.commandId);
    if (receipt) {
      assertReceiptMatches(receipt, operation, requestHash);
      const receiptResult = record(receipt.responsePayload.result);
      const receiptGrantId = String(receiptResult.grantId ?? '');
      const receiptDeviceId = String(receiptResult.deviceId ?? '');
      const activeGrant = await client.query(
        `SELECT token_hash, token_prefix, expires_at
         FROM go_v2_court_grants
         WHERE id = $1 AND tournament_id = $2 AND court_id = $3
           AND device_id = $4 AND revoked_at IS NULL AND expires_at > now()`,
        [receiptGrantId, tournamentId, courtId, receiptDeviceId],
      );
      if (!activeGrant.rowCount) {
        throw new GoV2Error(
          409,
          'COURT_GRANT_REPLAY_REQUIRES_ROTATION',
          'The issued court grant is no longer active; rotate it instead of replaying its token',
          { grantId: receiptGrantId || null, rotateRequired: true },
        );
      }
      const replayToken = deriveGoV2CourtGrantToken(
        goV2CourtGrantTokenSecret(),
        receiptGrantId,
        command.commandId,
        receiptDeviceId,
      );
      if (createHash('sha256').update(replayToken).digest('hex') !== String(activeGrant.rows[0].token_hash)) {
        throw new GoV2Error(
          409,
          'COURT_GRANT_SECRET_CHANGED',
          'The active token cannot be reconstructed with the current server secret; rotate the grant',
          { grantId: receiptGrantId, rotateRequired: true },
        );
      }
      return {
        ...receipt.responsePayload,
        replayed: true,
        result: {
          ...receiptResult,
          token: replayToken,
          tokenPrefix: String(activeGrant.rows[0].token_prefix),
          expiresAt: new Date(activeGrant.rows[0].expires_at).toISOString(),
          replayedFromDeterministicReceipt: true,
        },
      };
    }
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    if (!['schedule_published', 'live'].includes(state.lifecycleState)) {
      throw new GoV2Error(409, 'COURT_GRANT_LIFECYCLE_FORBIDDEN', 'Court grants require a published or live schedule');
    }
    const scheduleSessionId = await assertCourtSessionMembership(client, tournamentId, courtId);
    await client.query(
      `UPDATE go_v2_court_grants
       SET revoked_at = now(), revoked_by = $3, revoke_reason = 'expired_rotation_cleanup'
       WHERE schedule_session_id = $1 AND court_id = $2 AND revoked_at IS NULL AND expires_at <= now()`,
      [scheduleSessionId, courtId, actor.id],
    );
    if (rotatedFromGrantId) {
      const revoked = await client.query(
        `UPDATE go_v2_court_grants
         SET revoked_at = now(), revoked_by = $4, revoke_reason = $5
         WHERE id = $1 AND tournament_id = $2 AND court_id = $3
           AND revoked_at IS NULL AND expires_at > now()
         RETURNING id`,
        [rotatedFromGrantId, tournamentId, courtId, actor.id, command.reasonNote ?? 'rotation'],
      );
      if (!revoked.rowCount) throw new GoV2Error(409, 'COURT_GRANT_NOT_ACTIVE', 'Court grant is not active');
    } else {
      const active = await client.query(
        `SELECT id::text, device_id, expires_at
         FROM go_v2_court_grants
         WHERE schedule_session_id = $1 AND court_id = $2 AND revoked_at IS NULL
         FOR UPDATE`,
        [scheduleSessionId, courtId],
      );
      if (active.rowCount) {
        throw new GoV2Error(409, 'COURT_ALREADY_HAS_WRITER', 'Rotate or revoke the active court writer first', {
          grantId: active.rows[0].id,
          deviceId: active.rows[0].device_id,
          expiresAt: active.rows[0].expires_at,
        });
      }
    }

    const ttlMinutes = Number(command.payload.ttlMinutes ?? 480);
    if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < 15 || ttlMinutes > 1440) {
      throw new GoV2Error(422, 'INVALID_GRANT_TTL', 'ttlMinutes must be an integer from 15 to 1440');
    }
    const targetDeviceId = requiredText(command.payload.targetDeviceId, 'targetDeviceId', 128);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(targetDeviceId)) {
      throw new GoV2Error(
        422,
        'INVALID_TARGET_DEVICE_ID',
        'targetDeviceId must contain 3-128 URL-safe characters',
      );
    }
    const grantId = randomUUID();
    const token = deriveGoV2CourtGrantToken(
      goV2CourtGrantTokenSecret(),
      grantId,
      command.commandId,
      targetDeviceId,
    );
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.slice(0, 8);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    const inserted = await client.query(
      `INSERT INTO go_v2_court_grants (
         id, tournament_id, schedule_session_id, court_id, device_id, actor_id, token_hash,
         token_prefix, expires_at, rotated_from_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id::text`,
      [
        grantId,
        tournamentId,
        scheduleSessionId,
        courtId,
        targetDeviceId,
        actor.id,
        tokenHash,
        tokenPrefix,
        expiresAt,
        rotatedFromGrantId ?? null,
      ],
    );
    const nextState = await advanceAggregateVersion(client, tournamentId);
    const result: GoV2CourtGrantIssueResponse = {
      grantId: String(inserted.rows[0].id),
      tournamentId,
      scheduleSessionId,
      courtId,
      deviceId: targetDeviceId,
      token,
      tokenPrefix,
      expiresAt,
      rotatedFromGrantId: rotatedFromGrantId ?? null,
    };
    const response = {
      operation,
      aggregateVersion: nextState.aggregateVersion,
      commandId: command.commandId,
      requestHash,
      deviceId: command.deviceId,
      replayed: false,
      result,
    };
    const redactedResponse = {
      ...response,
      result: {
        grantId: result.grantId,
        tournamentId: result.tournamentId,
        scheduleSessionId: result.scheduleSessionId,
        courtId: result.courtId,
        deviceId: result.deviceId,
        tokenPrefix: result.tokenPrefix,
        expiresAt: result.expiresAt,
        rotatedFromGrantId: result.rotatedFromGrantId,
        tokenPersisted: false,
        tokenStoredInReceipt: false,
        deterministicReplaySupported: true,
      },
    };
    await appendAuditEvent(client, {
      tournamentId,
      aggregateVersion: nextState.aggregateVersion,
      eventType: operation,
      entityType: 'court_grant',
      entityId: result.grantId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote,
      actorId: actor.id,
      idempotencyKey: command.commandId,
      diffPayload: {
        courtId,
        issuerDeviceId: command.deviceId,
        targetDeviceId,
        tokenPrefix,
        expiresAt,
        rotatedFromGrantId: rotatedFromGrantId ?? null,
      },
    });
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.commandId,
      operationKind: operation,
      expectedVersion: command.expectedVersion,
      resultingVersion: nextState.aggregateVersion,
      requestHash,
      responsePayload: redactedResponse,
      actorId: actor.id,
      deviceId: command.deviceId,
      actorRole: actor.role,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}

export async function revokeGoV2CourtGrant(
  tournamentIdRaw: string,
  courtIdRaw: string,
  grantIdRaw: string,
  body: unknown,
  actor: GoV2ActorContext,
): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const courtId = assertGoV2Uuid(courtIdRaw, 'courtId');
  const grantId = assertGoV2Uuid(grantIdRaw, 'grantId');
  const command = parseGoV2CommandEnvelope(body);
  const requestHash = grantRequestHash('court_grant.revoke', tournamentId, courtId, command, grantId);
  assertDeclaredHash(command.requestHash, requestHash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.commandId);
    if (receipt) {
      assertReceiptMatches(receipt, 'court_grant.revoke', requestHash);
      return { ...receipt.responsePayload, replayed: true };
    }
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    const revoked = await client.query(
      `UPDATE go_v2_court_grants
       SET revoked_at = now(), revoked_by = $4, revoke_reason = $5
       WHERE id = $1 AND tournament_id = $2 AND court_id = $3 AND revoked_at IS NULL
       RETURNING token_prefix`,
      [grantId, tournamentId, courtId, actor.id, command.reasonNote ?? 'revoked'],
    );
    if (!revoked.rowCount) throw new GoV2Error(409, 'COURT_GRANT_NOT_ACTIVE', 'Court grant is not active');
    const nextState = await advanceAggregateVersion(client, tournamentId);
    const response = {
      operation: 'court_grant.revoke' as const,
      aggregateVersion: nextState.aggregateVersion,
      commandId: command.commandId,
      requestHash,
      deviceId: command.deviceId,
      replayed: false,
      result: { grantId, courtId, revoked: true },
    };
    await appendAuditEvent(client, {
      tournamentId,
      aggregateVersion: nextState.aggregateVersion,
      eventType: 'court_grant.revoke',
      entityType: 'court_grant',
      entityId: grantId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote,
      actorId: actor.id,
      idempotencyKey: command.commandId,
      diffPayload: { courtId, grantId, tokenPrefix: revoked.rows[0].token_prefix },
    });
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.commandId,
      operationKind: 'court_grant.revoke',
      expectedVersion: command.expectedVersion,
      resultingVersion: nextState.aggregateVersion,
      requestHash,
      responsePayload: response,
      actorId: actor.id,
      deviceId: command.deviceId,
      actorRole: actor.role,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}

function bearerToken(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  const token = normalized.toLowerCase().startsWith('bearer ')
    ? normalized.slice(7).trim()
    : normalized;
  if (token.length < 32 || token.length > 200) {
    throw new GoV2Error(401, 'INVALID_COURT_GRANT', 'Court grant token is missing or invalid');
  }
  return token;
}

function parseJudgeCommand(value: unknown): {
  commandId: string;
  requestHash: string;
  expectedVersion: number;
  deviceId: string;
  kind: GoV2JudgeCommandKind;
  reasonCode: string;
  matchId: string;
  payload: Record<string, unknown>;
} {
  const body = record(value);
  const command = record(body.command);
  const commandId = requiredText(body.commandId, 'commandId', 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(commandId)) {
    throw new GoV2Error(400, 'INVALID_COMMAND_ID', 'commandId must contain 8-200 URL-safe characters');
  }
  const deviceId = requiredText(body.deviceId, 'deviceId', 128);
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new GoV2Error(400, 'INVALID_EXPECTED_VERSION', 'expectedVersion must be a non-negative integer');
  }
  const kind = String(command.type ?? '') as GoV2JudgeCommandKind;
  if (!JUDGE_COMMAND_KINDS.has(kind)) {
    throw new GoV2Error(422, 'INVALID_JUDGE_COMMAND', 'Unsupported judge command');
  }
  const reasonCode = requiredText(body.reasonCode, 'reasonCode', 64);
  if (reasonCode !== JUDGE_REASON_CODES[kind]) {
    throw new GoV2Error(422, 'INVALID_JUDGE_REASON_CODE', 'reasonCode does not match the judge command kind', {
      expectedReasonCode: JUDGE_REASON_CODES[kind],
    });
  }
  const requestHash = String(body.requestHash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(requestHash)) {
    throw new GoV2Error(400, 'INVALID_REQUEST_HASH', 'requestHash must be a SHA-256 hex digest');
  }
  return {
    commandId,
    requestHash,
    expectedVersion,
    deviceId,
    kind,
    reasonCode,
    matchId: assertGoV2Uuid(command.matchId, 'matchId'),
    payload: record(command.payload),
  };
}

async function loadJudgeBlockingHolds(
  client: PoolClient,
  scheduleSessionId: string,
  courtId: string,
  matchId: string | null,
): Promise<GoV2JudgeBlockingHold[]> {
  const holds = await client.query(
    `SELECT disruption.id::text, disruption.disruption_kind,
            disruption.court_id::text, disruption.match_id::text,
            disruption.starts_at, disruption.expected_end_at
     FROM go_v2_schedule_disruptions disruption
     WHERE disruption.status = 'active'
       AND disruption.disruption_kind = ANY($4::text[])
       AND disruption.starts_at <= now() + interval '2 minutes'
       AND (
         disruption.scope_kind = 'session'
         OR (disruption.scope_kind = 'court' AND disruption.court_id = $2)
         OR (disruption.scope_kind = 'match' AND disruption.match_id = $3)
       )
       AND (
         disruption.schedule_session_id = $1
         OR (
           disruption.schedule_session_id IS NULL
           AND EXISTS (
             SELECT 1
             FROM go_v2_schedule_session_tournaments member
             WHERE member.session_id = $1
               AND member.tournament_id = disruption.tournament_id
           )
         )
       )
     ORDER BY disruption.starts_at, disruption.id`,
    [scheduleSessionId, courtId, matchId, [...JUDGE_BLOCKING_DISRUPTIONS]],
  );
  return holds.rows.map((row) => ({
    id: String(row.id),
    disruptionKind: String(row.disruption_kind),
    courtId: row.court_id ? String(row.court_id) : null,
    matchId: row.match_id ? String(row.match_id) : null,
    startsAt: new Date(row.starts_at).toISOString(),
    expectedEndAt: row.expected_end_at ? new Date(row.expected_end_at).toISOString() : null,
  }));
}

async function loadJudgePauseResolutionBlockers(
  client: PoolClient,
  matchId: string,
): Promise<Array<Record<string, unknown>>> {
  const blockers: Array<Record<string, unknown>> = [];
  const pendingDirectorDecision = await client.query(
    `SELECT disruption.id::text, disruption.disruption_kind, disruption.status
     FROM go_v2_disruption_matches affected
     JOIN go_v2_schedule_disruptions disruption ON disruption.id = affected.disruption_id
     WHERE affected.match_id = $1
       AND affected.action = 'review_incomplete'
       AND NOT EXISTS (
         SELECT 1
         FROM go_v2_match_pause_resolutions resolution
         WHERE resolution.match_id = affected.match_id
           AND resolution.disruption_id = affected.disruption_id
       )
     ORDER BY disruption.created_at DESC, disruption.id DESC
     LIMIT 1`,
    [matchId],
  );
  if (pendingDirectorDecision.rowCount) {
    blockers.push({
      code: 'PAUSE_RESOLUTION_REQUIRED',
      message: 'The disruption-paused match requires an explicit director decision before it can resume.',
      disruptionId: String(pendingDirectorDecision.rows[0].id),
      disruptionKind: String(pendingDirectorDecision.rows[0].disruption_kind),
      disruptionStatus: String(pendingDirectorDecision.rows[0].status),
    });
  }

  const activeDefer = await client.query(
    `SELECT override.id::text, override.defer_mode, override.not_before
     FROM go_v2_schedule_defer_overrides override
     WHERE override.match_id = $1
       AND override.action = 'defer'
       AND NOT EXISTS (
         SELECT 1
         FROM go_v2_schedule_defer_overrides successor
         WHERE successor.supersedes_id = override.id
       )
     ORDER BY override.created_at DESC, override.id DESC
     LIMIT 1`,
    [matchId],
  );
  if (activeDefer.rowCount && new Date(activeDefer.rows[0].not_before) > new Date()) {
    blockers.push({
      code: 'MATCH_DEFERRED',
      message: 'The director deferred this match until its committed not-before time.',
      deferOverrideId: String(activeDefer.rows[0].id),
      deferMode: String(activeDefer.rows[0].defer_mode),
      notBefore: new Date(activeDefer.rows[0].not_before).toISOString(),
    });
  }
  return blockers;
}

async function loadJudgeMatchParticipants(
  client: PoolClient,
  matchId: string,
): Promise<Array<Record<string, unknown>>> {
  const slots = await client.query(
    `SELECT source.slot_no, source.source_type, source.route_source_type,
            source.route_source_match_id::text,
            COALESCE(source.resolved_entry_id, source.source_entry_id)::text AS entry_id,
            entry.display_name, entry.tournament_id::text AS entry_tournament_id,
            entry.registration_state, entry.attendance_state,
            predecessor.play_state AS predecessor_play_state
     FROM go_v2_match_slot_sources source
     LEFT JOIN go_v2_entries entry
       ON entry.id = COALESCE(source.resolved_entry_id, source.source_entry_id)
     LEFT JOIN go_v2_matches predecessor ON predecessor.id = source.route_source_match_id
     WHERE source.match_id = $1
     ORDER BY source.slot_no`,
    [matchId],
  );
  return slots.rows.map((row) => ({
    slotNo: Number(row.slot_no),
    sourceType: String(row.source_type),
    routeSourceType: String(row.route_source_type),
    routeSourceMatchId: row.route_source_match_id ? String(row.route_source_match_id) : null,
    entryId: row.entry_id ? String(row.entry_id) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    entryTournamentId: row.entry_tournament_id ? String(row.entry_tournament_id) : null,
    registrationState: row.registration_state ? String(row.registration_state) : null,
    attendanceState: row.attendance_state ? String(row.attendance_state) : null,
    predecessorPlayState: row.predecessor_play_state ? String(row.predecessor_play_state) : null,
  }));
}

function judgeStartReadinessBlockers(
  match: Record<string, unknown>,
  participants: Array<Record<string, unknown>>,
): GoV2JudgeReadinessBlocker[] {
  const blockers: GoV2JudgeReadinessBlocker[] = [];
  if (!['scheduled', 'locked'].includes(String(match.schedule_state))) {
    blockers.push({ code: 'MATCH_NOT_SCHEDULED', message: 'Match is not scheduled in the active schedule version.' });
  }
  if (!['schedule_published', 'live'].includes(String(match.owner_lifecycle_state))) {
    blockers.push({ code: 'OWNER_TOURNAMENT_NOT_LIVE_READY', message: 'The owning tournament has no published live schedule.' });
  }
  if (match.is_conditional === true && String(match.condition_state) !== 'true') {
    blockers.push({
      code: 'MATCH_CONDITION_NOT_ACTIVE',
      message: 'The conditional match is not active; pending/skipped reset finals cannot start.',
    });
  }
  if (participants.length !== 2 || participants.some((participant) => !participant.entryId)) {
    blockers.push({ code: 'MATCH_PARTICIPANTS_UNRESOLVED', message: 'Both match participants must be resolved.' });
  } else if (new Set(participants.map((participant) => String(participant.entryId))).size !== 2) {
    blockers.push({ code: 'MATCH_PARTICIPANTS_DUPLICATED', message: 'Match participants must be distinct.' });
  }
  if (participants.some((participant) => (
    ['MATCH_WINNER', 'MATCH_LOSER'].includes(String(participant.routeSourceType))
    && String(participant.predecessorPlayState) !== 'final'
  ))) {
    blockers.push({ code: 'MATCH_PREDECESSOR_NOT_FINAL', message: 'Every bracket predecessor must be final.' });
  }
  if (participants.some((participant) => (
    participant.entryId && String(participant.entryTournamentId) !== String(match.tournament_id)
  ))) {
    blockers.push({ code: 'MATCH_PARTICIPANT_TOURNAMENT_MISMATCH', message: 'A resolved participant belongs to another tournament.' });
  }
  if (participants.some((participant) => participant.entryId && String(participant.registrationState) !== 'confirmed')) {
    blockers.push({ code: 'MATCH_PARTICIPANT_INELIGIBLE', message: 'Both participants must remain eligible and confirmed.' });
  }
  if (participants.some((participant) => participant.entryId && String(participant.attendanceState) !== 'checked_in')) {
    blockers.push({ code: 'MATCH_PARTICIPANT_NOT_CHECKED_IN', message: 'Both participants must be checked in.' });
  }
  return blockers;
}

async function loadCourtLaneConflict(
  client: PoolClient,
  scheduleSessionId: string,
  courtId: string,
  excludedMatchId: string,
): Promise<{ matchId: string; matchKey: string; playState: string } | null> {
  const conflict = await client.query(
    `SELECT DISTINCT match.id::text AS match_id, match.match_key, match.play_state
     FROM go_v2_schedule_assignments assignment
     JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
     JOIN go_v2_matches match ON match.id = assignment.match_id
     WHERE version.session_id = $1
       AND version.status = 'published'
       AND assignment.court_id = $2
       AND match.id <> $3
       AND match.play_state IN ('live', 'paused')
     ORDER BY match.id
     LIMIT 1`,
    [scheduleSessionId, courtId, excludedMatchId],
  );
  return conflict.rowCount
    ? {
        matchId: String(conflict.rows[0].match_id),
        matchKey: String(conflict.rows[0].match_key),
        playState: String(conflict.rows[0].play_state),
      }
    : null;
}

/**
 * Serializes the physical player lane across every tournament in a shared
 * ScheduleSession. Entry locks cover local/anonymous rosters; player locks
 * cover the same registered person appearing in different entries/divisions.
 */
export async function assertGoV2RuntimePlayerMutex(
  client: PoolClient,
  input: {
    scheduleSessionId: string;
    matchId: string;
    participants: Array<Record<string, unknown>>;
  },
): Promise<void> {
  const entryIds = [...new Set(input.participants
    .map((participant) => String(participant.entryId ?? ''))
    .filter(Boolean))].sort();
  if (entryIds.length !== 2) {
    throw new GoV2Error(409, 'MATCH_PARTICIPANTS_UNRESOLVED', 'Exactly two resolved entries are required');
  }
  const lockedEntries = await client.query(
    `SELECT id::text
     FROM go_v2_entries
     WHERE id = ANY($1::uuid[])
     ORDER BY id
     FOR UPDATE`,
    [entryIds],
  );
  if (lockedEntries.rowCount !== entryIds.length) {
    throw new GoV2Error(409, 'MATCH_PARTICIPANTS_UNRESOLVED', 'A resolved entry no longer exists');
  }
  const sessionSize = await client.query(
    `SELECT count(*)::int AS tournament_count
     FROM go_v2_schedule_session_tournaments
     WHERE session_id = $1`,
    [input.scheduleSessionId],
  );
  const roster = await client.query(
    `SELECT entry.id::text AS entry_id, member.member_order,
            member.player_id::text AS player_id
     FROM go_v2_entries entry
     LEFT JOIN go_v2_roster_revision_members member
       ON member.roster_revision_id = entry.current_roster_revision_id
     WHERE entry.id = ANY($1::uuid[])
     ORDER BY entry.id, member.member_order`,
    [entryIds],
  );
  const rosterEntries = new Set(roster.rows
    .filter((row) => row.member_order != null)
    .map((row) => String(row.entry_id)));
  const rosterMemberCounts = new Map<string, number>();
  for (const row of roster.rows) {
    if (row.member_order == null) continue;
    const entryId = String(row.entry_id);
    rosterMemberCounts.set(entryId, (rosterMemberCounts.get(entryId) ?? 0) + 1);
  }
  const missingIdentity = roster.rows.some((row) => row.member_order != null && !row.player_id)
    || entryIds.some((entryId) => !rosterEntries.has(entryId) || rosterMemberCounts.get(entryId) !== 2);
  if (Number(sessionSize.rows[0]?.tournament_count ?? 0) > 1 && missingIdentity) {
    throw new GoV2Error(
      409,
      'PLAYER_IDENTITY_REQUIRED_FOR_SHARED_SESSION',
      'Every participant needs a linked player identity before starting a match in a shared session',
      { entryIds },
    );
  }
  const playerIds = [...new Set(roster.rows
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
      throw new GoV2Error(409, 'PLAYER_IDENTITY_STALE', 'A roster player identity no longer exists');
    }
  }
  const conflict = await client.query(
    `SELECT DISTINCT active_match.id::text AS match_id,
            active_match.match_key,
            active_match.play_state,
            active_match.tournament_id::text AS tournament_id
     FROM go_v2_schedule_versions version
     JOIN go_v2_schedule_assignments assignment
       ON assignment.schedule_version_id = version.id
     JOIN go_v2_matches active_match ON active_match.id = assignment.match_id
     JOIN go_v2_match_slot_sources source ON source.match_id = active_match.id
     JOIN go_v2_entries active_entry
       ON active_entry.id = COALESCE(source.resolved_entry_id, source.source_entry_id)
     LEFT JOIN go_v2_roster_revision_members active_member
       ON active_member.roster_revision_id = active_entry.current_roster_revision_id
     WHERE version.session_id = $1
       AND version.status = 'published'
       AND active_match.id <> $2
       AND active_match.play_state IN ('live', 'paused')
       AND (
         active_entry.id = ANY($3::uuid[])
         OR (
           cardinality($4::uuid[]) > 0
           AND active_member.player_id = ANY($4::uuid[])
         )
       )
     ORDER BY active_match.id
     LIMIT 1`,
    [input.scheduleSessionId, input.matchId, entryIds, playerIds],
  );
  if (conflict.rowCount) {
    throw new GoV2Error(
      409,
      'PLAYER_LANE_OCCUPIED',
      'An entry or player is already in another live/paused match in this shared session',
      {
        conflict: {
          matchId: String(conflict.rows[0].match_id),
          matchKey: String(conflict.rows[0].match_key),
          playState: String(conflict.rows[0].play_state),
          tournamentId: String(conflict.rows[0].tournament_id),
        },
      },
    );
  }
}

async function markGoV2CourtSegmentStarted(
  client: PoolClient,
  input: {
    tournamentId: string;
    scheduleSessionId: string;
    matchId: string;
    scheduleVersionId: string;
    scheduleAssignmentId: string;
    courtId: string;
    participants: Array<Record<string, unknown>>;
    liveScore: Record<string, unknown>;
    actorId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO go_v2_match_court_segments (
       tournament_id, schedule_session_id, match_id, segment_no,
       schedule_version_id, schedule_assignment_id, court_id,
       started_at, opening_score, lineup_snapshot, created_by
     ) VALUES (
       $1, $2, $3,
       COALESCE((SELECT max(segment_no) + 1 FROM go_v2_match_court_segments WHERE match_id = $3), 1),
       $4, $5, $6, clock_timestamp(), $7::jsonb, $8::jsonb, $9
     )
     ON CONFLICT DO NOTHING`,
    [
      input.tournamentId,
      input.scheduleSessionId,
      input.matchId,
      input.scheduleVersionId,
      input.scheduleAssignmentId,
      input.courtId,
      JSON.stringify(input.liveScore),
      JSON.stringify(input.participants.map((participant) => ({
        slotNo: Number(participant.slotNo),
        entryId: participant.entryId ? String(participant.entryId) : null,
        displayName: participant.displayName ? String(participant.displayName) : null,
      }))),
      input.actorId,
    ],
  );
  const started = await client.query(
    `UPDATE go_v2_match_court_segments
     SET started_at = COALESCE(started_at, clock_timestamp())
     WHERE match_id = $1 AND schedule_assignment_id = $2 AND ended_at IS NULL
     RETURNING id`,
    [input.matchId, input.scheduleAssignmentId],
  );
  if (started.rowCount !== 1) {
    throw new GoV2Error(
      409,
      'COURT_SEGMENT_START_CONFLICT',
      'The active court segment does not match the published match assignment',
    );
  }
}

export async function applyGoV2JudgeCommand(
  tournamentIdRaw: string,
  rawToken: string | null | undefined,
  body: unknown,
): Promise<GoV2JudgeCommandReceipt> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const token = bearerToken(rawToken);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const command = parseJudgeCommand(body);
  const requestHash = hash({ tournamentId, ...command, requestHash: undefined });
  assertDeclaredHash(command.requestHash, requestHash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const grant = await client.query(
      `SELECT id::text, court_id::text, schedule_session_id::text, device_id, expires_at
       FROM go_v2_court_grants
       WHERE tournament_id = $1 AND token_hash = $2 AND revoked_at IS NULL
       FOR UPDATE`,
      [tournamentId, tokenHash],
    );
    if (!grant.rowCount || new Date(grant.rows[0].expires_at) <= new Date()) {
      throw new GoV2Error(401, 'COURT_GRANT_EXPIRED', 'Court grant is invalid, expired or revoked');
    }
    if (String(grant.rows[0].device_id) !== command.deviceId) {
      throw new GoV2Error(409, 'COURT_GRANT_DEVICE_MISMATCH', 'Court grant belongs to another device');
    }
    const grantId = String(grant.rows[0].id);
    const courtId = String(grant.rows[0].court_id);
    const scheduleSessionId = String(grant.rows[0].schedule_session_id);
    const priorReceipt = await client.query(
      `SELECT request_hash, response_payload
       FROM go_v2_judge_command_journal
       WHERE tournament_id = $1 AND command_id = $2`,
      [tournamentId, command.commandId],
    );
    if (priorReceipt.rowCount) {
      if (String(priorReceipt.rows[0].request_hash) !== requestHash) {
        throw new GoV2Error(409, 'COMMAND_ID_REUSED', 'commandId was already used for another judge command');
      }
      return { ...record(priorReceipt.rows[0].response_payload), replayed: true } as unknown as GoV2JudgeCommandReceipt;
    }

    const rate = await client.query(
      `INSERT INTO go_v2_court_grant_rate_limits (grant_id, window_started_at, request_count)
       VALUES ($1, date_trunc('minute', clock_timestamp()), 1)
       ON CONFLICT (grant_id, window_started_at)
       DO UPDATE SET request_count = go_v2_court_grant_rate_limits.request_count + 1
       RETURNING request_count`,
      [grantId],
    );
    if (Number(rate.rows[0].request_count) > 120) {
      throw new GoV2Error(429, 'COURT_GRANT_RATE_LIMITED', 'Too many court commands; retry after the current minute');
    }

    if (['match.start', 'match.resume'].includes(command.kind)) {
      // A physical court row is the cross-tournament lane mutex. The ordinary
      // tournament advisory lock alone cannot serialize two divisions sharing
      // one ScheduleSession.
      await client.query(`SELECT id FROM go_v2_courts WHERE id = $1 FOR UPDATE`, [courtId]);
    }

    const match = await client.query(
      `SELECT match.id::text, match.tournament_id::text, match.play_state,
              match.schedule_state, match.is_conditional, match.condition_state,
              assignment.id::text AS assignment_id,
              assignment.schedule_version_id::text AS schedule_version_id,
              version.session_id::text AS schedule_session_id,
              COALESCE(NULLIF(match.match_rule, '{}'::jsonb), stage.match_rule) AS match_rule,
              owner_state.lifecycle_state AS owner_lifecycle_state
       FROM go_v2_matches match
       JOIN go_v2_schedule_assignments assignment
         ON assignment.match_id = match.id
       JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
       JOIN go_v2_tournament_state grant_state
         ON grant_state.tournament_id = $1
        AND grant_state.active_schedule_version_id = assignment.schedule_version_id
       JOIN go_v2_stages stage ON stage.id = match.stage_id
       JOIN go_v2_tournament_state owner_state ON owner_state.tournament_id = match.tournament_id
       WHERE match.id = $2
         AND match.tournament_id = $1
         AND assignment.court_id = $3
         AND version.session_id = $4
       FOR UPDATE OF match, assignment`,
      [tournamentId, command.matchId, courtId, scheduleSessionId],
    );
    if (!match.rowCount) {
      throw new GoV2Error(403, 'MATCH_OUTSIDE_COURT_GRANT', 'Match is not assigned to this court in the active schedule');
    }
    await client.query(
      `INSERT INTO go_v2_live_match_state (match_id)
       VALUES ($1) ON CONFLICT (match_id) DO NOTHING`,
      [command.matchId],
    );
    const live = await client.query(
      `SELECT command_version, live_score, finish_requested
       FROM go_v2_live_match_state WHERE match_id = $1 FOR UPDATE`,
      [command.matchId],
    );
    const currentVersion = Number(live.rows[0].command_version);
    if (currentVersion !== command.expectedVersion) {
      throw new GoV2Error(409, 'JUDGE_COMMAND_VERSION_CONFLICT', 'Judge command is based on a stale match version', {
        expectedVersion: command.expectedVersion,
        actualVersion: currentVersion,
      });
    }
    const currentPlayState = String(match.rows[0].play_state);
    let nextPlayState = currentPlayState;
    let liveScore = record(live.rows[0].live_score);
    let finishReviewRequired = Boolean(live.rows[0].finish_requested);
    let proposedWinnerEntryId: string | null = null;
    if (command.kind === 'match.start') {
      if (!['pending', 'ready'].includes(currentPlayState)) {
        throw new GoV2Error(409, 'MATCH_START_STATE_FORBIDDEN', `Cannot start a match from ${currentPlayState}`);
      }
      const participants = await loadJudgeMatchParticipants(client, command.matchId);
      const blockers = judgeStartReadinessBlockers(match.rows[0], participants);
      const blockingHolds = await loadJudgeBlockingHolds(client, scheduleSessionId, courtId, command.matchId);
      if (blockingHolds.length) {
        blockers.push({ code: 'ACTIVE_SCHEDULE_DISRUPTION', message: 'An active hold blocks match start on this court.' });
      }
      const laneConflict = await loadCourtLaneConflict(client, scheduleSessionId, courtId, command.matchId);
      if (laneConflict) {
        blockers.push({ code: 'COURT_LANE_OCCUPIED', message: 'Another live or paused match occupies this court.' });
      }
      if (blockers.length) {
        throw new GoV2Error(409, 'MATCH_NOT_READY', 'The match is not ready to start', {
          blockers,
          blockingHolds,
          laneConflict,
        });
      }
      await assertGoV2RuntimePlayerMutex(client, {
        scheduleSessionId,
        matchId: command.matchId,
        participants,
      });
      nextPlayState = 'live';
      await client.query(
        `UPDATE go_v2_schedule_assignments SET actual_start = COALESCE(actual_start, now()) WHERE id = $1`,
        [match.rows[0].assignment_id],
      );
      await markGoV2CourtSegmentStarted(client, {
        tournamentId: String(match.rows[0].tournament_id),
        scheduleSessionId,
        matchId: command.matchId,
        scheduleVersionId: String(match.rows[0].schedule_version_id),
        scheduleAssignmentId: String(match.rows[0].assignment_id),
        courtId,
        participants,
        liveScore,
        actorId: `judge:${command.deviceId}`,
      });
      const ownerLifecycle = await client.query(
        `UPDATE go_v2_tournament_state
         SET lifecycle_state = 'live', aggregate_version = aggregate_version + 1, updated_at = now()
         WHERE tournament_id = $1 AND lifecycle_state = 'schedule_published'
         RETURNING aggregate_version`,
        [match.rows[0].tournament_id],
      );
      if (ownerLifecycle.rowCount) {
        await appendAuditEvent(client, {
          tournamentId: String(match.rows[0].tournament_id),
          aggregateVersion: Number(ownerLifecycle.rows[0].aggregate_version),
          eventType: 'judge.match.start',
          entityType: 'match',
          entityId: command.matchId,
          reasonCode: command.reasonCode,
          actorId: `judge:${command.deviceId}`,
          idempotencyKey: `judge-start:${grantId}:${command.commandId}`,
          diffPayload: {
            fromLifecycleState: 'schedule_published',
            toLifecycleState: 'live',
            scheduleSessionId,
            courtId,
            grantId,
            deviceId: command.deviceId,
          },
        });
      }
    } else if (command.kind === 'match.pause') {
      if (currentPlayState !== 'live') {
        throw new GoV2Error(409, 'MATCH_PAUSE_STATE_FORBIDDEN', `Cannot pause a match from ${currentPlayState}`);
      }
      nextPlayState = 'paused';
    } else if (command.kind === 'match.resume') {
      if (currentPlayState !== 'paused') {
        throw new GoV2Error(409, 'MATCH_RESUME_STATE_FORBIDDEN', `Cannot resume a match from ${currentPlayState}`);
      }
      const participants = await loadJudgeMatchParticipants(client, command.matchId);
      const readinessBlockers = judgeStartReadinessBlockers(match.rows[0], participants);
      const pauseResolutionBlockers = await loadJudgePauseResolutionBlockers(client, command.matchId);
      readinessBlockers.push(...pauseResolutionBlockers.map((blocker) => ({
        code: String(blocker.code),
        message: String(blocker.message),
      })));
      const blockingHolds = await loadJudgeBlockingHolds(client, scheduleSessionId, courtId, command.matchId);
      if (blockingHolds.length) {
        throw new GoV2Error(409, 'MATCH_RESUME_BLOCKED_BY_DISRUPTION', 'An active hold blocks match resume on this court', {
          blockingHolds,
        });
      }
      const laneConflict = await loadCourtLaneConflict(client, scheduleSessionId, courtId, command.matchId);
      if (laneConflict) {
        throw new GoV2Error(409, 'COURT_LANE_OCCUPIED', 'Another live or paused match occupies this court', {
          laneConflict,
        });
      }
      if (readinessBlockers.length) {
        throw new GoV2Error(409, 'MATCH_RESUME_NOT_READY', 'The paused match is no longer eligible to resume', {
          blockers: readinessBlockers,
          pauseResolutionBlockers,
        });
      }
      await assertGoV2RuntimePlayerMutex(client, {
        scheduleSessionId,
        matchId: command.matchId,
        participants,
      });
      await markGoV2CourtSegmentStarted(client, {
        tournamentId: String(match.rows[0].tournament_id),
        scheduleSessionId,
        matchId: command.matchId,
        scheduleVersionId: String(match.rows[0].schedule_version_id),
        scheduleAssignmentId: String(match.rows[0].assignment_id),
        courtId,
        participants,
        liveScore,
        actorId: `judge:${command.deviceId}`,
      });
      nextPlayState = 'live';
    } else if (command.kind === 'score.replace') {
      if (!['live', 'paused'].includes(currentPlayState)) {
        throw new GoV2Error(409, 'SCORE_STATE_FORBIDDEN', `Cannot edit live score from ${currentPlayState}`);
      }
      const requestedScore = command.payload.liveScore ?? command.payload.score;
      if (JSON.stringify(requestedScore).length > 16_384) {
        throw new GoV2Error(413, 'LIVE_SCORE_TOO_LARGE', 'Live score payload is too large');
      }
      liveScore = validateGoV2JudgeLiveScore(
        match.rows[0].match_rule,
        requestedScore,
        { requireShape: true },
      ).liveScore;
    } else if (command.kind === 'match.finish.request') {
      if (!['live', 'paused'].includes(currentPlayState)) {
        throw new GoV2Error(409, 'FINISH_REQUEST_STATE_FORBIDDEN', `Cannot request finish from ${currentPlayState}`);
      }
      const suppliedScore = command.payload.liveScore ?? command.payload.score;
      if (suppliedScore !== undefined && JSON.stringify(suppliedScore).length > 16_384) {
        throw new GoV2Error(413, 'LIVE_SCORE_TOO_LARGE', 'Live score payload is too large');
      }
      const validatedScore = validateGoV2JudgeLiveScore(
        match.rows[0].match_rule,
        suppliedScore ?? liveScore,
        { requireFinished: true, requireShape: suppliedScore !== undefined },
      );
      liveScore = validatedScore.liveScore;
      const participants = await loadJudgeMatchParticipants(client, command.matchId);
      const winnerSlot = validatedScore.winnerSide === 'A' ? 1 : 2;
      proposedWinnerEntryId = String(
        participants.find((participant) => Number(participant.slotNo) === winnerSlot)?.entryId ?? '',
      ) || null;
      if (!proposedWinnerEntryId) {
        throw new GoV2Error(409, 'MATCH_PARTICIPANTS_UNRESOLVED', 'Cannot request finish without a resolved winner');
      }
      finishReviewRequired = true;
    }
    const resultingVersion = currentVersion + 1;
    if (nextPlayState !== currentPlayState) {
      await client.query(
        `UPDATE go_v2_matches SET play_state = $2, version = version + 1, updated_at = now() WHERE id = $1`,
        [command.matchId, nextPlayState],
      );
    }
    await client.query(
      `UPDATE go_v2_live_match_state
       SET command_version = $2, live_score = $3::jsonb,
           finish_requested = $4, active_device_id = $5,
           started_at = CASE WHEN $6 = 'match.start' THEN COALESCE(started_at, now()) ELSE started_at END,
           paused_at = CASE WHEN $6 = 'match.pause' THEN now() WHEN $6 = 'match.resume' THEN NULL ELSE paused_at END,
           updated_at = now()
       WHERE match_id = $1`,
      [command.matchId, resultingVersion, JSON.stringify(liveScore), finishReviewRequired, command.deviceId, command.kind],
    );
    await client.query(`UPDATE go_v2_court_grants SET last_used_at = now() WHERE id = $1`, [grantId]);
    const response: GoV2JudgeCommandReceipt & { proposedWinnerEntryId?: string | null } = {
      commandId: command.commandId,
      requestHash,
      replayed: false,
      accepted: true,
      resultingVersion,
      matchId: command.matchId,
      playState: nextPlayState,
      liveScore,
      finishReviewRequired,
      ...(command.kind === 'match.finish.request' ? { proposedWinnerEntryId } : {}),
    };
    await client.query(
      `INSERT INTO go_v2_judge_command_journal (
         tournament_id, match_id, court_id, grant_id, command_id, request_hash,
         expected_version, resulting_version, device_id, command_kind,
         reason_code, command_payload, response_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)`,
      [
        tournamentId,
        command.matchId,
        courtId,
        grantId,
        command.commandId,
        requestHash,
        command.expectedVersion,
        resultingVersion,
        command.deviceId,
        command.kind,
        command.reasonCode,
        JSON.stringify(command.payload),
        JSON.stringify(response),
      ],
    );
    return response;
  });
}

export async function getGoV2JudgeCourtState(
  tournamentIdRaw: string,
  rawToken: string | null | undefined,
  deviceIdRaw: string | null | undefined,
): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const token = bearerToken(rawToken);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const deviceId = requiredText(deviceIdRaw, 'x-go-v2-device-id', 128);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const grant = await client.query(
      `SELECT grant.id::text AS grant_id, grant.court_id::text AS court_id,
              grant.schedule_session_id::text, grant.device_id, grant.expires_at,
              court.court_no, court.label AS court_label,
              tournament.name AS tournament_name, tournament.date::text AS tournament_date,
              state.aggregate_version, state.lifecycle_state,
              state.active_schedule_version_id::text AS active_schedule_version_id,
              session.timezone
       FROM go_v2_court_grants grant
       JOIN go_v2_courts court ON court.id = grant.court_id
       JOIN tournaments tournament ON tournament.id = grant.tournament_id
       JOIN go_v2_tournament_state state ON state.tournament_id = grant.tournament_id
       JOIN go_v2_schedule_sessions session ON session.id = grant.schedule_session_id
       JOIN go_v2_schedule_versions active_version
         ON active_version.id = state.active_schedule_version_id
        AND active_version.session_id = grant.schedule_session_id
       WHERE grant.tournament_id = $1 AND grant.token_hash = $2
         AND grant.revoked_at IS NULL AND grant.expires_at > now()`,
      [tournamentId, tokenHash],
    );
    if (!grant.rowCount) {
      throw new GoV2Error(401, 'COURT_GRANT_EXPIRED', 'Court grant is invalid, expired or revoked');
    }
    const grantRow = grant.rows[0];
    if (String(grantRow.device_id) !== deviceId) {
      throw new GoV2Error(409, 'COURT_GRANT_DEVICE_MISMATCH', 'Court grant belongs to another device');
    }
    const matches = await client.query(
      `SELECT match.id::text AS match_id, match.tournament_id::text,
              owner.name AS owner_tournament_name,
              owner_state.lifecycle_state AS owner_lifecycle_state,
              match.match_key, match.play_state,
              match.schedule_state, match.is_conditional, match.condition_state,
              stage.stage_key, stage.stage_type, stage.tier,
              COALESCE(NULLIF(match.match_rule, '{}'::jsonb), stage.match_rule) AS match_rule,
              assignment.planned_start, assignment.planned_end,
              assignment.predicted_start, assignment.predicted_end,
              assignment.actual_start, assignment.actual_end,
              COALESCE(live.command_version, 0) AS command_version,
              COALESCE(live.live_score, '{}'::jsonb) AS live_score,
              COALESCE(live.finish_requested, false) AS finish_requested,
              COALESCE(jsonb_agg(jsonb_build_object(
                'slotNo', source.slot_no,
                'sourceType', source.source_type,
                'routeSourceType', source.route_source_type,
                'routeSourceMatchId', source.route_source_match_id,
                'entryId', entry.id,
                'displayName', entry.display_name,
                'entryTournamentId', entry.tournament_id,
                'registrationState', entry.registration_state,
                'attendanceState', entry.attendance_state,
                'predecessorPlayState', predecessor.play_state
              ) ORDER BY source.slot_no) FILTER (WHERE source.slot_no IS NOT NULL), '[]'::jsonb) AS participants
       FROM go_v2_schedule_assignments assignment
       JOIN go_v2_matches match ON match.id = assignment.match_id
       JOIN go_v2_stages stage ON stage.id = match.stage_id
       JOIN tournaments owner ON owner.id = match.tournament_id
       JOIN go_v2_tournament_state owner_state ON owner_state.tournament_id = match.tournament_id
       LEFT JOIN go_v2_match_slot_sources source ON source.match_id = match.id
       LEFT JOIN go_v2_entries entry
         ON entry.id = COALESCE(source.resolved_entry_id, source.source_entry_id)
       LEFT JOIN go_v2_matches predecessor ON predecessor.id = source.route_source_match_id
       LEFT JOIN go_v2_live_match_state live ON live.match_id = match.id
        WHERE assignment.schedule_version_id = $1
          AND assignment.court_id = $2
          AND match.tournament_id = $3
         AND match.schedule_state NOT IN ('cancelled')
       GROUP BY match.id, stage.id, assignment.id, live.match_id, owner.id, owner_state.tournament_id
       ORDER BY
         CASE match.play_state WHEN 'live' THEN 0 WHEN 'paused' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END,
         COALESCE(assignment.predicted_start, assignment.planned_start)`,
       [grantRow.active_schedule_version_id, grantRow.court_id, tournamentId],
    );
    const blockingHolds = await loadJudgeBlockingHolds(
      client,
      String(grantRow.schedule_session_id),
      String(grantRow.court_id),
      null,
    );
    const matchDtos = await Promise.all(matches.rows.map(async (row) => {
      const participants: Array<Record<string, unknown>> = Array.isArray(row.participants)
        ? (row.participants as unknown[]).map(record)
        : [];
      const blockers = judgeStartReadinessBlockers(row, participants);
      if (!['pending', 'ready'].includes(String(row.play_state))) {
        blockers.push({ code: 'MATCH_START_STATE_FORBIDDEN', message: `Cannot start a match from ${String(row.play_state)}.` });
      }
      const matchBlockingHolds = await loadJudgeBlockingHolds(
        client,
        String(grantRow.schedule_session_id),
        String(grantRow.court_id),
        String(row.match_id),
      );
      const pauseResolutionBlockers = String(row.play_state) === 'paused'
        ? await loadJudgePauseResolutionBlockers(client, String(row.match_id))
        : [];
      if (matchBlockingHolds.length) {
        blockers.push({ code: 'ACTIVE_SCHEDULE_DISRUPTION', message: 'An active hold blocks match start on this court.' });
      }
      blockers.push(...pauseResolutionBlockers.map((blocker) => ({
        code: String(blocker.code),
        message: String(blocker.message),
      })));
      const laneConflict = await loadCourtLaneConflict(
        client,
        String(grantRow.schedule_session_id),
        String(grantRow.court_id),
        String(row.match_id),
      );
      if (laneConflict) {
        blockers.push({ code: 'COURT_LANE_OCCUPIED', message: 'Another live or paused match occupies this court.' });
      }
      const canStart = blockers.length === 0;
      const canResume = String(row.play_state) === 'paused'
        && matchBlockingHolds.length === 0
        && pauseResolutionBlockers.length === 0
        && laneConflict == null;
      return {
        id: String(row.match_id),
        tournamentId: String(row.tournament_id),
        tournamentName: String(row.owner_tournament_name),
        matchKey: String(row.match_key),
        playState: String(row.play_state),
        computedPlayState: String(row.play_state) === 'pending' && canStart ? 'ready' : String(row.play_state),
        scheduleState: String(row.schedule_state),
        isConditional: row.is_conditional === true,
        conditionState: String(row.condition_state),
        stageKey: String(row.stage_key),
        stageType: String(row.stage_type),
        tier: row.tier ? String(row.tier) : null,
        matchRule: record(row.match_rule),
        plannedStart: row.planned_start ? new Date(row.planned_start).toISOString() : null,
        plannedEnd: row.planned_end ? new Date(row.planned_end).toISOString() : null,
        predictedStart: row.predicted_start ? new Date(row.predicted_start).toISOString() : null,
        predictedEnd: row.predicted_end ? new Date(row.predicted_end).toISOString() : null,
        actualStart: row.actual_start ? new Date(row.actual_start).toISOString() : null,
        actualEnd: row.actual_end ? new Date(row.actual_end).toISOString() : null,
        commandVersion: Number(row.command_version),
        liveScore: record(row.live_score),
        finishReviewRequired: row.finish_requested === true,
        participants: participants.map((participant) => ({
          slotNo: Number(participant.slotNo),
          entryId: participant.entryId ? String(participant.entryId) : null,
          displayName: participant.displayName ? String(participant.displayName) : null,
          registrationState: participant.registrationState ? String(participant.registrationState) : null,
          attendanceState: participant.attendanceState ? String(participant.attendanceState) : null,
        })),
        readiness: {
          canStart,
          canResume,
          blockers,
          blockingHolds: matchBlockingHolds,
          pauseResolutionBlockers,
          laneConflict,
        },
      };
    }));
    await client.query('COMMIT');
    return {
      tournament: {
        id: tournamentId,
        name: String(grantRow.tournament_name),
        date: grantRow.tournament_date ? String(grantRow.tournament_date) : null,
        lifecycleState: String(grantRow.lifecycle_state),
        aggregateVersion: Number(grantRow.aggregate_version),
        timezone: String(grantRow.timezone),
      },
      court: {
        id: String(grantRow.court_id),
        courtNo: Number(grantRow.court_no),
        label: String(grantRow.court_label),
      },
      grant: {
        id: String(grantRow.grant_id),
        deviceId,
        expiresAt: new Date(grantRow.expires_at).toISOString(),
      },
      blockingHolds,
      matches: matchDtos,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function approveGoV2RedOperation(
  tournamentIdRaw: string,
  previewIdRaw: string,
  body: unknown,
  actor: GoV2ActorContext,
): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const previewId = assertGoV2Uuid(previewIdRaw, 'previewId');
  const command = parseGoV2CommandEnvelope(body);
  const reviewedInputHash = String(command.payload.reviewedInputHash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(reviewedInputHash)) {
    throw new GoV2Error(400, 'REVIEWED_INPUT_HASH_REQUIRED', 'payload.reviewedInputHash must be the reviewed preview SHA-256 hash');
  }
  const reviewedAggregateVersion = Number(command.payload.reviewedAggregateVersion);
  if (!Number.isSafeInteger(reviewedAggregateVersion) || reviewedAggregateVersion < 0) {
    throw new GoV2Error(400, 'REVIEWED_VERSION_REQUIRED', 'payload.reviewedAggregateVersion must be a non-negative integer');
  }
  const approvalHash = hash({
    operation: 'red_operation.approve',
    tournamentId,
    previewId,
    reviewedInputHash,
    reviewedAggregateVersion,
    expectedVersion: command.expectedVersion,
    commandId: command.commandId,
    deviceId: command.deviceId,
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote ?? null,
  });
  assertDeclaredHash(command.requestHash, approvalHash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.commandId);
    if (receipt) {
      assertReceiptMatches(receipt, 'red_operation.approve', approvalHash);
      return { ...receipt.responsePayload, replayed: true };
    }
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    const preview = await client.query(
      `SELECT aggregate_version, input_hash, risk, created_by, expires_at, consumed_at
       FROM go_v2_operation_previews
       WHERE id = $1 AND tournament_id = $2
       FOR UPDATE`,
      [previewId, tournamentId],
    );
    if (!preview.rowCount) throw new GoV2Error(404, 'PREVIEW_NOT_FOUND', 'Operation preview not found');
    if (String(preview.rows[0].risk) !== 'red') {
      throw new GoV2Error(409, 'RED_APPROVAL_NOT_REQUIRED', 'Only red-risk previews require a second approver');
    }
    if (preview.rows[0].consumed_at || new Date(preview.rows[0].expires_at) <= new Date()) {
      throw new GoV2Error(409, 'PREVIEW_EXPIRED', 'Operation preview is expired or consumed');
    }
    if (Number(preview.rows[0].aggregate_version) !== command.expectedVersion) {
      throw new GoV2Error(409, 'VERSION_CONFLICT', 'Preview version changed before approval');
    }
    if (
      String(preview.rows[0].input_hash) !== reviewedInputHash
      || Number(preview.rows[0].aggregate_version) !== reviewedAggregateVersion
    ) {
      throw new GoV2Error(409, 'REVIEWED_PREVIEW_MISMATCH', 'Approval does not match the preview content and version that was reviewed', {
        reviewedInputHash,
        actualInputHash: String(preview.rows[0].input_hash),
        reviewedAggregateVersion,
        actualAggregateVersion: Number(preview.rows[0].aggregate_version),
      });
    }
    if (String(preview.rows[0].created_by) === actor.id) {
      throw new GoV2Error(409, 'SECOND_APPROVER_REQUIRED', 'The preview author cannot approve their own red operation');
    }
    const existing = await client.query(
      `SELECT id::text, approved_by, expires_at, reviewed_input_hash, reviewed_aggregate_version
       FROM go_v2_red_operation_approvals
       WHERE preview_id = $1`,
      [previewId],
    );
    let response: Record<string, unknown>;
    if (existing.rowCount) {
      response = {
        operation: 'red_operation.approve',
        aggregateVersion: state.aggregateVersion,
        approvalId: String(existing.rows[0].id),
        previewId,
        approvedBy: String(existing.rows[0].approved_by),
        expiresAt: new Date(existing.rows[0].expires_at).toISOString(),
        reviewedInputHash: String(existing.rows[0].reviewed_input_hash),
        reviewedAggregateVersion: Number(existing.rows[0].reviewed_aggregate_version),
        commandId: command.commandId,
        requestHash: approvalHash,
        deviceId: command.deviceId,
        replayed: true,
      };
    } else {
      const expiresAt = new Date(
        Math.min(new Date(preview.rows[0].expires_at).getTime(), Date.now() + 15 * 60_000),
      ).toISOString();
      const inserted = await client.query(
        `INSERT INTO go_v2_red_operation_approvals (
           tournament_id, preview_id, requested_by, approved_by, approved_role,
           command_id, request_hash, reviewed_input_hash, reviewed_aggregate_version,
           device_id, reason_code, reason_note, expires_at
         ) VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id::text`,
        [
          tournamentId,
          previewId,
          preview.rows[0].created_by,
          actor.id,
          command.commandId,
          approvalHash,
          reviewedInputHash,
          reviewedAggregateVersion,
          command.deviceId,
          command.reasonCode,
          command.reasonNote ?? null,
          expiresAt,
        ],
      );
      response = {
        operation: 'red_operation.approve',
        aggregateVersion: state.aggregateVersion,
        approvalId: String(inserted.rows[0].id),
        previewId,
        approvedBy: actor.id,
        expiresAt,
        reviewedInputHash,
        reviewedAggregateVersion,
        commandId: command.commandId,
        requestHash: approvalHash,
        deviceId: command.deviceId,
        replayed: false,
      };
    }
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.commandId,
      operationKind: 'red_operation.approve',
      expectedVersion: command.expectedVersion,
      resultingVersion: state.aggregateVersion,
      requestHash: approvalHash,
      responsePayload: response,
      actorId: actor.id,
      deviceId: command.deviceId,
      actorRole: actor.role,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}

export async function getGoV2RedOperationPreview(
  tournamentIdRaw: string,
  previewIdRaw: string,
): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const previewId = assertGoV2Uuid(previewIdRaw, 'previewId');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await client.query(
      `SELECT preview.operation_kind, preview.aggregate_version, preview.input_hash,
              preview.risk, preview.payload, preview.result, preview.created_by,
              preview.created_at, preview.expires_at, preview.consumed_at,
               approval.id::text AS approval_id, approval.approved_by,
               approval.reviewed_input_hash, approval.reviewed_aggregate_version,
              approval.expires_at AS approval_expires_at,
              approval.consumed_at AS approval_consumed_at
       FROM go_v2_operation_previews preview
       LEFT JOIN go_v2_red_operation_approvals approval ON approval.preview_id = preview.id
       WHERE preview.id = $1 AND preview.tournament_id = $2`,
      [previewId, tournamentId],
    );
    if (!result.rowCount) throw new GoV2Error(404, 'PREVIEW_NOT_FOUND', 'Operation preview not found');
    const row = result.rows[0];
    const previewResult = record(row.result);
    const now = Date.now();
    await client.query('COMMIT');
    return {
      previewId,
      tournamentId,
      operation: String(row.operation_kind),
      aggregateVersion: Number(row.aggregate_version),
      inputHash: String(row.input_hash),
      risk: String(row.risk),
      authorId: String(row.created_by),
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      expired: new Date(row.expires_at).getTime() <= now,
      consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : null,
      payload: record(row.payload),
      result: previewResult,
      impact: record(previewResult.impact),
      diff: record(previewResult.candidate),
      approval: row.approval_id ? {
        approvalId: String(row.approval_id),
        approvedBy: String(row.approved_by),
        reviewedInputHash: String(row.reviewed_input_hash),
        reviewedAggregateVersion: Number(row.reviewed_aggregate_version),
        expiresAt: new Date(row.approval_expires_at).toISOString(),
        consumedAt: row.approval_consumed_at
          ? new Date(row.approval_consumed_at).toISOString()
          : null,
      } : null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeGoV2RedApproval(
  client: PoolClient,
  input: { tournamentId: string; previewId: string; approvalId: string; requesterId: string },
): Promise<void> {
  const consumed = await client.query(
    `UPDATE go_v2_red_operation_approvals
     SET consumed_at = now()
     WHERE id = $1 AND tournament_id = $2 AND preview_id = $3
       AND requested_by = $4 AND approved_by <> $4
       AND consumed_at IS NULL AND expires_at > now()
     RETURNING id`,
    [input.approvalId, input.tournamentId, input.previewId, input.requesterId],
  );
  if (!consumed.rowCount) {
    throw new GoV2Error(
      409,
      'SECOND_APPROVAL_REQUIRED',
      'A fresh approval from a different administrator is required for this red operation',
    );
  }
}

export async function recordGoV2RatingShadowProjection(
  tournamentIdRaw: string,
  body: unknown,
  actor: GoV2ActorContext,
): Promise<Record<string, unknown>> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const command = parseGoV2CommandEnvelope(body);
  const requestHash = hash({
    operation: 'rating.shadow.commit',
    tournamentId,
    expectedVersion: command.expectedVersion,
    commandId: command.commandId,
    deviceId: command.deviceId,
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote ?? null,
    payload: command.payload,
  });
  assertDeclaredHash(command.requestHash, requestHash);
  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.commandId);
    if (receipt) {
      assertReceiptMatches(receipt, 'rating.shadow.commit', requestHash);
      return { ...receipt.responsePayload, replayed: true };
    }
    assertExpectedVersion(state, command.expectedVersion);
    if (state.lifecycleState !== 'finished') {
      throw new GoV2Error(409, 'RATING_REQUIRES_FINISHED_TOURNAMENT', 'Rating projection requires a finished tournament');
    }
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    if (String(command.payload.mode ?? 'shadow') !== 'shadow') {
      throw new GoV2Error(
        409,
        'RATING_APPLY_DISABLED',
        'Tournament Engine V2 rating projection is shadow-only until the pilot is approved',
      );
    }
    if (
      command.payload.rows !== undefined
      || command.payload.deltas !== undefined
      || command.payload.deltaValue !== undefined
    ) {
      throw new GoV2Error(
        422,
        'CLIENT_RATING_DELTAS_FORBIDDEN',
        'Rating shadow rows and deltas are generated by the server from final placements',
      );
    }
    const finalPlacements = await persistGoV2FinalPlacementSnapshot(client, {
      tournamentId,
      aggregateVersion: state.aggregateVersion,
      actorId: actor.id,
    });
    const canonicalStandingsHash = finalPlacements.standingsHash;
    const suppliedStandingsHash = String(command.payload.standingsHash ?? '').trim().toLowerCase();
    if (suppliedStandingsHash && suppliedStandingsHash !== canonicalStandingsHash) {
      throw new GoV2Error(409, 'STANDINGS_HASH_MISMATCH', 'standingsHash does not match final snapshots', {
        canonicalStandingsHash,
      });
    }
    const existing = await client.query(
      `SELECT id::text, projection_mode, status, created_at,
              source_final_placement_snapshot_id::text
       FROM go_v2_rating_projection_runs
       WHERE tournament_id = $1 AND standings_hash = $2`,
      [tournamentId, canonicalStandingsHash],
    );
    if (existing.rowCount) {
      const response = {
        operation: 'rating.shadow.commit',
        aggregateVersion: state.aggregateVersion,
        commandId: command.commandId,
        requestHash,
        deviceId: command.deviceId,
        replayed: true,
        result: {
          projectionRunId: String(existing.rows[0].id),
          mode: String(existing.rows[0].projection_mode),
          status: String(existing.rows[0].status),
          standingsHash: canonicalStandingsHash,
          sourceFinalPlacementSnapshotId: existing.rows[0].source_final_placement_snapshot_id
            ? String(existing.rows[0].source_final_placement_snapshot_id)
            : null,
          currentFinalPlacementSnapshotId: finalPlacements.snapshotId,
          ratingMutated: false,
        },
      };
      // A sports-level duplicate is still a successfully handled command.
      // Persist its own receipt so a lost HTTP response can be replayed with
      // the exact same commandId without relying on another run's identity.
      await saveCommandReceipt(client, {
        tournamentId,
        idempotencyKey: command.commandId,
        operationKind: 'rating.shadow.commit',
        expectedVersion: command.expectedVersion,
        resultingVersion: state.aggregateVersion,
        requestHash,
        responsePayload: response,
        actorId: actor.id,
        deviceId: command.deviceId,
        actorRole: actor.role,
        clientRequestHash: command.requestHash,
      });
      return response;
    }
    let projection: ReturnType<typeof buildGoV2RatingShadowProjection>;
    try {
      projection = buildGoV2RatingShadowProjection(
        finalPlacements.rows,
        finalPlacements.ratingPolicySnapshot,
      );
    } catch (error) {
      if (error instanceof SportsDomainError) {
        throw new GoV2Error(409, error.code, error.message, error.details);
      }
      throw error;
    }
    const inserted = await client.query(
      `INSERT INTO go_v2_rating_projection_runs (
         tournament_id, standings_hash, projection_mode, status,
         source_snapshot_ids, source_final_placement_snapshot_id,
         projection_payload, created_by
       ) VALUES ($1, $2, 'shadow', 'validated', ARRAY[$3::uuid], $3::uuid, $4::jsonb, $5)
       RETURNING id::text`,
      [
        tournamentId,
        canonicalStandingsHash,
        finalPlacements.snapshotId,
        JSON.stringify({
          finalPlacementSnapshotId: finalPlacements.snapshotId,
          sourceResultsHash: finalPlacements.sourceResultsHash,
          ratingPolicySnapshot: finalPlacements.ratingPolicySnapshot,
          rows: projection.rows,
          excluded: projection.excluded,
          ratingMutated: false,
        }),
        actor.id,
      ],
    );
    const projectionRunId = String(inserted.rows[0].id);
    for (const row of projection.rows) {
      await client.query(
        `INSERT INTO go_v2_rating_projection_rows (
           projection_run_id, player_id, before_value, delta_value, after_value, payload
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [projectionRunId, row.playerId, row.beforeValue, row.deltaValue, row.afterValue, JSON.stringify(row.payload)],
      );
    }
    const nextState = await advanceAggregateVersion(client, tournamentId);
    const response = {
      operation: 'rating.shadow.commit' as const,
      aggregateVersion: nextState.aggregateVersion,
      commandId: command.commandId,
      requestHash,
      deviceId: command.deviceId,
      replayed: false,
      result: {
        projectionRunId,
        mode: 'shadow',
        status: 'validated',
        standingsHash: canonicalStandingsHash,
        sourceFinalPlacementSnapshotId: finalPlacements.snapshotId,
        sourceResultsHash: finalPlacements.sourceResultsHash,
        rowCount: projection.rows.length,
        excludedCount: projection.excluded.length,
        ratingMutated: false,
      },
    };
    await appendAuditEvent(client, {
      tournamentId,
      aggregateVersion: nextState.aggregateVersion,
      eventType: 'rating.shadow.commit',
      entityType: 'rating_projection',
      entityId: projectionRunId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote,
      actorId: actor.id,
      idempotencyKey: command.commandId,
      diffPayload: response.result,
    });
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.commandId,
      operationKind: 'rating.shadow.commit',
      expectedVersion: command.expectedVersion,
      resultingVersion: nextState.aggregateVersion,
      requestHash,
      responsePayload: response,
      actorId: actor.id,
      deviceId: command.deviceId,
      actorRole: actor.role,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}
