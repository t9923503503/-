export type TeamId = 'A' | 'B';
export type MatchFormat = 'single21' | 'single15' | 'bo3' | 'custom';
export type MatchStatus = 'setup' | 'set_setup' | 'playing' | 'finished';
export type DivisionType = 'MM' | 'WW' | 'MIX';

export interface TeamPlayer {
  id: string;
  name: string;
}

export interface QueueMatch {
  id: string;
  title: string;
  teamA: string;
  teamB: string;
  groupLabel: string;
  courtId: string;
  teamAPlayers?: TeamPlayer[];
  teamBPlayers?: TeamPlayer[];
}

export interface ServeTeamState {
  order: TeamPlayer[];
  currentIndex: number;
  nextIndex: number;
}

export interface MatchScoreSnapshot {
  A: number;
  B: number;
}

export interface MatchEventPlayerRef {
  id: string;
  name: string;
  position: number;
}

export interface MatchEvent {
  id: string;
  type:
    | 'rally'
    | 'correction'
    | 'switch_serve'
    | 'timeout'
    | 'disputed_ball'
    | 'end_set'
    | 'undo'
    | 'serve_setup'
    | 'swap_sides';
  team?: TeamId;
  timestamp: number;
  note?: string;
  setNumber?: number;
  scoreBefore?: MatchScoreSnapshot;
  scoreAfter?: MatchScoreSnapshot;
  scoringTeam?: TeamId | null;
  servingTeamBefore?: TeamId | null;
  serverPlayerBefore?: MatchEventPlayerRef | null;
  servingTeamAfter?: TeamId | null;
  serverPlayerAfter?: MatchEventPlayerRef | null;
  isSideOut?: boolean;
}

export interface MatchMeta {
  courtId: string;
  matchName: string;
  judgeName: string;
  groupLabel: string;
  queueMatches: QueueMatch[];
}

export interface MatchConfig {
  format: MatchFormat;
  targetMain: number;
  targetDecider: number;
  winByTwo: boolean;
  setsToWin: 1 | 2;
  timeoutsPerTeam: 0 | 1 | 2;
  timeoutDurationSec: 30 | 45 | 60;
  lockScoreDuringTimeout: boolean;
  autoServeOnPoint: boolean;
  timerModeMinutes: 0 | 6 | 9 | 10 | 15;
  division: DivisionType;
}

export interface MatchCore {
  teamA: string;
  teamB: string;
  teamAPlayers: TeamPlayer[];
  teamBPlayers: TeamPlayer[];
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  currentSet: number;
  servingTeam: TeamId | null;
  serveState: Record<TeamId, ServeTeamState>;
  leftTeam: TeamId;
  status: MatchStatus;
  winner: TeamId | null;
  sidesSwappedCount: number;
  lastSideSwapTotal: number;
  pendingSideSwap: boolean;
  timeoutAUsed: number;
  timeoutBUsed: number;
  timeoutActiveFor: TeamId | null;
  timeoutEndsAt: number | null;
  lastActionAt: number;
  warning: string | null;
}

export interface MatchState {
  meta: MatchMeta;
  config: MatchConfig;
  core: MatchCore;
  history: MatchCore[];
  events: MatchEvent[];
}

export interface Preset {
  id: Exclude<MatchFormat, 'custom'>;
  title: string;
  subtitle: string;
  tone: 'green' | 'yellow' | 'red';
  config: MatchConfig;
}
