"use client";

import { useEffect, useMemo, useState } from "react";
import { useKotcLiveStore } from "../use-kotc-live-store";
import { SessionList } from "../judge/SessionList";
import { formatMs, getRemainingMs } from "../judge/utils";
import {
  fetchTournamentRoster,
  fetchTournamentRounds,
  generateTournamentRound1,
  generateTournamentRound2,
  saveTournamentRoster,
} from "../api";
import type { KotcRosterEntry, KotcRound } from "../types";

function rosterToText(roster: KotcRosterEntry[]): string {
  return roster
    .slice()
    .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999) || a.displayName.localeCompare(b.displayName))
    .map((item) => item.displayName)
    .join("\n");
}

function parseRosterText(text: string): Array<{
  displayName: string;
  seed: number;
  confirmed: boolean;
  active: boolean;
  dropped: boolean;
}> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((displayName, index) => ({
      displayName,
      seed: index + 1,
      confirmed: true,
      active: true,
      dropped: false,
    }));
}

function RoundPreview({ round }: { round: KotcRound }) {
  const courts = new Map<number, typeof round.assignments>();
  for (const assignment of round.assignments) {
    const list = courts.get(assignment.courtIdx) ?? [];
    list.push(assignment);
    courts.set(assignment.courtIdx, list);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface-light/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg text-text-primary">
            {round.stageType.toUpperCase()} · round {round.roundNo}
          </h3>
          <p className="text-xs text-text-secondary">
            status: {round.status} · levels: {round.levelCount}
          </p>
        </div>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-secondary">
          {round.assignments.length} assignments
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from(courts.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([courtIdx, assignments]) => (
            <div key={courtIdx} className="rounded-lg border border-white/10 bg-surface/50 p-3">
              <div className="font-heading text-base text-text-primary">Court {courtIdx}</div>
              <div className="mt-2 space-y-1 text-sm text-text-secondary">
                {assignments
                  .slice()
                  .sort((a, b) => a.slotIdx - b.slotIdx)
                  .map((assignment) => (
                    <div key={assignment.assignmentId} className="flex items-center justify-between gap-2">
                      <span className="truncate text-text-primary">{assignment.displayName}</span>
                      <span className="text-xs text-text-secondary">
                        S{assignment.slotIdx} · L{assignment.levelIdx}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function KotcLiveHubFlow() {
  const { state, actions } = useKotcLiveStore();
  const {
    backToSessionList,
    joinAs,
    refreshPresence,
    refreshSessions,
    runCommand,
    selectSession,
  } = actions;
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [tournamentBusy, setTournamentBusy] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [rosterText, setRosterText] = useState("");
  const [tournamentRoster, setTournamentRoster] = useState<KotcRosterEntry[]>([]);
  const [rounds, setRounds] = useState<KotcRound[]>([]);

  useEffect(() => {
    setTick(Date.now());
    const timer = setInterval(() => setTick(Date.now()), 1000);
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

  useEffect(() => {
    if (!state.selectedSessionId && state.sessions.length === 1 && !state.loading && !busy) {
      void selectSession(state.sessions[0].sessionId);
    }
  }, [busy, selectSession, state.loading, state.selectedSessionId, state.sessions]);

  useEffect(() => {
    if (state.selectedSessionId && !state.role && !state.loading && !busy) {
      setBusy(true);
      void joinAs("hub").finally(() => setBusy(false));
    }
  }, [busy, joinAs, state.loading, state.role, state.selectedSessionId]);

  const selectedSession = useMemo(
    () => state.sessions.find((item) => item.sessionId === state.selectedSessionId) ?? null,
    [state.selectedSessionId, state.sessions],
  );
  const tournamentId = selectedSession?.tournamentId || null;

  const refreshTournamentFlow = async () => {
    if (!tournamentId) return;
    setTournamentBusy(true);
    setTournamentError(null);
    try {
      const [nextRoster, nextRounds] = await Promise.all([
        fetchTournamentRoster(tournamentId),
        fetchTournamentRounds(tournamentId),
      ]);
      setTournamentRoster(nextRoster);
      setRosterText(rosterToText(nextRoster));
      setRounds(nextRounds);
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : "Failed to load tournament flow");
    } finally {
      setTournamentBusy(false);
    }
  };

  useEffect(() => {
    if (!tournamentId || state.role !== "hub") return;
    void refreshTournamentFlow();
  }, [state.role, tournamentId]);

  const runHubCommand = async (commandType: string, payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await runCommand({
        commandType,
        scope: "global",
        expectedStructureEpoch: state.structureEpoch,
        payload,
      });
    } finally {
      setBusy(false);
    }
  };

  const forceRelease = async (courtIdx: number) => {
    if (!confirm(`Force release judge from Court ${courtIdx}?`)) return;
    await runHubCommand("seat.force_release", { courtIdx, court_idx: courtIdx });
  };

  const saveRoster = async () => {
    if (!tournamentId) return;
    setTournamentBusy(true);
    setTournamentError(null);
    try {
      const saved = await saveTournamentRoster(tournamentId, parseRosterText(rosterText));
      setTournamentRoster(saved);
      setRosterText(rosterToText(saved));
      setRounds(await fetchTournamentRounds(tournamentId));
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : "Roster save failed");
    } finally {
      setTournamentBusy(false);
    }
  };

  const buildRound1 = async () => {
    if (!tournamentId) return;
    setTournamentBusy(true);
    setTournamentError(null);
    try {
      await generateTournamentRound1(tournamentId);
      await refreshTournamentFlow();
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : "Round 1 generation failed");
      setTournamentBusy(false);
    }
  };

  const buildRound2 = async () => {
    if (!tournamentId) return;
    setTournamentBusy(true);
    setTournamentError(null);
    try {
      await generateTournamentRound2(tournamentId);
      await refreshTournamentFlow();
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : "Round 2 generation failed");
      setTournamentBusy(false);
    }
  };

  if (state.loading && !state.selectedSessionId) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-text-secondary">
        <div className="mr-3 h-8 w-8 animate-spin rounded-full border-2 border-brand/50 border-t-brand" />
        Connecting to KOTC Hub...
      </div>
    );
  }

  if (!state.selectedSessionId) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4">
        <SessionList
          sessions={state.sessions}
          loading={state.loading}
          onSelect={(id) => selectSession(id)}
          onRefresh={() => refreshSessions()}
        />
      </div>
    );
  }

  if (state.role !== "hub") {
    return (
      <div className="flex h-[50vh] items-center justify-center text-text-secondary">
        <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        Joining as Hub...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-8">
      <div className="flex flex-col justify-between gap-4 border-b border-white/10 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl text-text-primary">Hub Control Board</h1>
          <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
            {state.connectionStatus}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-body text-text-secondary">
          <span>Session: {state.sessionVersion}</span>
          <span>Epoch: {state.structureEpoch}</span>
          <button
            onClick={() => backToSessionList()}
            className="rounded border border-white/10 px-3 py-1.5 text-white hover:border-white/30"
          >
            Leave Hub
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-xl text-text-primary">Tournament Flow</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Tournament: {tournamentId || "not linked"} {selectedSession?.title ? `· ${selectedSession.title}` : ""}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              One line = one participant. Save roster, then build Round 1, then build Round 2 from Round 1 results.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void refreshTournamentFlow()}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-text-primary disabled:opacity-40"
            >
              Refresh Flow
            </button>
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void saveRoster()}
              className="rounded-lg border border-brand/40 bg-brand/20 px-3 py-2 text-sm font-semibold text-brand-light disabled:opacity-40"
            >
              Save Roster
            </button>
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void buildRound1()}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-40"
            >
              Generate Round 1
            </button>
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void buildRound2()}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40"
            >
              Generate Round 2
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
              <span>Roster entries: {tournamentRoster.length}</span>
              <span>{tournamentBusy ? "working..." : "ready"}</span>
            </div>
            <textarea
              value={rosterText}
              onChange={(event) => setRosterText(event.target.value)}
              placeholder="One participant per line"
              className="min-h-[260px] w-full rounded-xl border border-white/10 bg-surface/60 px-4 py-3 text-sm text-text-primary outline-none focus:border-brand/40"
            />
          </div>
          <div className="space-y-3">
            {tournamentError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {tournamentError}
              </div>
            ) : null}
            <div className="rounded-lg border border-white/10 bg-surface/40 p-4 text-sm text-text-secondary">
              <div className="flex items-center justify-between">
                <span>Active roster</span>
                <span className="text-text-primary">
                  {tournamentRoster.filter((item) => item.active && item.confirmed && !item.dropped).length}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Generated rounds</span>
                <span className="text-text-primary">{rounds.length}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Live phase</span>
                <span className="text-text-primary">{state.phase || "-"}</span>
              </div>
            </div>
            {rounds.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-surface/30 p-4 text-sm text-text-secondary">
                No generated rounds yet. Save roster first, then build Round 1.
              </div>
            ) : (
              rounds.map((round) => <RoundPreview key={round.id} round={round} />)
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <h2 className="mb-2 font-heading text-xl uppercase tracking-widest text-red-200">Emergency Controls</h2>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              onClick={() => runHubCommand("session.pause", {})}
              className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
            >
              Pause Session
            </button>
            <button
              disabled={busy}
              onClick={() => runHubCommand("session.resume", {})}
              className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
            >
              Resume Session
            </button>
          </div>

          <div className="mt-2 border-t border-white/10 pt-4 text-sm text-text-secondary">
            Broadcasting alerts will blink on all judges screens.
          </div>
          <div className="flex w-full gap-2">
            <input
              type="text"
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Message to all courts..."
              className="flex-1 rounded-lg border border-white/20 bg-surface/80 px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-500/50"
            />
            <button
              disabled={busy || !broadcastMessage.trim()}
              onClick={() =>
                runHubCommand("global.broadcast_message", { message: broadcastMessage.trim() }).then(() =>
                  setBroadcastMessage(""),
                )
              }
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/30 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface-light/30 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-xl uppercase tracking-widest text-text-primary">Judge Matrix</h2>
            <button onClick={() => refreshPresence()} disabled={busy} className="text-xs text-brand hover:underline">
              Refresh
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {Array.from({ length: state.nc || 4 }, (_, offset) => offset + 1).map((idx) => {
              const seat = state.presence.find((p) => p.courtIdx === idx && p.role === "judge");
              return (
                <div key={idx} className="flex items-center justify-between rounded-lg border border-white/5 bg-surface/50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-24 font-heading text-lg text-text-primary">Court {idx}</span>
                    {seat ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-emerald-300">{seat.displayName || "Unknown Judge"}</span>
                        <span className="text-xs text-text-secondary">{seat.isOnline ? "Online" : "Offline / Unreachable"}</span>
                      </div>
                    ) : (
                      <span className="text-sm italic text-text-secondary">Empty / Available</span>
                    )}
                  </div>
                  {seat && (
                    <button
                      disabled={busy}
                      onClick={() => forceRelease(idx)}
                      className="rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/20 active:bg-red-500/40"
                    >
                      Force Release
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-surface/40 p-5">
        <h2 className="mb-4 font-heading text-xl uppercase tracking-widest text-text-primary">Courts Live Readout</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: state.nc || 4 }, (_, offset) => offset + 1).map((idx) => {
            const court = state.courts[idx];
            if (!court) {
              return (
                <div key={idx} className="rounded-lg border border-white/5 bg-surface-light/20 p-4 text-center text-sm text-text-secondary">
                  Court {idx} Pending
                </div>
              );
            }
            const raw = (court.scores || {}) as Record<string, unknown>;
            const home = Number(raw.home ?? raw.teamA ?? 0);
            const away = Number(raw.away ?? raw.teamB ?? 0);
            const remainingMs = getRemainingMs(court, state.clockOffsetMs);

            return (
              <div key={idx} className="rounded-lg border border-white/10 bg-surface-light/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-heading font-bold">Court {idx}</span>
                  <span className="font-mono text-xs text-text-secondary">{court.timerStatus || "idle"}</span>
                </div>
                <div className="mb-4 rounded bg-black/20 py-2 text-center font-heading text-3xl tracking-widest text-emerald-300">
                  {formatMs(remainingMs)}
                </div>
                <div className="flex justify-between px-2 font-heading text-2xl font-bold">
                  <span>{home}</span>
                  <span className="self-center text-sm text-text-secondary">:</span>
                  <span>{away}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
