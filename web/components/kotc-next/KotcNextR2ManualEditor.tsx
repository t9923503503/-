'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type {
  KotcNextR2ManualPlayerRef,
  KotcNextR2ManualZone,
  KotcNextZoneKey,
} from '@/lib/kotc-next/types';
import { zoneLabel } from '@/lib/kotc-next-config';

function cloneZones(zones: KotcNextR2ManualZone[]): KotcNextR2ManualZone[] {
  return zones.map((zone) => ({
    ...zone,
    players: zone.players.map((player) => ({ ...player })),
  }));
}

function buildPreviewPairs(zone: KotcNextR2ManualZone) {
  const men = zone.players.filter((player) => player.gender === 'M');
  const women = zone.players.filter((player) => player.gender === 'W');
  const sequential = Array.from({ length: Math.floor(zone.players.length / 2) }, (_, index) => ({
    label: `${zone.players[index * 2]?.playerName || '-'} / ${zone.players[index * 2 + 1]?.playerName || '-'}`,
  }));

  if (men.length && women.length) {
    return Array.from({ length: Math.max(men.length, women.length) }, (_, index) => ({
      label: `${men[index]?.playerName || 'M'} / ${women[index]?.playerName || 'W'}`,
    }));
  }

  return sequential;
}

function playerKey(player: KotcNextR2ManualPlayerRef): string {
  return [
    String(player.playerId || '').trim(),
    String(player.playerName || '').trim().toLowerCase(),
    player.sourceCourtNo,
    player.sourcePairIdx,
  ].join(':');
}

interface DragState {
  zoneIndex: number;
  playerIndex: number;
  playerId: string;
}

interface DropTarget {
  zoneIndex: number;
  playerIndex: number | null;
  position: 'swap' | 'end';
}

const R2_RECOVERY_LABEL = '\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 R2';
const MANUAL_R2_TITLE = '\u0420\u0443\u0447\u043d\u043e\u0439 \u0441\u043e\u0441\u0442\u0430\u0432 R2';
const MANUAL_R2_TEXT =
  '\u0420\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u0435 \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u043f\u043e \u0437\u043e\u043d\u0430\u043c. ' +
  '\u041f\u0430\u0440\u044b \u0432\u043d\u0443\u0442\u0440\u0438 \u043a\u0430\u0436\u0434\u043e\u0439 \u0437\u043e\u043d\u044b \u0441\u043e\u0431\u0435\u0440\u0443\u0442\u0441\u044f ' +
  '\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438. \u0415\u0441\u043b\u0438 R2 \u0443\u0436\u0435 \u0431\u044b\u043b ' +
  '\u0441\u043e\u0437\u0434\u0430\u043d \u0438\u043b\u0438 \u0437\u0430\u043f\u0443\u0449\u0435\u043d, \u043e\u043d \u0431\u0443\u0434\u0435\u0442 ' +
  '\u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0441\u0431\u0440\u043e\u0448\u0435\u043d \u0438 \u043f\u0435\u0440\u0435\u0441\u043e\u0431\u0440\u0430\u043d.';
const RELOAD_LABEL = '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c';
const RELOADING_LABEL = '\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c...';
const RESET_R2_LABEL = '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c R2';
const RESET_R2_CONFIRM =
  '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0432\u0435\u0441\u044c R2? \u0411\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043b\u0435\u043d\u044b ' +
  '\u0432\u0441\u0435 \u043a\u043e\u0440\u0442\u044b, \u0440\u0430\u0443\u043d\u0434\u044b \u0438 \u043e\u0447\u043a\u0438 R2.';
const REBUILD_R2_LABEL = '\u041f\u0435\u0440\u0435\u0441\u043e\u0431\u0440\u0430\u0442\u044c R2 \u0432\u0440\u0443\u0447\u043d\u0443\u044e';
const REBUILD_R2_CONFIRM =
  '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0440\u0443\u0447\u043d\u0443\u044e \u043f\u0435\u0440\u0435\u0441\u0431\u043e\u0440\u043a\u0443 R2? ' +
  '\u0415\u0441\u043b\u0438 R2 \u0443\u0436\u0435 \u0441\u0442\u0430\u0440\u0442\u043e\u0432\u0430\u043b, \u043e\u043d \u0431\u0443\u0434\u0435\u0442 ' +
  '\u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0441\u0431\u0440\u043e\u0448\u0435\u043d \u0438 \u043f\u0435\u0440\u0435\u0441\u043e\u0431\u0440\u0430\u043d.';
const PREVIEW_PAIRS_LABEL = '\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043f\u0430\u0440';
const R1_COURT_LABEL = '\u043a\u043e\u0440\u0442 R1';
const PAIR_LABEL = '\u043f\u0430\u0440\u0430';
const POSITION_LABEL = '\u043c\u0435\u0441\u0442\u043e';
const DRAG_HINT =
  '\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443 \u043d\u0430 ' +
  '\u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u043e\u0433\u043e \u0438\u0433\u0440\u043e\u043a\u0430, \u0447\u0442\u043e\u0431\u044b ' +
  '\u043e\u0431\u043c\u0435\u043d\u044f\u0442\u044c \u0438\u0445 \u043c\u0435\u0441\u0442\u0430\u043c\u0438. ' +
  '\u0411\u0440\u043e\u0441\u043e\u043a \u0432 \u043f\u0443\u0441\u0442\u043e\u0435 \u043c\u0435\u0441\u0442\u043e \u0437\u043e\u043d\u044b ' +
  '\u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0451\u0442 \u0438\u0433\u0440\u043e\u043a\u0430 \u0432 \u043a\u043e\u043d\u0435\u0446 \u044d\u0442\u043e\u0439 \u0437\u043e\u043d\u044b.';
const EMPTY_ZONE_LABEL = '\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0438\u0433\u0440\u043e\u043a\u0430 \u0441\u044e\u0434\u0430';

export function KotcNextR2ManualEditor({
  draft,
  loading,
  canResetR2,
  onReload,
  onConfirm,
  onResetR2,
}: {
  draft: KotcNextR2ManualZone[] | null;
  loading: boolean;
  canResetR2: boolean;
  onReload: () => void;
  onConfirm: (zones: KotcNextR2ManualZone[]) => void;
  onResetR2: () => void;
}) {
  const [zones, setZones] = useState<KotcNextR2ManualZone[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    if (draftDirty) return;
    setZones(draft ? cloneZones(draft) : []);
    setDragState(null);
    setDropTarget(null);
  }, [draft, draftDirty]);

  const availableZones = useMemo(() => zones.map((zone) => zone.zone), [zones]);
  const conflicts = useMemo(() => {
    const duplicateKeys = new Set<string>();
    const seen = new Set<string>();
    for (const zone of zones) for (const player of zone.players) {
      const key = playerKey(player);
      if (seen.has(key)) duplicateKeys.add(key);
      seen.add(key);
    }
    return [
      ...zones.filter((zone) => zone.players.length % 2 !== 0).map((zone) => `${zoneLabel(zone.zone)}: нечётное число игроков`),
      ...[...duplicateKeys].map((key) => `Игрок дублируется: ${key}`),
    ];
  }, [zones]);

  function movePlayerToZone(playerId: string, nextZone: KotcNextZoneKey) {
    setDraftDirty(true);
    setZones((current) => {
      const next = cloneZones(current);
      let moved: KotcNextR2ManualPlayerRef | null = null;
      let sourceZoneIndex = -1;
      let sourcePlayerIndex = -1;

      for (let zoneIndex = 0; zoneIndex < next.length; zoneIndex += 1) {
        const playerIndex = next[zoneIndex].players.findIndex((player) => playerKey(player) === playerId);
        if (playerIndex >= 0) {
          [moved] = next[zoneIndex].players.splice(playerIndex, 1);
          sourceZoneIndex = zoneIndex;
          sourcePlayerIndex = playerIndex;
          break;
        }
      }

      if (!moved) return current;

      const targetZoneIndex = next.findIndex((zone) => zone.zone === nextZone);
      if (targetZoneIndex < 0) {
        if (sourceZoneIndex >= 0) {
          next[sourceZoneIndex].players.splice(sourcePlayerIndex, 0, moved);
        }
        return current;
      }

      next[targetZoneIndex].players.push(moved);
      return next;
    });
  }

  function movePlayerByDrop(source: DragState, target: DropTarget) {
    setDraftDirty(true);
    setZones((current) => {
      const next = cloneZones(current);
      const fromZone = next[source.zoneIndex];
      const toZone = next[target.zoneIndex];
      if (!fromZone || !toZone) return current;

      if (target.playerIndex != null && target.position === 'swap') {
        const sourcePlayer = fromZone.players[source.playerIndex];
        const targetPlayer = toZone.players[target.playerIndex];
        if (!sourcePlayer || !targetPlayer) return current;
        if (source.zoneIndex === target.zoneIndex && source.playerIndex === target.playerIndex) {
          return current;
        }
        fromZone.players[source.playerIndex] = targetPlayer;
        toZone.players[target.playerIndex] = sourcePlayer;
        return next;
      }

      const [player] = fromZone.players.splice(source.playerIndex, 1);
      if (!player) return current;

      let insertIndex = target.playerIndex == null ? toZone.players.length : target.playerIndex;
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
    setDropTarget((current) => {
      if (current && current.zoneIndex === zoneIndex && current.playerIndex === playerIndex && current.position === 'swap') {
        return current;
      }
      return { zoneIndex, playerIndex, position: 'swap' };
    });
  }

  function handlePlayerDrop(event: DragEvent<HTMLDivElement>, zoneIndex: number, playerIndex: number) {
    if (loading || !dragState) return;
    event.preventDefault();
    event.stopPropagation();
    movePlayerByDrop(dragState, {
      zoneIndex,
      playerIndex,
      position: 'swap',
    });
  }

  function handleZoneDragOver(event: DragEvent<HTMLElement>, zoneIndex: number) {
    if (loading || !dragState) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[data-kotcn-r2-player-card="true"]')) {
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
    if (target instanceof HTMLElement && target.closest('[data-kotcn-r2-player-card="true"]')) {
      return;
    }
    movePlayerByDrop(dragState, {
      zoneIndex,
      playerIndex: null,
      position: 'end',
    });
  }

  return (
    <section className="rounded-[24px] border border-[#2d3144] bg-[rgba(11,14,24,0.88)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#7d8498]">{R2_RECOVERY_LABEL}</div>
          <h3 className="mt-2 text-xl font-semibold text-white">{MANUAL_R2_TITLE}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aeb6c8]">{MANUAL_R2_TEXT}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (draftDirty && !window.confirm('Отменить локальные изменения и загрузить новую версию R2?')) return;
              setDraftDirty(false);
              onReload();
            }}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? RELOADING_LABEL : RELOAD_LABEL}
          </button>
          {canResetR2 ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(RESET_R2_CONFIRM)) {
                  onResetR2();
                }
              }}
              disabled={loading}
              className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {RESET_R2_LABEL}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(REBUILD_R2_CONFIRM)) {
                setDraftDirty(false);
                onConfirm(cloneZones(zones));
              }
            }}
            disabled={!draft || loading || zones.length === 0}
            className="rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {REBUILD_R2_LABEL}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[#7d8498]">{DRAG_HINT}</p>
      <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${conflicts.length ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{conflicts.length ? `Конфликты R2: ${conflicts.length}` : 'Конфликтов R2 нет'}</span>
          {conflicts.length ? <button type="button" onClick={() => setShowConflicts((value) => !value)} className="rounded-full border border-amber-200/25 px-3 py-1 text-xs font-semibold">{showConflicts ? 'Скрыть' : 'Показать конфликт'}</button> : null}
        </div>
        {showConflicts && conflicts.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul> : null}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {zones.map((zone, zoneIndex) => (
          <article
            key={zone.zone}
            onDragOver={(event) => handleZoneDragOver(event, zoneIndex)}
            onDrop={(event) => handleZoneDrop(event, zoneIndex)}
            className={`rounded-[18px] border bg-[#11111d] p-4 transition ${
              dropTarget?.zoneIndex === zoneIndex && dropTarget.playerIndex == null
                ? 'border-sky-400/70 bg-sky-500/10'
                : 'border-white/8'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#8f7c4a]">{zoneLabel(zone.zone)}</div>
            <div className="mt-3 space-y-2">
              {zone.players.map((player, playerIndex) => {
                const currentPlayerId = playerKey(player);
                return (
                  <div
                    key={`${zone.zone}-${currentPlayerId}`}
                    data-kotcn-r2-player-card="true"
                    draggable={!loading}
                    onDragStart={(event) => handlePlayerDragStart(event, zoneIndex, playerIndex, currentPlayerId)}
                    onDragEnd={handlePlayerDragEnd}
                    onDragOver={(event) => handlePlayerDragOver(event, zoneIndex, playerIndex)}
                    onDrop={(event) => handlePlayerDrop(event, zoneIndex, playerIndex)}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3 transition ${
                      dragState?.playerId === currentPlayerId
                        ? 'cursor-grabbing border-[#ffd24a]/60 bg-[#ffd24a]/10 opacity-55'
                        : 'cursor-grab border-white/8 bg-white/5 active:cursor-grabbing'
                    } ${
                      dropTarget?.zoneIndex === zoneIndex && dropTarget.playerIndex === playerIndex
                        ? 'border-sky-400/60 bg-sky-500/10'
                        : ''
                    } ${
                      dropTarget?.zoneIndex === zoneIndex &&
                      dropTarget.playerIndex === playerIndex &&
                      dropTarget.position === 'swap'
                        ? 'shadow-[0_0_0_1px_rgba(56,189,248,0.95),0_0_24px_rgba(56,189,248,0.22)]'
                        : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{player.playerName}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#9aa1b3]">
                        {player.gender || '-'} · {R1_COURT_LABEL} {player.sourceCourtNo} · {PAIR_LABEL}{' '}
                        {player.sourcePairIdx + 1} · {POSITION_LABEL} {player.position}
                      </div>
                    </div>
                    <select
                      value={zone.zone}
                      onChange={(event) => movePlayerToZone(currentPlayerId, event.target.value as KotcNextZoneKey)}
                      className="rounded-xl border border-white/10 bg-[#0e111b] px-3 py-2 text-sm text-white outline-none transition focus:border-[#ffd24a]"
                    >
                      {availableZones.map((value) => (
                        <option key={`${currentPlayerId}-${value}`} value={value}>
                          {zoneLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              {!zone.players.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-6 text-center text-xs uppercase tracking-[0.2em] text-[#7d8498]">
                  {EMPTY_ZONE_LABEL}
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-[#5b4713] bg-[#18140d] p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">{PREVIEW_PAIRS_LABEL}</div>
              <div className="mt-2 space-y-2">
                {buildPreviewPairs(zone).map((pair, index) => (
                  <div
                    key={`${zone.zone}-preview-${index}`}
                    className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white/88"
                  >
                    {pair.label}
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
