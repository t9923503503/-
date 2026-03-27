export type KotcRole = "hub" | "judge" | "viewer";

export type KotcConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

export interface KotcSessionSummary {
  sessionId: string;
  tournamentId?: string;
  title?: string;
  status?: string;
  phase?: string;
  nc: number;
  updatedAt?: string;
}

export interface KotcSeatInfo {
  seatId?: string;
  role: KotcRole;
  courtIdx: number | null;
  displayName?: string;
}

export interface KotcCourtState {
  courtIdx: number;
  courtVersion: number;
  roundIdx?: number;
  scores?: Record<string, unknown>;
  timerStatus?: string;
  timerDurationMs?: number;
  timerEndsAt?: number | null;
  timerPausedAt?: number | null;
  updatedAt?: string;
}

export interface KotcPresenceItem {
  seatId?: string;
  role: KotcRole;
  courtIdx: number | null;
  displayName?: string;
  isOnline?: boolean;
  leaseUntil?: string | null;
  lastSeenAt?: string | null;
}

export interface KotcSnapshot {
  sessionId: string;
  sessionVersion: number;
  structureEpoch: number;
  phase?: string;
  nc: number;
  courts: Record<number, KotcCourtState>;
  presence: KotcPresenceItem[];
  global?: Record<string, unknown> | null;
}

export interface KotcJoinResult {
  sessionId: string;
  seatToken: string;
  seat: KotcSeatInfo;
  snapshot: KotcSnapshot;
}

export interface KotcCommandRequest {
  sessionId: string;
  commandType: string;
  scope?: "global" | "court" | "division";
  courtIdx?: number;
  expectedVersion?: number;
  expectedCourtVersion?: number;
  expectedStructureEpoch?: number;
  payload?: Record<string, unknown>;
  commandId?: string;
}

export interface KotcCommandResponse {
  success: boolean;
  appliedCommand?: string;
  sessionVersion: number;
  structureEpoch: number;
  courtVersion?: number;
  divisionVersion?: number;
  delta?: Record<string, unknown> | null;
  serverNow?: number;
}

export interface KotcDeltaPacket {
  type: "delta";
  session_id: string;
  scope: "global" | "court" | "division";
  court_idx?: number;
  command_type?: string;
  session_version: number;
  structure_epoch?: number;
  court_version?: number;
  division_version?: number;
  delta?: Record<string, unknown> | null;
  serverNow?: number;
}

export interface KotcRosterEntry {
  id: string;
  tournamentId: string;
  tournamentParticipantId?: string | null;
  playerId?: string | null;
  displayName: string;
  seed?: number | null;
  confirmed: boolean;
  active: boolean;
  dropped: boolean;
}

export interface KotcRoundAssignment {
  assignmentId: string;
  rosterId: string;
  displayName: string;
  seed?: number | null;
  courtIdx: number;
  slotIdx: number;
  levelIdx: number;
}

export interface KotcRound {
  id: string;
  tournamentId: string;
  roundNo: number;
  stageType: "round1" | "round2" | "final";
  status: string;
  levelCount: number;
  sourceRoundId?: string | null;
  assignments: KotcRoundAssignment[];
}
