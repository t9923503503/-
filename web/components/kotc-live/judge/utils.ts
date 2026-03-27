import { type KotcCourtState } from "../types";

export function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function getRemainingMs(court: KotcCourtState | undefined, clockOffsetMs: number): number {
  if (!court) return 0;
  if (court.timerStatus !== "running") {
    if (typeof court.timerDurationMs === "number" && court.timerDurationMs > 0) return court.timerDurationMs;
    return 0;
  }
  if (!court.timerEndsAt) return 0;
  const now = Date.now() + clockOffsetMs;
  return Math.max(0, court.timerEndsAt - now);
}

export function getCourtScores(court: KotcCourtState | undefined): { home: number; away: number; raw: Record<string, unknown> } {
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
