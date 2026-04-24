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
      pointLimit: 15,
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
      initialServeStateByMatch: {},
      initialPointHistoryByMatch: {
        m1: [
          {
            seqNo: 1,
            kind: 'correction',
            recordedAt: null,
            scoringSide: null,
            scoreBefore: { team1: 0, team2: 0 },
            scoreAfter: { team1: 14, team2: 11 },
            servingSideBefore: null,
            serverPlayerBefore: null,
            servingSideAfter: null,
            serverPlayerAfter: null,
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
      pointLimit: 15,
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

  test('resolveThaiJudgeDraftState synthesizes correction history for score-only drafts and clamps to point limit', () => {
    const activeSnapshot = {
      kind: 'active',
      tourStatus: 'pending',
      pointLimit: 12,
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
          savedAt: '2026-04-22T06:20:00.000Z',
          scores: {
            m1: { team1: 23, team2: 1 },
          },
          serveStateByMatch: {
            m1: {
              servingSide: 1,
              team1Order: ['a1', 'a2'],
              team2Order: ['b1', 'b2'],
              team1CurrentIndex: 0,
              team2CurrentIndex: 0,
            },
          },
          pointHistoryByMatch: {},
        },
      }),
    ).toEqual({
      initialScores: { m1: { team1: 12, team2: 1 } },
      initialServeStateByMatch: {},
      initialPointHistoryByMatch: {
        m1: [
          {
            seqNo: 1,
            kind: 'correction',
            recordedAt: null,
            scoringSide: null,
            scoreBefore: { team1: 0, team2: 0 },
            scoreAfter: { team1: 12, team2: 1 },
            servingSideBefore: null,
            serverPlayerBefore: null,
            servingSideAfter: null,
            serverPlayerAfter: null,
            isSideOut: false,
          },
        ],
      },
      restoredFromDraft: true,
      shouldClearDraft: false,
    });
  });

  test('resolveThaiJudgeDraftState restores inline serve setup even before the first point', () => {
    const activeSnapshot = {
      kind: 'active',
      tourStatus: 'pending',
      pointLimit: 12,
      matches: [
        {
          matchId: 'm1',
          team1Score: null,
          team2Score: null,
          pointHistory: [],
          team1: {
            side: 1,
            label: 'A1 / A2',
            players: [
              { id: 'a1', name: 'A1', role: 'primary' },
              { id: 'a2', name: 'A2', role: 'secondary' },
            ],
          },
          team2: {
            side: 2,
            label: 'B1 / B2',
            players: [
              { id: 'b1', name: 'B1', role: 'primary' },
              { id: 'b2', name: 'B2', role: 'secondary' },
            ],
          },
        },
      ],
    };

    expect(
      resolveThaiJudgeDraftState({
        snapshot: activeSnapshot,
        draft: {
          version: 2,
          savedAt: '2026-04-22T06:20:00.000Z',
          scores: {},
          serveStateByMatch: {
            m1: {
              servingSide: 2,
              team1Order: ['a2', 'a1'],
              team2Order: ['b1', 'b2'],
              team1CurrentIndex: 0,
              team2CurrentIndex: 0,
            },
          },
          pointHistoryByMatch: {},
        },
      }),
    ).toEqual({
      initialScores: {},
      initialServeStateByMatch: {
        m1: {
          servingSide: 2,
          team1Order: ['a2', 'a1'],
          team2Order: ['b1', 'b2'],
          team1CurrentIndex: 0,
          team2CurrentIndex: 0,
        },
      },
      initialPointHistoryByMatch: {},
      restoredFromDraft: true,
      shouldClearDraft: false,
    });
  });
});
