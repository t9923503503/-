import type { GoMatchView } from '@/lib/go-next/types';

interface CourtInfo {
  courtNo: number;
  label: string;
}

export const GROUP_COLORS: Record<string, string> = {
  A: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  B: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  C: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  D: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  E: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  F: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  G: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  H: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

export function groupBadgeClass(label: string): string {
  return GROUP_COLORS[label.toUpperCase()] ?? 'bg-white/10 text-white/50 border-white/20';
}

export interface GoScheduleViewModel {
  groupLabels: string[];
  bracketLevels: string[];
  filteredMatches: GoMatchView[];
  slots: number[];
  courtNos: number[];
  liveSlotIndexes: Set<number>;
  minLiveSlot: number | null;
  cellMap: Map<string, GoMatchView>;
  cellMatchesMap: Map<string, GoMatchView[]>;
  slotTimeMap: Map<number, string>;
  slotScheduledMap: Map<number, string | null>;
}

function formatHHmm(input: string): string | null {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function stableTimeMatches(matches: GoMatchView[]): GoMatchView[] {
  return [...matches].sort((a, b) => {
    const aSlot = a.slotIndex ?? Number.MAX_SAFE_INTEGER;
    const bSlot = b.slotIndex ?? Number.MAX_SAFE_INTEGER;
    if (aSlot !== bSlot) return aSlot - bSlot;
    const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return (a.matchNo ?? 0) - (b.matchNo ?? 0);
  });
}

function buildSlotTimeMap(matches: GoMatchView[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const match of stableTimeMatches(matches)) {
    if (match.slotIndex == null || map.has(match.slotIndex) || !match.scheduledAt) continue;
    const value = formatHHmm(match.scheduledAt);
    if (value) map.set(match.slotIndex, value);
  }
  return map;
}

export function buildGoScheduleViewModel({
  matches,
  courts,
  activeFilter,
}: {
  matches: GoMatchView[];
  courts: CourtInfo[];
  activeFilter: string;
}): GoScheduleViewModel {
  const groupLabels = [...new Set(matches.map((m) => (m.groupLabel ?? '').trim()).filter(Boolean))].sort();
  const bracketLevels = [
    ...new Set(matches.map((m) => (m.bracketLevel ?? '').trim().toUpperCase()).filter(Boolean)),
  ].sort();

  const filteredMatches = matches.filter((match) => {
    if (activeFilter === 'all') return true;
    if (activeFilter.startsWith('g:')) return (match.groupLabel ?? '') === activeFilter.slice(2);
    if (activeFilter.startsWith('b:')) return (match.bracketLevel ?? '').toUpperCase() === activeFilter.slice(2).toUpperCase();
    return true;
  });

  const slots = [...new Set(filteredMatches.map((m) => m.slotIndex ?? -1))].sort((a, b) => a - b);
  const courtNos =
    courts.length > 0
      ? courts.map((court) => court.courtNo)
      : [...new Set(filteredMatches.map((m) => m.courtNo ?? 0))].sort((a, b) => a - b);

  const liveSlotIndexes = new Set(filteredMatches.filter((m) => m.status === 'live').map((m) => m.slotIndex ?? -1));
  const minLiveSlot = liveSlotIndexes.size > 0 ? Math.min(...liveSlotIndexes) : null;

  const cellMap = new Map<string, GoMatchView>();
  const cellMatchesMap = new Map<string, GoMatchView[]>();
  for (const match of filteredMatches) {
    const key = `${match.slotIndex ?? -1}:${match.courtNo ?? 0}`;
    if (!cellMap.has(key)) cellMap.set(key, match);
    const bucket = cellMatchesMap.get(key) ?? [];
    bucket.push(match);
    cellMatchesMap.set(key, bucket);
  }

  const slotScheduledMap = new Map<number, string | null>();
  for (const match of stableTimeMatches(matches)) {
    if (match.slotIndex == null || slotScheduledMap.has(match.slotIndex)) continue;
    slotScheduledMap.set(match.slotIndex, match.scheduledAt ?? null);
  }

  return {
    groupLabels,
    bracketLevels,
    filteredMatches,
    slots,
    courtNos,
    liveSlotIndexes,
    minLiveSlot,
    cellMap,
    cellMatchesMap,
    slotTimeMap: buildSlotTimeMap(matches),
    slotScheduledMap,
  };
}
