import { describe, expect, it } from 'vitest';
import {
  buildRrCourtSchedule,
  buildRrPlayoffPreview,
  calculateRrStandings,
  generateRoundRobinRounds,
  isHardCapSetFinished,
  normalizeRrDivision,
  proposeFixedTeams,
  seedRrGroups,
  validateFixedTeam,
} from '@/lib/round-robin/core';
import type { RrAvailablePlayer, RrGroup, RrMatch, RrTeam } from '@/lib/round-robin/types';

function player(id: string, gender: 'M' | 'W', rating = 100, position = 1): RrAvailablePlayer {
  return { id, name: id, gender, rating, position };
}

function team(id: string, seed: number, groupId = 'g1'): RrTeam {
  return {
    id, teamNo: seed, seed, groupId,
    player1: player(`${id}-1`, 'M'), player2: player(`${id}-2`, 'M'),
    rating: 1000 - seed, confirmed: true, finalPlacement: null, manualRank: null,
  };
}

function match(input: Partial<RrMatch> & Pick<RrMatch, 'id' | 'teamAId' | 'teamBId'>): RrMatch {
  return {
    id: input.id, stageType: 'group', groupId: 'g1', bracketLevel: null, bracketRound: null,
    roundNo: 1, matchNo: 1, scheduleSlot: 1, courtNo: 1,
    teamAId: input.teamAId, teamBId: input.teamBId,
    format: { code: 'single15' }, scoreA: [15], scoreB: [10], setsA: 1, setsB: 0,
    serving: null, timerRemainingSec: null, timerRunning: false, winnerId: input.teamAId,
    forfeitSide: null, status: 'finished', version: 1, scheduledAt: null, startedAt: null, finishedAt: null,
    ...input,
  };
}

describe('Round Robin generation', () => {
  for (let count = 3; count <= 8; count += 1) {
    it(`generates every unique meeting once for ${count} teams`, () => {
      const values = Array.from({ length: count }, (_, index) => `t${index + 1}`);
      const rounds = generateRoundRobinRounds(values);
      const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join(':'));
      expect(pairs).toHaveLength(count * (count - 1) / 2);
      expect(new Set(pairs).size).toBe(pairs.length);
      for (const round of rounds) {
        expect(new Set(round.flat()).size).toBe(round.length * 2);
      }
    });
  }

  it('assigns courts without a simultaneous team collision', () => {
    const schedule = buildRrCourtSchedule([
      ['a1', 'a2', 'a3', 'a4', 'a5'],
      ['b1', 'b2', 'b3', 'b4'],
    ], 3);
    const bySlot = new Map<number, string[]>();
    schedule.forEach((row) => bySlot.set(row.scheduleSlot, [...(bySlot.get(row.scheduleSlot) ?? []), row.teamAId, row.teamBId]));
    for (const ids of bySlot.values()) expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(schedule.map((row) => `${row.groupIndex}:${[row.teamAId, row.teamBId].sort().join('-')}`)).size).toBe(schedule.length);
  });
});

describe('fixed team rules', () => {
  it('normalizes Russian divisions', () => {
    expect(normalizeRrDivision('Микст')).toBe('mixed');
    expect(normalizeRrDivision('Женский')).toBe('female');
    expect(normalizeRrDivision('Мужской')).toBe('male');
  });

  it('requires one man and one woman for mixed', () => {
    expect(validateFixedTeam([player('m', 'M'), player('w', 'W')], 'mixed')).toBeNull();
    expect(validateFixedTeam([player('m1', 'M'), player('m2', 'M')], 'mixed')).toContain('1 мужчина');
  });

  it('proposes complete mixed pairs and balanced rating pairs', () => {
    const players = [player('m1', 'M', 300, 1), player('w1', 'W', 100, 2), player('m2', 'M', 200, 3), player('w2', 'W', 200, 4)];
    const pairs = proposeFixedTeams(players, 'mixed', 'rating');
    expect(pairs).toEqual([{ player1Id: 'm1', player2Id: 'w1' }, { player1Id: 'm2', player2Id: 'w2' }]);
  });

  it('seeds by a rating snake', () => {
    const teams = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, seed: index + 1, rating: 100 - index }));
    const groups = seedRrGroups(teams, 2, 'serpentine');
    expect(groups.map((group) => group.map((row) => row.id))).toEqual([[1, 4, 5, 8], [2, 3, 6, 7]]);
  });

  it('keeps three teams in one round-robin group', () => {
    const teams = Array.from({ length: 3 }, (_, index) => ({ id: index + 1, seed: index + 1, rating: 100 - index }));
    const groups = seedRrGroups(teams, 1, 'serpentine');
    expect(groups.map((group) => group.map((row) => row.id))).toEqual([[1, 2, 3]]);
  });
});

describe('match rules and standings', () => {
  it('uses hard caps without win-by-two', () => {
    expect(isHardCapSetFinished({ code: 'single11' }, 0, 11, 10)).toBe(true);
    expect(isHardCapSetFinished({ code: 'single15' }, 0, 14, 14)).toBe(false);
    expect(isHardCapSetFinished({ code: 'bo3_21_15' }, 2, 15, 14)).toBe(true);
  });

  it('awards 2/1 for a played match and 2/0 for a forfeit', () => {
    const teams = [team('a', 1), team('b', 2), team('c', 3)];
    const rows = calculateRrStandings('g1', teams, [
      match({ id: 'm1', teamAId: 'a', teamBId: 'b', winnerId: 'a', scoreA: [15], scoreB: [10] }),
      match({ id: 'm2', teamAId: 'c', teamBId: 'a', winnerId: 'a', status: 'forfeit', forfeitSide: 'a', scoreA: [0], scoreB: [0] }),
    ]);
    expect(rows.find((row) => row.teamId === 'a')?.matchPoints).toBe(4);
    expect(rows.find((row) => row.teamId === 'b')?.matchPoints).toBe(1);
    expect(rows.find((row) => row.teamId === 'c')?.matchPoints).toBe(0);
  });

  it('uses point quotient before head-to-head for two tied teams', () => {
    const rows = calculateRrStandings('g1', [team('a', 1), team('b', 2), team('c', 3)], [
      match({ id: 'ab', teamAId: 'a', teamBId: 'b', winnerId: 'a', scoreA: [15], scoreB: [14] }),
      match({ id: 'ac', teamAId: 'a', teamBId: 'c', winnerId: 'c', scoreA: [1], scoreB: [15] }),
      match({ id: 'bc', teamAId: 'b', teamBId: 'c', winnerId: 'b', scoreA: [15], scoreB: [1] }),
    ]);
    expect(rows.findIndex((row) => row.teamId === 'b')).toBeLessThan(rows.findIndex((row) => row.teamId === 'a'));
  });
});

describe('playoff proposal', () => {
  const groups: RrGroup[] = [
    { id: 'ga', groupNo: 1, label: 'A', status: 'finished', teamIds: ['a1', 'a2', 'a3'] },
    { id: 'gb', groupNo: 2, label: 'B', status: 'finished', teamIds: ['b1', 'b2', 'b3'] },
  ];
  const standings = groups.flatMap((group) => group.teamIds.map((teamId, index) => ({
    groupId: group.id, teamId, position: index + 1, played: 2, wins: 2 - index, losses: index,
    matchPoints: 4 - index, setsWon: 2, setsLost: 0, pointsFor: 30, pointsAgainst: 20,
    pointDiff: 10, pointQuotient: 1.5, tiebreakNote: null, seed: index + 1, manualRank: null,
  })));

  it('creates A1-B2 and B1-A2 championship semifinals', () => {
    const preview = buildRrPlayoffPreview(groups, standings, 'championship');
    expect(preview.levels[0].firstRoundPairs).toEqual([['a1', 'b2'], ['b1', 'a2']]);
  });

  it('splits all teams into level brackets', () => {
    const preview = buildRrPlayoffPreview(groups, standings, 'all_levels');
    expect(preview.levels.map((level) => level.teamIds.length)).toEqual([2, 2, 2]);
    expect(preview.levels.flatMap((level) => level.teamIds)).toHaveLength(6);
    expect(preview.levels.every((level) => level.bracketSize === 4 || level.bracketSize === 8)).toBe(true);
  });
});
