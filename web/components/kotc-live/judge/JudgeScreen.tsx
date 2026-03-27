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

  return (
    <div className="w-full max-w-4xl mx-auto mt-4 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading text-3xl text-text-primary tracking-wide">
            Court {courtIdx} {readOnly && "(Viewer Mode)"}
          </h2>
          <span className="text-sm font-body text-text-secondary mt-1 block">
            round {court?.roundIdx ?? 0} • ver {court?.courtVersion ?? 0}
          </span>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20 transition-colors"
        >
          {readOnly ? "Close" : "Leave Seat"}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-6 flex flex-col items-center">
          <div className="text-sm uppercase tracking-wider text-text-secondary font-body font-bold mb-4">Home</div>
          <div className="text-8xl font-heading text-text-primary mb-6">{home}</div>
          {!readOnly && (
            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => onScore("home", -1)}
                className="flex-1 rounded-xl border border-white/10 bg-surface/50 py-4 text-2xl text-text-primary active:scale-95 transition-transform"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => onScore("home", +1)}
                className="flex-[2] rounded-xl border border-brand/50 bg-brand/30 py-4 text-3xl font-bold text-brand-light active:scale-95 transition-transform shadow-lg"
              >
                +
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface/30 p-6 flex flex-col items-center">
          <div className="text-sm uppercase tracking-wider text-text-secondary font-body font-bold mb-4">Away</div>
          <div className="text-8xl font-heading text-text-primary mb-6">{away}</div>
          {!readOnly && (
            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => onScore("away", -1)}
                className="flex-1 rounded-xl border border-white/10 bg-surface/50 py-4 text-2xl text-text-primary active:scale-95 transition-transform"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => onScore("away", +1)}
                className="flex-[2] rounded-xl border border-brand/50 bg-brand/30 py-4 text-3xl font-bold text-brand-light active:scale-95 transition-transform shadow-lg"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-emerald-500/20 bg-surface-light/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm uppercase tracking-wide text-text-secondary font-body font-bold">Timer</div>
          <div className="text-sm text-text-secondary font-body px-3 py-1 rounded bg-black/20">
            {court?.timerStatus || "idle"}
          </div>
        </div>
        <div className="text-6xl text-center font-heading text-text-primary tracking-widest my-4">
          {formatMs(remaining)}
        </div>
        {!readOnly && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button
              onClick={() => onTimer("start")}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 py-3 text-sm font-semibold text-emerald-300 active:scale-95 transition-transform shadow"
            >
              Start
            </button>
            <button
              onClick={() => onTimer("pause")}
              className="rounded-lg border border-amber-500/40 bg-amber-500/20 py-3 text-sm font-semibold text-amber-200 active:scale-95 transition-transform"
            >
              Pause
            </button>
            <button
              onClick={() => onTimer("reset")}
              className="rounded-lg border border-white/15 bg-white/5 py-3 text-sm font-semibold text-text-primary active:scale-95 transition-transform"
            >
              Reset
            </button>
            <button
              onClick={() => onTimer("plus15")}
              className="col-span-1 border border-cyan-500/40 bg-cyan-500/20 py-3 rounded-lg text-sm text-cyan-200 active:scale-95 transition-transform"
            >
              +15s
            </button>
            <button
              onClick={() => onTimer("minus15")}
              className="col-span-1 border border-cyan-500/40 bg-cyan-500/20 py-3 rounded-lg text-sm text-cyan-200 active:scale-95 transition-transform"
            >
              -15s
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
