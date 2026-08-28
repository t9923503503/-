export type RrDivision = 'male' | 'female' | 'mixed';

export type RrMatchFormatCode =
  | 'single11'
  | 'single15'
  | 'single21'
  | 'bo3_21_15'
  | 'timed';

export type RrTournamentStage =
  | 'setup'
  | 'groups_ready'
  | 'groups_live'
  | 'groups_finished'
  | 'playoff_preview'
  | 'playoff_ready'
  | 'playoff_live'
  | 'finished';

export type RrMatchStatus =
  | 'scheduled'
  | 'ready'
  | 'live'
  | 'paused'
  | 'finished'
  | 'forfeit'
  | 'cancelled';

export type RrPlayoffMode = 'championship' | 'all_levels';
export type RrSeedingMode = 'serpentine' | 'random' | 'manual';
export type RrScoringMode = 'referee' | 'quick';
export type RrJudgeActionName =
  | 'start'
  | 'pause'
  | 'resume'
  | 'point_a'
  | 'point_b'
  | 'undo'
  | 'serve_a'
  | 'serve_b'
  | 'timer_start'
  | 'timer_pause'
  | 'quick_result'
  | 'finish_match'
  | 'forfeit_a'
  | 'forfeit_b'
  | 'correct_score'
  | 'reopen';

export type RrOperatorActionName =
  | 'initialize'
  | 'start_groups'
  | 'finish_groups'
  | 'preview_playoff'
  | 'confirm_playoff'
  | 'start_playoff'
  | 'finish_tournament'
  | 'rollback_stage'
  | 'judge_action';

export interface RrMatchFormat {
  code: RrMatchFormatCode;
  durationMinutes?: number;
  scoringMode?: RrScoringMode;
}

export interface RrAvailablePlayer {
  id: string;
  name: string;
  gender: 'M' | 'W';
  rating: number;
  position: number;
}

export interface RrTeam {
  id: string;
  teamNo: number;
  seed: number;
  groupId: string | null;
  player1: RrAvailablePlayer;
  player2: RrAvailablePlayer;
  rating: number;
  confirmed: boolean;
  finalPlacement: number | null;
  manualRank: number | null;
}

export interface RrGroup {
  id: string;
  groupNo: number;
  label: string;
  status: 'ready' | 'live' | 'finished';
  teamIds: string[];
}

export interface RrCourt {
  id: string;
  courtNo: number;
  label: string;
}

export interface RrMatch {
  id: string;
  stageType: 'group' | 'playoff';
  groupId: string | null;
  bracketLevel: string | null;
  bracketRound: string | null;
  roundNo: number;
  matchNo: number;
  scheduleSlot: number;
  courtNo: number | null;
  teamAId: string | null;
  teamBId: string | null;
  format: RrMatchFormat;
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  serving: 'a' | 'b' | null;
  timerRemainingSec: number | null;
  timerRunning: boolean;
  winnerId: string | null;
  forfeitSide: 'a' | 'b' | null;
  status: RrMatchStatus;
  version: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RrStandingRow {
  groupId: string;
  teamId: string;
  position: number;
  played: number;
  wins: number;
  losses: number;
  matchPoints: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  pointQuotient: number;
  tiebreakNote: string | null;
  seed: number;
  manualRank: number | null;
}

export interface RrPlayoffLevelPreview {
  key: 'championship' | 'hard' | 'medium' | 'lite';
  label: string;
  bracketSize: 4 | 8;
  teamIds: string[];
  firstRoundPairs?: Array<[string | null, string | null]>;
}

export interface RrPlayoffPreview {
  mode: RrPlayoffMode;
  levels: RrPlayoffLevelPreview[];
}

export interface RrConfig {
  playoffMode: RrPlayoffMode;
  seedingMode: RrSeedingMode;
  groupCount: number;
  courtCount: number;
  groupMatchFormat: RrMatchFormat;
  playoffMatchFormat: RrMatchFormat;
}

export interface RrJudgeSnapshot {
  initialized: boolean;
  tournament: {
    id: string;
    name: string;
    date: string;
    time: string;
    location: string;
    division: RrDivision;
    level: string;
    status: string;
  };
  stage: RrTournamentStage;
  version: number;
  config: RrConfig;
  availablePlayers: RrAvailablePlayer[];
  teams: RrTeam[];
  groups: RrGroup[];
  courts: RrCourt[];
  matches: RrMatch[];
  standings: RrStandingRow[];
  playoffPreview: RrPlayoffPreview | null;
  generatedAt: string;
}

export interface RrInitializeInput {
  groupCount: number;
  courtCount: number;
  playoffMode: RrPlayoffMode;
  seedingMode: RrSeedingMode;
  groupMatchFormat: RrMatchFormat;
  playoffMatchFormat: RrMatchFormat;
  teams: Array<{ player1Id: string; player2Id: string }>;
  manualGroups?: string[][];
  randomSeed?: number;
}

export interface RrJudgeActionInput {
  tournamentId: string;
  matchId: string;
  action: RrJudgeActionName;
  clientEventId: string;
  expectedVersion: number;
  payload?: Record<string, unknown>;
}

export interface RrQueuedJudgeEvent extends RrJudgeActionInput {
  queuedAt: string;
}
