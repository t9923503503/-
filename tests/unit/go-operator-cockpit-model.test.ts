import { describe, expect, it } from 'vitest';
import type { GoMatchView, GoTeamView } from '../../web/lib/go-next/types';
import {
  buildCockpitAlerts,
  buildStepperItems,
  deriveCourtsCards,
  deriveStageSummary,
  mapOperatorToDomainStage,
  pickPrimaryAction,
} from '../../web/components/go-next/operator-cockpit-model';

function team(id: string, label: string): GoTeamView {
  return {
    teamId: id,
    teamIdx: 1,
    seed: null,
    initialBucket: 'hard',
    isBye: false,
    player1: { id: `${id}-1`, name: `${label} A` },
    player2: { id: `${id}-2`, name: `${label} B` },
    ratingSnapshot: 1000,
    label,
  };
}

function match(overrides: Partial<GoMatchView>): GoMatchView {
  return {
    matchId: 'm1',
    matchNo: 1,
    courtNo: 1,
    teamA: team('a', 'Alpha'),
    teamB: team('b', 'Beta'),
    scoreA: [],
    scoreB: [],
    setsA: 0,
    setsB: 0,
    winnerId: null,
    walkover: 'none',
    status: 'pending',
    scheduledAt: '2026-04-14T10:00:00.000Z',
    slotIndex: 1,
    groupLabel: 'A',
    bracketLevel: null,
    bracketRound: null,
    ...overrides,
  };
}

describe('go operator cockpit model', () => {
  it('maps backend stages to domain stages', () => {
    expect(mapOperatorToDomainStage('setup')).toBe('setup_incomplete');
    expect(mapOperatorToDomainStage('groups_finished')).toBe('groups_done');
    expect(mapOperatorToDomainStage('bracket_ready')).toBe('bracket_ready');
    expect(mapOperatorToDomainStage('finished')).toBe('bracket_done');
  });

  it('builds summary and blocks on unscheduled pending matches', () => {
    const matches = [match({ status: 'pending', courtNo: null, scheduledAt: null })];
    const summary = deriveStageSummary(matches);
    expect(summary.unscheduledPendingMatches).toBe(1);
    const alerts = buildCockpitAlerts({
      domainStage: 'groups_live',
      summary,
      courts: [],
      fetchError: '',
      patchError: '',
      staleMs: 0,
      staleThresholdMs: 90_000,
    });
    expect(alerts.some((alert) => alert.level === 'blocking')).toBe(true);
  });

  it('derives court statuses and stale offline state', () => {
    const cardsLive = deriveCourtsCards({
      matches: [match({ status: 'live', setsA: 1, setsB: 0 })],
      courts: [{ courtNo: 1, label: 'Court 1', pinCode: 'PIN1' }],
      staleMs: 1000,
      staleThresholdMs: 90_000,
    });
    expect(cardsLive[0].status).toBe('live');

    const cardsOffline = deriveCourtsCards({
      matches: [match({ status: 'live' })],
      courts: [{ courtNo: 1, label: 'Court 1', pinCode: 'PIN1' }],
      staleMs: 200_000,
      staleThresholdMs: 90_000,
    });
    expect(cardsOffline[0].status).toBe('offline');
  });

  it('selects blocking CTA over stage CTA and builds dynamic stepper', () => {
    const matches = [match({ bracketLevel: 'HARD', bracketRound: 1 })];
    const summary = deriveStageSummary(matches);
    const alerts = buildCockpitAlerts({
      domainStage: 'groups_live',
      summary: { ...summary, unscheduledPendingMatches: 2 },
      courts: [],
      fetchError: '',
      patchError: '',
      staleMs: 0,
      staleThresholdMs: 90_000,
    });
    const action = pickPrimaryAction({ domainStage: 'groups_live', summary, alerts });
    expect(action.priority).toBe(1);
    expect(action.id).toBe('resolve_assignments');

    const stepper = buildStepperItems({ domainStage: 'groups_live', matches });
    expect(stepper.some((item) => item.id === 'playoff' && item.hidden)).toBe(false);
  });
});
