'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type PublicTab = 'schedule' | 'groups' | 'brackets';
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object') : [];
}

function firstString(row: JsonRecord, keys: string[], fallback = '—'): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

function timeLabel(value: unknown, timezone?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Время уточняется';
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
    }
  }
  return raw.slice(0, 5);
}

function resultKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    played: 'Матч завершён',
    walkover: 'Техническая победа',
    forfeit: 'Отказ',
    incomplete: 'Матч завершён досрочно',
    mutual_no_show: 'Обе команды не явились',
    admin_award: 'Административный результат',
    voided: 'Матч аннулирован',
  };
  return labels[kind] ?? 'Результат зафиксирован';
}

function disruptionLabel(kind: string): string {
  const labels: Record<string, string> = {
    rain_hold: 'Пауза из-за дождя',
    lightning_hold: 'Пауза из-за грозы',
    court_damage: 'Корт временно недоступен',
    medical_delay: 'Медицинская пауза',
    security_pause: 'Пауза по безопасности',
    court_close: 'Корт закрыт',
    global_pause: 'Турнир временно приостановлен',
  };
  return labels[kind] ?? 'Изменение в расписании';
}

function playStateLabel(state: string): string {
  const labels: Record<string, string> = {
    ready: 'Скоро',
    live: 'LIVE',
    paused: 'Пауза',
    final: 'Завершён',
    voided: 'Аннулирован',
  };
  return labels[state] ?? '';
}

function matchResultSummary(match: JsonRecord): { label: string; sets: string; rallies: string } | null {
  const result = asRecord(match.result);
  const resultKind = String(result.resultKind ?? '');
  if (!resultKind) return null;
  const actualScore = asRecord(result.actualScore);
  const declaredResult = asRecord(result.declaredResult);
  const score = Array.isArray(actualScore.sets) ? actualScore : declaredResult;
  const sets = asRecords(score.sets).flatMap((set) => {
    const teamA = Number(set.teamA);
    const teamB = Number(set.teamB);
    return Number.isInteger(teamA) && Number.isInteger(teamB) ? [{ teamA, teamB }] : [];
  });
  const setsA = sets.filter((set) => set.teamA > set.teamB).length;
  const setsB = sets.filter((set) => set.teamB > set.teamA).length;
  const technical = declaredResult.technical === true;
  return {
    label: `${resultKindLabel(resultKind)}${technical ? ' · технический счёт' : ''}`,
    sets: sets.length ? `${setsA}:${setsB}` : '—',
    rallies: sets.map((set) => `${set.teamA}:${set.teamB}`).join(' · '),
  };
}

export function TournamentV2PublicView({ tournamentId }: { tournamentId: string }) {
  const [payload, setPayload] = useState<JsonRecord | null>(null);
  const [activeTab, setActiveTab] = useState<PublicTab>('schedule');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/go-v2/tournaments/${encodeURIComponent(tournamentId)}/structure`, { cache: 'no-store' });
      const result = (await response.json().catch(() => ({}))) as JsonRecord & { error?: string };
      if (!response.ok) throw new Error(result.error || 'LIVE-данные пока недоступны');
      setPayload(result);
      setUpdatedAt(Date.now());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'LIVE-данные пока недоступны');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const tournament = payload?.tournament && typeof payload.tournament === 'object' ? payload.tournament as JsonRecord : {};
  const entries = useMemo(() => asRecords(payload?.entries), [payload]);
  const entryNames = useMemo(
    () => new Map(entries.map((entry) => [String(entry.id ?? entry.entryId ?? ''), firstString(entry, ['displayName', 'name'], 'Команда')])),
    [entries],
  );
  const groups = useMemo(() => asRecords(payload?.pools ?? payload?.groups), [payload]);
  const groupStandings = useMemo(() => {
    const map = new Map<string, JsonRecord[]>();
    for (const snapshot of asRecords(payload?.standings)) {
      for (const row of asRecords(snapshot.rows)) {
        const poolId = String(row.poolId ?? '');
        if (!poolId) continue;
        map.set(poolId, [...(map.get(poolId) ?? []), row]);
      }
    }
    for (const snapshot of asRecords(payload?.liveStandings)) {
      const rowsByPool = new Map<string, JsonRecord[]>();
      for (const row of asRecords(snapshot.rows)) {
        const poolId = String(row.poolId ?? snapshot.poolId ?? '');
        if (!poolId) continue;
        rowsByPool.set(poolId, [...(rowsByPool.get(poolId) ?? []), row]);
      }
      for (const [poolId, rows] of rowsByPool) map.set(poolId, rows);
    }
    for (const [poolId, rows] of map) {
      map.set(poolId, rows.sort((left, right) => Number(left.poolRank ?? 99) - Number(right.poolRank ?? 99)));
    }
    return map;
  }, [payload]);
  const provisionalPoolIds = useMemo(() => new Set(
    asRecords(payload?.liveStandings)
      .filter((standing) => standing.provisional === true)
      .map((standing) => String(standing.poolId ?? ''))
      .filter(Boolean),
  ), [payload]);
  const matches = useMemo(() => asRecords(payload?.matches), [payload]);
  const matchesById = useMemo(
    () => new Map(matches.map((match) => [String(match.id ?? match.matchId ?? ''), match])),
    [matches],
  );
  const scheduleContext = useMemo(() => {
    const current = payload?.currentSchedule && typeof payload.currentSchedule === 'object'
      ? payload.currentSchedule as JsonRecord
      : {};
    const versions = asRecords(payload?.scheduleVersions);
    const latestPublished = [...versions]
      .reverse()
      .find((version) => version.status === 'published' || version.published === true)
      ?? versions.at(-1)
      ?? {};
    return {
      assignments: asRecords(current.assignments ?? latestPublished.assignments ?? payload?.assignments),
      timezone: firstString(
        current,
        ['timezone'],
        firstString(latestPublished, ['timezone'], firstString(asRecord(payload?.tournament), ['timezone'], 'Asia/Yekaterinburg')),
      ),
    };
  }, [payload]);
  const assignments = scheduleContext.assignments;
  const scheduleTimezone = scheduleContext.timezone;
  const courts = useMemo(() => asRecords(payload?.courts), [payload]);
  const courtNames = useMemo(
    () => new Map(courts.map((court) => [String(court.id ?? ''), firstString(court, ['label'], `Корт ${firstString(court, ['courtNo'], '—')}`)])),
    [courts],
  );
  const activeDisruptions = useMemo(
    () => asRecords(payload?.activeDisruptions).filter((item) => String(item.status ?? 'active') === 'active'),
    [payload],
  );
  const brackets = useMemo(() => asRecords(payload?.brackets ?? payload?.stages).filter((stage) => {
    const kind = String(stage.stageType ?? stage.kind ?? stage.format ?? '');
    return kind === 'single_elimination' || kind === 'double_elimination' || kind === 'placement_match';
  }), [payload]);
  const lifecycle = String(tournament.lifecycleState ?? 'draft');
  const publicStateLabel = lifecycle === 'live'
    ? 'LIVE'
    : lifecycle === 'finished'
      ? 'Завершён'
      : lifecycle === 'schedule_published'
        ? 'Расписание опубликовано'
        : 'Данные турнира';

  return (
    <section className="mt-4 space-y-4">
      <header className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_42%),rgba(15,17,25,0.96)] p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-100">{publicStateLabel}</span>
            <h1 className="mt-3 font-heading text-3xl tracking-wide text-text-primary md:text-4xl">{firstString(tournament, ['name', 'title'], 'Турнир LPVolley')}</h1>
            <p className="mt-2 text-sm text-text-secondary">Группы, сетки и фактическое время матчей в одном экране.</p>
          </div>
          <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-text-primary">
            Обновить
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{matches.length} матчей</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{groups.length} групп</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Обновлено {updatedAt ? new Date(updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        </div>
      </header>

      {error ? <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">{error}. Возможно, организатор ещё не опубликовал V2-структуру.</div> : null}
      {loading ? <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-text-secondary">Загружаем актуальное состояние…</div> : null}

      {activeDisruptions.length ? (
        <section role="status" aria-live="polite" className="rounded-2xl border border-amber-300/35 bg-amber-500/10 p-4 text-amber-50">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200/80">Важное изменение</p>
          <div className="mt-2 space-y-2">
            {activeDisruptions.map((item, index) => {
              const kind = String(item.disruptionKind ?? item.kind ?? '');
              const courtId = String(item.courtId ?? '');
              const expectedEndAt = item.expectedEndAt;
              return (
                <div key={firstString(item, ['id'], String(index))} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold">{disruptionLabel(kind)}{courtId ? ` · ${courtNames.get(courtId) ?? 'корт'}` : ''}</span>
                  <span className="text-xs text-amber-100/75">{expectedEndAt ? `Ожидаем до ${timeLabel(expectedEndAt, scheduleTimezone)}` : 'Следите за live-расписанием'}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-surface-light/20 p-2">
        {([
          ['schedule', 'Расписание'],
          ['groups', 'Группы'],
          ['brackets', 'Сетки'],
        ] as Array<[PublicTab, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold ${activeTab === id ? 'border-brand bg-brand text-white' : 'border-transparent text-text-secondary'}`}>{label}</button>
        ))}
      </nav>

      {activeTab === 'schedule' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(assignments.length ? assignments : matches).map((row, index) => {
            const match = row.match && typeof row.match === 'object'
              ? row.match as JsonRecord
              : matchesById.get(String(row.matchId ?? row.id ?? '')) ?? row;
            const conditional = Boolean(row.isConditional ?? match.isConditional);
            const plannedStart = row.plannedStart ?? row.startTime ?? match.plannedStart;
            const predictedStart = row.predictedStart ?? row.liveEta ?? match.predictedStart ?? match.liveEta;
            const actualStart = row.actualStart ?? match.actualStart;
            const playState = String(match.playState ?? row.playState ?? 'pending');
            const displayStart = ['live', 'paused', 'final', 'voided'].includes(playState) && actualStart
              ? actualStart
              : predictedStart ?? plannedStart;
            const timePrefix = actualStart && ['live', 'paused', 'final', 'voided'].includes(playState)
              ? 'Факт'
              : predictedStart
                ? 'Прогноз'
                : '';
            const stateLabel = playStateLabel(playState);
            const result = matchResultSummary(match);
            const participants = asRecords(match.slotSources).map((source) => {
              const entryId = String(source.resolvedEntryId ?? source.sourceEntryId ?? '');
              if (entryId && entryNames.has(entryId)) return entryNames.get(entryId) as string;
              const sourceType = firstString(source, ['sourceType'], 'TBD');
              if (sourceType === 'MATCH_WINNER') return 'Победитель предыдущего матча';
              if (sourceType === 'MATCH_LOSER') return 'Проигравший предыдущего матча';
              if (sourceType === 'POOL_RANK') return `Место ${firstString(source, ['sourceRank'], '—')} в группе`;
              return 'Участник уточняется';
            });
            return (
              <article key={firstString(row, ['id', 'matchId'], String(index))} className={`rounded-2xl border p-4 ${conditional ? 'border-dashed border-violet-400/40 bg-violet-500/10' : 'border-white/10 bg-surface-light/20'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-text-primary">
                    {timePrefix ? `${timePrefix} ${timeLabel(displayStart, scheduleTimezone)}` : timeLabel(displayStart, scheduleTimezone)}
                  </span>
                  <div className="flex items-center gap-2">
                    {stateLabel ? <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${playState === 'live' ? 'border-red-300/40 bg-red-500/15 text-red-100' : playState === 'paused' ? 'border-amber-300/40 bg-amber-500/15 text-amber-100' : 'border-white/10 text-text-secondary'}`}>{stateLabel}</span> : null}
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-text-secondary">{firstString(row, ['courtLabel', 'courtNo', 'court'], courtNames.get(String(row.courtId ?? '')) ?? 'Корт —')}</span>
                  </div>
                </div>
                {(predictedStart || actualStart) && plannedStart ? <p className="mt-1 text-xs text-amber-200/80">План: {timeLabel(plannedStart, scheduleTimezone)}</p> : null}
                <p className="mt-3 text-xs uppercase tracking-wide text-text-secondary">{firstString(match, ['label', 'roundLabel', 'stageLabel'], conditional ? 'Reset-финал — при необходимости' : `Матч ${index + 1}`)}</p>
                <div className="mt-3 space-y-2 text-sm font-semibold text-text-primary">
                  <p>{participants[0] ?? firstString(match, ['teamAName', 'participantAName', 'homeName'], 'Участник уточняется')}</p>
                  <p>{participants[1] ?? firstString(match, ['teamBName', 'participantBName', 'awayName'], 'Участник уточняется')}</p>
                </div>
                {result ? (
                  <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-emerald-100">{result.label}</span>
                      <span className="text-base font-black text-white">{result.sets}</span>
                    </div>
                    {result.rallies ? <p className="mt-1 text-xs text-emerald-100/75">Партии: {result.rallies}</p> : null}
                  </div>
                ) : null}
                {conditional ? <p className="mt-3 text-xs text-violet-100">Условный слот активируется только если победитель Lower выиграет GF1.</p> : null}
              </article>
            );
          })}
          {!loading && assignments.length === 0 && matches.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-text-secondary">Расписание ещё не опубликовано.</div> : null}
        </div>
      ) : null}

      {activeTab === 'groups' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group, index) => (
            <article key={firstString(group, ['id', 'poolId'], String(index))} className="rounded-2xl border border-white/10 bg-surface-light/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-2xl tracking-wide text-text-primary">Группа {firstString(group, ['label', 'name'], String.fromCharCode(65 + index))}</h2>
                {provisionalPoolIds.has(String(group.id ?? group.poolId ?? '')) ? (
                  <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Предварительно</span>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {asRecords(groupStandings.get(String(group.id ?? group.poolId ?? '')) ?? group.standings ?? group.teams ?? group.assignments).map((team, teamIndex) => (
                  <div key={firstString(team, ['id', 'entryId'], String(teamIndex))} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{firstString(team, ['poolRank'], String(teamIndex + 1))}. {entryNames.get(String(team.entryId ?? team.id ?? '')) ?? firstString(team, ['teamName', 'name', 'label'], 'Команда')}</span>
                    <span className="shrink-0 text-right text-xs text-text-secondary">
                      {firstString(asRecord(asRecord(team.metrics).totals), ['matchPoints'], firstString(team, ['matchPoints', 'points'], '0'))} MP
                      <span className="ml-2 text-white/35">{firstString(asRecord(asRecord(team.metrics).totals), ['matchesPlayed'], '0')} игр.</span>
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!loading && groups.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-text-secondary">Группы ещё не опубликованы.</div> : null}
        </div>
      ) : null}

      {activeTab === 'brackets' ? (
        <div className="space-y-3">
          {brackets.map((stage, index) => (
            <article key={firstString(stage, ['id', 'stageId'], String(index))} className="rounded-2xl border border-white/10 bg-surface-light/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-2xl tracking-wide text-text-primary">{firstString(stage, ['name', 'label', 'tier'], `Сетка ${index + 1}`)}</h2>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-secondary">{firstString(stage, ['kind', 'format', 'stageKind'], 'playoff')}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {matches.filter((match) => String(match.stageId ?? '') === String(stage.id ?? stage.stageId ?? '')).map((match, matchIndex) => {
                  const sources = asRecords(match.slotSources);
                  const names = sources.map((source) => entryNames.get(String(source.resolvedEntryId ?? source.sourceEntryId ?? '')) ?? firstString(source, ['sourceType'], 'TBD'));
                  const result = matchResultSummary(match);
                  return <div key={firstString(match, ['id', 'matchId'], String(matchIndex))} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-text-primary">
                    <p className="text-xs text-text-secondary">Раунд {firstString(match, ['roundNo'], '—')} · матч {firstString(match, ['position'], String(matchIndex + 1))}</p>
                    <p className="mt-2 truncate">{names[0] ?? 'TBD'}</p>
                    <p className="mt-1 truncate">{names[1] ?? 'TBD'}</p>
                    {result ? <p className="mt-2 text-xs font-semibold text-emerald-200">{result.label}: {result.sets}{result.rallies ? ` · ${result.rallies}` : ''}</p> : null}
                  </div>;
                })}
              </div>
            </article>
          ))}
          {!loading && brackets.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-text-secondary">Сетки ещё не опубликованы.</div> : null}
        </div>
      ) : null}
    </section>
  );
}
