import { describe, expect, it } from 'vitest';
import { adminUnfilledPlayDeleteBlocker } from '../../web/lib/play-admin-cleanup';

const now = new Date('2026-08-26T08:00:00.000Z').getTime();

describe('admin cleanup eligibility for unfilled games', () => {
  it('allows past, cancelled, completed and draft games without a result', () => {
    for (const state of [
      { kind: 'game', status: 'published', endsAt: '2026-08-25T08:00:00.000Z', hasResult: false, liveStatus: null },
      { kind: 'game', status: 'cancelled', endsAt: '2026-08-27T08:00:00.000Z', hasResult: false, liveStatus: null },
      { kind: 'game', status: 'completed', endsAt: '2026-08-27T08:00:00.000Z', hasResult: false, liveStatus: 'completed' },
      { kind: 'game', status: 'draft', endsAt: '2026-08-27T08:00:00.000Z', hasResult: false, liveStatus: null },
    ]) {
      expect(adminUnfilledPlayDeleteBlocker(state, now)).toBeNull();
    }
  });

  it('blocks future published games', () => {
    expect(adminUnfilledPlayDeleteBlocker({
      kind: 'game', status: 'published', endsAt: '2026-08-27T08:00:00.000Z', hasResult: false, liveStatus: null,
    }, now)).toContain('Будущую');
  });

  it('blocks scored games and active live sessions', () => {
    expect(adminUnfilledPlayDeleteBlocker({
      kind: 'game', status: 'completed', endsAt: '2026-08-25T08:00:00.000Z', hasResult: true, liveStatus: null,
    }, now)).toContain('результат');
    expect(adminUnfilledPlayDeleteBlocker({
      kind: 'game', status: 'published', endsAt: '2026-08-25T08:00:00.000Z', hasResult: false, liveStatus: 'active',
    }, now)).toContain('live-режиме');
  });

  it('does not treat trainings as deletable games', () => {
    expect(adminUnfilledPlayDeleteBlocker({
      kind: 'training', status: 'completed', endsAt: '2026-08-25T08:00:00.000Z', hasResult: false, liveStatus: null,
    }, now)).toContain('только игры');
  });
});
