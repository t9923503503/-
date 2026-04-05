"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  fetchCourt,
  fetchPresence,
  fetchSnapshot,
  joinSession,
  listSessions,
  releaseSeat,
  sendCommand,
} from "./api";
import { KotcLiveSocket } from "./socket";
import type {
  KotcCommandRequest,
  KotcCommandResponse,
  KotcConnectionStatus,
  KotcCourtState,
  KotcDeltaPacket,
  KotcPresenceItem,
  KotcRole,
  KotcSessionSummary,
  KotcSnapshot,
} from "./types";

type SudyamMode = "boot" | "live" | "legacy";

interface StoredSeatInfo {
  sessionId: string;
  role: KotcRole;
  courtIdx: number | null;
  seatToken: string;
  displayName?: string;
}

interface KotcLiveState {
  mode: SudyamMode;
  loading: boolean;
  error: string | null;
  sessions: KotcSessionSummary[];
  selectedSessionId: string | null;
  role: KotcRole | null;
  courtIdx: number | null;
  seatToken: string | null;
  displayName: string;
  deviceId: string;
  sessionVersion: number;
  structureEpoch: number;
  phase: string;
  nc: number;
  ppc: number;
  courts: Record<number, KotcCourtState>;
  presence: KotcPresenceItem[];
  connectionStatus: KotcConnectionStatus;
  clockOffsetMs: number;
  lastServerNow: number | null;
  lastGapScope: "global" | "court" | null;
  legacyReason: string | null;
}

type Action =
  | { type: "setMode"; mode: SudyamMode; reason?: string | null }
  | { type: "setLoading"; loading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "hydrateClientIdentity"; displayName: string; deviceId: string }
  | { type: "setSessions"; sessions: KotcSessionSummary[] }
  | { type: "setSelectedSession"; sessionId: string | null }
  | { type: "setDisplayName"; displayName: string }
  | { type: "setConnectionStatus"; status: KotcConnectionStatus }
  | { type: "setClockOffset"; offsetMs: number; serverNow?: number }
  | { type: "setPresence"; presence: KotcPresenceItem[] }
  | { type: "applySnapshot"; snapshot: KotcSnapshot }
  | {
      type: "setSeat";
      role: KotcRole;
      courtIdx: number | null;
      seatToken: string;
      displayName?: string;
    }
  | { type: "clearSeat" }
  | { type: "upsertCourt"; court: KotcCourtState }
  | {
      type: "applyCommandAck";
      response: KotcCommandResponse;
      scope?: "global" | "court" | "division";
      courtIdx?: number;
    }
  | { type: "setGap"; scope: "global" | "court" | null };

const STORED_SEAT_KEY = "kotc_live_last_seat_v1";
const STORED_DISPLAY_NAME_KEY = "kotc_live_display_name";
const STORED_DEVICE_ID_KEY = "kotc_live_device_id";

function buildDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dev_${crypto.randomUUID()}`;
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStoredDeviceId(): string {
  if (typeof window === "undefined") return "dev_server";
  const stored = window.localStorage.getItem(STORED_DEVICE_ID_KEY);
  if (stored) return stored;
  const next = buildDeviceId();
  window.localStorage.setItem(STORED_DEVICE_ID_KEY, next);
  return next;
}

function getStoredDisplayName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORED_DISPLAY_NAME_KEY) || "";
}

function getStoredSeat(): StoredSeatInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORED_SEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSeatInfo;
    if (!parsed?.sessionId || !parsed?.seatToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredSeat(value: StoredSeatInfo | null): void {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(STORED_SEAT_KEY);
    return;
  }
  window.localStorage.setItem(STORED_SEAT_KEY, JSON.stringify(value));
}

function normalizeServerSlots(
  value: unknown,
  fallback: Array<number | null> | undefined,
  slotCount = 4,
): Array<number | null> {
  const source = Array.isArray(value) ? value : fallback ?? [];
  return Array.from({ length: slotCount }, (_, index) => {
    const candidate = source[index];
    const numeric = candidate == null ? null : Number(candidate);
    return numeric === 0 || numeric === 1 ? numeric : null;
  });
}

function deriveServeState(
  activeSlotIdxValue: unknown,
  serverSlotsValue: unknown,
  fallbackSlots: Array<number | null> | undefined,
  slotCount = 4,
): {
  activeSlotIdx: number;
  activeServerPlayerIdx: number | null;
  waitingServerPlayerIdx: number | null;
  serverPlayerIdxBySlot: Array<number | null>;
} {
  const serverPlayerIdxBySlot = normalizeServerSlots(serverSlotsValue, fallbackSlots, slotCount);
  const numericActive = Number(activeSlotIdxValue);
  const activeSlotIdx =
    Number.isInteger(numericActive) && numericActive >= 0 && numericActive < slotCount ? numericActive : 0;
  const waitingSlotIdx = slotCount > 1 ? (activeSlotIdx + 1) % slotCount : 0;
  return {
    activeSlotIdx,
    activeServerPlayerIdx: serverPlayerIdxBySlot[activeSlotIdx] ?? null,
    waitingServerPlayerIdx: serverPlayerIdxBySlot[waitingSlotIdx] ?? null,
    serverPlayerIdxBySlot,
  };
}

function mergeCourtPatch(
  previous: KotcCourtState | undefined,
  patch: Partial<KotcCourtState>,
  fallbackIdx: number,
): KotcCourtState {
  const serveState = deriveServeState(
    patch.activeSlotIdx ?? previous?.activeSlotIdx,
    patch.serverPlayerIdxBySlot,
    previous?.serverPlayerIdxBySlot,
  );
  return {
    courtIdx: patch.courtIdx ?? previous?.courtIdx ?? fallbackIdx,
    courtVersion: patch.courtVersion ?? previous?.courtVersion ?? 0,
    roundIdx: patch.roundIdx ?? previous?.roundIdx ?? 0,
    rosterM: patch.rosterM ?? previous?.rosterM ?? [],
    rosterW: patch.rosterW ?? previous?.rosterW ?? [],
    scores: patch.scores ?? previous?.scores ?? {},
    activeSlotIdx: serveState.activeSlotIdx,
    activeServerPlayerIdx: serveState.activeServerPlayerIdx,
    waitingServerPlayerIdx: serveState.waitingServerPlayerIdx,
    serverPlayerIdxBySlot: serveState.serverPlayerIdxBySlot,
    timerStatus: patch.timerStatus ?? previous?.timerStatus ?? "",
    timerDurationMs: patch.timerDurationMs ?? previous?.timerDurationMs ?? 0,
    timerEndsAt: patch.timerEndsAt ?? previous?.timerEndsAt ?? null,
    timerPausedAt: patch.timerPausedAt ?? previous?.timerPausedAt ?? null,
    updatedAt: patch.updatedAt ?? previous?.updatedAt ?? "",
  };
}

function parseCourtFromDelta(
  courtIdx: number,
  delta: Record<string, unknown> | null | undefined,
): Partial<KotcCourtState> {
  if (!delta) return {};
  const courtRaw =
    (delta.court as Record<string, unknown> | undefined) ??
    (delta.court_state as Record<string, unknown> | undefined) ??
    delta;
  const timerRaw =
    (courtRaw.timer as Record<string, unknown> | undefined) ??
    (courtRaw.timer_state as Record<string, unknown> | undefined) ??
    {};
  const serveRaw =
    (courtRaw.serve as Record<string, unknown> | undefined) ??
    (courtRaw.serve_state as Record<string, unknown> | undefined) ??
    {};
  const activeSlotSource =
    serveRaw.activeSlotIdx ??
    serveRaw.active_slot_idx ??
    courtRaw.activeSlotIdx ??
    courtRaw.active_slot_idx;
  return {
    courtIdx,
    courtVersion: Number(courtRaw.courtVersion ?? courtRaw.court_version ?? 0),
    roundIdx: Number(courtRaw.roundIdx ?? courtRaw.round_idx ?? 0),
    rosterM: Array.isArray(courtRaw.rosterM)
      ? courtRaw.rosterM
      : Array.isArray(courtRaw.roster_m)
        ? courtRaw.roster_m
        : Array.isArray(courtRaw.roster_m_json)
          ? courtRaw.roster_m_json
          : undefined,
    rosterW: Array.isArray(courtRaw.rosterW)
      ? courtRaw.rosterW
      : Array.isArray(courtRaw.roster_w)
        ? courtRaw.roster_w
        : Array.isArray(courtRaw.roster_w_json)
          ? courtRaw.roster_w_json
          : undefined,
    scores:
      typeof courtRaw.scores === "object" && courtRaw.scores
        ? (courtRaw.scores as Record<string, unknown>)
        : undefined,
    activeSlotIdx: activeSlotSource == null ? undefined : Number(activeSlotSource),
    serverPlayerIdxBySlot:
      Array.isArray(serveRaw.serverPlayerIdxBySlot)
        ? (serveRaw.serverPlayerIdxBySlot as Array<number | null>)
        : Array.isArray(serveRaw.server_player_idx_by_slot)
          ? (serveRaw.server_player_idx_by_slot as Array<number | null>)
          : Array.isArray(courtRaw.serverPlayerIdxBySlot)
            ? (courtRaw.serverPlayerIdxBySlot as Array<number | null>)
            : Array.isArray(courtRaw.server_player_idx_by_slot)
              ? (courtRaw.server_player_idx_by_slot as Array<number | null>)
              : undefined,
    timerStatus:
      typeof timerRaw.status === "string"
        ? timerRaw.status
        : typeof courtRaw.timerStatus === "string"
          ? courtRaw.timerStatus
          : typeof courtRaw.timer_status === "string"
            ? courtRaw.timer_status
          : undefined,
    timerDurationMs: Number(
      timerRaw.durationMs ??
        timerRaw.duration_ms ??
        courtRaw.timerDurationMs ??
        courtRaw.timer_duration_ms ??
        0
    ),
    timerEndsAt:
      typeof timerRaw.endsAt === "number"
        ? timerRaw.endsAt
        : typeof timerRaw.ends_at === "number"
          ? timerRaw.ends_at
          : typeof courtRaw.timerEndsAt === "number"
            ? courtRaw.timerEndsAt
            : typeof courtRaw.timer_ends_at === "number"
              ? courtRaw.timer_ends_at
              : typeof timerRaw.endsAt === "string"
                ? Date.parse(timerRaw.endsAt)
                : typeof timerRaw.ends_at === "string"
                  ? Date.parse(timerRaw.ends_at)
                  : typeof courtRaw.timerEndsAt === "string"
                    ? Date.parse(courtRaw.timerEndsAt)
                    : typeof courtRaw.timer_ends_at === "string"
                      ? Date.parse(courtRaw.timer_ends_at)
                      : undefined,
    timerPausedAt:
      typeof timerRaw.pausedAt === "number"
        ? timerRaw.pausedAt
        : typeof timerRaw.paused_at === "number"
          ? timerRaw.paused_at
          : typeof courtRaw.timerPausedAt === "number"
            ? courtRaw.timerPausedAt
            : typeof courtRaw.timer_paused_at === "number"
              ? courtRaw.timer_paused_at
              : typeof timerRaw.pausedAt === "string"
                ? Date.parse(timerRaw.pausedAt)
                : typeof timerRaw.paused_at === "string"
                  ? Date.parse(timerRaw.paused_at)
                  : typeof courtRaw.timerPausedAt === "string"
                    ? Date.parse(courtRaw.timerPausedAt)
                    : typeof courtRaw.timer_paused_at === "string"
                      ? Date.parse(courtRaw.timer_paused_at)
                      : undefined,
  };
}

function reducer(state: KotcLiveState, action: Action): KotcLiveState {
  switch (action.type) {
    case "setMode":
      return {
        ...state,
        mode: action.mode,
        legacyReason: action.reason ?? state.legacyReason,
      };
    case "setLoading":
      return { ...state, loading: action.loading };
    case "setError":
      return { ...state, error: action.error };
    case "hydrateClientIdentity":
      return {
        ...state,
        displayName: action.displayName,
        deviceId: action.deviceId,
      };
    case "setSessions":
      return { ...state, sessions: action.sessions };
    case "setSelectedSession":
      return {
        ...state,
        selectedSessionId: action.sessionId,
        sessionVersion: 0,
        structureEpoch: 0,
        courts: {},
        presence: [],
        phase: "",
        nc: 4,
        ppc: 4,
      };
    case "setDisplayName":
      return { ...state, displayName: action.displayName };
    case "setConnectionStatus":
      return { ...state, connectionStatus: action.status };
    case "setClockOffset":
      return { ...state, clockOffsetMs: action.offsetMs, lastServerNow: action.serverNow ?? state.lastServerNow };
    case "setPresence":
      return { ...state, presence: action.presence };
    case "applySnapshot":
      return {
        ...state,
        sessionVersion: action.snapshot.sessionVersion,
        structureEpoch: action.snapshot.structureEpoch,
        phase: action.snapshot.phase || state.phase,
        nc: action.snapshot.nc || state.nc,
        ppc: action.snapshot.ppc || state.ppc,
        courts: action.snapshot.courts,
        presence: action.snapshot.presence,
        lastGapScope: null,
      };
    case "setSeat":
      return {
        ...state,
        role: action.role,
        courtIdx: action.courtIdx,
        seatToken: action.seatToken,
        displayName: action.displayName ?? state.displayName,
      };
    case "clearSeat":
      return {
        ...state,
        role: null,
        courtIdx: null,
        seatToken: null,
        connectionStatus: "idle",
      };
    case "upsertCourt": {
      return {
        ...state,
        courts: {
          ...state.courts,
          [action.court.courtIdx]: mergeCourtPatch(state.courts[action.court.courtIdx], action.court, action.court.courtIdx),
        },
      };
    }
    case "applyCommandAck": {
      const next = {
        ...state,
        sessionVersion: action.response.sessionVersion || state.sessionVersion,
        structureEpoch: action.response.structureEpoch || state.structureEpoch,
        lastServerNow: action.response.serverNow ?? state.lastServerNow,
      };
      if (action.scope === "court" && typeof action.courtIdx === "number") {
        const patch = parseCourtFromDelta(action.courtIdx, action.response.delta);
        return {
          ...next,
          courts: {
            ...next.courts,
            [action.courtIdx]: mergeCourtPatch(next.courts[action.courtIdx], patch, action.courtIdx),
          },
        };
      }
      return next;
    }
    case "setGap":
      return { ...state, lastGapScope: action.scope };
    default:
      return state;
  }
}

const initialState: KotcLiveState = {
  mode: "boot",
  loading: true,
  error: null,
  sessions: [],
  selectedSessionId: null,
  role: null,
  courtIdx: null,
  seatToken: null,
  displayName: "",
  deviceId: "dev_pending",
  sessionVersion: 0,
  structureEpoch: 0,
  phase: "",
  nc: 4,
  ppc: 4,
  courts: {},
  presence: [],
  connectionStatus: "idle",
  clockOffsetMs: 0,
  lastServerNow: null,
  lastGapScope: null,
  legacyReason: null,
};

function toLegacyError(error: unknown): boolean {
  const status = Number((error as Error & { status?: number })?.status || 0);
  return status === 404 || status === 405 || status === 501;
}

export function useKotcLiveStore() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const stateRef = useRef(state);
  const socketRef = useRef<KotcLiveSocket | null>(null);
  const gapRefetchInFlight = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    dispatch({
      type: "hydrateClientIdentity",
      displayName: getStoredDisplayName(),
      deviceId: getStoredDeviceId(),
    });
  }, []);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const applyDeltaPacket = useCallback(async (packet: KotcDeltaPacket) => {
    const current = stateRef.current;
    if (!current.selectedSessionId || packet.session_id !== current.selectedSessionId) return;
    const incomingVersion = Number(packet.session_version || 0);
    const expectedNext = current.sessionVersion + 1;
    if (incomingVersion > expectedNext) {
      dispatch({ type: "setGap", scope: packet.scope === "court" ? "court" : "global" });
      if (gapRefetchInFlight.current) return;
      gapRefetchInFlight.current = true;
      try {
        const snapshot = await fetchSnapshot(current.selectedSessionId, "global", current.seatToken);
        dispatch({ type: "applySnapshot", snapshot });
      } catch {
        // keep local state and wait for next successful poll
      } finally {
        gapRefetchInFlight.current = false;
      }
      return;
    }
    if (incomingVersion <= current.sessionVersion) return;

    dispatch({
      type: "applyCommandAck",
      response: {
        success: true,
        appliedCommand: packet.command_type,
        sessionVersion: incomingVersion,
        structureEpoch: Number(packet.structure_epoch || current.structureEpoch),
        courtVersion: Number(packet.court_version || 0),
        delta: packet.delta ?? null,
        serverNow: packet.serverNow,
      },
      scope: packet.scope,
      courtIdx: packet.court_idx,
    });
  }, []);

  const connectSocket = useCallback(
    (
      sessionId: string,
      input: { seatToken?: string | null; seatId?: string | null; role: KotcRole; courtIdx: number | null }
    ) => {
      disconnectSocket();
      const channels: Array<{ scope: "global" | "court"; courtIdx?: number }> = [{ scope: "global" }];
      if (typeof input.courtIdx === "number") {
        channels.push({ scope: "court", courtIdx: input.courtIdx });
      }

      socketRef.current = new KotcLiveSocket({
        onStatus: (status) => dispatch({ type: "setConnectionStatus", status }),
        onDelta: (packet) => {
          void applyDeltaPacket(packet);
        },
        onPresence: (presence) => dispatch({ type: "setPresence", presence }),
        onClockOffset: (offsetMs) => dispatch({ type: "setClockOffset", offsetMs }),
        onError: (message) => dispatch({ type: "setError", error: message }),
      });
      socketRef.current.connect({
        sessionId,
        seatToken: input.seatToken,
        seatId: input.seatId ?? null,
        deviceId: stateRef.current.deviceId,
        channels,
      });
    },
    [applyDeltaPacket, disconnectSocket],
  );

  const refreshSessions = useCallback(async () => {
    dispatch({ type: "setLoading", loading: true });
    dispatch({ type: "setError", error: null });
    try {
      const sessions = await listSessions();
      dispatch({ type: "setSessions", sessions });
      dispatch({ type: "setMode", mode: "live", reason: null });
    } catch (error) {
      if (toLegacyError(error)) {
        dispatch({ type: "setMode", mode: "legacy", reason: "KOTC Live API unavailable" });
      } else {
        dispatch({
          type: "setError",
          error: error instanceof Error ? error.message : "Failed to load sessions",
        });
        dispatch({ type: "setMode", mode: "live" });
      }
    } finally {
      dispatch({ type: "setLoading", loading: false });
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
    return () => {
      disconnectSocket();
    };
  }, [disconnectSocket, refreshSessions]);

  const setDisplayName = useCallback((displayName: string) => {
    dispatch({ type: "setDisplayName", displayName });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORED_DISPLAY_NAME_KEY, displayName);
    }
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    dispatch({ type: "setSelectedSession", sessionId });
    dispatch({ type: "setError", error: null });
    dispatch({ type: "setLoading", loading: true });
    try {
      const stored = getStoredSeat();
      if (stored && stored.sessionId === sessionId) {
        const reclaimed = await joinSession({
          sessionId,
          roleHint: stored.role,
          courtIdx: stored.courtIdx ?? undefined,
          deviceId: stateRef.current.deviceId,
          displayName: stored.displayName || stateRef.current.displayName || undefined,
          reclaim: true,
          seatToken: stored.seatToken,
        });
        dispatch({
          type: "setSeat",
          role: reclaimed.seat.role,
          courtIdx: reclaimed.seat.courtIdx,
          seatToken: reclaimed.seatToken,
          displayName: reclaimed.seat.displayName,
        });
        dispatch({ type: "applySnapshot", snapshot: reclaimed.snapshot });
        saveStoredSeat({
          sessionId,
          role: reclaimed.seat.role,
          courtIdx: reclaimed.seat.courtIdx,
          seatToken: reclaimed.seatToken,
          displayName: reclaimed.seat.displayName,
        });
        connectSocket(sessionId, {
          seatToken: reclaimed.seatToken,
          seatId: reclaimed.seat.seatId ? String(reclaimed.seat.seatId) : null,
          role: reclaimed.seat.role,
          courtIdx: reclaimed.seat.courtIdx,
        });
      } else {
        const snapshot = await fetchSnapshot(sessionId, "global");
        dispatch({ type: "applySnapshot", snapshot });
        dispatch({ type: "clearSeat" });
      }
    } catch (error) {
      dispatch({
        type: "setError",
        error: error instanceof Error ? error.message : "Failed to open session",
      });
    } finally {
      dispatch({ type: "setLoading", loading: false });
    }
  }, [connectSocket]);

  const joinAs = useCallback(
    async (roleHint: "hub" | "judge" | "viewer", courtIdx?: number) => {
      const current = stateRef.current;
      if (!current.selectedSessionId) return;
      dispatch({ type: "setError", error: null });
      dispatch({ type: "setLoading", loading: true });
      try {
        if (roleHint === "viewer") {
          const snapshot = await fetchSnapshot(current.selectedSessionId, "global", current.seatToken);
          dispatch({
            type: "setSeat",
            role: "viewer",
            courtIdx: courtIdx ?? null,
            seatToken: "",
            displayName: current.displayName || undefined,
          });
          dispatch({ type: "applySnapshot", snapshot });
          saveStoredSeat(null);
          connectSocket(current.selectedSessionId, {
            seatToken: null,
            seatId: null,
            role: "viewer",
            courtIdx: courtIdx ?? null,
          });
          return;
        }
        const joined = await joinSession({
          sessionId: current.selectedSessionId,
          roleHint,
          courtIdx,
          deviceId: current.deviceId,
          displayName: current.displayName || undefined,
          reclaim: false,
          seatToken: current.seatToken,
        });
        dispatch({
          type: "setSeat",
          role: joined.seat.role,
          courtIdx: joined.seat.courtIdx,
          seatToken: joined.seatToken,
          displayName: joined.seat.displayName,
        });
        dispatch({ type: "applySnapshot", snapshot: joined.snapshot });
        saveStoredSeat({
          sessionId: joined.sessionId,
          role: joined.seat.role,
          courtIdx: joined.seat.courtIdx,
          seatToken: joined.seatToken,
          displayName: joined.seat.displayName,
        });
        connectSocket(joined.sessionId, {
          seatToken: joined.seatToken,
          seatId: joined.seat.seatId ? String(joined.seat.seatId) : null,
          role: joined.seat.role,
          courtIdx: joined.seat.courtIdx,
        });
      } catch (error) {
        dispatch({
          type: "setError",
          error: error instanceof Error ? error.message : "Join failed",
        });
      } finally {
        dispatch({ type: "setLoading", loading: false });
      }
    },
    [connectSocket],
  );

  const leaveSeat = useCallback(async () => {
    const current = stateRef.current;
    if (!current.selectedSessionId || !current.seatToken) {
      disconnectSocket();
      saveStoredSeat(null);
      dispatch({ type: "clearSeat" });
      return;
    }
    try {
      await releaseSeat(current.selectedSessionId, current.seatToken);
    } catch {
      // keep going to local cleanup
    }
    disconnectSocket();
    saveStoredSeat(null);
    dispatch({ type: "clearSeat" });
  }, [disconnectSocket]);

  const refreshPresence = useCallback(async () => {
    const current = stateRef.current;
    if (!current.selectedSessionId) return;
    try {
      const presence = await fetchPresence(current.selectedSessionId, current.seatToken);
      dispatch({ type: "setPresence", presence });
    } catch {
      // non-fatal
    }
  }, []);

  const refreshCourt = useCallback(async (courtIdx: number) => {
    const current = stateRef.current;
    if (!current.selectedSessionId) return;
    const court = await fetchCourt(current.selectedSessionId, courtIdx, current.seatToken);
    dispatch({ type: "upsertCourt", court });
  }, []);

  const runCommand = useCallback(
    async (
      request: Omit<KotcCommandRequest, "sessionId">,
      opts?: { optimisticCourtPatch?: Partial<KotcCourtState> & { courtIdx: number } },
    ) => {
      const current = stateRef.current;
      if (!current.selectedSessionId || !current.seatToken) {
        throw new Error("Not joined to a live seat");
      }
      if (opts?.optimisticCourtPatch) {
        dispatch({
          type: "upsertCourt",
          court: mergeCourtPatch(
            current.courts[opts.optimisticCourtPatch.courtIdx],
            opts.optimisticCourtPatch,
            opts.optimisticCourtPatch.courtIdx,
          ),
        });
      }
      const response = await sendCommand(
        {
          ...request,
          sessionId: current.selectedSessionId,
        },
        current.seatToken,
      );
      dispatch({
        type: "applyCommandAck",
        response,
        scope: request.scope,
        courtIdx: request.courtIdx,
      });
      if (request.scope === "court" && typeof request.courtIdx === "number") {
        await refreshCourt(request.courtIdx);
      }
      return response;
    },
    [refreshCourt],
  );

  const fallbackToLegacy = useCallback((reason?: string) => {
    disconnectSocket();
    dispatch({ type: "setMode", mode: "legacy", reason: reason || "Manual legacy fallback" });
  }, [disconnectSocket]);

  const backToSessionList = useCallback(() => {
    disconnectSocket();
    dispatch({ type: "setSelectedSession", sessionId: null });
    dispatch({ type: "clearSeat" });
  }, [disconnectSocket]);

  return {
    state,
    actions: {
      refreshSessions,
      selectSession,
      setDisplayName,
      joinAs,
      leaveSeat,
      refreshPresence,
      refreshCourt,
      runCommand,
      fallbackToLegacy,
      backToSessionList,
    },
  };
}
