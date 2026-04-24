import { describe, expect, it } from 'vitest';
import {
  addKotcNextKingRallyTiebreakers,
  applyManualPairSwitch,
  applyKingPoint,
  applyTakeover,
  applyUndo,
  buildKotcNextRoundPartnerIndexMap,
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

  it('uses king-side rally length and earliest rally as KOTC Next standings tiebreakers', () => {
    const tiedByScore = [
      { pairIdx: 0, kingWins: 3, takeovers: 2, gamesPlayed: 5 },
      { pairIdx: 1, kingWins: 3, takeovers: 0, gamesPlayed: 5 },
      { pairIdx: 2, kingWins: 3, takeovers: 1, gamesPlayed: 5 },
    ];

    const withRallies = addKotcNextKingRallyTiebreakers(tiedByScore, [
      { seqNo: 1, eventType: 'king_point', kingPairIdx: 2 },
      { seqNo: 2, eventType: 'king_point', kingPairIdx: 2 },
      { seqNo: 3, eventType: 'takeover', kingPairIdx: 2 },
      { seqNo: 4, eventType: 'king_point', kingPairIdx: 0 },
      { seqNo: 5, eventType: 'king_point', kingPairIdx: 0 },
      { seqNo: 6, eventType: 'takeover', kingPairIdx: 0 },
      { seqNo: 7, eventType: 'king_point', kingPairIdx: 1 },
      { seqNo: 8, eventType: 'king_point', kingPairIdx: 1 },
      { seqNo: 9, eventType: 'king_point', kingPairIdx: 1 },
    ]);

    expect(calcKotcNextRaundStandings(withRallies).map((pair) => pair.pairIdx)).toEqual([1, 2, 0]);
    expect(withRallies.find((pair) => pair.pairIdx === 1)?.bestKingStreak).toBe(3);
    expect(withRallies.find((pair) => pair.pairIdx === 2)?.firstKingStreakSeq).toBe(1);
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

  it('rotates king-side starters through a full ppc cycle without repeated opening duos', () => {
    for (const ppc of [3, 4, 5]) {
      const kingStarts = new Array(ppc).fill(0);
      const openingDuos = new Set();
      let prevOpening = null;
      let prevQueue = null;

      for (let raundNo = 1; raundNo <= ppc; raundNo += 1) {
        const state = getInitialKotcNextCourtState(ppc, raundNo, 12345, 10, null);
        kingStarts[state.kingPairIdx] += 1;
        const opening = `${state.kingPairIdx}:${state.challengerPairIdx}`;
        expect(openingDuos.has(opening)).toBe(false);
        openingDuos.add(opening);
        if (prevOpening != null) {
          expect(opening).not.toBe(prevOpening);
        }
        const queue = state.queueOrder.join(',');
        if (prevQueue != null) {
          expect(queue).not.toBe(prevQueue);
        }
        prevOpening = opening;
        prevQueue = queue;
      }

      expect(kingStarts).toEqual(new Array(ppc).fill(1));
      expect(openingDuos.size).toBe(ppc);
    }
  });

  it('builds round-aware partner index rotation for every slot in the cycle', () => {
    for (const ppc of [3, 4, 5]) {
      const secondaryByPrimary = Array.from({ length: ppc }, () => new Set());
      for (let raundNo = 1; raundNo <= ppc; raundNo += 1) {
        const map = buildKotcNextRoundPartnerIndexMap(ppc, raundNo);
        expect(map).toHaveLength(ppc);
        map.forEach(({ pairIdx, secondaryIdx }) => {
          secondaryByPrimary[pairIdx].add(secondaryIdx);
        });
      }
      secondaryByPrimary.forEach((seen) => {
        expect(seen.size).toBe(ppc);
      });
    }
  });
});
