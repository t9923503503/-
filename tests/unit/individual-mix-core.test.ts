import { describe, expect, it } from 'vitest';
import {
  buildIndividualMixDivisionBracket,
  buildIndividualMixQuickScore,
  buildIndividualMixSeededDivisions,
  buildSixPairHybridSchedule,
  buildSixPairHybridScheduleV1,
  buildStandardIndividualMixPool,
  calculateIndividualMixStandings,
  createIndividualMixOfflineBundle,
  applyIndividualMixOfflineCommand,
  getIndividualMixOfflineProgress,
  validateIndividualMixPoolSchedule,
  validateIndividualMixScore,
  validateSixPairHybridSchedule,
} from '@/lib/individual-mix';
import type { IndividualMixPlayer } from '@/lib/individual-mix';

function roster(size: number, gender: 'M' | 'W', prefix = ''): IndividualMixPlayer[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `${prefix}${gender}${index + 1}`,
    name: `${gender}${index + 1}`,
    gender,
    drawSeed: index + 1,
  }));
}

describe('individual-mix standard schedule', () => {
  for (const size of [4, 5, 6]) {
    it(`builds a valid full round robin for ${size}+${size}`, () => {
      const schedule = buildStandardIndividualMixPool({ poolId: 'A', courtNo: 1, men: roster(size, 'M'), women: roster(size, 'W') });
      expect(validateIndividualMixPoolSchedule(schedule)).toEqual([]);
      expect(schedule.rounds.flatMap((round) => round.duels)).toHaveLength(size * (size - 1) / 2);
      expect(schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games))).toHaveLength(size * (size - 1));
      const expected = 2 * (size - 1);
      const appearances = new Map<string, number>();
      for (const game of schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games))) {
        for (const id of [game.left.maleId, game.left.femaleId, game.right.maleId, game.right.femaleId]) {
          appearances.set(id, (appearances.get(id) ?? 0) + 1);
        }
      }
      expect([...appearances.values()].every((count) => count === expected)).toBe(true);
    });
  }

  it('keeps both games of a duel adjacent and inserts mandatory rest when needed', () => {
    const schedule = buildStandardIndividualMixPool({ poolId: 'A', courtNo: 2, men: roster(4, 'M'), women: roster(4, 'W') });
    const gameItems = schedule.queue.filter((item) => item.kind === 'game');
    for (let index = 0; index < gameItems.length; index += 2) {
      expect(gameItems[index].duelId).toBe(gameItems[index + 1].duelId);
    }
    expect(schedule.queue.some((item) => item.kind === 'break')).toBe(true);
  });

  it('assigns two non-playing judges to every duel', () => {
    const schedule = buildStandardIndividualMixPool({ poolId: 'A', courtNo: 1, men: roster(5, 'M'), women: roster(5, 'W') });
    for (const duel of schedule.rounds.flatMap((round) => round.duels)) {
      const active = new Set([...duel.maleIds, ...duel.femaleIds]);
      expect(duel.judgePlayerIds).toHaveLength(2);
      expect(duel.judgePlayerIds.every((id) => !active.has(id))).toBe(true);
    }
  });
});

describe('individual-mix six-pair hybrid schedule', () => {
  it('balances six same-gender pairs across the Thai and standard courts', () => {
    const players = roster(12, 'W');
    const schedule = buildSixPairHybridSchedule({ players });
    const games = schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games));

    expect(validateSixPairHybridSchedule(schedule)).toEqual([]);
    expect(schedule.rounds).toHaveLength(6);
    expect(games).toHaveLength(36);
    expect(games.filter((game) => game.courtNo === 1)).toHaveLength(24);
    expect(games.filter((game) => game.courtNo === 2)).toHaveLength(12);

    const appearances = new Map(players.map((player) => [player.id, { thai: 0, standard: 0 }]));
    for (const game of games) {
      for (const playerId of [game.left.maleId, game.left.femaleId, game.right.maleId, game.right.femaleId]) {
        const row = appearances.get(playerId)!;
        if (game.courtNo === 1) row.thai += 1;
        else row.standard += 1;
      }
    }
    expect([...appearances.values()].every((row) => row.thai === 8 && row.standard === 4)).toBe(true);
  });

  it('uses own pairs then a partner swap on both courts', () => {
    const schedule = buildSixPairHybridSchedule({ players: roster(12, 'W') });
    const [thaiDuel, , standardDuel] = schedule.rounds[0].duels;
    const [ownPairs, partnerSwap] = thaiDuel.games;

    expect(thaiDuel.games.map((game) => game.mode)).toEqual(['own_pairs', 'partner_swap']);
    expect(ownPairs.left.maleId).toBe(partnerSwap.left.maleId);
    expect(ownPairs.left.femaleId).toBe(partnerSwap.right.femaleId);
    expect(ownPairs.right.femaleId).toBe(partnerSwap.left.femaleId);
    expect(standardDuel.games.map((game) => game.mode)).toEqual(['fixed_pairs', 'partner_swap']);
    expect(standardDuel.games[0].left.maleId).toBe(standardDuel.games[1].left.maleId);
    expect(standardDuel.games[0].left.femaleId).toBe(standardDuel.games[1].right.femaleId);
    expect(standardDuel.games[0].right.femaleId).toBe(standardDuel.games[1].left.femaleId);
  });

  it('keeps the immutable v1 schedule available for already started tournaments', () => {
    const schedule = buildSixPairHybridScheduleV1({ players: roster(12, 'W') });
    const games = schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games));
    expect(games).toHaveLength(30);
    expect(games.filter((game) => game.courtNo === 2)).toHaveLength(6);
  });
});

describe('individual-mix scores and standings', () => {
  it('creates a two-tap hard-cap score and falls back for deuce', () => {
    expect(buildIndividualMixQuickScore({ rule: { kind: 'hard_cap', target: 15 }, winner: 'left', loserScore: 8 })).toEqual({ leftScore: 15, rightScore: 8 });
    expect(buildIndividualMixQuickScore({ rule: { kind: 'win_by_two', target: 15 }, winner: 'left', loserScore: 14 })).toBeNull();
    expect(validateIndividualMixScore({ kind: 'win_by_two', target: 15 }, 17, 15)).toBeNull();
    expect(validateIndividualMixScore({ kind: 'win_by_two', target: 15 }, 16, 15)).toContain('two points');
  });

  it('calculates separate personal standings from completed games', () => {
    const schedule = buildStandardIndividualMixPool({ poolId: 'A', courtNo: 1, men: roster(4, 'M'), women: roster(4, 'W') });
    const [first, second] = schedule.rounds[0].duels[0].games;
    const rows = calculateIndividualMixStandings({
      schedule,
      results: [
        { gameId: first.id, leftScore: 15, rightScore: 5, kind: 'played' },
        { gameId: second.id, leftScore: 15, rightScore: 10, kind: 'played' },
      ],
    });
    expect(rows.filter((row) => row.gender === 'M').map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(rows.find((row) => row.playerId === first.left.maleId)?.pointDiff).toBe(15);
    expect(rows.find((row) => row.playerId === first.right.maleId)?.pointDiff).toBe(-15);
  });
});

describe('individual-mix playoff', () => {
  it('builds inverse pairs and deterministic semifinals from the reference rules', () => {
    const bracket = buildIndividualMixDivisionBracket({ divisionId: 'hard', men: ['M1', 'M2', 'M3', 'M4'], women: ['W1', 'W2', 'W3', 'W4'] });
    expect(bracket.pairs.map((pair) => [pair.maleId, pair.femaleId])).toEqual([
      ['M1', 'W4'], ['M2', 'W3'], ['M3', 'W2'], ['M4', 'W1'],
    ]);
    expect(bracket.semifinals.map((match) => [match.pairAId, match.pairBId])).toEqual([
      ['hard-p1', 'hard-p4'], ['hard-p2', 'hard-p3'],
    ]);
  });

  it('builds HARD and LIGHT across two qualification pools', () => {
    const schedules = [1, 2].map((courtNo) => buildStandardIndividualMixPool({
      poolId: `P${courtNo}`,
      courtNo,
      men: roster(5, 'M', `P${courtNo}-`),
      women: roster(5, 'W', `P${courtNo}-`),
    }));
    const divisions = buildIndividualMixSeededDivisions({ schedules, results: [] });

    expect(divisions.map((division) => [division.name, division.courtNo])).toEqual([
      ['HARD', 1],
      ['LIGHT', 2],
    ]);
    expect(divisions[0].men.map((row) => row.poolRank)).toEqual([1, 1, 2, 2]);
    expect(divisions[0].women.map((row) => row.poolRank)).toEqual([1, 1, 2, 2]);
    expect(divisions[1].men.map((row) => row.poolRank)).toEqual([3, 3, 4, 4]);
    expect(divisions[1].women.map((row) => row.poolRank)).toEqual([3, 3, 4, 4]);
    expect(new Set(divisions.flatMap((division) => division.men.map((row) => row.playerId))).size).toBe(8);
    expect(divisions[0].bracket.pairs.map((pair) => [pair.maleId, pair.femaleId])).toEqual([
      [divisions[0].men[0].playerId, divisions[0].women[3].playerId],
      [divisions[0].men[1].playerId, divisions[0].women[2].playerId],
      [divisions[0].men[2].playerId, divisions[0].women[1].playerId],
      [divisions[0].men[3].playerId, divisions[0].women[0].playerId],
    ]);
  });

  it('supports one to four pools and splits four pools into four level divisions', () => {
    for (const poolCount of [1, 2, 3, 4]) {
      const schedules = Array.from({ length: poolCount }, (_, index) => buildStandardIndividualMixPool({
        poolId: `P${index + 1}`,
        courtNo: index + 1,
        men: roster(5, 'M', `P${index + 1}-`),
        women: roster(5, 'W', `P${index + 1}-`),
      }));
      const divisions = buildIndividualMixSeededDivisions({ schedules, results: [] });
      expect(divisions).toHaveLength(poolCount);
      expect(divisions.every((division) => division.men.length === 4 && division.women.length === 4)).toBe(true);
    }

    const schedules = [1, 2, 3, 4].map((courtNo) => buildStandardIndividualMixPool({
      poolId: `P${courtNo}`,
      courtNo,
      men: roster(5, 'M', `P${courtNo}-`),
      women: roster(5, 'W', `P${courtNo}-`),
    }));
    const divisions = buildIndividualMixSeededDivisions({ schedules, results: [] });
    expect(divisions.map((division) => division.name)).toEqual(['HARD', 'ADV', 'MED', 'LIGHT']);
    expect(divisions.map((division) => division.men.map((row) => row.poolRank))).toEqual([
      [1, 1, 1, 1],
      [2, 2, 2, 2],
      [3, 3, 3, 3],
      [4, 4, 4, 4],
    ]);
  });
});

describe('individual-mix offline command log', () => {
  it('applies score commands once and rejects stale revisions', () => {
    const schedule = buildStandardIndividualMixPool({ poolId: 'A', courtNo: 1, men: roster(4, 'M'), women: roster(4, 'W') });
    const game = schedule.rounds[0].duels[0].games[0];
    const bundle = createIndividualMixOfflineBundle({
      tournamentId: 't1', deviceId: 'ipad-main', rulesVersion: 'individual-mix.v1', scheduleRevision: 1,
      preparedAt: '2026-08-11T10:00:00.000Z', scoreRule: { kind: 'hard_cap', target: 15 }, schedules: [schedule],
    });
    const command = {
      commandId: 'cmd-1', tournamentId: 't1', deviceId: 'ipad-main', sequenceNumber: 1, baseRevision: 0,
      scheduleRevision: 1, rulesVersion: 'individual-mix.v1', createdAt: '2026-08-11T10:01:00.000Z',
      type: 'score_recorded' as const,
      payload: { result: { gameId: game.id, leftScore: 15, rightScore: 8, kind: 'played' as const } },
    };
    const applied = applyIndividualMixOfflineCommand(bundle, command);
    expect(applied.status).toBe('applied');
    expect(applied.bundle.results[game.id]).toMatchObject({ leftScore: 15, rightScore: 8 });
    expect(applyIndividualMixOfflineCommand(applied.bundle, command).status).toBe('duplicate');
    expect(() => applyIndividualMixOfflineCommand(applied.bundle, { ...command, commandId: 'cmd-2', sequenceNumber: 2, baseRevision: 0 })).toThrow('revision conflict');
    expect(getIndividualMixOfflineProgress(applied.bundle)).toMatchObject({ completed: 1, total: 12 });
  });
});
