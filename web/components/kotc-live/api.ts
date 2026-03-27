"use client";

import type {
  KotcCommandRequest,
  KotcCommandResponse,
  KotcCourtState,
  KotcJoinResult,
  KotcPresenceItem,
  KotcRosterEntry,
  KotcRound,
  KotcRoundAssignment,
  KotcSessionSummary,
  KotcSnapshot,
} from "./types";

const API_BASE = "/api/kotc";
const REQUEST_TIMEOUT_MS = 8_000;

function asNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asIdString(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    const data = (await res.json()) as T;
    return data;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutError = new Error(`${label} timeout`);
  (timeoutError as Error & { status?: number }).status = 408;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    return (await Promise.race([
      fetch(input, {
        ...init,
        credentials: "same-origin",
        signal: controller.signal,
      }),
      timeoutPromise,
    ])) as Response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function buildHeaders(seatToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (seatToken) {
    headers.Authorization = `Bearer ${seatToken}`;
    headers["X-KOTC-Seat-Token"] = seatToken;
  }
  return headers;
}

function normalizeCourt(raw: unknown, fallbackIdx: number): KotcCourtState {
  const obj = asObject(raw);
  return {
    courtIdx: asNumber(obj.courtIdx ?? obj.court_idx, fallbackIdx),
    courtVersion: asNumber(obj.courtVersion ?? obj.court_version, 0),
    roundIdx: asNumber(obj.roundIdx ?? obj.round_idx, 0),
    scores: asObject(obj.scores),
    timerStatus: asString(obj.timerStatus ?? obj.timer_status, ""),
    timerDurationMs: asNumber(obj.timerDurationMs ?? obj.timer_duration_ms, 0),
    timerEndsAt: toTimestamp(obj.timerEndsAt ?? obj.timer_ends_at),
    timerPausedAt: toTimestamp(obj.timerPausedAt ?? obj.timer_paused_at),
    updatedAt: asString(obj.updatedAt ?? obj.updated_at, ""),
  };
}

function normalizePresence(raw: unknown): KotcPresenceItem {
  const obj = asObject(raw);
  const roleRaw = asString(obj.role, "viewer");
  const role = roleRaw === "hub" || roleRaw === "judge" ? roleRaw : "viewer";
  return {
    seatId: asIdString(obj.seatId ?? obj.seat_id),
    role,
    courtIdx:
      obj.courtIdx === null || obj.court_idx === null
        ? null
        : asNumber(obj.courtIdx ?? obj.court_idx, 0),
    displayName: asString(obj.displayName ?? obj.display_name),
    isOnline:
      typeof obj.isOnline === "boolean"
        ? obj.isOnline
        : typeof obj.is_online === "boolean"
          ? obj.is_online
          : undefined,
    leaseUntil: asString(obj.leaseUntil ?? obj.lease_until) || null,
    lastSeenAt: asString(obj.lastSeenAt ?? obj.last_seen_at) || null,
  };
}

function normalizeSnapshot(raw: unknown, fallbackSessionId: string): KotcSnapshot {
  const obj = asObject(raw);
  const sessionObj = asObject(obj.session);
  const snapshotObj = Object.keys(sessionObj).length > 0 ? sessionObj : obj;
  const courtsRaw = Array.isArray(obj.courts) ? {} : asObject(obj.courts);
  const courts: Record<number, KotcCourtState> = {};

  for (const [key, value] of Object.entries(courtsRaw)) {
    const idx = asNumber(key, -1);
    if (idx >= 0) courts[idx] = normalizeCourt(value, idx);
  }
  const courtsList = asArray(
    (Array.isArray(obj.courts) ? obj.courts : null) ??
      obj.courtsList ??
      obj.courts_list ??
      obj.courtsArray ??
      obj.courts_array,
  );
  for (const value of courtsList) {
    const normalized = normalizeCourt(value, 0);
    courts[normalized.courtIdx] = normalized;
  }

  const presence = asArray(obj.presence ?? obj.seats ?? obj.items ?? obj.data).map(normalizePresence);

  return {
    sessionId: asString(snapshotObj.sessionId ?? snapshotObj.session_id, fallbackSessionId),
    sessionVersion: asNumber(snapshotObj.sessionVersion ?? snapshotObj.session_version, 0),
    structureEpoch: asNumber(snapshotObj.structureEpoch ?? snapshotObj.structure_epoch, 0),
    phase: asString(snapshotObj.phase, ""),
    nc: asNumber(snapshotObj.nc, Math.max(1, Object.keys(courts).length || 4)),
    courts,
    presence,
    global: asObject(obj.global ?? snapshotObj.state ?? snapshotObj.state_json),
  };
}

function normalizeSessionSummary(raw: unknown): KotcSessionSummary {
  const obj = asObject(raw);
  return {
    sessionId: asString(obj.sessionId ?? obj.session_id),
    tournamentId: asString(obj.tournamentId ?? obj.tournament_id),
    title: asString(obj.title ?? obj.name),
    status: asString(obj.status),
    phase: asString(obj.phase),
    nc: asNumber(obj.nc, 4),
    updatedAt: asString(obj.updatedAt ?? obj.updated_at),
  };
}

function normalizeRosterEntry(raw: unknown): KotcRosterEntry {
  const obj = asObject(raw);
  return {
    id: asString(obj.id),
    tournamentId: asString(obj.tournamentId ?? obj.tournament_id),
    tournamentParticipantId: asString(obj.tournamentParticipantId ?? obj.tournament_participant_id) || null,
    playerId: asString(obj.playerId ?? obj.player_id) || null,
    displayName: asString(obj.displayName ?? obj.display_name),
    seed: obj.seed == null ? null : asNumber(obj.seed),
    confirmed: obj.confirmed == null ? true : Boolean(obj.confirmed),
    active: obj.active == null ? true : Boolean(obj.active),
    dropped: obj.dropped == null ? false : Boolean(obj.dropped),
  };
}

function normalizeRoundAssignment(raw: unknown): KotcRoundAssignment {
  const obj = asObject(raw);
  return {
    assignmentId: asString(obj.assignmentId ?? obj.assignment_id),
    rosterId: asString(obj.rosterId ?? obj.roster_id),
    displayName: asString(obj.displayName ?? obj.display_name),
    seed: obj.seed == null ? null : asNumber(obj.seed),
    courtIdx: asNumber(obj.courtIdx ?? obj.court_idx, 1),
    slotIdx: asNumber(obj.slotIdx ?? obj.slot_idx, 1),
    levelIdx: asNumber(obj.levelIdx ?? obj.level_idx, 1),
  };
}

function normalizeRound(raw: unknown): KotcRound {
  const obj = asObject(raw);
  const stageRaw = asString(obj.stageType ?? obj.stage_type, "round1");
  const stageType =
    stageRaw === "round2" || stageRaw === "final" ? stageRaw : "round1";
  return {
    id: asString(obj.id),
    tournamentId: asString(obj.tournamentId ?? obj.tournament_id),
    roundNo: asNumber(obj.roundNo ?? obj.round_no, 1),
    stageType,
    status: asString(obj.status, "draft"),
    levelCount: asNumber(obj.levelCount ?? obj.level_count, 1),
    sourceRoundId: asString(obj.sourceRoundId ?? obj.source_round_id) || null,
    assignments: asArray(obj.assignments).map(normalizeRoundAssignment),
  };
}

function normalizeJoin(raw: unknown, fallbackSessionId: string): KotcJoinResult {
  const obj = asObject(raw);
  const seatObj = asObject(obj.seat);
  const roleRaw = asString(seatObj.role ?? obj.role, "viewer");
  const role = roleRaw === "hub" || roleRaw === "judge" ? roleRaw : "viewer";
  const seatToken = asString(obj.seatToken ?? obj.seat_token);
  const seat = {
    seatId: asIdString(seatObj.seatId ?? seatObj.seat_id),
    role,
    courtIdx:
      seatObj.courtIdx === null || seatObj.court_idx === null
        ? null
        : asNumber(seatObj.courtIdx ?? seatObj.court_idx, 0),
    displayName: asString(seatObj.displayName ?? seatObj.display_name),
  } as const;
  const snapshot = normalizeSnapshot(obj.snapshot ?? obj, fallbackSessionId);
  return {
    sessionId: snapshot.sessionId || fallbackSessionId,
    seatToken,
    seat,
    snapshot,
  };
}

export async function listSessions(): Promise<KotcSessionSummary[]> {
  const res = await fetchWithTimeout(`${API_BASE}/sessions/active`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  }, "KOTC Live bootstrap");
  if (!res.ok) {
    const error = new Error(`Failed to load sessions: ${res.status}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  const data = await readJson<unknown>(res);
  const rawList = Array.isArray(data)
    ? data
    : asArray(asObject(data).sessions ?? asObject(data).items ?? asObject(data).data);
  return rawList.map(normalizeSessionSummary).filter((item) => item.sessionId);
}

export async function joinSession(input: {
  sessionId: string;
  roleHint?: "hub" | "judge" | "viewer";
  courtIdx?: number;
  displayName?: string;
  deviceId: string;
  reclaim?: boolean;
  seatToken?: string | null;
}): Promise<KotcJoinResult> {
  const body = {
    role: input.roleHint,
    roleHint: input.roleHint,
    courtIdx: input.courtIdx,
    court_idx: input.courtIdx,
    displayName: input.displayName,
    display_name: input.displayName,
    deviceId: input.deviceId,
    device_id: input.deviceId,
    reclaim: Boolean(input.reclaim),
  };
  const res = await fetchWithTimeout(`${API_BASE}/sessions/${encodeURIComponent(input.sessionId)}/join`, {
    method: "POST",
    headers: buildHeaders(input.seatToken || undefined),
    body: JSON.stringify(body),
  }, "KOTC Live seat join");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    const message =
      asString(asObject(data).error) ||
      asString(asObject(data).message) ||
      `Join failed (${res.status})`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  const dataObj = asObject(data);
  if (dataObj.joined === false) {
    const occupiedBy = asObject(dataObj.occupiedBy ?? dataObj.occupied_by);
    const occupiedName = asString(occupiedBy.displayName ?? occupiedBy.display_name);
    const reason = asString(dataObj.reason, "Join failed");
    throw new Error(occupiedName ? `${reason}: ${occupiedName}` : reason);
  }
  return normalizeJoin(data, input.sessionId);
}

export async function releaseSeat(sessionId: string, seatToken: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/release`, {
    method: "POST",
    headers: buildHeaders(seatToken),
    body: JSON.stringify({}),
  }, "KOTC Live seat release");
  if (!res.ok) {
    const data = await readJson<unknown>(res);
    throw new Error(asString(asObject(data).error, `Release failed (${res.status})`));
  }
}

export async function fetchSnapshot(
  sessionId: string,
  scope: "global" | "full",
  seatToken?: string | null,
): Promise<KotcSnapshot> {
  const url = `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/snapshot?scope=${scope}`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    cache: "no-store",
    headers: buildHeaders(seatToken || undefined),
  }, "KOTC Live snapshot");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Snapshot failed (${res.status})`));
  }
  return normalizeSnapshot(data, sessionId);
}

export async function fetchCourt(
  sessionId: string,
  courtIdx: number,
  seatToken?: string | null,
): Promise<KotcCourtState> {
  const url = `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/courts/${courtIdx}`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    cache: "no-store",
    headers: buildHeaders(seatToken || undefined),
  }, "KOTC Live court snapshot");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Court snapshot failed (${res.status})`));
  }
  return normalizeCourt(data, courtIdx);
}

export async function fetchPresence(
  sessionId: string,
  seatToken?: string | null,
): Promise<KotcPresenceItem[]> {
  const url = `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/presence`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    cache: "no-store",
    headers: buildHeaders(seatToken || undefined),
  }, "KOTC Live presence");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Presence failed (${res.status})`));
  }
  const list = Array.isArray(data)
    ? data
    : asArray(asObject(data).presence ?? asObject(data).seats ?? asObject(data).items ?? asObject(data).data);
  return list.map(normalizePresence);
}

export async function sendCommand(
  request: KotcCommandRequest,
  seatToken?: string | null,
): Promise<KotcCommandResponse> {
  const commandId =
    request.commandId ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const body = {
    command_id: commandId,
    commandType: request.commandType,
    command_type: request.commandType,
    scope: request.scope,
    courtIdx: request.courtIdx,
    court_idx: request.courtIdx,
    expectedVersion: request.expectedVersion,
    expected_version: request.expectedVersion,
    expectedCourtVersion: request.expectedCourtVersion,
    expected_court_version: request.expectedCourtVersion,
    expectedStructureEpoch: request.expectedStructureEpoch,
    expected_structure_epoch: request.expectedStructureEpoch,
    payload: request.payload ?? {},
  };
  const res = await fetchWithTimeout(`${API_BASE}/sessions/${encodeURIComponent(request.sessionId)}/commands`, {
    method: "POST",
    headers: buildHeaders(seatToken || undefined),
    body: JSON.stringify(body),
  }, "KOTC Live command");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    const message =
      asString(asObject(data).error) ||
      asString(asObject(data).message) ||
      `Command failed (${res.status})`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = res.status;
    (error as Error & { payload?: unknown }).payload = data;
    throw error;
  }
  const obj = asObject(data);
  return {
    success: Boolean(obj.success ?? true),
    appliedCommand: asString(obj.appliedCommand ?? obj.applied_command),
    sessionVersion: asNumber(obj.sessionVersion ?? obj.session_version, 0),
    structureEpoch: asNumber(obj.structureEpoch ?? obj.structure_epoch, 0),
    courtVersion: asNumber(obj.courtVersion ?? obj.court_version, 0),
    divisionVersion: asNumber(obj.divisionVersion ?? obj.division_version, 0),
    delta: obj.delta ? asObject(obj.delta) : null,
    serverNow: asNumber(obj.serverNow ?? obj.server_now, Date.now()),
  };
}

export async function fetchTournamentRoster(tournamentId: string): Promise<KotcRosterEntry[]> {
  const res = await fetchWithTimeout(`${API_BASE}/tournaments/${encodeURIComponent(tournamentId)}/roster`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  }, "KOTC roster");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Roster load failed (${res.status})`));
  }
  return asArray(asObject(data).roster).map(normalizeRosterEntry);
}

export async function saveTournamentRoster(
  tournamentId: string,
  roster: Array<{ displayName: string; playerId?: string | null; seed?: number | null; confirmed?: boolean; active?: boolean; dropped?: boolean }>
): Promise<KotcRosterEntry[]> {
  const res = await fetchWithTimeout(`${API_BASE}/tournaments/${encodeURIComponent(tournamentId)}/roster`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify({ roster }),
  }, "KOTC roster save");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Roster save failed (${res.status})`));
  }
  return asArray(asObject(data).roster).map(normalizeRosterEntry);
}

export async function fetchTournamentRounds(tournamentId: string): Promise<KotcRound[]> {
  const res = await fetchWithTimeout(`${API_BASE}/tournaments/${encodeURIComponent(tournamentId)}/rounds`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  }, "KOTC rounds");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Rounds load failed (${res.status})`));
  }
  return asArray(asObject(data).rounds).map(normalizeRound);
}

export async function generateTournamentRound1(tournamentId: string): Promise<KotcRound> {
  const res = await fetchWithTimeout(`${API_BASE}/tournaments/${encodeURIComponent(tournamentId)}/rounds/round1/generate`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({}),
  }, "KOTC round 1 generation");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Round 1 generation failed (${res.status})`));
  }
  return normalizeRound(asObject(data).round);
}

export async function generateTournamentRound2(tournamentId: string): Promise<KotcRound> {
  const res = await fetchWithTimeout(`${API_BASE}/tournaments/${encodeURIComponent(tournamentId)}/rounds/round2/generate`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({}),
  }, "KOTC round 2 generation");
  const data = await readJson<unknown>(res);
  if (!res.ok) {
    throw new Error(asString(asObject(data).error, `Round 2 generation failed (${res.status})`));
  }
  return normalizeRound(asObject(data).round);
}
