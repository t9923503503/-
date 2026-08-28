import { describe, expect, it } from 'vitest';

import {
  parseGoV2ScheduleDeferReleaseRequest,
  scheduleDeferRequiresDirector,
} from '../../web/lib/go-v2/schedule-defer';

const MATCH_ID = '22222222-2222-4222-8222-222222222222';

describe('GO V2 schedule defer release', () => {
  it('requires a stable match id and ignores no client-supplied schedule', () => {
    expect(parseGoV2ScheduleDeferReleaseRequest({ matchId: MATCH_ID })).toEqual({ matchId: MATCH_ID });
    expect(() => parseGoV2ScheduleDeferReleaseRequest({ matchId: 'not-a-uuid' })).toThrowError();
  });

  it('uses the same rolling director escalation as the original defer', () => {
    const nowMs = Date.parse('2026-08-30T04:00:00Z');
    expect(scheduleDeferRequiresDirector({
      assignmentLocked: false,
      plannedStart: '2026-08-30T04:30:00Z',
      freezeHorizonMinutes: 60,
      nowMs,
    })).toBe(true);
    expect(scheduleDeferRequiresDirector({
      assignmentLocked: false,
      plannedStart: '2026-08-30T06:00:00Z',
      freezeHorizonMinutes: 60,
      nowMs,
    })).toBe(false);
  });
});
