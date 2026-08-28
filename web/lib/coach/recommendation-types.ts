import type { CoachExerciseCategory, CoachExerciseIntensity, CoachExerciseLevel } from './exercise-types';

export const COACH_RECOMMENDATION_LEVELS = ['auto', 'light', 'medium', 'hard'] as const;
export const COACH_RECOMMENDATION_INTENSITIES = ['auto', 'low', 'medium', 'high'] as const;

export type CoachRecommendationLevel = (typeof COACH_RECOMMENDATION_LEVELS)[number];
export type CoachRecommendationIntensity = (typeof COACH_RECOMMENDATION_INTENSITIES)[number];

export interface CoachRecommendationInput {
  durationMinutes: number;
  courtCount: number;
  participantIds: string[];
  focusSkillId: string | null;
  levelCode: CoachRecommendationLevel;
  intensity: CoachRecommendationIntensity;
  replaceExisting: boolean;
}

export interface CoachRecommendationSkillOption {
  id: string;
  name: string;
  parentName: string | null;
  activeAthleteCount: number;
  highPriorityCount: number;
}

export interface CoachRecommendationContext {
  defaultDurationMinutes: number;
  defaultCourtCount: number;
  inferredLevel: Exclude<CoachRecommendationLevel, 'auto'>;
  skills: CoachRecommendationSkillOption[];
}

export interface CoachRecommendationCandidate {
  id: string;
  title: string;
  category: CoachExerciseCategory;
  levelCode: CoachExerciseLevel;
  intensity: CoachExerciseIntensity;
  playerMin: number;
  playerMax: number;
  courtCount: number;
  durationMinutes: number;
  favorite: boolean;
  recommended: boolean;
  coachRating: number | null;
  skillIds: string[];
  primarySkillId: string | null;
  primarySkillName: string | null;
  matchedParticipantIds: string[];
  matchedHighPriorityCount: number;
  matchedPriorityWeight: number;
  lastUsedAt: string | null;
  usedInLastSession: boolean;
  usedInLast3: number;
  usedInLast5: number;
  recentCategorySeconds: number;
}

export interface CoachRecommendedItem {
  exerciseId: string;
  title: string;
  category: CoachExerciseCategory;
  durationMinutes: number;
  participantIds: string[];
  score: number;
  reasons: string[];
}

export interface CoachRecommendationResult {
  items: CoachRecommendedItem[];
  plannedDurationMinutes: number;
  requestedDurationMinutes: number;
}

