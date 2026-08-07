// KOTC Next вЂ” shared type definitions
// Mirrors Thai Next structure but for King-of-the-Court mechanics

import type { KotcR2SeedingMode, KotcTakeoversMode } from '@/lib/admin-legacy-sync';

export type KotcNextVariant = 'MF' | 'MM' | 'WW' | 'MN';
export type KotcNextTakeoversMode = KotcTakeoversMode;
export type KotcNextRoundType = 'r1' | 'r2';
export type KotcNextRoundStatus = 'pending' | 'live' | 'finished';
export type KotcNextCourtStatus = 'pending' | 'live' | 'finished';
export type KotcNextRaundStatus = 'pending' | 'running' | 'paused' | 'finished';
export type KotcNextRaundDisplayStatus = KotcNextRaundStatus | 'countdown';
export type KotcNextZoneKey = 'kin' | 'advance' | 'medium' | 'lite';
export type KotcNextOperatorStage =
  | 'setup'
  | 'r1_live'
  | 'r1_finished'
  | 'r2_live'
  | 'r2_finished';

export type KotcNextOperatorActionName =
  | 'bootstrap_r1'
  | 'finish_r1'
  | 'preview_r2_seed'
  | 'confirm_r2_seed'
  | 'preview_manual_r2'
  | 'confirm_manual_r2'
  | 'bootstrap_r2'
  | 'finish_r2'
  | 'close_tournament'
  | 'reset_r2'
  | 'adjust_r1_pair_score'
  | 'adjust_r2_pair_score';

// в”Ђв”Ђв”Ђ Judge params (tournament-level config) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextJudgeParams {
  variant: KotcNextVariant;
  courts: number;      // 1вЂ“4
  ppc: number;         // pairs per court (3вЂ“5)
  raundCount: number;  // rounds per tour, always equals pairs per court
  raundTimerMinutes: number; // 9вЂ“20
  takeoversMode: KotcNextTakeoversMode;
  r2SeedingMode: KotcR2SeedingMode;
}

// в”Ђв”Ђв”Ђ Pair (fixed for the duration of a round) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextPairView {
  pairIdx: number;
  primaryPlayer: { id: string; name: string } | null;
  secondaryPlayer: { id: string; name: string } | null;
  label: string; // e.g. "РРІР°РЅРѕРІ / РЎР°Р±Р°РЅС†РµРІР°"
}

// в”Ђв”Ђв”Ђ Live state (per raund, returned by API after each game event) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextPairLiveState {
  pairIdx: number;
  kingWins: number;    // points scored while on throne
  takeovers: number;   // times this pair captured the throne (tiebreak)
  gamesPlayed: number;
  longestKingRun?: number;             // longest consecutive king-side scoring run
  firstLongestKingRunOrder?: number | null; // lower wins when longestKingRun is tied
}

export interface KotcNextCourtLiveState {
  currentRaundNo: number;
  kingPairIdx: number;
  challengerPairIdx: number;
  queueOrder: number[];            // remaining pair indices (front = next up)
  pairs: KotcNextPairLiveState[];
  timerStartedAt: string | null;   // ISO timestamp
  timerPausedAt: string | null;
  timerAccumulatedPauseMs: number;
  pausedPhase: 'countdown' | 'running' | null;
  lastStatusChangedAt: string | null;
  timerControlledBy: 'judge' | 'operator' | 'admin' | 'system' | null;
  revision: number;
  timerMinutes: number;
  status: KotcNextRaundStatus;
  displayStatus: KotcNextRaundDisplayStatus;
}

// в”Ђв”Ђв”Ђ Game event (one entry in kotcn_game) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextGameEvent {
  id: string;
  seqNo: number;
  eventType: 'king_point' | 'takeover';
  kingPairIdx: number;
  challengerPairIdx: number;
  playedAt: string;
}

// в”Ђв”Ђв”Ђ Judge snapshot (returned to judge UI) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextRaundHistoryEntry {
  raundNo: number;
  status: KotcNextRaundStatus;
  standings: KotcNextPairLiveState[];
}

export interface KotcNextJudgeCourtNavItem {
  courtId: string | null;
  courtNo: number;
  label: string;
  judgeUrl: string | null;
  isSelected: boolean;
  isAvailable: boolean;
}

export interface KotcNextJudgeRoundNavItem {
  roundId: string | null;
  roundNo: number;
  roundType: KotcNextRoundType;
  label: string;
  isSelected: boolean;
  isAvailable: boolean;
  courts: KotcNextJudgeCourtNavItem[];
}

export interface KotcNextJudgeAggregatePairStanding {
  position: number;
  courtNo: number;
  courtLabel: string;
  zone: KotcNextZoneKey | null;
  zoneLabel: string | null;
  pairIdx: number;
  pairLabel: string;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun: number;
  firstLongestKingRunOrder: number | null;
}

export interface KotcNextJudgeAggregatePlayerStanding {
  position: number;
  courtNo: number;
  courtLabel: string;
  zone: KotcNextZoneKey | null;
  zoneLabel: string | null;
  playerId: string | null;
  playerName: string;
  gender: 'M' | 'W' | null;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun: number;
  firstLongestKingRunOrder: number | null;
}

export interface KotcNextJudgeAggregateStandings {
  pairs: KotcNextJudgeAggregatePairStanding[];
  men: KotcNextJudgeAggregatePlayerStanding[];
  women: KotcNextJudgeAggregatePlayerStanding[];
}

export interface KotcNextJudgeSnapshot {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: KotcNextVariant;
  params: KotcNextJudgeParams;
  roundType: KotcNextRoundType;
  roundId: string;
  courtId: string;
  courtNo: number;
  courtLabel: string;
  pinCode: string;
  pairs: KotcNextPairView[];
  liveState: KotcNextCourtLiveState;
  aggregateStandings: KotcNextJudgeAggregateStandings;
  roundNav: KotcNextJudgeRoundNavItem[];
  courtNav: KotcNextJudgeCourtNavItem[];
  raundHistory: KotcNextRaundHistoryEntry[];
  selectedRaundNo: number;
  currentEvents: KotcNextGameEvent[];
  currentRaundInstanceKey: string;
  currentRaundRevision: number;
  canUndo: boolean; // true if there is at least one game event to undo
}

// в”Ђв”Ђв”Ђ Operator state (returned to operator/sudyam UI) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextCourtRaundProgress {
  raundNo: number;
  status: KotcNextRaundStatus;
  startedAt: string | null;
  finishedAt: string | null;
  pausedAt: string | null;
  accumulatedPauseMs: number;
  displayStatus: KotcNextRaundDisplayStatus;
  revision: number;
  standings: KotcNextPairLiveState[] | null;
  canAdminForceFinish: boolean;
}

export interface KotcNextCourtOperatorView {
  courtId: string;
  courtNo: number;
  label: string;
  pinCode: string;
  judgeUrl: string;
  status: KotcNextCourtStatus;
  pairs: KotcNextPairView[];
  raunds: KotcNextCourtRaundProgress[];
  currentRaundNo: number | null;
  liveState: KotcNextCourtLiveState | null;
}

export interface KotcNextOperatorRoundView {
  roundId: string;
  roundNo: number;
  roundType: KotcNextRoundType;
  status: KotcNextRoundStatus;
  courts: KotcNextCourtOperatorView[];
}

export type KotcNextSpectatorCourtView = Omit<KotcNextCourtOperatorView, 'pinCode' | 'judgeUrl'>;

export interface KotcNextSpectatorRoundView {
  roundId: string;
  roundNo: number;
  roundType: KotcNextRoundType;
  status: KotcNextRoundStatus;
  courts: KotcNextSpectatorCourtView[];
}

export interface KotcNextR2SeedZone {
  zone: KotcNextZoneKey;
  pairRefs: Array<{
    courtNo: number;
    pairIdx: number;
    pairLabel: string;
    kingWins: number;
    takeovers: number;
    longestKingRun?: number;
    firstLongestKingRunOrder?: number | null;
    primaryPlayerId?: string | null;
    primaryPlayerName?: string;
    primaryGender?: 'M' | 'W' | null;
    secondaryPlayerId?: string | null;
    secondaryPlayerName?: string;
    secondaryGender?: 'M' | 'W' | null;
  }>;
}

export interface KotcNextR2ManualPlayerRef {
  playerId: string | null;
  playerName: string;
  gender: 'M' | 'W' | null;
  sourceCourtNo: number;
  sourcePairIdx: number;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun?: number;
  firstLongestKingRunOrder?: number | null;
  position: number;
}

export interface KotcNextR2ManualZone {
  zone: KotcNextZoneKey;
  players: KotcNextR2ManualPlayerRef[];
}

export interface KotcNextOperatorState {
  controlRevision: number;
  serverNow: number;
  stage: KotcNextOperatorStage;
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: KotcNextVariant;
  params: KotcNextJudgeParams;
  rounds: KotcNextOperatorRoundView[];
  r2SeedDraft: KotcNextR2SeedZone[] | null;
  manualR2Draft: KotcNextR2ManualZone[] | null;
  finalResults: KotcNextFinalZoneResult[] | null;
  finalIndividualResults: KotcNextFinalIndividualResult[] | null;
  // permission flags
  canBootstrapR1: boolean;
  canFinishR1: boolean;
  canPreviewR2Seed: boolean;
  canConfirmR2Seed: boolean;
  canPreviewManualR2: boolean;
  canConfirmManualR2: boolean;
  canBootstrapR2: boolean;
  canFinishR2: boolean;
  canResetR2: boolean;
  canAdjustR2PairScore: boolean;
}

export type KotcNextControlAction =
  | 'start_raund'
  | 'pause_raund'
  | 'resume_raund'
  | 'finish_raund'
  | 'force_finish_court'
  | 'force_finish_all'
  | 'correct_score'
  | 'correct_positions'
  | 'set_remaining_time'
  | 'revert_correction'
  | 'rollback_r2';

export interface KotcNextControlActor {
  kind: 'judge' | 'operator' | 'admin' | 'system';
  id?: string | null;
}

export interface KotcNextControlCommandInput {
  commandId: string;
  action: KotcNextControlAction;
  roundNo?: number;
  raundNo?: number;
  courtNo?: number;
  expectedRevision?: number | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
}

export interface KotcNextControlEvent {
  id: string;
  commandId: string | null;
  eventType: string;
  actorKind: KotcNextControlActor['kind'];
  actorId: string | null;
  reason: string | null;
  roundNo: number | null;
  courtNo: number | null;
  raundNo: number | null;
  payload: Record<string, unknown>;
  revisionBefore: number | null;
  revisionAfter: number | null;
  revertedEventId: string | null;
  createdAt: string;
}

export interface KotcNextControlCommandResult {
  success: true;
  action: KotcNextControlAction;
  state: KotcNextOperatorState;
  event: KotcNextControlEvent | null;
  idempotent: boolean;
  serverNow: number;
}

// в”Ђв”Ђв”Ђ Final results в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextFinalZoneResult {
  zone: KotcNextZoneKey;
  zoneLabel: string; // 'РљРРќ' | 'РђР”РђРќРЎ' | 'РњР•Р”РРЈРњ' | 'Р›РђР™Рў'
  pairs: Array<{
    position: number;
    pairLabel: string;
    primaryPlayerId: string | null;
    primaryPlayerName: string;
    primaryGender: 'M' | 'W' | null;
    secondaryPlayerId: string | null;
    secondaryPlayerName: string;
    secondaryGender: 'M' | 'W' | null;
    kingWins: number;
    takeovers: number;
    longestKingRun?: number;
    firstLongestKingRunOrder?: number | null;
  }>;
}

export interface KotcNextFinalIndividualRoundResult {
  courtNo: number;
  courtLabel: string;
  zone: KotcNextZoneKey | null;
  zoneLabel: string | null;
  position: number;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun: number;
  firstLongestKingRunOrder: number | null;
}

export interface KotcNextFinalIndividualResult {
  playerId: string | null;
  playerName: string;
  gender: 'M' | 'W' | null;
  finalZone: KotcNextZoneKey;
  finalZoneLabel: string;
  finalPosition: number;
  finalPairLabel: string;
  r1: KotcNextFinalIndividualRoundResult | null;
  r2: KotcNextFinalIndividualRoundResult | null;
  totalKingWins: number;
  totalTakeovers: number;
  totalGamesPlayed: number;
  totalLongestKingRun: number;
  firstTotalLongestKingRunOrder: number | null;
}

// в”Ђв”Ђв”Ђ Spectator board payload в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface KotcNextFunStats {
  kingslayer: { pairLabel: string; takeovers: number } | null;      // max takeovers
  stoneWall: { pairLabel: string; ratio: number } | null;           // best kingWins/takeovers
  longestReign: { pairLabel: string; consecutiveWins: number } | null;
}

export interface KotcNextSpectatorPayload
  extends Omit<
    KotcNextOperatorState,
    | 'canBootstrapR1' | 'canFinishR1' | 'canPreviewR2Seed'
    | 'canConfirmR2Seed' | 'canBootstrapR2' | 'canFinishR2'
    | 'r2SeedDraft' | 'rounds'
  > {
  rounds: KotcNextSpectatorRoundView[];
  funStats: KotcNextFunStats | null;
  viewSource: 'live' | 'snapshot';
  snapshotCapturedAt: string | null;
}
