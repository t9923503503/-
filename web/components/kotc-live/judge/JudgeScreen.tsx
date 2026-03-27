"use client";

import type { KotcCourtState } from "../types";
import { formatMs, getCourtScores, getRemainingMs } from "./utils";

interface JudgeScreenProps {
  courtIdx: number;
  court: KotcCourtState | undefined;
  clockOffsetMs: number;
  onScore: (side: "home" | "away", delta: number) => void;
  onTimer: (action: "start" | "pause" | "reset" | "plus15" | "minus15") => void;
  onLeave: () => void;
  readOnly?: boolean;
}

export function JudgeScreen({
  courtIdx,
  court,
  clockOffsetMs,
  onScore,
  onTimer,
  onLeave,
  readOnly = false,
}: JudgeScreenProps) {
  const { home, away } = getCourtScores(court);
  const remaining = getRemainingMs(court, clockOffsetMs);
  const laneLabel = readOnly ? "Viewer Feed" : "Judge Console";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_22%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.18),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_36px_140px_rgba(0,0,0,0.38)]">
        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.38em] text-brand-light/80">{laneLabel}</div>
            <h2 className="mt-3 font-heading text-5xl uppercase tracking-[0.08em] text-text-primary">Court {courtIdx}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-text-secondary">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Round {court?.roundIdx ?? 0}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Version {court?.courtVersion ?? 0}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{court?.timerStatus || "idle"}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-full border border-red-500/30 bg-red-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-red-100 transition hover:bg-red-500/20"
          >
            {readOnly ? "Close Feed" : "Leave Seat"}
          </button>
        </div>

        <div className="grid gap-4 px-4 py-4 xl:grid-cols-[1fr_0.82fr_1fr]">
          <div className="rounded-[24px] border border-brand/30 bg-brand/10 p-5">
            <div className="text-[11px] uppercase tracking-[0.34em] text-text-secondary">Home Side</div>
            <div className="mt-4 text-center font-heading text-[8rem] leading-none text-text-primary">{home}</div>
            {!readOnly && (
              <div className="mt-5 grid grid-cols-[0.9fr_1.1fr] gap-3">
                <button
                  type="button"
                  onClick={() => onScore("home", -1)}
                  className="rounded-[20px] border border-white/10 bg-black/20 py-5 text-4xl text-text-primary transition active:scale-95"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => onScore("home", +1)}
                  className="rounded-[20px] border border-brand/40 bg-brand/30 py-5 text-5xl font-semibold text-brand-light transition active:scale-95"
                >
                  +
                </button>
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-emerald-400/20 bg-black/25 p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.34em] text-text-secondary">Timer Core</span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200">
                {court?.timerStatus || "idle"}
              </span>
            </div>
            <div className="mt-8 text-center font-heading text-[4.75rem] leading-none tracking-[0.12em] text-text-primary">
              {formatMs(remaining)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center text-[10px] uppercase tracking-[0.28em] text-text-secondary">
              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                <div>Clock Offset</div>
                <div className="mt-2 text-sm text-text-primary">{clockOffsetMs} ms</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                <div>Feed</div>
                <div className="mt-2 text-sm text-text-primary">{readOnly ? "viewer" : "live seat"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-5">
            <div className="text-[11px] uppercase tracking-[0.34em] text-text-secondary">Away Side</div>
            <div className="mt-4 text-center font-heading text-[8rem] leading-none text-text-primary">{away}</div>
            {!readOnly && (
              <div className="mt-5 grid grid-cols-[0.9fr_1.1fr] gap-3">
                <button
                  type="button"
                  onClick={() => onScore("away", -1)}
                  className="rounded-[20px] border border-white/10 bg-black/20 py-5 text-4xl text-text-primary transition active:scale-95"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => onScore("away", +1)}
                  className="rounded-[20px] border border-cyan-400/35 bg-cyan-400/20 py-5 text-5xl font-semibold text-cyan-100 transition active:scale-95"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="border-t border-white/10 px-4 py-4">
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.34em] text-text-secondary">Control Rail</div>
                <div className="text-xs text-text-secondary">Fast actions for active court control</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <button
                  onClick={() => onTimer("start")}
                  className="rounded-2xl border border-emerald-500/35 bg-emerald-500/18 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200 transition active:scale-95"
                >
                  Start
                </button>
                <button
                  onClick={() => onTimer("pause")}
                  className="rounded-2xl border border-amber-500/35 bg-amber-500/18 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-amber-100 transition active:scale-95"
                >
                  Pause
                </button>
                <button
                  onClick={() => onTimer("reset")}
                  className="rounded-2xl border border-white/15 bg-white/5 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-text-primary transition active:scale-95"
                >
                  Reset
                </button>
                <button
                  onClick={() => onTimer("plus15")}
                  className="rounded-2xl border border-cyan-500/35 bg-cyan-500/18 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition active:scale-95"
                >
                  Add 15s
                </button>
                <button
                  onClick={() => onTimer("minus15")}
                  className="rounded-2xl border border-cyan-500/35 bg-cyan-500/18 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition active:scale-95"
                >
                  Cut 15s
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
