export interface KingRoundProgress {
  id: string;
  pairs: Array<{ points: number }>;
}

export type PlayLiveResultFormat = 'classic_2x2' | 'thai_8' | 'king_sideout';

export interface PlayLiveMatch {
  id: string;
  teamA: number[];
  teamB: number[];
  scoreA: number;
  scoreB: number;
  pointLimit?: number;
  tourNumber?: number;
}

export interface PlayLiveKingPair {
  pairIndex: number;
  team: number[];
  points: number;
}

export interface PlayLiveKingRound extends KingRoundProgress {
  roundNumber: number;
  pairs: PlayLiveKingPair[];
}

export interface PlayLiveHistorySnapshot {
  matches: PlayLiveMatch[];
  rounds: PlayLiveKingRound[];
  roster: number[];
  activeRoster: number[];
  completedRoundIds: string[];
}

export interface PlayLiveState {
  format: PlayLiveResultFormat;
  pairingMode: 'fixed' | 'random';
  pointLimit: number;
  roundDurationMinutes: number;
  roster: number[];
  activeRoster: number[];
  startedAt: string;
  matches: PlayLiveMatch[];
  rounds: PlayLiveKingRound[];
  /** Explicit operator confirmation prevents KING from advancing after the first scored pair. */
  completedRoundIds: string[];
  history: PlayLiveHistorySnapshot[];
}

export interface PlayLiveSessionView {
  id: string;
  postId: string;
  status: 'active' | 'completed' | 'cancelled';
  revision: number;
  state: PlayLiveState;
  updatedAt: string;
}

export type PlayLiveCommand =
  | { type: 'set_match_score'; matchId: string; winner: 'A' | 'B'; loserPoints: number }
  | { type: 'set_match_teams'; matchId: string; teamA: number[]; teamB: number[] }
  | { type: 'set_match_point_limit'; matchId: string; pointLimit: 11 | 15 | 21 }
  | { type: 'set_player_active'; resultKey: number; active: boolean }
  | { type: 'sync_roster'; roster?: number[] }
  | { type: 'set_pair_points'; roundId: string; pairIndex: number; points: number }
  | { type: 'complete_king_round'; roundId: string }
  | { type: 'add_set'; teamA?: number[]; teamB?: number[]; pointLimit?: 11 | 15 | 21 }
  | { type: 'undo' };

export function getCurrentKingRound<T extends KingRoundProgress>(state: {
  rounds: T[];
  completedRoundIds?: string[];
}): T | null {
  const completed = new Set(state.completedRoundIds ?? []);
  return state.rounds.find((round) => !completed.has(round.id)) ?? null;
}

export function canCompleteKingRound(round: KingRoundProgress): boolean {
  return round.pairs.some((pair) => pair.points > 0);
}

function teammateKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

/** Chooses one of the three possible 2×2 splits with the fewest live teammate repeats. */
export function chooseFreshLiveTeams(
  selectedResultKeys: number[],
  matches: Array<Pick<PlayLiveMatch, 'teamA' | 'teamB'>>,
): { teamA: number[]; teamB: number[] } | null {
  const ids = [...new Set(selectedResultKeys)];
  if (ids.length !== 4) return null;
  const [a, b, c, d] = ids;
  const options = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
  const appearances = new Map<string, number>();
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      if (team.length !== 2) continue;
      const key = teammateKey(team[0], team[1]);
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
  }
  return options.reduce((best, option) => {
    const score = (appearances.get(teammateKey(option.teamA[0], option.teamA[1])) ?? 0)
      + (appearances.get(teammateKey(option.teamB[0], option.teamB[1])) ?? 0);
    return score < best.score ? { option, score } : best;
  }, { option: options[0], score: Number.POSITIVE_INFINITY }).option;
}
