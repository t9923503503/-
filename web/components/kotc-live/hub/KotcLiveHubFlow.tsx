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
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg uppercase tracking-[0.08em] text-text-primary">
            {round.stageType} round {round.roundNo}
          </h3>
          <p className="text-xs text-text-secondary">status {round.status} · levels {round.levelCount}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
          {round.assignments.length} slots
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from(courts.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([courtIdx, assignments]) => (
            <div key={courtIdx} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="font-heading text-base uppercase tracking-[0.08em] text-text-primary">Court {courtIdx}</div>
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
  const { backToSessionList, joinAs, refreshPresence, refreshSessions, runCommand, selectSession } = actions;
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
  const judgeSeats = useMemo(
    () => state.presence.filter((item) => item.role === "judge"),
    [state.presence],
  );
  const activeRosterCount = useMemo(
    () => tournamentRoster.filter((item) => item.active && item.confirmed && !item.dropped).length,
    [tournamentRoster],
  );

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
      <div className="mx-auto w-full max-w-6xl px-4">
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
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.2),transparent_24%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.18),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_36px_140px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col gap-5 border-b border-white/10 px-6 py-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.42em] text-cyan-200/80">Arena Command</div>
            <h1 className="mt-3 font-heading text-5xl uppercase tracking-[0.08em] text-text-primary">KOTC Mission Control</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Same old principle of work, upgraded: courts first, judges visible, emergency controls always on deck,
              tournament management moved lower so the match surface stays primary.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-text-secondary">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-200">
              {state.connectionStatus}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">session {state.sessionVersion}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">epoch {state.structureEpoch}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{state.phase || "setup"}</span>
            <button
              onClick={() => backToSessionList()}
              className="rounded-full border border-white/15 px-4 py-2 text-xs text-white transition hover:border-white/30"
            >
              Leave Hub
            </button>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Active Session</div>
            <div className="mt-3 font-heading text-2xl uppercase tracking-[0.08em] text-text-primary">
              {selectedSession?.title || state.selectedSessionId}
            </div>
            <div className="mt-2 text-sm text-text-secondary">{tournamentId || "no tournament link"}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Judge Seats</div>
            <div className="mt-3 font-heading text-4xl text-text-primary">{judgeSeats.length}</div>
            <div className="mt-2 text-sm text-text-secondary">online judges visible in presence feed</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Courts Live</div>
            <div className="mt-3 font-heading text-4xl text-text-primary">{state.nc || 4}</div>
            <div className="mt-2 text-sm text-text-secondary">court lanes in current arena</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Tournament Flow</div>
            <div className="mt-3 font-heading text-4xl text-text-primary">{rounds.length}</div>
            <div className="mt-2 text-sm text-text-secondary">generated rounds, roster {activeRosterCount}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-text-secondary">Court Deck</div>
              <h2 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary">Live Arena</h2>
            </div>
            <button
              onClick={() => refreshPresence()}
              disabled={busy}
              className="rounded-full border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.22em] text-text-primary transition hover:border-white/30 disabled:opacity-50"
            >
              Refresh Presence
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: state.nc || 4 }, (_, offset) => offset + 1).map((idx) => {
              const court = state.courts[idx];
              const seat = state.presence.find((p) => p.courtIdx === idx && p.role === "judge");
              const raw = (court?.scores || {}) as Record<string, unknown>;
              const home = Number(raw.home ?? raw.teamA ?? 0);
              const away = Number(raw.away ?? raw.teamB ?? 0);
              const remainingMs = getRemainingMs(court, state.clockOffsetMs);
              void tick;

              return (
                <div key={idx} className="overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-text-secondary">Court</div>
                      <div className="mt-1 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary">{idx}</div>
                    </div>
                    <div className="text-right">
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-text-secondary">
                        {court?.timerStatus || "idle"}
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">round {court?.roundIdx ?? 0}</div>
                    </div>
                  </div>

                  <div className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Home</div>
                      <div className="mt-2 font-heading text-6xl text-text-primary">{home}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-center">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Timer</div>
                      <div className="mt-2 font-heading text-3xl tracking-[0.12em] text-emerald-200">{formatMs(remainingMs)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Away</div>
                      <div className="mt-2 font-heading text-6xl text-text-primary">{away}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Judge seat</span>
                      <span className={seat ? "text-emerald-200" : "text-text-secondary"}>
                        {seat?.displayName || (seat ? "Unknown judge" : "open")}
                      </span>
                    </div>
                    {seat ? (
                      <button
                        disabled={busy}
                        onClick={() => forceRelease(idx)}
                        className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Force Release Court {idx}
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-secondary">
                        No judge attached to this lane.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-red-500/20 bg-[linear-gradient(180deg,rgba(127,29,29,0.28),rgba(17,24,39,0.22))] p-5">
            <div className="text-[11px] uppercase tracking-[0.34em] text-red-200/80">Mission Rail</div>
            <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-red-100">Global Controls</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                disabled={busy}
                onClick={() => runHubCommand("session.pause", {})}
                className="rounded-2xl border border-amber-500/35 bg-amber-500/18 px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-500/28 disabled:opacity-50"
              >
                Pause Session
              </button>
              <button
                disabled={busy}
                onClick={() => runHubCommand("session.resume", {})}
                className="rounded-2xl border border-emerald-500/35 bg-emerald-500/18 px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-500/28 disabled:opacity-50"
              >
                Resume Session
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Broadcast</div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Message to all courts"
                  className="flex-1 rounded-2xl border border-white/20 bg-surface/80 px-4 py-3 text-sm text-text-primary outline-none focus:border-cyan-500/50"
                />
                <button
                  disabled={busy || !broadcastMessage.trim()}
                  onClick={() =>
                    runHubCommand("global.broadcast_message", { message: broadcastMessage.trim() }).then(() =>
                      setBroadcastMessage(""),
                    )
                  }
                  className="rounded-2xl border border-cyan-500/35 bg-cyan-500/18 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-500/28 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.34em] text-text-secondary">Judge Matrix</div>
                <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-text-primary">Presence Grid</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-text-secondary">
                {judgeSeats.length} attached
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {Array.from({ length: state.nc || 4 }, (_, offset) => offset + 1).map((idx) => {
                const seat = state.presence.find((p) => p.courtIdx === idx && p.role === "judge");
                return (
                  <div key={idx} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Court {idx}</div>
                      <div className="mt-1 text-sm text-text-primary">{seat?.displayName || "Open seat"}</div>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        seat
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-white/5 text-text-secondary"
                      }`}
                    >
                      {seat ? (seat.isOnline ? "online" : "offline") : "empty"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-cyan-500/20 bg-[linear-gradient(180deg,rgba(8,145,178,0.14),rgba(8,145,178,0.04))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-100/80">Tournament Rail</div>
            <h2 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary">Bracket And Roster Flow</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              This stays available, but it no longer steals the first screen. Use it to load roster, build rounds and
              inspect assignments once the live arena is already under control.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void refreshTournamentFlow()}
              className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-text-primary disabled:opacity-40"
            >
              Refresh Flow
            </button>
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void saveRoster()}
              className="rounded-full border border-brand/35 bg-brand/18 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-light disabled:opacity-40"
            >
              Save Roster
            </button>
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void buildRound1()}
              className="rounded-full border border-emerald-500/35 bg-emerald-500/18 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100 disabled:opacity-40"
            >
              Generate Round 1
            </button>
            <button
              type="button"
              disabled={tournamentBusy || !tournamentId}
              onClick={() => void buildRound2()}
              className="rounded-full border border-cyan-500/35 bg-cyan-500/18 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 disabled:opacity-40"
            >
              Generate Round 2
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
              <span>Roster entries: {tournamentRoster.length}</span>
              <span>{tournamentBusy ? "working..." : "ready"}</span>
            </div>
            <textarea
              value={rosterText}
              onChange={(event) => setRosterText(event.target.value)}
              placeholder="One participant per line"
              className="min-h-[260px] w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 text-sm text-text-primary outline-none focus:border-brand/40"
            />
          </div>
          <div className="space-y-3">
            {tournamentError ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {tournamentError}
              </div>
            ) : null}
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 text-sm text-text-secondary">
              <div className="flex items-center justify-between">
                <span>Active roster</span>
                <span className="text-text-primary">{activeRosterCount}</span>
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
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 text-sm text-text-secondary">
                No generated rounds yet. Save roster first, then build Round 1.
              </div>
            ) : (
              rounds.map((round) => <RoundPreview key={round.id} round={round} />)
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
