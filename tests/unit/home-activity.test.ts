import { describe, expect, it } from 'vitest';
import { mergeHomeActivity, summarizeHomeGameResult } from '../../web/lib/home';

describe('home activity aggregation', () => {
  it('orders tournament and game results by activity date', () => {
    const activity = mergeHomeActivity(
      [{ kind: 'tournament', id: 't', href: '/calendar/t', title: 'Турнир', date: '2026-08-01', format: 'KOTC', podium: [] }],
      [{ kind: 'game', id: 'g', href: '/partner/g', title: 'Игра', date: '2026-08-03T14:00:00.000Z', format: '2×2', summary: '15:12', leaders: [] }],
    );
    expect(activity.map((item) => item.id)).toEqual(['g', 't']);
  });

  it('summarizes a confirmed classic game without exposing raw payload', () => {
    const summary = summarizeHomeGameResult(
      { version: 2, format: 'classic_2x2', pairingMode: 'fixed', pointLimit: 15, matches: [{ id: 'm1', teamA: [1, 2], teamB: [3, 4], scoreA: 15, scoreB: 12 }] },
      [
        { resultKey: 1, playerId: 'p1', name: 'Анна' },
        { resultKey: 2, playerId: 'p2', name: 'Борис' },
        { resultKey: 3, playerId: 'p3', name: 'Вера' },
        { resultKey: 4, playerId: 'p4', name: 'Глеб' },
      ],
    );
    expect(summary.summary).toContain('Анна + Борис');
    expect(summary.summary).toContain('15:12');
  });

  it('returns an empty leader list for invalid legacy payloads', () => {
    expect(summarizeHomeGameResult({ legacy: true }, []).leaders).toEqual([]);
  });
});
