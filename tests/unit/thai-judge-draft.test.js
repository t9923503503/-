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
      version: 1,
      savedAt: '2026-04-02T12:00:00.000Z',
      scores: {
        good: { team1: 12, team2: 9 },
      },
    });
  });

  test('resolveThaiJudgeDraftState restores draft only for pending active tours', () => {
    const activeSnapshot = {
      kind: 'active',
      tourStatus: 'pending',
      matches: [
        { matchId: 'm1', team1Score: null, team2Score: null },
        { matchId: 'm2', team1Score: null, team2Score: null },
      ],
    };

    expect(
      resolveThaiJudgeDraftState({
        snapshot: activeSnapshot,
        draft: {
          version: 1,
          savedAt: '2026-04-02T12:00:00.000Z',
          scores: { m1: { team1: 14, team2: 11 } },
        },
      }),
    ).toEqual({
      initialScores: { m1: { team1: 14, team2: 11 } },
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
          version: 1,
          savedAt: '2026-04-02T12:00:00.000Z',
          scores: { m1: { team1: 14, team2: 11 } },
        },
      }),
    ).toEqual({
      initialScores: {},
      restoredFromDraft: false,
      shouldClearDraft: true,
    });
  });
});
