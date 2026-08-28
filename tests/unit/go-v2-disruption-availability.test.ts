import { describe, expect, it } from 'vitest';

import {
  normalizeGoV2AuthoritativeCourtWindows,
  subtractGoV2BlockedWindows,
} from '../../web/lib/go-v2/service';

describe('GO V2 authoritative disruption availability', () => {
  it('subtracts a closure from court availability instead of trusting the client window', () => {
    expect(subtractGoV2BlockedWindows(
      [{ start: '2026-08-27T04:00:00.000Z', end: '2026-08-27T10:00:00.000Z' }],
      [{ start: '2026-08-27T06:00:00.000Z', end: '2026-08-27T07:30:00.000Z' }],
    )).toEqual([
      { start: '2026-08-27T04:00:00.000Z', end: '2026-08-27T06:00:00.000Z' },
      { start: '2026-08-27T07:30:00.000Z', end: '2026-08-27T10:00:00.000Z' },
    ]);
  });

  it('can close the entire remaining day', () => {
    expect(subtractGoV2BlockedWindows(
      [{ start: '2026-08-27T04:00:00.000Z', end: '2026-08-27T10:00:00.000Z' }],
      [{ start: '2026-08-27T03:00:00.000Z', end: '2026-08-27T11:00:00.000Z' }],
    )).toEqual([]);
  });

  it('normalizes authoritative session windows and rejects an empty client-independent source', () => {
    expect(normalizeGoV2AuthoritativeCourtWindows([
      { start: '2026-08-27T09:00:00+05:00', end: '2026-08-27T11:00:00+05:00' },
      { start: '2026-08-27T12:00:00+05:00', end: '2026-08-27T13:00:00+05:00' },
    ], 1)).toEqual([
      { start: '2026-08-27T04:00:00.000Z', end: '2026-08-27T06:00:00.000Z' },
      { start: '2026-08-27T07:00:00.000Z', end: '2026-08-27T08:00:00.000Z' },
    ]);
    expect(() => normalizeGoV2AuthoritativeCourtWindows([], 1))
      .toThrowError(expect.objectContaining({ code: 'AUTHORITATIVE_COURT_WINDOWS_INVALID' }));
  });
});
