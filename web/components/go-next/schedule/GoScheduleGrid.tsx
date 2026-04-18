'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GoMatchStatus, GoMatchView } from '@/lib/go-next/types';
import { buildGoScheduleViewModel, groupBadgeClass } from './view-model';

interface CourtInfo {
  courtNo: number;
  label: string;
}

interface GoScheduleGridProps {
  tournamentId: string;
  matches: GoMatchView[];
  courts: CourtInfo[];
  onMatchesChanged?: (matches: GoMatchView[]) => void;
}

interface MatchDraft {
  courtNo: number | null;
  scheduledAt: string;
  status: GoMatchStatus;
  scoreA: string[];
  scoreB: string[];
  setsA: string;
  setsB: string;
  winnerId: string;
  note: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function draftFromMatch(match: GoMatchView): MatchDraft {
  return {
    courtNo: match.courtNo ?? null,
    scheduledAt: toDatetimeLocalValue(match.scheduledAt),
    status: match.status,
    scoreA: [0, 1, 2].map((idx) => String(match.scoreA[idx] ?? '')),
    scoreB: [0, 1, 2].map((idx) => String(match.scoreB[idx] ?? '')),
    setsA: String(match.setsA ?? 0),
    setsB: String(match.setsB ?? 0),
    winnerId: match.winnerId ?? '',
    note: '',
  };
}

function parseScoreArrays(draft: MatchDraft): { scoreA: number[]; scoreB: number[] } {
  const scoreA: number[] = [];
  const scoreB: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const a = String(draft.scoreA[index] ?? '').trim();
    const b = String(draft.scoreB[index] ?? '').trim();
    if (!a && !b) continue;
    if (!a || !b) continue;
    const parsedA = Number(a);
    const parsedB = Number(b);
    if (!Number.isFinite(parsedA) || !Number.isFinite(parsedB)) continue;
    scoreA.push(Math.max(0, Math.trunc(parsedA)));
    scoreB.push(Math.max(0, Math.trunc(parsedB)));
  }
  return { scoreA, scoreB };
}

function statusClass(status: GoMatchStatus): string {
  if (status === 'live') return 'border-emerald-400/60 bg-emerald-500/15';
  if (status === 'finished') return 'border-white/15 bg-white/5 opacity-80';
  if (status === 'cancelled') return 'border-red-400/50 bg-red-500/10 opacity-75';
  return 'border-white/15 bg-black/30';
}

function statusLabel(status: GoMatchStatus): string {
  if (status === 'live') return 'LIVE';
  if (status === 'finished') return 'FINISHED';
  if (status === 'cancelled') return 'CANCELLED';
  return 'PENDING';
}

export function GoScheduleGrid({
  tournamentId,
  matches,
  courts,
  onMatchesChanged,
}: GoScheduleGridProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [localMatches, setLocalMatches] = useState<GoMatchView[]>(matches);
  const [dragMatchId, setDragMatchId] = useState<string>('');
  const [panelMatchId, setPanelMatchId] = useState<string>('');
  const [draft, setDraft] = useState<MatchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [inlineScoreEdit, setInlineScoreEdit] = useState<{ matchId: string; setsA: string; setsB: string } | null>(null);

  useEffect(() => {
    setLocalMatches(matches);
  }, [matches]);

  const viewModel = useMemo(
    () => buildGoScheduleViewModel({ matches: localMatches, courts, activeFilter }),
    [activeFilter, courts, localMatches],
  );

  const panelMatch = useMemo(
    () => localMatches.find((match) => match.matchId === panelMatchId) ?? null,
    [localMatches, panelMatchId],
  );

  function courtLabel(courtNo: number) {
    return courts.find((court) => court.courtNo === courtNo)?.label ?? `Court ${courtNo}`;
  }

  function applyMatches(nextMatches: GoMatchView[]) {
    setLocalMatches(nextMatches);
    onMatchesChanged?.(nextMatches);
  }

  async function patchMatch(
    match: GoMatchView,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    setError('');
    setMessage('');
    const moving =
      Object.prototype.hasOwnProperty.call(payload, 'courtNo') ||
      Object.prototype.hasOwnProperty.call(payload, 'scheduledAt');
    const withConfirmPayload = { ...payload } as Record<string, unknown>;
    if (moving && match.status === 'live') {
      const confirmed = window.confirm('Нельзя переносить LIVE матч без подтверждения. Перенести матч?');
      if (!confirmed) return false;
      withConfirmPayload.allowLiveReschedule = true;
    }
    if (moving && match.status === 'finished') {
      const confirmed = window.confirm('Нельзя переносить завершённый матч без подтверждения. Перенести матч?');
      if (!confirmed) return false;
      withConfirmPayload.allowFinishedReschedule = true;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-matches/${encodeURIComponent(match.matchId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withConfirmPayload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string; matches?: GoMatchView[] };
      if (!response.ok) {
        throw new Error(body.error || 'Не удалось обновить матч');
      }
      if (Array.isArray(body.matches)) applyMatches(body.matches);
      return true;
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : 'Не удалось обновить матч');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openPanel(match: GoMatchView) {
    setPanelMatchId(match.matchId);
    setDraft(draftFromMatch(match));
    setError('');
    setMessage('');
  }

  function closePanel() {
    setPanelMatchId('');
    setDraft(null);
  }

  async function savePanel() {
    if (!panelMatch || !draft) return;
    const parsedSetsA = Number(draft.setsA || 0);
    const parsedSetsB = Number(draft.setsB || 0);
    const { scoreA, scoreB } = parseScoreArrays(draft);
    const ok = await patchMatch(panelMatch, {
      courtNo: draft.courtNo,
      scheduledAt: fromDatetimeLocalValue(draft.scheduledAt),
      status: draft.status,
      scoreA,
      scoreB,
      setsA: Number.isFinite(parsedSetsA) ? Math.max(0, Math.trunc(parsedSetsA)) : 0,
      setsB: Number.isFinite(parsedSetsB) ? Math.max(0, Math.trunc(parsedSetsB)) : 0,
      winnerId: draft.winnerId || null,
      note: draft.note || '',
    });
    if (ok) {
      setMessage('Сохранено');
      closePanel();
    }
  }

  async function quickStatus(match: GoMatchView, status: GoMatchStatus) {
    const payload: Record<string, unknown> = { status };
    if (status === 'finished' && match.winnerId == null && match.teamA && match.teamB) {
      payload.winnerId = match.setsA >= match.setsB ? match.teamA.teamId : match.teamB.teamId;
      payload.setsA = match.setsA;
      payload.setsB = match.setsB;
    }
    const ok = await patchMatch(match, payload);
    if (ok) setMessage(`Матч #${match.matchNo} обновлён`);
  }

  function shiftDraftMinutes(delta: number) {
    if (!draft) return;
    const iso = fromDatetimeLocalValue(draft.scheduledAt);
    const base = iso ? new Date(iso) : new Date();
    base.setMinutes(base.getMinutes() + delta);
    setDraft((prev) => (prev ? { ...prev, scheduledAt: toDatetimeLocalValue(base.toISOString()) } : prev));
  }

  async function handleDrop(targetCourtNo: number, slotIdx: number) {
    const dragging = localMatches.find((match) => match.matchId === dragMatchId);
    if (!dragging) return;
    const targetScheduledAt = viewModel.slotScheduledMap.get(slotIdx) ?? null;
    if (!targetScheduledAt) {
      setError('Для этого слота не найдено время. Используйте ручное редактирование в панели.');
      setDragMatchId('');
      return;
    }
    const ok = await patchMatch(dragging, {
      courtNo: targetCourtNo,
      scheduledAt: targetScheduledAt,
      note: 'drag-drop move',
    });
    if (ok) setMessage(`Матч #${dragging.matchNo} перенесён`);
    setDragMatchId('');
  }

  async function saveInlineScore(match: GoMatchView) {
    if (!inlineScoreEdit || inlineScoreEdit.matchId !== match.matchId) return;
    const setsA = Number(inlineScoreEdit.setsA);
    const setsB = Number(inlineScoreEdit.setsB);
    if (!Number.isFinite(setsA) || !Number.isFinite(setsB) || setsA === setsB) {
      setError('Укажите корректный счёт по сетам (без ничьей)');
      return;
    }
    const winnerId = setsA > setsB ? match.teamA?.teamId ?? null : match.teamB?.teamId ?? null;
    const ok = await patchMatch(match, {
      status: 'finished',
      setsA: Math.max(0, Math.trunc(setsA)),
      setsB: Math.max(0, Math.trunc(setsB)),
      winnerId,
      note: 'inline-score',
    });
    if (ok) {
      setInlineScoreEdit(null);
      setMessage(`Счёт матча #${match.matchNo} сохранён`);
    }
  }

  if (viewModel.filteredMatches.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/50">
        Нет матчей
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={[
            'rounded-md border px-3 py-1 text-xs font-semibold',
            activeFilter === 'all'
              ? 'border-brand/60 bg-brand/20 text-brand'
              : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25',
          ].join(' ')}
        >
          ALL
        </button>
        {viewModel.groupLabels.map((label) => {
          const value = `g:${label}`;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveFilter(value)}
              className={[
                'rounded-md border px-3 py-1 text-xs font-semibold',
                activeFilter === value
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25',
              ].join(' ')}
            >
              G:{label}
            </button>
          );
        })}
        {viewModel.bracketLevels.map((label) => {
          const value = `b:${label}`;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveFilter(value)}
              className={[
                'rounded-md border px-3 py-1 text-xs font-semibold',
                activeFilter === value
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25',
              ].join(' ')}
            >
              B:{label}
            </button>
          );
        })}
      </div>

      {message ? <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      <div className="w-full overflow-x-auto">
        <div
          className="min-w-[780px]"
          style={{ display: 'grid', gridTemplateColumns: `80px repeat(${viewModel.courtNos.length}, 1fr)` }}
        >
          <div className="border-b border-white/10 py-2 text-[10px] text-white/30" />
          {viewModel.courtNos.map((courtNo) => (
            <div key={courtNo} className="border-b border-white/10 py-2 text-center text-xs font-semibold text-white/70">
              {courtLabel(courtNo)}
            </div>
          ))}

          {viewModel.slots.map((slotIdx) => [
            <div
              key={`slot-${slotIdx}`}
              className="flex items-center justify-center border-b border-white/5 py-2 text-[10px] font-mono text-white/50"
            >
              {viewModel.slotTimeMap.get(slotIdx) ?? `#${slotIdx}`}
            </div>,
            ...viewModel.courtNos.map((courtNo) => {
              const cellMatches = viewModel.cellMatchesMap.get(`${slotIdx}:${courtNo}`) ?? [];
              return (
                <div
                  key={`${slotIdx}:${courtNo}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void handleDrop(courtNo, slotIdx)}
                  className="min-h-[90px] border-b border-white/5 p-1"
                >
                  <div className="space-y-1">
                    {cellMatches.map((match) => {
                      const winnerA = match.winnerId && match.teamA?.teamId === match.winnerId;
                      const winnerB = match.winnerId && match.teamB?.teamId === match.winnerId;
                      const inline = inlineScoreEdit?.matchId === match.matchId;
                      return (
                        <article key={match.matchId} className={`rounded-md border p-2 text-[11px] ${statusClass(match.status)}`}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  setDragMatchId(match.matchId);
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', match.matchId);
                                }}
                                onDragEnd={() => setDragMatchId('')}
                                className="cursor-grab rounded border border-white/20 px-1 text-white/70 active:cursor-grabbing"
                                title="Перетащить матч"
                              >
                                ⠿
                              </button>
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/70">
                                {statusLabel(match.status)}
                              </span>
                              {match.groupLabel ? (
                                <span className={`rounded border px-1 py-0.5 text-[9px] font-bold ${groupBadgeClass(match.groupLabel)}`}>
                                  {match.groupLabel}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[10px] text-white/40">{formatTime(match.scheduledAt)}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openPanel(match)}
                            className="block w-full text-left"
                          >
                            <div className={`truncate ${winnerA ? 'font-bold text-white' : 'text-white/90'}`}>
                              {match.teamA?.label ?? 'TBD'}
                            </div>
                            <div className={`truncate ${winnerB ? 'font-bold text-white' : 'text-white/70'}`}>
                              {match.teamB?.label ?? 'TBD'}
                            </div>
                          </button>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            {!inline ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setInlineScoreEdit({
                                    matchId: match.matchId,
                                    setsA: String(match.setsA ?? 0),
                                    setsB: String(match.setsB ?? 0),
                                  })
                                }
                                className="rounded border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-white/85"
                                title="Быстрый ввод счёта"
                              >
                                {match.setsA}:{match.setsB}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  value={inlineScoreEdit.setsA}
                                  onChange={(event) =>
                                    setInlineScoreEdit((prev) => (prev ? { ...prev, setsA: event.target.value } : prev))
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') void saveInlineScore(match);
                                  }}
                                  className="w-10 rounded border border-white/15 bg-black/40 px-1 py-0.5 text-center text-[10px] text-white"
                                />
                                <span className="text-white/40">:</span>
                                <input
                                  value={inlineScoreEdit.setsB}
                                  onChange={(event) =>
                                    setInlineScoreEdit((prev) => (prev ? { ...prev, setsB: event.target.value } : prev))
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') void saveInlineScore(match);
                                  }}
                                  className="w-10 rounded border border-white/15 bg-black/40 px-1 py-0.5 text-center text-[10px] text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveInlineScore(match)}
                                  className="rounded border border-emerald-400/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-100"
                                >
                                  Enter
                                </button>
                              </div>
                            )}

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void quickStatus(match, 'live')}
                                className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] text-white/70 hover:text-white"
                              >
                                LIVE
                              </button>
                              <button
                                type="button"
                                onClick={() => void quickStatus(match, 'finished')}
                                className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] text-white/70 hover:text-white"
                              >
                                FIN
                              </button>
                              <button
                                type="button"
                                onClick={() => void quickStatus(match, 'cancelled')}
                                className="rounded border border-red-400/30 px-1.5 py-0.5 text-[9px] text-red-200"
                              >
                                CAN
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            }),
          ])}
        </div>
      </div>

      {panelMatch && draft ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/45">
          <div className="h-full w-full max-w-[460px] overflow-y-auto border-l border-white/10 bg-[#0f1119] p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Матч #{panelMatch.matchNo}</h3>
                <p className="text-xs text-white/60">{panelMatch.teamA?.label ?? 'TBD'} vs {panelMatch.teamB?.label ?? 'TBD'}</p>
              </div>
              <button type="button" onClick={closePanel} className="rounded border border-white/20 px-2 py-1 text-xs text-white/70">
                Закрыть
              </button>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border border-white/10 bg-black/20 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-white/60">Основное</h4>
                <div className="space-y-2 text-xs">
                  <label className="block">
                    <span className="mb-1 block text-white/60">Статус</span>
                    <select
                      value={draft.status}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, status: event.target.value as GoMatchStatus } : prev))}
                      className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-white"
                    >
                      <option value="pending">pending</option>
                      <option value="live">live</option>
                      <option value="finished">finished</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-white/60">Корт</span>
                    <select
                      value={draft.courtNo == null ? '' : String(draft.courtNo)}
                      onChange={(event) =>
                        setDraft((prev) => (prev ? { ...prev, courtNo: event.target.value ? Number(event.target.value) : null } : prev))
                      }
                      className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-white"
                    >
                      <option value="">Без корта</option>
                      {courts.map((court) => (
                        <option key={court.courtNo} value={court.courtNo}>
                          {court.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-white/60">Время</span>
                    <input
                      type="datetime-local"
                      value={draft.scheduledAt}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, scheduledAt: event.target.value } : prev))}
                      className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-white"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => shiftDraftMinutes(-15)} className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/80">-15</button>
                    <button type="button" onClick={() => shiftDraftMinutes(15)} className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/80">+15</button>
                    <button type="button" onClick={() => shiftDraftMinutes(30)} className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/80">+30</button>
                    <select
                      value=""
                      onChange={(event) => {
                        const iso = event.target.value;
                        if (!iso) return;
                        setDraft((prev) => (prev ? { ...prev, scheduledAt: toDatetimeLocalValue(iso) } : prev));
                      }}
                      className="rounded border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white"
                    >
                      <option value="">Слоты</option>
                      {[...viewModel.slotScheduledMap.entries()].map(([slotIndex, iso]) => (
                        <option key={slotIndex} value={iso ?? ''}>
                          #{slotIndex} · {formatTime(iso)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-black/20 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-white/60">Результат</h4>
                <div className="space-y-2 text-xs">
                  {[0, 1, 2].map((setIdx) => (
                    <div key={`set-${setIdx}`} className="flex items-center gap-2">
                      <span className="w-12 text-white/50">Set {setIdx + 1}</span>
                      <input
                        value={draft.scoreA[setIdx] ?? ''}
                        onChange={(event) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const scoreA = [...prev.scoreA];
                            scoreA[setIdx] = event.target.value;
                            return { ...prev, scoreA };
                          })
                        }
                        className="w-16 rounded border border-white/15 bg-black/40 px-2 py-1 text-center text-white"
                      />
                      <span className="text-white/40">:</span>
                      <input
                        value={draft.scoreB[setIdx] ?? ''}
                        onChange={(event) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const scoreB = [...prev.scoreB];
                            scoreB[setIdx] = event.target.value;
                            return { ...prev, scoreB };
                          })
                        }
                        className="w-16 rounded border border-white/15 bg-black/40 px-2 py-1 text-center text-white"
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      value={draft.setsA}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, setsA: event.target.value } : prev))}
                      className="w-16 rounded border border-white/15 bg-black/40 px-2 py-1 text-center text-white"
                    />
                    <span className="text-white/40">sets</span>
                    <input
                      value={draft.setsB}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, setsB: event.target.value } : prev))}
                      className="w-16 rounded border border-white/15 bg-black/40 px-2 py-1 text-center text-white"
                    />
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-white/60">Победитель</span>
                    <select
                      value={draft.winnerId}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, winnerId: event.target.value } : prev))}
                      className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-white"
                    >
                      <option value="">Не выбран</option>
                      <option value={panelMatch.teamA?.teamId ?? ''}>{panelMatch.teamA?.label ?? 'Team A'}</option>
                      <option value={panelMatch.teamB?.teamId ?? ''}>{panelMatch.teamB?.label ?? 'Team B'}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-black/20 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-white/60">Комментарий</h4>
                <textarea
                  value={draft.note}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, note: event.target.value } : prev))}
                  rows={3}
                  className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
                  placeholder="Примечание оператора"
                />
              </section>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void savePanel()}
                disabled={saving}
                className="rounded border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={closePanel}
                className="rounded border border-white/20 px-3 py-2 text-xs font-semibold text-white/70"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft((prev) => (prev ? { ...prev, courtNo: null, scheduledAt: '' } : prev));
                }}
                className="rounded border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-200"
              >
                Удалить из расписания
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft((prev) => (prev ? { ...prev, status: 'live' } : prev));
                }}
                className="rounded border border-cyan-400/40 px-3 py-2 text-xs font-semibold text-cyan-200"
              >
                Отметить LIVE
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft((prev) => (prev ? { ...prev, status: 'finished' } : prev));
                }}
                className="rounded border border-white/20 px-3 py-2 text-xs font-semibold text-white/80"
              >
                Завершить матч
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
