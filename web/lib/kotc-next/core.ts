import { kotcActiveDivKeys } from '../../../formats/kotc/kotc-format.js';
import type {
  KotcNextCourtLiveState,
  KotcNextPairLiveState,
  KotcNextR2SeedZone,
  KotcNextZoneKey,
} from './types';

export interface KotcNextSeedablePairRef {
  courtNo: number;
  pairIdx: number;
  pairLabel: string;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
}

export interface KotcNextUndoInput {
  pairCount: number;
  raundNo: number;
  seed: number;
  timerMinutes: number;
  timerStartedAt?: string | null;
  events: Array<{ eventType: 'king_point' | 'takeover' }>;
}

export type KotcNextManualPairSlot = 'king' | 'challenger';
export type KotcNextManualPairDirection = 'prev' | 'next';

function compareStandings(a: KotcNextPairLiveState, b: KotcNextPairLiveState): number {
  if (b.kingWins !== a.kingWins) return b.kingWins - a.kingWins;
  if (b.takeovers !== a.takeovers) return b.takeovers - a.takeovers;
  if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
  return a.pairIdx - b.pairIdx;
}

function compareSeedRefs(a: KotcNextSeedablePairRef, b: KotcNextSeedablePairRef): number {
  return compareStandings(a, b);
}

function clampSeed(seed: number): number {
  const normalized = Math.trunc(Number(seed) || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function hashSeed(seed: number): number {
  let value = clampSeed(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(values: number[], seed: number): number[] {
  const out = [...values];
  const rnd = mulberry32(hashSeed(seed));
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rnd() * (index + 1));
    const tmp = out[index];
    out[index] = out[swapIndex];
    out[swapIndex] = tmp;
  }
  return out;
}

function buildBlankPairStates(pairCount: number): KotcNextPairLiveState[] {
  return Array.from({ length: Math.max(0, pairCount) }, (_, pairIdx) => ({
    pairIdx,
    kingWins: 0,
    takeovers: 0,
    gamesPlayed: 0,
  }));
}

function rotateQueue<T>(items: T[], steps: number): T[] {
  if (!items.length) return [];
  const normalized = ((steps % items.length) + items.length) % items.length;
  if (!normalized) return [...items];
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function assertPlayableState(state: KotcNextCourtLiveState): void {
  if (state.pairs.length < 2) {
    throw new Error('KOTC Next requires at least two pairs on court');
  }
  if (!Number.isInteger(state.kingPairIdx) || !Number.isInteger(state.challengerPairIdx)) {
    throw new Error('Current king/challenger pair indices are invalid');
  }
}

export function calcKotcNextRaundStandings<T extends KotcNextPairLiveState>(pairs: T[]): T[] {
  return [...pairs].sort(compareStandings);
}

export function getInitialKotcNextCourtState(
  pairCount: number,
  raundNo: number,
  seed: number,
  timerMinutes: number,
  timerStartedAt: string | null = null,
): KotcNextCourtLiveState {
  if (pairCount < 2) {
    throw new Error('KOTC Next requires at least two pairs');
  }

  const base = Array.from({ length: pairCount }, (_, index) => index);
  const shuffled = shuffleDeterministic(base, seed + raundNo * 9973);
  const rotated = rotateQueue(shuffled, Math.max(0, raundNo - 1));
  const [kingPairIdx, challengerPairIdx, ...queueOrder] = rotated;

  return {
    currentRaundNo: raundNo,
    kingPairIdx,
    challengerPairIdx,
    queueOrder,
    pairs: buildBlankPairStates(pairCount),
    timerStartedAt,
    timerMinutes,
    status: timerStartedAt ? 'running' : 'pending',
  };
}

export function applyKingPoint(state: KotcNextCourtLiveState): KotcNextCourtLiveState {
  assertPlayableState(state);

  const nextQueue = [...state.queueOrder];
  const previousChallenger = state.challengerPairIdx;
  const nextChallenger = nextQueue.shift();
  if (nextChallenger == null) {
    throw new Error('Queue is empty; cannot rotate challenger');
  }
  nextQueue.push(previousChallenger);

  const pairs = state.pairs.map((pair) => {
    if (pair.pairIdx === state.kingPairIdx) {
      return {
        ...pair,
        kingWins: pair.kingWins + 1,
        gamesPlayed: pair.gamesPlayed + 1,
      };
    }
    if (pair.pairIdx === state.challengerPairIdx) {
      return { ...pair, gamesPlayed: pair.gamesPlayed + 1 };
    }
    return pair;
  });

  return {
    ...state,
    challengerPairIdx: nextChallenger,
    queueOrder: nextQueue,
    pairs,
    status: 'running',
  };
}

export function applyTakeover(state: KotcNextCourtLiveState): KotcNextCourtLiveState {
  assertPlayableState(state);

  const nextQueue = [...state.queueOrder];
  const nextChallenger = nextQueue.shift();
  if (nextChallenger == null) {
    throw new Error('Queue is empty; cannot rotate challenger');
  }
  const previousKing = state.kingPairIdx;
  const newKing = state.challengerPairIdx;
  nextQueue.push(previousKing);

  const pairs = state.pairs.map((pair) => {
    if (pair.pairIdx === newKing) {
      return {
        ...pair,
        takeovers: pair.takeovers + 1,
        gamesPlayed: pair.gamesPlayed + 1,
      };
    }
    if (pair.pairIdx === previousKing) {
      return { ...pair, gamesPlayed: pair.gamesPlayed + 1 };
    }
    return pair;
  });

  return {
    ...state,
    kingPairIdx: newKing,
    challengerPairIdx: nextChallenger,
    queueOrder: nextQueue,
    pairs,
    status: 'running',
  };
}

export function applyUndo(input: KotcNextUndoInput): KotcNextCourtLiveState {
  const base = getInitialKotcNextCourtState(
    input.pairCount,
    input.raundNo,
    input.seed,
    input.timerMinutes,
    input.timerStartedAt ?? null,
  );
  return input.events.reduce((current, event) => {
    return event.eventType === 'takeover' ? applyTakeover(current) : applyKingPoint(current);
  }, base);
}

export function applyManualPairSwitch(
  state: KotcNextCourtLiveState,
  slot: KotcNextManualPairSlot,
  direction: KotcNextManualPairDirection,
): KotcNextCourtLiveState {
  assertPlayableState(state);

  const step = direction === 'next' ? 1 : -1;
  if (slot === 'king') {
    const [kingPairIdx, challengerPairIdx, ...queueOrder] = rotateQueue(
      [state.kingPairIdx, state.challengerPairIdx, ...state.queueOrder],
      step,
    );
    return {
      ...state,
      kingPairIdx,
      challengerPairIdx,
      queueOrder,
    };
  }

  const rotated = rotateQueue([state.challengerPairIdx, ...state.queueOrder], step);
  const [challengerPairIdx, ...queueOrder] = rotated;
  return {
    ...state,
    challengerPairIdx,
    queueOrder,
  };
}

function activeZoneKeys(courtCount: number): KotcNextZoneKey[] {
  const keys = kotcActiveDivKeys(courtCount);
  const map: Record<string, KotcNextZoneKey> = {
    hard: 'kin',
    advance: 'advance',
    medium: 'medium',
    lite: 'lite',
  };
  return keys.map((key) => map[key] ?? 'lite');
}

function zoneSkeleton(zone: KotcNextZoneKey): KotcNextR2SeedZone {
  return { zone, pairRefs: [] };
}

export function seedKotcNextR2Courts(allStats: KotcNextSeedablePairRef[]): KotcNextR2SeedZone[] {
  const grouped = new Map<number, KotcNextSeedablePairRef[]>();
  for (const row of allStats) {
    const current = grouped.get(row.courtNo) ?? [];
    current.push(row);
    grouped.set(row.courtNo, current);
  }

  const orderedCourts = [...grouped.keys()].sort((a, b) => a - b);
  const courtCount = orderedCourts.length;
  const ppc = Math.max(...[0, ...orderedCourts.map((courtNo) => grouped.get(courtNo)?.length ?? 0)]);
  const zones = activeZoneKeys(courtCount).map(zoneSkeleton);

  if (!courtCount || !ppc) {
    return zones;
  }

  const rankedByCourt = orderedCourts.map((courtNo) =>
    [...(grouped.get(courtNo) ?? [])].sort(compareSeedRefs),
  );

  if (courtCount === 4 && ppc === 4) {
    const firstThree = rankedByCourt.slice(0, 3);
    const fourthCourt = rankedByCourt[3] ?? [];
    const secondCandidates = firstThree.map((rows) => rows[1]).filter(Boolean);
    const thirdCandidates = firstThree.map((rows) => rows[2]).filter(Boolean);
    const fourthCandidates = firstThree.map((rows) => rows[3]).filter(Boolean);

    const bestSecond = [...secondCandidates].sort(compareSeedRefs)[0];
    const remainingSeconds = secondCandidates
      .filter((row) => row.pairLabel !== bestSecond?.pairLabel || row.courtNo !== bestSecond?.courtNo)
      .sort((a, b) => a.courtNo - b.courtNo || a.pairIdx - b.pairIdx);
    const sortedThird = [...thirdCandidates].sort(compareSeedRefs);
    const bestTwoThird = sortedThird.slice(0, 2);
    const remainingThird = sortedThird[2] ? [sortedThird[2]] : [];

    zones[0].pairRefs = [...firstThree.map((rows) => rows[0]).filter(Boolean), bestSecond].filter(Boolean);
    if (zones[1]) {
      zones[1].pairRefs = fourthCourt.slice(0, 4);
    }
    if (zones[2]) {
      zones[2].pairRefs = [...remainingSeconds, ...bestTwoThird].filter(Boolean);
    }
    if (zones[3]) {
      zones[3].pairRefs = [...remainingThird, ...fourthCandidates].filter(Boolean);
    }
    return zones;
  }

  const flattened = rankedByCourt.flat();
  const sliceSize = Math.max(1, ppc);
  zones.forEach((zone, index) => {
    zone.pairRefs = flattened.slice(index * sliceSize, (index + 1) * sliceSize);
  });
  return zones;
}
