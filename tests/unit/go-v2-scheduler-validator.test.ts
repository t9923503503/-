import { describe, expect, it } from 'vitest';
import {
  solveSchedule,
  validateSchedule,
  type ScheduleSolverInput,
} from '../../web/lib/go-v2/scheduler';

const input: ScheduleSolverInput = {
  window: {
    start: '2026-08-15T06:00:00.000Z',
    end: '2026-08-15T08:00:00.000Z',
  },
  courts: [{ id: 'c1' }, { id: 'c2' }],
  matches: [
    { id: 'm1', durationMinutes: 20, teamIds: ['A', 'B'] },
    { id: 'm2', durationMinutes: 20, teamIds: ['C', 'D'], dependencies: ['m1'] },
  ],
  referee: { mode: 'none' },
};

describe('LPVolley V2 independent schedule validator', () => {
  it('accepts solver output and reproduces its schedule hash/objective', () => {
    const solved = solveSchedule(input);
    const validation = validateSchedule(input, solved.assignments);
    expect(validation.valid).toBe(true);
    expect(validation.publishable).toBe(true);
    expect(validation.scheduleHash).toBe(solved.scheduleHash);
    expect(validation.objective).toEqual(solved.objective);
  });

  it('rejects tampered court overlap and dependency order', () => {
    const solved = solveSchedule(input);
    const first = solved.assignments.find((item) => item.matchId === 'm1')!;
    const second = solved.assignments.find((item) => item.matchId === 'm2')!;
    const tampered = solved.assignments.map((assignment) => (
      assignment.matchId === 'm2'
        ? { ...second, courtId: first.courtId, start: first.start, end: first.end }
        : assignment
    ));
    const validation = validateSchedule(input, tampered);
    expect(validation.valid).toBe(false);
    expect(validation.publishable).toBe(false);
    expect(validation.scheduleHash).toBeNull();
    expect(validation.conflicts.some((conflict) => conflict.code === 'COURT_OVERLAP')).toBe(true);
    expect(validation.conflicts.some((conflict) => conflict.code === 'DEPENDENCY_ORDER')).toBe(true);
  });

  it('keeps partial validation explicitly non-publishable', () => {
    const solved = solveSchedule(input);
    const validation = validateSchedule(input, solved.assignments.slice(0, 1), { allowPartial: true });
    expect(validation.valid).toBe(true);
    expect(validation.publishable).toBe(false);
    expect(validation.scheduleHash).not.toBeNull();
  });

  it('reports player overlap and rest across otherwise unrelated team ids', () => {
    const sharedPlayerInput: ScheduleSolverInput = {
      ...input,
      matches: [
        { id: 'm1', durationMinutes: 20, teamIds: ['MEN'], playerIds: ['P1', 'P2'], minRestMinutes: 20 },
        { id: 'm2', durationMinutes: 20, teamIds: ['MIX'], playerIds: ['P1', 'P3'], minRestMinutes: 20 },
      ],
    };
    const solved = solveSchedule(sharedPlayerInput);
    const first = solved.assignments.find((item) => item.matchId === 'm1')!;
    const second = solved.assignments.find((item) => item.matchId === 'm2')!;

    const overlap = validateSchedule(sharedPlayerInput, solved.assignments.map((assignment) => (
      assignment.matchId === 'm2'
        ? { ...second, courtId: second.courtId === 'c1' ? 'c2' : 'c1', start: first.start, end: first.end }
        : assignment
    )));
    expect(overlap.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PLAYER_OVERLAP', playerId: 'P1' }),
    ]));

    const noRest = validateSchedule(sharedPlayerInput, solved.assignments.map((assignment) => (
      assignment.matchId === 'm2'
        ? {
            ...second,
            start: new Date(Date.parse(first.end) + 5 * 60_000).toISOString(),
            end: new Date(Date.parse(first.end) + 25 * 60_000).toISOString(),
          }
        : assignment
    )));
    expect(noRest.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PLAYER_REST', playerId: 'P1' }),
    ]));
  });
});
