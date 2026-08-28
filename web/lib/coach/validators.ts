import {
  COACH_ATHLETE_STATUSES,
  COACH_ISSUE_STATUSES,
  COACH_LEVELS,
  COACH_SOURCES,
  type CoachAthleteStatus,
  type CoachIssueStatus,
  type CoachLevel,
  type CoachSource,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  const normalized = String(value ?? '').trim() as T;
  return values.includes(normalized) ? normalized : fallback;
}

export function isCoachUuid(value: unknown): boolean {
  return UUID_RE.test(String(value ?? '').trim());
}

export function normalizeCoachAthleteInput(raw: Record<string, unknown>) {
  return {
    playerId: text(raw.playerId ?? raw.player_id, 80),
    levelCode: enumValue(raw.levelCode ?? raw.level_code, COACH_LEVELS, 'medium') as CoachLevel,
    status: enumValue(raw.status, COACH_ATHLETE_STATUSES, 'active') as CoachAthleteStatus,
    joinedAt: text(raw.joinedAt ?? raw.joined_at, 20),
    goals: text(raw.goals, 2000),
    limitations: text(raw.limitations, 2000),
  };
}

export function validateCoachAthleteInput(input: ReturnType<typeof normalizeCoachAthleteInput>): string | null {
  if (!isCoachUuid(input.playerId)) return 'Выберите игрока из базы LPVOLLEY';
  if (input.joinedAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.joinedAt)) return 'Укажите корректную дату';
  return null;
}

export function normalizeSkillEvaluationInput(raw: Record<string, unknown>) {
  return {
    skillId: text(raw.skillId ?? raw.skill_id, 80),
    score: Math.trunc(Number(raw.score)),
    confidence: numberInRange(raw.confidence, 0, 1),
    source: enumValue(raw.source, COACH_SOURCES, 'coach') as CoachSource,
    coachComment: text(raw.coachComment ?? raw.coach_comment, 1000),
    evaluatedAt: text(raw.evaluatedAt ?? raw.evaluated_at, 60),
  };
}

export function validateSkillEvaluationInput(input: ReturnType<typeof normalizeSkillEvaluationInput>): string | null {
  if (!isCoachUuid(input.skillId)) return 'Выберите навык';
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) return 'Оценка должна быть от 1 до 5';
  if (input.confidence == null) return 'Укажите уверенность оценки';
  if (input.evaluatedAt && !Number.isFinite(new Date(input.evaluatedAt).getTime())) return 'Некорректная дата оценки';
  return null;
}

export function normalizeAthleteIssueInput(raw: Record<string, unknown>) {
  const rawSkillId = text(raw.skillId ?? raw.skill_id, 80);
  return {
    skillId: rawSkillId || null,
    title: text(raw.title, 120),
    description: text(raw.description, 2000),
    priority: Math.trunc(Number(raw.priority ?? 3)),
    status: enumValue(raw.status, COACH_ISSUE_STATUSES, 'active') as CoachIssueStatus,
    source: enumValue(raw.source, COACH_SOURCES, 'coach') as CoachSource,
    confidence: numberInRange(raw.confidence, 0, 1),
    coachComment: text(raw.coachComment ?? raw.coach_comment, 1000),
  };
}

export function validateAthleteIssueInput(input: ReturnType<typeof normalizeAthleteIssueInput>): string | null {
  if (input.skillId && !isCoachUuid(input.skillId)) return 'Некорректный навык';
  if (input.title.length < 3) return 'Название проблемы должно содержать минимум 3 символа';
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 5) return 'Приоритет должен быть от 1 до 5';
  if (input.confidence == null) return 'Укажите уверенность';
  return null;
}

export function normalizeAthleteIssuePatch(raw: Record<string, unknown>) {
  return {
    status: enumValue(raw.status, COACH_ISSUE_STATUSES, 'active') as CoachIssueStatus,
    priority: Math.trunc(Number(raw.priority ?? 3)),
    coachComment: text(raw.coachComment ?? raw.coach_comment, 1000),
    markWorked: raw.markWorked === true,
  };
}

export function validateAthleteIssuePatch(input: ReturnType<typeof normalizeAthleteIssuePatch>): string | null {
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 5) return 'Приоритет должен быть от 1 до 5';
  return null;
}
