import {
  COACH_CHALLENGE_SCORING_TYPES,
  COACH_CHALLENGE_TYPES,
  type CoachChallengeScoringType,
  type CoachChallengeType,
} from './challenge-types';
import { isCoachUuid } from './validators';

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === '') return false;
  return fallback;
}

function lines(value: unknown, limit: number, itemMax: number): string[] {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/);
  return source.map((item) => text(item, itemMax)).filter(Boolean).slice(0, limit);
}

function uuidList(value: unknown, limit = 100): string[] {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(String).filter(isCoachUuid))].slice(0, limit);
}

export function normalizeCoachChallengeInput(raw: Record<string, unknown>) {
  const type = COACH_CHALLENGE_TYPES.includes(String(raw.type) as CoachChallengeType) ? String(raw.type) as CoachChallengeType : 'control';
  const scoringType = COACH_CHALLENGE_SCORING_TYPES.includes(String(raw.scoringType ?? raw.scoring_type) as CoachChallengeScoringType)
    ? String(raw.scoringType ?? raw.scoring_type) as CoachChallengeScoringType
    : 'score';
  const primarySkillId = text(raw.primarySkillId ?? raw.primary_skill_id, 50);
  return {
    title: text(raw.title, 160),
    description: text(raw.description, 4000),
    type,
    scoringType,
    attemptCount: integer(raw.attemptCount ?? raw.attempt_count, 1, 1, 500),
    maxScore: optionalNumber(raw.maxScore ?? raw.max_score),
    unitLabel: text(raw.unitLabel ?? raw.unit_label, 40) || (scoringType === 'time' ? 'сек' : scoringType === 'distance' ? 'м' : scoringType === 'percent' ? '%' : 'балл'),
    higherIsBetter: boolean(raw.higherIsBetter ?? raw.higher_is_better, scoringType !== 'time'),
    metrics: lines(raw.metrics, 30, 120),
    rules: lines(raw.rules, 50, 500),
    repeatIntervalDays: optionalNumber(raw.repeatIntervalDays ?? raw.repeat_interval_days),
    primarySkillId,
    additionalSkillIds: uuidList(raw.additionalSkillIds ?? raw.additional_skill_ids).filter((id) => id !== primarySkillId),
    issueIds: uuidList(raw.issueIds ?? raw.issue_ids),
    archived: boolean(raw.archived),
  };
}

export function validateCoachChallengeInput(input: ReturnType<typeof normalizeCoachChallengeInput>): string | null {
  if (input.title.length < 3) return 'Название должно содержать минимум 3 символа';
  if (!isCoachUuid(input.primarySkillId)) return 'Выберите основной навык';
  if (input.maxScore != null && (input.maxScore <= 0 || input.maxScore > 1_000_000_000)) return 'Максимум должен быть больше нуля';
  if (input.repeatIntervalDays != null && (!Number.isInteger(input.repeatIntervalDays) || input.repeatIntervalDays < 1 || input.repeatIntervalDays > 3650)) return 'Интервал повторения — от 1 до 3650 дней';
  return null;
}

export function normalizeCoachChallengeAttemptInput(raw: Record<string, unknown>) {
  const completedAtRaw = text(raw.completedAt ?? raw.completed_at, 80);
  const parsedDate = completedAtRaw ? new Date(completedAtRaw) : new Date();
  return {
    playerId: text(raw.playerId ?? raw.player_id, 50),
    trainingSessionId: text(raw.trainingSessionId ?? raw.training_session_id, 50) || null,
    score: optionalNumber(raw.score),
    maxScore: optionalNumber(raw.maxScore ?? raw.max_score),
    completedAt: Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : '',
    details: text(raw.details, 4000),
    coachComment: text(raw.coachComment ?? raw.coach_comment, 2000),
  };
}

export function validateCoachChallengeAttemptInput(input: ReturnType<typeof normalizeCoachChallengeAttemptInput>): string | null {
  if (!isCoachUuid(input.playerId)) return 'Выберите ученика';
  if (input.trainingSessionId && !isCoachUuid(input.trainingSessionId)) return 'Некорректная тренировка';
  if (input.score == null || Math.abs(input.score) > 1_000_000_000) return 'Введите корректный результат';
  if (input.maxScore != null && (input.maxScore <= 0 || input.maxScore > 1_000_000_000)) return 'Некорректный максимум';
  if (!input.completedAt) return 'Некорректная дата попытки';
  return null;
}
