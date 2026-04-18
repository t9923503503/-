import type { GoBracketSlotView, GoMatchView } from '@/lib/go-next/types';

export const SLOT_H = 56;
export const BASE_GAP = 4;

export interface BracketMatchOverlay {
  setsA: number;
  setsB: number;
  winnerId: string | null;
  hasScore: boolean;
}

export interface BracketSlotViewModel {
  slotId: string;
  position: number;
  teamLabel: string;
  teamId: string | null;
  isBye: boolean;
  isWinner: boolean;
  overlay?: BracketMatchOverlay;
}

export interface BracketRoundViewModel {
  round: number;
  label: string;
  slots: BracketSlotViewModel[];
  firstSlotMargin: number;
  slotGap: number;
}

export interface BracketLevelColors {
  header: string;
  slot: string;
}

export interface GoBracketViewModel {
  levels: string[];
  activeLevel: string;
  rounds: BracketRoundViewModel[];
  levelColors: BracketLevelColors;
  teamCount: number;
  byeCount: number;
  gridSize: number;
}

export function slotGapForRound(round: number): number {
  return (Math.pow(2, round - 1) - 1) * (SLOT_H + BASE_GAP);
}

export function firstSlotMargin(round: number): number {
  return slotGapForRound(round) / 2;
}

export function getRoundLabel(round: number, maxRound: number): string {
  const stepsFromFinal = maxRound - round;
  if (stepsFromFinal === 0) return 'ФИНАЛ';
  if (stepsFromFinal === 1) return 'ПОЛУФИНАЛ';
  if (stepsFromFinal === 2) return '1/4 ФИНАЛА';
  if (stepsFromFinal === 3) return '1/8 ФИНАЛА';
  if (stepsFromFinal === 4) return '1/16 ФИНАЛА';
  return `РАУНД ${round}`;
}

export function getLevelColors(level: string): BracketLevelColors {
  const normalized = level.toLowerCase();
  if (normalized === 'hard' || normalized === 'lyutye') {
    return { header: 'bg-red-950 border-red-500/40 text-red-300', slot: 'border-red-500/20' };
  }
  if (normalized === 'medium') {
    return { header: 'bg-green-950 border-green-500/40 text-green-300', slot: 'border-green-500/20' };
  }
  if (normalized === 'lite') {
    return { header: 'bg-blue-950 border-blue-500/40 text-blue-300', slot: 'border-blue-500/20' };
  }
  return { header: 'bg-white/5 border-white/20 text-white', slot: 'border-white/10' };
}

function groupByRound(slots: GoBracketSlotView[]): Record<number, GoBracketSlotView[]> {
  return slots.reduce<Record<number, GoBracketSlotView[]>>((acc, slot) => {
    if (!acc[slot.bracketRound]) acc[slot.bracketRound] = [];
    acc[slot.bracketRound].push(slot);
    return acc;
  }, {});
}

function buildMatchMap(matches?: GoMatchView[]): Map<string, BracketMatchOverlay> {
  const map = new Map<string, BracketMatchOverlay>();
  if (!matches?.length) return map;
  for (const match of matches) {
    const hasScore = (match.setsA ?? 0) > 0 || (match.setsB ?? 0) > 0;
    map.set(match.matchId, {
      setsA: match.setsA ?? 0,
      setsB: match.setsB ?? 0,
      winnerId: match.winnerId ?? null,
      hasScore,
    });
  }
  return map;
}

function buildRoundOverlays(
  roundSlots: GoBracketSlotView[],
  matchMap: Map<string, BracketMatchOverlay>,
): Map<string, BracketMatchOverlay> {
  const overlays = new Map<string, BracketMatchOverlay>();
  const sorted = [...roundSlots].sort((a, b) => a.position - b.position);
  for (let index = 0; index < sorted.length; index += 2) {
    const left = sorted[index];
    const right = sorted[index + 1];
    const matchId = left?.matchId ?? right?.matchId ?? null;
    if (!matchId) continue;
    const overlay = matchMap.get(matchId);
    if (!overlay) continue;
    overlays.set(left.slotId, overlay);
    if (right?.slotId) overlays.set(right.slotId, overlay);
  }
  return overlays;
}

export function buildGoBracketViewModel({
  brackets,
  level,
  matches,
}: {
  brackets: Record<string, GoBracketSlotView[]>;
  level?: string;
  matches?: GoMatchView[];
}): GoBracketViewModel {
  const levels = Object.keys(brackets);
  const activeLevel = level && levels.includes(level) ? level : levels[0] ?? '';
  const slots = brackets[activeLevel] ?? [];
  const byRound = groupByRound(slots);
  const rounds = Object.keys(byRound)
    .map((value) => Number(value))
    .sort((a, b) => a - b);
  const maxRound = rounds[rounds.length - 1] ?? 1;
  const matchMap = buildMatchMap(matches);

  const roundModels: BracketRoundViewModel[] = rounds.map((round) => {
    const roundSlots = (byRound[round] ?? []).sort((a, b) => a.position - b.position);
    const overlayBySlot = buildRoundOverlays(roundSlots, matchMap);

    return {
      round,
      label: getRoundLabel(round, maxRound),
      firstSlotMargin: firstSlotMargin(round),
      slotGap: slotGapForRound(round),
      slots: roundSlots.map((slot) => {
        const overlay = overlayBySlot.get(slot.slotId);
        const teamId = slot.team?.teamId ?? null;
        return {
          slotId: slot.slotId,
          position: slot.position,
          teamLabel: slot.isBye ? 'BYE' : (slot.team?.label ?? 'TBD'),
          teamId,
          isBye: slot.isBye,
          isWinner: Boolean(overlay?.winnerId && teamId && overlay.winnerId === teamId),
          overlay,
        };
      }),
    };
  });

  const firstRoundSlots = roundModels[0]?.slots ?? [];
  const byeCount = firstRoundSlots.filter((slot) => slot.isBye).length;
  const gridSize = firstRoundSlots.length;
  const teamCount = Math.max(0, gridSize - byeCount);

  return {
    levels,
    activeLevel,
    rounds: roundModels,
    levelColors: getLevelColors(activeLevel),
    teamCount,
    byeCount,
    gridSize,
  };
}
