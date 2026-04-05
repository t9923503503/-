'use client';

import { useEffect, useState } from 'react';
import type { ThaiR2SeedDraft, ThaiR2SeedZone } from '@/lib/thai-live/types';

function cloneZones(zones: ThaiR2SeedZone[]): ThaiR2SeedZone[] {
  return zones.map((zone) => ({
    ...zone,
    players: zone.players.map((player) => ({ ...player })),
  }));
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

  useEffect(() => {
    setZones(draft ? cloneZones(draft.zones) : []);
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

      {zones.length ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {zones.map((zone, zoneIndex) => (
            <article key={zone.zone} className="rounded-[20px] border border-white/8 bg-[#10101a] p-4">
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
                    className="flex items-start justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3"
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
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
