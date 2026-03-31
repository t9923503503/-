"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSnapshot, listSessions } from "../api";
import type { KotcCourtState, KotcRole, KotcSessionSummary, KotcSnapshot } from "../types";

const STORED_SEAT_KEY = "kotc_live_last_seat_v1";
const STORED_DISPLAY_NAME_KEY = "kotc_live_display_name";

interface StoredSeatInfo {
  sessionId: string;
  role: KotcRole;
  courtIdx: number | null;
  seatToken: string;
  displayName?: string;
}

interface ClassicKotcMobileBridgeProps {
  legacyAppSrc: string;
  fallbackHref: string;
}

type BridgeState =
  | { status: "boot"; message: string }
  | { status: "ready"; iframeSrc: string; activeCourtTab: number; activeRound: number }
  | { status: "error"; message: string };

function readStoredSeat(): StoredSeatInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORED_SEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSeatInfo;
    if (!parsed?.sessionId || !parsed?.seatToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readStoredDisplayName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORED_DISPLAY_NAME_KEY) || "";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()) : [];
}

function toLegacyCourtIndexMap(snapshot: KotcSnapshot): Map<number, number> {
  const rawIndices = Object.values(snapshot.courts)
    .map((court) => Number(court.courtIdx))
    .filter((value) => Number.isFinite(value));
  const oneBased = rawIndices.length > 0 && rawIndices.every((value) => value >= 1);
  const map = new Map<number, number>();

  for (const court of Object.values(snapshot.courts)) {
    const raw = Number(court.courtIdx);
    if (!Number.isFinite(raw)) continue;
    const legacyIdx = Math.max(0, Math.min(3, oneBased ? raw - 1 : raw));
    map.set(raw, legacyIdx);
  }
  return map;
}

function buildLegacyRoster(snapshot: KotcSnapshot, courtIndexMap: Map<number, number>) {
  const roster = Array.from({ length: 4 }, () => ({ men: Array(4).fill(""), women: Array(4).fill("") }));
  for (const court of Object.values(snapshot.courts)) {
    const idx = courtIndexMap.get(Number(court.courtIdx));
    if (typeof idx !== "number") continue;
    roster[idx] = {
      men: toStringArray(court.rosterM).slice(0, 4),
      women: toStringArray(court.rosterW).slice(0, 4),
    };
  }
  return roster;
}

function buildLegacyScores(snapshot: KotcSnapshot, courtIndexMap: Map<number, number>) {
  const scores = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => Array(4).fill(null as number | null)),
  );

  for (const court of Object.values(snapshot.courts)) {
    const idx = courtIndexMap.get(Number(court.courtIdx));
    if (typeof idx !== "number") continue;

    const raw = (court.scores || {}) as Record<string, unknown>;
    const round = Math.max(0, Math.min(3, Number(court.roundIdx || 0)));
    const home = Number(raw.home ?? raw.teamA ?? 0);
    const away = Number(raw.away ?? raw.teamB ?? 0);

    scores[idx][0][round] = Number.isFinite(home) && home > 0 ? home : null;
    scores[idx][1][round] = Number.isFinite(away) && away > 0 ? away : null;
  }

  return scores;
}

function buildLegacyTimers(snapshot: KotcSnapshot, courtIndexMap: Map<number, number>) {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, idx) => {
    const court = Object.values(snapshot.courts).find(
      (item) => courtIndexMap.get(Number(item.courtIdx)) === idx,
    );

    const totalMs = Math.max(0, Number(court?.timerDurationMs || 0));
    const totalSec = totalMs > 0 ? Math.max(1, Math.ceil(totalMs / 1000)) : 10 * 60;
    const running = court?.timerStatus === "running";
    const remainingSec = running && court?.timerEndsAt
      ? Math.max(0, Math.ceil((court.timerEndsAt - now) / 1000))
      : totalMs > 0
        ? Math.max(0, Math.ceil(totalMs / 1000))
        : totalSec;

    return {
      preset: Math.max(1, Math.round(totalSec / 60)),
      total: totalSec,
      remaining: remainingSec,
      running,
      startedAt: running ? now : null,
      startRemaining: remainingSec,
    };
  });
}

function seedLegacyStorage(snapshot: KotcSnapshot, session: KotcSessionSummary) {
  if (typeof window === "undefined") return new Map<number, number>();

  const courtIndexMap = toLegacyCourtIndexMap(snapshot);
  const roster = buildLegacyRoster(snapshot, courtIndexMap);
  const scores = buildLegacyScores(snapshot, courtIndexMap);
  const timers = buildLegacyTimers(snapshot, courtIndexMap);

  window.localStorage.setItem("kotc_version", "1.1");
  window.localStorage.setItem("kotc3_cfg", JSON.stringify({ ppc: 4, nc: Math.max(1, Math.min(4, snapshot.nc || 4)), fixedPairs: false }));
  window.localStorage.setItem("kotc3_roster", JSON.stringify(roster));
  window.localStorage.setItem("kotc3_scores", JSON.stringify(scores));
  window.localStorage.setItem("kotc3_divscores", JSON.stringify({ hard: [], advance: [], medium: [], lite: [] }));
  window.localStorage.setItem(
    "kotc3_divroster",
    JSON.stringify({
      hard: { men: [], women: [] },
      advance: { men: [], women: [] },
      medium: { men: [], women: [] },
      lite: { men: [], women: [] },
    }),
  );
  window.localStorage.setItem(
    "kotc3_meta",
    JSON.stringify({
      name: session.title || `KOTC Live ${snapshot.sessionId}`,
      format: "King of the Court",
      division: "Mixed",
      tournamentId: session.tournamentId || snapshot.sessionId,
      phase: snapshot.phase || "setup",
    }),
  );
  window.localStorage.setItem("kotc_timers_v1", JSON.stringify(timers));
  return courtIndexMap;
}

function buildLegacyIframeSrc(
  legacyAppSrc: string,
  session: KotcSessionSummary,
  storedSeat: StoredSeatInfo | null,
  activeCourtTab: number,
  displayName: string,
): string {
  const url = new URL(legacyAppSrc, typeof window !== "undefined" ? window.location.origin : "https://lpvolley.ru");
  url.searchParams.set("trnId", session.tournamentId || session.sessionId);

  if (storedSeat && typeof storedSeat.courtIdx === "number") {
    url.searchParams.set("court", String(activeCourtTab));
  } else {
    url.searchParams.delete("court");
  }

  if (storedSeat?.seatToken) {
    url.searchParams.set("token", storedSeat.seatToken);
  }
  if (displayName) {
    url.searchParams.set("judge", displayName);
  }

  return url.toString();
}

async function disableLegacyServiceWorkers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.includes("/kotc/"))
        .map((registration) => registration.unregister()),
    );
  } catch {
    // Best-effort: bridge still works if the browser does not expose registrations.
  }
}

export function ClassicKotcMobileBridge({ legacyAppSrc, fallbackHref }: ClassicKotcMobileBridgeProps) {
  const [bridgeState, setBridgeState] = useState<BridgeState>({
    status: "boot",
    message: "Opening classic King of the Court…",
  });
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await disableLegacyServiceWorkers();

        const storedSeat = readStoredSeat();
        const displayName = storedSeat?.displayName || readStoredDisplayName();
        const sessions = await listSessions();
        const session =
          sessions.find((item) => item.sessionId === storedSeat?.sessionId) ||
          sessions[0];

        if (!session) {
          throw new Error("No active KOTC sessions");
        }

        const snapshot = await fetchSnapshot(session.sessionId, "full", storedSeat?.seatToken || null);
        const courtIndexMap = seedLegacyStorage(snapshot, session);

        const activeCourtTab = storedSeat && typeof storedSeat.courtIdx === "number"
          ? courtIndexMap.get(storedSeat.courtIdx) ?? Math.max(0, storedSeat.courtIdx - 1)
          : 0;

        const activeRound = (() => {
          const matchingCourt = Object.values(snapshot.courts).find((court) => {
            const mapped = courtIndexMap.get(Number(court.courtIdx));
            return mapped === activeCourtTab;
          });
          return Math.max(0, Math.min(3, Number(matchingCourt?.roundIdx || 0)));
        })();

        const iframeSrc = buildLegacyIframeSrc(legacyAppSrc, session, storedSeat, activeCourtTab, displayName);

        if (!cancelled) {
          setBridgeState({ status: "ready", iframeSrc, activeCourtTab, activeRound });
        }
      } catch (error) {
        if (!cancelled) {
          setBridgeState({
            status: "error",
            message: error instanceof Error ? error.message : "Failed to open classic KOTC",
          });
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [legacyAppSrc]);

  useEffect(() => {
    if (bridgeState.status !== "ready") return;
    const frame = frameRef.current;
    if (!frame) return;

    let attempt = 0;
    const timer = window.setInterval(() => {
      attempt += 1;
      try {
        const frameWindow = frame.contentWindow as (Window & {
          switchTab?: (value: number | string) => Promise<unknown> | unknown;
          setCourtRound?: (courtIdx: number, roundIdx: number) => void;
        }) | null;
        if (!frameWindow || typeof frameWindow.switchTab !== "function") {
          if (attempt > 120) window.clearInterval(timer);
          return;
        }

        void frameWindow.switchTab(bridgeState.activeCourtTab);
        if (typeof frameWindow.setCourtRound === "function") {
          frameWindow.setCourtRound(bridgeState.activeCourtTab, bridgeState.activeRound);
        }
        window.clearInterval(timer);
      } catch {
        if (attempt > 120) window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [bridgeState]);

  const overlay = useMemo(() => {
    if (bridgeState.status === "error") {
      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 text-center text-text-primary">
          <div className="text-[11px] uppercase tracking-[0.36em] text-brand-light/80">Classic KOTC</div>
          <h1 className="mt-4 font-heading text-4xl uppercase tracking-[0.06em]">Mobile Bridge Failed</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-text-secondary">{bridgeState.message}</p>
          <a
            href={fallbackHref}
            className="mt-6 rounded-full border border-brand/40 bg-brand/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-light"
          >
            Open Fallback Classic
          </a>
        </div>
      );
    }

    if (bridgeState.status === "boot") {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-background text-center text-text-primary">
          <div>
            <div className="text-[11px] uppercase tracking-[0.36em] text-brand-light/80">Classic KOTC</div>
            <div className="mt-4 font-heading text-4xl uppercase tracking-[0.06em]">Preparing Mobile Judge View</div>
            <div className="mt-3 text-sm text-text-secondary">{bridgeState.message}</div>
          </div>
        </div>
      );
    }

    return null;
  }, [bridgeState, fallbackHref]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      {bridgeState.status === "ready" ? (
        <iframe
          ref={frameRef}
          src={bridgeState.iframeSrc}
          className="h-full w-full border-0"
          title="Classic King of the Court mobile bridge"
          allow="clipboard-write"
        />
      ) : null}
      {overlay}
    </div>
  );
}
