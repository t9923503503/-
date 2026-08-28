import {
  buildRefereeAssignment,
  ceilToQuantum,
  compileScheduleInput,
  courtContains,
  courtPolicyAllows,
  type CompiledScheduleInput,
  type NormalizedMatch,
} from './compile';
import {
  SCHEDULE_SOLVER_VERSION,
  type ScheduleAssignment,
  type ScheduleConflict,
  type ScheduleObjective,
  type ScheduleRefereeAssignment,
  type ScheduleSolverInput,
  type ScheduleSolverMetrics,
  type ScheduleSolverResult,
} from './types';
import { scheduleHashForAssignments, validateCompiledSchedule } from './validator';
import { buildScheduleDiagnostics } from './diagnostics';

interface Placement {
  assignment: ScheduleAssignment;
  match: NormalizedMatch;
  start: number;
  end: number;
}

interface SearchState {
  placements: Map<string, Placement>;
  objective: ScheduleObjective;
  softRestDeficitByResource: Map<string, number>;
  refereeDutiesByTeam: Map<string, number>;
  key: string;
}

interface SearchCounters {
  expandedStates: number;
  candidateEvaluations: number;
  beamPeak: number;
  repairPasses: number;
}

interface CandidateGenerationResult {
  candidates: Placement[];
  wallTimedOut: boolean;
  /** True when valid starts were deliberately omitted by a search bound. */
  truncated: boolean;
  /** Flexible referee selections that caused a hard conflict in this branch. */
  refereeNogoods: Set<string>;
}

function issue(
  code: ScheduleConflict['code'],
  message: string,
  extra: Omit<ScheduleConflict, 'code' | 'severity' | 'message'> = {},
): ScheduleConflict {
  return { code, severity: 'error', message, ...extra };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function ms(minutes: number): number {
  return minutes * 60_000;
}

function makeAssignment(
  match: NormalizedMatch,
  courtId: string,
  start: number,
  referee: ScheduleRefereeAssignment,
): Placement {
  const end = start + match.durationMs;
  return {
    match,
    start,
    end,
    assignment: {
      matchId: match.id,
      courtId,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      durationMinutes: match.durationMinutes,
      conditional: match.conditional,
      referee,
    },
  };
}

function refereeNogoodKey(matchId: string, teamId: string): string {
  return `${matchId}\u0000${teamId}`;
}

function refereeSelectionKey(match: NormalizedMatch, referee: ScheduleRefereeAssignment): string {
  if (referee.kind === 'loser_previous_same_court') {
    return `${referee.kind}:${referee.sourceMatchId}:${referee.reservedTeamIds.join(',')}`;
  }
  if (referee.kind === 'fixed_team') {
    const teamId = referee.reservedTeamIds[0];
    const rank = match.refereeRequirement.kind === 'idle_team_candidates'
      ? match.refereeRequirement.candidateTeamIds.indexOf(teamId)
      : 0;
    return `${referee.kind}:${String(Math.max(0, rank)).padStart(3, '0')}:${teamId}`;
  }
  return `${referee.kind}:${referee.reservedTeamIds.join(',')}`;
}

function refereeOptions(
  compiled: CompiledScheduleInput,
  match: NormalizedMatch,
  repairPass: number,
  refereeNogoods: ReadonlySet<string>,
): ScheduleRefereeAssignment[] {
  const requirement = match.refereeRequirement;
  const primaryOptions: ScheduleRefereeAssignment[] = requirement.kind === 'idle_team_candidates'
    ? requirement.candidateTeamIds
      .slice(0, Math.min(requirement.candidateTeamIds.length, repairPass + 1))
      .filter((teamId) => !refereeNogoods.has(refereeNogoodKey(match.id, teamId)))
      .map((teamId) => ({ kind: 'fixed_team', reservedTeamIds: [teamId] }))
    : [buildRefereeAssignment(compiled, match)];
  const primary = primaryOptions[0];
  if (
    compiled.referee.mode === 'hybrid'
    && requirement.kind !== 'none'
    && requirement.kind !== 'court_judge'
  ) {
    return [...primaryOptions, buildRefereeAssignment(compiled, match, true)];
  }
  return primary ? primaryOptions : [];
}

function pairHasHardParticipantConflict(
  candidate: Placement,
  existing: Placement,
): boolean {
  const sharesTeam = candidate.match.teamIds.some((teamId) => existing.match.teamIds.includes(teamId));
  const sharesPlayer = candidate.match.playerIds.some((playerId) => existing.match.playerIds.includes(playerId));
  if (!sharesTeam && !sharesPlayer) return false;
  if (overlaps(candidate.start, candidate.end, existing.start, existing.end)) return true;
  const [earlier, later] = candidate.end <= existing.start
    ? [candidate, existing]
    : [existing, candidate];
  const requiredRest = Math.max(earlier.match.minRestMinutes, later.match.minRestMinutes);
  return later.start < earlier.end + ms(requiredRest);
}

function softParticipantResourceIds(match: NormalizedMatch): string[] {
  return match.playerIds.length > 0
    ? match.playerIds.map((playerId) => `player:${playerId}`)
    : match.teamIds.map((teamId) => `team:${teamId}`);
}

function matchHasSoftParticipant(
  match: NormalizedMatch,
  resourceKind: 'player' | 'team',
  resourceId: string,
): boolean {
  if (resourceKind === 'player') {
    return match.playerIds.length > 0 && match.playerIds.includes(resourceId);
  }
  return match.playerIds.length === 0 && match.teamIds.includes(resourceId);
}

function refereeHasConflict(
  compiled: CompiledScheduleInput,
  candidate: Placement,
  existing: Placement,
  refereeNogoods?: Set<string>,
): boolean {
  const candidateRefTeams: readonly string[] = candidate.assignment.referee.reservedTeamIds;
  const existingRefTeams: readonly string[] = existing.assignment.referee.reservedTeamIds;

  let candidateSelectionConflict = candidateRefTeams.some((teamId) => candidate.match.teamIds.includes(teamId));
  let existingSelectionConflict = false;
  if (candidateRefTeams.some((teamId) => existing.match.teamIds.includes(teamId))) {
    if (overlaps(candidate.start, candidate.end, existing.start, existing.end)) candidateSelectionConflict = true;
    if (existing.start >= candidate.end && existing.start < candidate.end + ms(compiled.referee.minRestAfterRefMinutes)) {
      candidateSelectionConflict = true;
    }
  }
  if (existingRefTeams.some((teamId) => candidate.match.teamIds.includes(teamId))) {
    if (overlaps(candidate.start, candidate.end, existing.start, existing.end)) existingSelectionConflict = true;
    if (candidate.start >= existing.end && candidate.start < existing.end + ms(compiled.referee.minRestAfterRefMinutes)) {
      existingSelectionConflict = true;
    }
  }
  const sharedDutyConflict = candidateRefTeams.some((teamId) => (
    existingRefTeams.includes(teamId) && overlaps(candidate.start, candidate.end, existing.start, existing.end)
  ));
  if (sharedDutyConflict) {
    candidateSelectionConflict = true;
    existingSelectionConflict = true;
  }
  const conflict = candidateSelectionConflict || existingSelectionConflict;
  if (conflict && refereeNogoods) {
    if (
      candidateSelectionConflict
      &&
      candidate.assignment.referee.kind === 'fixed_team'
      && candidate.match.refereeRequirement.kind === 'idle_team_candidates'
    ) {
      refereeNogoods.add(refereeNogoodKey(candidate.match.id, candidate.assignment.referee.reservedTeamIds[0]));
    }
    if (
      existingSelectionConflict
      &&
      existing.assignment.referee.kind === 'fixed_team'
      && existing.match.refereeRequirement.kind === 'idle_team_candidates'
    ) {
      refereeNogoods.add(refereeNogoodKey(existing.match.id, existing.assignment.referee.reservedTeamIds[0]));
    }
  }
  return conflict;
}

function dependencyHasConflict(candidate: Placement, existing: Placement): boolean {
  const candidateDependency = candidate.match.dependencies.find((item) => item.matchId === existing.match.id);
  if (candidateDependency && candidate.start < existing.end + ms(candidateDependency.minGapMinutes)) return true;
  const existingDependency = existing.match.dependencies.find((item) => item.matchId === candidate.match.id);
  return Boolean(existingDependency && existing.start < candidate.end + ms(existingDependency.minGapMinutes));
}

function loserCourtHasConflict(candidate: Placement, existing: Placement): boolean {
  if (
    candidate.assignment.referee.kind === 'loser_previous_same_court'
    && candidate.assignment.referee.sourceMatchId === existing.match.id
    && candidate.assignment.courtId !== existing.assignment.courtId
  ) return true;
  return (
    existing.assignment.referee.kind === 'loser_previous_same_court'
    && existing.assignment.referee.sourceMatchId === candidate.match.id
    && candidate.assignment.courtId !== existing.assignment.courtId
  );
}

function isPlacementFeasible(
  compiled: CompiledScheduleInput,
  state: SearchState,
  candidate: Placement,
  refereeNogoods?: Set<string>,
): boolean {
  if (candidate.start < candidate.match.notBefore || candidate.end > candidate.match.mustEndBy) return false;
  const court = compiled.courtById.get(candidate.assignment.courtId);
  if (
    !court
    || !courtContains(court, candidate.start, candidate.end)
    || !courtPolicyAllows(candidate.match.courtPolicy, court.id, candidate.start, candidate.end)
  ) return false;
  if (
    candidate.match.courtPolicy
    && !candidate.match.courtPolicy.allowedCourtIds.includes(candidate.assignment.courtId)
  ) return false;
  if (candidate.match.locked && (
    candidate.match.locked.courtId !== candidate.assignment.courtId
    || candidate.match.locked.start !== candidate.start
  )) return false;

  for (const existing of state.placements.values()) {
    if (candidate.match.id === existing.match.id) continue;
    if (
      candidate.assignment.courtId === existing.assignment.courtId
      && overlaps(candidate.start, candidate.end, existing.start, existing.end)
    ) return false;
    if (dependencyHasConflict(candidate, existing)) return false;
    if (loserCourtHasConflict(candidate, existing)) return false;
    if (pairHasHardParticipantConflict(candidate, existing)) return false;
    if (refereeHasConflict(compiled, candidate, existing, refereeNogoods)) return false;
  }
  return true;
}

interface ObjectiveState {
  objective: ScheduleObjective;
  softRestDeficitByResource: Map<string, number>;
  refereeDutiesByTeam: Map<string, number>;
}

function refereeLoadSpread(dutiesByTeam: ReadonlyMap<string, number>): number {
  if (dutiesByTeam.size === 0) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (const duties of dutiesByTeam.values()) {
    minimum = Math.min(minimum, duties);
    maximum = Math.max(maximum, duties);
  }
  return maximum - minimum;
}

function computeObjective(compiled: CompiledScheduleInput, placements: Iterable<Placement>): ObjectiveState {
  const list = Array.from(placements);
  let publishedMoves = 0;
  let overtimeMinutes = 0;
  let softRestDeficitMinutes = 0;
  let makespan = compiled.window.start;
  let refereeFallbacks = 0;
  let courtAffinityPenalty = 0;
  let courtSwitches = 0;
  const refereeDutiesByTeam = new Map<string, number>();
  for (const match of compiled.matches) {
    for (const teamId of match.teamIds) refereeDutiesByTeam.set(teamId, 0);
  }
  for (const placement of list) {
    if (placement.match.published && (
      placement.match.published.courtId !== placement.assignment.courtId
      || placement.match.published.start !== placement.start
    )) publishedMoves += 1;
    overtimeMinutes += Math.max(0, (placement.end - compiled.window.end) / 60_000);
    makespan = Math.max(makespan, placement.end);
    courtAffinityPenalty += placement.match.courtAffinityPenalties[placement.assignment.courtId] ?? 0;
    if (placement.assignment.referee.kind === 'court_judge' && placement.assignment.referee.isFallback) {
      refereeFallbacks += 1;
    }
    for (const teamId of placement.assignment.referee.reservedTeamIds) {
      refereeDutiesByTeam.set(teamId, (refereeDutiesByTeam.get(teamId) ?? 0) + 1);
    }
  }
  const timelines = new Map<string, Placement[]>();
  for (const placement of list) {
    for (const resourceId of softParticipantResourceIds(placement.match)) {
      const timeline = timelines.get(resourceId) ?? [];
      timeline.push(placement);
      timelines.set(resourceId, timeline);
    }
  }
  const softRestDeficitByResource = new Map<string, number>();
  for (const [resourceId, timeline] of timelines) {
    timeline.sort((a, b) => a.start - b.start || a.match.id.localeCompare(b.match.id));
    let resourceDeficit = 0;
    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1];
      const current = timeline[index];
      const target = Math.max(previous.match.softRestMinutes, current.match.softRestMinutes);
      const actual = Math.max(0, (current.start - previous.end) / 60_000);
      const deficit = Math.max(0, target - actual);
      resourceDeficit += deficit;
      softRestDeficitMinutes += deficit;
      if (previous.assignment.courtId !== current.assignment.courtId) courtSwitches += 1;
    }
    softRestDeficitByResource.set(resourceId, resourceDeficit);
  }
  return {
    objective: {
      publishedMoves,
      overtimeMinutes,
      maxSoftRestDeficitMinutes: Math.max(0, ...softRestDeficitByResource.values()),
      softRestDeficitMinutes,
      makespanMinutes: list.length === 0 ? 0 : Math.max(0, (makespan - compiled.window.start) / 60_000),
      refereeFallbacks,
      courtAffinityPenalty,
      courtSwitches,
      refereeLoadSpread: refereeLoadSpread(refereeDutiesByTeam),
    },
    softRestDeficitByResource,
    refereeDutiesByTeam,
  };
}

function softPairCost(left: Placement, right: Placement): { rest: number; courtSwitch: number } {
  const target = Math.max(left.match.softRestMinutes, right.match.softRestMinutes);
  const actual = Math.max(0, (right.start - left.end) / 60_000);
  return {
    rest: Math.max(0, target - actual),
    courtSwitch: left.assignment.courtId === right.assignment.courtId ? 0 : 1,
  };
}

function objectiveWithPlacement(
  compiled: CompiledScheduleInput,
  state: SearchState,
  candidate: Placement,
): ObjectiveState {
  const next: ScheduleObjective = { ...state.objective };
  const softRestDeficitByResource = new Map(state.softRestDeficitByResource);
  const refereeDutiesByTeam = new Map(state.refereeDutiesByTeam);
  if (candidate.match.published && (
    candidate.match.published.courtId !== candidate.assignment.courtId
    || candidate.match.published.start !== candidate.start
  )) next.publishedMoves += 1;
  next.overtimeMinutes += Math.max(0, (candidate.end - compiled.window.end) / 60_000);
  next.makespanMinutes = Math.max(
    next.makespanMinutes,
    Math.max(0, (candidate.end - compiled.window.start) / 60_000),
  );
  if (candidate.assignment.referee.kind === 'court_judge' && candidate.assignment.referee.isFallback) {
    next.refereeFallbacks += 1;
  }
  for (const teamId of candidate.assignment.referee.reservedTeamIds) {
    refereeDutiesByTeam.set(teamId, (refereeDutiesByTeam.get(teamId) ?? 0) + 1);
  }
  next.courtAffinityPenalty += candidate.match.courtAffinityPenalties[candidate.assignment.courtId] ?? 0;

  const existing = Array.from(state.placements.values());
  const candidateUsesPlayers = candidate.match.playerIds.length > 0;
  const candidateResourceKind = candidateUsesPlayers ? 'player' : 'team';
  const candidateResourceIds = candidateUsesPlayers ? candidate.match.playerIds : candidate.match.teamIds;
  for (const candidateResourceId of candidateResourceIds) {
    const resourceId = `${candidateResourceKind}:${candidateResourceId}`;
    let resourceDelta = 0;
    let previous: Placement | null = null;
    let following: Placement | null = null;
    for (const placement of existing) {
      if (!matchHasSoftParticipant(placement.match, candidateResourceKind, candidateResourceId)) continue;
      if (placement.end <= candidate.start && (!previous || placement.end > previous.end)) previous = placement;
      if (placement.start >= candidate.end && (!following || placement.start < following.start)) following = placement;
    }
    if (previous && following) {
      const removed = softPairCost(previous, following);
      next.softRestDeficitMinutes -= removed.rest;
      resourceDelta -= removed.rest;
      next.courtSwitches -= removed.courtSwitch;
    }
    if (previous) {
      const added = softPairCost(previous, candidate);
      next.softRestDeficitMinutes += added.rest;
      resourceDelta += added.rest;
      next.courtSwitches += added.courtSwitch;
    }
    if (following) {
      const added = softPairCost(candidate, following);
      next.softRestDeficitMinutes += added.rest;
      resourceDelta += added.rest;
      next.courtSwitches += added.courtSwitch;
    }
    softRestDeficitByResource.set(
      resourceId,
      Math.max(0, (softRestDeficitByResource.get(resourceId) ?? 0) + resourceDelta),
    );
  }
  next.softRestDeficitMinutes = Math.max(0, next.softRestDeficitMinutes);
  next.maxSoftRestDeficitMinutes = Math.max(0, ...softRestDeficitByResource.values());
  next.courtSwitches = Math.max(0, next.courtSwitches);
  next.refereeLoadSpread = refereeLoadSpread(refereeDutiesByTeam);
  return { objective: next, softRestDeficitByResource, refereeDutiesByTeam };
}

const objectiveKeys: Array<keyof ScheduleObjective> = [
  'publishedMoves',
  'overtimeMinutes',
  'maxSoftRestDeficitMinutes',
  'softRestDeficitMinutes',
  'makespanMinutes',
  'refereeFallbacks',
  'courtAffinityPenalty',
  'courtSwitches',
  'refereeLoadSpread',
];

function placementsKey(compiled: CompiledScheduleInput, placements: ReadonlyMap<string, Placement>): string {
  return compiled.matches
    .map((match) => placements.get(match.id))
    .filter((placement): placement is Placement => Boolean(placement))
    .map((placement) => (
      `${placement.match.id}@${placement.start}@${placement.assignment.courtId}@${refereeSelectionKey(placement.match, placement.assignment.referee)}`
    ))
    .join('|');
}

function compareStates(left: SearchState, right: SearchState): number {
  for (const key of objectiveKeys) {
    const difference = left.objective[key] - right.objective[key];
    if (difference !== 0) return difference;
  }
  return left.key.localeCompare(right.key);
}

function readyMatches(compiled: CompiledScheduleInput, state: SearchState): NormalizedMatch[] {
  return compiled.matches
    .filter((match) => !state.placements.has(match.id))
    .filter((match) => match.dependencies.every((dependency) => state.placements.has(dependency.matchId)))
    .sort((a, b) => (
      b.criticalPathMinutes - a.criticalPathMinutes
      || a.mustEndBy - b.mustEndBy
      || b.stagePriority - a.stagePriority
      || a.notBefore - b.notBefore
      || a.id.localeCompare(b.id)
    ));
}

/**
 * The public beam/topK settings are upper bounds. Large sessions use a
 * deterministic complexity cap so 90-170 match previews do not spend the
 * entire wall budget exploring near-equivalent court permutations.
 */
function effectiveBeamWidth(compiled: CompiledScheduleInput): number {
  const complexityCap = Math.max(4, Math.floor(720 / Math.max(1, compiled.matches.length)));
  return Math.min(compiled.options.beamWidth, complexityCap);
}

function effectiveTopK(compiled: CompiledScheduleInput): number {
  const complexityCap = Math.max(6, Math.floor(720 / Math.max(1, compiled.matches.length)));
  return Math.min(compiled.options.topK, complexityCap);
}

/**
 * Scheduling only the first ready match is not a safe branching rule. A long
 * critical path can rank ahead of a match whose deadline requires the scarce
 * first court slot. Keep the branching bounded, but also explore the most
 * urgent earlier-deadline job so beam search can choose deadline-first order.
 */
function readyMatchChoices(compiled: CompiledScheduleInput, state: SearchState): {
  matches: NormalizedMatch[];
  truncated: boolean;
} {
  const ready = readyMatches(compiled, state);
  if (ready.length <= 1) return { matches: ready, truncated: false };
  const primary = ready[0];
  const urgent = ready
    .slice(1)
    .filter((match) => match.mustEndBy < primary.mustEndBy)
    .sort((left, right) => left.mustEndBy - right.mustEndBy || left.id.localeCompare(right.id))[0];
  const matches = urgent ? [primary, urgent] : [primary];
  return { matches, truncated: ready.length > matches.length };
}

function floorToQuantum(timestamp: number, windowStart: number, quantumMs: number): number {
  if (timestamp <= windowStart) return windowStart;
  return windowStart + Math.floor((timestamp - windowStart) / quantumMs) * quantumMs;
}

function placementKey(placement: Placement): string {
  const refereeKey = refereeSelectionKey(placement.match, placement.assignment.referee);
  return `${placement.assignment.courtId}@${placement.start}@${refereeKey}`;
}

function earliestStart(compiled: CompiledScheduleInput, state: SearchState, match: NormalizedMatch): number {
  let earliest = Math.max(compiled.window.start, match.notBefore);
  for (const dependency of match.dependencies) {
    const source = state.placements.get(dependency.matchId);
    if (source) earliest = Math.max(earliest, source.end + ms(dependency.minGapMinutes));
  }
  return ceilToQuantum(earliest, compiled.window.start, compiled.options.quantumMs);
}

function candidateOrdering(compiled: CompiledScheduleInput, left: Placement, right: Placement): number {
  const leftPublished = left.match.published && (
    left.match.published.courtId !== left.assignment.courtId || left.match.published.start !== left.start
  ) ? 1 : 0;
  const rightPublished = right.match.published && (
    right.match.published.courtId !== right.assignment.courtId || right.match.published.start !== right.start
  ) ? 1 : 0;
  const leftFallback = left.assignment.referee.kind === 'court_judge' && left.assignment.referee.isFallback ? 1 : 0;
  const rightFallback = right.assignment.referee.kind === 'court_judge' && right.assignment.referee.isFallback ? 1 : 0;
  return leftPublished - rightPublished
    || left.end - right.end
    || leftFallback - rightFallback
    || (left.match.courtAffinityPenalties[left.assignment.courtId] ?? 0)
      - (right.match.courtAffinityPenalties[right.assignment.courtId] ?? 0)
    || left.assignment.courtId.localeCompare(right.assignment.courtId)
    || refereeSelectionKey(left.match, left.assignment.referee)
      .localeCompare(refereeSelectionKey(right.match, right.assignment.referee));
}

function generateCandidates(
  compiled: CompiledScheduleInput,
  state: SearchState,
  match: NormalizedMatch,
  counters: SearchCounters,
  wallDeadline: number,
  repairPass: number,
  activeRefereeNogoods: ReadonlySet<string>,
  strategicStartsByMatchId: ReadonlyMap<string, readonly number[]>,
): CandidateGenerationResult {
  const earlyCandidates = new Map<string, Placement>();
  const deadlineCandidates = new Map<string, Placement>();
  const refereeNogoods = new Set<string>();
  const earliest = earliestStart(compiled, state, match);
  const sourceCourt = (
    compiled.referee.mode !== 'hybrid'
    && match.refereeRequirement.kind === 'loser_previous_same_court'
  )
    ? state.placements.get(match.refereeRequirement.sourceMatchId)?.assignment.courtId
    : undefined;
  const sourceCourts = sourceCourt
    ? compiled.courts.filter((court) => court.id === sourceCourt)
    : compiled.courts;
  const courts = match.courtPolicy
    ? sourceCourts.filter((court) => match.courtPolicy?.allowedCourtIds.includes(court.id))
    : sourceCourts;
  const candidateLimit = effectiveTopK(compiled);
  const perCourtLimit = Math.max(2, Math.ceil(candidateLimit / Math.max(1, courts.length)) + 1);
  let truncated = false;

  const tryStart = (
    courtId: string,
    start: number,
    target: Map<string, Placement>,
  ): boolean => {
    if (Date.now() > wallDeadline) return false;
    for (const referee of refereeOptions(compiled, match, repairPass, activeRefereeNogoods)) {
      counters.candidateEvaluations += 1;
      const candidate = makeAssignment(match, courtId, start, referee);
      if (!isPlacementFeasible(compiled, state, candidate, refereeNogoods)) continue;
      const key = placementKey(candidate);
      if (!earlyCandidates.has(key) && !deadlineCandidates.has(key)) target.set(key, candidate);
    }
    return true;
  };

  for (const court of courts) {
    let acceptedForCourt = 0;
    for (const range of court.availability) {
      let start = ceilToQuantum(Math.max(range.start, earliest), compiled.window.start, compiled.options.quantumMs);
      const latestEnd = Math.min(range.end, match.mustEndBy);
      while (start + match.durationMs <= latestEnd && acceptedForCourt < perCourtLimit) {
        const before = earlyCandidates.size;
        if (!tryStart(court.id, start, earlyCandidates)) {
          return { candidates: [], wallTimedOut: true, truncated, refereeNogoods };
        }
        acceptedForCourt += earlyCandidates.size - before;
        start += compiled.options.quantumMs;
      }
      if (start + match.durationMs <= latestEnd) truncated = true;
      if (acceptedForCourt >= perCourtLimit) break;
    }

    // Earliest-only topK misses schedules where another ready match must own
    // the beginning of the day. Preserve starts immediately after an earlier
    // deadline (plus locked interval boundaries) as bounded alternatives.
    for (const start of strategicStartsByMatchId.get(match.id) ?? []) {
      if (start < earliest || start < match.notBefore || start + match.durationMs > match.mustEndBy) continue;
      if (!courtContains(court, start, start + match.durationMs)) continue;
      if (!courtPolicyAllows(match.courtPolicy, court.id, start, start + match.durationMs)) continue;
      if (!tryStart(court.id, start, deadlineCandidates)) {
        return { candidates: [], wallTimedOut: true, truncated, refereeNogoods };
      }
    }
  }
  const early = [...earlyCandidates.values()].sort((a, b) => candidateOrdering(compiled, a, b));
  const strategic = [...deadlineCandidates.values()].sort((a, b) => candidateOrdering(compiled, a, b));
  const strategicBudget = Math.min(
    strategic.length,
    Math.max(1, Math.min(courts.length, Math.floor(candidateLimit / 2))),
  );
  const selectedStrategic = strategic.slice(0, strategicBudget);
  const candidates = [
    ...early.slice(0, Math.max(0, candidateLimit - selectedStrategic.length)),
    ...selectedStrategic,
  ].sort((a, b) => candidateOrdering(compiled, a, b));
  if (early.length + strategic.length > candidates.length) truncated = true;
  return { candidates, wallTimedOut: false, truncated, refereeNogoods };
}

function initialLockedState(
  compiled: CompiledScheduleInput,
  repairPass: number,
  refereeNogoods: ReadonlySet<string>,
): {
  state: SearchState;
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
} {
  const placements = new Map<string, Placement>();
  for (const match of compiled.matches) {
    if (!match.locked) continue;
    const referee = refereeOptions(compiled, match, repairPass, refereeNogoods)[0]
      ?? buildRefereeAssignment(compiled, match);
    const placement = makeAssignment(
      match,
      match.locked.courtId,
      match.locked.start,
      referee,
    );
    placements.set(match.id, placement);
  }
  let assignments = Array.from(placements.values()).map((placement) => placement.assignment);
  let validation = validateCompiledSchedule(compiled, assignments, { allowPartial: true });
  if (!validation.valid && compiled.referee.mode === 'hybrid') {
    for (const [matchId, placement] of placements) {
      if (placement.assignment.referee.reservedTeamIds.length === 0) continue;
      const fallback = makeAssignment(placement.match, placement.assignment.courtId, placement.start, buildRefereeAssignment(compiled, placement.match, true));
      placements.set(matchId, fallback);
    }
    assignments = Array.from(placements.values()).map((placement) => placement.assignment);
    validation = validateCompiledSchedule(compiled, assignments, { allowPartial: true });
  }
  const objectiveState = computeObjective(compiled, placements.values());
  return {
    state: {
      placements,
      ...objectiveState,
      key: placementsKey(compiled, placements),
    },
    conflicts: validation.conflicts,
    warnings: validation.warnings,
  };
}

function refereeNogoodsFromConflicts(
  state: SearchState,
  conflicts: readonly ScheduleConflict[],
): Set<string> {
  const candidates = new Set<string>();
  for (const conflict of conflicts) {
    if (!conflict.code.startsWith('REFEREE_')) continue;
    const involvedMatches = new Set(conflict.matchIds ?? []);
    for (const placement of state.placements.values()) {
      if (
        placement.match.refereeRequirement.kind !== 'idle_team_candidates'
        || placement.assignment.referee.kind !== 'fixed_team'
      ) continue;
      const teamId = placement.assignment.referee.reservedTeamIds[0];
      if (
        involvedMatches.has(placement.match.id)
        || conflict.teamId === teamId
      ) candidates.add(refereeNogoodKey(placement.match.id, teamId));
    }
  }
  return candidates;
}

function nextRefereeNogood(
  compiled: CompiledScheduleInput,
  candidates: ReadonlySet<string>,
  activeNogoods: ReadonlySet<string>,
  repairPass: number,
): string | null {
  for (const candidate of [...candidates].sort()) {
    if (activeNogoods.has(candidate)) continue;
    const separator = candidate.indexOf('\u0000');
    if (separator < 0) continue;
    const matchId = candidate.slice(0, separator);
    const teamId = candidate.slice(separator + 1);
    const match = compiled.matchById.get(matchId);
    if (match?.refereeRequirement.kind !== 'idle_team_candidates') continue;
    const visibleOnNextPass = match.refereeRequirement.candidateTeamIds.slice(0, repairPass + 2);
    if (!visibleOnNextPass.includes(teamId)) continue;
    const hasReplacement = visibleOnNextPass.some((replacementId) => (
      replacementId !== teamId
      && !activeNogoods.has(refereeNogoodKey(matchId, replacementId))
    ));
    if (hasReplacement) return candidate;
  }
  return null;
}

function resultMetrics(
  startedAt: number,
  counters: SearchCounters,
  scheduledMatches: number,
  totalMatches: number,
): ScheduleSolverMetrics {
  return {
    elapsedMs: Math.max(0, Date.now() - startedAt),
    expandedStates: counters.expandedStates,
    candidateEvaluations: counters.candidateEvaluations,
    beamPeak: counters.beamPeak,
    repairPasses: counters.repairPasses,
    scheduledMatches,
    totalMatches,
  };
}

function partialResult(
  compiled: CompiledScheduleInput,
  state: SearchState,
  compileWarnings: ScheduleConflict[],
  conflict: ScheduleConflict,
  startedAt: number,
  counters: SearchCounters,
  status: 'timeout' | 'infeasible',
): ScheduleSolverResult {
  const assignments = Array.from(state.placements.values())
    .map((placement) => placement.assignment)
    .sort((a, b) => a.start.localeCompare(b.start) || a.courtId.localeCompare(b.courtId) || a.matchId.localeCompare(b.matchId));
  const partialValidation = validateCompiledSchedule(compiled, assignments, { allowPartial: true });
  return {
    status,
    publishable: false,
    solverVersion: SCHEDULE_SOLVER_VERSION,
    inputHash: compiled.inputHash,
    scheduleHash: partialValidation.valid ? scheduleHashForAssignments(compiled.inputHash, assignments) : null,
    assignments,
    objective: state.objective,
    conflicts: [conflict, ...partialValidation.conflicts],
    warnings: [...compileWarnings, ...partialValidation.warnings],
    metrics: resultMetrics(startedAt, counters, assignments.length, compiled.matches.length),
    diagnostics: partialValidation.diagnostics,
  };
}

export function solveSchedule(input: ScheduleSolverInput): ScheduleSolverResult {
  const startedAt = Date.now();
  const counters: SearchCounters = {
    expandedStates: 0,
    candidateEvaluations: 0,
    beamPeak: 1,
    repairPasses: 0,
  };
  const compileResult = compileScheduleInput(input);
  if (!compileResult.compiled) {
    return {
      status: 'infeasible',
      publishable: false,
      solverVersion: SCHEDULE_SOLVER_VERSION,
      inputHash: compileResult.inputHash,
      scheduleHash: null,
      assignments: [],
      objective: null,
      conflicts: compileResult.conflicts,
      warnings: compileResult.warnings,
      metrics: resultMetrics(startedAt, counters, 0, input.matches?.length ?? 0),
      diagnostics: null,
    };
  }
  const compiled = compileResult.compiled;
  const wallDeadline = startedAt + compiled.options.maxWallMs;
  const activeRefereeNogoods = new Set<string>();
  const strategicStartsByMatchId = new Map<string, readonly number[]>();
  for (const match of compiled.matches) {
    const strategicStarts = new Set<number>();
    for (const other of compiled.matches) {
      if (other.id === match.id) continue;
      if (other.mustEndBy < match.mustEndBy) {
        strategicStarts.add(ceilToQuantum(other.mustEndBy, compiled.window.start, compiled.options.quantumMs));
      }
      if (other.locked) {
        strategicStarts.add(ceilToQuantum(
          other.locked.start + other.durationMs,
          compiled.window.start,
          compiled.options.quantumMs,
        ));
        strategicStarts.add(floorToQuantum(
          other.locked.start - match.durationMs,
          compiled.window.start,
          compiled.options.quantumMs,
        ));
      }
    }
    strategicStartsByMatchId.set(match.id, [...strategicStarts].sort((left, right) => left - right));
  }

  repairSearch: while (true) {
    const initial = initialLockedState(compiled, counters.repairPasses, activeRefereeNogoods);
    if (initial.conflicts.length > 0) {
      const repairCandidate = nextRefereeNogood(
        compiled,
        refereeNogoodsFromConflicts(initial.state, initial.conflicts),
        activeRefereeNogoods,
        counters.repairPasses,
      );
      if (repairCandidate && counters.repairPasses < compiled.options.maxRepairPasses) {
        activeRefereeNogoods.add(repairCandidate);
        counters.repairPasses += 1;
        continue repairSearch;
      }
      const repairBudgetExhausted = Boolean(repairCandidate);
      return {
        status: repairBudgetExhausted ? 'timeout' : 'infeasible',
        publishable: false,
        solverVersion: SCHEDULE_SOLVER_VERSION,
        inputHash: compiled.inputHash,
        scheduleHash: null,
        assignments: Array.from(initial.state.placements.values()).map((placement) => placement.assignment),
        objective: initial.state.objective,
        conflicts: [
          ...(repairBudgetExhausted ? [issue(
            'TIMEOUT_OPERATION_BUDGET',
            'Locked referee alternatives remain, but the referee repair budget is exhausted.',
            { details: {
              reason: 'referee_repair_budget_exhausted',
              maxRepairPasses: compiled.options.maxRepairPasses,
            } },
          )] : []),
          ...initial.conflicts.map((conflict) => ({
            ...conflict,
            details: { ...(conflict.details ?? {}), phase: 'locked_preflight' },
          })),
        ],
        warnings: [...compileResult.warnings, ...initial.warnings],
        metrics: resultMetrics(startedAt, counters, initial.state.placements.size, compiled.matches.length),
        diagnostics: buildScheduleDiagnostics(
          compiled,
          Array.from(initial.state.placements.values()).map((placement) => placement.assignment),
        ),
      };
    }

    let beam: SearchState[] = [initial.state];
    let searchWasTruncated = false;
    while (beam[0].placements.size < compiled.matches.length) {
      if (Date.now() > wallDeadline) {
        return partialResult(
          compiled,
          beam[0],
          compileResult.warnings,
          issue('TIMEOUT_WALL_CLOCK', 'Schedule search exceeded its wall-clock safety limit.'),
          startedAt,
          counters,
          'timeout',
        );
      }
      if (counters.expandedStates >= compiled.options.maxExpandedStates) {
        return partialResult(
          compiled,
          beam[0],
          compileResult.warnings,
          issue('TIMEOUT_OPERATION_BUDGET', 'Schedule search exhausted its deterministic state budget.', {
            details: { maxExpandedStates: compiled.options.maxExpandedStates },
          }),
          startedAt,
          counters,
          'timeout',
        );
      }

      const children: SearchState[] = [];
      const repairCandidates = new Set<string>();
      let blockedMatchId: string | null = null;
      let wallTimedOut = false;
      for (const state of beam) {
        const choices = readyMatchChoices(compiled, state);
        if (choices.matches.length === 0) {
          blockedMatchId = null;
          continue;
        }
        if (choices.truncated) searchWasTruncated = true;
        for (const match of choices.matches) {
          blockedMatchId = match.id;
          const generated = generateCandidates(
            compiled,
            state,
            match,
            counters,
            wallDeadline,
            counters.repairPasses,
            activeRefereeNogoods,
            strategicStartsByMatchId,
          );
          for (const nogood of generated.refereeNogoods) repairCandidates.add(nogood);
          if (generated.truncated) searchWasTruncated = true;
          if (generated.wallTimedOut) {
            wallTimedOut = true;
            break;
          }
          for (const candidate of generated.candidates) {
            if (counters.expandedStates >= compiled.options.maxExpandedStates) break;
            counters.expandedStates += 1;
            const placements = new Map(state.placements);
            placements.set(match.id, candidate);
            const objectiveState = objectiveWithPlacement(compiled, state, candidate);
            children.push({
              placements,
              ...objectiveState,
              key: placementsKey(compiled, placements),
            });
          }
        }
        if (wallTimedOut) break;
      }
      if (wallTimedOut) {
        return partialResult(
          compiled,
          beam[0],
          compileResult.warnings,
          issue('TIMEOUT_WALL_CLOCK', 'Schedule search exceeded its wall-clock safety limit.'),
          startedAt,
          counters,
          'timeout',
        );
      }
      if (children.length === 0) {
        const repairCandidate = nextRefereeNogood(
          compiled,
          repairCandidates,
          activeRefereeNogoods,
          counters.repairPasses,
        );
        if (repairCandidate && counters.repairPasses < compiled.options.maxRepairPasses) {
          activeRefereeNogoods.add(repairCandidate);
          counters.repairPasses += 1;
          continue repairSearch;
        }
        const repairBudgetExhausted = Boolean(repairCandidate);
        const bounded = searchWasTruncated || repairBudgetExhausted;
        const code = bounded
          ? 'TIMEOUT_OPERATION_BUDGET'
          : blockedMatchId
            ? 'NO_FEASIBLE_PLACEMENT'
            : 'NO_READY_MATCH';
        return partialResult(
          compiled,
          beam[0],
          compileResult.warnings,
          issue(code, bounded
            ? 'Bounded schedule search exhausted its retained alternatives; feasibility is unknown.'
            : blockedMatchId
              ? 'No feasible joint time/court/referee placement remains for the next match.'
              : 'No dependency-ready match remains.', {
            matchIds: blockedMatchId ? [blockedMatchId] : undefined,
            ...(bounded ? {
              details: {
                reason: repairBudgetExhausted
                  ? 'referee_repair_budget_exhausted'
                  : 'bounded_search_exhausted',
                ...(repairBudgetExhausted
                  ? { maxRepairPasses: compiled.options.maxRepairPasses }
                  : {}),
              },
            } : blockedMatchId ? {
              details: {
                reason: 'hard_constraints_exhausted',
                courtPolicy: compiled.matchById.get(blockedMatchId)?.courtPolicy ?? null,
                activeAllowedCourtIds: compiled.courts
                  .filter((court) => (
                    court.availability.length > 0
                    && (compiled.matchById.get(blockedMatchId)?.courtPolicy?.allowedCourtIds.includes(court.id) ?? true)
                  ))
                  .map((court) => court.id),
              },
            } : {}),
          }),
          startedAt,
          counters,
          bounded ? 'timeout' : 'infeasible',
        );
      }

      children.sort(compareStates);
      const unique = new Map<string, SearchState>();
      for (const child of children) {
        const key = child.key;
        if (!unique.has(key)) unique.set(key, child);
        if (unique.size >= effectiveBeamWidth(compiled)) break;
      }
      if (new Set(children.map((child) => child.key)).size > unique.size) searchWasTruncated = true;
      beam = Array.from(unique.values());
      counters.beamPeak = Math.max(counters.beamPeak, beam.length);
    }

    beam.sort(compareStates);
    let finalValidation: ReturnType<typeof validateCompiledSchedule> | null = null;
    let finalState: SearchState | null = null;
    for (const state of beam) {
      const assignments = Array.from(state.placements.values()).map((placement) => placement.assignment);
      const validation = validateCompiledSchedule(compiled, assignments);
      if (validation.valid && validation.publishable) {
        finalValidation = validation;
        finalState = state;
        break;
      }
      if (!finalValidation) {
        finalValidation = validation;
        finalState = state;
      }
    }
    const state = finalState ?? beam[0];
    const validation = finalValidation as ReturnType<typeof validateCompiledSchedule>;
    const assignments = Array.from(state.placements.values())
      .map((placement) => placement.assignment)
      .sort((a, b) => a.start.localeCompare(b.start) || a.courtId.localeCompare(b.courtId) || a.matchId.localeCompare(b.matchId));
    if (!validation.valid || !validation.publishable) {
      return {
        status: 'infeasible',
        publishable: false,
        solverVersion: SCHEDULE_SOLVER_VERSION,
        inputHash: compiled.inputHash,
        scheduleHash: null,
        assignments,
        objective: validation.objective,
        conflicts: validation.conflicts,
        warnings: [...compileResult.warnings, ...validation.warnings],
        metrics: resultMetrics(startedAt, counters, assignments.length, compiled.matches.length),
        diagnostics: validation.diagnostics,
      };
    }
    const warnings = [...compileResult.warnings, ...initial.warnings, ...validation.warnings];
    return {
      status: warnings.length > 0 ? 'feasible_with_warnings' : 'feasible',
      publishable: true,
      solverVersion: SCHEDULE_SOLVER_VERSION,
      inputHash: compiled.inputHash,
      scheduleHash: validation.scheduleHash,
      assignments,
      objective: validation.objective,
      conflicts: [],
      warnings,
      metrics: resultMetrics(startedAt, counters, assignments.length, compiled.matches.length),
      diagnostics: validation.diagnostics,
    };
  }
}
