import { deterministicHash } from './hash';
import {
  SCHEDULE_QUANTUM_MINUTES,
  SCHEDULE_SOLVER_VERSION,
  type ScheduleCourtPolicyBinding,
  type ScheduleConflict,
  type ScheduleMatchInput,
  type ScheduleRefereeAssignment,
  type ScheduleRefereeMode,
  type ScheduleSolverInput,
} from './types';

export interface NormalizedRange {
  start: number;
  end: number;
}

export interface NormalizedCourt {
  id: string;
  label: string;
  availability: NormalizedRange[];
}

export interface NormalizedDependency {
  matchId: string;
  minGapMinutes: number;
}

export type NormalizedRefereeRequirement =
  | { kind: 'none' }
  | { kind: 'court_judge'; isFallback?: boolean }
  | { kind: 'fixed_team'; teamId: string }
  | { kind: 'idle_team_candidates'; candidateTeamIds: string[] }
  | { kind: 'loser_previous_same_court'; sourceMatchId: string };

export interface NormalizedPlacementReference {
  courtId: string;
  start: number;
}

export interface NormalizedMatch {
  id: string;
  durationMinutes: number;
  durationMs: number;
  originalDurationMinutes: number;
  teamIds: string[];
  playerIds: string[];
  dependencies: NormalizedDependency[];
  stageKind: 'pool' | 'playoff' | 'placement' | 'other';
  tier: 'hard' | 'medium' | 'light' | null;
  stagePriority: number;
  minRestMinutes: number;
  softRestMinutes: number;
  notBefore: number;
  mustEndBy: number;
  locked: NormalizedPlacementReference | null;
  published: NormalizedPlacementReference | null;
  conditional: boolean;
  courtAffinityPenalties: Record<string, number>;
  courtPolicy: ScheduleCourtPolicyBinding | null;
  refereeRequirement: NormalizedRefereeRequirement;
  criticalPathMinutes: number;
}

export interface NormalizedSolverOptions {
  quantumMinutes: number;
  quantumMs: number;
  beamWidth: number;
  topK: number;
  maxExpandedStates: number;
  maxWallMs: number;
  maxRepairPasses: number;
}

export interface CompiledScheduleInput {
  sessionId: string;
  timezone: string;
  window: NormalizedRange;
  courts: NormalizedCourt[];
  courtById: Map<string, NormalizedCourt>;
  matches: NormalizedMatch[];
  matchById: Map<string, NormalizedMatch>;
  topologicalOrder: string[];
  referee: {
    mode: ScheduleRefereeMode;
    minRestAfterRefMinutes: number;
  };
  options: NormalizedSolverOptions;
  inputHash: string;
}

export interface ScheduleCompileResult {
  compiled: CompiledScheduleInput | null;
  inputHash: string;
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
}

function issue(
  code: ScheduleConflict['code'],
  message: string,
  extra: Omit<ScheduleConflict, 'code' | 'severity' | 'message'> = {},
  severity: ScheduleConflict['severity'] = 'error',
): ScheduleConflict {
  return { code, severity, message, ...extra };
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
  conflicts: ScheduleConflict[],
): number {
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value > 0) return value;
  conflicts.push(issue('INVALID_TIME_CONSTRAINT', `${name} must be a positive integer.`, {
    details: { name, value },
  }));
  return fallback;
}

function boundedNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  name: string,
  maximum: number,
  conflicts: ScheduleConflict[],
): number {
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value >= 0 && value <= maximum) return value;
  conflicts.push(issue('INVALID_TIME_CONSTRAINT', `${name} must be an integer from 0 through ${maximum}.`, {
    details: { name, value, maximum },
  }));
  return fallback;
}

function nonNegativeNumber(
  value: number | undefined,
  fallback: number,
  name: string,
  matchId: string | null,
  conflicts: ScheduleConflict[],
): number {
  if (value === undefined) return fallback;
  if (Number.isFinite(value) && value >= 0) return value;
  conflicts.push(issue('INVALID_TIME_CONSTRAINT', `${name} must be a non-negative number.`, {
    matchIds: matchId ? [matchId] : undefined,
    details: { name, value },
  }));
  return fallback;
}

function mergeRanges(ranges: NormalizedRange[]): NormalizedRange[] {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: NormalizedRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function isQuantumAligned(timestamp: number, windowStart: number, quantumMs: number): boolean {
  return (timestamp - windowStart) % quantumMs === 0;
}

export function ceilToQuantum(timestamp: number, windowStart: number, quantumMs: number): number {
  const offset = timestamp - windowStart;
  if (offset <= 0) return windowStart;
  return windowStart + Math.ceil(offset / quantumMs) * quantumMs;
}

export function courtContains(
  court: NormalizedCourt,
  start: number,
  end: number,
): boolean {
  return court.availability.some((range) => start >= range.start && end <= range.end);
}

export function courtPolicyAllows(
  policy: ScheduleCourtPolicyBinding | null,
  courtId: string,
  start: number,
  end: number,
): boolean {
  if (!policy) return true;
  if (!policy.allowedCourtIds.includes(courtId)) return false;
  const windows = policy.exceptionCourtWindows?.[courtId];
  if (!windows) return true;
  return windows.some((window) => {
    const windowStart = Date.parse(window.start);
    const windowEnd = Date.parse(window.end);
    return Number.isFinite(windowStart)
      && Number.isFinite(windowEnd)
      && start >= windowStart
      && end <= windowEnd;
  });
}

function normalizeDependencies(
  match: ScheduleMatchInput,
  allIds: Set<string>,
  refereeMode: ScheduleRefereeMode,
  conflicts: ScheduleConflict[],
  warnings: ScheduleConflict[],
): { dependencies: NormalizedDependency[]; refereeRequirement: NormalizedRefereeRequirement } {
  const byId = new Map<string, number>();
  for (const raw of match.dependencies ?? []) {
    const dependency = typeof raw === 'string' ? { matchId: raw, minGapMinutes: 0 } : raw;
    const gap = dependency.minGapMinutes ?? 0;
    if (!Number.isFinite(gap) || gap < 0) {
      conflicts.push(issue('INVALID_DEPENDENCY_GAP', 'Dependency gap must be non-negative.', {
        matchIds: [match.id, dependency.matchId],
        details: { minGapMinutes: gap },
      }));
      continue;
    }
    if (dependency.matchId === match.id) {
      conflicts.push(issue('SELF_DEPENDENCY', 'A match cannot depend on itself.', { matchIds: [match.id] }));
      continue;
    }
    if (!allIds.has(dependency.matchId)) {
      conflicts.push(issue('UNKNOWN_DEPENDENCY', 'Dependency points to an unknown match.', {
        matchIds: [match.id, dependency.matchId],
      }));
      continue;
    }
    byId.set(dependency.matchId, Math.max(byId.get(dependency.matchId) ?? 0, gap));
  }

  let requirement: NormalizedRefereeRequirement;
  const requested = match.refereeRequirement;
  if (refereeMode === 'none') requirement = { kind: 'none' };
  else if (refereeMode === 'court_judge') requirement = { kind: 'court_judge' };
  else if (!requested) {
    if (refereeMode === 'working_team') {
      conflicts.push(issue('REFEREE_REQUIREMENT_MISSING', 'Working-team mode requires a referee rule for every match.', {
        matchIds: [match.id],
      }));
      requirement = { kind: 'none' };
    } else requirement = { kind: 'court_judge' };
  } else if (requested.kind === 'none') {
    if (refereeMode === 'working_team') {
      conflicts.push(issue('REFEREE_REQUIREMENT_MISSING', 'Working-team mode cannot leave a match without a referee.', {
        matchIds: [match.id],
      }));
    }
    requirement = requested;
  } else if (requested.kind === 'court_judge') requirement = requested;
  else if (requested.kind === 'fixed_team') {
    if (!requested.teamId.trim()) {
      conflicts.push(issue('INVALID_TEAM_ID', 'Fixed referee team id cannot be empty.', { matchIds: [match.id] }));
    }
    requirement = requested;
  } else if (requested.kind === 'idle_team_candidates') {
    const candidateTeamIds: string[] = [];
    const seenCandidateIds = new Set<string>();
    for (const rawTeamId of requested.candidateTeamIds ?? []) {
      const teamId = rawTeamId.trim();
      if (!teamId) {
        conflicts.push(issue('INVALID_TEAM_ID', 'Idle referee candidate ids cannot be empty.', {
          matchIds: [match.id],
        }));
        continue;
      }
      if (seenCandidateIds.has(teamId)) continue;
      seenCandidateIds.add(teamId);
      candidateTeamIds.push(teamId);
    }
    const simultaneous = candidateTeamIds.filter((teamId) => match.teamIds.includes(teamId));
    if (simultaneous.length > 0) {
      conflicts.push(issue('REFEREE_TEAM_OVERLAP', 'An idle referee candidate cannot also play the same match.', {
        matchIds: [match.id],
        teamId: simultaneous[0],
        details: { candidateTeamIds: simultaneous },
      }));
    }
    if (candidateTeamIds.length === 0) {
      const problem = issue(
        'REFEREE_REQUIREMENT_MISSING',
        'Idle-team referee assignment requires at least one eligible candidate.',
        { matchIds: [match.id] },
        refereeMode === 'hybrid' ? 'warning' : 'error',
      );
      if (refereeMode === 'hybrid') warnings.push(problem);
      else conflicts.push(problem);
      requirement = refereeMode === 'hybrid'
        ? { kind: 'court_judge', isFallback: true }
        : { kind: 'idle_team_candidates', candidateTeamIds };
    } else {
      requirement = { kind: 'idle_team_candidates', candidateTeamIds };
    }
  } else {
    const sourceId = requested.sourceMatchId;
    if (!allIds.has(sourceId) || sourceId === match.id) {
      const code = !allIds.has(sourceId) ? 'REFEREE_SOURCE_UNKNOWN' : 'SELF_DEPENDENCY';
      const problem = issue(code, 'Loser-referee source must be a different known match.', {
        matchIds: [match.id, sourceId],
      }, refereeMode === 'hybrid' ? 'warning' : 'error');
      if (refereeMode === 'hybrid') warnings.push(problem);
      else conflicts.push(problem);
      requirement = refereeMode === 'hybrid'
        ? { kind: 'court_judge', isFallback: true }
        : { kind: 'loser_previous_same_court', sourceMatchId: sourceId };
    } else {
      requirement = { kind: 'loser_previous_same_court', sourceMatchId: sourceId };
      byId.set(sourceId, Math.max(byId.get(sourceId) ?? 0, 0));
    }
  }

  return {
    dependencies: Array.from(byId, ([matchId, minGapMinutes]) => ({ matchId, minGapMinutes }))
      .sort((a, b) => a.matchId.localeCompare(b.matchId)),
    refereeRequirement: requirement,
  };
}

function topologicalSort(matches: NormalizedMatch[]): { order: string[]; cyclicIds: string[] } {
  const indegree = new Map(matches.map((match) => [match.id, match.dependencies.length]));
  const outgoing = new Map<string, string[]>();
  for (const match of matches) {
    for (const dependency of match.dependencies) {
      const list = outgoing.get(dependency.matchId) ?? [];
      list.push(match.id);
      outgoing.set(dependency.matchId, list);
    }
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.localeCompare(b));
  const queue = matches.filter((match) => indegree.get(match.id) === 0).map((match) => match.id).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    order.push(current);
    for (const target of outgoing.get(current) ?? []) {
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) {
        queue.push(target);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }
  const cyclicIds = matches.map((match) => match.id).filter((id) => !order.includes(id)).sort();
  return { order, cyclicIds };
}

function calculateCriticalPaths(matches: NormalizedMatch[], order: string[]): void {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const outgoing = new Map<string, Array<{ targetId: string; gap: number }>>();
  for (const target of matches) {
    for (const dependency of target.dependencies) {
      const list = outgoing.get(dependency.matchId) ?? [];
      list.push({ targetId: target.id, gap: dependency.minGapMinutes });
      outgoing.set(dependency.matchId, list);
    }
  }
  for (const id of order.slice().reverse()) {
    const match = byId.get(id);
    if (!match) continue;
    const tail = Math.max(0, ...(outgoing.get(id) ?? []).map(({ targetId, gap }) => {
      const target = byId.get(targetId);
      return gap + (target?.criticalPathMinutes ?? 0);
    }));
    match.criticalPathMinutes = match.durationMinutes + tail;
  }
}

function canonicalCompiledSnapshot(compiled: Omit<CompiledScheduleInput, 'courtById' | 'matchById' | 'inputHash'>): unknown {
  return {
    solverVersion: SCHEDULE_SOLVER_VERSION,
    sessionId: compiled.sessionId,
    timezone: compiled.timezone,
    window: compiled.window,
    referee: compiled.referee,
    options: compiled.options,
    courts: compiled.courts.map((court) => ({
      id: court.id,
      label: court.label,
      availability: court.availability,
    })),
    matches: compiled.matches.map((match) => ({
      ...match,
      criticalPathMinutes: undefined,
    })),
  };
}

export function compileScheduleInput(input: ScheduleSolverInput): ScheduleCompileResult {
  const conflicts: ScheduleConflict[] = [];
  const warnings: ScheduleConflict[] = [];
  const rawInputHash = deterministicHash({ solverVersion: SCHEDULE_SOLVER_VERSION, input });
  const windowStart = parseTime(input.window?.start);
  const windowEnd = parseTime(input.window?.end);
  if (windowStart === null || windowEnd === null || windowEnd <= windowStart) {
    conflicts.push(issue('INVALID_SESSION_WINDOW', 'Session window must contain valid increasing timestamps.'));
  }
  const safeWindow = {
    start: windowStart ?? 0,
    end: windowEnd ?? 0,
  };

  const requestedQuantum = input.options?.quantumMinutes ?? SCHEDULE_QUANTUM_MINUTES;
  if (requestedQuantum !== SCHEDULE_QUANTUM_MINUTES) {
    conflicts.push(issue('INVALID_QUANTUM', 'Scheduler V1 supports only a five-minute quantum.', {
      details: { quantumMinutes: requestedQuantum },
    }));
  }
  const options: NormalizedSolverOptions = {
    quantumMinutes: SCHEDULE_QUANTUM_MINUTES,
    quantumMs: SCHEDULE_QUANTUM_MINUTES * 60_000,
    beamWidth: positiveInteger(input.options?.beamWidth, 64, 'beamWidth', conflicts),
    topK: positiveInteger(input.options?.topK, 24, 'topK', conflicts),
    maxExpandedStates: positiveInteger(input.options?.maxExpandedStates, 250_000, 'maxExpandedStates', conflicts),
    maxWallMs: positiveInteger(input.options?.maxWallMs, 5_000, 'maxWallMs', conflicts),
    maxRepairPasses: boundedNonNegativeInteger(
      input.options?.maxRepairPasses,
      8,
      'maxRepairPasses',
      8,
      conflicts,
    ),
  };

  if (!Array.isArray(input.courts) || input.courts.length < 1 || input.courts.length > 6) {
    conflicts.push(issue('COURT_COUNT_OUT_OF_RANGE', 'A session must contain between one and six courts.', {
      details: { count: input.courts?.length ?? 0 },
    }));
  }
  const courtIds = new Set<string>();
  const courts: NormalizedCourt[] = [];
  for (const rawCourt of input.courts ?? []) {
    if (!rawCourt.id.trim() || courtIds.has(rawCourt.id)) {
      conflicts.push(issue('DUPLICATE_COURT_ID', 'Court ids must be non-empty and unique.', {
        courtId: rawCourt.id,
      }));
      continue;
    }
    courtIds.add(rawCourt.id);
    const availabilityWasSpecified = rawCourt.availability !== undefined;
    const sourceRanges = availabilityWasSpecified
      ? rawCourt.availability ?? []
      : [{ start: input.window.start, end: input.window.end }];
    const ranges: NormalizedRange[] = [];
    for (const rawRange of sourceRanges) {
      const start = parseTime(rawRange.start);
      const end = parseTime(rawRange.end);
      if (start === null || end === null || end <= start) {
        conflicts.push(issue('COURT_AVAILABILITY_INVALID', 'Court availability must contain valid increasing timestamps.', {
          courtId: rawCourt.id,
          details: { range: rawRange },
        }));
        continue;
      }
      const clippedStart = Math.max(start, safeWindow.start);
      const clippedEnd = Math.min(end, safeWindow.end);
      if (clippedEnd > clippedStart) ranges.push({ start: clippedStart, end: clippedEnd });
    }
    if (availabilityWasSpecified && sourceRanges.length === 0) {
      warnings.push(issue('COURT_FULLY_CLOSED', 'Court is explicitly closed for the entire session.', {
        courtId: rawCourt.id,
        details: { phase: 'availability_compile' },
      }, 'warning'));
    } else if (ranges.length === 0) {
      conflicts.push(issue('COURT_AVAILABILITY_INVALID', 'Court has no availability inside the session window.', {
        courtId: rawCourt.id,
      }));
    }
    courts.push({ id: rawCourt.id, label: rawCourt.label ?? rawCourt.id, availability: mergeRanges(ranges) });
  }
  courts.sort((a, b) => a.id.localeCompare(b.id));
  const courtById = new Map(courts.map((court) => [court.id, court]));
  if ((input.matches?.length ?? 0) > 0 && courts.length > 0 && courts.every((court) => court.availability.length === 0)) {
    conflicts.push(issue('NO_ACTIVE_COURTS', 'All configured courts are closed for the session.', {
      details: { phase: 'availability_compile', courtIds: courts.map((court) => court.id) },
    }));
  }

  const allIds = new Set<string>();
  for (const match of input.matches ?? []) {
    if (!match.id.trim() || allIds.has(match.id)) {
      conflicts.push(issue('DUPLICATE_MATCH_ID', 'Match ids must be non-empty and unique.', { matchIds: [match.id] }));
    } else allIds.add(match.id);
  }

  const refereeMode = input.referee?.mode ?? 'none';
  const matches: NormalizedMatch[] = [];
  for (const rawMatch of input.matches ?? []) {
    if (!rawMatch.id.trim() || matches.some((match) => match.id === rawMatch.id)) continue;
    const originalDuration = rawMatch.durationMinutes;
    if (!Number.isFinite(originalDuration) || originalDuration <= 0) {
      conflicts.push(issue('INVALID_DURATION', 'Match duration must be positive.', {
        matchIds: [rawMatch.id],
        details: { durationMinutes: originalDuration },
      }));
    }
    const safeDuration = Number.isFinite(originalDuration) && originalDuration > 0 ? originalDuration : 1;
    const durationMinutes = Math.ceil(safeDuration / SCHEDULE_QUANTUM_MINUTES) * SCHEDULE_QUANTUM_MINUTES;
    if (durationMinutes !== originalDuration) {
      warnings.push(issue('DURATION_ROUNDED', 'Match duration was rounded up to the five-minute quantum.', {
        matchIds: [rawMatch.id],
        details: { from: originalDuration, to: durationMinutes },
      }, 'warning'));
    }
    const teamIds = Array.from(new Set(rawMatch.teamIds ?? [])).sort();
    if (teamIds.some((id) => !id.trim())) {
      conflicts.push(issue('INVALID_TEAM_ID', 'Team ids must be non-empty.', { matchIds: [rawMatch.id] }));
    }
    const playerIds = Array.from(new Set(rawMatch.playerIds ?? [])).sort();
    if (playerIds.some((id) => !id.trim())) {
      conflicts.push(issue('INVALID_PLAYER_ID', 'Player ids must be non-empty.', { matchIds: [rawMatch.id] }));
    }
    const { dependencies, refereeRequirement } = normalizeDependencies(
      rawMatch,
      allIds,
      refereeMode,
      conflicts,
      warnings,
    );
    const notBeforeRaw = rawMatch.notBefore ? parseTime(rawMatch.notBefore) : safeWindow.start;
    const mustEndByRaw = rawMatch.mustEndBy ? parseTime(rawMatch.mustEndBy) : safeWindow.end;
    if (notBeforeRaw === null || mustEndByRaw === null || mustEndByRaw <= notBeforeRaw) {
      conflicts.push(issue('INVALID_TIME_CONSTRAINT', 'Match time bounds must be valid and increasing.', {
        matchIds: [rawMatch.id],
      }));
    }
    const normalizePlacement = (
      placement: ScheduleMatchInput['locked'] | ScheduleMatchInput['published'],
      kind: 'locked' | 'published',
    ): NormalizedPlacementReference | null => {
      if (!placement) return null;
      const start = parseTime(placement.start);
      if (start === null) {
        conflicts.push(issue('INVALID_TIME_CONSTRAINT', `${kind} assignment has an invalid timestamp.`, {
          matchIds: [rawMatch.id],
        }));
        return null;
      }
      return { courtId: placement.courtId, start };
    };
    const locked = normalizePlacement(rawMatch.locked, 'locked');
    const published = normalizePlacement(rawMatch.published, 'published');
    const penalties: Record<string, number> = {};
    for (const [courtId, penalty] of Object.entries(rawMatch.courtAffinityPenalties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (!courtById.has(courtId)) {
        conflicts.push(issue('UNKNOWN_AFFINITY_COURT', 'Court affinity points to an unknown court.', {
          matchIds: [rawMatch.id], courtId,
        }));
      } else if (!Number.isFinite(penalty) || penalty < 0) {
        conflicts.push(issue('INVALID_AFFINITY_PENALTY', 'Court affinity penalty must be a non-negative number.', {
          matchIds: [rawMatch.id], courtId, details: { penalty },
        }));
      } else penalties[courtId] = penalty;
    }
    let courtPolicy: ScheduleCourtPolicyBinding | null = null;
    if (rawMatch.courtPolicy) {
      const rawPolicy = rawMatch.courtPolicy;
      const allowedCourtIds = Array.from(new Set(rawPolicy.allowedCourtIds ?? [])).sort();
      const preferredCourtIds = Array.from(new Set(rawPolicy.preferredCourtIds ?? [])).sort();
      const exceptionCourtWindows: Record<string, Array<{ start: string; end: string }>> = {};
      for (const [courtId, rawWindows] of Object.entries(rawPolicy.exceptionCourtWindows ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        if (!allowedCourtIds.includes(courtId) || !Array.isArray(rawWindows) || rawWindows.length === 0) {
          conflicts.push(issue('INVALID_COURT_POLICY', 'Court-policy exception windows must reference a permitted court.', {
            matchIds: [rawMatch.id], courtId,
          }));
          continue;
        }
        const normalizedWindows: NormalizedRange[] = [];
        for (const rawWindow of rawWindows) {
          const windowStart = parseTime(rawWindow?.start);
          const windowEnd = parseTime(rawWindow?.end);
          if (
            windowStart === null
            || windowEnd === null
            || windowEnd <= windowStart
            || windowStart < safeWindow.start
            || windowEnd > safeWindow.end
          ) {
            conflicts.push(issue('INVALID_COURT_POLICY', 'Court-policy exception window is invalid or outside the session.', {
              matchIds: [rawMatch.id], courtId,
            }));
            continue;
          }
          normalizedWindows.push({ start: windowStart, end: windowEnd });
        }
        if (normalizedWindows.length > 0) {
          exceptionCourtWindows[courtId] = mergeRanges(normalizedWindows).map((window) => ({
            start: new Date(window.start).toISOString(),
            end: new Date(window.end).toISOString(),
          }));
        }
      }
      const invalidShape = rawPolicy.code !== 'lpv_tier_courts_v1'
        || !['neutral', 'strict', 'approved_overflow'].includes(rawPolicy.mode)
        || !['hard_light', 'hard_medium_light'].includes(rawPolicy.tierProfile)
        || allowedCourtIds.length !== (rawPolicy.allowedCourtIds?.length ?? 0)
        || preferredCourtIds.length !== (rawPolicy.preferredCourtIds?.length ?? 0)
        || (Object.keys(exceptionCourtWindows).length > 0 && rawPolicy.mode !== 'approved_overflow');
      if (invalidShape) {
        conflicts.push(issue('INVALID_COURT_POLICY', 'Match court policy is malformed or unsupported.', {
          matchIds: [rawMatch.id], details: { policyCode: rawPolicy.code, mode: rawPolicy.mode },
        }));
      }
      const unknownCourtIds = [...allowedCourtIds, ...preferredCourtIds]
        .filter((courtId, index, values) => !courtById.has(courtId) && values.indexOf(courtId) === index)
        .sort();
      if (unknownCourtIds.length > 0) {
        conflicts.push(issue('UNKNOWN_POLICY_COURT', 'Match court policy references an unknown court.', {
          matchIds: [rawMatch.id], courtId: unknownCourtIds[0], details: { courtIds: unknownCourtIds },
        }));
      }
      const preferredOutsideAllowed = preferredCourtIds.filter((courtId) => !allowedCourtIds.includes(courtId));
      const poolMustBeNeutral = (rawMatch.stageKind ?? 'other') === 'pool' && rawPolicy.mode !== 'neutral';
      const tierMustNotBeNeutral = (rawMatch.stageKind ?? 'other') !== 'pool'
        && rawMatch.tier != null
        && rawPolicy.mode === 'neutral';
      if (preferredOutsideAllowed.length > 0 || poolMustBeNeutral || tierMustNotBeNeutral) {
        conflicts.push(issue('INVALID_COURT_POLICY', 'Court policy mode or preferred courts do not match the stage.', {
          matchIds: [rawMatch.id],
          details: { preferredOutsideAllowed, poolMustBeNeutral, tierMustNotBeNeutral },
        }));
      }
      if (allowedCourtIds.length === 0) {
        conflicts.push(issue('TIER_COURT_POLICY_UNAVAILABLE', 'Court policy leaves the match with no permitted court.', {
          matchIds: [rawMatch.id], details: { mode: rawPolicy.mode, tier: rawMatch.tier ?? null },
        }));
      }
      courtPolicy = {
        code: 'lpv_tier_courts_v1',
        mode: rawPolicy.mode,
        tierProfile: rawPolicy.tierProfile,
        allowedCourtIds,
        preferredCourtIds,
        ...(Object.keys(exceptionCourtWindows).length > 0 ? { exceptionCourtWindows } : {}),
      };
    }
    matches.push({
      id: rawMatch.id,
      durationMinutes,
      durationMs: durationMinutes * 60_000,
      originalDurationMinutes: originalDuration,
      teamIds,
      playerIds,
      dependencies,
      stageKind: rawMatch.stageKind ?? 'other',
      tier: rawMatch.tier ?? null,
      stagePriority: Number.isFinite(rawMatch.stagePriority) ? (rawMatch.stagePriority as number) : 0,
      minRestMinutes: nonNegativeNumber(rawMatch.minRestMinutes, 0, 'minRestMinutes', rawMatch.id, conflicts),
      softRestMinutes: nonNegativeNumber(rawMatch.softRestMinutes, 0, 'softRestMinutes', rawMatch.id, conflicts),
      notBefore: notBeforeRaw ?? safeWindow.start,
      mustEndBy: mustEndByRaw ?? safeWindow.end,
      locked,
      published,
      conditional: Boolean(rawMatch.conditional),
      courtAffinityPenalties: penalties,
      courtPolicy,
      refereeRequirement,
      criticalPathMinutes: durationMinutes,
    });
  }
  matches.sort((a, b) => a.id.localeCompare(b.id));
  const matchById = new Map(matches.map((match) => [match.id, match]));

  if (refereeMode === 'working_team') {
    for (const match of matches) {
      let reservedTeamIds: string[] = [];
      if (match.refereeRequirement.kind === 'fixed_team') {
        reservedTeamIds = [match.refereeRequirement.teamId];
      } else if (match.refereeRequirement.kind === 'loser_previous_same_court') {
        reservedTeamIds = matchById.get(match.refereeRequirement.sourceMatchId)?.teamIds ?? [];
      }
      const simultaneous = reservedTeamIds.filter((teamId) => match.teamIds.includes(teamId));
      if (simultaneous.length > 0) {
        conflicts.push(issue(
          'REFEREE_TEAM_OVERLAP',
          'Strict working-team duty is impossible: a possible referee must also play this match.',
          {
            matchIds: match.refereeRequirement.kind === 'loser_previous_same_court'
              ? [match.refereeRequirement.sourceMatchId, match.id]
              : [match.id],
            teamId: simultaneous[0],
            details: { reservedTeamIds: simultaneous.slice().sort(), phase: 'referee_preflight' },
          },
        ));
      }
    }
  }

  for (const match of matches) {
    if (match.locked) {
      const court = courtById.get(match.locked.courtId);
      if (!court) {
        conflicts.push(issue('LOCKED_COURT_UNKNOWN', 'Locked assignment points to an unknown court.', {
          matchIds: [match.id], courtId: match.locked.courtId,
        }));
      } else {
        const end = match.locked.start + match.durationMs;
        if (!isQuantumAligned(match.locked.start, safeWindow.start, options.quantumMs)) {
          conflicts.push(issue('LOCKED_TIME_MISALIGNED', 'Locked start is not aligned to the session quantum.', {
            matchIds: [match.id], courtId: court.id, at: new Date(match.locked.start).toISOString(),
          }));
        }
        if (!courtContains(court, match.locked.start, end)) {
          conflicts.push(issue('LOCKED_OUTSIDE_AVAILABILITY', 'Locked match does not fit court availability.', {
            matchIds: [match.id], courtId: court.id,
          }));
        }
        if (!courtPolicyAllows(match.courtPolicy, court.id, match.locked.start, end)) {
          conflicts.push(issue('TIER_COURT_POLICY_VIOLATION', 'Locked match is assigned outside its permitted tier courts.', {
            matchIds: [match.id], courtId: court.id,
            details: {
              mode: match.courtPolicy?.mode ?? null,
              allowedCourtIds: match.courtPolicy?.allowedCourtIds ?? [],
            },
          }));
        }
        if (match.locked.start < match.notBefore || end > match.mustEndBy) {
          conflicts.push(issue('LOCKED_OUTSIDE_AVAILABILITY', 'Locked match violates its time bounds.', {
            matchIds: [match.id], courtId: court.id,
          }));
        }
      }
    }
    const eligibleCourts = match.courtPolicy
      ? courts.filter((court) => match.courtPolicy?.allowedCourtIds.includes(court.id))
      : courts;
    const canFit = eligibleCourts.some((court) => court.availability.some((range) => {
      const policyWindows = match.courtPolicy?.exceptionCourtWindows?.[court.id];
      const candidateWindows = policyWindows?.map((window) => ({
        start: Date.parse(window.start),
        end: Date.parse(window.end),
      })) ?? [{ start: safeWindow.start, end: safeWindow.end }];
      return candidateWindows.some((policyWindow) => {
        const candidateStart = Math.max(range.start, policyWindow.start, match.notBefore);
        const candidateEnd = candidateStart + match.durationMs;
        return candidateEnd <= Math.min(range.end, policyWindow.end, match.mustEndBy)
          && courtPolicyAllows(match.courtPolicy, court.id, candidateStart, candidateEnd);
      });
    }));
    if (courts.length > 0 && !canFit) {
      conflicts.push(issue('NO_COURT_WINDOW_FITS_DURATION', 'No court window can fit the match duration and bounds.', {
        matchIds: [match.id],
        details: {
          eligibleCourtIds: eligibleCourts.map((court) => court.id),
          courtPolicy: match.courtPolicy,
        },
      }));
    }
  }

  for (const match of matches) {
    for (const dependency of match.dependencies) {
      const source = matchById.get(dependency.matchId);
      if (source?.locked && match.locked) {
        const sourceEnd = source.locked.start + source.durationMs;
        if (match.locked.start < sourceEnd + dependency.minGapMinutes * 60_000) {
          conflicts.push(issue('DEPENDENCY_ORDER', 'Locked assignments violate dependency order.', {
            matchIds: [source.id, match.id],
          }));
        }
      }
    }
    if (match.refereeRequirement.kind === 'loser_previous_same_court') {
      const source = matchById.get(match.refereeRequirement.sourceMatchId);
      if (source?.locked && match.locked && source.locked.courtId !== match.locked.courtId) {
        const conflict = issue(
          refereeMode === 'hybrid' ? 'HYBRID_REFEREE_FALLBACK' : 'REFEREE_SAME_COURT_REQUIRED',
          refereeMode === 'hybrid'
            ? 'Hybrid mode must use a court judge because locked loser-referee matches use different courts.'
            : 'Loser-referee target must use the source match court.',
          { matchIds: [source.id, match.id] },
          refereeMode === 'hybrid' ? 'warning' : 'error',
        );
        if (refereeMode === 'hybrid') {
          warnings.push(conflict);
          match.refereeRequirement = { kind: 'court_judge', isFallback: true };
        } else conflicts.push(conflict);
      }
    }
  }

  const { order, cyclicIds } = topologicalSort(matches);
  if (cyclicIds.length > 0) {
    conflicts.push(issue('DEPENDENCY_CYCLE', 'Match dependency graph contains a cycle.', {
      matchIds: cyclicIds,
    }));
  } else calculateCriticalPaths(matches, order);

  if (conflicts.length > 0) {
    return { compiled: null, inputHash: rawInputHash, conflicts, warnings };
  }

  const withoutMaps = {
    sessionId: input.sessionId ?? '',
    timezone: input.timezone ?? 'UTC',
    window: safeWindow,
    courts,
    matches,
    topologicalOrder: order,
    referee: {
      mode: refereeMode,
      minRestAfterRefMinutes: nonNegativeNumber(
        input.referee?.minRestAfterRefMinutes,
        0,
        'minRestAfterRefMinutes',
        null,
        conflicts,
      ),
    },
    options,
  };
  if (conflicts.length > 0) return { compiled: null, inputHash: rawInputHash, conflicts, warnings };
  const inputHash = deterministicHash(canonicalCompiledSnapshot(withoutMaps));
  const compiled: CompiledScheduleInput = {
    ...withoutMaps,
    courtById,
    matchById,
    inputHash,
  };
  return { compiled, inputHash, conflicts, warnings };
}

export function buildRefereeAssignment(
  compiled: CompiledScheduleInput,
  match: NormalizedMatch,
  fallback = false,
): ScheduleRefereeAssignment {
  if (fallback) return { kind: 'court_judge', reservedTeamIds: [], isFallback: true };
  const requirement = match.refereeRequirement;
  if (requirement.kind === 'none') return { kind: 'none', reservedTeamIds: [] };
  if (requirement.kind === 'court_judge') {
    return {
      kind: 'court_judge',
      reservedTeamIds: [],
      ...(requirement.isFallback ? { isFallback: true } : {}),
    };
  }
  if (requirement.kind === 'fixed_team') {
    return { kind: 'fixed_team', reservedTeamIds: [requirement.teamId] };
  }
  if (requirement.kind === 'idle_team_candidates') {
    return { kind: 'fixed_team', reservedTeamIds: [requirement.candidateTeamIds[0]] };
  }
  const source = compiled.matchById.get(requirement.sourceMatchId);
  return {
    kind: 'loser_previous_same_court',
    sourceMatchId: requirement.sourceMatchId,
    reservedTeamIds: source?.teamIds.slice().sort() ?? [],
  };
}
