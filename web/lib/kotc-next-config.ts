// KOTC Next — configuration validation and signature
// Mirrors web/lib/thai-judge-config.ts pattern

import crypto from 'crypto';
import {
  normalizeKotcR2SeedingMode,
  normalizeKotcJudgeModule,
  normalizeKotcJudgeBootstrapSignature,
  normalizeKotcTakeoversMode,
  type KotcR2SeedingMode,
  type KotcTakeoversMode,
} from './admin-legacy-sync';
import type { KotcNextVariant } from './kotc-next/types';

export const KOTC_NEXT_FORMAT = 'King of the Court';
export const KOTC_JUDGE_MODULE_LEGACY = 'legacy';
export const KOTC_JUDGE_MODULE_NEXT = 'next';
export const KOTC_STRUCTURAL_DRIFT_LOCKED_CODE = 'KOTC_STRUCTURAL_DRIFT_LOCKED';

export type KotcJudgeModule =
  | typeof KOTC_JUDGE_MODULE_LEGACY
  | typeof KOTC_JUDGE_MODULE_NEXT;

// Limits
export const KOTC_NEXT_MIN_COURTS = 1;
export const KOTC_NEXT_MAX_COURTS = 4;
export const KOTC_NEXT_MIN_PPC = 3;       // pairs per court
export const KOTC_NEXT_MAX_PPC = 5;
export const KOTC_NEXT_MIN_RAUNDS = 1;
export const KOTC_NEXT_MAX_RAUNDS = KOTC_NEXT_MAX_PPC;
export const KOTC_NEXT_MIN_TIMER = 9;
export const KOTC_NEXT_MAX_TIMER = 20;
export const KOTC_NEXT_DEFAULT_PPC = 4;
export const KOTC_NEXT_DEFAULT_RAUNDS = KOTC_NEXT_DEFAULT_PPC;
export const KOTC_NEXT_DEFAULT_TIMER = 10;

export interface KotcNextStructureInput {
  format: string;
  courts: number;
  ppc: number;
  raundCount: number;
  raundTimerMinutes: number;
  variant: KotcNextVariant;
  takeoversMode: KotcTakeoversMode;
  r2SeedingMode: KotcR2SeedingMode;
  playerIds: string[]; // primary player ids (one per pair per court)
  storedSignature?: string | null;
}

// ─── Signature ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic string that captures the structural parameters.
 * Used to detect drift after bootstrap.
 */
export function buildKotcNextStructuralSignature(input: {
  variant: string;
  courts: number;
  ppc: number;
  raundCount: number;
  takeoversMode: KotcTakeoversMode;
  r2SeedingMode: KotcR2SeedingMode;
  playerIds: string[];
}): string {
  const sortedIds = [...input.playerIds].sort().join(',');
  return `variant=${input.variant};courts=${input.courts};ppc=${input.ppc};raunds=${input.raundCount};takeoversMode=${input.takeoversMode};r2SeedingMode=${input.r2SeedingMode};players=${sortedIds}`;
}

export function kotcNextSignaturesMatch(a: string, b: string): boolean {
  return a === b;
}

// ─── Deterministic PIN ────────────────────────────────────────────────────────

/**
 * Deterministic 8-char PIN for a court (mirrors Thai's buildDeterministicCourtPin).
 */
export function buildKotcNextCourtPin(
  tournamentId: string,
  roundType: 'r1' | 'r2',
  courtNo: number,
): string {
  const hash = crypto
    .createHash('sha1')
    .update(`kotcn:${tournamentId}:${roundType}:${courtNo}`)
    .digest('base64url');
  return hash.slice(0, 8).toUpperCase();
}

// ─── Normalisation ────────────────────────────────────────────────────────────

export function normalizeKotcAdminSettings(settings: Record<string, unknown> | null | undefined) {
  const raw = settings ?? {};
  const courts = clamp(toInt(raw.courts, KOTC_NEXT_MAX_COURTS), KOTC_NEXT_MIN_COURTS, KOTC_NEXT_MAX_COURTS);
  const ppc = clamp(toInt(raw.kotcPpc ?? raw.ppc, KOTC_NEXT_DEFAULT_PPC), KOTC_NEXT_MIN_PPC, KOTC_NEXT_MAX_PPC);
  const raundCount = ppc;
  const raundTimerMinutes = clamp(toInt(raw.kotcRaundTimerMinutes ?? raw.raundTimerMinutes, KOTC_NEXT_DEFAULT_TIMER), KOTC_NEXT_MIN_TIMER, KOTC_NEXT_MAX_TIMER);
  const takeoversMode = normalizeKotcTakeoversMode(raw.kotcTakeoversMode);
  const r2SeedingMode = normalizeKotcR2SeedingMode(raw.kotcR2SeedingMode);
  const selfScoringEnabled = toBoolean(raw.kotcSelfScoringEnabled, false);
  const scoreVoiceEnabled = toBoolean(raw.kotcScoreVoiceEnabled, true);
  const scoreHistoryVisible = toBoolean(raw.kotcScoreHistoryVisible, true);

  return {
    courts,
    ppc,
    raundCount,
    raundTimerMinutes,
    takeoversMode,
    r2SeedingMode,
    selfScoringEnabled,
    scoreVoiceEnabled,
    scoreHistoryVisible,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateKotcNextSetup(input: {
  courts: number;
  ppc: number;
  raundCount: number;
  raundTimerMinutes: number;
  participantCount: number;
}): string | null {
  const { courts, ppc, raundCount, raundTimerMinutes, participantCount } = input;

  if (courts < KOTC_NEXT_MIN_COURTS || courts > KOTC_NEXT_MAX_COURTS) {
    return `Кортов: ${courts} — допустимо ${KOTC_NEXT_MIN_COURTS}–${KOTC_NEXT_MAX_COURTS}`;
  }
  if (ppc < KOTC_NEXT_MIN_PPC || ppc > KOTC_NEXT_MAX_PPC) {
    return `Пар на корт: ${ppc} — допустимо ${KOTC_NEXT_MIN_PPC}–${KOTC_NEXT_MAX_PPC}`;
  }
  if (raundCount < KOTC_NEXT_MIN_RAUNDS || raundCount > KOTC_NEXT_MAX_RAUNDS) {
    return `Раундов: ${raundCount} — допустимо ${KOTC_NEXT_MIN_RAUNDS}–${KOTC_NEXT_MAX_RAUNDS}`;
  }
  if (raundCount !== ppc) {
    return `Раундов на корт должно быть столько же, сколько пар на корт: ${ppc}`;
  }
  if (raundTimerMinutes < KOTC_NEXT_MIN_TIMER || raundTimerMinutes > KOTC_NEXT_MAX_TIMER) {
    return `Таймер: ${raundTimerMinutes} мин — допустимо ${KOTC_NEXT_MIN_TIMER}–${KOTC_NEXT_MAX_TIMER}`;
  }

  const expectedParticipants = courts * ppc * 2; // ppc pairs × 2 players per pair
  if (participantCount !== expectedParticipants) {
    return `Ожидается ${expectedParticipants} участников (${courts} кортов × ${ppc} пар × 2 игрока), в наличии: ${participantCount}`;
  }

  return null;
}

export function validateKotcNextStructuralLock(input: {
  storedSignature: string | null | undefined;
  currentSignature: string;
}): { code: string; message: string } | null {
  const { storedSignature, currentSignature } = input;
  if (!storedSignature) return null; // not bootstrapped yet → no lock

  if (!kotcNextSignaturesMatch(storedSignature, currentSignature)) {
    return {
      code: KOTC_STRUCTURAL_DRIFT_LOCKED_CODE,
      message:
        'Структура турнира изменилась после инициализации (состав или настройки). ' +
        'Чтобы изменить состав или параметры — сбросьте и переинициализируйте судейский модуль.',
    };
  }
  return null;
}

export function validateKotcNextTournamentStructuralLock(input: {
  currentTournament?: {
    format?: unknown;
    settings?: Record<string, unknown>;
  } | null;
  nextTournament: {
    format: unknown;
    settings?: Record<string, unknown>;
    participants: Array<{ playerId: string; position?: number | null; isWaitlist?: boolean | null; gender?: unknown }>;
    division?: unknown;
  };
}): { code: typeof KOTC_STRUCTURAL_DRIFT_LOCKED_CODE; message: string } | null {
  const storedSignature = normalizeKotcJudgeBootstrapSignature(
    input.currentTournament?.settings?.kotcJudgeBootstrapSignature,
  );
  if (!storedSignature) {
    return null;
  }

  if (!isKotcNextFormat(input.nextTournament.format)) {
    return {
      code: KOTC_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'Cannot change tournament format. Structural KOTC Next state already initialized.',
    };
  }

  const nextModule = normalizeKotcJudgeModule(
    input.nextTournament.settings?.kotcJudgeModule,
    KOTC_JUDGE_MODULE_NEXT,
  );
  if (nextModule !== KOTC_JUDGE_MODULE_NEXT) {
    return {
      code: KOTC_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'Cannot downgrade judge module after KOTC Next state initialization.',
    };
  }

  const settings = input.nextTournament.settings ?? {};
  const mainParticipants = [...input.nextTournament.participants]
    .filter((participant) => participant.isWaitlist !== true)
    .sort((left, right) => {
      const leftPosition = toInt(left.position, Number.MAX_SAFE_INTEGER);
      const rightPosition = toInt(right.position, Number.MAX_SAFE_INTEGER);
      return leftPosition - rightPosition;
    });
  const playerIds = mainParticipants
    .map((participant) => String(participant.playerId ?? '').trim())
    .filter(Boolean);
  const hasWomen = mainParticipants.some(
    (participant) => String(participant.gender ?? '').trim().toUpperCase() === 'W',
  );
  const hasMen = mainParticipants.some(
    (participant) => String(participant.gender ?? '').trim().toUpperCase() !== 'W',
  );
  const normalizedDivision = String(input.nextTournament.division ?? '').trim().toLowerCase();
  const variant =
    normalizedDivision.includes('жен') || (!hasMen && hasWomen)
      ? 'WW'
      : normalizedDivision.includes('муж') || (hasMen && !hasWomen)
        ? 'MM'
        : 'MF';
  const normalizedSettings = normalizeKotcAdminSettings(settings);
  const nextSignature = buildKotcNextStructuralSignature({
    variant,
    courts: normalizedSettings.courts,
    ppc: normalizedSettings.ppc,
    raundCount: normalizedSettings.raundCount,
    takeoversMode: normalizedSettings.takeoversMode,
    r2SeedingMode: normalizedSettings.r2SeedingMode,
    playerIds,
  });

  if (!kotcNextSignaturesMatch(storedSignature, nextSignature)) {
    return {
      code: KOTC_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'structural KOTC Next state already initialized; reset/recreate flow required',
    };
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function isKotcNextFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === KOTC_NEXT_FORMAT.toLowerCase();
}

export function zoneLabel(zone: string): string {
  const map: Record<string, string> = {
    kin: '\u0425\u0410\u0420\u0414',
    advance: '\u0410\u0414\u0410\u041d\u0421',
    medium: '\u041c\u0415\u0414\u0418\u0423\u041c',
    lite: '\u041b\u0410\u0419\u0422',
  };
  return map[zone] ?? zone.toUpperCase();
}
