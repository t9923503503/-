// KOTC Next — shared type definitions
// Mirrors Thai Next structure but for King-of-the-Court mechanics

export type KotcNextVariant = 'MF' | 'MM' | 'WW' | 'MN';
export type KotcNextRoundType = 'r1' | 'r2';
export type KotcNextRoundStatus = 'pending' | 'live' | 'finished';
export type KotcNextCourtStatus = 'pending' | 'live' | 'finished';
export type KotcNextRaundStatus = 'pending' | 'running' | 'finished';
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
  | 'bootstrap_r2'
  | 'finish_r2';

// ─── Judge params (tournament-level config) ───────────────────────────────────

export interface KotcNextJudgeParams {
  variant: KotcNextVariant;
  courts: number;      // 1–4
  ppc: number;         // pairs per court (3–5)
  raundCount: number;  // rounds per tour (1–4)
  raundTimerMinutes: number; // 9–20
}

// ─── Pair (fixed for the duration of a round) ─────────────────────────────────

export interface KotcNextPairView {
  pairIdx: number;
  primaryPlayer: { id: string; name: string } | null;
  secondaryPlayer: { id: string; name: string } | null;
  label: string; // e.g. "Иванов / Сабанцева"
}

// ─── Live state (per raund, returned by API after each game event) ────────────

export interface KotcNextPairLiveState {
  pairIdx: number;
  kingWins: number;    // points scored while on throne
  takeovers: number;   // times this pair captured the throne (tiebreak)
  gamesPlayed: number;
}

export interface KotcNextCourtLiveState {
  currentRaundNo: number;
  kingPairIdx: number;
  challengerPairIdx: number;
  queueOrder: number[];            // remaining pair indices (front = next up)
  pairs: KotcNextPairLiveState[];
  timerStartedAt: string | null;   // ISO timestamp
  timerMinutes: number;
  status: KotcNextRaundStatus;
}

// ─── Game event (one entry in kotcn_game) ─────────────────────────────────────

export interface KotcNextGameEvent {
  id: string;
  seqNo: number;
  eventType: 'king_point' | 'takeover';
  kingPairIdx: number;
  challengerPairIdx: number;
  playedAt: string;
}

// ─── Judge snapshot (returned to judge UI) ────────────────────────────────────

export interface KotcNextRaundHistoryEntry {
  raundNo: number;
  status: KotcNextRaundStatus;
  standings: KotcNextPairLiveState[];
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
  raundHistory: KotcNextRaundHistoryEntry[];
  canUndo: boolean; // true if there is at least one game event to undo
}

// ─── Operator state (returned to operator/sudyam UI) ──────────────────────────

export interface KotcNextCourtRaundProgress {
  raundNo: number;
  status: KotcNextRaundStatus;
  startedAt: string | null;
  finishedAt: string | null;
  standings: KotcNextPairLiveState[] | null; // null if raund not yet finished
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

export interface KotcNextR2SeedZone {
  zone: KotcNextZoneKey;
  pairRefs: Array<{ courtNo: number; pairIdx: number; pairLabel: string; kingWins: number; takeovers: number }>;
}

export interface KotcNextOperatorState {
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
  finalResults: KotcNextFinalZoneResult[] | null;
  // permission flags
  canBootstrapR1: boolean;
  canFinishR1: boolean;
  canPreviewR2Seed: boolean;
  canConfirmR2Seed: boolean;
  canBootstrapR2: boolean;
  canFinishR2: boolean;
}

// ─── Final results ─────────────────────────────────────────────────────────────

export interface KotcNextFinalZoneResult {
  zone: KotcNextZoneKey;
  zoneLabel: string; // 'КИН' | 'АДАНС' | 'МЕДИУМ' | 'ЛАЙТ'
  pairs: Array<{
    position: number;
    pairLabel: string;
    primaryPlayerId: string | null;
    secondaryPlayerId: string | null;
    kingWins: number;
    takeovers: number;
  }>;
}

// ─── Spectator board payload ───────────────────────────────────────────────────

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
    | 'r2SeedDraft'
  > {
  funStats: KotcNextFunStats | null;
  viewSource: 'live' | 'snapshot';
  snapshotCapturedAt: string | null;
}
