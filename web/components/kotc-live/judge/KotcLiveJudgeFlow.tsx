"use client";

import { useMemo, useState, useEffect } from "react";
import { useKotcLiveStore } from "../use-kotc-live-store";
import { SessionList } from "./SessionList";
import { CourtSelection } from "./CourtSelection";
import { JudgeScreen } from "./JudgeScreen";
import { ViewerMode } from "./ViewerMode";
import { useScreenWakeLock } from "../wake-lock";
import type { KotcCourtState } from "../types";

type FlowState =
  | "loading"
  | "no_active_session"
  | "choose_session"
  | "choose_court"
  | "claiming"
  | "judge"
  | "viewer";

function deriveFlowState(
  storeLoading: boolean, 
  sessionsCount: number, 
  selectedSessionId: string | null, 
  role: string | null, 
  busy: boolean
): FlowState {
  if (storeLoading && sessionsCount === 0 && !selectedSessionId) return "loading";
  if (!selectedSessionId) {
    if (sessionsCount === 0 && !storeLoading) return "no_active_session";
    return "choose_session";
  }
  if (!role) {
    if (busy) return "claiming";
    return "choose_court";
  }
  if (role === "judge") return "judge";
  if (role === "viewer") return "viewer";
  return "loading";
}

export function KotcLiveJudgeFlow() {
  const { state, actions } = useKotcLiveStore();
  const {
    backToSessionList,
    joinAs,
    leaveSeat,
    refreshPresence,
    refreshSessions,
    runCommand,
    selectSession,
    setDisplayName,
  } = actions;
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); // 0 on SSR, real value set client-side in effect

  useScreenWakeLock(state.role === "judge" && state.courtIdx !== null);

  useEffect(() => {
    setTick(Date.now());
    const timer = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!state.selectedSessionId) return;
    void refreshPresence();
    const timer = setInterval(() => {
      void refreshPresence();
    }, 12_000);
    return () => clearInterval(timer);
  }, [refreshPresence, state.selectedSessionId]);

  // Auto-select session if there is exactly 1 active session and we haven't selected one yet
  useEffect(() => {
    if (!state.selectedSessionId && state.sessions.length === 1 && !state.loading && !busy) {
      void selectSession(state.sessions[0].sessionId);
    }
  }, [busy, selectSession, state.loading, state.selectedSessionId, state.sessions]);

  const courtsList = useMemo(() => {
    const list: Array<{ idx: number; court: KotcCourtState | undefined }> = [];
    const limit = Math.max(1, state.nc || 4);
    for (let idx = 1; idx <= limit; idx += 1) {
      list.push({ idx, court: state.courts[idx] });
    }
    return list;
  }, [state.courts, state.nc, tick]);

  const handleScore = async (courtIdx: number, side: "home" | "away", delta: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const currentCourt = state.courts[courtIdx];
      const raw = (currentCourt?.scores || {}) as Record<string, unknown>;
      
      const homeVal = Number(raw.home ?? raw.teamA ?? 0);
      const awayVal = Number(raw.away ?? raw.teamB ?? 0);
      
      const nextHome = side === "home" ? Math.max(0, homeVal + delta) : homeVal;
      const nextAway = side === "away" ? Math.max(0, awayVal + delta) : awayVal;
      
      const nextScores = { ...raw, home: nextHome, away: nextAway, teamA: nextHome, teamB: nextAway };

      await runCommand(
        {
          commandType: "court.score_set",
          scope: "court",
          courtIdx,
          expectedCourtVersion: currentCourt?.courtVersion ?? 0,
          payload: {
            courtIdx,
            court_idx: courtIdx,
            side,
            delta,
            score: { home: nextHome, away: nextAway },
            scores: nextScores,
          },
        },
        {
          optimisticCourtPatch: { courtIdx, scores: nextScores },
        }
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTimer = async (courtIdx: number, action: "start" | "pause" | "reset" | "plus15" | "minus15") => {
    if (busy) return;
    setBusy(true);
    try {
      const currentCourt = state.courts[courtIdx];
      const map = {
        start: "court.timer_start",
        pause: "court.timer_pause",
        reset: "court.timer_reset",
        plus15: "court.timer_adjust",
        minus15: "court.timer_adjust",
      } as const;

      await runCommand({
        commandType: map[action],
        scope: "court",
        courtIdx,
        expectedCourtVersion: currentCourt?.courtVersion ?? 0,
        payload:
          action === "plus15"
            ? { courtIdx, court_idx: courtIdx, deltaMs: 15_000, delta_ms: 15_000 }
            : action === "minus15"
              ? { courtIdx, court_idx: courtIdx, deltaMs: -15_000, delta_ms: -15_000 }
              : { courtIdx, court_idx: courtIdx },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = async (idx: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await joinAs("judge", idx);
    } finally {
      setBusy(false);
    }
  };

  const handleView = async (idx: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await joinAs("viewer", idx);
    } finally {
      setBusy(false);
    }
  };

  const flowState = deriveFlowState(
    state.loading, 
    state.sessions.length, 
    state.selectedSessionId, 
    state.role, 
    busy || state.loading
  );

  switch (flowState) {
    case "loading":
      return (
        <div className="w-full flex-1 flex flex-col items-center justify-center p-8 text-text-secondary">
          <div className="w-8 h-8 rounded-full border-2 border-brand/50 border-t-brand animate-spin mb-4" />
          <p>Connecting to King of the Court...</p>
        </div>
      );
      
    case "no_active_session":
      return (
        <div className="w-full max-w-2xl mx-auto mt-8 p-8 rounded-xl border border-white/10 bg-surface-light/30 text-center">
          <h2 className="text-2xl font-heading text-text-primary mb-2">No Active Sessions</h2>
          <p className="text-text-secondary mb-6 block">There are no live courts running right now.</p>
          <button 
            onClick={() => refreshSessions()}
            className="rounded border border-white/20 bg-white/5 py-2 px-6 text-sm hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      );

    case "choose_session":
      return (
        <SessionList
          sessions={state.sessions}
          loading={state.loading}
          onSelect={(id) => selectSession(id)}
          onRefresh={() => refreshSessions()}
        />
      );

    case "choose_court":
    case "claiming":
      return (
        <CourtSelection
          courts={courtsList}
          presence={state.presence}
          busy={flowState === "claiming"}
          onClaim={handleClaim}
          onView={handleView}
          onBack={() => backToSessionList()}
          displayName={state.displayName}
          onDisplayNameChange={setDisplayName}
        />
      );

    case "judge":
      if (typeof state.courtIdx !== "number") return null;
      return (
        <JudgeScreen
          courtIdx={state.courtIdx}
          court={state.courts[state.courtIdx]}
          clockOffsetMs={state.clockOffsetMs}
          onScore={(side, delta) => handleScore(state.courtIdx as number, side, delta)}
          onTimer={(action) => handleTimer(state.courtIdx as number, action)}
          onLeave={() => leaveSeat()}
        />
      );

    case "viewer":
      if (typeof state.courtIdx !== "number") return null;
      return (
        <ViewerMode
          courtIdx={state.courtIdx}
          court={state.courts[state.courtIdx]}
          clockOffsetMs={state.clockOffsetMs}
          onLeave={() => leaveSeat()}
        />
      );

    default:
      return (
        <div className="w-full p-8 text-center text-red-400">
          <p>Unknown state encountered.</p>
          <button onClick={() => backToSessionList()} className="mt-4 border border-red-500/50 px-4 py-2 rounded">
            Reset
          </button>
        </div>
      );
  }
}
