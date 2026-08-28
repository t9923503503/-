import { canonicalSha256Hex } from './client-command-hash';
import { MATCH_RULE_PRESETS, validateMatchRule } from './core/match-rules';
import { isTerminalSetScore } from './core/results';
import type { MatchRule, MatchRulePreset } from './core/types';

export type GoV2JudgeCommandKind =
  | 'match.start'
  | 'match.pause'
  | 'match.resume'
  | 'score.replace'
  | 'match.finish.request';

export interface GoV2JudgeLiveScore {
  currentSet: number;
  points: { a: number; b: number };
  sets: Array<{ a: number; b: number }>;
}

export interface GoV2JudgeCommandEnvelope extends Record<string, unknown> {
  commandId: string;
  requestHash: string;
  reasonCode: string;
  expectedVersion: number;
  deviceId: string;
  command: {
    type: GoV2JudgeCommandKind;
    matchId: string;
    payload: Record<string, unknown>;
  };
}

export type GoV2JudgeHttpClassification = 'authorization' | 'conflict' | 'rejected' | 'retryable';

export interface GoV2JudgeHttpResult {
  response: Response;
  payload: Record<string, unknown>;
}

export class GoV2JudgeRetryableError extends Error {
  constructor(
    message: string,
    readonly code: 'TRANSPORT_FAILED' | 'RESPONSE_PARSE_FAILED' | 'INVALID_SUCCESS_RECEIPT',
  ) {
    super(message);
    this.name = 'GoV2JudgeRetryableError';
  }
}

const REASON_CODES: Readonly<Record<GoV2JudgeCommandKind, string>> = Object.freeze({
  'match.start': 'judge_match_start',
  'match.pause': 'judge_match_pause',
  'match.resume': 'judge_match_resume',
  'score.replace': 'judge_score_entry',
  'match.finish.request': 'judge_finish_request',
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function copyRule(rule: MatchRule): MatchRule {
  return {
    preset: rule.preset,
    setsToWin: rule.setsToWin,
    sets: rule.sets.map((set) => ({ ...set })),
  };
}

export function normalizeGoV2JudgeMatchRule(value: unknown): MatchRule {
  const input = record(value);
  const preset = String(input.preset ?? 'single_21') as MatchRulePreset;
  const fallback = MATCH_RULE_PRESETS[preset] ?? MATCH_RULE_PRESETS.single_21;
  const rawSets = Array.isArray(input.sets) ? input.sets : fallback.sets;
  const candidate: MatchRule = {
    preset: fallback.preset,
    setsToWin: Number(input.setsToWin ?? fallback.setsToWin),
    sets: rawSets.map((value, index) => {
      const set = record(value);
      const base = fallback.sets[index] ?? fallback.sets[fallback.sets.length - 1];
      return {
        targetPoints: Number(set.targetPoints ?? base.targetPoints),
        winBy: Number(set.winBy ?? base.winBy),
        pointCap: set.pointCap === null
          ? null
          : set.pointCap === undefined
            ? base.pointCap
            : Number(set.pointCap),
      };
    }),
  };
  const validation = validateMatchRule(candidate, 'judge.matchRule');
  return validation.ok ? validation.value : copyRule(fallback);
}

function scoreProgress(
  score: GoV2JudgeLiveScore,
  rule: MatchRule,
): { ok: true; setsA: number; setsB: number } | { ok: false; message: string } {
  let setsA = 0;
  let setsB = 0;
  for (let index = 0; index < score.sets.length; index += 1) {
    if (setsA >= rule.setsToWin || setsB >= rule.setsToWin) {
      return { ok: false, message: 'В счёте есть лишняя партия после завершения матча.' };
    }
    const setRule = rule.sets[index];
    if (!setRule) return { ok: false, message: 'Количество партий превышает правило этого матча.' };
    const set = score.sets[index];
    if (!Number.isSafeInteger(set.a) || !Number.isSafeInteger(set.b) || set.a < 0 || set.b < 0) {
      return { ok: false, message: `В партии ${index + 1} указан некорректный счёт.` };
    }
    if (!isTerminalSetScore(set.a, set.b, setRule)) {
      return { ok: false, message: `Партия ${index + 1} не завершена по правилу до ${setRule.targetPoints}, разница ${setRule.winBy}.` };
    }
    if (set.a > set.b) setsA += 1;
    else setsB += 1;
  }
  return { ok: true, setsA, setsB };
}

export function validateGoV2JudgeSetClose(
  score: GoV2JudgeLiveScore,
  rule: MatchRule,
): { ok: true } | { ok: false; message: string } {
  const progress = scoreProgress(score, rule);
  if (!progress.ok) return progress;
  if (progress.setsA >= rule.setsToWin || progress.setsB >= rule.setsToWin) {
    return { ok: false, message: 'Матч уже завершён по партиям. Отправьте итог директору.' };
  }
  const setRule = rule.sets[score.sets.length];
  if (!setRule) return { ok: false, message: 'Для этого матча больше партий не предусмотрено.' };
  if (!isTerminalSetScore(score.points.a, score.points.b, setRule)) {
    const cap = setRule.pointCap === null ? '' : `, cap ${setRule.pointCap}`;
    return {
      ok: false,
      message: `Партия должна закончиться от ${setRule.targetPoints} очков с разницей ${setRule.winBy}${cap}.`,
    };
  }
  return { ok: true };
}

export function validateGoV2JudgeFinish(
  score: GoV2JudgeLiveScore,
  rule: MatchRule,
): { ok: true } | { ok: false; message: string } {
  if (score.points.a !== 0 || score.points.b !== 0) {
    return { ok: false, message: 'Сначала завершите текущую партию, затем отправьте итог матча.' };
  }
  const progress = scoreProgress(score, rule);
  if (!progress.ok) return progress;
  if (progress.setsA !== rule.setsToWin && progress.setsB !== rule.setsToWin) {
    return {
      ok: false,
      message: `Для завершения матча одна команда должна выиграть ${rule.setsToWin} ${rule.setsToWin === 1 ? 'партию' : 'партии'}.`,
    };
  }
  return { ok: true };
}

export async function buildGoV2JudgeCommandEnvelope(input: {
  tournamentId: string;
  commandId: string;
  expectedVersion: number;
  deviceId: string;
  kind: GoV2JudgeCommandKind;
  matchId: string;
  payload?: Record<string, unknown>;
}): Promise<GoV2JudgeCommandEnvelope> {
  const normalized = {
    tournamentId: input.tournamentId.trim().toLowerCase(),
    commandId: input.commandId.trim(),
    expectedVersion: input.expectedVersion,
    deviceId: input.deviceId.trim(),
    kind: input.kind,
    matchId: input.matchId.trim().toLowerCase(),
    payload: record(input.payload),
  };
  const reasonCode = REASON_CODES[input.kind];
  // This shape mirrors parseJudgeCommand + hash in live-operations.ts. Keep
  // reasonCode inside the signed material so a command cannot be relabelled.
  const requestHash = await canonicalSha256Hex({ ...normalized, reasonCode, requestHash: undefined });
  return {
    commandId: normalized.commandId,
    requestHash,
    reasonCode,
    expectedVersion: normalized.expectedVersion,
    deviceId: normalized.deviceId,
    command: {
      type: normalized.kind,
      matchId: normalized.matchId,
      payload: normalized.payload,
    },
  };
}

export function classifyGoV2JudgeHttpStatus(status: number): GoV2JudgeHttpClassification {
  if (status === 401 || status === 403) return 'authorization';
  if (status === 409) return 'conflict';
  if (status >= 400 && status < 500) return 'rejected';
  return 'retryable';
}

export async function sendGoV2JudgeCommandWithRetry(input: {
  endpoint: string;
  token: string;
  envelope: GoV2JudgeCommandEnvelope | Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
}): Promise<GoV2JudgeHttpResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 8_000;
  const maxAttempts = input.maxAttempts ?? 2;
  const serializedBody = JSON.stringify(input.envelope);
  const expectedCommandId = String(input.envelope.commandId ?? '');
  const expectedRequestHash = String(input.envelope.requestHash ?? '');
  const expectedMatchId = String(record(input.envelope.command).matchId ?? '');
  let lastError: GoV2JudgeRetryableError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(input.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.token}` },
        body: serializedBody,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = new GoV2JudgeRetryableError(
        error instanceof Error && error.name === 'AbortError'
          ? 'Сервер не ответил вовремя. Команда сохранена и будет повторена с тем же ID.'
          : 'Ответ сервера потерян. Команда сохранена и будет повторена с тем же ID.',
        'TRANSPORT_FAILED',
      );
      continue;
    } finally {
      globalThis.clearTimeout(timeout);
    }

    let payload: Record<string, unknown>;
    try {
      payload = record(await response.json());
    } catch {
      if (!response.ok) return { response, payload: {} };
      lastError = new GoV2JudgeRetryableError(
        'Сервер принял запрос, но подтверждение не прочитано. Повторяем ту же команду безопасно.',
        'RESPONSE_PARSE_FAILED',
      );
      continue;
    }

    if (response.ok && (
      payload.accepted !== true
      || String(payload.commandId ?? '') !== expectedCommandId
      || String(payload.requestHash ?? '') !== expectedRequestHash
      || String(payload.matchId ?? '') !== expectedMatchId
      || !Number.isSafeInteger(Number(payload.resultingVersion))
    )) {
      lastError = new GoV2JudgeRetryableError(
        'Сервер вернул неполное подтверждение. Команда остаётся в журнале.',
        'INVALID_SUCCESS_RECEIPT',
      );
      continue;
    }
    return { response, payload };
  }

  throw lastError ?? new GoV2JudgeRetryableError(
    'Команда не получила подтверждение сервера и остаётся в журнале.',
    'TRANSPORT_FAILED',
  );
}
