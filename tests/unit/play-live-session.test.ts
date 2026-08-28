import { describe, expect, it } from 'vitest';
import { applyPlayLiveStateCommand } from '../../web/lib/play-live-session';
import { chooseFreshLiveTeams, getCurrentKingRound, type PlayLiveState } from '../../web/lib/play-live-core';

function state(): PlayLiveState {
  return {
    format: 'classic_2x2',
    pairingMode: 'fixed',
    pointLimit: 15,
    roundDurationMinutes: 10,
    roster: [1, 2, 3, 4, 5, 6],
    activeRoster: [1, 2, 3, 4, 5, 6],
    startedAt: '2026-08-13T00:00:00.000Z',
    matches: [{ id: 'm1', teamA: [1, 2], teamB: [3, 4], scoreA: 0, scoreB: 0 }],
    rounds: [],
    completedRoundIds: [],
    history: [],
  };
}

function kingState(): PlayLiveState {
  return {
    format: 'king_sideout',
    pairingMode: 'random',
    pointLimit: 15,
    roundDurationMinutes: 10,
    roster: [1, 2, 3, 4, 5, 6],
    activeRoster: [1, 2, 3, 4, 5, 6],
    startedAt: '2026-08-13T00:00:00.000Z',
    matches: [],
    rounds: [
      { id: 'r1', roundNumber: 1, pairs: [
        { pairIndex: 0, team: [1, 2], points: 0 },
        { pairIndex: 1, team: [3, 4], points: 0 },
        { pairIndex: 2, team: [5, 6], points: 0 },
      ] },
      { id: 'r2', roundNumber: 2, pairs: [
        { pairIndex: 0, team: [1, 3], points: 0 },
        { pairIndex: 1, team: [2, 5], points: 0 },
        { pairIndex: 2, team: [4, 6], points: 0 },
      ] },
    ],
    completedRoundIds: [],
    history: [],
  };
}

describe('play live state commands', () => {
  it('applies the quick winner score and keeps an undo snapshot', () => {
    const updated = applyPlayLiveStateCommand(state(), { type: 'set_match_score', matchId: 'm1', winner: 'B', loserPoints: 8 });
    expect(updated.matches[0]).toMatchObject({ scoreA: 8, scoreB: 15 });
    expect(updated.history).toHaveLength(1);
    const undone = applyPlayLiveStateCommand(updated, { type: 'undo' });
    expect(undone.matches[0]).toMatchObject({ scoreA: 0, scoreB: 0 });
  });

  it('rejects a losing score at or above the target', () => {
    expect(() => applyPlayLiveStateCommand(state(), { type: 'set_match_score', matchId: 'm1', winner: 'A', loserPoints: 15 })).toThrow('Некорректный быстрый счёт');
  });

  it('adds another blank set only for 2x2', () => {
    const rearranged = applyPlayLiveStateCommand(state(), { type: 'set_match_teams', matchId: 'm1', teamA: [1, 5], teamB: [3, 6] });
    const updated = applyPlayLiveStateCommand(rearranged, { type: 'add_set' });
    expect(updated.matches).toHaveLength(2);
    expect(updated.matches[1]).toMatchObject({ teamA: [1, 5], teamB: [3, 6], scoreA: 0, scoreB: 0 });
  });

  it('moves confirmed roster players between pairs and clears the old score', () => {
    const scored = applyPlayLiveStateCommand(state(), { type: 'set_match_score', matchId: 'm1', winner: 'A', loserPoints: 9 });
    const updated = applyPlayLiveStateCommand(scored, { type: 'set_match_teams', matchId: 'm1', teamA: [1, 5], teamB: [3, 6] });
    expect(updated.matches[0]).toMatchObject({ teamA: [1, 5], teamB: [3, 6], scoreA: 0, scoreB: 0 });
  });

  it('rejects duplicate and out-of-roster players in a party', () => {
    expect(() => applyPlayLiveStateCommand(state(), { type: 'set_match_teams', matchId: 'm1', teamA: [1, 1], teamB: [3, 4] })).toThrow('четырёх разных игроков');
    expect(() => applyPlayLiveStateCommand(state(), { type: 'set_match_teams', matchId: 'm1', teamA: [1, 9], teamB: [3, 4] })).toThrow('четырёх разных игроков');
  });

  it('changes the target for one party and uses it for quick scoring', () => {
    const limited = applyPlayLiveStateCommand(state(), { type: 'set_match_point_limit', matchId: 'm1', pointLimit: 11 });
    expect(limited.matches[0]).toMatchObject({ pointLimit: 11, scoreA: 0, scoreB: 0 });
    const scored = applyPlayLiveStateCommand(limited, { type: 'set_match_score', matchId: 'm1', winner: 'B', loserPoints: 7 });
    expect(scored.matches[0]).toMatchObject({ pointLimit: 11, scoreA: 7, scoreB: 11 });
    expect(() => applyPlayLiveStateCommand(limited, { type: 'set_match_score', matchId: 'm1', winner: 'A', loserPoints: 11 })).toThrow('Некорректный быстрый счёт');
  });

  it('pauses a bench player and excludes them from future lineups', () => {
    const paused = applyPlayLiveStateCommand(state(), { type: 'set_player_active', resultKey: 5, active: false });
    expect(paused.activeRoster).toEqual([1, 2, 3, 4, 6]);
    expect(() => applyPlayLiveStateCommand(paused, { type: 'set_match_teams', matchId: 'm1', teamA: [1, 5], teamB: [3, 4] })).toThrow('четырёх разных игроков');
  });

  it('creates a smart next party with supplied teams and point limit', () => {
    const scored = applyPlayLiveStateCommand(state(), { type: 'set_match_score', matchId: 'm1', winner: 'A', loserPoints: 8 });
    const next = applyPlayLiveStateCommand(scored, { type: 'add_set', teamA: [5, 1], teamB: [6, 3], pointLimit: 11 });
    expect(next.matches[1]).toMatchObject({ teamA: [5, 1], teamB: [6, 3], pointLimit: 11, scoreA: 0, scoreB: 0 });
  });

  it('restores both roster lists when roster sync is undone', () => {
    const synced = applyPlayLiveStateCommand(state(), { type: 'sync_roster', roster: [1, 2, 3, 4, 5, 6, 7] });
    expect(synced.roster).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(synced.activeRoster).toContain(7);
    const undone = applyPlayLiveStateCommand(synced, { type: 'undo' });
    expect(undone.roster).toEqual([1, 2, 3, 4, 5, 6]);
    expect(undone.activeRoster).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chooses fresh teammate pairs from the next four when possible', () => {
    expect(chooseFreshLiveTeams([1, 2, 3, 4], state().matches)).toEqual({
      teamA: [1, 3],
      teamB: [2, 4],
    });
  });

  it('keeps the current KING round after the first non-zero pair score', () => {
    const scored = applyPlayLiveStateCommand(kingState(), { type: 'set_pair_points', roundId: 'r1', pairIndex: 0, points: 1 });
    expect(getCurrentKingRound(scored)?.id).toBe('r1');
    expect(scored.completedRoundIds).toEqual([]);
  });

  it('advances KING only after explicit round completion and can undo it', () => {
    const scored = applyPlayLiveStateCommand(kingState(), { type: 'set_pair_points', roundId: 'r1', pairIndex: 0, points: 8 });
    const completed = applyPlayLiveStateCommand(scored, { type: 'complete_king_round', roundId: 'r1' });
    expect(completed.completedRoundIds).toEqual(['r1']);
    expect(getCurrentKingRound(completed)?.id).toBe('r2');

    const undone = applyPlayLiveStateCommand(completed, { type: 'undo' });
    expect(getCurrentKingRound(undone)?.id).toBe('r1');
    expect(undone.rounds[0].pairs[0].points).toBe(8);
  });

  it('does not complete an empty or out-of-order KING round', () => {
    expect(() => applyPlayLiveStateCommand(kingState(), { type: 'complete_king_round', roundId: 'r1' })).toThrow('Укажите очки хотя бы одной пары');
    expect(() => applyPlayLiveStateCommand(kingState(), { type: 'complete_king_round', roundId: 'r2' })).toThrow('Завершите текущий раунд по порядку');
  });
});
