import type {
  CoachExerciseCategory,
  CoachExerciseIntensity,
  CoachExerciseLevel,
  CoachExercisePhotoType,
  CoachExerciseVideoPlatform,
} from './exercise-types';

export const COACH_EXERCISE_CATEGORY_LABELS: Record<CoachExerciseCategory, string> = {
  warmup: 'Разминка',
  ball_control: 'Контроль мяча',
  reception: 'Приём',
  setting: 'Передача',
  attack: 'Атака',
  serve: 'Подача',
  defense: 'Защита',
  block: 'Блок',
  transitions: 'Переходы',
  tactics: 'Тактика',
  game: 'Игровые',
  physical: 'Физика',
  coordination: 'Координация',
  combined: 'Комбинированные',
};

export const COACH_EXERCISE_LEVEL_LABELS: Record<CoachExerciseLevel, string> = {
  all: 'Совсем новичок',
  light: 'FIRST',
  medium: 'NEXT',
  hard: 'ADVANCED',
};

export const COACH_EXERCISE_INTENSITY_LABELS: Record<CoachExerciseIntensity, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
};

export const COACH_EXERCISE_PHOTO_TYPE_LABELS: Record<CoachExercisePhotoType, string> = {
  correct: 'Правильно',
  error: 'Ошибка',
  phase: 'Фаза',
};

export const COACH_EXERCISE_VIDEO_PLATFORM_LABELS: Record<CoachExerciseVideoPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  telegram: 'Telegram',
  own_video: 'Своё видео',
  other: 'Другое',
};

export function formatExercisePlayers(min: number, max: number): string {
  return min === max ? `${min} чел.` : `${min}–${max} чел.`;
}

export function formatExerciseDuration(seconds: number | null): string {
  if (seconds == null) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, '0')}` : `0:${String(rest).padStart(2, '0')}`;
}
