import { type KotcCourtState } from "../types";

export function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export const KOTC_CARD_TONES = [
  {
    border: "border-[#5cc5ff]/70",
    glow: "from-[#12253d] to-[#0b1627]",
    badge: "bg-[#0f2740] text-[#8ad4ff] border-[#5cc5ff]/35",
    button: "border-[#1d3557] bg-[#132642] text-[#9fdfff]",
    primary: "border-[#3baef5]/40 bg-[#16314f] text-white",
  },
  {
    border: "border-[#4ade80]/70",
    glow: "from-[#15281d] to-[#0d1912]",
    badge: "bg-[#102617] text-[#9ef0bc] border-[#4ade80]/35",
    button: "border-[#284536] bg-[#16291e] text-[#b4f4c8]",
    primary: "border-[#3ebd70]/40 bg-[#173224] text-white",
  },
  {
    border: "border-[#fbbf24]/70",
    glow: "from-[#2b1f0f] to-[#171109]",
    badge: "bg-[#2b210f] text-[#ffd978] border-[#fbbf24]/35",
    button: "border-[#4a3616] bg-[#2c200f] text-[#ffe3a0]",
    primary: "border-[#d39a19]/40 bg-[#3a2810] text-white",
  },
  {
    border: "border-[#c084fc]/70",
    glow: "from-[#241530] to-[#130c19]",
    badge: "bg-[#22162e] text-[#dcb6ff] border-[#c084fc]/35",
    button: "border-[#3f2553] bg-[#241833] text-[#e7ccff]",
    primary: "border-[#9e67db]/40 bg-[#301d43] text-white",
  },
] as const;

export type KotcPairCard = {
  slotIdx: number;
  manName: string;
  womanName: string;
  score: number | null;
};

export type KotcServeState = {
  activeSlotIdx: number;
  waitingSlotIdx: number | null;
  activeServerPlayerIdx: number | null;
  waitingServerPlayerIdx: number | null;
  serverPlayerIdxBySlot: Array<number | null>;
};

type KotcScoreMatrix = Array<Array<number | null>>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRosterName(value: unknown): string {
  if (typeof value === "string") return value;
  const row = asRecord(value);
  return String(row.displayName ?? row.display_name ?? row.name ?? "").trim();
}

function normalizeServerSlots(value: unknown, slotCount: number): Array<number | null> {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: slotCount }, (_, index) => {
    const numeric = source[index] == null ? null : toNumber(source[index], -1);
    return numeric === 0 || numeric === 1 ? numeric : null;
  });
}

function readMatrixFromLegacy(raw: Record<string, unknown>, roundCount: number, slotCount: number): KotcScoreMatrix {
  const matrix = makeEmptyScoreMatrix(roundCount, slotCount);
  const roundsRecord = asRecord(raw.rounds ?? raw.round_scores ?? raw.scoreMatrix ?? raw.score_matrix);

  if (Object.keys(roundsRecord).length > 0) {
    const usesOneBasedKeys = Object.prototype.hasOwnProperty.call(roundsRecord, "1");
    for (let roundIdx = 0; roundIdx < roundCount; roundIdx += 1) {
      const bucket = usesOneBasedKeys
        ? roundsRecord[String(roundIdx + 1)]
        : roundsRecord[String(roundIdx)];
      if (Array.isArray(bucket)) {
        for (let slotIdx = 0; slotIdx < slotCount; slotIdx += 1) {
          const candidate = bucket[slotIdx];
          matrix[roundIdx][slotIdx] = candidate == null ? null : toNumber(candidate, 0);
        }
        continue;
      }
      const bucketRecord = asRecord(bucket);
      for (let slotIdx = 0; slotIdx < slotCount; slotIdx += 1) {
        const candidate =
          bucketRecord[`slot${slotIdx + 1}`] ??
          bucketRecord[String(slotIdx + 1)] ??
          bucketRecord[String(slotIdx)];
        matrix[roundIdx][slotIdx] = candidate == null ? null : toNumber(candidate, 0);
      }
    }
    return matrix;
  }

  const fallbackNumbers = Object.entries(raw).filter(
    ([key, value]) => /^slot\d+$/.test(key) && (typeof value === "number" || typeof value === "string"),
  );
  if (fallbackNumbers.length > 0) {
    for (let slotIdx = 0; slotIdx < slotCount; slotIdx += 1) {
      const candidate = raw[`slot${slotIdx + 1}`];
      matrix[0][slotIdx] = candidate == null ? null : toNumber(candidate, 0);
    }
    return matrix;
  }

  if (typeof raw.home === "number" || typeof raw.away === "number" || typeof raw.teamA === "number" || typeof raw.teamB === "number") {
    matrix[0][0] = raw.home == null ? toNumber(raw.teamA, 0) : toNumber(raw.home, 0);
    matrix[0][1] = raw.away == null ? toNumber(raw.teamB, 0) : toNumber(raw.away, 0);
  }

  return matrix;
}

export function getRoundCount(ppc: number | undefined): number {
  const normalized = Math.trunc(toNumber(ppc, 4));
  return Math.max(1, Math.min(4, normalized || 4));
}

export function getStageLabel(phase: string | undefined): string {
  const normalized = String(phase || "").trim().toLowerCase();
  if (normalized === "round2") return "2 тур";
  if (normalized === "final") return "Финал";
  return "1 тур";
}

export function makeEmptyScoreMatrix(roundCount: number, slotCount: number): KotcScoreMatrix {
  return Array.from({ length: roundCount }, () => Array.from({ length: slotCount }, () => null));
}

export function getCourtScoreMatrix(court: KotcCourtState | undefined, roundCount: number, slotCount: number): KotcScoreMatrix {
  const raw = asRecord(court?.scores);
  return readMatrixFromLegacy(raw, roundCount, slotCount);
}

export function buildNextCourtScores(
  court: KotcCourtState | undefined,
  roundCount: number,
  slotCount: number,
  roundIdx: number,
  slotIdx: number,
  nextScore: number | null,
): Record<string, unknown> {
  const matrix = getCourtScoreMatrix(court, roundCount, slotCount);
  const safeRound = Math.max(0, Math.min(roundCount - 1, roundIdx));
  const safeSlot = Math.max(0, Math.min(slotCount - 1, slotIdx));
  matrix[safeRound][safeSlot] = nextScore;

  const rounds: Record<string, Array<number | null>> = {};
  for (let index = 0; index < roundCount; index += 1) {
    rounds[String(index + 1)] = [...matrix[index]];
  }

  return {
    rounds,
    updatedFor: {
      roundIdx: safeRound,
      slotIdx: safeSlot,
    },
  };
}

export function getCourtPairs(
  court: KotcCourtState | undefined,
  ppc: number | undefined,
  roundIdx: number,
): KotcPairCard[] {
  const slotCount = getRoundCount(ppc);
  const rosterM = asArray(court?.rosterM).map(normalizeRosterName);
  const rosterW = asArray(court?.rosterW).map(normalizeRosterName);
  const matrix = getCourtScoreMatrix(court, slotCount, slotCount);
  const safeRound = Math.max(0, Math.min(slotCount - 1, roundIdx));

  return Array.from({ length: slotCount }, (_, slotIdx) => {
    const womanIdx = (slotIdx + safeRound) % slotCount;
    return {
      slotIdx,
      manName: rosterM[slotIdx] || "—",
      womanName: rosterW[womanIdx] || "—",
      score: matrix[safeRound]?.[slotIdx] ?? null,
    };
  });
}

export function getCourtServeState(
  court: KotcCourtState | undefined,
  ppc: number | undefined,
): KotcServeState {
  const slotCount = getRoundCount(ppc);
  const numericActive = Number(court?.activeSlotIdx ?? 0);
  const activeSlotIdx =
    Number.isInteger(numericActive) && numericActive >= 0 && numericActive < slotCount ? numericActive : 0;
  const waitingSlotIdx = slotCount > 1 ? (activeSlotIdx + 1) % slotCount : null;
  const serverPlayerIdxBySlot = normalizeServerSlots(court?.serverPlayerIdxBySlot, slotCount);
  return {
    activeSlotIdx,
    waitingSlotIdx,
    activeServerPlayerIdx: serverPlayerIdxBySlot[activeSlotIdx] ?? null,
    waitingServerPlayerIdx:
      waitingSlotIdx == null ? null : (serverPlayerIdxBySlot[waitingSlotIdx] ?? null),
    serverPlayerIdxBySlot,
  };
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
