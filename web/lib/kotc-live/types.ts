export type SeatRole = 'hub' | 'judge';

export type SessionStatus = 'active' | 'paused' | 'finished' | 'cancelled';

export type CommandScope = 'session' | 'structure' | 'court' | 'division' | 'global' | 'seat';

export interface SeatTokenPayload {
  session_id: string;
  seat_id: number;
  role: SeatRole;
  court_idx: number | null;
  device_id: string;
  iat: number;
  exp: number;
  seat_nonce: string;
}

export interface LiveSeat {
  seatId: number;
  sessionId: string;
  role: SeatRole;
  courtIdx: number | null;
  deviceId: string;
  displayName: string;
  seatNonce: string;
  leaseUntil: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface LiveSessionSummary {
  sessionId: string;
  tournamentId: string;
  status: SessionStatus;
  phase: string;
  nc: number;
  ppc: number;
  sessionVersion: number;
  structureEpoch: number;
  updatedAt: string;
  judgeCount: number;
}

export interface LiveCourtState {
  sessionId: string;
  courtIdx: number;
  courtVersion: number;
  roundIdx: number;
  rosterM: unknown[];
  rosterW: unknown[];
  scores: Record<string, unknown>;
  activeSlotIdx: number;
  activeServerPlayerIdx: number | null;
  waitingServerPlayerIdx: number | null;
  serverPlayerIdxBySlot: Array<number | null>;
  timerStatus: 'idle' | 'running' | 'paused';
  timerDurationMs: number;
  timerEndsAt: string | null;
  timerPausedAt: string | null;
  lastCommandId: string | null;
  lastUpdatedAt: string;
  lastUpdatedBy: string | null;
}

export interface LiveDivisionState {
  sessionId: string;
  divisionKey: string;
  divisionVersion: number;
  roster: unknown[];
  scores: Record<string, unknown>;
  roundIdx: number;
  updatedAt: string;
}

export interface LivePresenceSeat {
  seatId: number;
  role: SeatRole;
  courtIdx: number | null;
  deviceId: string;
  displayName: string;
  leaseUntil: string;
  lastSeenAt: string;
  isOnline: boolean;
}

export interface SessionSnapshot {
  session: {
    sessionId: string;
    tournamentId: string;
    status: SessionStatus;
    phase: string;
    nc: number;
    ppc: number;
    sessionVersion: number;
    structureEpoch: number;
    state: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  courts: LiveCourtState[];
  divisions: LiveDivisionState[];
  presence: LivePresenceSeat[];
  serverNow: number;
}

export interface JoinSeatInput {
  role: SeatRole;
  courtIdx: number | null;
  deviceId: string;
  displayName: string;
}

export interface JoinSeatResult {
  joined: boolean;
  reason?: 'occupied' | 'invalid_court' | 'session_closed';
  occupiedBy?: {
    displayName: string;
    deviceId: string;
    leaseUntil: string;
  };
  seat?: LiveSeat;
  seatToken?: string;
  snapshot?: SessionSnapshot;
}

export interface CommandInput {
  commandId: string;
  commandType: string;
  expectedCourtVersion?: number | null;
  expectedStructureEpoch?: number | null;
  payload?: Record<string, unknown>;
}

export interface CommandExecutionResult {
  success: boolean;
  appliedCommand: string;
  sessionVersion: number;
  structureEpoch: number;
  courtVersion: number | null;
  divisionVersion: number | null;
  delta: Record<string, unknown> | null;
  serverNow: number;
  idempotent?: boolean;
}

export interface CommandActorAdmin {
  kind: 'admin';
  actorId: string;
}

export interface CommandActorSeat {
  kind: 'seat';
  token: SeatTokenPayload;
}

export type CommandActor = CommandActorAdmin | CommandActorSeat;
