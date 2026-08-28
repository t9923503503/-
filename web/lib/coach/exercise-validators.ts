import { isCoachUuid } from './validators';
import {
  COACH_EXERCISE_CATEGORIES,
  COACH_EXERCISE_INTENSITIES,
  COACH_EXERCISE_LEVELS,
  COACH_EXERCISE_PHOTO_TYPES,
  COACH_EXERCISE_VIDEO_PLATFORMS,
  type CoachExerciseCategory,
  type CoachExerciseIntensity,
  type CoachExerciseLevel,
  type CoachExercisePhotoType,
  type CoachExerciseVideoPlatform,
} from './exercise-types';

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function optionalInteger(value: unknown, min: number, max: number): number | null {
  if (value == null || value === '') return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  const normalized = String(value ?? '').trim() as T;
  return values.includes(normalized) ? normalized : fallback;
}

export function normalizeCoachTextList(value: unknown, maxItems = 50, maxItemLength = 240): string[] {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n|,/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    const normalized = text(item, maxItemLength);
    const key = normalized.toLocaleLowerCase('ru');
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function uuidList(value: unknown, maxItems = 100): string[] {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => text(item, 80)).filter(isCoachUuid))].slice(0, maxItems);
}

function isExternalHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isPhotoStorageUrl(value: string): boolean {
  return value.startsWith('/') || isExternalHttpsUrl(value);
}

export function normalizeCoachExerciseInput(raw: Record<string, unknown>) {
  const playerMin = integer(raw.playerMin ?? raw.player_min, 1, 1, 100);
  const playerMax = integer(raw.playerMax ?? raw.player_max, Math.max(2, playerMin), 1, 100);
  const coachRating = optionalInteger(raw.coachRating ?? raw.coach_rating, 1, 5);
  const primarySkillId = text(raw.primarySkillId ?? raw.primary_skill_id, 80);
  return {
    title: text(raw.title, 160),
    shortDescription: text(raw.shortDescription ?? raw.short_description, 500),
    goal: text(raw.goal, 2000),
    category: enumValue(raw.category, COACH_EXERCISE_CATEGORIES, 'combined') as CoachExerciseCategory,
    levelCode: enumValue(raw.levelCode ?? raw.level_code, COACH_EXERCISE_LEVELS, 'all') as CoachExerciseLevel,
    playerMin,
    playerMax,
    courtCount: integer(raw.courtCount ?? raw.court_count, 1, 0, 20),
    ballCount: integer(raw.ballCount ?? raw.ball_count, 1, 0, 200),
    equipment: normalizeCoachTextList(raw.equipment, 30, 80),
    durationMinutes: integer(raw.durationMinutes ?? raw.duration_minutes, 10, 1, 360),
    intensity: enumValue(raw.intensity, COACH_EXERCISE_INTENSITIES, 'medium') as CoachExerciseIntensity,
    coachRequired: booleanValue(raw.coachRequired ?? raw.coach_required),
    organization: text(raw.organization, 4000),
    steps: normalizeCoachTextList(raw.steps, 50, 500),
    coachCues: normalizeCoachTextList(raw.coachCues ?? raw.coach_cues, 50, 300),
    typicalErrors: normalizeCoachTextList(raw.typicalErrors ?? raw.typical_errors, 50, 300),
    progression: text(raw.progression, 2000),
    simplification: text(raw.simplification, 2000),
    complication: text(raw.complication, 2000),
    variants: normalizeCoachTextList(raw.variants, 50, 300),
    tags: normalizeCoachTextList(raw.tags, 50, 80),
    favorite: booleanValue(raw.favorite),
    recommended: booleanValue(raw.recommended),
    coachRating,
    coachComment: text(raw.coachComment ?? raw.coach_comment, 2000),
    archived: booleanValue(raw.archived),
    primarySkillId,
    additionalSkillIds: uuidList(raw.additionalSkillIds ?? raw.additional_skill_ids).filter((id) => id !== primarySkillId),
    issueIds: uuidList(raw.issueIds ?? raw.issue_ids),
  };
}

export function validateCoachExerciseInput(input: ReturnType<typeof normalizeCoachExerciseInput>): string | null {
  if (input.title.length < 3) return 'Название упражнения должно содержать минимум 3 символа';
  if (!isCoachUuid(input.primarySkillId)) return 'Выберите основной навык';
  if (input.playerMin > input.playerMax) return 'Минимум игроков не может быть больше максимума';
  return null;
}

export function normalizeCoachExercisePhotoInput(raw: Record<string, unknown>) {
  return {
    type: enumValue(raw.type, COACH_EXERCISE_PHOTO_TYPES, 'phase') as CoachExercisePhotoType,
    phaseIndex: optionalInteger(raw.phaseIndex ?? raw.phase_index, 1, 50),
    title: text(raw.title, 160),
    caption: text(raw.caption, 1000),
    relatedIssueId: text(raw.relatedIssueId ?? raw.related_issue_id, 80) || null,
    storageUrl: text(raw.storageUrl ?? raw.storage_url, 2000),
    sortOrder: integer(raw.sortOrder ?? raw.sort_order, 0, 0, 1000),
  };
}

export function validateCoachExercisePhotoInput(input: ReturnType<typeof normalizeCoachExercisePhotoInput>): string | null {
  if (!isPhotoStorageUrl(input.storageUrl)) return 'Укажите HTTPS-ссылку или локальный путь к фото';
  if (input.type === 'phase' && input.phaseIndex == null) return 'Для фазы укажите её номер';
  if (input.relatedIssueId && !isCoachUuid(input.relatedIssueId)) return 'Некорректная связанная проблема';
  return null;
}

export function normalizeCoachExerciseVideoInput(raw: Record<string, unknown>) {
  return {
    platform: enumValue(raw.platform, COACH_EXERCISE_VIDEO_PLATFORMS, 'other') as CoachExerciseVideoPlatform,
    url: text(raw.url, 2000),
    title: text(raw.title, 160),
    author: text(raw.author, 160),
    durationSeconds: optionalInteger(raw.durationSeconds ?? raw.duration_seconds, 0, 86400),
    language: text(raw.language, 40),
    timestampStartSec: integer(raw.timestampStartSec ?? raw.timestamp_start_sec, 0, 0, 86400),
    coachNote: text(raw.coachNote ?? raw.coach_note, 1000),
    rating: optionalInteger(raw.rating, 1, 5),
    tags: normalizeCoachTextList(raw.tags, 30, 80),
    sortOrder: integer(raw.sortOrder ?? raw.sort_order, 0, 0, 1000),
  };
}

export function validateCoachExerciseVideoInput(input: ReturnType<typeof normalizeCoachExerciseVideoInput>): string | null {
  if (!isExternalHttpsUrl(input.url)) return 'Видео должно иметь HTTPS-ссылку';
  if (input.durationSeconds != null && input.timestampStartSec > input.durationSeconds) return 'Таймкод не может быть позже конца видео';
  return null;
}

export function normalizeCoachExerciseFilters(params: URLSearchParams) {
  const players = optionalInteger(params.get('players'), 1, 100);
  const courtCount = optionalInteger(params.get('courts'), 0, 20);
  const durationMax = optionalInteger(params.get('duration'), 1, 360);
  const coachRequired = params.has('coachRequired') ? booleanValue(params.get('coachRequired')) : null;
  return {
    query: text(params.get('q'), 160),
    category: text(params.get('category'), 40),
    level: text(params.get('level'), 20),
    skillId: text(params.get('skillId'), 80),
    issueId: text(params.get('issueId'), 80),
    players,
    courtCount,
    durationMax,
    intensity: text(params.get('intensity'), 20),
    coachRequired,
    noEquipment: params.get('noEquipment') === '1',
    favorite: params.get('favorite') === '1',
    includeArchived: params.get('includeArchived') === '1',
  };
}
