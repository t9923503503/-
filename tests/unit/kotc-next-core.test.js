import { describe, expect, it } from 'vitest';
import {
  applyManualPairSwitch,
  applyKingPoint,
  applyTakeover,
  applyUndo,
  calcKotcNextRaundStandings,
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

  it('supports manual slot rotation without mutating score stats', () => {
    const initial = {
      ...getInitialKotcNextCourtState(4, 1, 11, 10, '2026-04-09T10:00:00.000Z'),
      kingPairIdx: 0,
      challengerPairIdx: 1,
      queueOrder: [2, 3],
      pairs: [
        { pairIdx: 0, kingWins: 7, takeovers: 2, gamesPlayed: 11 },
        { pairIdx: 1, kingWins: 5, takeovers: 1, gamesPlayed: 6 },
        { pairIdx: 2, kingWins: 2, takeovers: 0, gamesPlayed: 7 },
        { pairIdx: 3, kingWins: 0, takeovers: 1, gamesPlayed: 4 },
      ],
    };

    const kingNext = applyManualPairSwitch(initial, 'king', 'next');
    expect([kingNext.kingPairIdx, kingNext.challengerPairIdx, ...kingNext.queueOrder]).toEqual([1, 2, 3, 0]);
    expect(kingNext.pairs).toEqual(initial.pairs);

    const challengerPrev = applyManualPairSwitch(initial, 'challenger', 'prev');
    expect(challengerPrev.kingPairIdx).toBe(0);
    expect(challengerPrev.challengerPairIdx).toBe(3);
    expect(challengerPrev.queueOrder).toEqual([1, 2]);
    expect(challengerPrev.pairs).toEqual(initial.pairs);
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

  it('supports a standings mode without takeover tie-breaks', () => {
    const rows = [
      { pairIdx: 0, kingWins: 8, takeovers: 1, gamesPlayed: 10 },
      { pairIdx: 1, kingWins: 8, takeovers: 4, gamesPlayed: 12 },
      { pairIdx: 2, kingWins: 7, takeovers: 9, gamesPlayed: 9 },
    ];

    expect(calcKotcNextRaundStandings(rows).map((row) => row.pairIdx)).toEqual([1, 0, 2]);
    expect(calcKotcNextRaundStandings(rows, 'no_takeovers').map((row) => row.pairIdx)).toEqual([0, 1, 2]);
    expect(seedKotcNextR2Courts([
      { courtNo: 1, pairIdx: 0, pairLabel: 'A', kingWins: 8, takeovers: 1, gamesPlayed: 10 },
      { courtNo: 1, pairIdx: 1, pairLabel: 'B', kingWins: 8, takeovers: 4, gamesPlayed: 12 },
      { courtNo: 2, pairIdx: 0, pairLabel: 'C', kingWins: 7, takeovers: 9, gamesPlayed: 9 },
      { courtNo: 2, pairIdx: 1, pairLabel: 'D', kingWins: 6, takeovers: 0, gamesPlayed: 9 },
    ], 'no_takeovers')[0].pairRefs.map((pair) => pair.pairLabel)).toEqual(['A', 'B']);
  });
});
