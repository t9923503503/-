import type { CoachExerciseSummary } from './exercise-types';
import type { CoachTrainingParticipant, CoachTrainingSession } from './session-types';

export const COACH_WORKOUT_PLAN_STATUSES = ['draft', 'ready', 'in_progress', 'completed'] as const;
export const COACH_EXECUTION_STATUSES = ['running', 'paused', 'completed', 'cancelled'] as const;

export type CoachWorkoutPlanStatus = (typeof COACH_WORKOUT_PLAN_STATUSES)[number];
export type CoachExecutionStatus = (typeof COACH_EXECUTION_STATUSES)[number];
export type CoachWorkoutRecommendationSource = 'manual' | 'deterministic';

export interface CoachWorkoutAssignee {
  participantId: string;
  playerId: string | null;
  name: string;
}

export interface CoachWorkoutPlanItem {
  id: string;
  exerciseId: string;
  title: string;
  category: CoachExerciseSummary['category'];
  plannedDurationSeconds: number;
  courtLabel: string;
  coachNote: string;
  sortOrder: number;
  photoUrl: string;
  videoUrl: string;
  coachCues: string[];
  assignees: CoachWorkoutAssignee[];
  executionStatus: CoachExecutionStatus | null;
  actualDurationSeconds: number | null;
  recommendationSource: CoachWorkoutRecommendationSource;
  recommendationScore: number | null;
  recommendationReasons: string[];
}

export interface CoachExerciseExecution {
  id: string;
  planItemId: string | null;
  exerciseId: string;
  exerciseTitle: string;
  status: CoachExecutionStatus;
  targetDurationSeconds: number;
  elapsedSeconds: number;
  liveElapsedSeconds: number;
  durationSeconds: number | null;
  startedAt: string;
  resumedAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  courtLabel: string;
  coachRating: number | null;
  coachComment: string;
  revision: number;
  assignees: CoachWorkoutAssignee[];
}

export interface CoachWorkoutPlan {
  id: string;
  trainingSessionId: string;
  title: string;
  status: CoachWorkoutPlanStatus;
  startedAt: string | null;
  completedAt: string | null;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  items: CoachWorkoutPlanItem[];
  activeExecution: CoachExerciseExecution | null;
  executions: CoachExerciseExecution[];
}

export interface CoachWorkoutWorkspaceData {
  session: CoachTrainingSession;
  plan: CoachWorkoutPlan;
  exercises: CoachExerciseSummary[];
  eligibleParticipants: CoachTrainingParticipant[];
  serverNow: string;
}
