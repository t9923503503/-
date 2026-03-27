import { describe, expect, it, vi, afterEach } from 'vitest';

describe('KOTC live API normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchSnapshot normalizes backend snapshots where courts is an array', async () => {
    const payload = {
      session: {
        sessionId: 'session-1',
        sessionVersion: 7,
        structureEpoch: 2,
        phase: 'live',
        nc: 2,
      },
      courts: [
        {
          courtIdx: 1,
          courtVersion: 11,
          roundIdx: 1,
          scores: { home: 5, away: 4 },
          timerStatus: 'running',
          timerDurationMs: 60000,
          timerEndsAt: Date.now() + 10000,
          timerPausedAt: null,
        },
        {
          courtIdx: 2,
          courtVersion: 12,
          roundIdx: 3,
          scores: { home: 8, away: 7 },
          timerStatus: 'paused',
          timerDurationMs: 45000,
          timerEndsAt: null,
          timerPausedAt: Date.now(),
        },
      ],
      presence: [],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      })),
    );

    const { fetchSnapshot } = await import('../../web/components/kotc-live/api.ts');
    const snapshot = await fetchSnapshot('session-1', 'global');

    expect(snapshot.nc).toBe(2);
    expect(Object.keys(snapshot.courts)).toEqual(['1', '2']);
    expect(snapshot.courts[1].roundIdx).toBe(1);
    expect(snapshot.courts[1].scores.home).toBe(5);
    expect(snapshot.courts[2].roundIdx).toBe(3);
    expect(snapshot.courts[2].scores.away).toBe(7);
  });
});
