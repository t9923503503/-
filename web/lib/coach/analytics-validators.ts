import { COACH_ANALYTICS_PERIODS, type CoachAnalyticsPeriod } from './analytics-types';

export function normalizeCoachAnalyticsPeriod(value: unknown): CoachAnalyticsPeriod {
  const parsed = Number(value);
  return COACH_ANALYTICS_PERIODS.includes(parsed as CoachAnalyticsPeriod)
    ? parsed as CoachAnalyticsPeriod
    : 28;
}
