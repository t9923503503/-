import { describe, expect, it } from 'vitest';
import { aggregateKotcNextPresence, buildKotcNextCockpitViewModel } from '../../web/lib/kotc-next/control-view-model';
import type { KotcNextOperatorState } from '../../web/lib/kotc-next/types';

function state(status: 'pending' | 'running' | 'paused', presence: Array<'online' | 'stale' | 'offline'>): KotcNextOperatorState {
  return {
    controlRevision: 1,
    serverNow: Date.now(),
    stage: 'r1_live',
    tournamentId: 't1', tournamentName: 'King', tournamentDate: '', tournamentTime: '', tournamentLocation: '',
    variant: 'MM', params: { courts: presence.length, ppc: 3, raundCount: 3, raundTimerMinutes: 10, r1TimerMinutes: 10, r2TimerMinutes: 10, takeoversMode: 'takeovers' },
    rounds: [{ roundId: 'r1', roundNo: 1, roundType: 'r1', status: 'live', courts: presence.map((value, index) => ({
      courtId: `c${index}`, courtNo: index + 1, label: `К${index + 1}`, pinCode: '', judgeUrl: '', status: status === 'pending' ? 'pending' : 'live', pairs: [],
      raunds: [{ raundNo: 1, status, startedAt: null, finishedAt: null, pausedAt: null, accumulatedPauseMs: 0, displayStatus: status, revision: 1, standings: null, canAdminForceFinish: true }],
      currentRaundNo: 1, liveState: null,
      presence: { onlineDevices: value === 'online' ? 1 : 0, staleDevices: value === 'stale' ? 1 : 0, lastSeenAt: null, status: value },
    })) }],
    r2SeedDraft: null, manualR2Draft: null, finalResults: null, finalIndividualResults: null,
    canBootstrapR1: false, canFinishR1: false, canPreviewR2Seed: false, canConfirmR2Seed: false,
    canPreviewManualR2: false, canConfirmManualR2: false, canBootstrapR2: false, canFinishR2: false,
    canResetR2: false, canAdjustR2PairScore: false,
  };
}

describe('KOTC Next cockpit view model', () => {
  it('exposes one start action and readiness warning', () => {
    const vm = buildKotcNextCockpitViewModel(state('pending', ['online', 'offline']), 600_000);
    expect(vm.primaryAction).toBe('start_raund');
    expect(vm.primaryDisabledReason).toMatch(/соединения/);
    expect(vm.warnings).toEqual(['Нет связи: 1']);
  });

  it('selects pause, resume and finish deterministically', () => {
    expect(buildKotcNextCockpitViewModel(state('running', ['online']), 10_000).primaryAction).toBe('pause_raund');
    expect(buildKotcNextCockpitViewModel(state('paused', ['online']), 10_000).primaryAction).toBe('resume_raund');
    expect(buildKotcNextCockpitViewModel(state('paused', ['online']), 0).primaryAction).toBe('finish_raund');
  });

  it('aggregates devices independently from court readiness', () => {
    const result = aggregateKotcNextPresence(state('running', ['online', 'stale', 'offline']));
    expect(result).toMatchObject({ totalCourts: 3, onlineCourts: 1, staleCourts: 1, offlineCourts: 1, onlineDevices: 1 });
  });
});
