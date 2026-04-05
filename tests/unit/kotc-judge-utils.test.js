import { describe, expect, it } from 'vitest';
import {
  buildNextCourtScores,
  getCourtServeState,
  getCourtPairs,
  getCourtScoreMatrix,
  getRoundCount,
  getStageLabel,
} from '../../web/components/kotc-live/judge/utils.ts';

describe('kotc judge utils', () => {
  const court = {
    courtIdx: 1,
    courtVersion: 3,
    roundIdx: 1,
    rosterM: ['M1', 'M2', 'M3', 'M4'],
    rosterW: ['W1', 'W2', 'W3', 'W4'],
    activeSlotIdx: 1,
    serverPlayerIdxBySlot: [0, 1, null, 0],
    scores: {
      rounds: {
        1: [5, 4, 3, 2],
        2: [8, null, 6, 7],
      },
    },
  };

  it('keeps four slots and rotates women by active round', () => {
    expect(getRoundCount(4)).toBe(4);
    expect(getCourtPairs(court, 4, 1)).toEqual([
      { slotIdx: 0, manName: 'M1', womanName: 'W2', score: 8 },
      { slotIdx: 1, manName: 'M2', womanName: 'W3', score: null },
      { slotIdx: 2, manName: 'M3', womanName: 'W4', score: 6 },
      { slotIdx: 3, manName: 'M4', womanName: 'W1', score: 7 },
    ]);
  });

  it('updates nested round scores without dropping previous rounds', () => {
    const nextScores = buildNextCourtScores(court, 4, 4, 1, 1, 9);
    const matrix = getCourtScoreMatrix({ ...court, scores: nextScores }, 4, 4);

    expect(matrix[0]).toEqual([5, 4, 3, 2]);
    expect(matrix[1]).toEqual([8, 9, 6, 7]);
    expect(matrix[2]).toEqual([null, null, null, null]);
  });

  it('maps KOTC phases to human labels', () => {
    expect(getStageLabel('round1')).toBe('1 тур');
    expect(getStageLabel('round2')).toBe('2 тур');
    expect(getStageLabel('final')).toBe('Финал');
  });
  it('derives active and waiting serve slots from court state', () => {
    expect(getCourtServeState(court, 4)).toEqual({
      activeSlotIdx: 1,
      waitingSlotIdx: 2,
      activeServerPlayerIdx: 1,
      waitingServerPlayerIdx: null,
      serverPlayerIdxBySlot: [0, 1, null, 0],
    });
  });
});
