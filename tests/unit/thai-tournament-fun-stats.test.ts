import { describe, expect, it } from 'vitest';
import {
  computeThaiFunStats,
  type ThaiFunConfirmedMatch,
  type ThaiFunMatchPlayer,
} from '@/lib/thai-live/tournament-fun-stats';

function p(id: string, name: string, side: 1 | 2, role: 'primary' | 'secondary' = 'primary'): ThaiFunMatchPlayer {
  return { playerId: id, playerName: name, teamSide: side, playerRole: role };
}

function match(
  id: string,
  players: ThaiFunMatchPlayer[],
  s1: number,
  s2: number,
  opts: Partial<Pick<ThaiFunConfirmedMatch, 'roundType' | 'courtNo' | 'courtLabel' | 'tourNo'>> = {},
): ThaiFunConfirmedMatch {
  return {
    matchId: id,
    matchNo: 1,
    team1Score: s1,
    team2Score: s2,
    roundType: opts.roundType ?? 'r1',
    courtNo: opts.courtNo ?? 1,
    courtLabel: opts.courtLabel ?? 'K1',
    tourNo: opts.tourNo ?? 1,
    players,
  };
}

describe('computeThaiFunStats', () => {
  it('ranks steamroller, blowout, ideal one-time pair, and absolute wins (MM)', () => {
    const matches: ThaiFunConfirmedMatch[] = [
      match('m1', [p('a', 'A', 1), p('b', 'B', 1), p('c', 'C', 2), p('d', 'D', 2)], 3, 2),
      match('m2', [p('a', 'A', 1), p('c', 'C', 1), p('b', 'B', 2), p('d', 'D', 2)], 10, 0),
    ];
    const stats = computeThaiFunStats(matches, 'MM');

    const abs = stats.absoluteLeaders.find((b) => b.poolKey === 'all');
    expect(abs?.leaders.map((l) => l.playerName).sort()).toEqual(['A']);
    expect(abs?.leaders[0]?.wins).toBe(2);

    expect(stats.steamrollers.map((x) => x.playerId)).toEqual(['a']);
    expect(stats.steamrollers[0]?.value).toBe(11);

    expect(stats.blowouts).toHaveLength(1);
    expect(stats.blowouts[0]?.margin).toBe(10);
    expect(stats.blowouts[0]?.team1Score).toBe(10);

    expect(stats.idealMatches).toHaveLength(1);
    expect(stats.idealMatches[0]?.playerAName).toMatch(/A|C/);
    expect(stats.idealMatches[0]?.margin).toBe(10);

    expect(stats.ironDefense.map((x) => x.playerId)).toContain('a');
  });

  it('splits absolute leaders by pool for MF', () => {
    const matches: ThaiFunConfirmedMatch[] = [
      match(
        'm1',
        [
          p('m1', 'Man1', 1, 'primary'),
          p('m2', 'Man2', 1, 'primary'),
          p('w1', 'Woman1', 2, 'secondary'),
          p('w2', 'Woman2', 2, 'secondary'),
        ],
        5,
        0,
      ),
    ];
    const stats = computeThaiFunStats(matches, 'MF');
    const prim = stats.absoluteLeaders.find((b) => b.poolKey === 'primary');
    const sec = stats.absoluteLeaders.find((b) => b.poolKey === 'secondary');
    expect(prim?.leaders).toHaveLength(2);
    expect(sec?.leaders).toHaveLength(0);
  });
});
