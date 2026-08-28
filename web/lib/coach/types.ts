export const COACH_LEVELS = ['light', 'medium', 'hard'] as const;
export const COACH_ATHLETE_STATUSES = ['active', 'paused', 'injured', 'archived'] as const;
export const COACH_ISSUE_STATUSES = ['suggested', 'active', 'improving', 'monitoring', 'resolved', 'archived'] as const;
export const COACH_SOURCES = ['coach', 'challenge', 'video_ai', 'ai_assistant', 'import'] as const;

export type CoachLevel = (typeof COACH_LEVELS)[number];
export type CoachAthleteStatus = (typeof COACH_ATHLETE_STATUSES)[number];
export type CoachIssueStatus = (typeof COACH_ISSUE_STATUSES)[number];
export type CoachSource = (typeof COACH_SOURCES)[number];
export type CoachTrend = 'up' | 'flat' | 'down' | 'new';

export interface CoachSkill {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
}

export interface CoachSkillEvaluation {
  id: string;
  skillId: string;
  skillName: string;
  parentName: string | null;
  score: number;
  confidence: number;
  source: CoachSource;
  coachComment: string;
  evaluatedAt: string;
  evaluatedByActor: string;
}

export interface CoachAthleteIssue {
  id: string;
  issueId: string;
  skillId: string | null;
  skillName: string | null;
  title: string;
  description: string;
  priority: number;
  status: CoachIssueStatus;
  source: CoachSource;
  confidence: number;
  coachComment: string;
  detectedAt: string;
  resolvedAt: string | null;
  lastWorkedAt: string | null;
}

export interface CoachAthleteSummary {
  playerId: string;
  name: string;
  gender: 'M' | 'W';
  photoUrl: string;
  playerStatus: string;
  publicSkillLevel: string | null;
  tournamentsPlayed: number;
  rating: number;
  levelCode: CoachLevel;
  status: CoachAthleteStatus;
  joinedAt: string;
  goals: string;
  limitations: string;
  evaluationCount: number;
  activeIssueCount: number;
  criticalIssueCount: number;
  lastEvaluatedAt: string | null;
  topIssues: Array<{ id: string; title: string; priority: number }>;
}

export interface CoachAthleteDetail extends CoachAthleteSummary {
  evaluations: CoachSkillEvaluation[];
  issues: CoachAthleteIssue[];
}

export interface CoachCandidate {
  playerId: string;
  name: string;
  gender: 'M' | 'W';
  photoUrl: string;
  skillLevel: string | null;
  tournamentsPlayed: number;
}

export interface CoachDashboard {
  athleteCount: number;
  activeIssueCount: number;
  criticalIssueCount: number;
  unevaluatedCount: number;
  frequentIssues: Array<{ title: string; athleteCount: number; maxPriority: number }>;
  attention: Array<{
    playerId: string;
    name: string;
    photoUrl: string;
    reason: string;
    severity: 'critical' | 'important';
  }>;
}
