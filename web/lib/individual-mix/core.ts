import type {
  IndividualMixDivisionBracket,
  IndividualMixDuel,
  IndividualMixDivisionEntry,
  IndividualMixGame,
  IndividualMixGameResult,
  IndividualMixPlayer,
  IndividualMixPoolSchedule,
  IndividualMixQueueItem,
  IndividualMixScoreRule,
  IndividualMixSeededDivision,
  IndividualMixSide,
  IndividualMixStandingRow,
} from './types';

type Pairing = [number, number];

function assertUniquePlayers(players: IndividualMixPlayer[]): void {
  const ids = new Set<string>();
  for (const player of players) {
    if (!player.id.trim()) throw new Error('Every individual-mix player requires an id.');
    if (ids.has(player.id)) throw new Error(`Duplicate individual-mix player id: ${player.id}`);
    ids.add(player.id);
  }
}

/** Circle-method round robin. A null slot represents the bye for odd-sized pools. */
export function generateIndividualMixRoundRobin(size: number): Array<{ pairings: Pairing[]; bye: number | null }> {
  if (!Number.isInteger(size) || size < 2) throw new Error('Round-robin size must be an integer of at least 2.');
  const slots: Array<number | null> = Array.from({ length: size }, (_, index) => index);
  if (slots.length % 2) slots.push(null);
  const rounds: Array<{ pairings: Pairing[]; bye: number | null }> = [];

  for (let roundNo = 0; roundNo < slots.length - 1; roundNo += 1) {
    const pairings: Pairing[] = [];
    let bye: number | null = null;
    for (let index = 0; index < slots.length / 2; index += 1) {
      const left = slots[index];
      const right = slots[slots.length - 1 - index];
      if (left == null || right == null) bye = left ?? right;
      else pairings.push([left, right]);
    }
    rounds.push({ pairings, bye });
    const fixed = slots[0];
    const tail = slots.slice(1);
    tail.unshift(tail.pop() ?? null);
    slots.splice(0, slots.length, fixed, ...tail);
  }
  return rounds;
}

function participantIds(duel: Pick<IndividualMixDuel, 'maleIds' | 'femaleIds'>): string[] {
  return [...duel.maleIds, ...duel.femaleIds];
}

function intersectionSize(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.reduce((sum, id) => sum + (rightSet.has(id) ? 1 : 0), 0);
}

function orderDuelsForRest(duels: IndividualMixDuel[], previous: IndividualMixDuel | null): IndividualMixDuel[] {
  if (!previous || duels.length < 2) return duels;
  return [...duels].sort((left, right) => {
    const prior = participantIds(previous);
    const overlap = intersectionSize(prior, participantIds(left)) - intersectionSize(prior, participantIds(right));
    return overlap || left.id.localeCompare(right.id);
  });
}

function chooseJudges(input: {
  men: IndividualMixPlayer[];
  women: IndividualMixPlayer[];
  duelPlayers: Set<string>;
  judgeCounts: Map<string, number>;
}): [string, string] {
  const choose = (players: IndividualMixPlayer[]): string => {
    const available = players
      .filter((player) => !input.duelPlayers.has(player.id))
      .sort((left, right) => {
        const countDiff = (input.judgeCounts.get(left.id) ?? 0) - (input.judgeCounts.get(right.id) ?? 0);
        return countDiff || left.id.localeCompare(right.id);
      });
    if (!available.length) throw new Error('A duel requires at least one non-playing judge of each gender.');
    const selected = available[0].id;
    input.judgeCounts.set(selected, (input.judgeCounts.get(selected) ?? 0) + 1);
    return selected;
  };
  return [choose(input.men), choose(input.women)];
}

function buildGames(input: {
  poolId: string;
  courtNo: number;
  roundNo: number;
  duelNo: number;
  maleIds: [string, string];
  femaleIds: [string, string];
}): [IndividualMixGame, IndividualMixGame] {
  const base = `${input.poolId}-r${input.roundNo}-d${input.duelNo}`;
  const code = `C${input.courtNo}-R${input.roundNo}-D${input.duelNo}`;
  return [
    {
      id: `${base}-g1`, poolId: input.poolId, courtNo: input.courtNo, roundNo: input.roundNo,
      duelNo: input.duelNo, gameNo: 1, shortCode: `${code}-G1`, mode: 'own_pairs',
      left: { maleId: input.maleIds[0], femaleId: input.femaleIds[0] },
      right: { maleId: input.maleIds[1], femaleId: input.femaleIds[1] },
    },
    {
      id: `${base}-g2`, poolId: input.poolId, courtNo: input.courtNo, roundNo: input.roundNo,
      duelNo: input.duelNo, gameNo: 2, shortCode: `${code}-G2`, mode: 'partner_swap',
      left: { maleId: input.maleIds[0], femaleId: input.femaleIds[1] },
      right: { maleId: input.maleIds[1], femaleId: input.femaleIds[0] },
    },
  ];
}

export function buildStandardIndividualMixPool(input: {
  poolId: string;
  courtNo: number;
  men: IndividualMixPlayer[];
  women: IndividualMixPlayer[];
}): IndividualMixPoolSchedule {
  const poolId = input.poolId.trim();
  if (!poolId) throw new Error('Pool id is required.');
  if (!Number.isInteger(input.courtNo) || input.courtNo < 1) throw new Error('Court number must be a positive integer.');
  if (input.men.length !== input.women.length) throw new Error('A standard individual-mix pool requires equal male and female counts.');
  if (input.men.length < 4 || input.men.length > 6) throw new Error('A standard individual-mix pool supports 4+4, 5+5 or 6+6 players.');
  if (input.men.some((player) => player.gender !== 'M') || input.women.some((player) => player.gender !== 'W')) {
    throw new Error('Individual-mix pool genders do not match their roster buckets.');
  }
  assertUniquePlayers([...input.men, ...input.women]);

  const template = generateIndividualMixRoundRobin(input.men.length);
  const judgeCounts = new Map<string, number>();
  let previousDuel: IndividualMixDuel | null = null;
  const rounds = template.map((round, roundIndex) => {
    const unordered = round.pairings.map((malePair, duelIndex): IndividualMixDuel => {
      const femalePair = round.pairings[duelIndex];
      const maleIds: [string, string] = [input.men[malePair[0]].id, input.men[malePair[1]].id];
      const femaleIds: [string, string] = [input.women[femalePair[0]].id, input.women[femalePair[1]].id];
      const duelNo = duelIndex + 1;
      const duelPlayers = new Set([...maleIds, ...femaleIds]);
      return {
        id: `${poolId}-r${roundIndex + 1}-d${duelNo}`,
        poolId,
        courtNo: input.courtNo,
        roundNo: roundIndex + 1,
        duelNo,
        maleIds,
        femaleIds,
        judgePlayerIds: chooseJudges({ men: input.men, women: input.women, duelPlayers, judgeCounts }),
        games: buildGames({ poolId, courtNo: input.courtNo, roundNo: roundIndex + 1, duelNo, maleIds, femaleIds }),
      };
    });
    const duels = orderDuelsForRest(unordered, previousDuel).map((duel, index) => ({
      ...duel,
      duelNo: index + 1,
      id: `${poolId}-r${roundIndex + 1}-d${index + 1}`,
      games: buildGames({
        poolId, courtNo: input.courtNo, roundNo: roundIndex + 1, duelNo: index + 1,
        maleIds: duel.maleIds, femaleIds: duel.femaleIds,
      }),
    }));
    previousDuel = duels.at(-1) ?? previousDuel;
    const restingPlayerIds = round.bye == null ? [] : [input.men[round.bye].id, input.women[round.bye].id];
    return { roundNo: roundIndex + 1, duels, restingPlayerIds };
  });

  const queue: IndividualMixQueueItem[] = [];
  let orderNo = 1;
  let prior: IndividualMixDuel | null = null;
  for (const round of rounds) {
    for (const duel of round.duels) {
      if (prior) {
        const affected = participantIds(prior).filter((id) => participantIds(duel).includes(id));
        if (affected.length) queue.push({ kind: 'break', orderNo: orderNo++, reason: 'mandatory_rest', affectedPlayerIds: affected });
      }
      for (const game of duel.games) queue.push({ kind: 'game', orderNo: orderNo++, gameId: game.id, duelId: duel.id });
      prior = duel;
    }
  }
  return { poolId, courtNo: input.courtNo, players: [...input.men, ...input.women], rounds, queue };
}

export function validateIndividualMixPoolSchedule(schedule: IndividualMixPoolSchedule): string[] {
  const errors: string[] = [];
  const games = schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games));
  const gameById = new Map(games.map((game) => [game.id, game]));
  const appearances = new Map(schedule.players.map((player) => [player.id, 0]));
  const sameGenderMeetings = new Map<string, number>();

  for (const round of schedule.rounds) {
    for (const duel of round.duels) {
      const players = participantIds(duel);
      if (new Set(players).size !== 4) errors.push(`${duel.id}: duplicate duel participant.`);
      if (duel.judgePlayerIds.some((id) => players.includes(id))) errors.push(`${duel.id}: judge also plays the duel.`);
      const maleKey = [...duel.maleIds].sort().join('|');
      const femaleKey = [...duel.femaleIds].sort().join('|');
      sameGenderMeetings.set(`M:${maleKey}`, (sameGenderMeetings.get(`M:${maleKey}`) ?? 0) + 1);
      sameGenderMeetings.set(`W:${femaleKey}`, (sameGenderMeetings.get(`W:${femaleKey}`) ?? 0) + 1);
      const [first, second] = duel.games;
      if (first.left.maleId !== second.left.maleId || first.right.maleId !== second.right.maleId) errors.push(`${duel.id}: male opponents changed.`);
      if (first.left.femaleId !== second.right.femaleId || first.right.femaleId !== second.left.femaleId) errors.push(`${duel.id}: partner swap is invalid.`);
      for (const game of duel.games) {
        for (const id of [game.left.maleId, game.left.femaleId, game.right.maleId, game.right.femaleId]) {
          appearances.set(id, (appearances.get(id) ?? 0) + 1);
        }
      }
    }
  }
  for (const [key, count] of sameGenderMeetings) if (count !== 1) errors.push(`${key}: expected one same-gender meeting, got ${count}.`);
  const expectedGames = 2 * (schedule.players.length / 2 - 1);
  for (const [id, count] of appearances) if (count !== expectedGames) errors.push(`${id}: expected ${expectedGames} games, got ${count}.`);

  const consecutive = new Map(schedule.players.map((player) => [player.id, 0]));
  for (const item of schedule.queue) {
    if (item.kind === 'break') {
      for (const id of item.affectedPlayerIds) consecutive.set(id, 0);
      continue;
    }
    const game = gameById.get(item.gameId);
    if (!game) {
      errors.push(`${item.gameId}: queue references a missing game.`);
      continue;
    }
    const active = new Set([game.left.maleId, game.left.femaleId, game.right.maleId, game.right.femaleId]);
    for (const player of schedule.players) {
      const next = active.has(player.id) ? (consecutive.get(player.id) ?? 0) + 1 : 0;
      consecutive.set(player.id, next);
      if (next > 2) errors.push(`${player.id}: more than two consecutive games.`);
    }
  }
  return [...new Set(errors)];
}

export function buildIndividualMixQuickScore(input: {
  rule: IndividualMixScoreRule;
  winner: IndividualMixSide;
  loserScore: number;
}): { leftScore: number; rightScore: number } | null {
  if (input.rule.kind === 'timed') return null;
  const loserScore = Math.trunc(Number(input.loserScore));
  if (loserScore < 0) return null;
  const winnerScore = input.rule.target;
  if (input.rule.kind === 'hard_cap') {
    if (loserScore >= winnerScore) return null;
  } else {
    if (loserScore >= input.rule.target - 1) return null;
    if (input.rule.cap != null && winnerScore > input.rule.cap) return null;
  }
  return input.winner === 'left'
    ? { leftScore: winnerScore, rightScore: loserScore }
    : { leftScore: loserScore, rightScore: winnerScore };
}

export function validateIndividualMixScore(rule: IndividualMixScoreRule, leftScore: number, rightScore: number): string | null {
  const left = Math.trunc(Number(leftScore));
  const right = Math.trunc(Number(rightScore));
  if (left < 0 || right < 0) return 'Score must be non-negative.';
  if (left === right) return 'A finished game cannot be tied.';
  const high = Math.max(left, right);
  const low = Math.min(left, right);
  if (rule.kind === 'hard_cap') return high === rule.target && low < rule.target ? null : `Winner must score exactly ${rule.target}.`;
  if (rule.kind === 'timed') return rule.maxPoints != null && high > rule.maxPoints ? `Score cannot exceed ${rule.maxPoints}.` : null;
  if (high < rule.target) return `Winner must score at least ${rule.target}.`;
  if (high - low < 2) return 'Winner must lead by two points.';
  if (rule.cap != null && high > rule.cap) return `Score cannot exceed cap ${rule.cap}.`;
  if (rule.cap != null && high === rule.cap) return null;
  return high - low === 2 ? null : 'Game must finish immediately after a two-point lead.';
}

export function calculateIndividualMixStandings(input: {
  schedule: IndividualMixPoolSchedule;
  results: IndividualMixGameResult[];
}): IndividualMixStandingRow[] {
  const games = new Map(input.schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games)).map((game) => [game.id, game]));
  const players = new Map(input.schedule.players.map((player) => [player.id, player]));
  const rows = new Map(input.schedule.players.map((player) => [player.id, {
    playerId: player.id, gender: player.gender, played: 0, wins: 0, losses: 0,
    pointsFor: 0, pointsAgainst: 0, pointDiff: 0, drawSeed: player.drawSeed ?? Number.MAX_SAFE_INTEGER, position: 0,
  } satisfies IndividualMixStandingRow]));
  const seen = new Set<string>();
  for (const result of input.results) {
    if (seen.has(result.gameId)) throw new Error(`Duplicate result for ${result.gameId}.`);
    seen.add(result.gameId);
    if (result.kind === 'cancelled') continue;
    const game = games.get(result.gameId);
    if (!game) throw new Error(`Unknown individual-mix game: ${result.gameId}`);
    if (result.leftScore === result.rightScore) throw new Error(`Finished game ${result.gameId} cannot be tied.`);
    const leftWon = result.leftScore > result.rightScore;
    for (const [team, scoreFor, scoreAgainst, won] of [
      [game.left, result.leftScore, result.rightScore, leftWon],
      [game.right, result.rightScore, result.leftScore, !leftWon],
    ] as const) {
      for (const playerId of [team.maleId, team.femaleId]) {
        if (!players.has(playerId)) throw new Error(`Unknown player ${playerId}.`);
        const row = rows.get(playerId)!;
        row.played += 1; row.wins += won ? 1 : 0; row.losses += won ? 0 : 1;
        row.pointsFor += scoreFor; row.pointsAgainst += scoreAgainst; row.pointDiff = row.pointsFor - row.pointsAgainst;
      }
    }
  }
  const byGender = (gender: 'M' | 'W') => [...rows.values()]
    .filter((row) => row.gender === gender)
    .sort((left, right) => right.pointDiff - left.pointDiff || right.wins - left.wins || right.pointsFor - left.pointsFor || left.drawSeed - right.drawSeed || left.playerId.localeCompare(right.playerId))
    .map((row, index) => ({ ...row, position: index + 1 }));
  return [...byGender('M'), ...byGender('W')];
}

export function buildIndividualMixDivisionBracket(input: {
  divisionId: string;
  men: [string, string, string, string];
  women: [string, string, string, string];
}): IndividualMixDivisionBracket {
  const pairs = [
    { id: `${input.divisionId}-p1`, seedNo: 1 as const, maleId: input.men[0], femaleId: input.women[3] },
    { id: `${input.divisionId}-p2`, seedNo: 2 as const, maleId: input.men[1], femaleId: input.women[2] },
    { id: `${input.divisionId}-p3`, seedNo: 3 as const, maleId: input.men[2], femaleId: input.women[1] },
    { id: `${input.divisionId}-p4`, seedNo: 4 as const, maleId: input.men[3], femaleId: input.women[0] },
  ];
  return {
    divisionId: input.divisionId,
    pairs,
    semifinals: [
      { id: `${input.divisionId}-sf1`, pairAId: pairs[0].id, pairBId: pairs[3].id },
      { id: `${input.divisionId}-sf2`, pairAId: pairs[1].id, pairBId: pairs[2].id },
    ],
    medalMatches: {
      final: { id: `${input.divisionId}-final`, sourcePairIds: [`${input.divisionId}-sf1`, `${input.divisionId}-sf2`] },
      bronze: { id: `${input.divisionId}-bronze`, sourcePairIds: [`${input.divisionId}-sf1`, `${input.divisionId}-sf2`] },
    },
  };
}

const DIVISION_NAMES = {
  1: ['HARD'],
  2: ['HARD', 'LIGHT'],
  3: ['HARD', 'MED', 'LIGHT'],
  4: ['HARD', 'ADV', 'MED', 'LIGHT'],
} as const;

type DivisionCandidate = Omit<IndividualMixDivisionEntry, 'divisionSeed'>;

function compareDivisionCandidates(left: DivisionCandidate, right: DivisionCandidate): number {
  const leftWinPct = left.played ? left.wins / left.played : 0;
  const rightWinPct = right.played ? right.wins / right.played : 0;
  const leftAvgDiff = left.played ? left.pointDiff / left.played : 0;
  const rightAvgDiff = right.played ? right.pointDiff / right.played : 0;
  const leftRatio = left.pointsAgainst ? left.pointsFor / left.pointsAgainst : left.pointsFor;
  const rightRatio = right.pointsAgainst ? right.pointsFor / right.pointsAgainst : right.pointsFor;
  return left.poolRank - right.poolRank
    || rightWinPct - leftWinPct
    || rightAvgDiff - leftAvgDiff
    || rightRatio - leftRatio
    || right.pointsFor - left.pointsFor
    || left.drawSeed - right.drawSeed
    || left.poolId.localeCompare(right.poolId)
    || left.playerId.localeCompare(right.playerId);
}

/**
 * Builds level divisions across qualification pools. Pool place is primary;
 * statistics only order players who finished on the same place in different pools.
 */
export function buildIndividualMixSeededDivisions(input: {
  schedules: IndividualMixPoolSchedule[];
  results: IndividualMixGameResult[];
}): IndividualMixSeededDivision[] {
  const poolCount = input.schedules.length;
  if (!Number.isInteger(poolCount) || poolCount < 1 || poolCount > 4) {
    throw new Error('Individual-mix playoff supports one to four qualification pools.');
  }

  const candidates: Record<'M' | 'W', DivisionCandidate[]> = { M: [], W: [] };
  for (const schedule of input.schedules) {
    const gameIds = new Set(schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games.map((game) => game.id))));
    const poolResults = input.results.filter((result) => gameIds.has(result.gameId));
    const rows = calculateIndividualMixStandings({ schedule, results: poolResults });
    for (const row of rows) {
      candidates[row.gender].push({
        ...row,
        poolId: schedule.poolId,
        poolCourtNo: schedule.courtNo,
        poolRank: row.position,
      });
    }
  }

  candidates.M.sort(compareDivisionCandidates);
  candidates.W.sort(compareDivisionCandidates);
  const names = DIVISION_NAMES[poolCount as keyof typeof DIVISION_NAMES];
  const requiredPerGender = names.length * 4;
  if (candidates.M.length < requiredPerGender || candidates.W.length < requiredPerGender) {
    throw new Error(`Individual-mix playoff requires at least ${requiredPerGender} players of each gender.`);
  }

  return names.map((name, divisionIndex) => {
    const start = divisionIndex * 4;
    const seed = (candidate: DivisionCandidate, index: number): IndividualMixDivisionEntry => ({
      ...candidate,
      divisionSeed: (index + 1) as 1 | 2 | 3 | 4,
    });
    const men = candidates.M.slice(start, start + 4).map(seed) as IndividualMixSeededDivision['men'];
    const women = candidates.W.slice(start, start + 4).map(seed) as IndividualMixSeededDivision['women'];
    const id = name.toLowerCase();
    return {
      id,
      name,
      courtNo: divisionIndex + 1,
      men,
      women,
      bracket: buildIndividualMixDivisionBracket({
        divisionId: id,
        men: men.map((row) => row.playerId) as [string, string, string, string],
        women: women.map((row) => row.playerId) as [string, string, string, string],
      }),
    };
  });
}
