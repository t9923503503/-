import {
  GoV2Error,
  type GoV2AttendanceReinstatementDecision,
  type GoV2Risk,
} from './contracts';

const DECISIONS = new Set<GoV2AttendanceReinstatementDecision>([
  'keep_awarded_result',
  'overturn_and_cascade',
]);

export function parseGoV2AttendanceReinstatementDecision(
  value: unknown,
): GoV2AttendanceReinstatementDecision {
  const decision = String(value ?? '').trim() as GoV2AttendanceReinstatementDecision;
  if (!DECISIONS.has(decision)) {
    throw new GoV2Error(
      422,
      'ATTENDANCE_REINSTATEMENT_DECISION_REQUIRED',
      'Choose keep_awarded_result or overturn_and_cascade',
      { allowedDecisions: [...DECISIONS] },
    );
  }
  return decision;
}

export function parseGoV2AttendanceReinstatementTarget(
  value: unknown,
): 'checked_in' | 'late_hold' {
  const state = String(value ?? 'checked_in').trim();
  if (state !== 'checked_in' && state !== 'late_hold') {
    throw new GoV2Error(
      422,
      'ATTENDANCE_REINSTATEMENT_TARGET_INVALID',
      'A reinstated entry must become checked_in or late_hold',
    );
  }
  return state;
}

export function attendanceReinstatementRisk(input: {
  decision: GoV2AttendanceReinstatementDecision;
  affectedMatches: ReadonlyArray<{ playState: string; scheduleState: string }>;
}): GoV2Risk {
  if (input.decision === 'keep_awarded_result') return 'amber';
  // Overturning the current technical/admin award changes a final winner even
  // when it has no descendants, so it is intrinsically a red operation.
  // ready/live/paused/final descendants remain listed for the approver, but do
  // not weaken this floor.
  return 'red';
}

export function uniqueSortedIds(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
