export const COACH_EXERCISE_CATEGORIES = [
  'warmup',
  'ball_control',
  'reception',
  'setting',
  'attack',
  'serve',
  'defense',
  'block',
  'transitions',
  'tactics',
  'game',
  'physical',
  'coordination',
  'combined',
] as const;

export const COACH_EXERCISE_LEVELS = ['all', 'light', 'medium', 'hard'] as const;
export const COACH_EXERCISE_INTENSITIES = ['low', 'medium', 'high'] as const;
export const COACH_EXERCISE_PHOTO_TYPES = ['correct', 'error', 'phase'] as const;
export const COACH_EXERCISE_VIDEO_PLATFORMS = ['youtube', 'instagram', 'telegram', 'own_video', 'other'] as const;

export type CoachExerciseCategory = (typeof COACH_EXERCISE_CATEGORIES)[number];
export type CoachExerciseLevel = (typeof COACH_EXERCISE_LEVELS)[number];
export type CoachExerciseIntensity = (typeof COACH_EXERCISE_INTENSITIES)[number];
export type CoachExercisePhotoType = (typeof COACH_EXERCISE_PHOTO_TYPES)[number];
export type CoachExerciseVideoPlatform = (typeof COACH_EXERCISE_VIDEO_PLATFORMS)[number];

export interface CoachExerciseSkillLink {
  id: string;
  name: string;
  parentName: string | null;
  isPrimary: boolean;
}

export interface CoachExerciseIssueLink {
  id: string;
  title: string;
  skillName: string | null;
  activeAthleteCount: number;
}

export interface CoachExercisePhoto {
  id: string;
  type: CoachExercisePhotoType;
  phaseIndex: number | null;
  title: string;
  caption: string;
  relatedIssueId: string | null;
  relatedIssueTitle: string | null;
  storageUrl: string;
  sortOrder: number;
  createdAt: string;
}

export interface CoachExerciseVideo {
  id: string;
  platform: CoachExerciseVideoPlatform;
  url: string;
  title: string;
  author: string;
  durationSeconds: number | null;
  language: string;
  timestampStartSec: number;
  coachNote: string;
  rating: number | null;
  tags: string[];
  sortOrder: number;
  createdAt: string;
}

export interface CoachExerciseSummary {
  id: string;
  title: string;
  shortDescription: string;
  goal: string;
  category: CoachExerciseCategory;
  levelCode: CoachExerciseLevel;
  playerMin: number;
  playerMax: number;
  courtCount: number;
  ballCount: number;
  durationMinutes: number;
  intensity: CoachExerciseIntensity;
  coachRequired: boolean;
  equipment: string[];
  tags: string[];
  favorite: boolean;
  recommended: boolean;
  coachRating: number | null;
  archived: boolean;
  updatedAt: string;
  primarySkill: CoachExerciseSkillLink | null;
  skillCount: number;
  issueCount: number;
  photoCount: number;
  videoCount: number;
  coverPhotoUrl: string;
}

export interface CoachExerciseDetail extends CoachExerciseSummary {
  organization: string;
  steps: string[];
  coachCues: string[];
  typicalErrors: string[];
  progression: string;
  simplification: string;
  complication: string;
  variants: string[];
  coachComment: string;
  skills: CoachExerciseSkillLink[];
  issues: CoachExerciseIssueLink[];
  photos: CoachExercisePhoto[];
  videos: CoachExerciseVideo[];
}

export interface CoachIssueOption extends CoachExerciseIssueLink {
  description: string;
}

export interface CoachExerciseFilters {
  query?: string;
  category?: string;
  level?: string;
  skillId?: string;
  issueId?: string;
  players?: number | null;
  courtCount?: number | null;
  durationMax?: number | null;
  intensity?: string;
  coachRequired?: boolean | null;
  noEquipment?: boolean;
  favorite?: boolean;
  includeArchived?: boolean;
}
