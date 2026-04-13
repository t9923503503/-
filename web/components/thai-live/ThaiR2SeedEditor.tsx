'use client';

import { useEffect, useState, type DragEvent } from 'react';
import type { ThaiR2SeedDraft, ThaiR2SeedZone } from '@/lib/thai-live/types';

function cloneZones(zones: ThaiR2SeedZone[]): ThaiR2SeedZone[] {
  return zones.map((zone) => ({
    ...zone,
    players: zone.players.map((player) => ({ ...player })),
  }));
}

interface DragState {
  zoneIndex: number;
  playerIndex: number;
  playerId: string;
}

interface DropTarget {
  zoneIndex: number;
  playerIndex: number | null;
  position: 'before' | 'after' | 'end';
}

export function ThaiR2SeedEditor({
  draft,
  loading,
  message,
  onReload,
  onConfirm,
}: {
  draft: ThaiR2SeedDraft | null;
  loading?: boolean;
  message?: string | null;
  onReload: () => void;
  onConfirm: (zones: ThaiR2SeedZone[]) => void;
}) {
  const [zones, setZones] = useState<ThaiR2SeedZone[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    setZones(draft ? cloneZones(draft.zones) : []);
    setDragState(null);
    setDropTarget(null);
  }, [draft]);

  function moveWithinZone(zoneIndex: number, playerIndex: number, direction: -1 | 1) {
    setZones((current) => {
      const next = cloneZones(current);
      const zone = next[zoneIndex];
      if (!zone) return current;
      const swapIndex = playerIndex + direction;
      if (swapIndex < 0 || swapIndex >= zone.players.length) return current;
      [zone.players[playerIndex], zone.players[swapIndex]] = [zone.players[swapIndex], zone.players[playerIndex]];
      return next;
    });
  }

  function moveAcrossZones(zoneIndex: number, playerIndex: number, direction: -1 | 1) {
    setZones((current) => {
      const next = cloneZones(current);
      const fromZone = next[zoneIndex];
      const toZone = next[zoneIndex + direction];
      if (!fromZone || !toZone) return current;
      const [player] = fromZone.players.splice(playerIndex, 1);
      if (!player) return current;
      toZone.players.push(player);
      return next;
    });
  }

  function movePlayerByDrop(source: DragState, target: DropTarget) {
    setZones((current) => {
      const next = cloneZones(current);
      const fromZone = next[source.zoneIndex];
      const toZone = next[target.zoneIndex];
      if (!fromZone || !toZone) return current;

      const [player] = fromZone.players.splice(source.playerIndex, 1);
      if (!player) return current;

      let insertIndex = target.playerIndex == null ? toZone.players.length : target.playerIndex;
      if (target.playerIndex != null && target.position === 'after') {
        insertIndex += 1;
      }
      if (source.zoneIndex === target.zoneIndex && source.playerIndex < insertIndex) {
        insertIndex -= 1;
      }
      insertIndex = Math.max(0, Math.min(insertIndex, toZone.players.length));
      toZone.players.splice(insertIndex, 0, player);
      return next;
    });
    setDragState(null);
    setDropTarget(null);
  }

  function resolveDropPosition(event: DragEvent<HTMLDivElement>): 'before' | 'after' {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  }

  function handlePlayerDragStart(
    event: DragEvent<HTMLDivElement>,
    zoneIndex: number,
    playerIndex: number,
    playerId: string,
  ) {
    if (loading) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', playerId);
    setDragState({ zoneIndex, playerIndex, playerId });
    setDropTarget(null);
  }

  function handlePlayerDragEnd() {
    setDragState(null);
    setDropTarget(null);
  }

  function handlePlayerDragOver(event: DragEvent<HTMLDivElement>, zoneIndex: number, playerIndex: number) {
    if (loading || !dragState) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const position = resolveDropPosition(event);
    setDropTarget((current) => {
      if (
        current &&
        current.zoneIndex === zoneIndex &&
        current.playerIndex === playerIndex &&
        current.position === position
      ) {
        return current;
      }
      return { zoneIndex, playerIndex, position };
    });
  }

  function handlePlayerDrop(event: DragEvent<HTMLDivElement>, zoneIndex: number, playerIndex: number) {
    if (loading || !dragState) return;
    event.preventDefault();
    event.stopPropagation();
    movePlayerByDrop(dragState, {
      zoneIndex,
      playerIndex,
      position: resolveDropPosition(event),
    });
  }

  function handleZoneDragOver(event: DragEvent<HTMLElement>, zoneIndex: number) {
    if (loading || !dragState) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[data-thai-r2-player-card="true"]')) {
      return;
    }
    setDropTarget((current) => {
      if (current && current.zoneIndex === zoneIndex && current.playerIndex == null && current.position === 'end') {
        return current;
      }
      return { zoneIndex, playerIndex: null, position: 'end' };
    });
  }

  function handleZoneDrop(event: DragEvent<HTMLElement>, zoneIndex: number) {
    if (loading || !dragState) return;
    event.preventDefault();
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[data-thai-r2-player-card="true"]')) {
      return;
    }
    movePlayerByDrop(dragState, {
      zoneIndex,
      playerIndex: null,
      position: 'end',
    });
  }

  return (
    <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">R2 Seed Editor</div>
          <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
            Зоны HARD / ADVANCE / MEDIUM / LIGHT
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c7cada]/78">
            Для M/N автопосев строится из общего рейтинга Профи и общего рейтинга Новичков по итогам R1.
            Перед запуском R2 его можно подправить вручную; подтверждение создаёт структуру второго раунда в БД.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#c7cada]">
          {message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Обновляем...' : 'Пересчитать автопосев'}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(zones)}
          disabled={loading || !zones.length}
          className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Подтвердить посев
        </button>
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[#7d8498]">
        Перетаскивайте карточки мышью между любыми зонами. Стрелки справа остаются как запасной режим.
      </p>

      {zones.length ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {zones.map((zone, zoneIndex) => (
            <article
              key={zone.zone}
              onDragOver={(event) => handleZoneDragOver(event, zoneIndex)}
              onDrop={(event) => handleZoneDrop(event, zoneIndex)}
              className={`rounded-[20px] border bg-[#10101a] p-4 transition ${
                dropTarget?.zoneIndex === zoneIndex && dropTarget.playerIndex == null
                  ? 'border-sky-400/70 bg-sky-500/10'
                  : 'border-white/8'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">{zone.label}</div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">
                  {zone.players.length} players
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {zone.players.map((player, playerIndex) => (
                  <div
                    key={`${zone.zone}-${player.playerId}`}
                    data-thai-r2-player-card="true"
                    draggable={!loading}
                    onDragStart={(event) => handlePlayerDragStart(event, zoneIndex, playerIndex, player.playerId)}
                    onDragEnd={handlePlayerDragEnd}
                    onDragOver={(event) => handlePlayerDragOver(event, zoneIndex, playerIndex)}
                    onDrop={(event) => handlePlayerDrop(event, zoneIndex, playerIndex)}
                    className={`flex cursor-grab items-start justify-between gap-3 rounded-2xl border px-3 py-3 transition active:cursor-grabbing ${
                      dragState?.playerId === player.playerId
                        ? 'border-brand/70 bg-brand/10 opacity-55'
                        : 'border-white/8 bg-white/5'
                    } ${
                      dropTarget?.zoneIndex === zoneIndex && dropTarget.playerIndex === playerIndex
                        ? 'border-sky-400/60 bg-sky-500/10'
                        : ''
                    } ${
                      dropTarget?.zoneIndex === zoneIndex &&
                      dropTarget.playerIndex === playerIndex &&
                      dropTarget.position === 'before'
                        ? 'shadow-[inset_0_3px_0_0_rgba(56,189,248,0.95)]'
                        : ''
                    } ${
                      dropTarget?.zoneIndex === zoneIndex &&
                      dropTarget.playerIndex === playerIndex &&
                      dropTarget.position === 'after'
                        ? 'shadow-[inset_0_-3px_0_0_rgba(56,189,248,0.95)]'
                        : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{player.playerName}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                        {player.poolLabel} • {player.sourceCourtLabel} #{player.sourcePlace}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={loading || playerIndex === 0}
                        onClick={() => moveWithinZone(zoneIndex, playerIndex, -1)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={loading || playerIndex === zone.players.length - 1}
                        onClick={() => moveWithinZone(zoneIndex, playerIndex, 1)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={loading || zoneIndex === 0}
                        onClick={() => moveAcrossZones(zoneIndex, playerIndex, -1)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={loading || zoneIndex === zones.length - 1}
                        onClick={() => moveAcrossZones(zoneIndex, playerIndex, 1)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        →
                      </button>
                    </div>
                  </div>
                ))}
                {!zone.players.length ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-6 text-center text-xs uppercase tracking-[0.2em] text-[#7d8498]">
                    Перетащите игрока сюда
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
