import { describe, expect, it } from 'vitest';

import { buildLpvTierCourtPolicy } from '../../web/lib/go-v2/court-policy';
import {
  applyGoV2CourtPolicyExceptions,
  assertGoV2CourtPolicyExceptionNotExpired,
  parseGoV2CourtPolicyExceptionRequest,
} from '../../web/lib/go-v2/court-policy-exceptions';
import {
  solveSchedule,
  validateSchedule,
  type ScheduleSolverInput,
} from '../../web/lib/go-v2/scheduler';

const TOURNAMENT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const STAGE_ID = '33333333-3333-4333-8333-333333333333';
const COURT_1 = '44444444-4444-4444-8444-444444444441';
const COURT_2 = '44444444-4444-4444-8444-444444444442';
const START = '2026-08-15T06:00:00.000Z';
const END = '2026-08-15T08:00:00.000Z';

describe('GO V2 director court-policy exception', () => {
  it('normalizes the bounded request and rejects malformed authority scope', () => {
    expect(parseGoV2CourtPolicyExceptionRequest({
      tier: 'LIGHT',
      allowedCourtIds: [COURT_1],
      effectiveFrom: '2026-08-15T06:40:00Z',
      effectiveUntil: '2026-08-15T07:20:00Z',
    })).toEqual({
      tier: 'light',
      allowedCourtIds: [COURT_1],
      effectiveFrom: '2026-08-15T06:40:00.000Z',
      effectiveUntil: '2026-08-15T07:20:00.000Z',
      stageId: null,
    });
    expect(() => parseGoV2CourtPolicyExceptionRequest({
      tier: 'light',
      allowedCourtIds: [COURT_1, COURT_1],
      effectiveFrom: '2026-08-15T06:40:00Z',
      effectiveUntil: '2026-08-15T07:20:00Z',
    })).toThrow('must not contain duplicates');
    expect(() => parseGoV2CourtPolicyExceptionRequest({
      tier: 'light',
      allowedCourtIds: [COURT_1],
      effectiveFrom: '2026-08-15T07:20:00Z',
      effectiveUntil: '2026-08-15T06:40:00Z',
    })).toThrow('must be after');

    const expired = parseGoV2CourtPolicyExceptionRequest({
      tier: 'light',
      allowedCourtIds: [COURT_1],
      effectiveFrom: '2026-08-15T06:40:00Z',
      effectiveUntil: '2026-08-15T07:20:00Z',
    });
    expect(() => assertGoV2CourtPolicyExceptionNotExpired(
      expired,
      new Date('2026-08-15T07:20:00.000Z'),
    )).toThrow('already expired');
    expect(() => assertGoV2CourtPolicyExceptionNotExpired(
      expired,
      new Date('2026-08-15T07:19:59.999Z'),
    )).not.toThrow();
  });

  it('keeps strict Light on court 2 outside the approved interval', () => {
    const strict = buildLpvTierCourtPolicy({
      courts: [{ id: COURT_1, courtNo: 1 }, { id: COURT_2, courtNo: 2 }],
      stageKind: 'playoff',
      tier: 'light',
      tierProfile: 'hard_light',
    });
    const approved = applyGoV2CourtPolicyExceptions(strict, {
      tournamentId: TOURNAMENT_ID,
      stageId: STAGE_ID,
      tier: 'light',
      stageKind: 'playoff',
    }, [{
      id: 'preview:policy',
      tournamentId: TOURNAMENT_ID,
      scheduleSessionId: SESSION_ID,
      stageId: null,
      tier: 'light',
      decision: 'approve',
      allowedCourtIds: [COURT_1],
      effectiveFrom: '2026-08-15T06:40:00.000Z',
      effectiveUntil: '2026-08-15T07:20:00.000Z',
    }]);
    expect(approved.courtPolicy).toMatchObject({
      mode: 'approved_overflow',
      allowedCourtIds: [COURT_1, COURT_2],
      preferredCourtIds: [COURT_2],
      exceptionCourtWindows: {
        [COURT_1]: [{
          start: '2026-08-15T06:40:00.000Z',
          end: '2026-08-15T07:20:00.000Z',
        }],
      },
    });

    const input: ScheduleSolverInput = {
      window: { start: START, end: END },
      courts: [
        { id: COURT_1 },
        { id: COURT_2, availability: [] },
      ],
      matches: [{
        id: 'light-match',
        durationMinutes: 20,
        teamIds: ['a', 'b'],
        stageKind: 'playoff',
        tier: 'light',
        ...approved,
      }],
      referee: { mode: 'none' },
      options: { beamWidth: 16, topK: 8, maxExpandedStates: 20_000, maxWallMs: 2_000 },
    };
    const solved = solveSchedule(input);
    expect(solved.publishable).toBe(true);
    expect(solved.assignments[0]).toMatchObject({
      courtId: COURT_1,
      start: '2026-08-15T06:40:00.000Z',
    });
    const tampered = [{
      ...solved.assignments[0],
      start: '2026-08-15T06:00:00.000Z',
      end: '2026-08-15T06:20:00.000Z',
    }];
    expect(validateSchedule(input, tampered).conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TIER_COURT_POLICY_VIOLATION', courtId: COURT_1 }),
    ]));
  });

  it('does not apply another tournament, tier or stage exception', () => {
    const strict = buildLpvTierCourtPolicy({
      courts: [{ id: COURT_1, courtNo: 1 }, { id: COURT_2, courtNo: 2 }],
      stageKind: 'playoff',
      tier: 'light',
      tierProfile: 'hard_light',
    });
    const ignored = applyGoV2CourtPolicyExceptions(strict, {
      tournamentId: TOURNAMENT_ID,
      stageId: STAGE_ID,
      tier: 'light',
      stageKind: 'playoff',
    }, [{
      id: 'other-stage',
      tournamentId: TOURNAMENT_ID,
      scheduleSessionId: SESSION_ID,
      stageId: '55555555-5555-4555-8555-555555555555',
      tier: 'light',
      decision: 'approve',
      allowedCourtIds: [COURT_1],
      effectiveFrom: '2026-08-15T06:40:00.000Z',
      effectiveUntil: '2026-08-15T07:20:00.000Z',
    }]);
    expect(ignored.courtPolicy).toEqual(strict.courtPolicy);
    expect(ignored.appliedExceptionIds).toEqual([]);
  });
});
