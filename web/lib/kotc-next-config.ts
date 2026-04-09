// KOTC Next — configuration validation and signature
// Mirrors web/lib/thai-judge-config.ts pattern

import crypto from 'crypto';
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
export const KOTC_NEXT_MAX_RAUNDS = 4;
export const KOTC_NEXT_MIN_TIMER = 9;
export const KOTC_NEXT_MAX_TIMER = 20;
export const KOTC_NEXT_DEFAULT_PPC = 4;
export const KOTC_NEXT_DEFAULT_RAUNDS = 2;
export const KOTC_NEXT_DEFAULT_TIMER = 10;

export interface KotcNextStructureInput {
  format: string;
  courts: number;
  ppc: number;
  raundCount: number;
  raundTimerMinutes: number;
  variant: KotcNextVariant;
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
  playerIds: string[];
}): string {
  const sortedIds = [...input.playerIds].sort().join(',');
  return `variant=${input.variant};courts=${input.courts};ppc=${input.ppc};raunds=${input.raundCount};players=${sortedIds}`;
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
  const raundCount = clamp(toInt(raw.kotcRaundCount ?? raw.raundCount, KOTC_NEXT_DEFAULT_RAUNDS), KOTC_NEXT_MIN_RAUNDS, KOTC_NEXT_MAX_RAUNDS);
  const raundTimerMinutes = clamp(toInt(raw.kotcRaundTimerMinutes ?? raw.raundTimerMinutes, KOTC_NEXT_DEFAULT_TIMER), KOTC_NEXT_MIN_TIMER, KOTC_NEXT_MAX_TIMER);

  return { courts, ppc, raundCount, raundTimerMinutes };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function isKotcNextFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === KOTC_NEXT_FORMAT.toLowerCase();
}

export function zoneLabel(zone: string): string {
  const map: Record<string, string> = {
    kin: 'КИН',
    advance: 'АДАНС',
    medium: 'МЕДИУМ',
    lite: 'ЛАЙТ',
  };
  return map[zone] ?? zone.toUpperCase();
}
