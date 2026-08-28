import { stableStructuralHash } from './hash';
import {
  compareExactRatios,
  exactRatio,
  toExactRatioDto,
} from './ranking';
import type {
  BracketParticipant,
  ExactRatio,
  ExactRatioDto,
  SlotSource,
} from './types';
import { SportsDomainError } from './types';

export const LPV_CLASSIFICATION_STRATEGY_V1 = Object.freeze({
  strategyId: 'lpv_classification_rounds_v1',
  version: 'v1',
  kind: 'placement',
  minimumTeamCount: 3,
  maximumTeamCount: 48,
  targetGamesPerTeam: 3,
  pairingPolicy: 'berger_3_even_4_odd_double_rr_3',
  placementPolicy: 'win_pct_opponent_win_pct_head_to_head_seed_v1',
} as const);

export type ClassificationFormatStrategyV2 = typeof LPV_CLASSIFICATION_STRATEGY_V1;

export interface ClassificationTopologyPlan {
  teamCount: number;
  roundCount: number;
  realMatchCount: number;
  minimumGamesGuaranteed: number;
  maximumGames: number;
  structuralIdleAppearances: number;
  rematchesRequired: boolean;
}

export type ClassificationFeasibility =
  | {
      supported: true;
      plan: ClassificationTopologyPlan;
    }
  | {
      supported: false;
      code: 'CLASSIFICATION_REQUIRES_THREE';
      message: string;
      alternatives: readonly ['standalone_series', 'add_third_team'];
    };

type EntrySource = Extract<SlotSource, { kind: 'ENTRY' }>;

export interface ClassificationMatch {
  matchId: string;
  round: number;
  position: number;
  sourceA: EntrySource;
  sourceB: EntrySource;
  /** Previous real matches of A/B. These edges form the scheduling DAG. */
  dependencies: readonly string[];
  publicLabel: string;
}

export interface ClassificationRound {
  round: number;
  matchIds: readonly string[];
  /** A pause only: no match, win, loss or standing contribution is created. */
  idleEntryIds: readonly string[];
}

export interface ClassificationTopology {
  kind: 'classification_rounds';
  strategy: ClassificationFormatStrategyV2;
  participantCount: number;
  participants: readonly BracketParticipant[];
  rounds: readonly ClassificationRound[];
  matches: readonly ClassificationMatch[];
  gamesByEntry: readonly { entryId: string; games: number }[];
  roundCount: number;
  realMatchCount: number;
  minimumGamesGuaranteed: number;
  maximumGames: number;
  topologyHash: string;
}

export interface ClassificationMatchOutcomeInput {
  matchId: string;
  winnerEntryId: string;
  loserEntryId: string;
}

export type ClassificationPlacementBasis =
  | 'classification_standings'
  | 'initial_seed_tiebreak';

export interface CompleteClassificationPlacement {
  entryId: string;
  place: number;
  /** Equal sporting metrics share this range; seed only makes exports unique. */
  sportingPlaceRange: readonly [number, number];
  initialSeed: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRatio: ExactRatioDto;
  opponentWinRatio: ExactRatioDto;
  headToHeadRatio: ExactRatioDto;
  basis: ClassificationPlacementBasis;
}

export interface CompleteClassificationResult {
  championEntryId: string;
  runnerUpEntryId: string;
  placements: readonly CompleteClassificationPlacement[];
  playedMatchIds: readonly string[];
  resultHash: string;
}

interface PairingRound {
  pairs: Array<readonly [BracketParticipant, BracketParticipant]>;
  idle: BracketParticipant[];
}

interface RawStanding {
  participant: BracketParticipant;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRatio: ExactRatio;
  opponentWinRatio: ExactRatio;
}

interface ResolvedClassificationMatch {
  match: ClassificationMatch;
  participantA: string;
  participantB: string;
  winnerEntryId: string;
  loserEntryId: string;
}

const RANKING_CRITERIA = Object.freeze([
  'win_percentage',
  'opponent_win_percentage',
  'head_to_head_percentage',
  'initial_seed',
] as const);

function stableCompare(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function validateTeamCount(teamCount: number): void {
  if (!Number.isSafeInteger(teamCount) || teamCount < 2 || teamCount > 48) {
    throw new SportsDomainError(
      'INVALID_CLASSIFICATION_TEAM_COUNT',
      'Classification rounds support an integer team count from 2 to 48 for feasibility analysis.',
      { teamCount },
    );
  }
}

export function analyzeClassificationFeasibility(teamCount: number): ClassificationFeasibility {
  validateTeamCount(teamCount);
  if (teamCount === 2) {
    return {
      supported: false,
      code: 'CLASSIFICATION_REQUIRES_THREE',
      message: 'Two teams do not form a classification field. Three games would require repeating the only matchup as an explicit series.',
      alternatives: ['standalone_series', 'add_third_team'],
    };
  }
  if (teamCount === 3) {
    return {
      supported: true,
      plan: {
        teamCount,
        roundCount: 6,
        realMatchCount: 6,
        minimumGamesGuaranteed: 4,
        maximumGames: 4,
        structuralIdleAppearances: 6,
        rematchesRequired: true,
      },
    };
  }
  if (teamCount % 2 === 0) {
    return {
      supported: true,
      plan: {
        teamCount,
        roundCount: 3,
        realMatchCount: (teamCount * 3) / 2,
        minimumGamesGuaranteed: 3,
        maximumGames: 3,
        structuralIdleAppearances: 0,
        rematchesRequired: false,
      },
    };
  }
  return {
    supported: true,
    plan: {
      teamCount,
      roundCount: 4,
      realMatchCount: 2 * (teamCount - 1),
      minimumGamesGuaranteed: 3,
      maximumGames: 4,
      structuralIdleAppearances: 4,
      rematchesRequired: false,
    },
  };
}

export function describeClassificationTopology(teamCount: number): ClassificationTopologyPlan {
  const feasibility = analyzeClassificationFeasibility(teamCount);
  if (!feasibility.supported) {
    throw new SportsDomainError(feasibility.code, feasibility.message, {
      teamCount,
      alternatives: feasibility.alternatives,
    });
  }
  return feasibility.plan;
}

export function assertClassificationStrategy(
  strategy: ClassificationFormatStrategyV2,
): void {
  if (
    strategy.strategyId !== LPV_CLASSIFICATION_STRATEGY_V1.strategyId
    || strategy.version !== LPV_CLASSIFICATION_STRATEGY_V1.version
    || strategy.kind !== LPV_CLASSIFICATION_STRATEGY_V1.kind
    || strategy.minimumTeamCount !== LPV_CLASSIFICATION_STRATEGY_V1.minimumTeamCount
    || strategy.maximumTeamCount !== LPV_CLASSIFICATION_STRATEGY_V1.maximumTeamCount
    || strategy.targetGamesPerTeam !== LPV_CLASSIFICATION_STRATEGY_V1.targetGamesPerTeam
    || strategy.pairingPolicy !== LPV_CLASSIFICATION_STRATEGY_V1.pairingPolicy
    || strategy.placementPolicy !== LPV_CLASSIFICATION_STRATEGY_V1.placementPolicy
  ) {
    throw new SportsDomainError(
      'UNSUPPORTED_CLASSIFICATION_STRATEGY',
      'Only the frozen lpv_classification_rounds_v1 strategy is supported.',
      { strategy },
    );
  }
}

export function generateClassificationTopology(
  participantsInput: readonly BracketParticipant[],
  options: { idPrefix?: string; strategy?: ClassificationFormatStrategyV2 } = {},
): ClassificationTopology {
  const strategy = options.strategy ?? LPV_CLASSIFICATION_STRATEGY_V1;
  assertClassificationStrategy(strategy);
  const participants = validateParticipants(participantsInput);
  const plan = describeClassificationTopology(participants.length);
  const idPrefix = normalizeIdPrefix(options.idPrefix ?? 'CLASS');
  const baseRounds = bergerRounds(participants);
  const selectedRounds = participants.length === 3
    ? [
        ...baseRounds,
        ...baseRounds.map((round) => ({
          pairs: round.pairs.map(([left, right]) => [right, left] as const),
          idle: [...round.idle],
        })),
      ]
    : baseRounds.slice(0, plan.roundCount);
  if (selectedRounds.length !== plan.roundCount) {
    throw new SportsDomainError('CLASSIFICATION_TOPOLOGY_INCOMPLETE', 'Could not generate the required classification rounds.', {
      expectedRounds: plan.roundCount,
      actualRounds: selectedRounds.length,
    });
  }

  const matches: ClassificationMatch[] = [];
  const rounds: ClassificationRound[] = [];
  const lastMatchByEntry = new Map<string, string>();
  const gamesByEntry = new Map(participants.map((participant) => [participant.entryId, 0]));
  for (const [roundIndex, pairingRound] of selectedRounds.entries()) {
    const round = roundIndex + 1;
    const roundMatches: ClassificationMatch[] = pairingRound.pairs.map(([left, right], positionIndex) => {
      const position = positionIndex + 1;
      const matchId = `${idPrefix}-C-R${round}-M${position}`;
      const dependencies = [...new Set([
        lastMatchByEntry.get(left.entryId),
        lastMatchByEntry.get(right.entryId),
      ].filter((value): value is string => Boolean(value)))].sort(stableCompare);
      return {
        matchId,
        round,
        position,
        sourceA: entrySource(left),
        sourceB: entrySource(right),
        dependencies,
        publicLabel: `Классификационный раунд ${round}`,
      };
    });
    for (const match of roundMatches) {
      matches.push(match);
      gamesByEntry.set(match.sourceA.entryId, (gamesByEntry.get(match.sourceA.entryId) ?? 0) + 1);
      gamesByEntry.set(match.sourceB.entryId, (gamesByEntry.get(match.sourceB.entryId) ?? 0) + 1);
    }
    for (const match of roundMatches) {
      lastMatchByEntry.set(match.sourceA.entryId, match.matchId);
      lastMatchByEntry.set(match.sourceB.entryId, match.matchId);
    }
    rounds.push({
      round,
      matchIds: roundMatches.map((match) => match.matchId),
      idleEntryIds: pairingRound.idle.map((participant) => participant.entryId).sort(stableCompare),
    });
  }

  const gameRows = participants.map((participant) => ({
    entryId: participant.entryId,
    games: gamesByEntry.get(participant.entryId) ?? 0,
  }));
  const actualMinimum = Math.min(...gameRows.map((row) => row.games));
  const actualMaximum = Math.max(...gameRows.map((row) => row.games));
  const pairCounts = new Map<string, number>();
  for (const match of matches) {
    const key = [match.sourceA.entryId, match.sourceB.entryId].sort(stableCompare).join('\u0000');
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const repeatedPairs = [...pairCounts.values()].filter((count) => count > 1);
  if (
    matches.length !== plan.realMatchCount
    || actualMinimum !== plan.minimumGamesGuaranteed
    || actualMaximum !== plan.maximumGames
    || (plan.rematchesRequired ? repeatedPairs.length !== 3 || repeatedPairs.some((count) => count !== 2) : repeatedPairs.length !== 0)
    || rounds.reduce((sum, round) => sum + round.idleEntryIds.length, 0) !== plan.structuralIdleAppearances
  ) {
    throw new SportsDomainError('CLASSIFICATION_GUARANTEE_MISMATCH', 'Generated rounds do not match the frozen guarantee.', {
      plan,
      actual: {
        realMatchCount: matches.length,
        minimumGamesGuaranteed: actualMinimum,
        maximumGames: actualMaximum,
        structuralIdleAppearances: rounds.reduce((sum, round) => sum + round.idleEntryIds.length, 0),
        repeatedPairs,
      },
    });
  }

  const withoutHash = {
    kind: 'classification_rounds' as const,
    strategy,
    participantCount: participants.length,
    participants,
    rounds,
    matches,
    gamesByEntry: gameRows,
    roundCount: plan.roundCount,
    realMatchCount: matches.length,
    minimumGamesGuaranteed: actualMinimum,
    maximumGames: actualMaximum,
  };
  return { ...withoutHash, topologyHash: stableStructuralHash(withoutHash) };
}

export function resolveCompleteClassificationPlacements(
  topology: ClassificationTopology,
  outcomes: readonly ClassificationMatchOutcomeInput[],
): CompleteClassificationResult {
  assertClassificationStrategy(topology.strategy);
  const participants = new Map(topology.participants.map((participant) => [participant.entryId, participant]));
  if (participants.size !== topology.participantCount) {
    throw new SportsDomainError('CLASSIFICATION_PARTICIPANT_SNAPSHOT_MISMATCH', 'Classification participant snapshot is incomplete.');
  }
  const matchById = new Map(topology.matches.map((match) => [match.matchId, match]));
  const outcomeById = new Map<string, ClassificationMatchOutcomeInput>();
  for (const outcome of outcomes) {
    if (!outcome.matchId || outcomeById.has(outcome.matchId)) {
      throw new SportsDomainError('DUPLICATE_CLASSIFICATION_OUTCOME', 'Every classification match needs one unique outcome.', {
        matchId: outcome.matchId,
      });
    }
    if (!matchById.has(outcome.matchId)) {
      throw new SportsDomainError('UNKNOWN_CLASSIFICATION_OUTCOME', 'Outcome references a match outside the topology.', {
        matchId: outcome.matchId,
      });
    }
    outcomeById.set(outcome.matchId, outcome);
  }

  const games = new Map([...participants.keys()].map((entryId) => [entryId, 0]));
  const wins = new Map([...participants.keys()].map((entryId) => [entryId, 0]));
  const losses = new Map([...participants.keys()].map((entryId) => [entryId, 0]));
  const opponents = new Map([...participants.keys()].map((entryId) => [entryId, [] as string[]]));
  const resolved: ResolvedClassificationMatch[] = [];
  for (const match of topology.matches) {
    const outcome = outcomeById.get(match.matchId);
    if (!outcome) {
      throw new SportsDomainError('MISSING_CLASSIFICATION_OUTCOME', 'Every real classification match requires an outcome.', {
        matchId: match.matchId,
      });
    }
    const participantA = match.sourceA.entryId;
    const participantB = match.sourceB.entryId;
    if (
      outcome.winnerEntryId === outcome.loserEntryId
      || ![participantA, participantB].includes(outcome.winnerEntryId)
      || ![participantA, participantB].includes(outcome.loserEntryId)
    ) {
      throw new SportsDomainError(
        'INVALID_CLASSIFICATION_OUTCOME_PARTICIPANTS',
        'Winner and loser must be the two entries assigned to the classification match.',
        { matchId: match.matchId, participantA, participantB, outcome },
      );
    }
    games.set(participantA, (games.get(participantA) ?? 0) + 1);
    games.set(participantB, (games.get(participantB) ?? 0) + 1);
    wins.set(outcome.winnerEntryId, (wins.get(outcome.winnerEntryId) ?? 0) + 1);
    losses.set(outcome.loserEntryId, (losses.get(outcome.loserEntryId) ?? 0) + 1);
    opponents.get(participantA)?.push(participantB);
    opponents.get(participantB)?.push(participantA);
    resolved.push({ match, participantA, participantB, ...outcome });
  }

  const expectedGames = new Map(topology.gamesByEntry.map((row) => [row.entryId, row.games]));
  for (const entryId of participants.keys()) {
    const actualGames = games.get(entryId) ?? 0;
    if (
      actualGames !== expectedGames.get(entryId)
      || (wins.get(entryId) ?? 0) + (losses.get(entryId) ?? 0) !== actualGames
    ) {
      throw new SportsDomainError('CLASSIFICATION_GAME_LEDGER_MISMATCH', 'Completed ledger does not match the immutable topology.', {
        entryId,
        expectedGames: expectedGames.get(entryId),
        actualGames,
      });
    }
  }

  const rows = new Map<string, RawStanding>();
  for (const participant of participants.values()) {
    const entryId = participant.entryId;
    let opponentWins = 0;
    let opponentGames = 0;
    for (const opponentId of opponents.get(entryId) ?? []) {
      opponentWins += wins.get(opponentId) ?? 0;
      opponentGames += games.get(opponentId) ?? 0;
    }
    rows.set(entryId, {
      participant,
      gamesPlayed: games.get(entryId) ?? 0,
      wins: wins.get(entryId) ?? 0,
      losses: losses.get(entryId) ?? 0,
      winRatio: exactRatio(wins.get(entryId) ?? 0, games.get(entryId) ?? 0),
      opponentWinRatio: exactRatio(opponentWins, opponentGames),
    });
  }

  const headToHeadByEntry = new Map<string, ExactRatio>();
  const placements = rankClassificationBlock(
    [...rows.keys()],
    0,
    1,
    rows,
    resolved,
    headToHeadByEntry,
  );
  if (
    placements.length !== topology.participantCount
    || placements.some((placement, index) => placement.place !== index + 1)
  ) {
    throw new SportsDomainError('INCOMPLETE_CLASSIFICATION_PLACEMENTS', 'Classification must produce every place from 1 through N exactly once.');
  }
  const resultWithoutHash = {
    championEntryId: placements[0].entryId,
    runnerUpEntryId: placements[1].entryId,
    placements,
    playedMatchIds: topology.matches.map((match) => match.matchId),
  };
  return {
    ...resultWithoutHash,
    resultHash: stableStructuralHash({
      topologyHash: topology.topologyHash,
      outcomes: topology.matches.map((match) => outcomeById.get(match.matchId)),
      placements,
    }),
  };
}

function rankClassificationBlock(
  entryIds: readonly string[],
  criterion: number,
  startPlace: number,
  rows: ReadonlyMap<string, RawStanding>,
  resolved: readonly ResolvedClassificationMatch[],
  headToHeadByEntry: Map<string, ExactRatio>,
): CompleteClassificationPlacement[] {
  if (criterion >= RANKING_CRITERIA.length - 1 || entryIds.length <= 1) {
    return finalizePlacementCohort(entryIds, startPlace, rows, headToHeadByEntry);
  }
  let values: Map<string, ExactRatio>;
  if (criterion === 0) {
    values = new Map(entryIds.map((entryId) => [entryId, requiredRow(rows, entryId).winRatio]));
  } else if (criterion === 1) {
    values = new Map(entryIds.map((entryId) => [entryId, requiredRow(rows, entryId).opponentWinRatio]));
  } else {
    values = headToHeadRatios(entryIds, resolved);
    for (const [entryId, ratio] of values) headToHeadByEntry.set(entryId, ratio);
  }
  if ([...values.values()].some((ratio) => ratio.kind === 'no_data')) {
    return rankClassificationBlock(entryIds, criterion + 1, startPlace, rows, resolved, headToHeadByEntry);
  }
  const sorted = [...entryIds].sort((left, right) => {
    const comparison = compareExactRatios(values.get(left) as ExactRatio, values.get(right) as ExactRatio);
    if (comparison !== null && comparison !== 0) return -comparison;
    return stableCompare(left, right);
  });
  const groups: string[][] = [];
  for (const entryId of sorted) {
    const group = groups[groups.length - 1];
    if (!group) {
      groups.push([entryId]);
      continue;
    }
    const comparison = compareExactRatios(
      values.get(group[0]) as ExactRatio,
      values.get(entryId) as ExactRatio,
    );
    if (comparison === 0) group.push(entryId);
    else groups.push([entryId]);
  }
  const placements: CompleteClassificationPlacement[] = [];
  let nextPlace = startPlace;
  for (const group of groups) {
    const ranked = rankClassificationBlock(group, criterion + 1, nextPlace, rows, resolved, headToHeadByEntry);
    placements.push(...ranked);
    nextPlace += ranked.length;
  }
  return placements;
}

function finalizePlacementCohort(
  entryIds: readonly string[],
  startPlace: number,
  rows: ReadonlyMap<string, RawStanding>,
  headToHeadByEntry: ReadonlyMap<string, ExactRatio>,
): CompleteClassificationPlacement[] {
  const sorted = [...entryIds].sort((left, right) => (
    requiredRow(rows, left).participant.seed - requiredRow(rows, right).participant.seed
    || stableCompare(left, right)
  ));
  const endPlace = startPlace + sorted.length - 1;
  return sorted.map((entryId, index) => {
    const row = requiredRow(rows, entryId);
    return {
      entryId,
      place: startPlace + index,
      sportingPlaceRange: [startPlace, endPlace] as const,
      initialSeed: row.participant.seed,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
      winRatio: toExactRatioDto(row.winRatio),
      opponentWinRatio: toExactRatioDto(row.opponentWinRatio),
      headToHeadRatio: toExactRatioDto(headToHeadByEntry.get(entryId) ?? { kind: 'no_data' }),
      basis: sorted.length > 1 ? 'initial_seed_tiebreak' as const : 'classification_standings' as const,
    };
  });
}

function headToHeadRatios(
  entryIds: readonly string[],
  resolved: readonly ResolvedClassificationMatch[],
): Map<string, ExactRatio> {
  const cohort = new Set(entryIds);
  const games = new Map(entryIds.map((entryId) => [entryId, 0]));
  const wins = new Map(entryIds.map((entryId) => [entryId, 0]));
  for (const match of resolved) {
    if (!cohort.has(match.participantA) || !cohort.has(match.participantB)) continue;
    games.set(match.participantA, (games.get(match.participantA) ?? 0) + 1);
    games.set(match.participantB, (games.get(match.participantB) ?? 0) + 1);
    wins.set(match.winnerEntryId, (wins.get(match.winnerEntryId) ?? 0) + 1);
  }
  return new Map(entryIds.map((entryId) => [entryId, exactRatio(wins.get(entryId) ?? 0, games.get(entryId) ?? 0)]));
}

function requiredRow(rows: ReadonlyMap<string, RawStanding>, entryId: string): RawStanding {
  const row = rows.get(entryId);
  if (!row) throw new SportsDomainError('UNKNOWN_CLASSIFICATION_PARTICIPANT', 'Standing references an unknown entry.', { entryId });
  return row;
}

function bergerRounds(participants: readonly BracketParticipant[]): PairingRound[] {
  const rotation: Array<BracketParticipant | null> = [...participants];
  if (rotation.length % 2 === 1) rotation.push(null);
  const rounds: PairingRound[] = [];
  let current = rotation;
  for (let round = 0; round < current.length - 1; round += 1) {
    const pairs: Array<readonly [BracketParticipant, BracketParticipant]> = [];
    const idle: BracketParticipant[] = [];
    for (let index = 0; index < current.length / 2; index += 1) {
      const left = current[index];
      const right = current[current.length - 1 - index];
      if (left && right) pairs.push([left, right]);
      else if (left || right) idle.push((left ?? right) as BracketParticipant);
    }
    rounds.push({ pairs, idle });
    current = [current[0], current[current.length - 1], ...current.slice(1, -1)];
  }
  return rounds;
}

function validateParticipants(participantsInput: readonly BracketParticipant[]): BracketParticipant[] {
  const feasibility = participantsInput.length >= 2 && participantsInput.length <= 48
    ? analyzeClassificationFeasibility(participantsInput.length)
    : null;
  if (!feasibility || !feasibility.supported) {
    if (feasibility && !feasibility.supported) {
      throw new SportsDomainError(feasibility.code, feasibility.message, {
        participantCount: participantsInput.length,
        alternatives: feasibility.alternatives,
      });
    }
    throw new SportsDomainError('INVALID_CLASSIFICATION_TEAM_COUNT', 'Classification requires 3 to 48 participants.', {
      participantCount: participantsInput.length,
    });
  }
  const ids = new Set<string>();
  const seeds = new Set<number>();
  for (const participant of participantsInput) {
    if (!participant.entryId || ids.has(participant.entryId)) {
      throw new SportsDomainError('DUPLICATE_CLASSIFICATION_ENTRY', 'Classification entryId values must be unique.', {
        entryId: participant.entryId,
      });
    }
    if (!Number.isSafeInteger(participant.seed) || participant.seed < 1 || seeds.has(participant.seed)) {
      throw new SportsDomainError('INVALID_CLASSIFICATION_SEED', 'Classification seeds must be unique positive integers.', {
        entryId: participant.entryId,
        seed: participant.seed,
      });
    }
    ids.add(participant.entryId);
    seeds.add(participant.seed);
  }
  return [...participantsInput]
    .map((participant) => ({ ...participant }))
    .sort((left, right) => left.seed - right.seed || stableCompare(left.entryId, right.entryId));
}

function entrySource(participant: BracketParticipant): EntrySource {
  return { kind: 'ENTRY', entryId: participant.entryId, initialSeed: participant.seed };
}

function normalizeIdPrefix(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new SportsDomainError(
      'INVALID_CLASSIFICATION_ID_PREFIX',
      'idPrefix must be 1-64 ASCII letters, numbers, underscores or hyphens and start with a letter or number.',
      { idPrefix: value },
    );
  }
  return value;
}
