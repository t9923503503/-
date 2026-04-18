'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourtWithSlots, TournamentPlayer } from '@/lib/go-next/court-slots';
import { GoCourtSlotCard } from './GoCourtSlotCard';
import { GoFreePlayersList } from './GoFreePlayersList';

interface GoCourtSlotsGridProps {
  tournamentId: string;
  genderFormat?: string;
}

interface SlotsPayload {
  courts: CourtWithSlots[];
  players: TournamentPlayer[];
}

export function GoCourtSlotsGrid({ tournamentId }: GoCourtSlotsGridProps) {
  const [data, setData] = useState<SlotsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggedPlayer, setDraggedPlayer] = useState<TournamentPlayer | null>(null);

  // Anti-stale: ignore polling results too soon after a mutation
  const lastActionAt = useRef<number>(0);

  const loadSlots = useCallback(async (fromMutation = false) => {
    if (fromMutation) lastActionAt.current = Date.now();
    try {
      const res = await fetch(
        `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-court-slots`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setError('Ошибка загрузки слотов');
        return;
      }
      const payload = (await res.json()) as SlotsPayload;
      setData(payload);
      setError('');
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Skip if a mutation happened less than 2.5 seconds ago
      if (Date.now() - lastActionAt.current < 2500) return;
      void loadSlots();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadSlots]);

  function handleSlotUpdate() {
    void loadSlots(true);
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-white/40">Загрузка слотов...</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!data || data.courts.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/50">
        Слоты будут доступны после инициализации групп.
      </div>
    );
  }

  return (
    <div className="flex gap-4 xl:flex-row flex-col">
      {/* Courts grid */}
      <div className="flex-1">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
          Управление кортами
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.courts.map((court) => (
            <GoCourtSlotCard
              key={court.courtId}
              court={court}
              tournamentId={tournamentId}
              onSlotUpdate={handleSlotUpdate}
              draggedPlayerId={draggedPlayer?.playerId ?? null}
              draggedPlayerName={draggedPlayer?.playerName ?? null}
              draggedPlayerGender={draggedPlayer?.gender ?? null}
            />
          ))}
        </div>
      </div>

      {/* Free players panel */}
      <div className="w-full xl:w-64 shrink-0">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
          Свободные игроки
        </h3>
        <GoFreePlayersList
          players={data.players}
          onDragStart={(player) => setDraggedPlayer(player)}
          onDragEnd={() => setDraggedPlayer(null)}
        />
      </div>
    </div>
  );
}
