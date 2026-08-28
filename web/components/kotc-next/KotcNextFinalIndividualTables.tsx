'use client';

import { useMemo, useState } from 'react';
import type { KotcNextFinalIndividualResult, KotcNextZoneKey } from '@/lib/kotc-next/types';
import { zoneLabel } from '@/lib/kotc-next-config';

type GenderFilter = 'M' | 'W';
type StatScope = 'total' | 'r1' | 'r2';
type ZoneFilter = 'all' | KotcNextZoneKey;

const ZONE_ORDER: KotcNextZoneKey[] = ['kin', 'advance', 'medium', 'lite'];

function filterButtonClasses(active: boolean): string {
  return `rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${
    active
      ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]'
      : 'border-white/10 bg-white/5 text-white/74 hover:border-white/20 hover:bg-white/10'
  }`;
}

function genderLabel(gender: GenderFilter): string {
  return gender === 'M' ? 'М' : 'Ж';
}

function scopeLabel(scope: StatScope): string {
  if (scope === 'r1') return 'R1';
  if (scope === 'r2') return 'R2';
  return 'Итого';
}

function rowStats(row: KotcNextFinalIndividualResult, scope: StatScope): {
  kingWins: number;
  longestKingRun: number;
  gamesPlayed: number;
} {
  if (scope === 'r1') {
    return {
      kingWins: row.r1?.kingWins ?? 0,
      longestKingRun: row.r1?.longestKingRun ?? 0,
      gamesPlayed: row.r1?.gamesPlayed ?? 0,
    };
  }
  if (scope === 'r2') {
    return {
      kingWins: row.r2?.kingWins ?? 0,
      longestKingRun: row.r2?.longestKingRun ?? 0,
      gamesPlayed: row.r2?.gamesPlayed ?? 0,
    };
  }
  return {
    kingWins: row.totalKingWins,
    longestKingRun: row.totalLongestKingRun ?? 0,
    gamesPlayed: row.totalGamesPlayed,
  };
}

function rowZone(row: KotcNextFinalIndividualResult, scope: StatScope): KotcNextZoneKey | null {
  if (scope === 'r1') return row.r1?.zone ?? null;
  if (scope === 'r2') return row.r2?.zone ?? null;
  return row.finalZone;
}

function rowZoneLabel(row: KotcNextFinalIndividualResult, scope: StatScope): string {
  if (scope === 'r1') return row.r1?.zoneLabel || row.r1?.courtLabel || 'R1';
  if (scope === 'r2') return row.r2?.zoneLabel || row.r2?.courtLabel || 'R2';
  return row.finalZoneLabel || zoneLabel(row.finalZone);
}

function sortFinalRows(rows: KotcNextFinalIndividualResult[], scope: StatScope): KotcNextFinalIndividualResult[] {
  return [...rows].sort((left, right) => {
    const leftStats = rowStats(left, scope);
    const rightStats = rowStats(right, scope);
    const scoreDiff = rightStats.kingWins - leftStats.kingWins;
    if (scoreDiff) return scoreDiff;
    const runDiff = rightStats.longestKingRun - leftStats.longestKingRun;
    if (runDiff) return runDiff;
    const gamesDiff = rightStats.gamesPlayed - leftStats.gamesPlayed;
    if (gamesDiff) return gamesDiff;
    const zoneDiff = ZONE_ORDER.indexOf(left.finalZone) - ZONE_ORDER.indexOf(right.finalZone);
    if (zoneDiff) return zoneDiff;
    return left.finalPosition - right.finalPosition;
  });
}

function availableZones(rows: KotcNextFinalIndividualResult[], scope: StatScope): KotcNextZoneKey[] {
  const present = new Set(
    rows.map((row) => rowZone(row, scope)).filter((zone): zone is KotcNextZoneKey => zone != null),
  );
  return ZONE_ORDER.filter((zone) => present.has(zone));
}

export function KotcNextFinalIndividualTables({
  rows,
  eyebrow = 'Финал',
  title = 'Итоги игроков',
  hint = 'Индивидуальная таблица: отдельно мужчины и женщины, с фильтром по зоне и статистикой R1/R2/итого.',
}: {
  rows: KotcNextFinalIndividualResult[];
  eyebrow?: string;
  title?: string;
  hint?: string;
}) {
  const [statScope, setStatScope] = useState<StatScope>('total');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('W');
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const zones = useMemo(() => availableZones(rows, statScope), [rows, statScope]);
  const visibleRows = useMemo(
    () =>
      sortFinalRows(
        rows.filter((row) => row.gender === genderFilter && (zoneFilter === 'all' || rowZone(row, statScope) === zoneFilter)),
        statScope,
      ),
    [genderFilter, rows, statScope, zoneFilter],
  );

  if (!rows.length) return null;

  return (
    <section className="rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.26)] sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">{eyebrow}</div>
          <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{hint}</p>
        </div>
        <span className="rounded-full border border-[#5b4713] bg-[#ffd24a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#17130b]">
          {visibleRows.length} / {rows.length}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['total', 'r1', 'r2'] as const).map((scope) => (
          <button
            key={`final-scope-${scope}`}
            type="button"
            onClick={() => {
              setStatScope(scope);
              setZoneFilter('all');
            }}
            className={filterButtonClasses(statScope === scope)}
            aria-pressed={statScope === scope}
          >
            {scopeLabel(scope)}
          </button>
        ))}
        <span className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />
        {(['W', 'M'] as const).map((gender) => (
          <button
            key={`final-gender-${gender}`}
            type="button"
            onClick={() => setGenderFilter(gender)}
            className={filterButtonClasses(genderFilter === gender)}
            aria-pressed={genderFilter === gender}
          >
            {genderLabel(gender)}
          </button>
        ))}
        <span className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />
        <button
          type="button"
          onClick={() => setZoneFilter('all')}
          className={filterButtonClasses(zoneFilter === 'all')}
          aria-pressed={zoneFilter === 'all'}
        >
          Все
        </button>
        {zones.map((zone) => (
          <button
            key={`final-zone-${zone}`}
            type="button"
            onClick={() => setZoneFilter(zone)}
            className={filterButtonClasses(zoneFilter === zone)}
            aria-pressed={zoneFilter === zone}
          >
            {zoneLabel(zone)}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-[18px] border border-white/8 bg-[#0f1018]">
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-left text-sm text-white/86">
            <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.22em] text-[#8f98b3]">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Игрок</th>
                <th className="px-3 py-3 text-center">КР</th>
                <th className="px-3 py-3 text-center">Серия</th>
                <th className="px-4 py-3 text-center">Игры</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const stats = rowStats(row, statScope);
                return (
                  <tr key={`${row.playerId || row.playerName}-${row.finalZone}-${row.finalPosition}`} className="border-t border-white/6">
                    <td className={`px-4 py-4 text-lg font-black ${index === 0 ? 'text-[#ffd24a]' : 'text-white/82'}`}>
                      {index + 1}
                    </td>
                    <td className="px-4 py-4">
                      <div className="min-w-[170px]">
                        <div className="truncate text-base font-black text-white">{row.playerName}</div>
                        <div className="mt-1 truncate text-[11px] uppercase tracking-[0.18em] text-white/42">
                          {rowZoneLabel(row, statScope)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center text-2xl font-black text-white">{stats.kingWins}</td>
                    <td className="px-3 py-4 text-center text-2xl font-black text-white">{stats.longestKingRun}</td>
                    <td className="px-4 py-4 text-center text-2xl font-black text-white">{stats.gamesPlayed}</td>
                  </tr>
                );
              })}
              {!visibleRows.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-white/48">
                    Нет игроков в выбранном фильтре.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
