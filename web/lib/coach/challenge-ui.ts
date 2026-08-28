import type { CoachChallengeScoringType, CoachChallengeType } from './challenge-types';

export const COACH_CHALLENGE_TYPE_LABELS: Record<CoachChallengeType, string> = {
  control: 'Контрольный',
  training: 'Тренировочный',
  competitive: 'Соревновательный',
};

export const COACH_CHALLENGE_SCORING_LABELS: Record<CoachChallengeScoringType, string> = {
  count: 'Количество',
  time: 'Время',
  distance: 'Дистанция',
  score: 'Баллы',
  percent: 'Процент',
  custom: 'Своя метрика',
};

export function formatChallengeScore(score: number, maxScore: number | null, unitLabel: string): string {
  const value = Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const max = maxScore == null ? '' : `/${Number.isInteger(maxScore) ? maxScore : maxScore.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `${value}${max} ${unitLabel}`.trim();
}
