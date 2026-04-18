'use client';

import type { CourtSlotRow } from '@/lib/go-next/court-slots';

interface GoSlotItemProps {
  slot: CourtSlotRow;
  isHighlighted?: boolean;  // match participant in correct position
  isExtra?: boolean;        // in slot but not part of current match
  isDragOver?: boolean;
  onRemove?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function GoSlotItem({
  slot,
  isHighlighted,
  isExtra,
  isDragOver,
  onRemove,
  onDragOver,
  onDrop,
}: GoSlotItemProps) {
  const isEmpty = !slot.playerId;
  const genderLabel = slot.gender === 'M' ? 'M' : 'Ж';
  const genderColor = slot.gender === 'M' ? 'text-sky-400' : 'text-pink-400';

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={onDrop}
      className={[
        'flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
        isDragOver ? 'border-brand/60 bg-brand/10' : 'border-[#1F2A36]',
        isEmpty ? 'bg-[#0B0F14]' : 'bg-[#121821]',
      ].join(' ')}
    >
      {/* Slot number */}
      <span className="w-10 shrink-0 font-mono text-[10px] text-white/30">
        СЛОТ {slot.slotOrder}
      </span>

      {/* Gender badge */}
      <span className={`w-4 shrink-0 text-center font-bold ${genderColor}`}>{genderLabel}</span>

      {/* Player name or empty label */}
      <span className={[
        'flex-1 truncate font-medium',
        isEmpty ? 'text-white/25 italic' : isExtra ? 'text-white/60' : 'text-white',
        isHighlighted ? 'text-emerald-300' : '',
      ].join(' ')}>
        {isEmpty ? `Пусто — ожидается ${genderLabel}` : slot.playerName ?? '—'}
      </span>

      {/* Remove button */}
      {!isEmpty && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить из слота"
          className="ml-auto flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded text-[#FF3B3B] transition-colors hover:bg-[#FF3B3B]/10 active:bg-[#FF3B3B]/20"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
