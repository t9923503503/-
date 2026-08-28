import type {
  BracketMatch,
  BracketMatchCondition,
  BracketParticipant,
  BracketPhase,
  BracketTopology,
  ByeAdvance,
  ChampionSource,
  RematchPreview,
  SlotSource,
} from './types';
import { SportsDomainError } from './types';
import { stableStructuralHash } from './hash';

export type LoserOrdering = 'natural' | 'reverse' | 'half_shift' | 'reverse_half_shift';

export const LPV_DE_CROSSOVER_ORDERINGS = Object.freeze({
  4: Object.freeze(['natural', 'reverse'] as const),
  8: Object.freeze(['natural', 'reverse', 'natural'] as const),
  16: Object.freeze(['natural', 'reverse_half_shift', 'reverse', 'natural'] as const),
  32: Object.freeze(['natural', 'reverse', 'half_shift', 'natural', 'natural'] as const),
  64: Object.freeze(['natural', 'reverse', 'half_shift', 'reverse', 'natural', 'natural'] as const),
}) satisfies Readonly<Record<4 | 8 | 16 | 32 | 64, readonly LoserOrdering[]>>;

interface DuelResult {
  winner: SlotSource;
  loser: SlotSource;
  match: BracketMatch | null;
}

interface SeedLayout {
  slots: SlotSource[];
  participantsByPhysicalSlot: Array<BracketParticipant | null>;
  rematchPreview: RematchPreview[];
  warnings: string[];
}

export function nextBracketCapacity(teamCount: number): 2 | 4 | 8 | 16 | 32 | 64 {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 48) {
    throw new SportsDomainError('INVALID_BRACKET_TEAM_COUNT', 'Elimination brackets support 2 to 48 teams.', { teamCount });
  }
  let capacity = 2;
  while (capacity < teamCount) capacity *= 2;
  return capacity as 2 | 4 | 8 | 16 | 32 | 64;
}

export function buildSeedOrder(capacity: number): number[] {
  if (!Number.isInteger(capacity) || capacity < 2 || (capacity & (capacity - 1)) !== 0) {
    throw new SportsDomainError('INVALID_BRACKET_CAPACITY', 'Bracket capacity must be a power of two of at least two.', {
      capacity,
    });
  }
  let positions = [1, 2];
  while (positions.length < capacity) {
    const size = positions.length * 2;
    positions = positions.flatMap((position) => [position, size + 1 - position]);
  }
  return positions;
}

export function applyLoserOrdering<T>(items: readonly T[], method: LoserOrdering): T[] {
  if (method === 'natural') return [...items];
  if (method === 'reverse') return [...items].reverse();
  if (items.length % 2 !== 0) {
    throw new SportsDomainError('LOSER_ORDERING_REQUIRES_EVEN_SIZE', `${method} requires an even-sized source list.`, {
      size: items.length,
    });
  }
  const half = items.length / 2;
  if (method === 'half_shift') return [...items.slice(half), ...items.slice(0, half)];
  return [...items.slice(0, half).reverse(), ...items.slice(half).reverse()];
}

export function generateSingleElimination(
  participants: readonly BracketParticipant[],
  options: { bronzeMatch?: boolean; idPrefix?: string } = {},
): BracketTopology {
  validateParticipants(participants, 2);
  const capacity = nextBracketCapacity(participants.length);
  const layout = createSeedLayout(participants, capacity);
  const matches: BracketMatch[] = [];
  const byeAdvances: ByeAdvance[] = [];
  const idPrefix = normalizeIdPrefix(options.idPrefix, 'SE');
  const upperMatchesByRound: BracketMatch[][] = [];
  let current = layout.slots;
  const roundCount = Math.log2(capacity);

  for (let round = 1; round <= roundCount; round += 1) {
    const duels = pair(current);
    const results = duels.map(([sourceA, sourceB], index) => createDuel(
      idPrefix, 'upper', round, index + 1, sourceA, sourceB, matches, byeAdvances,
    ));
    upperMatchesByRound.push(results.flatMap((result) => result.match ? [result.match] : []));
    current = results.map((result) => result.winner);
  }

  const warnings = [...layout.warnings];
  if (options.bronzeMatch !== false) {
    const semifinals = upperMatchesByRound[Math.max(0, roundCount - 2)] ?? [];
    if (semifinals.length === 2) {
      createDuel(
        idPrefix,
        'bronze',
        1,
        1,
        { kind: 'MATCH_LOSER', matchId: semifinals[0].matchId },
        { kind: 'MATCH_LOSER', matchId: semifinals[1].matchId },
        matches,
        byeAdvances,
        { publicLabel: 'Матч за 3-е место' },
      );
    } else {
      warnings.push('BRONZE_MATCH_NOT_CREATED: two played semifinals are required.');
    }
  }

  return finalizeTopology({
    kind: 'single_elimination',
    participantCount: participants.length,
    capacity,
    templateVersion: 'lpv_se_v1',
    matches,
    byeAdvances,
    championSource: current[0],
    rematchPreview: layout.rematchPreview,
    warnings,
  });
}

export function generateDoubleElimination(
  participants: readonly BracketParticipant[],
  options: { resetFinal?: boolean; idPrefix?: string } = {},
): BracketTopology {
  validateParticipants(participants, 3);
  const capacity = nextBracketCapacity(participants.length);
  if (capacity === 2) {
    throw new SportsDomainError('DOUBLE_ELIMINATION_REQUIRES_THREE', 'True double elimination requires at least three teams.');
  }
  const deCapacity = capacity as 4 | 8 | 16 | 32 | 64;
  const orderings = LPV_DE_CROSSOVER_ORDERINGS[deCapacity];
  const layout = createSeedLayout(participants, deCapacity);
  const matches: BracketMatch[] = [];
  const byeAdvances: ByeAdvance[] = [];
  const idPrefix = normalizeIdPrefix(options.idPrefix, 'DE');
  const upperLosers: SlotSource[][] = [];
  let upperCurrent = layout.slots;
  const upperRoundCount = Math.log2(deCapacity);

  for (let round = 1; round <= upperRoundCount; round += 1) {
    const results = pair(upperCurrent).map(([sourceA, sourceB], index) => createDuel(
      idPrefix, 'upper', round, index + 1, sourceA, sourceB, matches, byeAdvances,
    ));
    upperLosers.push(results.map((result) => result.loser));
    upperCurrent = results.map((result) => result.winner);
  }

  const roundPairCount = upperRoundCount - 1;
  let lowerCurrent: SlotSource[] = [];
  for (let pairIndex = 0; pairIndex < roundPairCount; pairIndex += 1) {
    const majorRound = pairIndex * 2 + 1;
    let majorInputs: SlotSource[];
    if (pairIndex === 0) {
      majorInputs = applyLoserOrdering(upperLosers[0], orderings[0]);
    } else {
      majorInputs = lowerCurrent;
    }
    const majorResults = pair(majorInputs).map(([sourceA, sourceB], index) => createDuel(
      idPrefix, 'lower', majorRound, index + 1, sourceA, sourceB, matches, byeAdvances,
    ));
    const majorWinners = majorResults.map((result) => result.winner);

    const minorRound = majorRound + 1;
    const incomingOrdering = orderings[pairIndex + 1] ?? 'natural';
    const incomingUpperLosers = applyLoserOrdering(upperLosers[pairIndex + 1], incomingOrdering);
    if (incomingUpperLosers.length !== majorWinners.length) {
      throw new SportsDomainError('INVALID_DOUBLE_ELIMINATION_TEMPLATE', 'Upper/lower source counts do not match.', {
        capacity: deCapacity,
        pairIndex,
      });
    }
    lowerCurrent = majorWinners.map((winner, index) => createDuel(
      idPrefix,
      'lower',
      minorRound,
      index + 1,
      incomingUpperLosers[index],
      winner,
      matches,
      byeAdvances,
    ).winner);
  }

  const upperWinner = upperCurrent[0];
  const lowerWinner = lowerCurrent[0];
  const grandFinalOne = createDuel(
    idPrefix,
    'grand_final',
    1,
    1,
    upperWinner,
    lowerWinner,
    matches,
    byeAdvances,
    { publicLabel: 'Гранд-финал' },
  );
  if (!grandFinalOne.match) {
    throw new SportsDomainError('INVALID_GRAND_FINAL', 'Grand final cannot contain a BYE.');
  }

  let championSource: ChampionSource = grandFinalOne.winner;
  if (options.resetFinal !== false) {
    const condition: BracketMatchCondition = {
      kind: 'LOWER_BRACKET_WINNER_WON_GF1',
      grandFinalMatchId: grandFinalOne.match.matchId,
    };
    const reset = createDuel(
      idPrefix,
      'grand_final',
      2,
      1,
      { kind: 'MATCH_WINNER', matchId: grandFinalOne.match.matchId },
      { kind: 'MATCH_LOSER', matchId: grandFinalOne.match.matchId },
      matches,
      byeAdvances,
      {
        conditional: true,
        condition,
        publicLabel: 'Reset-финал — при необходимости',
      },
    );
    if (!reset.match) throw new SportsDomainError('INVALID_RESET_FINAL', 'Reset final must be a real conditional match.');
    championSource = {
      kind: 'CONDITIONAL_MATCH_WINNER',
      matchId: reset.match.matchId,
      fallback: grandFinalOne.winner,
      condition,
    };
  }

  const topology = finalizeTopology({
    kind: 'double_elimination',
    participantCount: participants.length,
    capacity: deCapacity,
    templateVersion: 'lpv_de_crossover_v1',
    matches,
    byeAdvances,
    championSource,
    rematchPreview: layout.rematchPreview,
    warnings: layout.warnings,
  });
  const expectedGuaranteed = participants.length * 2 - 2;
  if (topology.guaranteedMatchCount !== expectedGuaranteed) {
    throw new SportsDomainError('INVALID_DOUBLE_ELIMINATION_MATCH_COUNT', 'Generated bracket has an invalid real match count.', {
      expectedGuaranteed,
      actual: topology.guaranteedMatchCount,
      participantCount: participants.length,
    });
  }
  return topology;
}

function createSeedLayout(
  participants: readonly BracketParticipant[],
  capacity: 2 | 4 | 8 | 16 | 32 | 64,
): SeedLayout {
  const sorted = [...participants].sort((left, right) => left.seed - right.seed || left.entryId.localeCompare(right.entryId));
  const arranged = improvePoolSeparation(sorted, capacity);
  // buildSeedOrder is expressed in physical bracket order (for P=8:
  // 1,8,4,5,2,7,3,6). Reading it as seed -> slot is the inverse
  // permutation and incorrectly produces 1-5 in round one. Keep the
  // physical meaning explicit so top seeds receive the standard BYEs.
  const seedOrderByPhysicalSlot = buildSeedOrder(capacity);
  const participantsByPhysicalSlot = seedOrderByPhysicalSlot.map<BracketParticipant | null>(
    (seedOrdinal) => arranged[seedOrdinal - 1] ?? null,
  );
  const slots = participantsByPhysicalSlot.map<SlotSource>((participant) => participant
    ? { kind: 'ENTRY', entryId: participant.entryId, initialSeed: participant.seed }
    : { kind: 'BYE' });
  const rematchPreview = calculateRematchPreview(participantsByPhysicalSlot);
  return {
    slots,
    participantsByPhysicalSlot,
    rematchPreview,
    warnings: rematchPreview
      .filter((preview) => preview.earliestUpperRound === 1)
      .map((preview) => `POOL_REMATCH_IN_UPPER_R1:${preview.poolId}:${preview.entryIds.join(',')}`),
  };
}

function improvePoolSeparation(
  sorted: readonly BracketParticipant[],
  capacity: number,
): BracketParticipant[] {
  const current = [...sorted];
  const originalIndex = new Map(current.map((participant, index) => [participant.entryId, index]));
  const positions = physicalSlotsBySeedOrdinal(capacity);
  let currentScore = separationScore(current, positions, capacity, originalIndex);

  for (let iteration = 0; iteration < sorted.length * sorted.length; iteration += 1) {
    let bestSwap: readonly [number, number] | null = null;
    let bestScore = currentScore;
    for (let left = 0; left < current.length; left += 1) {
      for (let right = left + 1; right < current.length; right += 1) {
        if (current[left].poolRank === undefined || current[left].poolRank !== current[right].poolRank) continue;
        [current[left], current[right]] = [current[right], current[left]];
        const candidateScore = separationScore(current, positions, capacity, originalIndex);
        [current[left], current[right]] = [current[right], current[left]];
        if (compareScore(candidateScore, bestScore) < 0) {
          bestScore = candidateScore;
          bestSwap = [left, right];
        }
      }
    }
    if (!bestSwap) break;
    [current[bestSwap[0]], current[bestSwap[1]]] = [current[bestSwap[1]], current[bestSwap[0]]];
    currentScore = bestScore;
  }
  return current;
}

function physicalSlotsBySeedOrdinal(capacity: number): number[] {
  const positions = Array.from({ length: capacity }, () => -1);
  buildSeedOrder(capacity).forEach((seedOrdinal, physicalSlot) => {
    positions[seedOrdinal - 1] = physicalSlot;
  });
  return positions;
}

function separationScore(
  ordered: readonly BracketParticipant[],
  physicalPositions: readonly number[],
  capacity: number,
  originalIndex: ReadonlyMap<string, number>,
): number[] {
  const roundCount = Math.log2(capacity);
  const collisionCounts = Array.from({ length: roundCount }, () => 0);
  for (let left = 0; left < ordered.length; left += 1) {
    if (!ordered[left].poolId) continue;
    for (let right = left + 1; right < ordered.length; right += 1) {
      if (ordered[left].poolId !== ordered[right].poolId) continue;
      const round = earliestMeetingRound(physicalPositions[left], physicalPositions[right]);
      collisionCounts[round - 1] += 1;
    }
  }
  const deviation = ordered.reduce(
    (sum, participant, index) => sum + Math.abs(index - (originalIndex.get(participant.entryId) ?? index)),
    0,
  );
  return [...collisionCounts, deviation];
}

function compareScore(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function calculateRematchPreview(slots: readonly (BracketParticipant | null)[]): RematchPreview[] {
  const bestByPool = new Map<string, RematchPreview>();
  for (let left = 0; left < slots.length; left += 1) {
    const first = slots[left];
    if (!first?.poolId) continue;
    for (let right = left + 1; right < slots.length; right += 1) {
      const second = slots[right];
      if (!second || second.poolId !== first.poolId) continue;
      const candidate: RematchPreview = {
        poolId: first.poolId,
        earliestUpperRound: earliestMeetingRound(left, right),
        entryIds: [first.entryId, second.entryId],
      };
      const existing = bestByPool.get(first.poolId);
      if (!existing || candidate.earliestUpperRound < existing.earliestUpperRound ||
        (candidate.earliestUpperRound === existing.earliestUpperRound && candidate.entryIds.join() < existing.entryIds.join())) {
        bestByPool.set(first.poolId, candidate);
      }
    }
  }
  return [...bestByPool.values()].sort((left, right) => left.poolId.localeCompare(right.poolId));
}

function earliestMeetingRound(leftPosition: number, rightPosition: number): number {
  let left = leftPosition;
  let right = rightPosition;
  let round = 0;
  do {
    left = Math.floor(left / 2);
    right = Math.floor(right / 2);
    round += 1;
  } while (left !== right);
  return round;
}

function createDuel(
  prefix: string,
  phase: BracketPhase,
  round: number,
  position: number,
  sourceA: SlotSource,
  sourceB: SlotSource,
  matches: BracketMatch[],
  byeAdvances: ByeAdvance[],
  options: {
    conditional?: boolean;
    condition?: BracketMatchCondition;
    publicLabel?: string;
  } = {},
): DuelResult {
  const leftBye = sourceA.kind === 'BYE';
  const rightBye = sourceB.kind === 'BYE';
  if (leftBye || rightBye) {
    const advancedSource = leftBye ? sourceB : sourceA;
    byeAdvances.push({ phase, round, position, advancedSource });
    return { winner: advancedSource, loser: { kind: 'BYE' }, match: null };
  }

  const phaseCode = phase === 'upper' ? 'U' : phase === 'lower' ? 'L' : phase === 'bronze' ? 'B' : 'GF';
  const matchId = `${prefix}-${phaseCode}-R${round}-M${position}`;
  const match: BracketMatch = {
    matchId,
    phase,
    round,
    position,
    sourceA,
    sourceB,
    conditional: options.conditional ?? false,
    ...(options.condition ? { condition: options.condition } : {}),
    ...(options.publicLabel ? { publicLabel: options.publicLabel } : {}),
  };
  matches.push(match);
  return {
    winner: { kind: 'MATCH_WINNER', matchId },
    loser: { kind: 'MATCH_LOSER', matchId },
    match,
  };
}

function normalizeIdPrefix(value: string | undefined, fallback: string): string {
  const normalized = value ?? fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(normalized)) {
    throw new SportsDomainError(
      'INVALID_BRACKET_ID_PREFIX',
      'idPrefix must be 1-64 ASCII letters, numbers, underscores or hyphens and start with a letter or number.',
      { idPrefix: normalized },
    );
  }
  return normalized;
}

function finalizeTopology(input: Omit<BracketTopology, 'guaranteedMatchCount' | 'maximumMatchCount' | 'topologyHash'>): BracketTopology {
  const guaranteedMatchCount = input.matches.filter((match) => !match.conditional).length;
  const maximumMatchCount = input.matches.length;
  const withoutHash = { ...input, guaranteedMatchCount, maximumMatchCount };
  return { ...withoutHash, topologyHash: stableStructuralHash(withoutHash) };
}

function validateParticipants(participants: readonly BracketParticipant[], minimum: number): void {
  if (participants.length < minimum || participants.length > 48) {
    throw new SportsDomainError('INVALID_BRACKET_TEAM_COUNT', `Bracket requires ${minimum} to 48 participants.`, {
      participantCount: participants.length,
    });
  }
  const ids = new Set<string>();
  const seeds = new Set<number>();
  for (const participant of participants) {
    if (!participant.entryId || ids.has(participant.entryId)) {
      throw new SportsDomainError('DUPLICATE_BRACKET_ENTRY', 'Bracket participant entryId values must be unique.', {
        entryId: participant.entryId,
      });
    }
    if (!Number.isInteger(participant.seed) || participant.seed < 1 || seeds.has(participant.seed)) {
      throw new SportsDomainError('INVALID_BRACKET_SEED', 'Bracket seeds must be unique positive integers.', {
        entryId: participant.entryId,
        seed: participant.seed,
      });
    }
    ids.add(participant.entryId);
    seeds.add(participant.seed);
  }
}

function pair<T>(items: readonly T[]): Array<readonly [T, T]> {
  if (items.length % 2 !== 0) {
    throw new SportsDomainError('PAIRING_REQUIRES_EVEN_SIZE', 'Bracket source count must be even.', { size: items.length });
  }
  const pairs: Array<readonly [T, T]> = [];
  for (let index = 0; index < items.length; index += 2) pairs.push([items[index], items[index + 1]]);
  return pairs;
}
