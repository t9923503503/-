'use client';

import { useEffect, useRef, useState } from 'react';
import type { CourtWithSlots } from '@/lib/go-next/court-slots';
import { GoSlotItem } from './GoSlotItem';

interface GoCourtSlotCardProps {
  court: CourtWithSlots;
  tournamentId: string;
  onSlotUpdate: () => void;
  draggedPlayerId: string | null;
  draggedPlayerName: string | null;
  draggedPlayerGender: 'M' | 'W' | null;
}

type ReadyStatus = 'ready' | 'collision' | 'neutral';

function getMatchPlayerIds(court: CourtWithSlots): Set<string> {
  const ids = new Set<string>();
  if (!court.nextMatch) return ids;
  const m = court.nextMatch;
  if (m.teamAPlayer1Id) ids.add(m.teamAPlayer1Id);
  if (m.teamAPlayer2Id) ids.add(m.teamAPlayer2Id);
  if (m.teamBPlayer1Id) ids.add(m.teamBPlayer1Id);
  if (m.teamBPlayer2Id) ids.add(m.teamBPlayer2Id);
  return ids;
}

export function GoCourtSlotCard({
  court,
  tournamentId,
  onSlotUpdate,
  draggedPlayerId,
  draggedPlayerName,
  draggedPlayerGender,
}: GoCourtSlotCardProps) {
  const [clearing, setClearing] = useState(false);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<{ historyId: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const matchPlayerIds = getMatchPlayerIds(court);
  const slottedPlayerIds = new Set(court.slots.map((s) => s.playerId).filter(Boolean) as string[]);

  // Match-ready checker
  const readyStatus: ReadyStatus = (() => {
    if (!court.nextMatch || matchPlayerIds.size === 0) return 'neutral';
    // All match players present in slots of this court?
    const allPresent = [...matchPlayerIds].every((pid) => slottedPlayerIds.has(pid));
    if (allPresent) return 'ready';
    const somePresent = [...matchPlayerIds].some((pid) => slottedPlayerIds.has(pid));
    if (somePresent) return 'collision';
    return 'neutral';
  })();

  async function handleRemovePlayer(slotId: string) {
    await fetch(
      `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-court-slots/${encodeURIComponent(slotId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: null, playerName: null }),
      },
    );
    onSlotUpdate();
  }

  async function handleDropOnSlot(slotId: string, gender: 'M' | 'W') {
    if (!draggedPlayerId || !draggedPlayerName) return;
    if (draggedPlayerGender && draggedPlayerGender !== gender) return;
    await fetch(
      `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-court-slots/${encodeURIComponent(slotId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: draggedPlayerId, playerName: draggedPlayerName }),
      },
    );
    setDragOverSlotId(null);
    onSlotUpdate();
  }

  async function handleClear() {
    if (!confirm(`Очистить все слоты корта «${court.label}»?`)) return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-court-slots/clear/${encodeURIComponent(court.courtId)}`,
        { method: 'POST' },
      );
      const data = (await res.json()) as { historyId?: string };
      if (data.historyId) {
        setUndoState({ historyId: data.historyId });
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoState(null), 5000);
      }
      onSlotUpdate();
    } finally {
      setClearing(false);
    }
  }

  async function handleUndo() {
    if (!undoState) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState(null);
    await fetch(
      `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-court-slots/restore/${encodeURIComponent(undoState.historyId)}`,
      { method: 'POST' },
    );
    onSlotUpdate();
  }

  const headerColor =
    readyStatus === 'ready'
      ? 'text-emerald-400 border-emerald-500/40'
      : readyStatus === 'collision'
        ? 'text-red-400 border-red-500/40 animate-pulse'
        : 'text-white border-[#1F2A36]';

  const occupiedCount = court.slots.filter((s) => s.playerId).length;
  const mSlots = court.slots.filter((s) => s.gender === 'M');
  const wSlots = court.slots.filter((s) => s.gender === 'W');
  const mOccupied = mSlots.filter((s) => s.playerId).length;
  const wOccupied = wSlots.filter((s) => s.playerId).length;

  return (
    <div className="rounded-xl border border-[#1F2A36] bg-[#121821] p-3">
      {/* Header */}
      <div className={`mb-2 flex items-center justify-between border-b pb-2 ${headerColor}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">
            {readyStatus === 'ready' ? '✅ ' : ''}
            {court.label}
          </span>
          <span className="text-xs text-white/40">
            {occupiedCount}/8 · {mOccupied}M / {wOccupied}Ж
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleClear()}
          disabled={clearing || occupiedCount === 0}
          className="min-h-[44px] min-w-[44px] rounded px-2 py-1 text-xs font-semibold text-[#FF3B3B] transition-colors hover:bg-[#FF3B3B]/10 disabled:opacity-30"
        >
          {clearing ? '...' : 'Очистить'}
        </button>
      </div>

      {/* Undo snackbar */}
      {undoState ? (
        <div className="mb-2 flex items-center justify-between rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <span>Корт очищен</span>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="ml-3 font-semibold underline hover:text-amber-100"
          >
            Отменить
          </button>
        </div>
      ) : null}

      {/* Slots */}
      <div className="space-y-1">
        {court.slots.map((slot) => {
          const isMatchPlayer = slot.playerId ? matchPlayerIds.has(slot.playerId) : false;
          const isExtra = slot.playerId ? !matchPlayerIds.has(slot.playerId) && matchPlayerIds.size > 0 : false;
          const canDrop = draggedPlayerId && !slot.playerId && (!draggedPlayerGender || draggedPlayerGender === slot.gender);

          return (
            <GoSlotItem
              key={slot.slotId}
              slot={slot}
              isHighlighted={isMatchPlayer}
              isExtra={isExtra}
              isDragOver={dragOverSlotId === slot.slotId && !!canDrop}
              onRemove={slot.playerId ? () => void handleRemovePlayer(slot.slotId) : undefined}
              onDragOver={() => setDragOverSlotId(slot.slotId)}
              onDrop={() => void handleDropOnSlot(slot.slotId, slot.gender)}
            />
          );
        })}
      </div>
    </div>
  );
}
