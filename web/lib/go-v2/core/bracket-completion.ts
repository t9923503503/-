import type {
  BracketMatch,
  BracketTopology,
  ChampionSource,
  SlotSource,
} from './types';
import { SportsDomainError } from './types';

export interface BracketMatchOutcomeInput {
  matchId: string;
  winnerEntryId: string;
  loserEntryId: string;
}

export type BracketPlacementBasis =
  | 'championship_match'
  | 'placement_match'
  | 'elimination_round'
  | 'initial_seed_tiebreak';

export interface CompleteBracketPlacement {
  entryId: string;
  /** Unique deterministic ordinal used by rating/export projections. */
  place: number;
  /** Sporting cohort before the configured initial-seed fallback is applied. */
  sportingPlaceRange: readonly [number, number];
  initialSeed: number;
  gamesPlayed: number;
  losses: number;
  eliminatedByMatchId: string | null;
  basis: BracketPlacementBasis;
}

export interface CompleteBracketResult {
  championEntryId: string;
  runnerUpEntryId: string;
  placements: readonly CompleteBracketPlacement[];
  playedMatchIds: readonly string[];
  skippedConditionalMatchIds: readonly string[];
  resetFinalPlayed: boolean;
  /** Null for SE. With reset enabled, a false value is rejected rather than returned. */
  strictTwoLossInvariantSatisfied: boolean | null;
}

interface ResolvedMatch {
  match: BracketMatch;
  participantA: string;
  participantB: string;
  winnerEntryId: string;
  loserEntryId: string;
}

interface EliminationEvent {
  matchId: string;
  phase: BracketMatch['phase'];
  round: number;
}

function stableCompare(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function rememberEntry(source: SlotSource, participants: Map<string, number>): void {
  if (source.kind !== 'ENTRY') return;
  const currentSeed = participants.get(source.entryId);
  if (currentSeed !== undefined && currentSeed !== source.initialSeed) {
    throw new SportsDomainError(
      'BRACKET_PARTICIPANT_SEED_MISMATCH',
      'One bracket entry is referenced with conflicting initial seeds.',
      { entryId: source.entryId, seeds: [currentSeed, source.initialSeed] },
    );
  }
  participants.set(source.entryId, source.initialSeed);
}

function participantSnapshot(topology: BracketTopology): Map<string, number> {
  const participants = new Map<string, number>();
  for (const match of topology.matches) {
    rememberEntry(match.sourceA, participants);
    rememberEntry(match.sourceB, participants);
  }
  for (const advance of topology.byeAdvances) rememberEntry(advance.advancedSource, participants);
  if (topology.championSource.kind === 'ENTRY') rememberEntry(topology.championSource, participants);
  if (topology.championSource.kind === 'CONDITIONAL_MATCH_WINNER') {
    rememberEntry(topology.championSource.fallback, participants);
  }
  if (participants.size !== topology.participantCount) {
    throw new SportsDomainError(
      'BRACKET_PARTICIPANT_SNAPSHOT_MISMATCH',
      'Bracket topology does not expose exactly the declared participant count.',
      { declared: topology.participantCount, actual: participants.size },
    );
  }
  const seedOwners = new Map<number, string>();
  for (const [entryId, seed] of participants) {
    const owner = seedOwners.get(seed);
    if (owner && owner !== entryId) {
      throw new SportsDomainError('DUPLICATE_BRACKET_SEED', 'Bracket participant seeds must be unique.', {
        seed,
        entryIds: [owner, entryId],
      });
    }
    seedOwners.set(seed, entryId);
  }
  return participants;
}

function resolveSource(
  source: SlotSource,
  winners: ReadonlyMap<string, string>,
  losers: ReadonlyMap<string, string>,
): string {
  if (source.kind === 'ENTRY') return source.entryId;
  if (source.kind === 'MATCH_WINNER') {
    const entryId = winners.get(source.matchId);
    if (entryId) return entryId;
  }
  if (source.kind === 'MATCH_LOSER') {
    const entryId = losers.get(source.matchId);
    if (entryId) return entryId;
  }
  throw new SportsDomainError(
    'UNRESOLVED_BRACKET_SOURCE',
    'A real bracket match references a BYE or an unresolved earlier result.',
    { source },
  );
}

function conditionalIsActive(
  match: BracketMatch,
  matchById: ReadonlyMap<string, BracketMatch>,
  winners: ReadonlyMap<string, string>,
  losers: ReadonlyMap<string, string>,
): boolean {
  if (!match.condition) {
    throw new SportsDomainError('MISSING_BRACKET_CONDITION', 'A conditional bracket match requires a condition.', {
      matchId: match.matchId,
    });
  }
  const grandFinal = matchById.get(match.condition.grandFinalMatchId);
  if (!grandFinal || grandFinal.phase !== 'grand_final') {
    throw new SportsDomainError('INVALID_BRACKET_CONDITION', 'Reset condition must reference the first grand final.', {
      matchId: match.matchId,
      grandFinalMatchId: match.condition.grandFinalMatchId,
    });
  }
  const grandFinalWinner = winners.get(grandFinal.matchId);
  if (!grandFinalWinner) {
    throw new SportsDomainError('UNRESOLVED_BRACKET_CONDITION', 'Grand-final result is unavailable for reset evaluation.', {
      matchId: match.matchId,
    });
  }
  const lowerChampion = resolveSource(grandFinal.sourceB, winners, losers);
  return grandFinalWinner === lowerChampion;
}

function resolveChampion(
  source: ChampionSource,
  activeConditionalMatches: ReadonlySet<string>,
  winners: ReadonlyMap<string, string>,
  losers: ReadonlyMap<string, string>,
): string {
  if (source.kind !== 'CONDITIONAL_MATCH_WINNER') return resolveSource(source, winners, losers);
  if (activeConditionalMatches.has(source.matchId)) {
    const winner = winners.get(source.matchId);
    if (winner) return winner;
    throw new SportsDomainError('UNRESOLVED_BRACKET_SOURCE', 'Active conditional final has no winner.', {
      matchId: source.matchId,
    });
  }
  return resolveSource(source.fallback, winners, losers);
}

function addExactPlacement(
  placements: CompleteBracketPlacement[],
  assigned: Set<string>,
  entryId: string,
  place: number,
  participants: ReadonlyMap<string, number>,
  games: ReadonlyMap<string, number>,
  losses: ReadonlyMap<string, number>,
  eliminatedByMatchId: string | null,
  basis: BracketPlacementBasis,
): void {
  if (assigned.has(entryId)) {
    throw new SportsDomainError('DUPLICATE_FINAL_PLACEMENT', 'An entry was assigned more than one final place.', {
      entryId,
    });
  }
  const initialSeed = participants.get(entryId);
  if (initialSeed === undefined) {
    throw new SportsDomainError('UNKNOWN_BRACKET_PARTICIPANT', 'Final placement references an unknown entry.', { entryId });
  }
  assigned.add(entryId);
  placements.push({
    entryId,
    place,
    sportingPlaceRange: [place, place],
    initialSeed,
    gamesPlayed: games.get(entryId) ?? 0,
    losses: losses.get(entryId) ?? 0,
    eliminatedByMatchId,
    basis,
  });
}

function addCohort(
  placements: CompleteBracketPlacement[],
  assigned: Set<string>,
  entryIds: readonly string[],
  startPlace: number,
  participants: ReadonlyMap<string, number>,
  games: ReadonlyMap<string, number>,
  losses: ReadonlyMap<string, number>,
  eliminations: ReadonlyMap<string, EliminationEvent>,
): number {
  const sorted = [...entryIds].sort((left, right) => (
    (participants.get(left) ?? Number.MAX_SAFE_INTEGER) - (participants.get(right) ?? Number.MAX_SAFE_INTEGER)
    || stableCompare(left, right)
  ));
  const endPlace = startPlace + sorted.length - 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const entryId = sorted[index];
    const initialSeed = participants.get(entryId);
    if (initialSeed === undefined || assigned.has(entryId)) {
      throw new SportsDomainError('DUPLICATE_FINAL_PLACEMENT', 'Placement cohort is inconsistent.', { entryId });
    }
    assigned.add(entryId);
    placements.push({
      entryId,
      place: startPlace + index,
      sportingPlaceRange: [startPlace, endPlace],
      initialSeed,
      gamesPlayed: games.get(entryId) ?? 0,
      losses: losses.get(entryId) ?? 0,
      eliminatedByMatchId: eliminations.get(entryId)?.matchId ?? null,
      basis: sorted.length > 1 ? 'initial_seed_tiebreak' : 'elimination_round',
    });
  }
  return endPlace + 1;
}

/**
 * Resolves an immutable bracket topology plus played outcomes into one complete,
 * deterministic 1..N ledger. Teams eliminated in the same unclassified round
 * retain their sporting tie range; initial seed only supplies the stable unique
 * ordinal needed by exports/rating projections.
 */
export function resolveCompleteBracketPlacements(
  topology: BracketTopology,
  outcomes: readonly BracketMatchOutcomeInput[],
): CompleteBracketResult {
  const participants = participantSnapshot(topology);
  const matchById = new Map(topology.matches.map((match) => [match.matchId, match]));
  const outcomeById = new Map<string, BracketMatchOutcomeInput>();
  for (const outcome of outcomes) {
    if (!outcome.matchId || outcomeById.has(outcome.matchId)) {
      throw new SportsDomainError('DUPLICATE_BRACKET_OUTCOME', 'Every played match needs one unique outcome.', {
        matchId: outcome.matchId,
      });
    }
    if (!matchById.has(outcome.matchId)) {
      throw new SportsDomainError('UNKNOWN_BRACKET_MATCH_OUTCOME', 'Outcome references a match outside the topology.', {
        matchId: outcome.matchId,
      });
    }
    outcomeById.set(outcome.matchId, outcome);
  }

  const winners = new Map<string, string>();
  const losers = new Map<string, string>();
  const resolved = new Map<string, ResolvedMatch>();
  const games = new Map([...participants.keys()].map((entryId) => [entryId, 0]));
  const losses = new Map([...participants.keys()].map((entryId) => [entryId, 0]));
  const activeConditionalMatches = new Set<string>();
  const skippedConditionalMatchIds: string[] = [];
  const eliminations = new Map<string, EliminationEvent>();
  const upperLosses = new Map<string, EliminationEvent>();

  for (const match of topology.matches) {
    if (match.conditional && !conditionalIsActive(match, matchById, winners, losers)) {
      if (outcomeById.has(match.matchId)) {
        throw new SportsDomainError(
          'INACTIVE_CONDITIONAL_OUTCOME',
          'A condition-false reset final cannot receive a played result.',
          { matchId: match.matchId },
        );
      }
      skippedConditionalMatchIds.push(match.matchId);
      continue;
    }
    if (match.conditional) activeConditionalMatches.add(match.matchId);
    const outcome = outcomeById.get(match.matchId);
    if (!outcome) {
      throw new SportsDomainError('MISSING_BRACKET_OUTCOME', 'Every active real match requires an outcome.', {
        matchId: match.matchId,
      });
    }
    const participantA = resolveSource(match.sourceA, winners, losers);
    const participantB = resolveSource(match.sourceB, winners, losers);
    if (
      outcome.winnerEntryId === outcome.loserEntryId
      || ![participantA, participantB].includes(outcome.winnerEntryId)
      || ![participantA, participantB].includes(outcome.loserEntryId)
    ) {
      throw new SportsDomainError(
        'INVALID_BRACKET_OUTCOME_PARTICIPANTS',
        'Winner and loser must be the two participants resolved for this match.',
        { matchId: match.matchId, participantA, participantB, outcome },
      );
    }
    winners.set(match.matchId, outcome.winnerEntryId);
    losers.set(match.matchId, outcome.loserEntryId);
    resolved.set(match.matchId, { match, participantA, participantB, ...outcome });
    games.set(participantA, (games.get(participantA) ?? 0) + 1);
    games.set(participantB, (games.get(participantB) ?? 0) + 1);
    const loserLosses = (losses.get(outcome.loserEntryId) ?? 0) + 1;
    losses.set(outcome.loserEntryId, loserLosses);
    const event = { matchId: match.matchId, phase: match.phase, round: match.round } satisfies EliminationEvent;
    if (match.phase === 'upper' && !upperLosses.has(outcome.loserEntryId)) {
      upperLosses.set(outcome.loserEntryId, event);
    }
    if (topology.kind === 'double_elimination' && loserLosses === 2) {
      eliminations.set(outcome.loserEntryId, event);
    }
    if (topology.kind === 'double_elimination' && loserLosses > 2) {
      throw new SportsDomainError('INVALID_DE_LOSS_INVARIANT', 'A DE participant played after its second loss.', {
        entryId: outcome.loserEntryId,
        matchId: match.matchId,
        losses: loserLosses,
      });
    }
  }

  const championEntryId = resolveChampion(topology.championSource, activeConditionalMatches, winners, losers);
  const finalMatches = [...resolved.values()]
    .filter(({ match }) => topology.kind === 'single_elimination'
      ? match.phase === 'upper'
      : match.phase === 'grand_final')
    .sort((left, right) => right.match.round - left.match.round || right.match.position - left.match.position);
  const final = finalMatches[0];
  if (!final || final.winnerEntryId !== championEntryId) {
    throw new SportsDomainError('BRACKET_CHAMPION_MISMATCH', 'Champion source does not match the final played match.', {
      championEntryId,
      finalMatchId: final?.match.matchId,
      finalWinnerEntryId: final?.winnerEntryId,
    });
  }
  const runnerUpEntryId = final.loserEntryId;

  let strictTwoLossInvariantSatisfied: boolean | null = null;
  if (topology.kind === 'single_elimination') {
    if ((losses.get(championEntryId) ?? 0) !== 0) {
      throw new SportsDomainError('INVALID_SE_ELIMINATION_LEDGER', 'SE champion cannot have a loss.');
    }
    for (const entryId of participants.keys()) {
      if (entryId !== championEntryId && !upperLosses.has(entryId)) {
        throw new SportsDomainError('INVALID_SE_ELIMINATION_LEDGER', 'Every non-champion needs an Upper loss.', {
          entryId,
        });
      }
    }
  } else {
    const championLosses = losses.get(championEntryId) ?? 0;
    if (championLosses > 1) {
      throw new SportsDomainError('INVALID_DE_LOSS_INVARIANT', 'DE champion can have at most one real loss.', {
        championEntryId,
        losses: championLosses,
      });
    }
    const nonChampionLosses = [...participants.keys()]
      .filter((entryId) => entryId !== championEntryId)
      .map((entryId) => losses.get(entryId) ?? 0);
    strictTwoLossInvariantSatisfied = nonChampionLosses.every((lossCount) => lossCount === 2);
    const hasReset = topology.matches.some((match) => match.conditional && match.phase === 'grand_final');
    if (hasReset && !strictTwoLossInvariantSatisfied) {
      throw new SportsDomainError(
        'INVALID_DE_LOSS_INVARIANT',
        'Reset-enabled DE must give every non-champion exactly two real losses.',
      );
    }
    for (const entryId of participants.keys()) {
      if (entryId === championEntryId || entryId === runnerUpEntryId) continue;
      if ((losses.get(entryId) ?? 0) !== 2 || !eliminations.has(entryId)) {
        throw new SportsDomainError('INVALID_DE_LOSS_INVARIANT', 'Every earlier DE elimination requires two losses.', {
          entryId,
          losses: losses.get(entryId) ?? 0,
        });
      }
    }
  }

  const placements: CompleteBracketPlacement[] = [];
  const assigned = new Set<string>();
  addExactPlacement(
    placements,
    assigned,
    championEntryId,
    1,
    participants,
    games,
    losses,
    null,
    'championship_match',
  );
  addExactPlacement(
    placements,
    assigned,
    runnerUpEntryId,
    2,
    participants,
    games,
    losses,
    final.match.matchId,
    'championship_match',
  );

  let nextPlace = 3;
  if (topology.kind === 'single_elimination') {
    const bronze = [...resolved.values()].find(({ match }) => match.phase === 'bronze');
    if (bronze) {
      addExactPlacement(
        placements,
        assigned,
        bronze.winnerEntryId,
        3,
        participants,
        games,
        losses,
        upperLosses.get(bronze.winnerEntryId)?.matchId ?? null,
        'placement_match',
      );
      addExactPlacement(
        placements,
        assigned,
        bronze.loserEntryId,
        4,
        participants,
        games,
        losses,
        bronze.match.matchId,
        'placement_match',
      );
      nextPlace = 5;
    }
    const remainingByRound = new Map<number, string[]>();
    for (const entryId of participants.keys()) {
      if (assigned.has(entryId)) continue;
      const elimination = upperLosses.get(entryId);
      if (!elimination) {
        throw new SportsDomainError('INVALID_SE_ELIMINATION_LEDGER', 'Missing elimination round.', { entryId });
      }
      eliminations.set(entryId, elimination);
      remainingByRound.set(elimination.round, [...(remainingByRound.get(elimination.round) ?? []), entryId]);
    }
    for (const round of [...remainingByRound.keys()].sort((left, right) => right - left)) {
      nextPlace = addCohort(
        placements,
        assigned,
        remainingByRound.get(round) ?? [],
        nextPlace,
        participants,
        games,
        losses,
        eliminations,
      );
    }
  } else {
    const remainingByRound = new Map<number, string[]>();
    for (const entryId of participants.keys()) {
      if (assigned.has(entryId)) continue;
      const elimination = eliminations.get(entryId);
      if (!elimination) {
        throw new SportsDomainError('INVALID_DE_LOSS_INVARIANT', 'Missing second-loss elimination event.', { entryId });
      }
      remainingByRound.set(elimination.round, [...(remainingByRound.get(elimination.round) ?? []), entryId]);
    }
    for (const round of [...remainingByRound.keys()].sort((left, right) => right - left)) {
      nextPlace = addCohort(
        placements,
        assigned,
        remainingByRound.get(round) ?? [],
        nextPlace,
        participants,
        games,
        losses,
        eliminations,
      );
    }
  }

  placements.sort((left, right) => left.place - right.place);
  if (
    placements.length !== topology.participantCount
    || placements.some((placement, index) => placement.place !== index + 1)
  ) {
    throw new SportsDomainError(
      'INCOMPLETE_FINAL_PLACEMENTS',
      'Complete placement ledger must contain every ordinal from 1 through N exactly once.',
      { participantCount: topology.participantCount, placements },
    );
  }
  return {
    championEntryId,
    runnerUpEntryId,
    placements,
    playedMatchIds: [...resolved.keys()],
    skippedConditionalMatchIds,
    resetFinalPlayed: [...activeConditionalMatches].some((matchId) => matchById.get(matchId)?.phase === 'grand_final'),
    strictTwoLossInvariantSatisfied,
  };
}
