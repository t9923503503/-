import { buildRefereeAssignment, compileScheduleInput } from './compile';
import { validateCompiledSchedule } from './validator';
import type {
  ScheduleAssignment,
  ScheduleConflict,
  SchedulePreflightResult,
  ScheduleSolverInput,
} from './types';

function lockedAssignments(input: ReturnType<typeof compileScheduleInput>['compiled']): ScheduleAssignment[] {
  if (!input) return [];
  return input.matches.flatMap((match) => {
    if (!match.locked) return [];
    const end = match.locked.start + match.durationMs;
    return [{
      matchId: match.id,
      courtId: match.locked.courtId,
      start: new Date(match.locked.start).toISOString(),
      end: new Date(end).toISOString(),
      durationMinutes: match.durationMinutes,
      conditional: match.conditional,
      referee: buildRefereeAssignment(input, match),
    } satisfies ScheduleAssignment];
  });
}

function withHybridFallback(assignments: ScheduleAssignment[]): ScheduleAssignment[] {
  return assignments.map((assignment) => (
    assignment.referee.reservedTeamIds.length > 0
      ? { ...assignment, referee: { kind: 'court_judge', reservedTeamIds: [], isFallback: true } }
      : assignment
  ));
}

function lowerBoundConflicts(
  compiled: NonNullable<ReturnType<typeof compileScheduleInput>['compiled']>,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const requiredCourtMinutes = compiled.matches.reduce(
    (total, match) => total + match.durationMinutes,
    0,
  );
  const availableCourtMinutes = compiled.courts.reduce((total, court) => (
    total + court.availability.reduce(
      (courtTotal, range) => courtTotal + (range.end - range.start) / 60_000,
      0,
    )
  ), 0);
  if (requiredCourtMinutes > availableCourtMinutes) {
    conflicts.push({
      code: 'COURT_MINUTES_LOWER_BOUND_EXCEEDED',
      severity: 'error',
      message: 'The matches require more court-minutes than all availability windows provide.',
      details: {
        phase: 'capacity_preflight',
        requiredCourtMinutes,
        availableCourtMinutes,
        deficitCourtMinutes: requiredCourtMinutes - availableCourtMinutes,
      },
    });
  }

  // Hall-style lower bound for hard tier lanes. A match whose allowed court
  // set is contained in a subset cannot consume capacity outside that subset.
  // With at most six courts, exhaustive subset enumeration is deterministic
  // and cheap, and catches a closed Light/Medium lane before beam search.
  const courtIds = compiled.courts.map((court) => court.id).sort();
  const constrainedDeficits: Array<{
    courtIds: string[];
    matchIds: string[];
    requiredCourtMinutes: number;
    availableCourtMinutes: number;
  }> = [];
  for (let mask = 1; mask < (1 << courtIds.length) - 1; mask += 1) {
    const subset = courtIds.filter((_, index) => (mask & (1 << index)) !== 0);
    const subsetSet = new Set(subset);
    const constrained = compiled.matches.filter((match) => (
      match.courtPolicy != null
      && match.courtPolicy.allowedCourtIds.every((courtId) => subsetSet.has(courtId))
    ));
    if (constrained.length === 0) continue;
    const required = constrained.reduce((total, match) => total + match.durationMinutes, 0);
    const available = compiled.courts
      .filter((court) => subsetSet.has(court.id))
      .reduce((total, court) => total + court.availability.reduce(
        (courtTotal, range) => courtTotal + (range.end - range.start) / 60_000,
        0,
      ), 0);
    if (required > available) {
      constrainedDeficits.push({
        courtIds: subset,
        matchIds: constrained.map((match) => match.id).sort(),
        requiredCourtMinutes: required,
        availableCourtMinutes: available,
      });
    }
  }
  const minimalDeficits = constrainedDeficits.filter((candidate) => !constrainedDeficits.some((other) => (
    other !== candidate
    && other.courtIds.length < candidate.courtIds.length
    && other.courtIds.every((courtId) => candidate.courtIds.includes(courtId))
  )));
  for (const deficit of minimalDeficits) {
    conflicts.push({
      code: 'TIER_COURT_CAPACITY_DEFICIT',
      severity: 'error',
      message: 'Strict tier-court lanes do not contain enough available court-minutes.',
      matchIds: deficit.matchIds,
      courtId: deficit.courtIds.length === 1 ? deficit.courtIds[0] : undefined,
      details: {
        phase: 'tier_capacity_preflight',
        courtIds: deficit.courtIds,
        requiredCourtMinutes: deficit.requiredCourtMinutes,
        availableCourtMinutes: deficit.availableCourtMinutes,
        deficitCourtMinutes: deficit.requiredCourtMinutes - deficit.availableCourtMinutes,
      },
    });
  }

  for (const match of compiled.matches) {
    const earliestStart = Math.max(compiled.window.start, match.notBefore);
    const earliestPathEnd = earliestStart + match.criticalPathMinutes * 60_000;
    if (earliestPathEnd <= compiled.window.end) continue;
    conflicts.push({
      code: 'CRITICAL_PATH_LOWER_BOUND_EXCEEDED',
      severity: 'error',
      message: 'A precedence chain cannot finish inside the session window even with an immediately available court.',
      matchIds: [match.id],
      at: new Date(earliestStart).toISOString(),
      details: {
        phase: 'critical_path_preflight',
        criticalPathMinutes: match.criticalPathMinutes,
        availableMinutes: Math.max(0, (compiled.window.end - earliestStart) / 60_000),
      },
    });
  }
  return conflicts;
}

export function preflightSchedule(input: ScheduleSolverInput): SchedulePreflightResult {
  const compiledResult = compileScheduleInput(input);
  if (!compiledResult.compiled) {
    return {
      valid: false,
      inputHash: compiledResult.inputHash,
      topologicalOrder: [],
      conflicts: compiledResult.conflicts,
      warnings: compiledResult.warnings,
    };
  }
  let assignments = lockedAssignments(compiledResult.compiled);
  let lockedValidation = validateCompiledSchedule(compiledResult.compiled, assignments, { allowPartial: true });
  if (!lockedValidation.valid && compiledResult.compiled.referee.mode === 'hybrid') {
    assignments = withHybridFallback(assignments);
    lockedValidation = validateCompiledSchedule(compiledResult.compiled, assignments, { allowPartial: true });
  }
  const conflicts: ScheduleConflict[] = lockedValidation.conflicts.map((conflict) => ({
    ...conflict,
    details: { ...(conflict.details ?? {}), phase: 'locked_preflight' },
  }));
  conflicts.push(...lowerBoundConflicts(compiledResult.compiled));
  return {
    valid: conflicts.length === 0,
    inputHash: compiledResult.inputHash,
    topologicalOrder: compiledResult.compiled.topologicalOrder.slice(),
    conflicts,
    warnings: [...compiledResult.warnings, ...lockedValidation.warnings],
  };
}
