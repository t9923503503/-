import { describe, expect, it } from 'vitest';
import {
  applyIndividualMixLiveCommand,
  buildIndividualMixRosterFingerprint,
  calculateIndividualMixPairStandings,
  calculateIndividualMixStandings,
  createIndividualMixLiveState,
  getIndividualMixActualLineup,
  getIndividualMixCurrentGame,
  getIndividualMixLiveProgress,
  getIndividualMixPostseasonProgress,
  getIndividualMixRoundProgress,
  INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1,
  type IndividualMixLiveCommand,
  type IndividualMixLiveState,
  type IndividualMixPlayer,
} from '@/lib/individual-mix';

function players(): IndividualMixPlayer[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `W${index + 1}`,
    name: `Игрок ${index + 1}`,
    gender: 'W',
    drawSeed: index + 1,
  }));
}

function harness(initial = createIndividualMixLiveState({ players: players(), scheduleRevision: 'schedule-1', preparedAt: '2026-08-27T10:00:00.000Z' })) {
  let state = initial;
  let revision = 0;
  let commandNo = 0;
  return {
    get state() { return state; },
    apply(command: IndividualMixLiveCommand, courtNo: number | null = null, actorKind: 'admin' | 'operator' | 'judge' = 'operator') {
      revision += 1;
      commandNo += 1;
      state = applyIndividualMixLiveCommand(state, command, {
        commandId: `command-${commandNo}`,
        actorKind,
        actorId: actorKind === 'judge' ? `court-${courtNo}` : 'tester',
        courtNo,
        now: `2026-08-27T10:${String(commandNo).padStart(2, '0')}:00.000Z`,
        nextRevision: revision,
      });
      return state;
    },
  };
}

function scoreCurrent(h: ReturnType<typeof harness>, courtNo: 1 | 2, loserScore = 7, actorKind: 'operator' | 'judge' = 'operator') {
  const game = getIndividualMixCurrentGame(h.state, courtNo);
  if (!game) throw new Error(`No current game on court ${courtNo}`);
  h.apply({ type: 'record_score', payload: { gameId: game.id, leftScore: 11, rightScore: loserScore, kind: 'played' } }, courtNo, actorKind);
  return game;
}

function completeAll(h: ReturnType<typeof harness>) {
  while (h.state.currentRound <= 6) {
    while (getIndividualMixCurrentGame(h.state, 1)) scoreCurrent(h, 1);
    while (getIndividualMixCurrentGame(h.state, 2)) scoreCurrent(h, 2);
  }
}

describe('individual-mix six-pair live domain', () => {
  it('uses the starting draw as the final tie-breaker', () => {
    const state = createIndividualMixLiveState({ players: players(), scheduleRevision: 'schedule-tie' });
    const rows = calculateIndividualMixStandings({ schedule: state.schedule, results: [] });
    expect(rows.map((row) => row.drawSeed)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(calculateIndividualMixPairStandings(state).map((row) => row.pairNo)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('applies a repeated command idempotently without duplicating its action', () => {
    const initial = createIndividualMixLiveState({ players: players(), scheduleRevision: 'schedule-idempotent' });
    const game = getIndividualMixCurrentGame(initial, 1)!;
    const command: IndividualMixLiveCommand = {
      type: 'record_score',
      payload: { gameId: game.id, leftScore: 11, rightScore: 8, kind: 'played' },
    };
    const context = {
      commandId: 'same-command',
      actorKind: 'judge' as const,
      actorId: 'court-1',
      courtNo: 1,
      now: '2026-08-27T10:00:00.000Z',
      nextRevision: 1,
    };
    const once = applyIndividualMixLiveCommand(initial, command, context);
    const twice = applyIndividualMixLiveCommand(once, command, { ...context, nextRevision: 2 });
    expect(twice).toEqual(once);
    expect(twice.actions).toHaveLength(1);
  });

  it('fingerprints the ordered roster and rejects silent roster-order reuse', () => {
    const roster = players();
    const original = buildIndividualMixRosterFingerprint(roster);
    const reordered = [...roster];
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(buildIndividualMixRosterFingerprint(reordered)).not.toBe(original);
    expect(buildIndividualMixRosterFingerprint(roster)).toBe(original);
  });

  it('keeps an already started v1 session on its immutable 30-game gate', () => {
    const state = createIndividualMixLiveState({
      players: players(),
      scheduleRevision: 'schedule-v1',
      presetVersion: INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1,
    });
    expect(getIndividualMixLiveProgress(state).total).toBe(30);
    expect(getIndividualMixRoundProgress(state).court2.total).toBe(1);
    const h = harness(state);
    completeAll(h);
    expect(() => h.apply({ type: 'start_postseason', payload: { mode: 'direct_medals' } })).toThrow('только для схемы v2');
    h.apply({ type: 'finalize', payload: { clientQueueDepth: 0, clientHasConflict: false } });
    expect(h.state.status).toBe('finalized');
  });

  it('opens the next round only after all four plus two games are complete', () => {
    const h = harness();
    for (let game = 0; game < 4; game += 1) scoreCurrent(h, 1, 6, 'judge');
    expect(getIndividualMixRoundProgress(h.state)).toMatchObject({ completed: 4, court1: { completed: 4, total: 4 }, court2: { completed: 0, total: 2 } });
    expect(h.state.currentRound).toBe(1);
    expect(getIndividualMixCurrentGame(h.state, 1)).toBeNull();
    expect(getIndividualMixCurrentGame(h.state, 2)?.roundNo).toBe(1);

    scoreCurrent(h, 2, 8, 'judge');
    expect(h.state.currentRound).toBe(1);
    expect(getIndividualMixCurrentGame(h.state, 2)?.mode).toBe('partner_swap');
    scoreCurrent(h, 2, 8, 'judge');
    expect(h.state.currentRound).toBe(2);
    expect(getIndividualMixCurrentGame(h.state, 1)?.roundNo).toBe(2);
    expect(getIndividualMixCurrentGame(h.state, 2)?.roundNo).toBe(2);
  });

  it('lets a judge undo only the latest score action on that court', () => {
    const h = harness();
    const first = scoreCurrent(h, 1, 5, 'judge');
    const second = scoreCurrent(h, 1, 4, 'judge');
    h.apply({ type: 'undo_last', payload: {} }, 1, 'judge');
    expect(h.state.results[first.id]).toBeTruthy();
    expect(h.state.results[second.id]).toBeUndefined();
    expect(getIndividualMixCurrentGame(h.state, 1)?.id).toBe(second.id);
    expect(() => h.apply({
      type: 'correct_score',
      payload: { gameId: first.id, leftScore: 11, rightScore: 3, kind: 'admin_adjusted', reason: 'ошибка судьи' },
    }, 1, 'judge')).toThrow('администратор');
  });

  it('applies a replacement only to the next unplayed game and preserves actual history', () => {
    const h = harness();
    const first = scoreCurrent(h, 1, 8);
    const slotPlayerId = first.left.maleId;
    expect(h.state.results[first.id].actualLeft.some((player) => player.playerId === slotPlayerId)).toBe(true);
    h.apply({
      type: 'replace_player',
      payload: { slotPlayerId, playerId: 'replacement-1', playerName: 'Замена', gender: 'W', reason: 'травма игрока' },
    });
    const next = getIndividualMixCurrentGame(h.state, 1)!;
    expect(getIndividualMixActualLineup(h.state, next).left.some((player) => player.playerId === 'replacement-1')).toBe(true);
    expect(h.state.results[first.id].actualLeft.some((player) => player.playerId === 'replacement-1')).toBe(false);
  });

  it('reopens a round when an admin marks a completed game cancelled', () => {
    const h = harness();
    const games = [];
    for (let game = 0; game < 4; game += 1) games.push(scoreCurrent(h, 1));
    games.push(scoreCurrent(h, 2));
    games.push(scoreCurrent(h, 2));
    expect(h.state.currentRound).toBe(2);
    h.apply({
      type: 'correct_score',
      payload: { gameId: games[5].id, leftScore: 0, rightScore: 0, kind: 'cancelled', reason: 'игра не состоялась' },
    }, null, 'admin');
    expect(h.state.currentRound).toBe(1);
    expect(getIndividualMixLiveProgress(h.state)).toMatchObject({ completed: 5, cancelled: 1 });
  });

  it('finalizes only 36/36 with a clean client queue and excludes replacement slots from rating bonus', () => {
    const h = harness();
    const first = scoreCurrent(h, 1);
    h.apply({
      type: 'replace_player',
      payload: { slotPlayerId: first.left.maleId, playerId: 'replacement-2', playerName: 'Новая игрок', gender: 'W', reason: 'замена до конца' },
    });
    completeAll(h);
    expect(getIndividualMixLiveProgress(h.state)).toEqual({ completed: 36, total: 36, cancelled: 0 });
    expect(() => h.apply({ type: 'finalize', payload: { clientQueueDepth: 1, clientHasConflict: false } })).toThrow('очередь');
    expect(() => h.apply({ type: 'finalize', payload: { clientQueueDepth: 0, clientHasConflict: false } })).toThrow('финальный этап');
    h.apply({ type: 'start_postseason', payload: { mode: 'direct_medals' } });
    expect(getIndividualMixPostseasonProgress(h.state)).toMatchObject({ selected: true, mode: 'direct_medals', completed: 0, total: 2, complete: false });
    scoreCurrent(h, 1);
    scoreCurrent(h, 2);
    h.apply({ type: 'finalize', payload: { clientQueueDepth: 0, clientHasConflict: false } });
    expect(h.state.status).toBe('finalized');
    expect(h.state.finalStandings).toHaveLength(12);
    expect(h.state.finalStandings?.find((row) => row.playerId === first.left.maleId)?.ratingEligible).toBe(false);
    expect(h.state.finalStandings?.filter((row) => row.ratingEligible)).toHaveLength(11);
    expect(h.state.finalStandings?.map((row) => row.drawSeed)).toEqual(expect.any(Array));
    expect(h.state.postseason?.finalPairOrder).toHaveLength(6);
  });

  it('materializes final and bronze matches only after both semifinals', () => {
    const h = harness();
    completeAll(h);
    expect(() => h.apply({ type: 'start_postseason', payload: { mode: 'semifinals' } }, null, 'judge')).toThrow('оператор');
    h.apply({ type: 'start_postseason', payload: { mode: 'semifinals' } });
    expect(h.state.postseason?.games.map((game) => game.postseasonStage)).toEqual(['semifinal', 'semifinal']);
    expect(h.state.currentRound).toBe(7);
    scoreCurrent(h, 1, 8, 'judge');
    expect(getIndividualMixCurrentGame(h.state, 1)).toBeNull();
    expect(h.state.postseason?.games).toHaveLength(2);
    scoreCurrent(h, 2, 9, 'judge');
    expect(h.state.currentRound).toBe(8);
    expect(h.state.postseason?.games.map((game) => game.postseasonStage)).toEqual(['semifinal', 'semifinal', 'gold', 'bronze']);
    scoreCurrent(h, 1, 6, 'judge');
    scoreCurrent(h, 2, 7, 'judge');
    expect(getIndividualMixPostseasonProgress(h.state)).toMatchObject({ completed: 4, total: 4, complete: true });
    expect(h.state.postseason?.finalPairOrder).toHaveLength(6);
  });
});
