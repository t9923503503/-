import {
  buildRefereeAssignment,
  compileScheduleInput,
  courtContains,
  courtPolicyAllows,
  isQuantumAligned,
  type CompiledScheduleInput,
  type NormalizedMatch,
} from './compile';
import { deterministicHash } from './hash';
import { buildScheduleDiagnostics } from './diagnostics';
import {
  SCHEDULE_SOLVER_VERSION,
  type ScheduleAssignment,
  type ScheduleConflict,
  type ScheduleDiagnostics,
  type ScheduleObjective,
  type ScheduleSolverInput,
  type ScheduleValidationOptions,
  type ScheduleValidationResult,
} from './types';

interface ParsedAssignment {
  assignment: ScheduleAssignment;
  match: NormalizedMatch;
  start: number;
  end: number;
}

interface CompiledValidationResult {
  valid: boolean;
  publishable: boolean;
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
  objective: ScheduleObjective | null;
  scheduleHash: string | null;
  diagnostics: ScheduleDiagnostics;
}

function issue(
  code: ScheduleConflict['code'],
  message: string,
  extra: Omit<ScheduleConflict, 'code' | 'severity' | 'message'> = {},
  severity: ScheduleConflict['severity'] = 'error',
): ScheduleConflict {
  return { code, severity, message, ...extra };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function minutes(ms: number): number {
  return ms / 60_000;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function sameStrings(a: string[], b: string[]): boolean {
  const left = sortedUnique(a);
  const right = sortedUnique(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function softParticipantResourceIds(match: NormalizedMatch): string[] {
  return match.playerIds.length > 0
    ? match.playerIds.map((playerId) => `player:${playerId}`)
    : match.teamIds.map((teamId) => `team:${teamId}`);
}

function canonicalAssignments(assignments: ScheduleAssignment[]): ScheduleAssignment[] {
  return assignments
    .map((assignment) => ({
      ...assignment,
      referee: {
        ...assignment.referee,
        reservedTeamIds: assignment.referee.reservedTeamIds.slice().sort(),
      },
    } as ScheduleAssignment))
    .sort((a, b) => a.matchId.localeCompare(b.matchId));
}

export function scheduleHashForAssignments(
  inputHash: string,
  assignments: ScheduleAssignment[],
): string {
  return deterministicHash({
    solverVersion: SCHEDULE_SOLVER_VERSION,
    inputHash,
    assignments: canonicalAssignments(assignments),
  });
}

function expectedRefereeIsValid(
  compiled: CompiledScheduleInput,
  parsed: ParsedAssignment,
  warnings: ScheduleConflict[],
): boolean {
  const actual = parsed.assignment.referee;
  const expected = buildRefereeAssignment(compiled, parsed.match);
  const requirement = parsed.match.refereeRequirement;
  const mode = compiled.referee.mode;
  if (mode === 'hybrid' && actual.kind === 'court_judge' && actual.isFallback) {
    const canFallback = requirement.kind === 'idle_team_candidates'
      || expected.kind === 'fixed_team'
      || expected.kind === 'loser_previous_same_court'
      || (expected.kind === 'court_judge' && Boolean(expected.isFallback));
    if (!canFallback) return false;
    warnings.push(issue('HYBRID_REFEREE_FALLBACK', 'Hybrid mode fell back to a court judge.', {
      matchIds: [parsed.match.id],
      courtId: parsed.assignment.courtId,
    }, 'warning'));
    return true;
  }
  if (requirement.kind === 'idle_team_candidates') {
    return actual.kind === 'fixed_team'
      && actual.reservedTeamIds.length === 1
      && requirement.candidateTeamIds.includes(actual.reservedTeamIds[0]);
  }
  if (actual.kind !== expected.kind) return false;
  if (!sameStrings(actual.reservedTeamIds, expected.reservedTeamIds)) return false;
  if (actual.kind === 'court_judge' && expected.kind === 'court_judge') {
    return Boolean(actual.isFallback) === Boolean(expected.isFallback);
  }
  if (actual.kind === 'loser_previous_same_court' && expected.kind === 'loser_previous_same_court') {
    return actual.sourceMatchId === expected.sourceMatchId;
  }
  return true;
}

function calculateObjective(
  compiled: CompiledScheduleInput,
  parsed: ParsedAssignment[],
): ScheduleObjective {
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
  for (const item of parsed) {
    const { assignment, match, end } = item;
    if (match.published && (
      match.published.courtId !== assignment.courtId || match.published.start !== item.start
    )) publishedMoves += 1;
    overtimeMinutes += Math.max(0, minutes(end - compiled.window.end));
    makespan = Math.max(makespan, end);
    if (assignment.referee.kind === 'court_judge' && assignment.referee.isFallback) refereeFallbacks += 1;
    for (const teamId of assignment.referee.reservedTeamIds) {
      refereeDutiesByTeam.set(teamId, (refereeDutiesByTeam.get(teamId) ?? 0) + 1);
    }
    courtAffinityPenalty += match.courtAffinityPenalties[assignment.courtId] ?? 0;
  }

  const teamTimeline = new Map<string, ParsedAssignment[]>();
  for (const item of parsed) {
    for (const resourceId of softParticipantResourceIds(item.match)) {
      const list = teamTimeline.get(resourceId) ?? [];
      list.push(item);
      teamTimeline.set(resourceId, list);
    }
  }
  let maxSoftRestDeficitMinutes = 0;
  for (const list of teamTimeline.values()) {
    list.sort((a, b) => a.start - b.start || a.match.id.localeCompare(b.match.id));
    let resourceDeficit = 0;
    for (let index = 1; index < list.length; index += 1) {
      const previous = list[index - 1];
      const current = list[index];
      const target = Math.max(previous.match.softRestMinutes, current.match.softRestMinutes);
      const actual = Math.max(0, minutes(current.start - previous.end));
      const deficit = Math.max(0, target - actual);
      resourceDeficit += deficit;
      softRestDeficitMinutes += deficit;
      if (previous.assignment.courtId !== current.assignment.courtId) courtSwitches += 1;
    }
    maxSoftRestDeficitMinutes = Math.max(maxSoftRestDeficitMinutes, resourceDeficit);
  }

  let minRefereeDuties = Number.POSITIVE_INFINITY;
  let maxRefereeDuties = 0;
  for (const duties of refereeDutiesByTeam.values()) {
    minRefereeDuties = Math.min(minRefereeDuties, duties);
    maxRefereeDuties = Math.max(maxRefereeDuties, duties);
  }
  const refereeLoadSpread = refereeDutiesByTeam.size === 0
    ? 0
    : maxRefereeDuties - minRefereeDuties;

  return {
    publishedMoves,
    overtimeMinutes,
    maxSoftRestDeficitMinutes,
    softRestDeficitMinutes,
    makespanMinutes: parsed.length === 0 ? 0 : Math.max(0, minutes(makespan - compiled.window.start)),
    refereeFallbacks,
    courtAffinityPenalty,
    courtSwitches,
    refereeLoadSpread,
  };
}

export function validateCompiledSchedule(
  compiled: CompiledScheduleInput,
  assignments: ScheduleAssignment[],
  options: ScheduleValidationOptions = {},
): CompiledValidationResult {
  const allowPartial = Boolean(options.allowPartial);
  const conflicts: ScheduleConflict[] = [];
  const warnings: ScheduleConflict[] = [];
  const seen = new Set<string>();
  const parsed: ParsedAssignment[] = [];

  for (const assignment of assignments) {
    if (seen.has(assignment.matchId)) {
      conflicts.push(issue('DUPLICATE_ASSIGNMENT', 'A match has more than one schedule assignment.', {
        matchIds: [assignment.matchId],
      }));
      continue;
    }
    seen.add(assignment.matchId);
    const match = compiled.matchById.get(assignment.matchId);
    if (!match) {
      conflicts.push(issue('UNKNOWN_ASSIGNMENT_MATCH', 'Assignment points to an unknown match.', {
        matchIds: [assignment.matchId],
      }));
      continue;
    }
    const start = Date.parse(assignment.start);
    const end = Date.parse(assignment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      conflicts.push(issue('ASSIGNMENT_TIME_INVALID', 'Assignment timestamps must be valid and increasing.', {
        matchIds: [match.id], courtId: assignment.courtId,
      }));
      continue;
    }
    if (assignment.durationMinutes !== match.durationMinutes || end - start !== match.durationMs) {
      conflicts.push(issue('ASSIGNMENT_DURATION_MISMATCH', 'Assignment duration differs from the compiled duration.', {
        matchIds: [match.id],
        details: {
          expectedMinutes: match.durationMinutes,
          actualMinutes: assignment.durationMinutes,
          timestampMinutes: minutes(end - start),
        },
      }));
    }
    if (assignment.conditional !== match.conditional) {
      conflicts.push(issue('ASSIGNMENT_CONDITIONAL_MISMATCH', 'Assignment changed the conditional-slot marker.', {
        matchIds: [match.id],
      }));
    }
    if (!isQuantumAligned(start, compiled.window.start, compiled.options.quantumMs)) {
      conflicts.push(issue('ASSIGNMENT_TIME_MISALIGNED', 'Assignment start is not aligned to the five-minute quantum.', {
        matchIds: [match.id], courtId: assignment.courtId, at: assignment.start,
      }));
    }
    const court = compiled.courtById.get(assignment.courtId);
    if (!court) {
      conflicts.push(issue('ASSIGNMENT_COURT_UNKNOWN', 'Assignment points to an unknown court.', {
        matchIds: [match.id], courtId: assignment.courtId,
      }));
    } else if (!courtContains(court, start, end)) {
      conflicts.push(issue('COURT_UNAVAILABLE', 'Assignment is outside court availability.', {
        matchIds: [match.id], courtId: assignment.courtId,
      }));
    }
    if (!courtPolicyAllows(match.courtPolicy, assignment.courtId, start, end)) {
      conflicts.push(issue('TIER_COURT_POLICY_VIOLATION', 'Assignment uses a court outside the immutable tier policy.', {
        matchIds: [match.id], courtId: assignment.courtId,
        details: {
          mode: match.courtPolicy?.mode ?? null,
          allowedCourtIds: match.courtPolicy?.allowedCourtIds ?? [],
        },
      }));
    } else if (
      match.courtPolicy?.mode === 'approved_overflow'
      && !match.courtPolicy.preferredCourtIds.includes(assignment.courtId)
    ) {
      warnings.push(issue('TIER_COURT_FALLBACK_USED', 'Approved tier overflow used a non-preferred court.', {
        matchIds: [match.id], courtId: assignment.courtId,
        details: { preferredCourtIds: match.courtPolicy.preferredCourtIds },
      }, 'warning'));
    }
    if (start < match.notBefore) {
      conflicts.push(issue('NOT_BEFORE_VIOLATION', 'Assignment starts before the match not-before bound.', {
        matchIds: [match.id], at: assignment.start,
      }));
    }
    if (end > match.mustEndBy) {
      conflicts.push(issue('DEADLINE_EXCEEDED', 'Assignment ends after the match deadline.', {
        matchIds: [match.id], at: assignment.end,
      }));
    }
    if (match.locked && (match.locked.courtId !== assignment.courtId || match.locked.start !== start)) {
      conflicts.push(issue('LOCKED_ASSIGNMENT_CHANGED', 'Assignment changed a locked match.', {
        matchIds: [match.id], courtId: assignment.courtId,
      }));
    }
    const item = { assignment, match, start, end };
    if (!expectedRefereeIsValid(compiled, item, warnings)) {
      conflicts.push(issue('REFEREE_ASSIGNMENT_INVALID', 'Referee assignment does not match the session policy.', {
        matchIds: [match.id], courtId: assignment.courtId,
      }));
    }
    parsed.push(item);
  }

  if (!allowPartial) {
    for (const match of compiled.matches) {
      if (!seen.has(match.id)) {
        conflicts.push(issue('MISSING_ASSIGNMENT', 'Match has no schedule assignment.', { matchIds: [match.id] }));
      }
    }
  }

  const byId = new Map(parsed.map((item) => [item.match.id, item]));
  for (let leftIndex = 0; leftIndex < parsed.length; leftIndex += 1) {
    const left = parsed[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < parsed.length; rightIndex += 1) {
      const right = parsed[rightIndex];
      if (left.assignment.courtId === right.assignment.courtId && overlaps(left.start, left.end, right.start, right.end)) {
        conflicts.push(issue('COURT_OVERLAP', 'Two matches overlap on the same court.', {
          matchIds: [left.match.id, right.match.id], courtId: left.assignment.courtId,
        }));
      }
      const sharedTeams = left.match.teamIds.filter((teamId) => right.match.teamIds.includes(teamId));
      for (const teamId of sharedTeams) {
        if (overlaps(left.start, left.end, right.start, right.end)) {
          conflicts.push(issue('TEAM_OVERLAP', 'A possible team occupies two matches at once.', {
            matchIds: [left.match.id, right.match.id], teamId,
          }));
          continue;
        }
        const [earlier, later] = left.end <= right.start ? [left, right] : [right, left];
        const required = Math.max(earlier.match.minRestMinutes, later.match.minRestMinutes);
        const actual = minutes(later.start - earlier.end);
        if (actual < required) {
          conflicts.push(issue('TEAM_REST', 'A team does not receive the configured hard rest.', {
            matchIds: [earlier.match.id, later.match.id], teamId,
            details: { requiredMinutes: required, actualMinutes: actual },
          }));
        }
      }
      const sharedPlayers = left.match.playerIds.filter((playerId) => right.match.playerIds.includes(playerId));
      for (const playerId of sharedPlayers) {
        if (overlaps(left.start, left.end, right.start, right.end)) {
          conflicts.push(issue('PLAYER_OVERLAP', 'A player occupies two matches at once across the shared session.', {
            matchIds: [left.match.id, right.match.id], playerId,
          }));
          continue;
        }
        const [earlier, later] = left.end <= right.start ? [left, right] : [right, left];
        const required = Math.max(earlier.match.minRestMinutes, later.match.minRestMinutes);
        const actual = minutes(later.start - earlier.end);
        if (actual < required) {
          conflicts.push(issue('PLAYER_REST', 'A player does not receive hard rest between divisions.', {
            matchIds: [earlier.match.id, later.match.id], playerId,
            details: { requiredMinutes: required, actualMinutes: actual },
          }));
        }
      }
    }
  }

  for (const target of parsed) {
    for (const dependency of target.match.dependencies) {
      const source = byId.get(dependency.matchId);
      if (!source) {
        if (!allowPartial) {
          conflicts.push(issue('DEPENDENCY_ORDER', 'Scheduled match is missing its dependency assignment.', {
            matchIds: [dependency.matchId, target.match.id],
          }));
        }
        continue;
      }
      const requiredStart = source.end + dependency.minGapMinutes * 60_000;
      if (target.start < requiredStart) {
        conflicts.push(issue('DEPENDENCY_ORDER', 'Match starts before its dependency and gap are complete.', {
          matchIds: [source.match.id, target.match.id],
          details: { minGapMinutes: dependency.minGapMinutes },
        }));
      }
    }

    if (target.assignment.referee.kind === 'loser_previous_same_court') {
      const source = byId.get(target.assignment.referee.sourceMatchId);
      if (source) {
        if (source.end > target.start) {
          conflicts.push(issue('REFEREE_SOURCE_ORDER', 'Loser-referee duty starts before its source match ends.', {
            matchIds: [source.match.id, target.match.id],
          }));
        }
        if (source.assignment.courtId !== target.assignment.courtId) {
          conflicts.push(issue('REFEREE_SAME_COURT_REQUIRED', 'Loser-referee duty must remain on the source court.', {
            matchIds: [source.match.id, target.match.id], courtId: target.assignment.courtId,
          }));
        }
      } else if (!allowPartial) {
        conflicts.push(issue('REFEREE_SOURCE_ORDER', 'Loser-referee source has no assignment.', {
          matchIds: [target.assignment.referee.sourceMatchId, target.match.id],
        }));
      }
    }
  }

  const refereeDuties = parsed.flatMap((item) => item.assignment.referee.reservedTeamIds.map((teamId) => ({
    teamId,
    item,
  })));
  for (const duty of refereeDuties) {
    for (const matchItem of parsed) {
      if (!matchItem.match.teamIds.includes(duty.teamId)) continue;
      if (overlaps(duty.item.start, duty.item.end, matchItem.start, matchItem.end)) {
        conflicts.push(issue('REFEREE_TEAM_OVERLAP', 'A team is scheduled to referee and play at the same time.', {
          matchIds: [duty.item.match.id, matchItem.match.id], teamId: duty.teamId,
        }));
      } else if (matchItem.start >= duty.item.end) {
        const actual = minutes(matchItem.start - duty.item.end);
        if (actual < compiled.referee.minRestAfterRefMinutes) {
          conflicts.push(issue('REFEREE_REST', 'A team plays too soon after referee duty.', {
            matchIds: [duty.item.match.id, matchItem.match.id], teamId: duty.teamId,
            details: {
              requiredMinutes: compiled.referee.minRestAfterRefMinutes,
              actualMinutes: actual,
            },
          }));
        }
      }
    }
  }
  for (let leftIndex = 0; leftIndex < refereeDuties.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < refereeDuties.length; rightIndex += 1) {
      const left = refereeDuties[leftIndex];
      const right = refereeDuties[rightIndex];
      if (
        left.teamId === right.teamId
        && left.item.match.id !== right.item.match.id
        && overlaps(left.item.start, left.item.end, right.item.start, right.item.end)
      ) {
        conflicts.push(issue('REFEREE_TEAM_OVERLAP', 'A team has overlapping referee duties.', {
          matchIds: [left.item.match.id, right.item.match.id], teamId: left.teamId,
        }));
      }
    }
  }

  const objective = calculateObjective(compiled, parsed);
  const complete = parsed.length === compiled.matches.length && !allowPartial;
  const valid = conflicts.length === 0;
  const publishable = valid && complete;
  const diagnostics = buildScheduleDiagnostics(compiled, parsed.map((item) => item.assignment));
  return {
    valid,
    publishable,
    conflicts,
    warnings,
    objective,
    diagnostics,
    scheduleHash: valid && (complete || allowPartial)
      ? scheduleHashForAssignments(compiled.inputHash, parsed.map((item) => item.assignment))
      : null,
  };
}

export function validateSchedule(
  input: ScheduleSolverInput,
  assignments: ScheduleAssignment[],
  options: ScheduleValidationOptions = {},
): ScheduleValidationResult {
  const compileResult = compileScheduleInput(input);
  if (!compileResult.compiled) {
    return {
      valid: false,
      publishable: false,
      inputHash: compileResult.inputHash,
      scheduleHash: null,
      conflicts: compileResult.conflicts,
      warnings: compileResult.warnings,
      objective: null,
      diagnostics: null,
    };
  }
  const validation = validateCompiledSchedule(compileResult.compiled, assignments, options);
  return {
    valid: validation.valid,
    publishable: validation.publishable,
    inputHash: compileResult.inputHash,
    scheduleHash: validation.scheduleHash,
    conflicts: validation.conflicts,
    warnings: [...compileResult.warnings, ...validation.warnings],
    objective: validation.objective,
    diagnostics: validation.diagnostics,
  };
}
