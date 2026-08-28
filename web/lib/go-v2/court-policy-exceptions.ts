import { assertGoV2Uuid, GoV2Error } from './contracts';
import type { LpvTierCourtPolicyResult } from './court-policy';

export type GoV2CourtPolicyTier = 'hard' | 'medium' | 'light';

export interface GoV2CourtPolicyExceptionRequest {
  tier: GoV2CourtPolicyTier;
  allowedCourtIds: string[];
  effectiveFrom: string;
  effectiveUntil: string;
  stageId: string | null;
}

export interface GoV2CourtPolicyExceptionBinding extends GoV2CourtPolicyExceptionRequest {
  id: string;
  tournamentId: string;
  scheduleSessionId: string;
  decision: 'approve';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedTimestamp(value: unknown, field: string): string {
  const timestamp = Date.parse(String(value ?? '').trim());
  if (!Number.isFinite(timestamp)) {
    throw new GoV2Error(422, 'INVALID_COURT_POLICY_WINDOW', `${field} must be a valid timestamp`, { field });
  }
  return new Date(timestamp).toISOString();
}

/** Parses only the director-controlled domain fields; schedule state is added server-side. */
export function parseGoV2CourtPolicyExceptionRequest(
  value: unknown,
): GoV2CourtPolicyExceptionRequest {
  const payload = record(value);
  const tier = String(payload.tier ?? '').trim().toLowerCase();
  if (!['hard', 'medium', 'light'].includes(tier)) {
    throw new GoV2Error(422, 'INVALID_COURT_POLICY_TIER', 'tier must be hard, medium or light');
  }
  if (!Array.isArray(payload.allowedCourtIds) || payload.allowedCourtIds.length < 1 || payload.allowedCourtIds.length > 6) {
    throw new GoV2Error(422, 'INVALID_COURT_POLICY_COURTS', 'allowedCourtIds must contain between one and six courts');
  }
  const allowedCourtIds = payload.allowedCourtIds
    .map((courtId, index) => assertGoV2Uuid(courtId, `allowedCourtIds[${index}]`))
    .sort();
  if (new Set(allowedCourtIds).size !== allowedCourtIds.length) {
    throw new GoV2Error(422, 'DUPLICATE_COURT_POLICY_COURT', 'allowedCourtIds must not contain duplicates');
  }
  const effectiveFrom = normalizedTimestamp(payload.effectiveFrom, 'effectiveFrom');
  const effectiveUntil = normalizedTimestamp(payload.effectiveUntil, 'effectiveUntil');
  if (Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) {
    throw new GoV2Error(422, 'INVALID_COURT_POLICY_WINDOW', 'effectiveUntil must be after effectiveFrom');
  }
  const rawStageId = String(payload.stageId ?? '').trim();
  return {
    tier: tier as GoV2CourtPolicyTier,
    allowedCourtIds,
    effectiveFrom,
    effectiveUntil,
    stageId: rawStageId ? assertGoV2Uuid(rawStageId, 'stageId') : null,
  };
}

/** Server-time guard: an expired exception must never create a successor schedule. */
export function assertGoV2CourtPolicyExceptionNotExpired(
  request: GoV2CourtPolicyExceptionRequest,
  asOf: Date,
): void {
  if (Date.parse(request.effectiveUntil) <= asOf.getTime()) {
    throw new GoV2Error(
      409,
      'COURT_POLICY_WINDOW_EXPIRED',
      'The court-policy exception window has already expired; generate a fresh preview',
      { effectiveUntil: request.effectiveUntil, serverAsOf: asOf.toISOString() },
    );
  }
}

function mergeWindows(
  windows: Array<{ start: string; end: string }>,
): Array<{ start: string; end: string }> {
  const ordered = windows
    .map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const window of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end);
    else merged.push({ ...window });
  }
  return merged.map((window) => ({
    start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(),
  }));
}

export function courtPolicyExceptionMatches(
  exception: GoV2CourtPolicyExceptionBinding,
  match: {
    tournamentId: string;
    stageId: string | null;
    tier: string | null;
    stageKind: string;
  },
): boolean {
  return exception.decision === 'approve'
    && exception.tournamentId === match.tournamentId
    && exception.tier === match.tier
    && match.stageKind !== 'pool'
    && (exception.stageId === null || exception.stageId === match.stageId);
}

/**
 * Adds only the approved extra lanes. Strict lanes remain valid for the whole
 * session; each extra lane is constrained to the union of its approved time
 * windows. Pool stages remain neutral and can never consume an exception.
 */
export function applyGoV2CourtPolicyExceptions(
  base: LpvTierCourtPolicyResult,
  match: {
    tournamentId: string;
    stageId: string | null;
    tier: string | null;
    stageKind: string;
  },
  exceptions: readonly GoV2CourtPolicyExceptionBinding[],
): LpvTierCourtPolicyResult & { appliedExceptionIds: string[] } {
  if (match.stageKind === 'pool' || match.tier == null) {
    return { ...base, appliedExceptionIds: [] };
  }
  const applicable = exceptions.filter((exception) => (
    exception.decision === 'approve'
    && exception.tournamentId === match.tournamentId
    && exception.tier === match.tier
    && (exception.stageId === null || exception.stageId === match.stageId)
  ));
  const strictCourtIds = new Set(base.courtPolicy.allowedCourtIds);
  const extraWindows = new Map<string, Array<{ start: string; end: string }>>();
  for (const exception of applicable) {
    for (const courtId of exception.allowedCourtIds) {
      if (strictCourtIds.has(courtId)) continue;
      extraWindows.set(courtId, [
        ...(extraWindows.get(courtId) ?? []),
        { start: exception.effectiveFrom, end: exception.effectiveUntil },
      ]);
    }
  }
  if (extraWindows.size === 0) return { ...base, appliedExceptionIds: [] };
  const exceptionCourtWindows = Object.fromEntries(
    [...extraWindows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([courtId, windows]) => [courtId, mergeWindows(windows)]),
  );
  return {
    courtPolicy: {
      ...base.courtPolicy,
      mode: 'approved_overflow',
      allowedCourtIds: [...new Set([
        ...base.courtPolicy.allowedCourtIds,
        ...extraWindows.keys(),
      ])].sort(),
      exceptionCourtWindows,
    },
    courtAffinityPenalties: base.courtAffinityPenalties,
    appliedExceptionIds: applicable
      .filter((exception) => exception.allowedCourtIds.some((courtId) => !strictCourtIds.has(courtId)))
      .map((exception) => exception.id)
      .sort(),
  };
}
