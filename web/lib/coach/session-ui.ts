import type { CoachAttendanceStatus, CoachTelegramStatus, CoachTrainingSource, CoachTrainingStatus, CoachYclientsStatus } from './session-types';

export const COACH_TRAINING_STATUS_LABELS: Record<CoachTrainingStatus, string> = {
  draft: 'Черновик', scheduled: 'Запланирована', in_progress: 'Идёт', completed: 'Завершена', cancelled: 'Отменена',
};
export const COACH_TRAINING_SOURCE_LABELS: Record<CoachTrainingSource, string> = {
  manual: 'LP Coach', kotyara: 'Котяра', yclients: 'YCLIENTS', import: 'Импорт',
};
export const COACH_TELEGRAM_STATUS_LABELS: Record<CoachTelegramStatus, string> = {
  going: 'Иду', maybe: 'Под вопросом', not_going: 'Не смогу', unknown: 'Нет ответа',
};
export const COACH_YCLIENTS_STATUS_LABELS: Record<CoachYclientsStatus, string> = {
  booked: 'Записан', waitlist: 'Лист ожидания', cancelled: 'Отменил', unknown: 'Неизвестно',
};
export const COACH_ATTENDANCE_STATUS_LABELS: Record<CoachAttendanceStatus, string> = {
  present: 'Был', absent: 'Не был', late: 'Опоздал', left_early: 'Ушёл раньше', unknown: 'Не отмечено',
};

export function formatCoachSessionDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yekaterinburg',
  }).format(date);
}
