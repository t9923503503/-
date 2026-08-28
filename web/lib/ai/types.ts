export const AI_CHUNK_SIZE = 8 * 1024 * 1024;
export const AI_JOB_KINDS = ['match', 'training'] as const;
export const AI_JOB_STATUSES = [
  'uploading',
  'queued',
  'processing',
  'review',
  'confirmed',
  'failed',
  'cancelled',
] as const;

export type AiJobKind = (typeof AI_JOB_KINDS)[number];
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];
export type AiPlayerSlot = 'A1' | 'A2' | 'B1' | 'B2';
export type AiReviewStatus = 'review' | 'confirmed' | 'rejected';

export interface AiPlayerInput {
  slot: AiPlayerSlot;
  playerId: string | null;
  displayName: string;
  seedX: number | null;
  seedY: number | null;
}

export interface AiJobSummary {
  id: string;
  kind: AiJobKind;
  status: AiJobStatus;
  title: string;
  sourceFileName: string;
  sourceSizeBytes: number;
  progressPercent: number;
  progressStage: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiRallyResult {
  rallyNo: number;
  startSec: number;
  endSec: number;
  winnerTeam?: 'A' | 'B' | null;
  confidence: number;
  scoreBefore?: unknown;
  scoreAfter?: unknown;
}

export interface AiEventResult {
  rallyNo?: number | null;
  eventType:
    | 'serve'
    | 'reception'
    | 'dig'
    | 'set'
    | 'attack'
    | 'block'
    | 'contact'
    | 'landing'
    | 'out'
    | 'rally_end'
    | 'training_attempt'
    | 'technique_finding';
  eventTimeSec: number;
  team?: 'A' | 'B' | null;
  playerId?: string | null;
  outcome?: string | null;
  confidence: number;
  metrics?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}
