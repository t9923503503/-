export const COACH_ANALYTICS_PERIODS = [28, 90, 365] as const;

export type CoachAnalyticsPeriod = (typeof COACH_ANALYTICS_PERIODS)[number];

export interface CoachAnalyticsSummary {
  factualTrainingCount: number;
  trainingMinutes: number;
  athleteMinutes: number;
  athletesTrained: number;
  exerciseCount: number;
  averageRating: number | null;
}

export interface CoachAthleteTrainingStat {
  playerId: string;
  name: string;
  photoUrl: string;
  status: string;
  trainingCount: number;
  exerciseCount: number;
  trainingMinutes: number;
  lastTrainingAt: string | null;
}

export interface CoachExerciseTrainingStat {
  exerciseId: string;
  title: string;
  category: string;
  executionCount: number;
  athleteCount: number;
  trainingMinutes: number;
  averageRating: number | null;
  lastUsedAt: string | null;
}

export interface CoachDistributionStat {
  key: string;
  label: string;
  executionCount: number;
  trainingMinutes: number;
  sharePercent: number;
}

export type CoachAnalyticsAlertTone = 'critical' | 'warning' | 'info';

export interface CoachAnalyticsAlert {
  id: string;
  tone: CoachAnalyticsAlertTone;
  title: string;
  detail: string;
  href: string;
}

export interface CoachAnalyticsData {
  periodDays: CoachAnalyticsPeriod;
  generatedAt: string;
  summary: CoachAnalyticsSummary;
  athletes: CoachAthleteTrainingStat[];
  exercises: CoachExerciseTrainingStat[];
  categories: CoachDistributionStat[];
  skills: CoachDistributionStat[];
  alerts: CoachAnalyticsAlert[];
}

export interface CoachAthleteAnalytics {
  trainingCount: number;
  exerciseCount: number;
  trainingMinutes: number;
  lastTrainingAt: string | null;
  favoriteExercises: Array<{ exerciseId: string; title: string; trainingMinutes: number }>;
  trainedSkills: Array<{ skillId: string; name: string; trainingMinutes: number }>;
}

export interface CoachExerciseAnalytics {
  executionCount: number;
  athleteCount: number;
  trainingMinutes: number;
  averageRating: number | null;
  lastUsedAt: string | null;
  recentRatings: Array<{ rating: number; comment: string; endedAt: string }>;
}
