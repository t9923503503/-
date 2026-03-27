"use client";

import { useKotcLiveStore } from "../use-kotc-live-store";
import { KotcLiveJudgeFlow } from "./KotcLiveJudgeFlow";
import { useState, useEffect } from "react";

function ConnectionBadge({ status }: { status: string }) {
  const style =
    status === "connected"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : status === "reconnecting"
        ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
        : "bg-surface-light border-white/10 text-text-secondary";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-body ${style}`}>
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
      <div className="flex flex-col h-screen w-full">
        <div className="bg-surface-light border-b border-white/10 p-3 flex justify-between items-center z-10">
          <div className="text-sm font-body text-text-secondary">
            Legacy Mode Active {state.legacyReason ? `(${state.legacyReason})` : ""}
          </div>
          <button 
            onClick={() => {
              setForceLegacy(false);
              actions.refreshSessions();
            }} 
            className="text-xs bg-brand/20 text-brand-light px-3 py-1.5 rounded border border-brand/40"
          >
            Switch to New Version
          </button>
        </div>
        <iframe
          src={legacyIframeSrc}
          className="flex-1 w-full border-0"
          title="King of the Court — legacy judge app"
          allow="clipboard-write"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col w-full bg-background text-text-primary">
      <header className="border-b border-white/10 bg-surface/80 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-xl text-text-primary tracking-wide">Judge Terminal</h1>
            <ConnectionBadge status={state.connectionStatus} />
          </div>
          <div className="flex items-center gap-4">
            {state.error && (
               <div className="text-xs text-red-400 max-w-sm truncate mr-2">{state.error}</div>
            )}
            <button 
              onClick={() => setForceLegacy(true)}
              className="text-xs text-text-secondary hover:text-white transition-colors"
            >
              Old Version
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        <KotcLiveJudgeFlow />
      </main>
    </div>
  );
}
