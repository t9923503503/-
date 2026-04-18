'use client';

import type { GoBracketSlotView } from '@/lib/go-next/types';

function groupByRound(slots: GoBracketSlotView[]): Record<number, GoBracketSlotView[]> {
  return slots.reduce<Record<number, GoBracketSlotView[]>>((acc, slot) => {
    if (!acc[slot.bracketRound]) acc[slot.bracketRound] = [];
    acc[slot.bracketRound].push(slot);
    return acc;
  }, {});
}

function roundLabel(round: number): string {
  if (round === 1) return 'QF';
  if (round === 2) return 'SF';
  if (round === 3) return 'F';
  return `R${round}`;
}

export function GoBracketView({
  brackets,
  level,
  onLevelChange,
}: {
  brackets: Record<string, GoBracketSlotView[]>;
  level?: string;
  onLevelChange?: (level: string) => void;
}) {
  const levels = Object.keys(brackets);
  const activeLevel = level && levels.includes(level) ? level : levels[0] ?? '';
  const slots = brackets[activeLevel] ?? [];
  const byRound = groupByRound(slots);
  const rounds = Object.keys(byRound)
    .map((value) => Number(value))
    .sort((a, b) => a - b);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">Сетка</h4>
        <div className="flex flex-wrap gap-2">
          {levels.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onLevelChange?.(item)}
              className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase ${
                item === activeLevel
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {rounds.map((round) => (
          <div key={round} className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{roundLabel(round)}</div>
            <div className="mt-2 space-y-2">
              {byRound[round]
                .sort((a, b) => a.position - b.position)
                .map((slot) => (
                  <div key={slot.slotId} className="rounded border border-white/10 px-2 py-1 text-xs">
                    <div className="text-white/50">Pos {slot.position}</div>
                    <div className="mt-1 font-medium text-white">{slot.team?.label ?? (slot.isBye ? 'BYE' : 'TBD')}</div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
