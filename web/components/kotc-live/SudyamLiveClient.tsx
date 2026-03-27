"use client";

import { useEffect, useMemo, useState } from "react";
import type { KotcCourtState, KotcPresenceItem } from "./types";
import { useKotcLiveStore } from "./use-kotc-live-store";
import { useScreenWakeLock } from "./wake-lock";

interface SudyamLiveClientProps {
  legacyIframeSrc: string;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function getRemainingMs(court: KotcCourtState | undefined, clockOffsetMs: number): number {
  if (!court) return 0;
  if (court.timerStatus !== "running") {
    if (typeof court.timerDurationMs === "number" && court.timerDurationMs > 0) return court.timerDurationMs;
    return 0;
  }
  if (!court.timerEndsAt) return 0;
  const now = Date.now() + clockOffsetMs;
  return Math.max(0, court.timerEndsAt - now);
}

function getCourtScores(court: KotcCourtState | undefined): { home: number; away: number; raw: Record<string, unknown> } {
  const raw = (court?.scores || {}) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    return { home: 0, away: 0, raw: {} };
  }
  if (typeof raw.home === "number" || typeof raw.away === "number") {
    return { home: toNumber(raw.home), away: toNumber(raw.away), raw };
  }
  if (typeof raw.teamA === "number" || typeof raw.teamB === "number") {
    return { home: toNumber(raw.teamA), away: toNumber(raw.teamB), raw };
  }

  const numericEntries = Object.entries(raw).filter(([, value]) => typeof value === "number");
  if (numericEntries.length >= 2) {
    return {
      home: toNumber(numericEntries[0]?.[1]),
      away: toNumber(numericEntries[1]?.[1]),
      raw,
    };
  }
  return { home: 0, away: 0, raw };
}

function getCourtSeat(presence: KotcPresenceItem[], courtIdx: number): KotcPresenceItem | null {
  const row = presence.find((item) => item.courtIdx === courtIdx && item.role === "judge");
  return row || null;
}

function ConnectionBadge({ status }: { status: string }) {
  const style =
    status === "connected"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : status === "reconnecting"
        ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
        : "bg-white/10 text-text-secondary border-white/15";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-body ${style}`}>
      {status}
    </span>
  );
}

function CourtCard(props: {
  court: KotcCourtState | undefined;
  courtIdx: number;
  clockOffsetMs: number;
  readOnly: boolean;
  onScore: (side: "home" | "away", delta: number) => void;
  onTimer: (action: "start" | "pause" | "reset" | "plus15" | "minus15") => void;
}) {
  const { court, courtIdx, clockOffsetMs, readOnly, onScore, onTimer } = props;
  const { home, away } = getCourtScores(court);
  const remaining = getRemainingMs(court, clockOffsetMs);

  return (
    <div className="rounded-xl border border-white/10 bg-surface-light/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-2xl text-text-primary tracking-wide">Корт {courtIdx}</h3>
        <span className="text-xs font-body text-text-secondary">
          ver {court?.courtVersion ?? 0} • round {court?.roundIdx ?? 0}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-surface/50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-secondary font-body">Home</div>
          <div className="mt-2 text-4xl font-heading text-text-primary">{home}</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onScore("home", -1)}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-lg text-text-primary disabled:opacity-40"
            >
              -
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onScore("home", +1)}
              className="flex-1 rounded-lg border border-brand/40 bg-brand/20 px-3 py-2 text-lg text-brand-light disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-surface/50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-secondary font-body">Away</div>
          <div className="mt-2 text-4xl font-heading text-text-primary">{away}</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onScore("away", -1)}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-lg text-text-primary disabled:opacity-40"
            >
              -
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onScore("away", +1)}
              className="flex-1 rounded-lg border border-brand/40 bg-brand/20 px-3 py-2 text-lg text-brand-light disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-surface/40 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-text-secondary font-body">Timer</div>
          <div className="text-xs text-text-secondary font-body">{court?.timerStatus || "idle"}</div>
        </div>
        <div className="mt-1 text-3xl font-heading text-text-primary">{formatMs(remaining)}</div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onTimer("start")}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 disabled:opacity-40"
          >
            Start
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onTimer("pause")}
            className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-xs text-amber-200 disabled:opacity-40"
          >
            Pause
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onTimer("reset")}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-text-primary disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onTimer("plus15")}
            className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200 disabled:opacity-40"
          >
            +15s
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onTimer("minus15")}
            className="rounded-md border border-cyan-500/40 bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200 disabled:opacity-40"
          >
            -15s
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SudyamLiveClient({ legacyIframeSrc }: SudyamLiveClientProps) {
  const { state, actions } = useKotcLiveStore();
  const {
    refreshSessions,
    selectSession,
    setDisplayName,
    joinAs,
    leaveSeat,
    refreshPresence,
    runCommand,
    fallbackToLegacy,
    backToSessionList,
  } = actions;
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useScreenWakeLock(state.role === "judge" && state.courtIdx !== null);

  useEffect(() => {
    setTick(Date.now());
    const timer = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!state.selectedSessionId || !state.seatToken) return;
    const poll = setInterval(() => {
      void refreshPresence();
    }, 12_000);
    return () => clearInterval(poll);
  }, [refreshPresence, state.seatToken, state.selectedSessionId]);

  const courts = useMemo(() => {
    const list: Array<{ idx: number; court: KotcCourtState | undefined }> = [];
    const limit = Math.max(1, state.nc || 4);
    for (let idx = 1; idx <= limit; idx += 1) {
      list.push({ idx, court: state.courts[idx] });
    }
    return list;
  }, [state.courts, state.nc, tick]);

  const execute = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const updateScore = async (courtIdx: number, side: "home" | "away", delta: number) => {
    const currentCourt = state.courts[courtIdx];
    const { home, away, raw } = getCourtScores(currentCourt);
    const nextHome = side === "home" ? Math.max(0, home + delta) : home;
    const nextAway = side === "away" ? Math.max(0, away + delta) : away;
    const nextScores = {
      ...raw,
      home: nextHome,
      away: nextAway,
      teamA: nextHome,
      teamB: nextAway,
    };
    await execute(async () => {
      await runCommand(
        {
          commandType: "court.score_set",
          scope: "court",
          courtIdx,
          expectedCourtVersion: currentCourt?.courtVersion ?? 0,
          payload: {
            court_idx: courtIdx,
            side,
            delta,
            score: { home: nextHome, away: nextAway },
            scores: nextScores,
          },
        },
        {
          optimisticCourtPatch: {
            courtIdx,
            scores: nextScores,
          },
        },
      );
    });
  };

  const updateTimer = async (
    courtIdx: number,
    action: "start" | "pause" | "reset" | "plus15" | "minus15",
  ) => {
    const currentCourt = state.courts[courtIdx];
    const map = {
      start: "court.timer_start",
      pause: "court.timer_pause",
      reset: "court.timer_reset",
      plus15: "court.timer_adjust",
      minus15: "court.timer_adjust",
    } as const;
    await execute(async () => {
      await runCommand({
        commandType: map[action],
        scope: "court",
        courtIdx,
        expectedCourtVersion: currentCourt?.courtVersion ?? 0,
        payload:
          action === "plus15"
            ? { court_idx: courtIdx, delta_ms: 15_000 }
            : action === "minus15"
              ? { court_idx: courtIdx, delta_ms: -15_000 }
              : { court_idx: courtIdx },
      });
    });
  };

  const runHubCommand = async (commandType: string, payload: Record<string, unknown>) => {
    await execute(async () => {
      await runCommand({
        commandType,
        scope: "global",
        expectedStructureEpoch: state.structureEpoch,
        payload,
      });
    });
  };

  if (state.mode === "legacy") {
    return (
      <section className="w-full">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Live-режим недоступен: {state.legacyReason || "manual fallback"}. Используется legacy KOTC.
          </div>
          <button
            type="button"
            onClick={() => void refreshSessions()}
            className="mt-3 rounded-lg border border-white/10 px-4 py-2 text-sm text-text-primary hover:border-brand/50"
          >
            Проверить Live снова
          </button>
        </div>
        <iframe
          src={legacyIframeSrc}
          className="h-[calc(100vh-4rem)] w-full border-0"
          title="King of the Court — legacy judge app"
          allow="clipboard-write"
        />
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="rounded-2xl border border-white/10 bg-surface-light/35 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-heading text-4xl tracking-wide text-text-primary">KOTC Live Control</h1>
            <p className="mt-1 text-sm text-text-secondary font-body">
              Session-driven workflow: active session list, seat claim/reclaim, judge and hub screens.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadge status={state.connectionStatus} />
            <button
              type="button"
              onClick={() => void refreshSessions()}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-body text-text-primary hover:border-brand/40"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => fallbackToLegacy("manual fallback")}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-body text-text-primary hover:border-brand/40"
            >
              Legacy
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={state.displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name (optional)"
            className="w-full rounded-lg border border-white/10 bg-surface/60 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/50 md:max-w-sm"
          />
          <div className="text-xs text-text-secondary">device: {state.deviceId}</div>
          <div className="text-xs text-text-secondary">clock offset: {state.clockOffsetMs}ms</div>
        </div>

        {state.error ? (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {state.error}
          </div>
        ) : null}
      </div>

      {!state.selectedSessionId ? (
        <section className="mt-5">
          <h2 className="font-heading text-3xl text-text-primary tracking-wide">Active Sessions</h2>
          {state.loading ? (
            <p className="mt-2 text-sm text-text-secondary">Loading sessions...</p>
          ) : state.sessions.length === 0 ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-surface-light/30 p-4 text-sm text-text-secondary">
              Нет активных KOTC live-сессий. Если backend ещё не развёрнут, можно использовать legacy режим.
            </div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {state.sessions.map((session) => (
                <button
                  key={session.sessionId}
                  type="button"
                  onClick={() => void selectSession(session.sessionId)}
                  className="rounded-xl border border-white/10 bg-surface-light/30 p-4 text-left hover:border-brand/40"
                >
                  <div className="font-body text-base font-semibold text-text-primary">
                    {session.title || session.sessionId}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    session: {session.sessionId} • nc: {session.nc}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    phase: {session.phase || "-"} • status: {session.status || "-"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {state.selectedSessionId && !state.role ? (
        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-3xl text-text-primary tracking-wide">Choose Seat</h2>
            <button
              type="button"
              onClick={() => backToSessionList()}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-primary hover:border-brand/40"
            >
              Back to sessions
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {courts.map(({ idx }) => {
              const occupant = getCourtSeat(state.presence, idx);
              const occupied = Boolean(occupant?.isOnline ?? occupant);
              return (
                <div key={idx} className="rounded-xl border border-white/10 bg-surface-light/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-heading text-2xl text-text-primary">Court {idx}</div>
                    <span className="text-xs text-text-secondary">
                      {occupied ? `Occupied by ${occupant?.displayName || "judge"}` : "Free"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || occupied}
                      onClick={() => void joinAs("judge", idx)}
                      className="rounded-lg border border-brand/40 bg-brand/20 px-3 py-2 text-xs text-brand-light disabled:opacity-40"
                    >
                      Claim as Judge
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void joinAs("viewer", idx)}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-text-primary disabled:opacity-40"
                    >
                      Open Viewer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void joinAs("hub")}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40"
            >
              Join as Hub
            </button>
          </div>
        </section>
      ) : null}

      {state.selectedSessionId && state.role ? (
        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-secondary">
              role: {state.role}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-secondary">
              session_version: {state.sessionVersion}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-secondary">
              structure_epoch: {state.structureEpoch}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-secondary">
              phase: {state.phase || "-"}
            </span>
            <button
              type="button"
              onClick={() => void leaveSeat()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-text-primary hover:border-brand/40"
            >
              Leave seat
            </button>
            <button
              type="button"
              onClick={() => backToSessionList()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-text-primary hover:border-brand/40"
            >
              Sessions
            </button>
          </div>

          {state.role === "hub" ? (
            <div className="mb-4 rounded-xl border border-white/10 bg-surface-light/30 p-4">
              <h3 className="font-heading text-2xl text-text-primary">Hub Panel</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runHubCommand("session.pause", {})}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-2 text-xs text-amber-200 disabled:opacity-40"
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runHubCommand("session.resume", {})}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
                >
                  Resume
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={broadcastMessage}
                  onChange={(event) => setBroadcastMessage(event.target.value)}
                  placeholder="Broadcast message"
                  className="w-full rounded-lg border border-white/10 bg-surface/60 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/50"
                />
                <button
                  type="button"
                  disabled={busy || !broadcastMessage.trim()}
                  onClick={() =>
                    void runHubCommand("global.broadcast_message", { message: broadcastMessage.trim() }).then(() =>
                      setBroadcastMessage(""),
                    )
                  }
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              <div className="mt-4">
                <h4 className="font-body text-sm font-semibold text-text-primary">Judges Presence</h4>
                <div className="mt-2 grid gap-2">
                  {state.presence.length === 0 ? (
                    <div className="text-xs text-text-secondary">No seats connected.</div>
                  ) : (
                    state.presence.map((seat, idx) => (
                      <div
                        key={`${seat.seatId || idx}_${seat.courtIdx ?? "hub"}`}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-surface/40 px-3 py-2 text-xs"
                      >
                        <span className="text-text-primary">
                          {seat.role} {seat.courtIdx !== null ? `court ${seat.courtIdx}` : ""} •{" "}
                          {seat.displayName || seat.seatId || "unknown"}
                        </span>
                        <span className="text-text-secondary">{seat.isOnline ? "online" : "offline"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={[
              "grid gap-3",
              state.role === "hub" ? "md:grid-cols-2" : "md:grid-cols-1",
            ].join(" ")}
          >
            {courts
              .filter(({ idx }) => state.role === "hub" || idx === state.courtIdx)
              .map(({ idx, court }) => {
                const readOnly = state.role === "viewer" || (state.role === "judge" && state.courtIdx !== idx);
                return (
                  <CourtCard
                    key={idx}
                    court={court}
                    courtIdx={idx}
                    clockOffsetMs={state.clockOffsetMs}
                    readOnly={readOnly}
                    onScore={(side, delta) => void updateScore(idx, side, delta)}
                    onTimer={(action) => void updateTimer(idx, action)}
                  />
                );
              })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

