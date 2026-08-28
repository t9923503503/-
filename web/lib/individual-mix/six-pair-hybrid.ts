import type {
  IndividualMixDuel,
  IndividualMixGame,
  IndividualMixPlayer,
  IndividualMixPoolSchedule,
  IndividualMixQueueItem,
} from './types';

export const INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1 = 'individual-mix-six-pair-hybrid-v1';
export const INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2 = 'individual-mix-six-pair-hybrid-v2';
export const INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION = INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2;
export type IndividualMixSixPairRulesVersion =
  | typeof INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1
  | typeof INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2;
export const INDIVIDUAL_MIX_SIX_PAIR_PLAYER_COUNT = 12;
export const INDIVIDUAL_MIX_SIX_PAIR_ROUND_COUNT = 6;
export const INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT = 11;

type PairNo = 1 | 2 | 3 | 4 | 5 | 6;
type Pairing = [PairNo, PairNo];

type HybridRoundTemplate = {
  thai: [Pairing, Pairing];
  standard: Pairing;
};

/**
 * The first five rounds reproduce the paper schedule supplied by the organizer.
 * Round six is the balancing round: every starting pair finishes with four Thai
 * rounds on court 1 and two fixed-pair games on court 2.
 */
export const INDIVIDUAL_MIX_SIX_PAIR_TEMPLATE: readonly HybridRoundTemplate[] = [
  { thai: [[1, 6], [2, 5]], standard: [3, 4] },
  { thai: [[5, 3], [6, 4]], standard: [1, 2] },
  { thai: [[1, 3], [2, 6]], standard: [4, 5] },
  { thai: [[1, 4], [2, 3]], standard: [6, 5] },
  { thai: [[1, 5], [2, 4]], standard: [3, 6] },
  { thai: [[3, 4], [5, 6]], standard: [1, 2] },
] as const;

type StartingPair = {
  pairNo: PairNo;
  playerIds: [string, string];
};

function assertRoster(players: IndividualMixPlayer[]): void {
  if (players.length !== INDIVIDUAL_MIX_SIX_PAIR_PLAYER_COUNT) {
    throw new Error('Схема «6 пар» требует ровно 12 игроков.');
  }
  const ids = new Set(players.map((player) => player.id.trim()));
  if (ids.size !== players.length || ids.has('')) {
    throw new Error('У каждого игрока должен быть уникальный идентификатор.');
  }
  const gender = players[0]?.gender;
  if (!gender || players.some((player) => player.gender !== gender)) {
    throw new Error('Для схемы «6 пар» все игроки должны быть одного пола.');
  }
}

function buildStartingPairs(players: IndividualMixPlayer[]): StartingPair[] {
  return Array.from({ length: 6 }, (_, index) => ({
    pairNo: (index + 1) as PairNo,
    playerIds: [players[index * 2].id, players[index * 2 + 1].id],
  }));
}

function game(input: {
  poolId: string;
  courtNo: 1 | 2;
  roundNo: number;
  duelNo: number;
  gameNo: number;
  mode: IndividualMixGame['mode'];
  pairNos: Pairing;
  left: [string, string];
  right: [string, string];
}): IndividualMixGame {
  const base = `${input.poolId}-c${input.courtNo}-r${input.roundNo}-d${input.duelNo}-g${input.gameNo}`;
  return {
    id: base,
    poolId: input.poolId,
    courtNo: input.courtNo,
    roundNo: input.roundNo,
    duelNo: input.duelNo,
    gameNo: input.gameNo,
    shortCode: `C${input.courtNo}-R${input.roundNo}-D${input.duelNo}-G${input.gameNo}`,
    mode: input.mode,
    sourcePairNos: input.pairNos,
    left: { maleId: input.left[0], femaleId: input.left[1] },
    right: { maleId: input.right[0], femaleId: input.right[1] },
  };
}

function judges(players: IndividualMixPlayer[], activeIds: string[]): [string, string] {
  const active = new Set(activeIds);
  const available = players.filter((player) => !active.has(player.id));
  return [available[0].id, available[1].id];
}

function buildDuel(input: {
  poolId: string;
  courtNo: 1 | 2;
  roundNo: number;
  duelNo: number;
  pairNos: Pairing;
  pairs: StartingPair[];
  players: IndividualMixPlayer[];
  standardPartnerSwap: boolean;
}): IndividualMixDuel {
  const leftPair = input.pairs[input.pairNos[0] - 1];
  const rightPair = input.pairs[input.pairNos[1] - 1];
  const [leftLead, leftPartner] = leftPair.playerIds;
  const [rightLead, rightPartner] = rightPair.playerIds;
  const activeIds = [...leftPair.playerIds, ...rightPair.playerIds];
  const duelBase = `${input.poolId}-c${input.courtNo}-r${input.roundNo}-d${input.duelNo}`;
  const games = input.courtNo === 1
    ? [
        game({
          ...input,
          gameNo: 1,
          mode: 'own_pairs',
          left: [leftLead, leftPartner],
          right: [rightLead, rightPartner],
        }),
        game({
          ...input,
          gameNo: 2,
          mode: 'partner_swap',
          left: [leftLead, rightPartner],
          right: [rightLead, leftPartner],
        }),
      ]
    : [
        game({
          ...input,
          gameNo: 1,
          mode: 'fixed_pairs',
          left: [leftLead, leftPartner],
          right: [rightLead, rightPartner],
        }),
        ...(input.standardPartnerSwap ? [game({
          ...input,
          gameNo: 2,
          mode: 'partner_swap',
          left: [leftLead, rightPartner],
          right: [rightLead, leftPartner],
        })] : []),
      ];

  return {
    id: duelBase,
    poolId: input.poolId,
    courtNo: input.courtNo,
    roundNo: input.roundNo,
    duelNo: input.duelNo,
    mode: input.courtNo === 1 ? 'thai' : 'standard',
    sourcePairNos: input.pairNos,
    maleIds: [leftLead, rightLead],
    femaleIds: [leftPartner, rightPartner],
    judgePlayerIds: judges(input.players, activeIds),
    games,
  };
}

function buildSchedule(input: {
  poolId?: string;
  players: IndividualMixPlayer[];
}, standardPartnerSwap: boolean): IndividualMixPoolSchedule {
  assertRoster(input.players);
  const poolId = input.poolId?.trim() || 'six-pair-hybrid';
  const pairs = buildStartingPairs(input.players);
  const rounds = INDIVIDUAL_MIX_SIX_PAIR_TEMPLATE.map((round, roundIndex) => ({
    roundNo: roundIndex + 1,
    duels: [
      buildDuel({ poolId, courtNo: 1, roundNo: roundIndex + 1, duelNo: 1, pairNos: round.thai[0], pairs, players: input.players, standardPartnerSwap }),
      buildDuel({ poolId, courtNo: 1, roundNo: roundIndex + 1, duelNo: 2, pairNos: round.thai[1], pairs, players: input.players, standardPartnerSwap }),
      buildDuel({ poolId, courtNo: 2, roundNo: roundIndex + 1, duelNo: 3, pairNos: round.standard, pairs, players: input.players, standardPartnerSwap }),
    ],
    restingPlayerIds: [],
  }));

  const queue: IndividualMixQueueItem[] = [];
  let orderNo = 1;
  for (const round of rounds) {
    for (const duel of round.duels) {
      for (const scheduledGame of duel.games) {
        queue.push({ kind: 'game', orderNo: orderNo++, gameId: scheduledGame.id, duelId: duel.id });
      }
    }
  }

  return {
    poolId,
    courtNo: 1,
    players: [...input.players],
    rounds,
    queue,
  };
}

export function buildSixPairHybridScheduleV1(input: { poolId?: string; players: IndividualMixPlayer[] }): IndividualMixPoolSchedule {
  return buildSchedule(input, false);
}

export function buildSixPairHybridSchedule(input: { poolId?: string; players: IndividualMixPlayer[] }): IndividualMixPoolSchedule {
  return buildSchedule(input, true);
}

export function buildSixPairHybridScheduleForVersion(
  version: IndividualMixSixPairRulesVersion,
  input: { poolId?: string; players: IndividualMixPlayer[] },
): IndividualMixPoolSchedule {
  return version === INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1
    ? buildSixPairHybridScheduleV1(input)
    : buildSixPairHybridSchedule(input);
}

export function validateSixPairHybridSchedule(
  schedule: IndividualMixPoolSchedule,
  version: IndividualMixSixPairRulesVersion = INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION,
): string[] {
  const errors: string[] = [];
  const pairCourtRounds = new Map<PairNo, { thai: Set<number>; standard: Set<number> }>(
    Array.from({ length: 6 }, (_, index) => [(index + 1) as PairNo, { thai: new Set(), standard: new Set() }]),
  );
  const playerCourtGames = new Map(schedule.players.map((player) => [player.id, { thai: 0, standard: 0 }]));
  const games = schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games));

  if (schedule.rounds.length !== INDIVIDUAL_MIX_SIX_PAIR_ROUND_COUNT) {
    errors.push(`expected ${INDIVIDUAL_MIX_SIX_PAIR_ROUND_COUNT} rounds, got ${schedule.rounds.length}`);
  }
  const standardGamesPerDuel = version === INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1 ? 1 : 2;
  const expectedTotalGames = 24 + (6 * standardGamesPerDuel);
  if (games.length !== expectedTotalGames) errors.push(`expected ${expectedTotalGames} games, got ${games.length}`);

  for (const round of schedule.rounds) {
    const pairNos = round.duels.flatMap((duel) => duel.sourcePairNos ?? []);
    if (pairNos.length !== 6 || new Set(pairNos).size !== 6) {
      errors.push(`round ${round.roundNo}: every starting pair must appear exactly once`);
    }
    for (const duel of round.duels) {
      const sourcePairNos = duel.sourcePairNos ?? [];
      for (const pairNo of sourcePairNos) {
        const counts = pairCourtRounds.get(pairNo as PairNo);
        if (counts) (duel.courtNo === 1 ? counts.thai : counts.standard).add(round.roundNo);
      }
      const expectedGames = duel.courtNo === 1 ? 2 : standardGamesPerDuel;
      if (duel.games.length !== expectedGames) {
        errors.push(`${duel.id}: expected ${expectedGames} games, got ${duel.games.length}`);
      }
      for (const scheduledGame of duel.games) {
        for (const playerId of [
          scheduledGame.left.maleId,
          scheduledGame.left.femaleId,
          scheduledGame.right.maleId,
          scheduledGame.right.femaleId,
        ]) {
          const counts = playerCourtGames.get(playerId);
          if (!counts) errors.push(`${scheduledGame.id}: unknown player ${playerId}`);
          else if (scheduledGame.courtNo === 1) counts.thai += 1;
          else counts.standard += 1;
        }
      }
    }
  }

  for (const [pairNo, counts] of pairCourtRounds) {
    if (counts.thai.size !== 4 || counts.standard.size !== 2) {
      errors.push(`pair ${pairNo}: expected 4 Thai rounds and 2 standard rounds`);
    }
  }
  for (const [playerId, counts] of playerCourtGames) {
    const expectedStandardGames = 2 * standardGamesPerDuel;
    if (counts.thai !== 8 || counts.standard !== expectedStandardGames) {
      errors.push(`${playerId}: expected 8 Thai games and ${expectedStandardGames} standard games`);
    }
  }

  return errors;
}
