"use client";

import { useMemo, useState, useEffect } from "react";
import { useKotcLiveStore } from "../use-kotc-live-store";
import { createSession } from "../api";
import { SessionList } from "./SessionList";
import { CourtSelection } from "./CourtSelection";
import { JudgeScreen } from "./JudgeScreen";
import { ViewerMode } from "./ViewerMode";
import { useScreenWakeLock } from "../wake-lock";
import type { KotcCourtState } from "../types";
import { buildNextCourtScores, getCourtServeState, getRoundCount } from "./utils";

type FlowState =
  | "loading"
  | "error"
  | "no_active_session"
  | "choose_session"
  | "choose_court"
  | "claiming"
  | "judge"
  | "viewer";

type KotcLiveJudgeFlowProps = {
  store?: unknown;
  targetTournamentId?: string | null;
  targetNc?: number;
};

const DEFAULT_COURT_TIMER_MS = 10 * 60_000;

function deriveFlowState(
  storeLoading: boolean, 
  sessionsCount: number, 
  selectedSessionId: string | null, 
  role: string | null, 
  busy: boolean,
  error: string | null,
): FlowState {
  if (storeLoading && sessionsCount === 0 && !selectedSessionId && !error) return "loading";
  if (!selectedSessionId) {
    if (error && sessionsCount === 0) return "error";
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

export function KotcLiveJudgeFlow({ targetTournamentId = null, targetNc }: KotcLiveJudgeFlowProps = {}) {
  const { state, actions } = useKotcLiveStore();
  const {
    backToSessionList,
    fallbackToLegacy,
    joinAs,
    leaveSeat,
    refreshPresence,
    refreshSessions,
    runCommand,
    selectSession,
    setDisplayName,
  } = actions;
  const [busy, setBusy] = useState(false);
  const [targetHandled, setTargetHandled] = useState(false);
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
    if (targetTournamentId || state.selectedSessionId || state.sessions.length !== 1 || state.loading || busy) {
      return;
    }
    if (!state.selectedSessionId && state.sessions.length === 1 && !state.loading && !busy) {
      void selectSession(state.sessions[0].sessionId);
    }
  }, [busy, selectSession, state.loading, state.selectedSessionId, state.sessions, targetTournamentId]);

  useEffect(() => {
    if (
      !targetTournamentId ||
      targetHandled ||
      state.selectedSessionId ||
      state.loading ||
      busy ||
      state.mode === "legacy"
    ) {
      return;
    }

    const matchingSession = state.sessions.find((session) => session.tournamentId === targetTournamentId);
    if (matchingSession) {
      setTargetHandled(true);
      void selectSession(matchingSession.sessionId);
      return;
    }

    let cancelled = false;
    setTargetHandled(true);
    setBusy(true);
    void (async () => {
      try {
        const created = await createSession({
          tournamentId: targetTournamentId,
          nc: targetNc,
          phase: "setup",
        });
        if (cancelled) return;
        await refreshSessions();
        await selectSession(created.sessionId);
      } catch (error) {
        if (!cancelled) {
          console.warn("[KOTC LIVE] Failed to bootstrap targeted session:", error);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    busy,
    refreshSessions,
    selectSession,
    state.loading,
    state.mode,
    state.selectedSessionId,
    state.sessions,
    targetHandled,
    targetNc,
    targetTournamentId,
  ]);

  const courtsList = useMemo(() => {
    const list: Array<{ idx: number; court: KotcCourtState | undefined }> = [];
    const limit = Math.max(1, state.nc || 4);
    for (let idx = 1; idx <= limit; idx += 1) {
      list.push({ idx, court: state.courts[idx] });
    }
    return list;
  }, [state.courts, state.nc, tick]);

  const handleScore = async (courtIdx: number, slotIdx: number, nextScore: number | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const currentCourt = state.courts[courtIdx];
      const roundCount = getRoundCount(state.ppc);
      const roundIdx = Math.max(0, Math.min(roundCount - 1, Number(currentCourt?.roundIdx ?? 0)));
      const nextScores = buildNextCourtScores(currentCourt, roundCount, roundCount, roundIdx, slotIdx, nextScore);

      await runCommand(
        {
          commandType: "court.score_set",
          scope: "court",
          courtIdx,
          expectedCourtVersion: currentCourt?.courtVersion ?? 0,
          payload: {
            courtIdx,
            court_idx: courtIdx,
            scores: nextScores,
          },
        },
        {
          optimisticCourtPatch: { courtIdx, scores: nextScores, activeSlotIdx: slotIdx },
        }
      );
    } finally {
      setBusy(false);
    }
  };

  const handleServerTap = async (courtIdx: number, slotIdx: number, playerIdx: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const currentCourt = state.courts[courtIdx];
      const serveState = getCourtServeState(currentCourt, state.ppc);
      const nextServerSlots = [...serveState.serverPlayerIdxBySlot];
      const isSelected = nextServerSlots[slotIdx] === playerIdx;

      nextServerSlots[slotIdx] = isSelected ? (nextServerSlots[slotIdx] === 1 ? 0 : 1) : playerIdx;
      const optimisticActiveSlotIdx =
        serveState.waitingSlotIdx != null && slotIdx === serveState.waitingSlotIdx
          ? serveState.activeSlotIdx
          : slotIdx;

      await runCommand(
        {
          commandType: isSelected ? "court.server_swap" : "court.server_select",
          scope: "court",
          courtIdx,
          expectedCourtVersion: currentCourt?.courtVersion ?? 0,
          payload: {
            courtIdx,
            court_idx: courtIdx,
            slotIdx,
            slot_idx: slotIdx,
            ...(isSelected ? {} : { playerIdx, player_idx: playerIdx }),
          },
        },
        {
          optimisticCourtPatch: {
            courtIdx,
            activeSlotIdx: optimisticActiveSlotIdx,
            serverPlayerIdxBySlot: nextServerSlots,
          },
        },
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
      const baseDuration = Math.max(
        DEFAULT_COURT_TIMER_MS,
        Number(currentCourt?.timerDurationMs ?? 0),
      );
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
              : { courtIdx, court_idx: courtIdx, durationMs: baseDuration, duration_ms: baseDuration },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRoundChange = async (courtIdx: number, roundIdx: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const currentCourt = state.courts[courtIdx];
      await runCommand(
        {
          commandType: "court.round_set",
          scope: "court",
          courtIdx,
          expectedCourtVersion: currentCourt?.courtVersion ?? 0,
          payload: {
            courtIdx,
            court_idx: courtIdx,
            roundIdx,
            round_idx: roundIdx,
          },
        },
        {
          optimisticCourtPatch: { courtIdx, roundIdx },
        },
      );
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
    busy || state.loading,
    state.error,
  );

  switch (flowState) {
    case "loading":
      return (
        <div className="w-full flex-1 flex flex-col items-center justify-center p-8 text-text-secondary">
          <div className="w-8 h-8 rounded-full border-2 border-brand/50 border-t-brand animate-spin mb-4" />
          <p>Подключение к KOTC Live...</p>
        </div>
      );
      
    case "no_active_session":
      return (
        <div className="w-full max-w-2xl mx-auto mt-8 p-8 rounded-xl border border-white/10 bg-surface-light/30 text-center">
          <h2 className="text-2xl font-heading text-text-primary mb-2">Нет активных сессий</h2>
          <p className="text-text-secondary mb-6 block">Сейчас ни один живой корт не запущен.</p>
          <button 
            onClick={() => refreshSessions()}
            className="rounded border border-white/20 bg-white/5 py-2 px-6 text-sm hover:bg-white/10"
          >
            Обновить
          </button>
        </div>
      );

    case "error":
      return (
        <div className="w-full max-w-2xl mx-auto mt-8 p-8 rounded-2xl border border-red-500/20 bg-red-500/10 text-center">
          <div className="text-[11px] uppercase tracking-[0.28em] text-red-200/80">Проблема подключения</div>
          <h2 className="mt-3 text-2xl font-heading text-white">Новый live-режим не запустился</h2>
          <p className="mt-3 text-sm text-red-100/85">
            {state.error || "KOTC Live не ответил вовремя."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => refreshSessions()}
              className="rounded-full border border-white/15 bg-white/10 px-5 py-2 text-sm text-white transition hover:bg-white/15"
            >
              Повторить
            </button>
            <button
              onClick={() => fallbackToLegacy(state.error || "KOTC Live bootstrap timeout")}
              className="rounded-full border border-brand/40 bg-brand/15 px-5 py-2 text-sm text-brand-light transition hover:bg-brand/25"
            >
              Открыть старую версию
            </button>
          </div>
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
          phase={state.phase}
          nc={state.nc}
          ppc={state.ppc}
          onScore={(slotIdx, nextScore) => handleScore(state.courtIdx as number, slotIdx, nextScore)}
          onServerTap={(slotIdx, playerIdx) => handleServerTap(state.courtIdx as number, slotIdx, playerIdx)}
          onTimer={(action) => handleTimer(state.courtIdx as number, action)}
          onRoundChange={(roundIdx) => handleRoundChange(state.courtIdx as number, roundIdx)}
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
          phase={state.phase}
          nc={state.nc}
          ppc={state.ppc}
          onLeave={() => leaveSeat()}
        />
      );

    default:
      return (
        <div className="w-full p-8 text-center text-red-400">
          <p>Неожиданное состояние интерфейса.</p>
          <button onClick={() => backToSessionList()} className="mt-4 border border-red-500/50 px-4 py-2 rounded">
            Сбросить
          </button>
        </div>
      );
  }
}
