import { GoV2Error, assertGoV2Uuid } from './contracts';

export type GoV2ScheduleDeferMode = 'not_before' | 'end_of_queue';

export interface GoV2ScheduleDeferRequest {
  matchId: string;
  deferMode: GoV2ScheduleDeferMode;
  notBefore: string | null;
}

export interface GoV2ScheduleDeferReleaseRequest {
  matchId: string;
}

export function parseGoV2ScheduleDeferRequest(
  payload: Record<string, unknown>,
): GoV2ScheduleDeferRequest {
  const matchId = assertGoV2Uuid(payload.matchId, 'matchId');
  const deferMode = String(payload.deferMode ?? '') as GoV2ScheduleDeferMode;
  if (deferMode !== 'not_before' && deferMode !== 'end_of_queue') {
    throw new GoV2Error(
      422,
      'DEFER_MODE_REQUIRED',
      'deferMode must be not_before or end_of_queue',
    );
  }
  if (deferMode === 'end_of_queue') {
    if (payload.notBefore !== undefined && payload.notBefore !== null && String(payload.notBefore).trim()) {
      throw new GoV2Error(
        422,
        'DEFER_NOT_BEFORE_FORBIDDEN',
        'notBefore is server-derived for deferMode=end_of_queue',
      );
    }
    return { matchId, deferMode, notBefore: null };
  }
  const parsed = Date.parse(String(payload.notBefore ?? ''));
  if (!Number.isFinite(parsed)) {
    throw new GoV2Error(
      422,
      'DEFER_NOT_BEFORE_REQUIRED',
      'notBefore must be a valid timestamp for deferMode=not_before',
    );
  }
  return { matchId, deferMode, notBefore: new Date(parsed).toISOString() };
}

export function parseGoV2ScheduleDeferReleaseRequest(
  payload: Record<string, unknown>,
): GoV2ScheduleDeferReleaseRequest {
  return { matchId: assertGoV2Uuid(payload.matchId, 'matchId') };
}

export function scheduleDeferRequiresDirector(input: {
  assignmentLocked: boolean;
  plannedStart: string;
  freezeHorizonMinutes: number;
  nowMs: number;
}): boolean {
  const plannedStartMs = Date.parse(input.plannedStart);
  return input.assignmentLocked || (
    Number.isFinite(plannedStartMs)
    && plannedStartMs <= input.nowMs + input.freezeHorizonMinutes * 60_000
  );
}

export function buildGoV2ScheduleAssignmentDiff(
  currentAssignments: ReadonlyMap<string, { courtId: string; start: string }>,
  successorAssignments: ReadonlyArray<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return successorAssignments.flatMap((assignment) => {
    const matchId = String(assignment.matchId ?? '');
    const current = currentAssignments.get(matchId);
    const nextCourtId = String(assignment.courtId ?? '');
    const nextStart = String(assignment.start ?? assignment.plannedStart ?? '');
    if (
      current
      && current.courtId === nextCourtId
      && Date.parse(current.start) === Date.parse(nextStart)
    ) return [];
    return [{
      matchId,
      from: current ?? null,
      to: {
        courtId: nextCourtId,
        start: nextStart,
        end: String(assignment.end ?? assignment.plannedEnd ?? ''),
        referee: assignment.referee ?? { kind: 'none' },
      },
    }];
  });
}
