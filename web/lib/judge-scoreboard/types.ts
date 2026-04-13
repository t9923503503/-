export type TeamId = 'A' | 'B';
export type MatchFormat = 'single21' | 'single15' | 'bo3' | 'custom';
export type MatchStatus = 'setup' | 'playing' | 'finished';

export interface MatchMeta {
  courtId: string;
  matchName: string;
  judgeName: string;
}

export interface MatchConfig {
  format: MatchFormat;
  targetMain: number;
  targetDecider: number;
  winByTwo: true;
  setsToWin: 1 | 2;
}

export interface MatchCore {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  currentSet: number;
  server: TeamId;
  leftTeam: TeamId;
  status: MatchStatus;
  winner: TeamId | null;
  sidesSwappedCount: number;
  lastSideSwapTotal: number;
  pendingSideSwap: boolean;
}

export interface MatchState {
  meta: MatchMeta;
  config: MatchConfig;
  core: MatchCore;
  history: MatchCore[];
}

export interface Preset {
  id: Exclude<MatchFormat, 'custom'>;
  title: string;
  subtitle: string;
  tone: 'green' | 'yellow' | 'red';
  config: MatchConfig;
}
