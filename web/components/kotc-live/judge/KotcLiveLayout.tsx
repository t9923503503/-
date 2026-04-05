"use client";

import { useEffect, useState } from "react";
import { useKotcLiveStore } from "../use-kotc-live-store";
import { KotcLiveJudgeFlow } from "./KotcLiveJudgeFlow";

function ConnectionBadge({ status }: { status: string }) {
  const label =
    status === "connected"
      ? "онлайн"
      : status === "reconnecting"
        ? "переподключение"
        : status === "connecting"
          ? "подключение"
          : status === "offline"
            ? "оффлайн"
            : "idle";
  const style =
    status === "connected"
      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
      : status === "reconnecting"
        ? "border-amber-500/35 bg-amber-500/15 text-amber-100"
        : "border-white/10 bg-white/5 text-text-secondary";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${style}`}>
      {label}
    </span>
  );
}

function setLegacyFlagInUrl(enabled: boolean) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set("legacy", "1");
  } else {
    url.searchParams.delete("legacy");
  }
  window.history.replaceState(null, "", url.toString());
}

export function KotcLiveLayout({
  legacyIframeSrc,
  initialLegacyMode = false,
  targetTournamentId,
  targetNc,
}: {
  legacyIframeSrc: string;
  initialLegacyMode?: boolean;
  targetTournamentId?: string | null;
  targetNc?: number;
}) {
  const { state, actions } = useKotcLiveStore();
  const [forceLegacy, setForceLegacy] = useState(initialLegacyMode);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("judge-workspace");
    return () => {
      document.body.classList.remove("judge-workspace");
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("legacy") === "1") {
        setForceLegacy(true);
      }
    }
  }, []);

  useEffect(() => {
    setForceLegacy(initialLegacyMode);
  }, [initialLegacyMode]);

  const isLegacy = forceLegacy || state.mode === "legacy";

  if (isLegacy) {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-[#050914] text-text-primary">
        <iframe
          src={legacyIframeSrc}
          className="h-full w-full border-0 bg-[#050914]"
          title="King of the Court - legacy judge app"
          allow="clipboard-write"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end px-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(4,8,18,0.72)] px-2 py-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {state.legacyReason ? (
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-text-secondary sm:inline-flex">
                {state.legacyReason}
              </span>
            ) : null}
            <button
              onClick={() => {
                setForceLegacy(false);
                setLegacyFlagInUrl(false);
                actions.refreshSessions();
              }}
              className="rounded-full border border-brand/30 bg-brand/15 px-3 py-1.5 text-[11px] font-medium text-brand-light transition hover:border-brand/50 hover:bg-brand/20"
            >
              Новая версия
            </button>
            <a
              href="/"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-text-secondary transition hover:border-white/20 hover:text-white"
            >
              LPVOLLEY
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_20%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_20%),linear-gradient(180deg,#050914,#08101d)] text-text-primary">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[rgba(4,8,18,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-text-secondary">KOTC Live</div>
              <h1 className="font-heading text-xl uppercase tracking-[0.08em] text-text-primary sm:text-2xl">
                Судьям
              </h1>
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
              onClick={() => {
                setForceLegacy(true);
                setLegacyFlagInUrl(true);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-text-secondary transition hover:border-white/25 hover:text-white"
            >
              Старая версия
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full pb-10">
        <KotcLiveJudgeFlow targetTournamentId={targetTournamentId} targetNc={targetNc} />
      </main>
    </div>
  );
}
