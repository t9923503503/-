import { describe, expect, test } from 'vitest';

import {
  applyThaiJudgeRally,
  buildThaiJudgeCorrectionEvent,
  buildThaiJudgeServeStateFromSetup,
  getThaiJudgeCurrentServer,
  getThaiJudgeTeamServer,
} from '../../web/lib/thai-live/serve';

const match = {
  team1: {
    side: 1 as const,
    label: 'Иванов / Сидоров',
    players: [
      { id: 'a1', name: 'Иванов', role: 'primary' as const },
      { id: 'a2', name: 'Сидоров', role: 'secondary' as const },
    ],
  },
  team2: {
    side: 2 as const,
    label: 'Петров / Смирнов',
    players: [
      { id: 'b1', name: 'Петров', role: 'primary' as const },
      { id: 'b2', name: 'Смирнов', role: 'secondary' as const },
    ],
  },
};

describe('thai judge serve helpers', () => {
  test('builds serve order from selected opening servers', () => {
    const serveState = buildThaiJudgeServeStateFromSetup(match, {
      servingSide: 2,
      team1FirstServerId: 'a2',
      team2FirstServerId: 'b1',
    });

    expect(serveState).toEqual({
      servingSide: 2,
      team1Order: ['a2', 'a1'],
      team2Order: ['b1', 'b2'],
      team1CurrentIndex: 0,
      team2CurrentIndex: 0,
    });
    expect(getThaiJudgeCurrentServer(match, serveState)?.playerName).toBe('Петров');
    expect(getThaiJudgeTeamServer(match, serveState, 1, 'next')?.playerName).toBe('Иванов');
  });

  test('keeps the same server after a point on own serve', () => {
    const serveState = buildThaiJudgeServeStateFromSetup(match, {
      servingSide: 1,
      team1FirstServerId: 'a1',
      team2FirstServerId: 'b1',
    })!;

    const outcome = applyThaiJudgeRally({
      match,
      currentScore: { team1: 0, team2: 0 },
      serveState,
      scoringSide: 1,
      history: [],
    });

    expect(outcome.nextScore).toEqual({ team1: 1, team2: 0 });
    expect(outcome.nextServeState.servingSide).toBe(1);
    expect(getThaiJudgeCurrentServer(match, outcome.nextServeState)?.playerName).toBe('Иванов');
    expect(outcome.event.isSideOut).toBe(false);
    expect(typeof outcome.event.recordedAt).toBe('string');
  });

  test('side-out switches serving team and advances the old serving team rotation', () => {
    const serveState = buildThaiJudgeServeStateFromSetup(match, {
      servingSide: 1,
      team1FirstServerId: 'a1',
      team2FirstServerId: 'b1',
    })!;

    const outcome = applyThaiJudgeRally({
      match,
      currentScore: { team1: 1, team2: 0 },
      serveState,
      scoringSide: 2,
      history: [
        {
          seqNo: 1,
          kind: 'rally',
          scoringSide: 1,
          scoreBefore: { team1: 0, team2: 0 },
          scoreAfter: { team1: 1, team2: 0 },
          servingSideBefore: 1,
          serverPlayerBefore: {
            playerId: 'a1',
            playerName: 'Иванов',
            role: 'primary',
            teamSide: 1,
          },
          servingSideAfter: 1,
          serverPlayerAfter: {
            playerId: 'a1',
            playerName: 'Иванов',
            role: 'primary',
            teamSide: 1,
          },
          isSideOut: false,
        },
      ],
    });

    expect(outcome.nextScore).toEqual({ team1: 1, team2: 1 });
    expect(outcome.event.isSideOut).toBe(true);
    expect(outcome.nextServeState.servingSide).toBe(2);
    expect(outcome.nextServeState.team1CurrentIndex).toBe(1);
    expect(getThaiJudgeCurrentServer(match, outcome.nextServeState)?.playerName).toBe('Петров');
    expect(getThaiJudgeTeamServer(match, outcome.nextServeState, 1, 'current')?.playerName).toBe('Сидоров');
  });

  test('caps rally score at the round point limit', () => {
    const serveState = buildThaiJudgeServeStateFromSetup(match, {
      servingSide: 1,
      team1FirstServerId: 'a1',
      team2FirstServerId: 'b1',
    })!;

    const outcome = applyThaiJudgeRally({
      match,
      currentScore: { team1: 11, team2: 2 },
      serveState,
      scoringSide: 1,
      history: [],
      pointLimit: 12,
    });

    expect(outcome.nextScore).toEqual({ team1: 12, team2: 2 });
    expect(outcome.event.scoreAfter).toEqual({ team1: 12, team2: 2 });
    expect(typeof outcome.event.recordedAt).toBe('string');
  });

  test('builds correction events without inventing a scoring side', () => {
    const event = buildThaiJudgeCorrectionEvent({
      match,
      currentScore: { team1: 2, team2: 1 },
      nextScore: { team1: 2, team2: 0 },
      serveState: buildThaiJudgeServeStateFromSetup(match, {
        servingSide: 2,
        team1FirstServerId: 'a1',
        team2FirstServerId: 'b1',
      }),
      history: [],
    });

    expect(event.kind).toBe('correction');
    expect(event.scoringSide).toBeNull();
    expect(event.scoreBefore).toEqual({ team1: 2, team2: 1 });
    expect(event.scoreAfter).toEqual({ team1: 2, team2: 0 });
    expect(event.servingSideAfter).toBeNull();
    expect(typeof event.recordedAt).toBe('string');
  });
});
