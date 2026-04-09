import { describe, expect, it } from 'vitest';
import {
  applyKingPoint,
  applyTakeover,
  applyUndo,
  getInitialKotcNextCourtState,
  seedKotcNextR2Courts,
} from '../../web/lib/kotc-next/core.ts';

describe('kotc-next core', () => {
  it('builds a deterministic initial court state', () => {
    const left = getInitialKotcNextCourtState(4, 1, 11, 10, null);
    const right = getInitialKotcNextCourtState(4, 1, 11, 10, null);

    expect(left).toEqual(right);
    expect(left.queueOrder).toHaveLength(2);
    expect(left.kingPairIdx).not.toBe(left.challengerPairIdx);
  });

  it('replays king-point and takeover events through undo reconstruction', () => {
    const initial = getInitialKotcNextCourtState(4, 2, 21, 12, '2026-04-09T10:00:00.000Z');
    const afterPoint = applyKingPoint(initial);
    const afterTakeover = applyTakeover(afterPoint);
    const rebuilt = applyUndo({
      pairCount: 4,
      raundNo: 2,
      seed: 21,
      timerMinutes: 12,
      timerStartedAt: '2026-04-09T10:00:00.000Z',
      events: [{ eventType: 'king_point' }, { eventType: 'takeover' }],
    });

    expect(rebuilt).toEqual(afterTakeover);
    expect(rebuilt.pairs.reduce((sum, pair) => sum + pair.gamesPlayed, 0)).toBe(4);
  });

  it('seeds R2 zones deterministically from ranked court pairs', () => {
    const draft = seedKotcNextR2Courts([
      { courtNo: 1, pairIdx: 0, pairLabel: 'A', kingWins: 10, takeovers: 3, gamesPlayed: 12 },
      { courtNo: 1, pairIdx: 1, pairLabel: 'B', kingWins: 8, takeovers: 2, gamesPlayed: 12 },
      { courtNo: 2, pairIdx: 0, pairLabel: 'C', kingWins: 9, takeovers: 4, gamesPlayed: 12 },
      { courtNo: 2, pairIdx: 1, pairLabel: 'D', kingWins: 7, takeovers: 1, gamesPlayed: 12 },
    ]);

    expect(draft.map((zone) => zone.zone)).toEqual(['kin', 'lite']);
    expect(draft[0].pairRefs.map((pair) => pair.pairLabel)).toEqual(['A', 'B']);
    expect(draft[1].pairRefs.map((pair) => pair.pairLabel)).toEqual(['C', 'D']);
  });
});
