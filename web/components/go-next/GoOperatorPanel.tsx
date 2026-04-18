'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoBracketSlotView, GoMatchView, GoOperatorActionName, GoOperatorState } from '@/lib/go-next/types';
import { GoBracketView } from './GoBracketView';
import { GoGroupStandings } from './GoGroupStandings';
import { GoSeedEditor, type GoSeedDraft } from './GoSeedEditor';
import { GoCourtSlotsGrid } from './courts/GoCourtSlotsGrid';
import {
  buildCockpitAlerts,
  buildStepperItems,
  deriveCourtsCards,
  deriveStageSummary,
  mapOperatorToDomainStage,
  pickPrimaryAction,
  type CockpitActionId,
  type CourtCockpitCard,
  type GoUiStageStatus,
} from './operator-cockpit-model';
import { GoScheduleGrid } from './schedule/GoScheduleGrid';
import { GoRosterConfigPanel } from './setup/GoRosterConfigPanel';

type GoStateResponse = {
  state?: GoOperatorState;
  groups?: GoOperatorState['groups'];
  matches?: GoMatchView[];
  brackets?: Record<string, GoBracketSlotView[]>;
  seedDraft?: GoSeedDraft;
  error?: string;
};

type WorkspaceKey = 'groups' | 'schedule' | 'bracket' | 'courts';

type ConfirmState =
  | {
      open: true;
      type: 'soft' | 'hard';
      title: string;
      message: string;
      action: GoOperatorActionName;
      expectedText?: string;
    }
  | { open: false };

function asState(payload: unknown): GoOperatorState | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('stage' in (payload as Record<string, unknown>) && 'settings' in (payload as Record<string, unknown>)) {
    return payload as GoOperatorState;
  }
  if ('state' in (payload as Record<string, unknown>)) {
    return ((payload as GoStateResponse).state ?? null) as GoOperatorState | null;
  }
  return null;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function stageBadge(status: GoUiStageStatus): string {
  if (status === 'completed') return 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200';
  if (status === 'active') return 'border-orange-400/55 bg-orange-500/20 text-orange-100';
  if (status === 'locked') return 'border-zinc-400/45 bg-zinc-500/20 text-zinc-200';
  if (status === 'not_applicable') return 'border-white/10 bg-white/5 text-white/40';
  return 'border-white/15 bg-white/5 text-white/60';
}

function formatUpdatedLabel(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDomainStageLabel(stage: ReturnType<typeof mapOperatorToDomainStage>): string {
  if (stage === 'setup_incomplete') return 'Не настроен';
  if (stage === 'groups_ready') return 'Группы готовы';
  if (stage === 'groups_live') return 'Групповой этап активен';
  if (stage === 'groups_done') return 'Группы завершены';
  if (stage === 'bracket_ready') return 'Плей-офф готов';
  if (stage === 'bracket_live') return 'Плей-офф активен';
  if (stage === 'bracket_done') return 'Турнир завершён';
  return 'Турнир закрыт';
}

function courtCardClass(card: CourtCockpitCard): string {
  if (card.status === 'live') return 'border-emerald-400/45 bg-emerald-500/15';
  if (card.status === 'attention') return 'border-amber-400/45 bg-amber-500/15';
  if (card.status === 'offline') return 'border-red-400/45 bg-red-500/12';
  if (card.status === 'assigned') return 'border-cyan-400/35 bg-cyan-500/10';
  if (card.status === 'waiting') return 'border-yellow-400/35 bg-yellow-500/10';
  return 'border-white/15 bg-white/5';
}

export function GoOperatorPanel({
  tournamentId,
  initialState,
}: {
  tournamentId: string;
  initialState?: GoOperatorState | null;
}) {
  const [state, setState] = useState<GoOperatorState | null>(initialState ?? null);
  const [matches, setMatches] = useState<GoMatchView[]>([]);
  const [brackets, setBrackets] = useState<Record<string, GoBracketSlotView[]>>({});
  const [seedDraft, setSeedDraft] = useState<GoSeedDraft | null>(null);
  const [activeBracketLevel, setActiveBracketLevel] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKey>('groups');
  const [selectedGroupForWalkover, setSelectedGroupForWalkover] = useState('');
  const [pending, setPending] = useState<GoOperatorActionName | null>(null);
  const [actionError, setActionError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [syncState, setSyncState] = useState<'loading' | 'ready' | 'error'>(initialState ? 'ready' : 'loading');
  const [lastSyncAt, setLastSyncAt] = useState(Date.now());
  const [clockTick, setClockTick] = useState(Date.now());
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });
  const [confirmInput, setConfirmInput] = useState('');

  const staleThresholdMs = 90_000;
  const staleMs = Math.max(0, clockTick - lastSyncAt);
  const groups = state?.groups ?? [];
  const qualifyCount = Math.max(1, state?.settings.bracketLevels ?? 1);
  const currentStage = state?.stage ?? 'setup';
  const domainStage = mapOperatorToDomainStage(currentStage);
  const summary = useMemo(() => deriveStageSummary(matches), [matches]);

  const hydrate = useCallback((payload: unknown) => {
    const nextState = asState(payload);
    if (nextState) setState(nextState);
    const data = payload as GoStateResponse;
    if (Array.isArray(data?.matches)) setMatches(data.matches);
    if (data?.brackets && typeof data.brackets === 'object') {
      setBrackets(data.brackets as Record<string, GoBracketSlotView[]>);
      if (!activeBracketLevel) {
        const firstLevel = Object.keys(data.brackets)[0];
        if (firstLevel) setActiveBracketLevel(firstLevel);
      }
    }
    if (data?.seedDraft && typeof data.seedDraft === 'object') setSeedDraft(data.seedDraft);
  }, [activeBracketLevel]);

  const loadState = useCallback(async () => {
    if (!tournamentId) return;
    let hadSuccess = false;
    const errors: string[] = [];
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-standings`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as GoStateResponse;
      if (!response.ok) errors.push(payload.error || 'Не удалось загрузить standings');
      else {
        hydrate(payload);
        hadSuccess = true;
      }
    } catch {
      errors.push('Standings недоступны');
    }
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-bracket`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as GoStateResponse;
      if (!response.ok) errors.push(payload.error || 'Не удалось загрузить bracket');
      else {
        hydrate(payload);
        hadSuccess = true;
      }
    } catch {
      errors.push('Bracket недоступен');
    }
    if (hadSuccess) {
      setFetchError('');
      setSyncState('ready');
      setLastSyncAt(Date.now());
    } else if (errors.length) {
      setFetchError(errors[0]);
      setSyncState('error');
    }
  }, [hydrate, tournamentId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadState();
    }, 8000);
    return () => clearInterval(timer);
  }, [loadState]);

  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedGroupForWalkover && groups.length > 0) {
      setSelectedGroupForWalkover(groups[0].groupId);
    }
  }, [groups, selectedGroupForWalkover]);

  useEffect(() => {
    if (domainStage === 'setup_incomplete') {
      setActiveWorkspace('groups');
      return;
    }
    if (domainStage === 'groups_live') {
      setActiveWorkspace('schedule');
      return;
    }
    if (domainStage === 'groups_done' || domainStage === 'bracket_ready' || domainStage === 'bracket_live') {
      setActiveWorkspace('bracket');
    }
  }, [domainStage]);

  const courts = state?.courts ?? [];
  const courtCards = useMemo(
    () => deriveCourtsCards({ matches, courts, staleMs, staleThresholdMs }),
    [courts, matches, staleMs],
  );
  const onlineCourts = courtCards.filter((card) => card.status === 'live').length;
  const alerts = useMemo(
    () =>
      buildCockpitAlerts({
        domainStage,
        summary,
        courts: courtCards,
        fetchError,
        patchError: actionError,
        staleMs,
        staleThresholdMs,
      }),
    [actionError, courtCards, domainStage, fetchError, summary, staleMs],
  );
  const primaryAction = useMemo(() => pickPrimaryAction({ domainStage, summary, alerts }), [alerts, domainStage, summary]);
  const blockingAlert = alerts.find((alert) => alert.level === 'blocking') ?? null;
  const attentionAlerts = alerts.filter((alert) => alert.level === 'attention');
  const infoAlerts = alerts.filter((alert) => alert.level === 'info');
  const stepperItems = useMemo(() => buildStepperItems({ domainStage, matches }), [domainStage, matches]);

  const actionAllowedByStage: Partial<Record<GoOperatorActionName, boolean>> = {
    bootstrap_groups: currentStage === 'setup',
    start_group_stage: currentStage === 'groups_ready',
    finish_group_stage: currentStage === 'groups_live',
    preview_bracket_seed: currentStage === 'groups_finished',
    confirm_bracket_seed: currentStage === 'bracket_preview',
    bootstrap_bracket: currentStage === 'bracket_ready',
    finish_bracket: currentStage === 'bracket_live',
    rollback_stage: currentStage !== 'setup',
    mass_walkover_group: currentStage === 'groups_live',
  };

  async function runAction(action: GoOperatorActionName, options?: Record<string, unknown>) {
    if (!tournamentId) return;
    setPending(action);
    setActionError('');
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(options ?? {}) }),
      });
      const payload = (await response.json().catch(() => ({}))) as GoStateResponse;
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'GO action failed');
      }
      hydrate(payload);
      setLastSyncAt(Date.now());
      setSyncState('ready');
      await loadState();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'GO action failed');
    } finally {
      setPending(null);
    }
  }

  async function runCockpitAction(actionId: CockpitActionId): Promise<void> {
    if (actionId === 'none') return;
    if (actionId === 'reload') return loadState();
    if (actionId === 'open_schedule') return setActiveWorkspace('schedule');
    if (actionId === 'open_bracket') {
      setActiveWorkspace('bracket');
      if (currentStage === 'groups_finished' && actionAllowedByStage.preview_bracket_seed) {
        await runAction('preview_bracket_seed');
      }
      return;
    }
    if (actionId === 'open_courts') return setActiveWorkspace('courts');
    if (actionId === 'resolve_assignments') return setActiveWorkspace('schedule');
    if (actionId === 'bootstrap_groups' && actionAllowedByStage.bootstrap_groups) return runAction('bootstrap_groups');
    if (actionId === 'start_group_stage' && actionAllowedByStage.start_group_stage) return runAction('start_group_stage');
    if (actionId === 'finish_group_stage' && actionAllowedByStage.finish_group_stage) return runAction('finish_group_stage');
    if (actionId === 'bootstrap_bracket') {
      if (actionAllowedByStage.preview_bracket_seed) return runAction('preview_bracket_seed');
      if (actionAllowedByStage.bootstrap_bracket) return runAction('bootstrap_bracket');
      return;
    }
    if (actionId === 'finish_bracket' && actionAllowedByStage.finish_bracket) return runAction('finish_bracket');
  }

  const canFinishGroups = actionAllowedByStage.finish_group_stage && summary.pendingMatches === 0 && summary.liveMatches === 0;
  const canFinishBracket = actionAllowedByStage.finish_bracket && summary.pendingMatches === 0 && summary.liveMatches === 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
      <header className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.16),transparent_45%),rgba(15,17,25,0.95)] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-white md:text-3xl">GO Tournament Control</h1>
            <p className="text-sm text-white/75">
              {groups.length} групп • {groups.reduce((sum, group) => sum + group.effectiveTeamCount, 0)} команд • {courts.length} корта
            </p>
          </div>
          <div className="space-y-2 text-right">
            <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
              {formatDomainStageLabel(domainStage)}
            </span>
            <p className="text-xs text-white/55">
              Синхронизация: {syncState === 'loading' ? 'загрузка' : syncState === 'error' ? 'ошибка' : 'ok'} • обновлено {formatUpdatedLabel(lastSyncAt)}
            </p>
          </div>
        </div>
      </header>
      <section className="rounded-2xl border border-white/10 bg-[#111625]/95 p-3 md:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {stepperItems
            .filter((item) => !item.hidden)
            .map((item) => (
              <div
                key={item.id}
                className={cx('rounded-xl border px-3 py-2 text-xs font-semibold', stageBadge(item.status))}
                title={item.status === 'locked' ? 'Step is blocked by previous conditions' : undefined}
              >
                <div className="flex items-center gap-1.5">
                  <span>{item.status === 'completed' ? '✓' : item.status === 'locked' ? '🔒' : ''}</span>
                  <span>{item.label}</span>
                </div>
              </div>
            ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)]">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f1119]/95 p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Сценарий этапа</p>
            <h2 className="mt-1 text-xl font-bold text-white">
              {domainStage === 'setup_incomplete'
                ? 'Настройка турнира'
                : domainStage === 'groups_ready' || domainStage === 'groups_live' || domainStage === 'groups_done'
                  ? 'Групповой этап'
                  : domainStage === 'bracket_ready' || domainStage === 'bracket_live'
                    ? 'Плей-офф'
                    : 'Завершение турнира'}
            </h2>
            <p className="mt-2 text-sm text-white/70">Сыгранных матчей: {summary.playedMatches} / {summary.totalMatches}</p>
            <p className="mt-1 text-sm text-white/70">Корты онлайн: {onlineCourts} / {courts.length || 0}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={primaryAction.id === 'none' || pending !== null}
                onClick={() => void runCockpitAction(primaryAction.id)}
                className="rounded-lg border border-orange-300/60 bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
              >
                {pending ? 'Выполняется…' : primaryAction.label}
              </button>
              <button
                type="button"
                onClick={() => setIsSecondaryOpen((open) => !open)}
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85"
              >
                Доп. действия {isSecondaryOpen ? '▲' : '▼'}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/60">{primaryAction.reason}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs text-white/60">Матчей вживую</p>
              <p className="mt-1 text-2xl font-bold text-white">{summary.liveMatches}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs text-white/60">Нераспределённых матчей</p>
              <p className="mt-1 text-2xl font-bold text-white">{summary.unscheduledPendingMatches}</p>
            </div>
          </div>
        </section>

        <aside className="space-y-3 rounded-2xl border border-white/10 bg-[#0f1119]/95 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Корты • LIVE</h3>
            <span className="text-xs text-white/55">Обновлено {formatUpdatedLabel(lastSyncAt)}</span>
          </div>
          <div className="space-y-2">
            {courtCards.map((card) => (
              <article key={card.courtNo} className={cx('rounded-xl border p-3', courtCardClass(card))}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white">{card.label}</p>
                  <span className="rounded-md border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                    {card.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/80">{card.matchLabel}</p>
                <p className="mt-1 whitespace-pre-line text-xs text-white/70">{card.teamsLabel}</p>
                <p className="mt-2 text-xl font-bold text-white">{card.scoreLabel}</p>
                <div className="mt-2 flex items-center gap-2">
                  {card.status === 'live' ? (
                    <a
                      href={`/court/${encodeURIComponent(card.pinCode)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-md border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Open board
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runCockpitAction(card.actionId)}
                      className="rounded-md border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      {card.actionLabel}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-white/45">PIN: {card.pinCode}</p>
              </article>
            ))}
          </div>
        </aside>
      </div>

      {blockingAlert ? (
        <section className="rounded-2xl border border-red-400/40 bg-red-500/15 p-4">
          <p className="text-sm font-semibold text-red-100">{blockingAlert.title}</p>
          <p className="mt-1 text-sm text-red-100/90">{blockingAlert.message}</p>
          {blockingAlert.actionId && blockingAlert.actionLabel ? (
            <button
              type="button"
              onClick={() => {
                const actionId = blockingAlert.actionId;
                if (actionId) void runCockpitAction(actionId);
              }}
              className="mt-3 rounded-md border border-red-200/35 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-50"
            >
              {blockingAlert.actionLabel}
            </button>
          ) : null}
        </section>
      ) : null}

      {attentionAlerts.length > 0 ? (
        <section className="rounded-2xl border border-amber-300/35 bg-amber-500/10 p-4">
          <h3 className="text-sm font-semibold text-amber-100">Attention queue</h3>
          <div className="mt-2 space-y-2">
            {attentionAlerts.map((alert) => (
              <article key={alert.id} className="rounded-lg border border-amber-200/20 bg-black/20 p-3">
                <p className="text-sm font-semibold text-amber-100">{alert.title}</p>
                <p className="mt-1 text-xs text-amber-50/90">{alert.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {infoAlerts.length > 0 ? (
        <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
          <h3 className="text-sm font-semibold text-emerald-100">Info</h3>
          <div className="mt-2 space-y-2">
            {infoAlerts.map((alert) => (
              <article key={alert.id} className="rounded-lg border border-emerald-300/20 bg-black/20 p-3">
                <p className="text-sm font-semibold text-emerald-100">{alert.title}</p>
                <p className="mt-1 text-xs text-emerald-100/90">{alert.message}</p>
                {alert.actionId && alert.actionLabel ? (
                  <button
                    type="button"
                    onClick={() => {
                      const actionId = alert.actionId;
                      if (actionId) void runCockpitAction(actionId);
                    }}
                    className="mt-2 rounded border border-emerald-200/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-50"
                  >
                    {alert.actionLabel}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isSecondaryOpen ? (
        <section className="rounded-2xl border border-white/10 bg-[#101524]/95 p-4">
          <h3 className="text-sm font-semibold text-white">Доп. действия</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['groups', 'schedule', 'bracket', 'courts'] as WorkspaceKey[]).map((workspace) => {
              const workspaceLabels: Record<WorkspaceKey, string> = { groups: 'Группы', schedule: 'Расписание', bracket: 'Сетка', courts: 'Корты' };
              return (
              <button
                key={workspace}
                type="button"
                onClick={() => setActiveWorkspace(workspace)}
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                  activeWorkspace === workspace
                    ? 'border-orange-300/60 bg-orange-500/20 text-orange-100'
                    : 'border-white/15 bg-white/5 text-white/80',
                )}
              >
                {workspaceLabels[workspace]}
              </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {actionAllowedByStage.preview_bracket_seed ? (
              <button
                type="button"
                onClick={() => void runAction('preview_bracket_seed')}
                disabled={pending !== null}
                className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 disabled:opacity-50"
              >
                Предпросмотр сетки
              </button>
            ) : null}
            {actionAllowedByStage.rollback_stage ? (
              <button
                type="button"
                onClick={() =>
                  setConfirmState({
                    open: true,
                    type: 'soft',
                    title: 'Откатить этап?',
                    message: 'Использовать только для восстановления после инцидента.',
                    action: 'rollback_stage',
                  })
                }
                disabled={pending !== null}
                className="rounded border border-yellow-300/35 bg-yellow-500/10 px-3 py-1.5 text-xs font-semibold text-yellow-100 disabled:opacity-50"
              >
                Откат
              </button>
            ) : null}
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-white/5 text-white/70">
                <tr>
                  <th className="px-2 py-2 text-left">Устаревшая функция</th>
                  <th className="px-2 py-2 text-left">Новая точка входа</th>
                  <th className="px-2 py-2 text-left">Приоритет</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/10">
                  <td className="px-2 py-2 text-white/85">Перетаскивание матча</td>
                  <td className="px-2 py-2 text-white/65">Рабочее пространство расписания</td>
                  <td className="px-2 py-2 text-white/65">Вторичный</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="px-2 py-2 text-white/85">Редактирование счёта</td>
                  <td className="px-2 py-2 text-white/65">Контекст live/расписания</td>
                  <td className="px-2 py-2 text-white/65">Основной в live</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="px-2 py-2 text-white/85">Проверка конфликтов</td>
                  <td className="px-2 py-2 text-white/65">Блокирующий слой</td>
                  <td className="px-2 py-2 text-white/65">Блокирующий</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="px-2 py-2 text-white/85">Ручные правки</td>
                  <td className="px-2 py-2 text-white/65">Вторичная панель</td>
                  <td className="px-2 py-2 text-white/65">Скрыто по умолчанию</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-[#0f1119]/95 p-4">
        <h3 className="text-sm font-semibold text-white">Рабочее пространство</h3>
        <div className="mt-3">
          {activeWorkspace === 'groups' ? (
            <>
              {currentStage === 'setup' && state ? (
                <GoRosterConfigPanel
                  tournamentId={tournamentId}
                  settings={state.settings}
                  teams={groups}
                  onSettingsUpdated={() => void loadState()}
                />
              ) : null}
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {groups.map((group) => (
                  <GoGroupStandings key={group.groupId} group={group} qualifyCount={qualifyCount} />
                ))}
                {groups.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/50">
                    Группы ещё не инициализированы.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {activeWorkspace === 'schedule' ? (
            <GoScheduleGrid
              tournamentId={tournamentId}
              matches={matches}
              courts={state?.courts ?? []}
              onMatchesChanged={setMatches}
            />
          ) : null}

          {activeWorkspace === 'bracket' ? (
            <div className="space-y-3">
              {seedDraft ? (
                <GoSeedEditor
                  initialDraft={seedDraft}
                  groups={groups}
                  onConfirm={(draft) => {
                    void runAction('confirm_bracket_seed', { seedDraft: draft });
                  }}
                />
              ) : null}
              <GoBracketView
                brackets={brackets}
                level={activeBracketLevel}
                onLevelChange={setActiveBracketLevel}
                matches={matches}
              />
            </div>
          ) : null}

          {activeWorkspace === 'courts' ? (
            <section className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <h4 className="mb-3 text-sm font-semibold text-white">PIN-коды кортов</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(state?.courts ?? []).map((court) => (
                    <div key={court.courtNo} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                      <div className="text-white/55">{court.label}</div>
                      <div className="mt-1 font-mono text-sm text-white">{court.pinCode}</div>
                      <a
                        href={`/court/${encodeURIComponent(court.pinCode)}`}
                        className="mt-1 inline-block text-orange-300 hover:text-orange-200"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть судью →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
              <GoCourtSlotsGrid tournamentId={tournamentId} genderFormat={state?.settings.teamGenderFormat} />
            </section>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-red-400/35 bg-red-500/12 p-4">
        <h3 className="text-sm font-semibold text-red-100">Опасная зона</h3>
        <p className="mt-1 text-xs text-red-100/85">Опасные действия требуют подтверждения вводом.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={selectedGroupForWalkover}
            onChange={(event) => setSelectedGroupForWalkover(event.target.value)}
            className="rounded-md border border-red-200/30 bg-red-900/20 px-2 py-1 text-white"
          >
            {groups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                Группа {group.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              setConfirmState({
                open: true,
                type: 'hard',
                title: 'Массовый вокловер',
                message: 'Обновляет все незавершённые матчи выбранной группы.',
                action: 'mass_walkover_group',
                expectedText: 'WO',
              })
            }
            disabled={!selectedGroupForWalkover || pending !== null || !actionAllowedByStage.mass_walkover_group}
            className="rounded-md border border-red-200/35 bg-red-500/20 px-3 py-1.5 font-semibold text-red-50 disabled:opacity-50"
          >
            Масс. ВО
          </button>
          <button
            type="button"
            onClick={() => void runAction('finish_group_stage')}
            disabled={pending !== null || !canFinishGroups}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            Завершить группы
          </button>
          <button
            type="button"
            onClick={() => void runAction('finish_bracket')}
            disabled={pending !== null || !canFinishBracket}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            Завершить турнир
          </button>
        </div>
      </section>

      {primaryAction.id !== 'none' ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0d111a]/95 p-3 md:hidden">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void runCockpitAction(primaryAction.id)}
            className="w-full rounded-lg border border-orange-300/55 bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-55"
          >
            {pending ? 'Выполняется…' : primaryAction.label}
          </button>
        </div>
      ) : null}

      {confirmState.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-4">
            <h3 className="text-lg font-bold text-white">{confirmState.title}</h3>
            <p className="mt-2 text-sm text-white/75">{confirmState.message}</p>
            {confirmState.expectedText ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-white/55">
                  Введите <span className="font-mono text-white">{confirmState.expectedText}</span> для подтверждения
                </p>
                <input
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  className="w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </div>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={Boolean(confirmState.expectedText) && confirmInput !== confirmState.expectedText}
                onClick={() => {
                  const action = confirmState.action;
                  setConfirmState({ open: false });
                  setConfirmInput('');
                  if (action === 'mass_walkover_group') {
                    void runAction('mass_walkover_group', { groupId: selectedGroupForWalkover });
                    return;
                  }
                  void runAction(action);
                }}
                className="rounded border border-red-300/40 bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-50 disabled:opacity-50"
              >
                Подтвердить
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmState({ open: false });
                  setConfirmInput('');
                }}
                className="rounded border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/80"
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
