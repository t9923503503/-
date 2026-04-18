'use client';

import { useState } from 'react';
import type { TournamentPlayer } from '@/lib/go-next/court-slots';

interface GoFreePlayersListProps {
  players: TournamentPlayer[];
  onDragStart: (player: TournamentPlayer) => void;
  onDragEnd: () => void;
}

const STATUS_ICON: Record<string, string> = {
  live: '🔴',
  assigned: '🟡',
  free: '🟢',
};

function playerStatus(player: TournamentPlayer): 'live' | 'assigned' | 'free' {
  if (player.isLive) return 'live';
  if (player.courtId) return 'assigned';
  return 'free';
}

export function GoFreePlayersList({ players, onDragStart, onDragEnd }: GoFreePlayersListProps) {
  const [query, setQuery] = useState('');

  const filtered = players.filter((p) =>
    p.playerName.toLowerCase().includes(query.toLowerCase()),
  );

  // Sort: free first, then assigned, then live
  const sorted = [...filtered].sort((a, b) => {
    const order = { free: 0, assigned: 1, live: 2 };
    return order[playerStatus(a)] - order[playerStatus(b)];
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#1F2A36] bg-[#121821] p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">Игроки</h4>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по имени..."
        className="rounded-md border border-[#1F2A36] bg-[#0B0F14] px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand/50"
      />

      {/* Player list */}
      <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-xs text-white/30">Нет игроков</p>
        ) : (
          sorted.map((player) => {
            const status = playerStatus(player);
            const isLive = status === 'live';
            const genderColor = player.gender === 'M' ? 'text-sky-400' : 'text-pink-400';

            return (
              <div
                key={player.playerId}
                draggable={!isLive}
                onDragStart={() => {
                  if (!isLive) onDragStart(player);
                }}
                onDragEnd={onDragEnd}
                title={
                  isLive
                    ? 'Игрок сейчас в матче — перемещение недоступно'
                    : status === 'assigned'
                      ? `Назначен на Корт ${player.courtNo ?? '?'}`
                      : 'Свободен — перетащите в слот'
                }
                className={[
                  'flex min-h-[44px] cursor-grab items-center gap-2 rounded-md border border-[#1F2A36] px-3 py-1.5 text-xs',
                  isLive ? 'cursor-not-allowed opacity-50' : 'hover:border-white/20 hover:bg-white/5 active:cursor-grabbing',
                ].join(' ')}
              >
                <span className="text-sm leading-none">{STATUS_ICON[status]}</span>
                <span className={`w-4 shrink-0 font-bold ${genderColor}`}>{player.gender}</span>
                <span className="flex-1 truncate text-white">{player.playerName}</span>
                {status === 'assigned' ? (
                  <span className="text-[10px] text-white/40">→К{player.courtNo}</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
