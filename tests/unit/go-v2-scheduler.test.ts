import { describe, expect, it } from 'vitest';
import {
  preflightSchedule,
  solveSchedule,
  validateSchedule,
  type ScheduleAssignment,
  type ScheduleMatchInput,
  type ScheduleSolverInput,
} from '../../web/lib/go-v2/scheduler';

const START = '2026-08-15T06:00:00.000Z'; // 09:00 Asia/Yekaterinburg
const END = '2026-08-15T10:00:00.000Z';

function baseInput(overrides: Partial<ScheduleSolverInput> = {}): ScheduleSolverInput {
  return {
    sessionId: 'session-1',
    timezone: 'Asia/Yekaterinburg',
    window: { start: START, end: END },
    courts: [{ id: 'c1' }, { id: 'c2' }],
    matches: [],
    referee: { mode: 'none' },
    options: { beamWidth: 16, topK: 8, maxExpandedStates: 20_000, maxWallMs: 2_000 },
    ...overrides,
  };
}

function match(id: string, teamIds: string[], overrides: Partial<ScheduleMatchInput> = {}): ScheduleMatchInput {
  return {
    id,
    durationMinutes: 20,
    teamIds,
    ...overrides,
  };
}

describe('LPVolley V2 deterministic schedule solver', () => {
  it('jointly assigns time and court, honoring affinity with stable hashes', () => {
    const input = baseInput({
      matches: [
        match('m1', ['A', 'B'], { courtAffinityPenalties: { c1: 10, c2: 0 } }),
        match('m2', ['C', 'D'], { courtAffinityPenalties: { c1: 0, c2: 10 } }),
      ],
    });

    const first = solveSchedule(input);
    const second = solveSchedule({ ...input, courts: input.courts.slice().reverse(), matches: input.matches.slice().reverse() });

    expect(first.status).toBe('feasible');
    expect(first.publishable).toBe(true);
    expect(first.assignments).toHaveLength(2);
    expect(first.assignments.find((item) => item.matchId === 'm1')?.courtId).toBe('c2');
    expect(first.assignments.find((item) => item.matchId === 'm2')?.courtId).toBe('c1');
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.scheduleHash).toBe(second.scheduleHash);
    expect(first.metrics.expandedStates).toBe(second.metrics.expandedStates);
    expect(first.metrics.candidateEvaluations).toBe(second.metrics.candidateEvaluations);
  });

  it('enforces dependencies and hard team rest', () => {
    const result = solveSchedule(baseInput({
      courts: [{ id: 'c1' }],
      matches: [
        match('m1', ['A', 'B']),
        match('m2', ['A', 'C'], {
          dependencies: ['m1'],
          minRestMinutes: 20,
        }),
      ],
    }));

    expect(result.status).toBe('feasible');
    const first = result.assignments.find((item) => item.matchId === 'm1');
    const second = result.assignments.find((item) => item.matchId === 'm2');
    expect(Date.parse(second!.start) - Date.parse(first!.end)).toBe(20 * 60_000);
  });

  it('minimizes the largest individual soft-rest deficit before equal total deficit', () => {
    const fairnessInput = baseInput({
      window: { start: START, end: '2026-08-15T07:20:00.000Z' },
      courts: [{ id: 'c1' }],
      matches: [
        match('a1', ['A', 'X1'], {
          locked: { courtId: 'c1', start: START },
          softRestMinutes: 60,
        }),
        match('a2', ['A', 'X2'], { softRestMinutes: 60 }),
        match('b1', ['B', 'Y1'], { softRestMinutes: 60 }),
        match('b2', ['B', 'Y2'], { softRestMinutes: 60 }),
      ],
      options: { beamWidth: 64, topK: 24, maxExpandedStates: 20_000, maxWallMs: 2_000 },
    });
    const assignment = (matchId: string, offsetMinutes: number): ScheduleAssignment => {
      const start = Date.parse(START) + offsetMinutes * 60_000;
      return {
        matchId,
        courtId: 'c1',
        start: new Date(start).toISOString(),
        end: new Date(start + 20 * 60_000).toISOString(),
        durationMinutes: 20,
        conditional: false,
        referee: { kind: 'none', reservedTeamIds: [] },
      };
    };
    const concentrated = validateSchedule(fairnessInput, [
      assignment('a1', 0),
      assignment('b1', 20),
      assignment('b2', 40),
      assignment('a2', 60),
    ]);
    const balanced = validateSchedule(fairnessInput, [
      assignment('a1', 0),
      assignment('b1', 20),
      assignment('a2', 40),
      assignment('b2', 60),
    ]);

    expect(concentrated.valid).toBe(true);
    expect(balanced.valid).toBe(true);
    expect(concentrated.objective).toMatchObject({
      publishedMoves: 0,
      overtimeMinutes: 0,
      maxSoftRestDeficitMinutes: 60,
      softRestDeficitMinutes: 80,
      makespanMinutes: 80,
    });
    expect(balanced.objective).toMatchObject({
      publishedMoves: 0,
      overtimeMinutes: 0,
      maxSoftRestDeficitMinutes: 40,
      softRestDeficitMinutes: 80,
      makespanMinutes: 80,
    });

    const solved = solveSchedule(fairnessInput);
    expect(solved.publishable).toBe(true);
    expect(solved.objective).toMatchObject({
      maxSoftRestDeficitMinutes: 40,
      softRestDeficitMinutes: 80,
    });
  });

  it('reports the exact team-referee load spread in the final objective group', () => {
    const refereeInput = baseInput({
      referee: { mode: 'working_team' },
      matches: [
        match('m1', ['A', 'B'], { refereeRequirement: { kind: 'fixed_team', teamId: 'REF' } }),
        match('m2', ['C', 'D'], { refereeRequirement: { kind: 'fixed_team', teamId: 'REF' } }),
      ],
    });
    const solved = solveSchedule(refereeInput);
    const validation = validateSchedule(refereeInput, solved.assignments);

    expect(solved.publishable).toBe(true);
    expect(solved.objective?.refereeLoadSpread).toBe(2);
    expect(validation.objective).toEqual(solved.objective);
    expect(solved.diagnostics?.refereeBalance).toMatchObject({
      minDuties: 0,
      maxDuties: 2,
      spread: 2,
    });
  });

  it('serializes one player across different team ids in a shared multi-division session', () => {
    const input = baseInput({
      matches: [
        match('men-match', ['MEN-PAIR'], { playerIds: ['PLAYER-1', 'PLAYER-2'], minRestMinutes: 20 }),
        match('mix-match', ['MIX-PAIR'], { playerIds: ['PLAYER-1', 'PLAYER-3'], minRestMinutes: 20 }),
      ],
    });

    const result = solveSchedule(input);
    expect(result.publishable).toBe(true);
    const [earlier, later] = [...result.assignments]
      .sort((left, right) => left.start.localeCompare(right.start));
    expect(Date.parse(later.start) - Date.parse(earlier.end)).toBeGreaterThanOrEqual(20 * 60_000);
    expect(validateSchedule(input, result.assignments)).toMatchObject({ valid: true, publishable: true });
    expect(solveSchedule({
      ...input,
      matches: input.matches.map((item) => ({ ...item, playerIds: item.playerIds?.slice().reverse() })).reverse(),
    }).scheduleHash).toBe(result.scheduleHash);
  });

  it('reserves both possible losers for same-court referee duty and post-duty rest', () => {
    const result = solveSchedule(baseInput({
      courts: [{ id: 'c1' }],
      referee: { mode: 'working_team', minRestAfterRefMinutes: 10 },
      matches: [
        match('m1', ['A', 'B'], { refereeRequirement: { kind: 'court_judge' } }),
        match('m2', ['C', 'D'], {
          refereeRequirement: { kind: 'loser_previous_same_court', sourceMatchId: 'm1' },
        }),
        match('m3', ['A', 'E'], {
          dependencies: ['m2'],
          refereeRequirement: { kind: 'court_judge' },
        }),
      ],
    }));

    expect(result.status).toBe('feasible');
    const source = result.assignments.find((item) => item.matchId === 'm1')!;
    const duty = result.assignments.find((item) => item.matchId === 'm2')!;
    const next = result.assignments.find((item) => item.matchId === 'm3')!;
    expect(duty.courtId).toBe(source.courtId);
    expect(duty.referee).toMatchObject({
      kind: 'loser_previous_same_court',
      sourceMatchId: 'm1',
      reservedTeamIds: ['A', 'B'],
    });
    expect(Date.parse(next.start) - Date.parse(duty.end)).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('uses an explicit hybrid court-judge fallback when team duty is impossible', () => {
    const result = solveSchedule(baseInput({
      courts: [{ id: 'c1' }],
      referee: { mode: 'hybrid', minRestAfterRefMinutes: 10 },
      matches: [match('m1', ['A', 'B'], {
        refereeRequirement: { kind: 'fixed_team', teamId: 'A' },
      })],
    }));

    expect(result.status).toBe('feasible_with_warnings');
    expect(result.publishable).toBe(true);
    expect(result.assignments[0].referee).toEqual({
      kind: 'court_judge', reservedTeamIds: [], isFallback: true,
    });
    expect(result.objective?.refereeFallbacks).toBe(1);
    expect(result.warnings.some((warning) => warning.code === 'HYBRID_REFEREE_FALLBACK')).toBe(true);
  });

  it('repairs an early idle-team referee choice when the primary candidate must play next', () => {
    const repairFixture = (maxRepairPasses: number): ScheduleSolverInput => baseInput({
      window: { start: START, end: '2026-08-15T06:40:00.000Z' },
      courts: [{ id: 'c1' }],
      referee: { mode: 'working_team', minRestAfterRefMinutes: 20 },
      matches: [
        match('m1', ['A', 'B'], {
          refereeRequirement: {
            kind: 'idle_team_candidates',
            candidateTeamIds: ['C', 'D'],
          },
        }),
        match('m2', ['C', 'E'], {
          dependencies: ['m1'],
          refereeRequirement: { kind: 'court_judge' },
        }),
      ],
      options: {
        beamWidth: 16,
        topK: 8,
        maxExpandedStates: 20_000,
        maxWallMs: 2_000,
        maxRepairPasses,
      },
    });

    const withoutRepair = solveSchedule(repairFixture(0));
    expect(withoutRepair.status).toBe('timeout');
    expect(withoutRepair.publishable).toBe(false);
    expect(withoutRepair.metrics.repairPasses).toBe(0);
    expect(withoutRepair.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TIMEOUT_OPERATION_BUDGET',
        details: expect.objectContaining({ reason: 'referee_repair_budget_exhausted' }),
      }),
    ]));

    const repaired = solveSchedule(repairFixture(1));
    expect(repaired.status).toBe('feasible');
    expect(repaired.publishable).toBe(true);
    expect(repaired.metrics.repairPasses).toBe(1);
    expect(repaired.assignments.find((assignment) => assignment.matchId === 'm1')?.referee).toEqual({
      kind: 'fixed_team',
      reservedTeamIds: ['D'],
    });
    expect(validateSchedule(repairFixture(1), repaired.assignments).publishable).toBe(true);
    expect(solveSchedule(repairFixture(1)).scheduleHash).toBe(repaired.scheduleHash);
  });

  it('rejects referee repair budgets outside the V1 range', () => {
    const result = solveSchedule(baseInput({
      matches: [match('m1', ['A', 'B'])],
      options: { maxRepairPasses: 9 },
    }));

    expect(result.status).toBe('infeasible');
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INVALID_TIME_CONSTRAINT',
        details: expect.objectContaining({ name: 'maxRepairPasses', maximum: 8 }),
      }),
    ]));
  });

  it('lets a hybrid fallback leave the loser-duty source court when that court closes', () => {
    const result = solveSchedule(baseInput({
      courts: [
        { id: 'c1', availability: [{ start: START, end: '2026-08-15T06:20:00.000Z' }] },
        { id: 'c2' },
      ],
      referee: { mode: 'hybrid' },
      matches: [
        match('m1', ['A', 'B'], {
          locked: { courtId: 'c1', start: START },
          refereeRequirement: { kind: 'court_judge' },
        }),
        match('m2', ['C', 'D'], {
          refereeRequirement: { kind: 'loser_previous_same_court', sourceMatchId: 'm1' },
        }),
      ],
    }));

    expect(result.status).toBe('feasible_with_warnings');
    expect(result.assignments.find((item) => item.matchId === 'm2')).toMatchObject({
      courtId: 'c2',
      referee: { kind: 'court_judge', isFallback: true },
    });
  });

  it('rejects missing working-team referee requirements during preflight', () => {
    const input = baseInput({
      referee: { mode: 'working_team' },
      matches: [match('m1', ['A', 'B'])],
    });
    const preflight = preflightSchedule(input);
    const result = solveSchedule(input);
    expect(preflight.valid).toBe(false);
    expect(preflight.conflicts.some((conflict) => conflict.code === 'REFEREE_REQUIREMENT_MISSING')).toBe(true);
    expect(result.status).toBe('infeasible');
  });

  it('diagnoses the strict one-court, three-team loser-referee deadlock', () => {
    const result = preflightSchedule(baseInput({
      courts: [{ id: 'c1' }],
      referee: { mode: 'working_team' },
      matches: [
        match('m1', ['A', 'B'], { refereeRequirement: { kind: 'court_judge' } }),
        match('m2', ['B', 'C'], {
          refereeRequirement: { kind: 'loser_previous_same_court', sourceMatchId: 'm1' },
        }),
        match('m3', ['A', 'C'], {
          refereeRequirement: { kind: 'loser_previous_same_court', sourceMatchId: 'm2' },
        }),
      ],
    }));

    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'REFEREE_TEAM_OVERLAP',
        teamId: 'B',
        matchIds: ['m1', 'm2'],
      }),
    ]));
  });

  it('detects DAG cycles and invalid court availability before search', () => {
    const cycle = preflightSchedule(baseInput({
      matches: [
        match('m1', ['A', 'B'], { dependencies: ['m2'] }),
        match('m2', ['C', 'D'], { dependencies: ['m1'] }),
      ],
    }));
    expect(cycle.valid).toBe(false);
    expect(cycle.conflicts.some((conflict) => conflict.code === 'DEPENDENCY_CYCLE')).toBe(true);

    const availability = preflightSchedule(baseInput({
      courts: [{ id: 'c1', availability: [{ start: END, end: START }] }],
    }));
    expect(availability.valid).toBe(false);
    expect(availability.conflicts.some((conflict) => conflict.code === 'COURT_AVAILABILITY_INVALID')).toBe(true);
  });

  it('rejects an empty player resource before shared-session search', () => {
    const result = preflightSchedule(baseInput({
      matches: [match('m1', ['A'], { playerIds: ['PLAYER-1', ''] })],
    }));
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_PLAYER_ID', matchIds: ['m1'] }),
    ]));
  });

  it('reports locked court collisions in preflight', () => {
    const locked = { courtId: 'c1', start: START };
    const result = preflightSchedule(baseInput({
      courts: [{ id: 'c1' }],
      matches: [match('m1', ['A', 'B'], { locked }), match('m2', ['C', 'D'], { locked })],
    }));
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((conflict) => conflict.code === 'COURT_OVERLAP')).toBe(true);
  });

  it('rejects impossible court-minute and critical-path lower bounds before search', () => {
    const courtMinutes = preflightSchedule(baseInput({
      window: { start: START, end: '2026-08-15T06:40:00.000Z' },
      courts: [{ id: 'c1' }],
      matches: [
        match('m1', ['A', 'B'], { durationMinutes: 30 }),
        match('m2', ['C', 'D'], { durationMinutes: 30 }),
      ],
    }));
    expect(courtMinutes.valid).toBe(false);
    expect(courtMinutes.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'COURT_MINUTES_LOWER_BOUND_EXCEEDED',
        details: expect.objectContaining({ requiredCourtMinutes: 60, availableCourtMinutes: 40 }),
      }),
    ]));

    const criticalPath = preflightSchedule(baseInput({
      window: { start: START, end: '2026-08-15T07:00:00.000Z' },
      courts: [{ id: 'c1' }, { id: 'c2' }],
      matches: [
        match('m1', ['A', 'B'], { durationMinutes: 30 }),
        match('m2', ['C', 'D'], { durationMinutes: 30, dependencies: [{ matchId: 'm1', minGapMinutes: 10 }] }),
      ],
    }));
    expect(criticalPath.valid).toBe(false);
    expect(criticalPath.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CRITICAL_PATH_LOWER_BOUND_EXCEEDED',
        matchIds: ['m1'],
        details: expect.objectContaining({ criticalPathMinutes: 70, availableMinutes: 60 }),
      }),
    ]));
  });

  it('returns infeasible with a structured blocked-match conflict', () => {
    const result = solveSchedule(baseInput({
      window: { start: START, end: '2026-08-15T06:40:00.000Z' },
      courts: [{ id: 'c1' }],
      matches: [
        match('m1', ['A', 'B']),
        match('m2', ['A', 'C'], { dependencies: ['m1'], minRestMinutes: 20 }),
      ],
    }));
    expect(result.status).toBe('infeasible');
    expect(result.publishable).toBe(false);
    expect(result.conflicts.some((conflict) => conflict.code === 'NO_FEASIBLE_PLACEMENT')).toBe(true);
  });

  it('branches ready matches instead of falsely rejecting a deadline-first schedule', () => {
    const input = baseInput({
      window: { start: START, end: '2026-08-15T11:00:00.000Z' },
      courts: [{ id: 'c1' }],
      matches: [
        match('A1', ['A', 'B']),
        match('A2', ['A', 'C'], { durationMinutes: 120, dependencies: ['A1'] }),
        match('B', ['D', 'E'], {
          durationMinutes: 120,
          mustEndBy: '2026-08-15T08:00:00.000Z',
        }),
      ],
      options: {
        beamWidth: 64,
        topK: 24,
        maxExpandedStates: 250_000,
        maxWallMs: 5_000,
        maxRepairPasses: 8,
      },
    });

    const result = solveSchedule(input);
    expect(result.status).toBe('feasible');
    expect(result.publishable).toBe(true);
    expect(result.assignments.find((assignment) => assignment.matchId === 'B')).toMatchObject({
      start: START,
      end: '2026-08-15T08:00:00.000Z',
    });
    expect(validateSchedule(input, result.assignments).publishable).toBe(true);
  });

  it('reports bounded beam exhaustion as timeout instead of a proof of infeasibility', () => {
    const result = solveSchedule(baseInput({
      window: { start: START, end: '2026-08-15T06:40:00.000Z' },
      courts: [{ id: 'c1' }],
      matches: [match('m1', ['A', 'B']), match('m2', ['C', 'D']), match('m3', ['E', 'F'])],
      options: { beamWidth: 2, topK: 2, maxExpandedStates: 100, maxWallMs: 2_000 },
    }));

    expect(result.status).toBe('timeout');
    expect(result.publishable).toBe(false);
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TIMEOUT_OPERATION_BUDGET',
        details: { reason: 'bounded_search_exhausted' },
      }),
    ]));
  });

  it('returns a deterministic non-publishable partial preview on operation timeout', () => {
    const input = baseInput({
      courts: [{ id: 'c1' }],
      matches: [match('m1', ['A', 'B']), match('m2', ['C', 'D']), match('m3', ['E', 'F'])],
      options: { beamWidth: 1, topK: 1, maxExpandedStates: 1, maxWallMs: 2_000 },
    });
    const first = solveSchedule(input);
    const second = solveSchedule(input);
    expect(first.status).toBe('timeout');
    expect(first.publishable).toBe(false);
    expect(first.assignments).toHaveLength(1);
    expect(first.conflicts[0].code).toBe('TIMEOUT_OPERATION_BUDGET');
    expect(first.scheduleHash).toBe(second.scheduleHash);
    expect(first.metrics.expandedStates).toBe(1);
  });

  it('rounds nominal durations up to five minutes and exposes a warning', () => {
    const result = solveSchedule(baseInput({
      courts: [{ id: 'c1' }],
      matches: [match('m1', ['A', 'B'], { durationMinutes: 21 })],
    }));
    expect(result.status).toBe('feasible_with_warnings');
    expect(result.assignments[0].durationMinutes).toBe(25);
    expect(result.warnings.some((warning) => warning.code === 'DURATION_ROUNDED')).toBe(true);
  });

  it('reserves and preserves a conditional reset-final slot', () => {
    const input = baseInput({
      courts: [{ id: 'c1' }],
      matches: [
        match('gf1', ['upper', 'lower']),
        match('gf2-reset', ['upper', 'lower'], {
          dependencies: ['gf1'],
          minRestMinutes: 20,
          conditional: true,
        }),
      ],
    });
    const result = solveSchedule(input);

    expect(result.status).toBe('feasible');
    const firstFinal = result.assignments.find((item) => item.matchId === 'gf1')!;
    const reset = result.assignments.find((item) => item.matchId === 'gf2-reset')!;
    expect(reset.conditional).toBe(true);
    expect(Date.parse(reset.start) - Date.parse(firstFinal.end)).toBeGreaterThanOrEqual(20 * 60_000);
    const tampered = result.assignments.map((assignment) => (
      assignment.matchId === 'gf2-reset' ? { ...assignment, conditional: false } : assignment
    ));
    expect(validateSchedule(input, tampered).conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ASSIGNMENT_CONDITIONAL_MISMATCH' }),
    ]));
  });

  it('keeps a 120-match, six-court fixture inside the bounded search contract', () => {
    const matches: ScheduleMatchInput[] = [];
    for (let pair = 0; pair < 24; pair += 1) {
      for (let round = 0; round < 5; round += 1) {
        const id = `p${String(pair).padStart(2, '0')}-r${round}`;
        matches.push(match(id, [`T${pair * 2}`, `T${pair * 2 + 1}`], {
          dependencies: round === 0 ? [] : [`p${String(pair).padStart(2, '0')}-r${round - 1}`],
        }));
      }
    }
    const result = solveSchedule(baseInput({
      window: { start: START, end: '2026-08-15T14:00:00.000Z' },
      courts: Array.from({ length: 6 }, (_, index) => ({ id: `c${index + 1}` })),
      matches,
      options: { beamWidth: 64, topK: 24, maxExpandedStates: 250_000, maxWallMs: 5_000 },
    }));
    expect(result.status).toBe('feasible');
    expect(result.assignments).toHaveLength(120);
    // The p95 target is a serial benchmark metric. This test runs beside the
    // 170-match stress corpus, so it guards the five-second safety wall.
    expect(result.metrics.elapsedMs).toBeLessThan(5_000);
  }, 10_000);
});
