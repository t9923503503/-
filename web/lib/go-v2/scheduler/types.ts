export const SCHEDULE_SOLVER_VERSION = 'lpv_scheduler_v3' as const;
export const SCHEDULE_QUANTUM_MINUTES = 5 as const;

export type ScheduleSolverStatus =
  | 'feasible'
  | 'feasible_with_warnings'
  | 'infeasible'
  | 'timeout';

export type ScheduleRefereeMode = 'court_judge' | 'working_team' | 'hybrid' | 'none';

export type ScheduleConflictCode =
  | 'INVALID_SESSION_WINDOW'
  | 'INVALID_QUANTUM'
  | 'COURT_COUNT_OUT_OF_RANGE'
  | 'DUPLICATE_COURT_ID'
  | 'COURT_AVAILABILITY_INVALID'
  | 'COURT_FULLY_CLOSED'
  | 'NO_ACTIVE_COURTS'
  | 'DUPLICATE_MATCH_ID'
  | 'INVALID_DURATION'
  | 'DURATION_ROUNDED'
  | 'INVALID_TEAM_ID'
  | 'INVALID_PLAYER_ID'
  | 'UNKNOWN_DEPENDENCY'
  | 'SELF_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  | 'INVALID_DEPENDENCY_GAP'
  | 'INVALID_TIME_CONSTRAINT'
  | 'UNKNOWN_AFFINITY_COURT'
  | 'INVALID_AFFINITY_PENALTY'
  | 'INVALID_COURT_POLICY'
  | 'UNKNOWN_POLICY_COURT'
  | 'TIER_COURT_POLICY_UNAVAILABLE'
  | 'TIER_COURT_POLICY_VIOLATION'
  | 'TIER_COURT_FALLBACK_USED'
  | 'TIER_COURT_CAPACITY_DEFICIT'
  | 'LOCKED_COURT_UNKNOWN'
  | 'LOCKED_TIME_MISALIGNED'
  | 'LOCKED_OUTSIDE_AVAILABILITY'
  | 'LOCKED_ASSIGNMENT_CONFLICT'
  | 'NO_COURT_WINDOW_FITS_DURATION'
  | 'COURT_MINUTES_LOWER_BOUND_EXCEEDED'
  | 'CRITICAL_PATH_LOWER_BOUND_EXCEEDED'
  | 'NO_READY_MATCH'
  | 'NO_FEASIBLE_PLACEMENT'
  | 'MISSING_ASSIGNMENT'
  | 'UNKNOWN_ASSIGNMENT_MATCH'
  | 'DUPLICATE_ASSIGNMENT'
  | 'ASSIGNMENT_TIME_INVALID'
  | 'ASSIGNMENT_DURATION_MISMATCH'
  | 'ASSIGNMENT_CONDITIONAL_MISMATCH'
  | 'ASSIGNMENT_TIME_MISALIGNED'
  | 'ASSIGNMENT_COURT_UNKNOWN'
  | 'COURT_UNAVAILABLE'
  | 'COURT_OVERLAP'
  | 'TEAM_OVERLAP'
  | 'TEAM_REST'
  | 'PLAYER_OVERLAP'
  | 'PLAYER_REST'
  | 'DEPENDENCY_ORDER'
  | 'NOT_BEFORE_VIOLATION'
  | 'DEADLINE_EXCEEDED'
  | 'LOCKED_ASSIGNMENT_CHANGED'
  | 'REFEREE_REQUIREMENT_MISSING'
  | 'REFEREE_SOURCE_UNKNOWN'
  | 'REFEREE_SOURCE_ORDER'
  | 'REFEREE_SAME_COURT_REQUIRED'
  | 'REFEREE_TEAM_OVERLAP'
  | 'REFEREE_REST'
  | 'REFEREE_ASSIGNMENT_INVALID'
  | 'HYBRID_REFEREE_FALLBACK'
  | 'TIMEOUT_OPERATION_BUDGET'
  | 'TIMEOUT_WALL_CLOCK';

export interface ScheduleConflict {
  code: ScheduleConflictCode;
  severity: 'error' | 'warning';
  message: string;
  matchIds?: string[];
  courtId?: string;
  teamId?: string;
  playerId?: string;
  at?: string;
  details?: Record<string, unknown>;
}

export interface ScheduleTimeRange {
  start: string;
  end: string;
}

export interface ScheduleCourtInput {
  id: string;
  label?: string;
  /** Omitted means the entire session window; an explicit empty array closes the court. */
  availability?: ScheduleTimeRange[];
}

export type ScheduleTierProfile = 'hard_light' | 'hard_medium_light';
export type ScheduleCourtPolicyMode = 'neutral' | 'strict' | 'approved_overflow';

/**
 * Immutable, concrete court binding produced by a versioned court-policy
 * strategy. The scheduler never infers permission from soft affinity scores.
 */
export interface ScheduleCourtPolicyBinding {
  code: 'lpv_tier_courts_v1';
  mode: ScheduleCourtPolicyMode;
  tierProfile: ScheduleTierProfile;
  allowedCourtIds: string[];
  preferredCourtIds: string[];
  /**
   * Courts absent from this map are permitted for the whole match window.
   * A listed court is usable only when the complete assignment fits one of
   * these immutable director-approved exception windows.
   */
  exceptionCourtWindows?: Record<string, ScheduleTimeRange[]>;
}

export interface ScheduleDependencyInput {
  matchId: string;
  /** Additional hard gap after the dependency, independent of team rest. */
  minGapMinutes?: number;
}

export interface SchedulePlacementReference {
  courtId: string;
  start: string;
}

export type ScheduleRefereeRequirement =
  | { kind: 'none' }
  | { kind: 'court_judge'; isFallback?: boolean }
  | { kind: 'fixed_team'; teamId: string }
  | {
      kind: 'idle_team_candidates';
      /** Ordered preference list; repair passes may select a later eligible team. */
      candidateTeamIds: string[];
    }
  | { kind: 'loser_previous_same_court'; sourceMatchId: string };

export interface ScheduleMatchInput {
  id: string;
  /** Nominal duration; the compiler rounds it up to the five-minute quantum. */
  durationMinutes: number;
  /**
   * All teams that can occupy this match. For an unresolved bracket match this
   * is the conservative union of possible participants.
   */
  teamIds: string[];
  /**
   * All players that can occupy this match, across every possible team route.
   * This optional conservative union prevents one person from being scheduled
   * simultaneously in different divisions that use different team ids.
   */
  playerIds?: string[];
  dependencies?: Array<string | ScheduleDependencyInput>;
  stageKind?: 'pool' | 'playoff' | 'placement' | 'other';
  tier?: 'hard' | 'medium' | 'light' | null;
  stagePriority?: number;
  minRestMinutes?: number;
  softRestMinutes?: number;
  notBefore?: string;
  mustEndBy?: string;
  locked?: SchedulePlacementReference;
  published?: SchedulePlacementReference;
  conditional?: boolean;
  /** Lower values are better. Missing courts have zero penalty. */
  courtAffinityPenalties?: Record<string, number>;
  /** Hard court permission; overflow is legal only when this binding says so. */
  courtPolicy?: ScheduleCourtPolicyBinding;
  refereeRequirement?: ScheduleRefereeRequirement;
}

export interface ScheduleRefereePolicyInput {
  mode: ScheduleRefereeMode;
  /** Rest required before a team can play after completing referee duty. */
  minRestAfterRefMinutes?: number;
}

export interface ScheduleSolverOptions {
  /** V1 accepts only five minutes, but keeps this explicit in snapshots. */
  quantumMinutes?: number;
  beamWidth?: number;
  topK?: number;
  maxExpandedStates?: number;
  maxWallMs?: number;
  /** Deterministic referee nogood/repair restarts, from 0 through 8. */
  maxRepairPasses?: number;
}

export interface ScheduleSolverInput {
  sessionId?: string;
  timezone?: string;
  window: ScheduleTimeRange;
  courts: ScheduleCourtInput[];
  matches: ScheduleMatchInput[];
  referee?: ScheduleRefereePolicyInput;
  options?: ScheduleSolverOptions;
}

export type ScheduleRefereeAssignment =
  | { kind: 'none'; reservedTeamIds: [] }
  | { kind: 'court_judge'; reservedTeamIds: []; isFallback?: boolean }
  | { kind: 'fixed_team'; reservedTeamIds: [string] }
  | {
      kind: 'loser_previous_same_court';
      sourceMatchId: string;
      /** Both potential losers are reserved until the actual result is known. */
      reservedTeamIds: string[];
    };

export interface ScheduleAssignment {
  matchId: string;
  courtId: string;
  start: string;
  end: string;
  durationMinutes: number;
  conditional: boolean;
  referee: ScheduleRefereeAssignment;
}

export interface ScheduleObjective {
  publishedMoves: number;
  overtimeMinutes: number;
  /** Largest accumulated soft-rest deficit of any team/player resource. */
  maxSoftRestDeficitMinutes: number;
  softRestDeficitMinutes: number;
  makespanMinutes: number;
  refereeFallbacks: number;
  courtAffinityPenalty: number;
  courtSwitches: number;
  /** Difference between the most and least assigned team-referee loads. */
  refereeLoadSpread: number;
}

export interface ScheduleSolverMetrics {
  elapsedMs: number;
  expandedStates: number;
  candidateEvaluations: number;
  beamPeak: number;
  repairPasses: number;
  scheduledMatches: number;
  totalMatches: number;
}

export interface ScheduleCourtDiagnostic {
  courtId: string;
  availableMinutes: number;
  scheduledMinutes: number;
  assignmentCount: number;
  utilizationPermille: number;
  fullyClosed: boolean;
}

export interface ScheduleTierCourtDiagnostic {
  tier: 'hard' | 'medium' | 'light' | 'neutral';
  assignmentCount: number;
  preferredAssignments: number;
  fallbackAssignments: number;
  policyViolationAssignments: number;
}

export interface ScheduleTeamTimelineDiagnostic {
  teamId: string;
  matchIds: string[];
  games: number;
  minRestMinutes: number | null;
  maxWaitMinutes: number;
  softRestDeficitMinutes: number;
  courtSwitches: number;
}

export interface ScheduleRefereeBalanceDiagnostic {
  dutiesByTeam: Array<{ teamId: string; duties: number }>;
  minDuties: number;
  maxDuties: number;
  spread: number;
}

export interface ScheduleDiagnostics {
  courts: ScheduleCourtDiagnostic[];
  tiers: ScheduleTierCourtDiagnostic[];
  teamTimelines: ScheduleTeamTimelineDiagnostic[];
  refereeBalance: ScheduleRefereeBalanceDiagnostic;
}

export interface ScheduleSolverResult {
  status: ScheduleSolverStatus;
  publishable: boolean;
  solverVersion: typeof SCHEDULE_SOLVER_VERSION;
  inputHash: string;
  scheduleHash: string | null;
  assignments: ScheduleAssignment[];
  objective: ScheduleObjective | null;
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
  metrics: ScheduleSolverMetrics;
  diagnostics: ScheduleDiagnostics | null;
}

export interface ScheduleValidationOptions {
  /** Used by preflight/solver for locked reservations. Public validation is full by default. */
  allowPartial?: boolean;
}

export interface ScheduleValidationResult {
  valid: boolean;
  publishable: boolean;
  inputHash: string;
  scheduleHash: string | null;
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
  objective: ScheduleObjective | null;
  diagnostics: ScheduleDiagnostics | null;
}

export interface SchedulePreflightResult {
  valid: boolean;
  inputHash: string;
  topologicalOrder: string[];
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
}
