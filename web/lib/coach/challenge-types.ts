import type { CoachAthleteSummary, CoachSkill } from './types';

export const COACH_CHALLENGE_TYPES = ['control', 'training', 'competitive'] as const;
export const COACH_CHALLENGE_SCORING_TYPES = ['count', 'time', 'distance', 'score', 'percent', 'custom'] as const;

export type CoachChallengeType = (typeof COACH_CHALLENGE_TYPES)[number];
export type CoachChallengeScoringType = (typeof COACH_CHALLENGE_SCORING_TYPES)[number];

export interface CoachChallengeIssueLink {
  id: string;
  title: string;
  skillName: string | null;
}

export interface CoachChallengeSummary {
  id: string;
  title: string;
  description: string;
  type: CoachChallengeType;
  scoringType: CoachChallengeScoringType;
  attemptCount: number;
  maxScore: number | null;
  unitLabel: string;
  higherIsBetter: boolean;
  repeatIntervalDays: number | null;
  archived: boolean;
  primarySkill: CoachSkill | null;
  skillCount: number;
  issueCount: number;
  attemptTotal: number;
  athleteTotal: number;
  updatedAt: string;
}

export interface CoachChallengeAttempt {
  id: string;
  challengeId: string;
  playerId: string;
  athleteName: string;
  athletePhotoUrl: string;
  trainingSessionId: string | null;
  trainingSessionTitle: string | null;
  startedAt: string;
  completedAt: string;
  score: number;
  maxScore: number | null;
  details: Record<string, unknown>;
  coachComment: string;
  isPersonalRecord: boolean;
  deltaFromPrevious: number | null;
}

export interface CoachChallengeDetail extends CoachChallengeSummary {
  metrics: string[];
  rules: string[];
  skills: CoachSkill[];
  issues: CoachChallengeIssueLink[];
  attempts: CoachChallengeAttempt[];
}

export interface CoachChallengeReminder {
  challengeId: string;
  challengeTitle: string;
  playerId: string;
  athleteName: string;
  athletePhotoUrl: string;
  issueTitle: string;
  dueAt: string;
  daysOverdue: number;
  hasAttempt: boolean;
}

export interface CoachAthleteChallengeSummary {
  attempts: CoachChallengeAttempt[];
  personalRecords: Array<{ challengeId: string; title: string; score: number; maxScore: number | null; unitLabel: string }>;
  reminders: CoachChallengeReminder[];
}

export interface CoachChallengeWorkspaceOptions {
  athletes: CoachAthleteSummary[];
  sessions: Array<{ id: string; title: string; startsAt: string }>;
}
