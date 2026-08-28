import {
  COACH_VIDEO_ANNOTATION_TYPES,
  COACH_VIDEO_FRAME_KINDS,
  COACH_VIDEO_SOURCES,
  COACH_VIDEO_STATUSES,
  type CoachVideoAnnotationType,
  type CoachVideoFrameKind,
  type CoachVideoSource,
  type CoachVideoStatus,
} from './video-types';
import { isCoachUuid } from './validators';

function text(value: unknown, max: number): string { return String(value ?? '').trim().slice(0, max); }
function optionalUuid(value: unknown): string | null { const result = text(value, 50); return result && isCoachUuid(result) ? result : null; }
function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function optionalInteger(value: unknown, min: number, max: number): number | null {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : null;
}
function lines(value: unknown, limit: number, max: number): string[] {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
  return [...new Set(source.map((item) => text(item, max)).filter(Boolean))].slice(0, limit);
}
function safeUrl(value: unknown): string {
  const result = text(value, 2000);
  if (!result) return '';
  if (result.startsWith('/')) return result;
  try { const url = new URL(result); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
}

export function normalizeCoachVideoAssetInput(raw: Record<string, unknown>) {
  const source = COACH_VIDEO_SOURCES.includes(String(raw.source) as CoachVideoSource) ? String(raw.source) as CoachVideoSource : 'own_video';
  const status = COACH_VIDEO_STATUSES.includes(String(raw.status) as CoachVideoStatus) ? String(raw.status) as CoachVideoStatus : 'ready';
  const recordedAtRaw = text(raw.recordedAt ?? raw.recorded_at, 80);
  const date = recordedAtRaw ? new Date(recordedAtRaw) : null;
  return {
    title: text(raw.title, 160), athleteId: optionalUuid(raw.athleteId ?? raw.athlete_id),
    trainingSessionId: optionalUuid(raw.trainingSessionId ?? raw.training_session_id), exerciseId: optionalUuid(raw.exerciseId ?? raw.exercise_id),
    source, originalUrl: safeUrl(raw.originalUrl ?? raw.original_url), storageUrl: safeUrl(raw.storageUrl ?? raw.storage_url),
    thumbnailUrl: safeUrl(raw.thumbnailUrl ?? raw.thumbnail_url), durationMs: optionalInteger(raw.durationMs ?? raw.duration_ms, 0, 86_400_000),
    recordedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null, status,
    notes: text(raw.notes, 4000), tags: lines(raw.tags, 50, 80),
  };
}

export function validateCoachVideoAssetInput(input: ReturnType<typeof normalizeCoachVideoAssetInput>): string | null {
  if (input.title.length < 3) return 'Название должно содержать минимум 3 символа';
  if (!input.originalUrl && !input.storageUrl) return 'Добавьте исходную ссылку или адрес файла';
  return null;
}

export function normalizeCoachVideoClipInput(raw: Record<string, unknown>) {
  return { startMs: integer(raw.startMs ?? raw.start_ms, 0, 0, 86_400_000), endMs: integer(raw.endMs ?? raw.end_ms, 0, 0, 86_400_000),
    title: text(raw.title, 160), skillId: optionalUuid(raw.skillId ?? raw.skill_id), issueId: optionalUuid(raw.issueId ?? raw.issue_id),
    notes: text(raw.notes, 2000), sortOrder: integer(raw.sortOrder ?? raw.sort_order, 0, 0, 1000) };
}
export function validateCoachVideoClipInput(input: ReturnType<typeof normalizeCoachVideoClipInput>): string | null {
  if (input.title.length < 2) return 'Название клипа должно содержать минимум 2 символа';
  if (input.endMs <= input.startMs) return 'Конец клипа должен быть позже начала';
  return null;
}

export function normalizeCoachVideoFrameInput(raw: Record<string, unknown>) {
  const kind = COACH_VIDEO_FRAME_KINDS.includes(String(raw.kind) as CoachVideoFrameKind) ? String(raw.kind) as CoachVideoFrameKind : 'key';
  return { clipId: optionalUuid(raw.clipId ?? raw.clip_id), timestampMs: integer(raw.timestampMs ?? raw.timestamp_ms, 0, 0, 86_400_000),
    imageUrl: safeUrl(raw.imageUrl ?? raw.image_url), kind, label: text(raw.label, 160), notes: text(raw.notes, 2000) };
}
export function validateCoachVideoFrameInput(input: ReturnType<typeof normalizeCoachVideoFrameInput>): string | null {
  return input.imageUrl ? null : 'Добавьте HTTPS-ссылку или локальный адрес кадра';
}

export function normalizeCoachVideoAnnotationInput(raw: Record<string, unknown>) {
  const type = COACH_VIDEO_ANNOTATION_TYPES.includes(String(raw.type) as CoachVideoAnnotationType) ? String(raw.type) as CoachVideoAnnotationType : 'note';
  const confidenceRaw = Number(raw.confidence);
  return { clipId: optionalUuid(raw.clipId ?? raw.clip_id), timestampMs: integer(raw.timestampMs ?? raw.timestamp_ms, 0, 0, 86_400_000), type,
    skillId: optionalUuid(raw.skillId ?? raw.skill_id), issueId: optionalUuid(raw.issueId ?? raw.issue_id), text: text(raw.text, 2000),
    confidence: Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 1 };
}
export function validateCoachVideoAnnotationInput(input: ReturnType<typeof normalizeCoachVideoAnnotationInput>): string | null {
  return input.text.length >= 2 ? null : 'Комментарий разметки должен содержать минимум 2 символа';
}

export function normalizeCoachVideoComparisonInput(raw: Record<string, unknown>) {
  return { athleteId: optionalUuid(raw.athleteId ?? raw.athlete_id), beforeClipId: text(raw.beforeClipId ?? raw.before_clip_id, 50),
    afterClipId: text(raw.afterClipId ?? raw.after_clip_id, 50), skillId: optionalUuid(raw.skillId ?? raw.skill_id),
    issueId: optionalUuid(raw.issueId ?? raw.issue_id), title: text(raw.title, 160), notes: text(raw.notes, 4000) };
}
export function validateCoachVideoComparisonInput(input: ReturnType<typeof normalizeCoachVideoComparisonInput>): string | null {
  if (!isCoachUuid(input.beforeClipId) || !isCoachUuid(input.afterClipId)) return 'Выберите клипы до и после';
  if (input.beforeClipId === input.afterClipId) return 'Для сравнения нужны два разных клипа';
  if (input.title.length < 3) return 'Название сравнения должно содержать минимум 3 символа';
  return null;
}
