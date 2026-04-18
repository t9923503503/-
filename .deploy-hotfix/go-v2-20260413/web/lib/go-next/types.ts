export type GoRoundType = 'r1' | 'r2';
export type GoRoundStatus = 'pending' | 'live' | 'finished';
export type GoGroupStatus = 'pending' | 'live' | 'finished';
export type GoMatchStatus = 'pending' | 'live' | 'finished';
export type GoWalkover = 'none' | 'team_a' | 'team_b' | 'mutual';
export type GoSeedingMode = 'serpentine' | 'random' | 'manual';
export type GoBracketLevel = string;
export type GoMatchPointSystem = 'fivb' | 'simple';
export type GoTieBreakerLogic = 'fivb' | 'classic';
export type GoMatchFormat = 'single15' | 'single21' | 'bo3';
export type GoInitialBucket = 'hard' | 'medium' | 'lite';
export type GoPlayoffLeague = 'lyutye' | 'hard' | 'medium' | 'lite';

export interface GoGroupFormula {
  hard: number;
  medium: number;
  lite: number;
}

export type GoBracketSizes = Partial<Record<GoPlayoffLeague, number>>;

export interface GoAdminSettings {
  courts: number;
  groupFormula: GoGroupFormula;
  groupSlotSize: number;
  matchFormat: GoMatchFormat;
  pointLimitGroup: number;
  pointLimitBracket: number;
  seedingMode: GoSeedingMode;
  slotMinutes: number;
  startTime: string;
  enabledPlayoffLeagues: GoPlayoffLeague[];
  bracketSizes: GoBracketSizes;
  bronzeMatchEnabled: boolean;
  bracketLevels: number;
  matchPointSystem: GoMatchPointSystem;
  tieBreakerLogic: GoTieBreakerLogic;
}

export interface GoTeamView {
  teamId: string;
  teamIdx: number;
  seed: number | null;
  initialBucket: GoInitialBucket;
  isBye: boolean;
  player1: { id: string; name: string };
  player2: { id: string; name: string } | null;
  ratingSnapshot: number;
  label: string;
}

export interface GoGroupStandingRow {
  teamId: string;
  teamLabel: string;
  played: number;
  wins: number;
  losses: number;
  matchPoints: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  setQuotient: number;
  pointQuotient: number;
  pointDiff: number;
  position: number;
}

export interface GoGroupView {
  groupId: string;
  groupNo: number;
  label: string;
  status: GoGroupStatus;
  effectiveTeamCount: number;
  hasBye: boolean;
  teams: GoTeamView[];
  standings: GoGroupStandingRow[];
}

export interface GoMatchView {
  matchId: string;
  matchNo: number;
  courtNo: number | null;
  teamA: GoTeamView | null;
  teamB: GoTeamView | null;
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  winnerId: string | null;
  walkover: GoWalkover;
  status: GoMatchStatus;
  scheduledAt: string | null;
  slotIndex: number | null;
  groupLabel: string | null;
  bracketLevel: string | null;
  bracketRound: number | null;
}

export interface GoBracketSlotView {
  slotId: string;
  bracketLevel: string;
  bracketRound: number;
  position: number;
  team: GoTeamView | null;
  isBye: boolean;
  nextSlotId: string | null;
  matchId: string | null;
}

export type GoOperatorActionName =
  | 'bootstrap_groups'
  | 'start_group_stage'
  | 'mass_walkover_group'
  | 'finish_group_stage'
  | 'preview_bracket_seed'
  | 'confirm_bracket_seed'
  | 'bootstrap_bracket'
  | 'rollback_stage'
  | 'finish_bracket';

export type GoOperatorStage =
  | 'setup'
  | 'groups_ready'
  | 'groups_live'
  | 'groups_finished'
  | 'bracket_preview'
  | 'bracket_ready'
  | 'bracket_live'
  | 'finished';

export interface GoOperatorState {
  tournamentId: string;
  stage: GoOperatorStage;
  r1: { roundId: string; status: GoRoundStatus } | null;
  r2: { roundId: string; status: GoRoundStatus } | null;
  groups: GoGroupView[];
  bracketLevels: string[];
  courts: { courtNo: number; label: string; pinCode: string }[];
  settings: GoAdminSettings;
}

export interface GoJudgeMatchView {
  matchId: string;
  matchNo: number;
  teamA: { label: string };
  teamB: { label: string };
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  status: GoMatchStatus;
  context: string;
}

export interface GoJudgeCourtView {
  courtNo: number;
  label: string;
  matches: GoJudgeMatchView[];
  currentMatchId: string | null;
}

export interface GoJudgeSnapshot {
  tournamentId: string;
  courts: GoJudgeCourtView[];
  currentCourt: number;
}

export interface GoSpectatorPayload {
  tournamentId: string;
  tournamentName: string;
  stage: GoOperatorStage;
  groups: GoGroupView[];
  brackets: Record<string, GoBracketSlotView[]>;
  liveMatches: GoMatchView[];
}

export interface GoLeaderboardRow {
  teamId: string;
  teamLabel: string;
  league: GoPlayoffLeague | 'groups';
  place: number;
  wins: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  seed: number | null;
  awardedRatingPoints: number;
}

export interface SeedableTeam {
  teamId: string;
  rating: number;
}

export interface GoMatchResult {
  matchId: string;
  teamAId: string;
  teamBId: string;
  setsA: number;
  setsB: number;
  scoreA: number[];
  scoreB: number[];
  walkover: GoWalkover;
}
