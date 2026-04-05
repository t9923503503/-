import { describe, expect, it, vi, afterEach } from 'vitest';

describe('KOTC live API normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Первая загрузка `api.ts` через Vite в jsdom может занять >5s на холодном старте.
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
          activeSlotIdx: 2,
          activeServerPlayerIdx: 1,
          waitingServerPlayerIdx: 0,
          serverPlayerIdxBySlot: [0, null, 1, 0],
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
    expect(snapshot.courts[1].activeSlotIdx).toBe(2);
    expect(snapshot.courts[1].activeServerPlayerIdx).toBe(1);
    expect(snapshot.courts[1].waitingServerPlayerIdx).toBe(0);
    expect(snapshot.courts[1].serverPlayerIdxBySlot).toEqual([0, null, 1, 0]);
    expect(snapshot.courts[1].scores.home).toBe(5);
    expect(snapshot.courts[2].roundIdx).toBe(3);
    expect(snapshot.courts[2].scores.away).toBe(7);
  }, 30_000);

  it('listSessions times out instead of hanging forever on bootstrap', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init = {}) => new Promise((_, reject) => {
        init.signal?.addEventListener?.('abort', () => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      })),
    );

    const { listSessions } = await import('../../web/components/kotc-live/api.ts');
    const promise = listSessions();
    const assertion = expect(promise).rejects.toThrow('KOTC Live bootstrap timeout');

    await vi.advanceTimersByTimeAsync(8_100);

    await assertion;
  }, 30_000);
});
