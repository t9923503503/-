import { describe, expect, it } from 'vitest';

import {
  buildGoV2ScheduleAssignmentDiff,
  parseGoV2ScheduleDeferRequest,
  scheduleDeferRequiresDirector,
} from '../../web/lib/go-v2/schedule-defer';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';

describe('GO V2 generic schedule defer', () => {
  it('accepts an explicit not-before and rejects client timing for end-of-queue', () => {
    expect(parseGoV2ScheduleDeferRequest({
      matchId: MATCH_ID,
      deferMode: 'not_before',
      notBefore: '2026-08-30T09:45:00+05:00',
    })).toEqual({
      matchId: MATCH_ID,
      deferMode: 'not_before',
      notBefore: '2026-08-30T04:45:00.000Z',
    });
    expect(parseGoV2ScheduleDeferRequest({
      matchId: MATCH_ID,
      deferMode: 'end_of_queue',
    })).toEqual({ matchId: MATCH_ID, deferMode: 'end_of_queue', notBefore: null });
    expect(() => parseGoV2ScheduleDeferRequest({
      matchId: MATCH_ID,
      deferMode: 'end_of_queue',
      notBefore: '2026-08-30T04:45:00Z',
    })).toThrowError(/server-derived/);
  });

  it('requires a director for an explicit lock or an assignment in the rolling freeze horizon', () => {
    const nowMs = Date.parse('2026-08-30T04:00:00Z');
    expect(scheduleDeferRequiresDirector({
      assignmentLocked: true,
      plannedStart: '2026-08-30T08:00:00Z',
      freezeHorizonMinutes: 60,
      nowMs,
    })).toBe(true);
    expect(scheduleDeferRequiresDirector({
      assignmentLocked: false,
      plannedStart: '2026-08-30T04:45:00Z',
      freezeHorizonMinutes: 60,
      nowMs,
    })).toBe(true);
    expect(scheduleDeferRequiresDirector({
      assignmentLocked: false,
      plannedStart: '2026-08-30T05:05:00Z',
      freezeHorizonMinutes: 60,
      nowMs,
    })).toBe(false);
  });

  it('reports the exact changed assignment including court, time and referee', () => {
    const current = new Map([
      [MATCH_ID, { courtId: 'court-2', start: '2026-08-30T04:00:00Z' }],
    ]);
    expect(buildGoV2ScheduleAssignmentDiff(current, [{
      matchId: MATCH_ID,
      courtId: 'court-2',
      start: '2026-08-30T05:00:00Z',
      end: '2026-08-30T05:20:00Z',
      referee: { kind: 'court_judge' },
    }])).toEqual([{
      matchId: MATCH_ID,
      from: { courtId: 'court-2', start: '2026-08-30T04:00:00Z' },
      to: {
        courtId: 'court-2',
        start: '2026-08-30T05:00:00Z',
        end: '2026-08-30T05:20:00Z',
        referee: { kind: 'court_judge' },
      },
    }]);
  });
});
