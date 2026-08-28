import { describe, expect, it } from 'vitest';

import { normalizeGoV2DisruptionRequest } from '../../web/lib/go-v2/live-operations';

const COURT_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-08-28T05:00:00.000Z');

describe('GO V2 live disruption normalization', () => {
  it('derives one authoritative scope and keeps ETA advisory', () => {
    expect(normalizeGoV2DisruptionRequest({
      disruptionKind: 'court_close',
      courtId: COURT_ID,
      startsAt: '2026-08-28T05:01:00.000Z',
      expectedEndAt: '2026-08-28T06:00:00.000Z',
    }, NOW)).toEqual({
      disruptionKind: 'court_close',
      scopeKind: 'court',
      courtId: COURT_ID,
      matchId: null,
      startsAt: '2026-08-28T05:01:00.000Z',
      expectedEndAt: '2026-08-28T06:00:00.000Z',
    });

    expect(normalizeGoV2DisruptionRequest({
      disruptionKind: 'medical_delay',
      matchId: MATCH_ID,
      startsAt: '2026-08-28T05:00:00.000Z',
    }, NOW)).toMatchObject({ scopeKind: 'match', matchId: MATCH_ID, courtId: null });
  });

  it('rejects forecasts, malformed scopes and court_reopen creation', () => {
    expect(() => normalizeGoV2DisruptionRequest({
      disruptionKind: 'rain_hold',
      startsAt: '2026-08-28T05:03:00.001Z',
    }, NOW)).toThrowError(expect.objectContaining({ code: 'DISRUPTION_EFFECTIVE_TIME_OUT_OF_RANGE' }));

    expect(() => normalizeGoV2DisruptionRequest({
      disruptionKind: 'medical_delay',
      startsAt: '2026-08-28T05:00:00.000Z',
    }, NOW)).toThrowError(expect.objectContaining({ code: 'INVALID_DISRUPTION_SCOPE' }));

    expect(() => normalizeGoV2DisruptionRequest({
      disruptionKind: 'court_reopen',
      courtId: COURT_ID,
      startsAt: '2026-08-28T05:00:00.000Z',
    }, NOW)).toThrowError(expect.objectContaining({ code: 'DISRUPTION_RESOLVE_ENDPOINT_REQUIRED' }));
  });
});
