import type { CoachAthleteStatus, CoachIssueStatus, CoachLevel, CoachSource } from './types';

export const COACH_LEVEL_LABELS: Record<CoachLevel, string> = {
  light: 'Лайт',
  medium: 'Медиум',
  hard: 'Хард',
};

export const COACH_ATHLETE_STATUS_LABELS: Record<CoachAthleteStatus, string> = {
  active: 'Активен',
  paused: 'Пауза',
  injured: 'Травма',
  archived: 'Архив',
};

export const COACH_ISSUE_STATUS_LABELS: Record<CoachIssueStatus, string> = {
  suggested: 'Предложена',
  active: 'В работе',
  improving: 'Улучшается',
  monitoring: 'Наблюдение',
  resolved: 'Решена',
  archived: 'Архив',
};

export const COACH_SOURCE_LABELS: Record<CoachSource, string> = {
  coach: 'Тренер',
  challenge: 'Челлендж',
  video_ai: 'Видео AI',
  ai_assistant: 'AI-ассистент',
  import: 'Импорт',
};

export function formatCoachDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
