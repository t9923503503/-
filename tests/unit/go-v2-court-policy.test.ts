import { describe, expect, it } from 'vitest';
import {
  buildLpvTierCourtPolicy,
  preflightSchedule,
  solveSchedule,
  validateSchedule,
  type ScheduleMatchInput,
  type ScheduleSolverInput,
  type ScheduleTierProfile,
} from '../../web/lib/go-v2/scheduler';

const START = '2026-08-15T06:00:00.000Z';
const END = '2026-08-15T08:00:00.000Z';

function numberedCourts(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `c${index + 1}`, courtNo: index + 1 }));
}

function policy(
  count: number,
  tier: 'hard' | 'medium' | 'light',
  tierProfile: ScheduleTierProfile,
  overflowMode?: 'strict' | 'approved_overflow',
) {
  return buildLpvTierCourtPolicy({
    courts: numberedCourts(count),
    stageKind: 'playoff',
    tier,
    tierProfile,
    overflowMode,
  });
}

function input(courts: ScheduleSolverInput['courts'], matches: ScheduleMatchInput[]): ScheduleSolverInput {
  return {
    window: { start: START, end: END },
    courts,
    matches,
    referee: { mode: 'none' },
    options: { beamWidth: 16, topK: 8, maxExpandedStates: 20_000, maxWallMs: 2_000 },
  };
}

function tierMatch(
  id: string,
  tier: 'hard' | 'medium' | 'light',
  binding: ReturnType<typeof policy>,
  overrides: Partial<ScheduleMatchInput> = {},
): ScheduleMatchInput {
  return {
    id,
    durationMinutes: 20,
    teamIds: [`${id}-a`, `${id}-b`],
    stageKind: 'playoff',
    tier,
    ...binding,
    ...overrides,
  };
}

describe('lpv_tier_courts_v1', () => {
  it.each([
    [1, 'hard_medium_light', 'hard', ['c1']],
    [1, 'hard_medium_light', 'medium', ['c1']],
    [1, 'hard_medium_light', 'light', ['c1']],
    [2, 'hard_medium_light', 'hard', ['c1']],
    [2, 'hard_medium_light', 'medium', ['c1']],
    [2, 'hard_medium_light', 'light', ['c2']],
    [3, 'hard_medium_light', 'hard', ['c3']],
    [3, 'hard_medium_light', 'medium', ['c1']],
    [3, 'hard_medium_light', 'light', ['c2']],
    [4, 'hard_medium_light', 'hard', ['c3', 'c4']],
    [4, 'hard_medium_light', 'medium', ['c1']],
    [4, 'hard_medium_light', 'light', ['c2']],
  ] as const)(
    'maps %i courts / %s / %s to %j',
    (count, tierProfile, tier, expected) => {
      expect(policy(count, tier, tierProfile).courtPolicy).toMatchObject({
        code: 'lpv_tier_courts_v1',
        mode: 'strict',
        allowedCourtIds: expected,
        preferredCourtIds: expected,
      });
    },
  );

  it('keeps court 1 as a permitted two-tier Hard fallback while preferring courts 3-4', () => {
    expect(policy(3, 'hard', 'hard_light').courtPolicy).toMatchObject({
      mode: 'strict',
      allowedCourtIds: ['c1', 'c3'],
      preferredCourtIds: ['c3'],
    });
    expect(policy(4, 'hard', 'hard_light').courtPolicy).toMatchObject({
      mode: 'strict',
      allowedCourtIds: ['c1', 'c3', 'c4'],
      preferredCourtIds: ['c3', 'c4'],
    });
  });

  it('keeps pools neutral and resolves physical numbers independently of input order', () => {
    const first = buildLpvTierCourtPolicy({
      courts: numberedCourts(4),
      stageKind: 'pool',
      tier: 'hard',
      tierProfile: 'hard_medium_light',
    });
    const second = buildLpvTierCourtPolicy({
      courts: numberedCourts(4).reverse(),
      stageKind: 'pool',
      tier: 'hard',
      tierProfile: 'hard_medium_light',
      overflowMode: 'approved_overflow',
    });
    expect(first).toEqual(second);
    expect(first.courtPolicy).toMatchObject({
      mode: 'neutral',
      allowedCourtIds: ['c1', 'c2', 'c3', 'c4'],
      preferredCourtIds: ['c1', 'c2', 'c3', 'c4'],
    });
  });

  it('never enables overflow implicitly', () => {
    const strict = policy(4, 'light', 'hard_medium_light');
    const approved = policy(4, 'light', 'hard_medium_light', 'approved_overflow');
    expect(strict.courtPolicy.allowedCourtIds).toEqual(['c2']);
    expect(approved.courtPolicy).toMatchObject({
      mode: 'approved_overflow',
      allowedCourtIds: ['c1', 'c2', 'c3', 'c4'],
      preferredCourtIds: ['c2'],
    });
    expect(approved.courtAffinityPenalties).toEqual({ c1: 10, c2: 0, c3: 10, c4: 10 });
  });

  it('treats explicit empty availability as fully closed instead of reopening it', () => {
    const result = solveSchedule(input(
      [{ id: 'c1', availability: [] }],
      [tierMatch('light-1', 'light', policy(1, 'light', 'hard_light'))],
    ));
    expect(result.status).toBe('infeasible');
    expect(result.assignments).toEqual([]);
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NO_ACTIVE_COURTS' }),
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'COURT_FULLY_CLOSED', courtId: 'c1' }),
    ]));
  });

  it('serializes strict Light matches on court 2 and validator rejects court 1 tampering', () => {
    const lightPolicy = policy(2, 'light', 'hard_light');
    const solverInput = input(
      [{ id: 'c1' }, { id: 'c2' }],
      [
        tierMatch('light-1', 'light', lightPolicy),
        tierMatch('light-2', 'light', lightPolicy),
      ],
    );
    const solved = solveSchedule(solverInput);
    expect(solved.publishable).toBe(true);
    expect(solved.assignments.map((assignment) => assignment.courtId)).toEqual(['c2', 'c2']);
    const first = solved.assignments[0];
    const tampered = solved.assignments.map((assignment) => (
      assignment.matchId === first.matchId ? { ...assignment, courtId: 'c1' } : assignment
    ));
    expect(validateSchedule(solverInput, tampered).conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TIER_COURT_POLICY_VIOLATION', courtId: 'c1' }),
    ]));
  });

  it('uses a non-preferred court only with explicit approved overflow and reports it', () => {
    const overflow = policy(2, 'light', 'hard_light', 'approved_overflow');
    const solverInput = input(
      [{ id: 'c1' }, { id: 'c2', availability: [] }],
      [tierMatch('light-1', 'light', overflow)],
    );
    const solved = solveSchedule(solverInput);
    expect(solved.publishable).toBe(true);
    expect(solved.status).toBe('feasible_with_warnings');
    expect(solved.assignments[0].courtId).toBe('c1');
    expect(solved.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TIER_COURT_FALLBACK_USED', courtId: 'c1' }),
    ]));
    expect(solved.diagnostics?.tiers.find((tier) => tier.tier === 'light')).toMatchObject({
      assignmentCount: 1,
      preferredAssignments: 0,
      fallbackAssignments: 1,
      policyViolationAssignments: 0,
    });
  });

  it('does not spill a strict Light match when court 2 is closed', () => {
    const strict = policy(2, 'light', 'hard_light');
    const solved = solveSchedule(input(
      [{ id: 'c1' }, { id: 'c2', availability: [] }],
      [tierMatch('light-1', 'light', strict)],
    ));
    expect(solved.status).toBe('infeasible');
    expect(solved.assignments).toEqual([]);
    expect(solved.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NO_COURT_WINDOW_FITS_DURATION', matchIds: ['light-1'] }),
    ]));
  });

  it('preflights aggregate capacity of a strict tier lane', () => {
    const lightPolicy = policy(2, 'light', 'hard_light');
    const result = preflightSchedule(input(
      [
        { id: 'c1' },
        { id: 'c2', availability: [{ start: START, end: '2026-08-15T06:30:00.000Z' }] },
      ],
      [
        tierMatch('light-1', 'light', lightPolicy),
        tierMatch('light-2', 'light', lightPolicy),
      ],
    ));
    expect(result.valid).toBe(false);
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TIER_COURT_CAPACITY_DEFICIT',
        courtId: 'c2',
        details: expect.objectContaining({
          requiredCourtMinutes: 40,
          availableCourtMinutes: 30,
          deficitCourtMinutes: 10,
        }),
      }),
    ]));
  });

  it('produces deterministic court and team timeline diagnostics', () => {
    const hardPolicy = policy(3, 'hard', 'hard_medium_light');
    const solverInput = input(
      [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      [
        tierMatch('hard-1', 'hard', hardPolicy, { teamIds: ['A', 'B'], softRestMinutes: 20 }),
        tierMatch('hard-2', 'hard', hardPolicy, { teamIds: ['A', 'C'], softRestMinutes: 20 }),
      ],
    );
    const first = solveSchedule(solverInput);
    const second = solveSchedule({
      ...solverInput,
      courts: solverInput.courts.slice().reverse(),
      matches: solverInput.matches.slice().reverse(),
    });
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics?.courts.find((court) => court.courtId === 'c3')).toMatchObject({
      assignmentCount: 2,
      scheduledMinutes: 40,
      fullyClosed: false,
    });
    expect(first.diagnostics?.teamTimelines.find((team) => team.teamId === 'A')).toMatchObject({
      games: 2,
      matchIds: ['hard-1', 'hard-2'],
      courtSwitches: 0,
    });
    expect(first.diagnostics?.refereeBalance).toMatchObject({
      minDuties: 0,
      maxDuties: 0,
      spread: 0,
    });
  });
});
