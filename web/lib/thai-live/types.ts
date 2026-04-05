export type ThaiRoundType = 'r1' | 'r2';
export type ThaiRoundStatus = 'pending' | 'live' | 'finished';
export type ThaiCourtStatus = 'ready' | 'live' | 'finished';
export type ThaiTourStatus = 'pending' | 'confirmed';
export type ThaiMatchStatus = 'pending' | 'confirmed';
export type ThaiPlayerRole = 'primary' | 'secondary';
export type ThaiStandingsPoolKey = 'all' | ThaiPlayerRole;
export type ThaiJudgeViewKind = 'active' | 'finished';
export type ThaiOperatorStage = 'setup' | 'r1_live' | 'r1_finished' | 'r2_live' | 'r2_finished';
export type ThaiZoneKey = 'hard' | 'advance' | 'medium' | 'light';
export type ThaiOperatorActionName =
  | 'preview_draw'
  | 'reshuffle_r1'
  | 'finish_r1'
  | 'preview_r2_seed'
  | 'confirm_r2_seed'
  | 'seed_r2'
  | 'finish_r2';

export interface ThaiJudgePlayerView {
  id: string;
  name: string;
  role: ThaiPlayerRole;
}

export interface ThaiJudgeTeamView {
  side: 1 | 2;
  label: string;
  players: ThaiJudgePlayerView[];
}

export interface ThaiJudgeMatchView {
  matchId: string;
  matchNo: number;
  status: ThaiMatchStatus;
  team1Score: number | null;
  team2Score: number | null;
  team1: ThaiJudgeTeamView;
  team2: ThaiJudgeTeamView;
}

export interface ThaiJudgeTourView {
  tourId: string;
  tourNo: number;
  status: ThaiTourStatus;
  isEditable: boolean;
  matches: ThaiJudgeMatchView[];
}

export interface ThaiJudgeCourtNavItem {
  courtId: string;
  courtNo: number;
  label: string;
  pin: string;
  judgeUrl: string;
  isActive: boolean;
  currentTourStatus: ThaiTourStatus | 'finished';
}

export interface ThaiJudgeRoundNavItem {
  roundNo: number;
  roundType: ThaiRoundType;
  label: string;
  courtLabel: string | null;
  status: ThaiRoundStatus | 'pending';
  judgeUrl: string | null;
  isActive: boolean;
  isAvailable: boolean;
}

export interface ThaiJudgeSnapshot {
  kind: ThaiJudgeViewKind;
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: string;
  pointLimit: number;
  roundId: string;
  roundNo: number;
  roundType: ThaiRoundType;
  roundStatus: ThaiRoundStatus;
  tourCount: number;
  currentTourNo: number;
  courtId: string;
  courtLabel: string;
  courtNo: number;
  pin: string;
  tourId: string | null;
  tourNo: number | null;
  tourStatus: ThaiTourStatus | null;
  pendingCourtCount: number;
  message: string;
  roundNav: ThaiJudgeRoundNavItem[];
  courtNav: ThaiJudgeCourtNavItem[];
  tours: ThaiJudgeTourView[];
  matches: ThaiJudgeMatchView[];
  standingsGroups: ThaiStandingsGroup[];
}

export interface ThaiJudgeCourtSummary {
  courtId: string;
  courtNo: number;
  label: string;
  pin: string;
  judgeUrl: string;
  currentTourNo: number;
  currentTourStatus: ThaiTourStatus | 'finished';
  playerNames: string[];
}

export interface ThaiJudgeStateSummary {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: string;
  pointLimit: number;
  roundId: string;
  roundNo: number;
  roundType: ThaiRoundType;
  roundStatus: ThaiRoundStatus;
  currentTourNo: number;
  tourCount: number;
  courtCount: number;
  courts: ThaiJudgeCourtSummary[];
}

export interface ThaiJudgeTournamentCourtTabItem {
  courtId: string | null;
  courtNo: number;
  label: string;
  pin: string | null;
  judgeUrl: string | null;
  currentTourNo: number | null;
  currentTourStatus: ThaiTourStatus | 'finished' | 'soon';
  isSelected: boolean;
  isAvailable: boolean;
}

export interface ThaiJudgeTournamentRoundItem {
  roundId: string | null;
  roundNo: number;
  roundType: ThaiRoundType;
  label: string;
  status: ThaiRoundStatus | 'pending';
  isSelected: boolean;
  isAvailable: boolean;
  courts: ThaiJudgeTournamentCourtTabItem[];
}

export interface ThaiJudgeTournamentSnapshot {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: string;
  pointLimit: number;
  selectedRoundType: ThaiRoundType;
  selectedCourtNo: number;
  rounds: ThaiJudgeTournamentRoundItem[];
  activeSnapshot: ThaiJudgeSnapshot;
}

export interface ThaiJudgeConfirmPayload {
  matches: Array<{
    matchId: string;
    team1Score: number;
    team2Score: number;
  }>;
}

export interface ThaiJudgeConfirmResult {
  success: true;
  message: string;
  nextTourNumber?: number;
  roundFinished?: boolean;
  snapshot: ThaiJudgeSnapshot;
}

export interface ThaiBootstrapCourtPlayer {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
}

export interface ThaiDrawPreviewPlayer extends ThaiBootstrapCourtPlayer {
  role: ThaiPlayerRole;
}

export interface ThaiDrawPreviewCourt {
  courtNo: number;
  courtLabel: string;
  players: ThaiDrawPreviewPlayer[];
}

export interface ThaiDrawPreview {
  tournamentId: string;
  tournamentName: string;
  variant: string;
  seed: number;
  courts: ThaiDrawPreviewCourt[];
}

export interface ThaiBootstrapTeam {
  players: Array<{
    playerId: string;
    playerName: string;
    role: ThaiPlayerRole;
  }>;
}

export interface ThaiBootstrapTour {
  tourNo: number;
  matches: Array<{
    matchNo: number;
    team1: ThaiBootstrapTeam;
    team2: ThaiBootstrapTeam;
  }>;
}

export interface ThaiStatTotals {
  totalDiff: number;
  totalScored: number;
  pointsP: number;
  wins: number;
  kef: number;
}

export interface ThaiStandingsRow {
  playerId: string;
  playerName: string;
  role: ThaiPlayerRole;
  pool: ThaiStandingsPoolKey;
  poolLabel: string;
  place: number;
  tourDiffs: number[];
  totalDiff: number;
  pointsP: number;
  kef: number;
  totalScored: number;
  wins: number;
}

export interface ThaiStandingsGroup {
  pool: ThaiStandingsPoolKey;
  label: string;
  rows: ThaiStandingsRow[];
}

export interface ThaiOperatorTourMatchSummary {
  matchId: string;
  matchNo: number;
  team1Label: string;
  team2Label: string;
  team1Score: number | null;
  team2Score: number | null;
  status: ThaiMatchStatus;
}

export interface ThaiOperatorTourSummary {
  tourId: string;
  tourNo: number;
  status: ThaiTourStatus;
  matches: ThaiOperatorTourMatchSummary[];
}

export interface ThaiOperatorCourtRoundView {
  courtId: string;
  courtNo: number;
  label: string;
  pin: string;
  judgeUrl: string;
  currentTourNo: number;
  currentTourStatus: ThaiTourStatus | 'finished';
  playerNames: string[];
  tours: ThaiOperatorTourSummary[];
  standingsGroups: ThaiStandingsGroup[];
}

export interface ThaiOperatorZoneSummary {
  zone: ThaiZoneKey;
  label: string;
  courtId: string;
  courtNo: number;
  courtLabel: string;
  pin: string;
  judgeUrl: string;
  playerNames: string[];
}

export interface ThaiOperatorRoundView {
  roundId: string;
  roundNo: number;
  roundType: ThaiRoundType;
  roundStatus: ThaiRoundStatus;
  currentTourNo: number;
  tourCount: number;
  courts: ThaiOperatorCourtRoundView[];
  zones: ThaiOperatorZoneSummary[];
}

export interface ThaiOperatorFinalZoneResult {
  zone: ThaiZoneKey;
  label: string;
  winners: ThaiStandingsRow[];
  top4: ThaiStandingsRow[];
}

export interface ThaiOperatorProgressRow {
  playerId: string;
  playerName: string;
  role: ThaiPlayerRole;
  poolLabel: string;
  r1Place: number | null;
  r2Place: number | null;
}

export interface ThaiOperatorStateSummary {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: string;
  /** Дублирует R1 для обратной совместимости клиентов. */
  pointLimit: number;
  pointLimitR1: number;
  pointLimitR2: number;
  tourCount: number;
  stage: ThaiOperatorStage;
  rosterTotal: number;
  rosterPrimaryCount: number;
  rosterSecondaryCount: number;
  canBootstrap: boolean;
  canReshuffleR1: boolean;
  canFinishR1: boolean;
  canSeedR2: boolean;
  canFinishR2: boolean;
  rounds: ThaiOperatorRoundView[];
  finalResults: ThaiOperatorFinalZoneResult[];
  progress: ThaiOperatorProgressRow[];
}

export interface ThaiR2SeedPlayer {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  role: ThaiPlayerRole;
  poolLabel: string;
  sourceCourtLabel: string;
  sourcePlace: number;
}

export interface ThaiR2SeedZone {
  zone: ThaiZoneKey;
  label: string;
  courtNo: number;
  players: ThaiR2SeedPlayer[];
}

export interface ThaiR2SeedDraft {
  tournamentId: string;
  tournamentName: string;
  variant: string;
  zones: ThaiR2SeedZone[];
}

export interface ThaiOperatorActionResult {
  success: true;
  state: ThaiOperatorStateSummary;
  judgeState: ThaiJudgeStateSummary | null;
  preview?: ThaiDrawPreview;
  r2SeedDraft?: ThaiR2SeedDraft;
}
