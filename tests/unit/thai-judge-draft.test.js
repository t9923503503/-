import { describe, expect, test } from 'vitest';

import {
  buildThaiJudgeDraftKey,
  parseThaiJudgeDraft,
  resolveThaiJudgeDraftState,
} from '../../web/lib/thai-live/draft.ts';

describe('thai judge draft helpers', () => {
  test('buildThaiJudgeDraftKey is stable per court/round/tour', () => {
    expect(
      buildThaiJudgeDraftKey({ courtId: 'court-1', roundId: 'round-a', tourNumber: 2 }),
    ).toBe('thai_judge_draft:court-1:round-a:2');
  });

  test('parseThaiJudgeDraft ignores malformed rows', () => {
    expect(parseThaiJudgeDraft('{broken')).toBeNull();
    expect(
      parseThaiJudgeDraft(
        JSON.stringify({
          version: 1,
          savedAt: '2026-04-02T12:00:00.000Z',
          scores: {
            good: { team1: 12, team2: 9 },
            bad: { team1: -1, team2: 5 },
          },
        }),
      ),
    ).toEqual({
      version: 2,
      savedAt: '2026-04-02T12:00:00.000Z',
      scores: {
        good: { team1: 12, team2: 9 },
      },
      serveStateByMatch: {},
      pointHistoryByMatch: {},
    });
  });

  test('resolveThaiJudgeDraftState restores draft only for pending active tours', () => {
    const activeSnapshot = {
      kind: 'active',
      tourStatus: 'pending',
      matches: [
        { matchId: 'm1', team1Score: null, team2Score: null, pointHistory: [] },
        { matchId: 'm2', team1Score: null, team2Score: null, pointHistory: [] },
      ],
    };

    expect(
      resolveThaiJudgeDraftState({
        snapshot: activeSnapshot,
        draft: {
          version: 2,
          savedAt: '2026-04-02T12:00:00.000Z',
          scores: { m1: { team1: 14, team2: 11 } },
          serveStateByMatch: {
            m1: {
              servingSide: 1,
              team1Order: ['a1', 'a2'],
              team2Order: ['b1', 'b2'],
              team1CurrentIndex: 0,
              team2CurrentIndex: 0,
            },
          },
          pointHistoryByMatch: {
            m1: [
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
          },
        },
      }),
    ).toEqual({
      initialScores: { m1: { team1: 14, team2: 11 } },
      initialServeStateByMatch: {
        m1: {
          servingSide: 1,
          team1Order: ['a1', 'a2'],
          team2Order: ['b1', 'b2'],
          team1CurrentIndex: 0,
          team2CurrentIndex: 0,
        },
      },
      initialPointHistoryByMatch: {
        m1: [
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
      },
      restoredFromDraft: true,
      shouldClearDraft: false,
    });
  });

  test('resolveThaiJudgeDraftState clears draft once server already has confirmed data', () => {
    const finishedSnapshot = {
      kind: 'finished',
      tourStatus: 'confirmed',
      matches: [],
    };

    expect(
      resolveThaiJudgeDraftState({
        snapshot: finishedSnapshot,
        draft: {
          version: 2,
          savedAt: '2026-04-02T12:00:00.000Z',
          scores: { m1: { team1: 14, team2: 11 } },
          serveStateByMatch: {},
          pointHistoryByMatch: {},
        },
      }),
    ).toEqual({
      initialScores: {},
      initialServeStateByMatch: {},
      initialPointHistoryByMatch: {},
      restoredFromDraft: false,
      shouldClearDraft: true,
    });
  });
});
