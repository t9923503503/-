"use client";

import { useKotcLiveStore } from "../use-kotc-live-store";
import { KotcLiveJudgeFlow } from "./KotcLiveJudgeFlow";
import { useEffect, useState } from "react";

function ConnectionBadge({ status }: { status: string }) {
  const style =
    status === "connected"
      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
      : status === "reconnecting"
        ? "border-amber-500/35 bg-amber-500/15 text-amber-100"
        : "border-white/10 bg-white/5 text-text-secondary";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${style}`}>
      {status}
    </span>
  );
}

export function KotcLiveLayout({ legacyIframeSrc }: { legacyIframeSrc: string }) {
  const { state, actions } = useKotcLiveStore();
  const [forceLegacy, setForceLegacy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("legacy") === "1") {
        setForceLegacy(true);
      }
    }
  }, []);

  const isLegacy = forceLegacy || state.mode === "legacy";

  if (isLegacy) {
    return (
      <div className="flex h-screen w-full flex-col bg-background">
        <div className="z-10 flex items-center justify-between border-b border-white/10 bg-surface-light p-3">
          <div className="text-sm font-body text-text-secondary">
            Legacy Mode Active {state.legacyReason ? `(${state.legacyReason})` : ""}
          </div>
          <button
            onClick={() => {
              setForceLegacy(false);
              actions.refreshSessions();
            }}
            className="rounded border border-brand/40 bg-brand/20 px-3 py-1.5 text-xs text-brand-light"
          >
            Switch to New Version
          </button>
        </div>
        <iframe
          src={legacyIframeSrc}
          className="flex-1 w-full border-0"
          title="King of the Court - legacy judge app"
          allow="clipboard-write"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_20%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_20%),linear-gradient(180deg,#050914,#08101d)] text-text-primary">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[rgba(4,8,18,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-text-secondary">KOTC Live</div>
              <h1 className="font-heading text-2xl uppercase tracking-[0.08em] text-text-primary">Judge Control Deck</h1>
            </div>
            <ConnectionBadge status={state.connectionStatus} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-secondary">
            {state.selectedSessionId ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                session {state.selectedSessionId}
              </span>
            ) : null}
            {typeof state.courtIdx === "number" ? (
              <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-brand-light">
                court {state.courtIdx}
              </span>
            ) : null}
            {state.role ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{state.role}</span>
            ) : null}
            {state.error && (
              <div className="max-w-sm truncate rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-red-300">
                {state.error}
              </div>
            )}
            <button
              onClick={() => setForceLegacy(true)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-secondary transition hover:border-white/25 hover:text-white"
            >
              Old Version
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full pb-10">
        <KotcLiveJudgeFlow />
      </main>
    </div>
  );
}
