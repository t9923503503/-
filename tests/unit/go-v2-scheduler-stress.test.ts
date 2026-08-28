import { describe, expect, it } from 'vitest';
import {
  solveSchedule,
  validateSchedule,
  type ScheduleMatchInput,
  type ScheduleSolverInput,
} from '../../web/lib/go-v2/scheduler';

describe('LPVolley V2 scheduler stress fixture', () => {
  it('publishes and deterministically validates 170 matches on six courts', () => {
    const matches: ScheduleMatchInput[] = [];
    for (let pair = 0; pair < 24; pair += 1) {
      const roundCount = pair < 2 ? 8 : 7;
      for (let round = 0; round < roundCount; round += 1) {
        const prefix = `pair-${String(pair).padStart(2, '0')}`;
        matches.push({
          id: `${prefix}-round-${round}`,
          durationMinutes: 20,
          teamIds: [`team-${pair * 2}`, `team-${pair * 2 + 1}`],
          dependencies: round === 0 ? [] : [`${prefix}-round-${round - 1}`],
        });
      }
    }
    expect(matches).toHaveLength(170);
    const input: ScheduleSolverInput = {
      sessionId: 'stress-170',
      timezone: 'Asia/Yekaterinburg',
      window: {
        start: '2026-08-15T06:00:00.000Z',
        end: '2026-08-15T18:00:00.000Z',
      },
      courts: Array.from({ length: 6 }, (_, index) => ({ id: `court-${index + 1}` })),
      matches,
      referee: { mode: 'none' },
      options: {
        beamWidth: 64,
        topK: 24,
        maxExpandedStates: 250_000,
        maxWallMs: 10_000,
      },
    };

    const first = solveSchedule(input);
    const second = solveSchedule(input);
    expect(first.status).toBe('feasible');
    expect(first.publishable).toBe(true);
    expect(first.assignments).toHaveLength(170);
    expect(second.status).toBe(first.status);
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.scheduleHash).toBe(first.scheduleHash);
    expect(second.assignments).toEqual(first.assignments);
    expect(second.metrics.expandedStates).toBe(first.metrics.expandedStates);
    expect(second.metrics.candidateEvaluations).toBe(first.metrics.candidateEvaluations);

    const validation = validateSchedule(input, first.assignments);
    expect(validation.valid).toBe(true);
    expect(validation.publishable).toBe(true);
    expect(validation.scheduleHash).toBe(first.scheduleHash);
    expect(validation.objective).toEqual(first.objective);
  }, 20_000);
});
