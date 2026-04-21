import { describe, expect, it } from 'vitest';
import { createInitialState, reducer } from '../../web/lib/judge-scoreboard/reducer';
import { getServePlayerRef } from '../../web/lib/judge-scoreboard/serve';
import type { MatchState, TeamPlayer } from '../../web/lib/judge-scoreboard/types';

const teamAPlayers: TeamPlayer[] = [
  { id: 'a-1', name: 'Иванов' },
  { id: 'a-2', name: 'Сидоров' },
];

const teamBPlayers: TeamPlayer[] = [
  { id: 'b-1', name: 'Петров' },
  { id: 'b-2', name: 'Смирнов' },
];

function startMatchState(
  courtId = '1',
  configPatch: Partial<MatchState['config']> = {},
): MatchState {
  const initial = createInitialState(courtId);
  return reducer(initial, {
    type: 'START_MATCH',
    meta: {
      ...initial.meta,
      courtId,
      matchName: `Court ${courtId}`,
      judgeName: 'Judge',
      groupLabel: 'GROUP A',
    },
    config: {
      ...initial.config,
      ...configPatch,
    },
    teamA: 'Команда A',
    teamB: 'Команда B',
    teamAPlayers,
    teamBPlayers,
  });
}

function withServeSetup(state: MatchState, firstServer: 'A' | 'B' = 'A'): MatchState {
  return reducer(state, {
    type: 'APPLY_SET_SERVE_SETUP',
    teamAOrder: teamAPlayers,
    teamBOrder: teamBPlayers,
    firstServer,
    swapSides: false,
  });
}

describe('judge scoreboard reducer', () => {
  it('starts a match in set setup with structured rosters', () => {
    const state = startMatchState();

    expect(state.core.status).toBe('set_setup');
    expect(state.core.servingTeam).toBeNull();
    expect(state.core.teamAPlayers.map((player) => player.name)).toEqual(['Иванов', 'Сидоров']);
    expect(state.core.teamBPlayers.map((player) => player.name)).toEqual(['Петров', 'Смирнов']);
  });

  it('applies serve setup and stores first server plus serve order', () => {
    const started = startMatchState();
    const state = reducer(started, {
      type: 'APPLY_SET_SERVE_SETUP',
      teamAOrder: [...teamAPlayers].reverse(),
      teamBOrder: teamBPlayers,
      firstServer: 'B',
      swapSides: true,
    });

    expect(state.core.status).toBe('playing');
    expect(state.core.servingTeam).toBe('B');
    expect(state.core.leftTeam).toBe('B');
    expect(state.core.serveState.A.order.map((player) => player.name)).toEqual(['Сидоров', 'Иванов']);
    expect(state.events.at(-1)?.type).toBe('serve_setup');
  });

  it('keeps the same server on service winner and rotates on side-out', () => {
    const ready = withServeSetup(startMatchState(), 'A');
    const servicePoint = reducer(ready, { type: 'ADD_POINT', team: 'A', delta: 1 });

    expect(servicePoint.core.servingTeam).toBe('A');
    expect(getServePlayerRef(servicePoint.core.serveState.A, 'current')?.name).toBe('Иванов');

    const sideOut = reducer(servicePoint, { type: 'ADD_POINT', team: 'B', delta: 1 });

    expect(sideOut.core.servingTeam).toBe('B');
    expect(getServePlayerRef(sideOut.core.serveState.A, 'current')?.name).toBe('Сидоров');
    expect(getServePlayerRef(sideOut.core.serveState.B, 'current')?.name).toBe('Петров');
    expect(sideOut.events.at(-1)?.isSideOut).toBe(true);
  });

  it('moves to next set setup after end set in a multi-set match', () => {
    const started = startMatchState('1', {
      targetMain: 1,
      targetDecider: 1,
      setsToWin: 2,
      winByTwo: false,
    });
    const ready = withServeSetup(started, 'A');
    const wonRally = reducer(ready, { type: 'ADD_POINT', team: 'A', delta: 1 });
    const ended = reducer(wonRally, { type: 'END_SET', force: false });

    expect(ended.core.status).toBe('set_setup');
    expect(ended.core.currentSet).toBe(2);
    expect(ended.core.setsA).toBe(1);
    expect(ended.core.scoreA).toBe(0);
    expect(ended.core.scoreB).toBe(0);
    expect(ended.core.servingTeam).toBeNull();
  });

  it('undo restores serve-aware state and trims the last event', () => {
    const ready = withServeSetup(startMatchState(), 'A');
    const firstRally = reducer(ready, { type: 'ADD_POINT', team: 'A', delta: 1 });
    const secondRally = reducer(firstRally, { type: 'ADD_POINT', team: 'B', delta: 1 });
    const undone = reducer(secondRally, { type: 'UNDO' });

    expect(undone.core.scoreA).toBe(1);
    expect(undone.core.scoreB).toBe(0);
    expect(undone.core.servingTeam).toBe('A');
    expect(getServePlayerRef(undone.core.serveState.A, 'current')?.name).toBe('Иванов');
    expect(undone.events.map((event) => event.type)).toEqual(['serve_setup', 'rally']);
  });
});
