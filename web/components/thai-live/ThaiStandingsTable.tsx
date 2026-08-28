'use client';

import { useState } from 'react';
import type { ThaiStandingsGroup, ThaiStandingsRow, ThaiStandingsTourMatchup } from '@/lib/thai-live/types';

type ThaiStandingsViewMode = 'classic' | 'matchups';

function formatStandingDelta(value: number | null | undefined): string {
  if (value == null) return '—';
  return value > 0 ? `+${value}` : String(value);
}

function formatMatchStatusLabel(status: string | undefined): string {
  switch (String(status || '').trim().toLowerCase()) {
    case 'pending':
      return 'Ожидает';
    case 'confirmed':
    case 'finished':
      return 'Подтверждён';
    default:
      return status || '—';
  }
}

function matchupToneClass(matchup: ThaiStandingsTourMatchup | null): string {
  if (!matchup) return 'border-white/8 bg-white/[0.03] text-white/45';
  if (matchup.status !== 'confirmed' || matchup.delta == null) return 'border-amber-400/20 bg-amber-500/10 text-amber-100';
  if (matchup.delta > 0) return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100';
  if (matchup.delta < 0) return 'border-rose-400/20 bg-rose-500/10 text-rose-100';
  return 'border-white/8 bg-white/[0.03] text-white/70';
}

function StandingPlaceBadge({ place }: { place: number }) {
  const tone =
    place === 1
      ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]'
      : place === 2
        ? 'border-white/40 bg-white/15 text-white'
        : place === 3
          ? 'border-orange-300/40 bg-orange-400/15 text-orange-100'
          : 'border-white/12 bg-white/5 text-white/70';
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base font-black tabular-nums ${tone}`}>
      {place}
    </span>
  );
}

function MobileClassicRow({ row, tourCount, showTieBreak }: { row: ThaiStandingsRow; tourCount: number; showTieBreak: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <StandingPlaceBadge place={row.place} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{row.playerName}</div>
          <div className="mt-0.5 text-[11px] text-white/50">
            Δ {formatStandingDelta(row.totalDiff)} · K {row.kef.toFixed(2)} · Поб {row.wins}
            {showTieBreak ? <span className="ml-1 text-[#ffd24a]">· место по K</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-black tabular-nums text-[#ffd24a]">{row.pointsP}</div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">очки</div>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-base text-white/55 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="border-t border-white/8 px-3 py-2.5">
          <div className="grid grid-cols-2 gap-2 text-xs text-white/75">
            {row.tourDiffs.map((diff, index) => (
              <div key={`${row.playerId}-m-${index}`} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
                <span className="text-white/45">Тур {index + 1}</span>
                <span className="font-semibold tabular-nums">{formatStandingDelta(diff)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="text-white/45">Мячи</span>
              <span className="font-semibold tabular-nums">{row.totalScored}</span>
            </div>
            <div className="col-span-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
              туров в раунде: {tourCount}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileMatchupRow({ row, tourCount }: { row: ThaiStandingsRow; tourCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <StandingPlaceBadge place={row.place} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{row.playerName}</div>
          <div className="mt-0.5 text-[11px] text-white/50">Поб {row.wins} · K {row.kef.toFixed(2)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-black tabular-nums text-[#ffd24a]">{row.pointsP}</div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">очки</div>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-base text-white/55 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-white/8 px-3 py-2.5">
          {Array.from({ length: tourCount }, (_, index) => {
            const matchup = row.tourMatchups?.[index] ?? null;
            return (
              <div key={`${row.playerId}-mm-${index}`} className={`rounded-xl border px-3 py-2 ${matchupToneClass(matchup)}`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="uppercase tracking-[0.14em] text-white/55">Тур {index + 1}</span>
                  <span className="text-sm font-black tabular-nums">{formatStandingDelta(matchup?.delta ?? null)}</span>
                </div>
                {matchup ? (
                  <div className="mt-1.5 space-y-0.5 text-[11px] text-white/78">
                    <div>Счёт {matchup.teamScore ?? '—'}:{matchup.opponentScore ?? '—'}</div>
                    <div>С напарником: {matchup.partnerName}</div>
                    <div>Против: {matchup.opponentNames.length ? matchup.opponentNames.join(', ') : '—'}</div>
                  </div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-white/45">Нет данных по туру</div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ThaiStandingsTable({
  groups,
  tourCount,
  className = '',
  groupClassName = 'rounded-[18px] border border-white/8 bg-[#10101a] p-3',
  initialMode = 'classic',
  compact = false,
}: {
  groups: ThaiStandingsGroup[];
  tourCount: number;
  className?: string;
  groupClassName?: string;
  initialMode?: ThaiStandingsViewMode;
  compact?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ThaiStandingsViewMode>(initialMode);
  const headerTextClass = compact ? 'text-[9px]' : 'text-[10px]';
  const cellTextClass = compact ? 'text-[11px]' : 'text-xs';
  const cardPaddingClass = compact ? 'p-2' : 'p-2.5';

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">Таблица результатов</div>
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setViewMode('classic')}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              viewMode === 'classic' ? 'bg-[#ffd24a] text-[#17130b]' : 'text-white/70 hover:text-white'
            }`}
          >
            Классика
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matchups')}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              viewMode === 'matchups' ? 'bg-[#ffd24a] text-[#17130b]' : 'text-white/70 hover:text-white'
            }`}
          >
            Матчи
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.pool} className={groupClassName}>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{group.label}</div>

            <div className="mt-3 space-y-2 md:hidden">
              {group.rows.map((row) =>
                viewMode === 'classic' ? (
                  <MobileClassicRow
                    key={row.playerId}
                    row={row}
                    tourCount={tourCount}
                    showTieBreak={group.rows.some((other) => other.playerId !== row.playerId && other.pointsP === row.pointsP)}
                  />
                ) : (
                  <MobileMatchupRow key={row.playerId} row={row} tourCount={tourCount} />
                ),
              )}
            </div>

            <div className="mt-3 hidden overflow-x-auto md:block">
              {viewMode === 'classic' ? (
                <table className={`min-w-full text-left ${cellTextClass} text-white/82`}>
                  <thead className={`${headerTextClass} uppercase tracking-[0.22em] text-[#7d8498]`}>
                    <tr>
                      <th className="sticky left-0 z-10 bg-[#10101a] pb-2 pr-3">Игрок</th>
                      {Array.from({ length: tourCount }, (_, index) => (
                        <th key={`${group.pool}-tour-${index + 1}`} className="pb-2 px-2 text-center">
                          T{index + 1}
                        </th>
                      ))}
                      <th className="pb-2 px-2 text-center">Δ</th>
                      <th className="pb-2 px-2 text-center">P</th>
                      <th className="pb-2 px-2 text-center">K</th>
                      <th className="pb-2 px-2 text-center">Мячи</th>
                      <th className="pb-2 px-2 text-center">Поб</th>
                      <th className="pb-2 pl-2 text-center">Место</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.playerId} className="border-t border-white/6">
                        <td className="sticky left-0 z-10 bg-[#10101a] py-2 pr-3 font-medium text-white">{row.playerName}</td>
                        {row.tourDiffs.map((diff, index) => (
                          <td key={`${row.playerId}-${index}`} className="py-2 px-2 text-center">
                            {formatStandingDelta(diff)}
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center">{formatStandingDelta(row.totalDiff)}</td>
                        <td className="py-2 px-2 text-center text-base font-black text-[#ffd24a]">{row.pointsP}</td>
                        <td className="py-2 px-2 text-center text-[#9aa1b3]">{row.kef.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center">{row.totalScored}</td>
                        <td className="py-2 px-2 text-center">{row.wins}</td>
                        <td className="py-2 pl-2 text-center font-semibold text-white">{row.place}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className={`min-w-[1120px] text-left ${cellTextClass} text-white/82`}>
                  <thead className={`${headerTextClass} uppercase tracking-[0.22em] text-[#7d8498]`}>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[180px] bg-[#10101a] pb-2 pr-3">Игрок</th>
                      {Array.from({ length: tourCount }, (_, index) => (
                        <th key={`${group.pool}-matchup-${index + 1}`} className="min-w-[180px] pb-2 px-2 text-left">
                          Тур {index + 1}
                        </th>
                      ))}
                      <th className="pb-2 px-2 text-center">P</th>
                      <th className="pb-2 px-2 text-center">K</th>
                      <th className="pb-2 px-2 text-center">Мячи</th>
                      <th className="pb-2 px-2 text-center">Поб</th>
                      <th className="pb-2 pl-2 text-center">Место</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.playerId} className="border-t border-white/6 align-top">
                        <td className="sticky left-0 z-10 min-w-[180px] bg-[#10101a] py-2 pr-3 font-medium text-white">
                          <div>{row.playerName}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">{row.poolLabel}</div>
                        </td>
                        {Array.from({ length: tourCount }, (_, index) => {
                          const matchup = row.tourMatchups?.[index] ?? null;
                          return (
                            <td key={`${row.playerId}-matchup-${index + 1}`} className="px-2 py-2">
                              <div className={`min-h-[88px] min-w-[164px] rounded-[14px] border ${cardPaddingClass} ${matchupToneClass(matchup)}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/55">T{index + 1}</span>
                                  <span className="text-sm font-black">{formatStandingDelta(matchup?.delta ?? null)}</span>
                                </div>
                                {matchup ? (
                                  <>
                                    <div className="mt-2 text-[11px] font-semibold text-white/90">
                                      Счёт {matchup.teamScore ?? '—'}:{matchup.opponentScore ?? '—'}
                                    </div>
                                    <div className="mt-2 text-[11px] text-white/72">С напарником: {matchup.partnerName}</div>
                                    <div className="mt-1 text-[11px] text-white/72">
                                      Против: {matchup.opponentNames.length ? matchup.opponentNames.join(', ') : '—'}
                                    </div>
                                    <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/45">
                                      {formatMatchStatusLabel(matchup.status)}
                                    </div>
                                  </>
                                ) : (
                                  <div className="mt-4 text-[11px] text-white/45">Нет данных по туру</div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-center text-base font-black text-[#ffd24a]">{row.pointsP}</td>
                        <td className="py-2 px-2 text-center text-[#9aa1b3]">{row.kef.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center">{row.totalScored}</td>
                        <td className="py-2 px-2 text-center">{row.wins}</td>
                        <td className="py-2 pl-2 text-center font-semibold text-white">{row.place}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
