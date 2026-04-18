'use client';

import { useMemo } from 'react';
import type { GoBracketSlotView, GoMatchView } from '@/lib/go-next/types';
import {
  SLOT_H,
  buildGoBracketViewModel,
  slotGapForRound,
} from './view-model-bracket';

function BracketSlot({
  slot,
  slotBorderClass,
}: {
  slot: {
    slotId: string;
    position: number;
    teamLabel: string;
    isBye: boolean;
    isWinner: boolean;
    overlay?: { setsA: number; setsB: number; hasScore: boolean };
  };
  slotBorderClass: string;
}) {
  return (
    <div
      className={[
        'flex h-14 w-[176px] items-center gap-2 overflow-hidden rounded border px-2 text-xs',
        slotBorderClass,
        slot.isBye ? 'bg-white/[0.03] opacity-40' : 'bg-black/30',
        slot.isWinner ? 'border-brand/60 bg-brand/10' : '',
      ].join(' ')}
    >
      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-white/30">{slot.position}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate whitespace-nowrap font-medium text-white">{slot.teamLabel}</span>
        {slot.overlay?.hasScore && !slot.isBye ? (
          <span className="text-[10px] text-white/45">
            {slot.overlay.setsA}:{slot.overlay.setsB}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function GoBracketView({
  brackets,
  level,
  onLevelChange,
  matches,
}: {
  brackets: Record<string, GoBracketSlotView[]>;
  level?: string;
  onLevelChange?: (level: string) => void;
  matches?: GoMatchView[];
}) {
  const viewModel = useMemo(
    () => buildGoBracketViewModel({ brackets, level, matches }),
    [brackets, level, matches],
  );

  const connectorsPerGap = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < viewModel.rounds.length - 1; i += 1) {
      const currentRound = viewModel.rounds[i];
      map.set(currentRound.round, Math.max(1, Math.floor(currentRound.slots.length / 2)));
    }
    return map;
  }, [viewModel.rounds]);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">Сетка</h4>
        <div className="flex flex-wrap gap-2">
          {viewModel.levels.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onLevelChange?.(item)}
              className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase ${
                item === viewModel.activeLevel
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div
        className={[
          'mt-3 rounded-md border px-3 py-2 text-[11px]',
          viewModel.levelColors.header,
        ].join(' ')}
      >
        {viewModel.activeLevel.toUpperCase()}: {viewModel.teamCount} участников | Сетка {viewModel.gridSize} слотов | BYE:{' '}
        {viewModel.byeCount}
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-max items-start gap-0">
          {viewModel.rounds.map((round, index) => (
            <div key={`round-col-${round.round}`} className="flex items-start">
              <div className="w-[196px] shrink-0">
                <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-white/65">
                  {round.label}
                </div>
                <div className="flex flex-col">
                  {round.slots.map((slot, slotIndex) => (
                    <div
                      key={slot.slotId}
                      style={{ marginTop: slotIndex === 0 ? round.firstSlotMargin : round.slotGap }}
                    >
                      <BracketSlot slot={slot} slotBorderClass={viewModel.levelColors.slot} />
                    </div>
                  ))}
                </div>
              </div>

              {index < viewModel.rounds.length - 1 ? (
                <div className="w-8 shrink-0">
                  {Array.from({ length: connectorsPerGap.get(round.round) ?? 1 }).map((_, connectorIndex) => {
                    const prevRound = round.round;
                    const nextRound = viewModel.rounds[index + 1].round;
                    const armHeight = 2 * SLOT_H + slotGapForRound(prevRound);
                    const armGap = slotGapForRound(nextRound);
                    const firstMargin = slotGapForRound(nextRound) / 2;
                    return (
                      <div
                        key={`connector-${round.round}-${connectorIndex}`}
                        style={{ marginTop: connectorIndex === 0 ? firstMargin : armGap, height: armHeight }}
                        className="flex"
                      >
                        <div className="flex w-3 flex-col">
                          <div className="flex-1 rounded-tr-sm border-r border-t border-white/20" />
                          <div className="flex-1 rounded-br-sm border-b border-r border-white/20" />
                        </div>
                        <div className="h-px w-3 self-center bg-white/20" />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
