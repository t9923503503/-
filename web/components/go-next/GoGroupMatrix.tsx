'use client';

import { useMemo, useState } from 'react';
import type { GoGroupView, GoMatchView } from '@/lib/go-next/types';

type MatrixMode = 'operator' | 'spectator';

interface ScoreDraft {
  matchId: string;
  displayLabel: string;
  scoreA: string;
  scoreB: string;
}

interface ParsedScore {
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
}

interface GoGroupMatrixProps {
  groups: GoGroupView[];
  matches: GoMatchView[];
  mode?: MatrixMode;
  qualifyCount?: number;
  onSaveScore?: (match: GoMatchView, score: ParsedScore) => Promise<void>;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function teamColumnLabel(teamIdx: number, fallback: number): string {
  return `C${teamIdx || fallback}`;
}

function splitTeamPlayers(label: string): [string, string] {
  const parts = String(label || '').split('/').map((part) => part.trim()).filter(Boolean);
  return [parts[0] || label || 'TBD', parts[1] || ''];
}

function formatPointsDiff(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatCellScore(match: GoMatchView, rowTeamId: string): string {
  if (match.walkover === 'mutual') return 'тех';
  if (match.walkover === 'team_a' || match.walkover === 'team_b') {
    const rowIsA = match.teamA?.teamId === rowTeamId;
    const losesByWalkover = (rowIsA && match.walkover === 'team_a') || (!rowIsA && match.walkover === 'team_b');
    return losesByWalkover ? '0:3 тех' : '3:0 тех';
  }

  const rowIsA = match.teamA?.teamId === rowTeamId;
  const left = rowIsA ? match.scoreA : match.scoreB;
  const right = rowIsA ? match.scoreB : match.scoreA;
  if (left.length && right.length) {
    return left.map((score, index) => `${score}:${right[index] ?? 0}`).join(' ');
  }
  const setsLeft = rowIsA ? match.setsA : match.setsB;
  const setsRight = rowIsA ? match.setsB : match.setsA;
  return `${setsLeft}:${setsRight}`;
}

function cellScoreTone(match: GoMatchView, rowTeamId: string): string {
  if (match.status !== 'finished') return 'text-white/55';
  if (!match.winnerId) return 'text-white/70';
  return match.winnerId === rowTeamId ? 'text-emerald-300' : 'text-rose-300';
}

function matchKey(leftTeamId: string, rightTeamId: string): string {
  return [leftTeamId, rightTeamId].sort().join('::');
}

function normalizeScoreInput(value: string): string {
  const digitsOnly = String(value || '').replace(/\D/g, '').slice(0, 2);
  if (!digitsOnly) return '';
  return String(Math.min(99, Math.max(0, Number(digitsOnly))));
}

function parseSingleSetScore(scoreAInput: string, scoreBInput: string): ParsedScore | null {
  if (scoreAInput === '' || scoreBInput === '') return null;
  const left = Number(scoreAInput);
  const right = Number(scoreBInput);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const scoreA = Math.max(0, Math.trunc(left));
  const scoreB = Math.max(0, Math.trunc(right));
  if (scoreA === scoreB) return null;
  return {
    scoreA: [scoreA],
    scoreB: [scoreB],
    setsA: scoreA > scoreB ? 1 : 0,
    setsB: scoreB > scoreA ? 1 : 0,
  };
}

function buildMatchLookup(matches: GoMatchView[]): Map<string, GoMatchView> {
  const lookup = new Map<string, GoMatchView>();
  for (const match of matches) {
    const leftId = match.teamA?.teamId;
    const rightId = match.teamB?.teamId;
    if (!leftId || !rightId) continue;
    lookup.set(matchKey(leftId, rightId), match);
  }
  return lookup;
}

function activeSlotForGroup(matches: GoMatchView[], groupLabel: string): number | null {
  const groupMatches = matches.filter((match) => match.groupLabel === groupLabel);
  const live = groupMatches
    .filter((match) => match.status === 'live' && match.slotIndex != null)
    .map((match) => match.slotIndex as number)
    .sort((left, right) => left - right)[0];
  if (live != null) return live;
  const pending = groupMatches
    .filter((match) => match.status === 'pending' && match.slotIndex != null)
    .map((match) => match.slotIndex as number)
    .sort((left, right) => left - right)[0];
  return pending ?? null;
}

function groupProgress(matches: GoMatchView[], groupLabel: string): { played: number; total: number } {
  const groupMatches = matches.filter((match) => match.groupLabel === groupLabel);
  return {
    played: groupMatches.filter((match) => match.status === 'finished').length,
    total: groupMatches.length,
  };
}

function groupMatchesBySlot(matches: GoMatchView[], groupLabel: string): Array<{ slotIndex: number; matches: GoMatchView[] }> {
  const bySlot = new Map<number, GoMatchView[]>();
  for (const match of matches.filter((item) => item.groupLabel === groupLabel && item.slotIndex != null)) {
    const slotIndex = match.slotIndex as number;
    const current = bySlot.get(slotIndex) ?? [];
    current.push(match);
    bySlot.set(slotIndex, current);
  }
  return [...bySlot.entries()]
    .sort(([left], [right]) => left - right)
    .map(([slotIndex, slotMatches]) => ({
      slotIndex,
      matches: slotMatches.sort((left, right) => (left.courtNo ?? 99) - (right.courtNo ?? 99) || left.matchNo - right.matchNo),
    }));
}

function shortTeamCode(team: GoMatchView['teamA'], fallback: string): string {
  if (!team) return fallback;
  return teamColumnLabel(team.teamIdx, team.teamIdx);
}

function formatScheduleMatch(match: GoMatchView): string {
  return `${shortTeamCode(match.teamA, 'C?')} - ${shortTeamCode(match.teamB, 'C?')}`;
}

function formatSlotTime(match: GoMatchView | undefined): string {
  if (!match?.scheduledAt) return '';
  const date = new Date(match.scheduledAt);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function courtAccentClass(courtNo: number | null | undefined, active: boolean, operator: boolean): string {
  const normalizedCourt = Math.max(1, Math.trunc(Number(courtNo || 1)));
  if (operator) {
    if (!active) return normalizedCourt % 2 === 0 ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-amber-200 bg-amber-50 text-amber-800';
    return normalizedCourt % 2 === 0 ? 'border-sky-300 bg-sky-100 text-sky-950' : 'border-amber-300 bg-amber-100 text-amber-950';
  }
  if (!active) return normalizedCourt % 2 === 0 ? 'border-sky-400/25 bg-sky-500/10 text-sky-100' : 'border-amber-400/25 bg-amber-500/10 text-amber-100';
  return normalizedCourt % 2 === 0 ? 'border-sky-300/55 bg-sky-400/30 text-sky-50' : 'border-amber-300/55 bg-amber-300/30 text-amber-50';
}

export function GoGroupMatrix({
  groups,
  matches,
  mode = 'spectator',
  qualifyCount = 1,
  onSaveScore,
}: GoGroupMatrixProps) {
  const isOperator = mode === 'operator';
  const [draft, setDraft] = useState<ScoreDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const matchLookup = useMemo(() => buildMatchLookup(matches), [matches]);

  async function saveDraft() {
    if (!draft || !onSaveScore) return;
    const match = matches.find((item) => item.matchId === draft.matchId);
    const parsed = parseSingleSetScore(draft.scoreA, draft.scoreB);
    if (!match || !parsed) {
      setError('Введите счет одной партии: например 15 и 9 или 21 и 18.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSaveScore(match, parsed);
      setDraft(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить счет');
    } finally {
      setSaving(false);
    }
  }

  if (!groups.length) {
    return (
      <div className={cx(
        'rounded-lg border p-4 text-sm',
        isOperator ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-white/10 bg-black/20 text-white/50',
      )}>
        Группы еще не сформированы.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-go-group-matrix>
      {groups.map((group) => {
        const activeSlot = activeSlotForGroup(matches, group.label);
        const progress = groupProgress(matches, group.label);
        const standingByTeam = new Map(group.standings.map((row) => [row.teamId, row]));
        const orderedTeams = [...group.teams].filter((team) => !team.isBye);
        const scheduleSlots = groupMatchesBySlot(matches, group.label);

        return (
          <section
            key={group.groupId}
            className={cx(
              isOperator ? 'bg-white py-3' : 'rounded-xl border border-white/10 bg-black/20 p-3',
            )}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className={cx('text-base font-bold', isOperator ? 'text-slate-950' : 'text-white')}>Группа {group.label}</h4>
                <p className={cx('text-xs', isOperator ? 'text-slate-500' : 'text-white/55')}>
                  {progress.played}/{progress.total} матчей сыграно
                  {group.hasBye ? ' · в группе есть отдых по турам' : ''}
                </p>
              </div>
              <span
                className={cx(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                  isOperator ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-white/15 bg-white/5 text-white/70',
                )}
              >
                {group.status === 'finished' ? 'завершена' : group.status === 'live' ? 'идет' : 'ожидает'}
              </span>
            </div>

            {scheduleSlots.length > 0 ? (
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                {scheduleSlots.map((slot, index) => {
                  const isActiveSlot = activeSlot != null && slot.slotIndex === activeSlot;
                  const finished = slot.matches.every((match) => match.status === 'finished');
                  return (
                    <div
                      key={slot.slotIndex}
                      className={cx(
                        'rounded-lg border p-2 text-xs',
                        isOperator
                          ? isActiveSlot
                            ? 'border-orange-300 bg-orange-50 text-slate-950'
                            : finished
                              ? 'border-emerald-200 bg-emerald-50 text-slate-600'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          : isActiveSlot
                            ? 'border-orange-300/45 bg-orange-500/15 text-white'
                            : finished
                              ? 'border-emerald-300/25 bg-emerald-500/10 text-white/65'
                              : 'border-white/10 bg-white/5 text-white/60',
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-bold">Очередь {index + 1}</span>
                        <span>{formatSlotTime(slot.matches[0])}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {slot.matches.map((match) => (
                          <span
                            key={match.matchId}
                            className={cx(
                              'rounded border px-2 py-1 text-center font-semibold',
                              courtAccentClass(match.courtNo, isActiveSlot && match.status !== 'finished', isOperator),
                            )}
                          >
                            К{match.courtNo ?? '?'} · {formatScheduleMatch(match)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className={cx(isOperator ? 'text-slate-500' : 'text-white/55')}>
                    <th className={cx('sticky left-0 z-10 px-2 py-2 text-left font-semibold', isOperator ? 'bg-slate-100' : 'bg-[#111827]')}>Пара</th>
                    <th className={cx('px-2 py-2 text-left font-semibold', isOperator ? 'bg-slate-100' : 'bg-[#111827]')}>Игрок 1</th>
                    <th className={cx('px-2 py-2 text-left font-semibold', isOperator ? 'bg-slate-100' : 'bg-[#111827]')}>Игрок 2</th>
                    {orderedTeams.map((team, index) => (
                      <th key={team.teamId} className="bg-teal-600 px-2 py-2 text-center font-bold text-white">
                        {teamColumnLabel(team.teamIdx, index + 1)}
                      </th>
                    ))}
                    <th className={cx('px-2 py-2 text-center font-semibold', isOperator ? 'bg-sky-100 text-slate-700' : 'bg-sky-500/25 text-sky-100')}>Очки</th>
                    <th className={cx('px-2 py-2 text-center font-semibold', isOperator ? 'bg-orange-100 text-slate-700' : 'bg-orange-500/20 text-orange-100')}>Место</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedTeams.map((rowTeam, rowIndex) => {
                    const [player1, player2] = splitTeamPlayers(rowTeam.label);
                    const standing = standingByTeam.get(rowTeam.teamId);
                    const qualified = Boolean(standing && standing.position > 0 && standing.position <= qualifyCount);

                    return (
                      <tr key={rowTeam.teamId} className={isOperator ? 'bg-teal-50' : qualified ? 'bg-emerald-500/[0.07]' : 'bg-cyan-500/[0.07]'}>
                        <td className={cx('sticky left-0 z-10 border-t px-2 py-2 text-center font-bold', isOperator ? 'border-slate-200 bg-teal-50 text-slate-700' : 'border-white/5 bg-[#132126] text-white/85')}>
                          {rowTeam.teamIdx || rowIndex + 1}
                        </td>
                        <td className={cx('border-t px-2 py-2 font-semibold', isOperator ? 'border-slate-200 text-slate-950' : 'border-white/5 text-white/90')}>{player1}</td>
                        <td className={cx('border-t px-2 py-2', isOperator ? 'border-slate-200 text-slate-800' : 'border-white/5 text-white/80')}>{player2 || '-'}</td>
                        {orderedTeams.map((columnTeam) => {
                          if (columnTeam.teamId === rowTeam.teamId) {
                            return (
                              <td key={columnTeam.teamId} className={cx('border-t px-2 py-2 text-center', isOperator ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-white/5 bg-white/10 text-white/70')}>
                                -
                              </td>
                            );
                          }

                          const match = matchLookup.get(matchKey(rowTeam.teamId, columnTeam.teamId));
                          const isActive =
                            match &&
                            activeSlot != null &&
                            match.slotIndex === activeSlot &&
                            match.status !== 'finished';
                          const canEdit = mode === 'operator' && Boolean(match) && Boolean(onSaveScore);
                          const label = match
                            ? match.status === 'finished'
                              ? formatCellScore(match, rowTeam.teamId)
                              : canEdit
                                ? `ввод${match.courtNo ? ` · К${match.courtNo}` : ''}`
                                : match.status === 'live'
                                  ? 'LIVE'
                                  : 'ожидает'
                            : 'отдых';

                          return (
                            <td
                              key={columnTeam.teamId}
                              className={cx(
                                'border-t px-1 py-1 text-center',
                                isOperator ? 'border-slate-200' : 'border-white/5',
                                isActive && (match?.courtNo === 2 ? (isOperator ? 'bg-sky-100' : 'bg-sky-300/30') : (isOperator ? 'bg-amber-100' : 'bg-amber-300/35')),
                                match?.status === 'live' && (isOperator ? 'bg-sky-100' : 'bg-sky-400/30'),
                                !match && (isOperator ? 'bg-slate-50 text-slate-300' : 'bg-white/[0.03] text-white/30'),
                              )}
                            >
                              {canEdit && match ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft({
                                      matchId: match.matchId,
                                      displayLabel: `${match.teamA?.label || rowTeam.label} vs ${match.teamB?.label || columnTeam.label}`,
                                      scoreA: match.scoreA[0] == null ? '' : String(match.scoreA[0]),
                                      scoreB: match.scoreB[0] == null ? '' : String(match.scoreB[0]),
                                    })
                                  }
                                  className={cx(
                                    'min-h-9 w-full rounded-md border px-2 py-1 text-[11px] font-semibold',
                                    match.status === 'finished'
                                      ? `${isOperator ? (match.winnerId === rowTeam.teamId ? 'text-emerald-700' : 'text-rose-700') : cellScoreTone(match, rowTeam.teamId)} ${isOperator ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`
                                      : isActive
                                        ? courtAccentClass(match.courtNo, true, isOperator)
                                        : isOperator
                                          ? 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'
                                          : 'border-white/10 bg-white/5 text-white/55 hover:border-white/25 hover:text-white',
                                  )}
                                >
                                  {label}
                                </button>
                              ) : (
                                <span className={cx('block min-h-9 rounded-md px-2 py-2 text-[11px] font-semibold', match && cellScoreTone(match, rowTeam.teamId))}>
                                  {label}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className={cx('border-t px-2 py-2 text-center font-bold', isOperator ? 'border-slate-200 bg-sky-50 text-slate-950' : 'border-white/5 bg-sky-500/10 text-white')}>
                          {standing ? `${standing.matchPoints} (${formatPointsDiff(standing.pointDiff)})` : '0 (+0)'}
                        </td>
                        <td className={cx('border-t px-2 py-2 text-center font-bold', isOperator ? 'border-slate-200 bg-orange-50 text-slate-950' : 'border-white/5 bg-orange-500/10 text-white')}>
                          {standing?.position || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Ввод результата</h3>
            <p className="mt-1 text-sm text-white/65">{draft.displayLabel}</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Команда 1</span>
                <input
                  value={draft.scoreA}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, scoreA: normalizeScoreInput(event.target.value) } : prev))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveDraft();
                  }}
                  placeholder="15"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                  className="h-14 w-full rounded-lg border border-white/15 bg-black/35 px-3 text-center text-2xl font-bold text-white outline-none focus:border-teal-300/70"
                />
              </label>
              <span className="pb-4 text-lg font-bold text-white/35">:</span>
              <label className="block text-sm">
                <span className="mb-1 block text-white/60">Команда 2</span>
                <input
                  value={draft.scoreB}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, scoreB: normalizeScoreInput(event.target.value) } : prev))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveDraft();
                  }}
                  placeholder="9"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-14 w-full rounded-lg border border-white/15 bg-black/35 px-3 text-center text-2xl font-bold text-white outline-none focus:border-teal-300/70"
                />
              </label>
            </div>
            <p className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">
              Одна партия до 15 или 21 очка. После сохранения счет автоматически появится в обеих ячейках матрицы.
            </p>
            {error ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={saving}
                className="rounded-lg border border-emerald-300/45 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-50 disabled:opacity-50"
              >
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError('');
                }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white/70"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
