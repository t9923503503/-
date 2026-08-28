import { describe, expect, it } from 'vitest';
import {
  classifyProfilePlayEntry,
  groupProfilePlayEntries,
} from '../../web/lib/profile-play-entries';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: String(overrides.id || crypto.randomUUID()),
    startsAt: '2026-08-03T13:00:00.000Z',
    endsAt: '2026-08-03T15:00:00.000Z',
    status: 'published',
    viewerStatus: 'confirmed',
    ...overrides,
  } as any;
}

describe('profile play entry groups', () => {
  it('keeps an event active exactly at its end boundary', () => {
    expect(classifyProfilePlayEntry(post({ endsAt: new Date(NOW).toISOString() }), NOW)).toBe('upcoming');
  });

  it('separates reserve, cancelled, and completed entries', () => {
    expect(classifyProfilePlayEntry(post({ viewerStatus: 'reserve' }), NOW)).toBe('reserve');
    expect(classifyProfilePlayEntry(post({ viewerStatus: 'cancelled' }), NOW)).toBe('cancelled');
    expect(classifyProfilePlayEntry(post({ status: 'cancelled' }), NOW)).toBe('cancelled');
    expect(classifyProfilePlayEntry(post({ endsAt: '2026-08-03T11:59:59.000Z' }), NOW)).toBe('completed');
  });

  it('sorts future entries ascending and archive entries descending', () => {
    const grouped = groupProfilePlayEntries([
      post({ id: 'future-late', startsAt: '2026-08-05T12:00:00.000Z', endsAt: '2026-08-05T14:00:00.000Z' }),
      post({ id: 'future-early', startsAt: '2026-08-04T12:00:00.000Z', endsAt: '2026-08-04T14:00:00.000Z' }),
      post({ id: 'past-old', startsAt: '2026-07-01T12:00:00.000Z', endsAt: '2026-07-01T14:00:00.000Z' }),
      post({ id: 'past-new', startsAt: '2026-08-01T12:00:00.000Z', endsAt: '2026-08-01T14:00:00.000Z' }),
    ], NOW);

    expect(grouped.upcoming.map((item) => item.id)).toEqual(['future-early', 'future-late']);
    expect(grouped.completed.map((item) => item.id)).toEqual(['past-new', 'past-old']);
  });
});

