import type { PlayFit, PlayGatherState, PlayLevel, PlayParticipantStatus } from '@/lib/play-core';

export const PLAY_LEVEL_LABELS: Record<PlayLevel, string> = {
  light: 'Начальный',
  medium: 'Средний',
  hard: 'Высокий',
};

export const PLAY_FIT_LABELS: Record<PlayFit, string> = {
  match: 'Подходит вам',
  level_too_high: 'Уровень выше вашего',
  level_too_low: 'Уровень ниже вашего',
  gender_mismatch: 'Другой состав',
  unknown: 'Заполните профиль',
};

export const PLAY_STATUS_LABELS: Record<PlayParticipantStatus, string> = {
  pending: 'На рассмотрении',
  confirmed: 'Вы участвуете',
  reserve: 'Вы в резерве',
  rejected: 'Заявка отклонена',
  cancelled: 'Запись отменена',
};

export const PLAY_GATHER_LABELS: Record<PlayGatherState, string> = {
  filling: 'Идёт сбор',
  minimum_reached: '✅ Состоится',
  full: 'Мест нет',
  closed: 'Запись закрыта',
  at_risk: '⚠️ Под угрозой отмены',
};

export function gatherBadge(post: {
  gatherState: PlayGatherState | null;
  confirmedCount: number;
  minPlayers: number | null;
  capacity: number;
  gatherDeadline: string | null;
}): string {
  if (!post.gatherState) return '';
  if (post.gatherState === 'filling' || post.gatherState === 'at_risk') {
    const minimum = post.minPlayers ?? post.capacity;
    const missing = Math.max(0, minimum - post.confirmedCount);
    const deadline = post.gatherDeadline
      ? ` до ${formatPlayTime(post.gatherDeadline)}`
      : '';
    return `Нужно ещё ${missing}${deadline}`;
  }
  return PLAY_GATHER_LABELS[post.gatherState];
}

// D5: fixed — точная цена; split — честная оценка «~X ₽»
export function formatPlayPrice(post: {
  priceMode: 'fixed' | 'split';
  priceRub: number;
  priceEstimate: { amount: number; approximate: boolean };
}): string {
  if (post.priceMode === 'split') {
    return post.priceEstimate.amount ? `~${post.priceEstimate.amount} ₽` : 'Делим корт';
  }
  return post.priceRub ? `${post.priceRub} ₽` : 'Бесплатно';
}

export function formatPlayDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: 'numeric',
    month: 'long',
    ...options,
  }).format(new Date(value));
}

export function formatPlayTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatLevelRange(min: PlayLevel | null, max: PlayLevel | null): string {
  if (!min && !max) return 'Любой уровень';
  if (min && max && min !== max) return `${PLAY_LEVEL_LABELS[min]} – ${PLAY_LEVEL_LABELS[max]}`;
  return PLAY_LEVEL_LABELS[min ?? max ?? 'light'];
}

export function genderPolicyLabel(value: 'any' | 'M' | 'W' | 'mixed'): string {
  if (value === 'M') return 'Мужчины';
  if (value === 'W') return 'Женщины';
  if (value === 'mixed') return 'Микст';
  return 'Мужчины и женщины';
}

