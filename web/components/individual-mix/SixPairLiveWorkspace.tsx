'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IndividualMixLiveOfflineStore,
  IndividualMixOfflineStore,
  applyIndividualMixLiveCommand,
  buildIndividualMixRosterFingerprint,
  calculateIndividualMixPairStandings,
  calculateIndividualMixStandings,
  createIndividualMixLiveState,
  downloadIndividualMixJsonBackup,
  getIndividualMixActualLineup,
  getIndividualMixAllGames,
  getIndividualMixCurrentGame,
  getIndividualMixLiveGames,
  getIndividualMixLiveProgress,
  getIndividualMixPostseasonProgress,
  getIndividualMixRoundProgress,
  getIndividualMixSlotLabel,
  individualMixAdminScopeKey,
  type IndividualMixGame,
  type IndividualMixLiveCommand,
  type IndividualMixLiveConflict,
  type IndividualMixLiveQueuedCommand,
  type IndividualMixOfflineBundle,
  type IndividualMixPlayer,
  type IndividualMixSide,
} from '@/lib/individual-mix';
import type {
  IndividualMixAdminSessionView,
  IndividualMixLiveCommandEnvelope,
} from '@/lib/individual-mix/live-service';

type SyncStatus = 'loading' | 'synced' | 'pending' | 'conflict' | 'offline' | 'error' | 'demo';
type TechnicalKind = 'played' | 'walkover' | 'retirement';

type Props = {
  tournamentId: string;
  tournamentName?: string;
  initialPlayers: IndividualMixPlayer[];
  demoMode?: boolean;
};

class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getDeviceId(): string {
  const key = 'lpvolley-individual-mix-live-device-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = uuid();
  window.localStorage.setItem(key, id);
  return id;
}

function mergeConflictCurrent(
  current: Partial<IndividualMixAdminSessionView>,
  previous: IndividualMixAdminSessionView,
): IndividualMixAdminSessionView {
  return {
    ...previous,
    ...current,
    state: current.state ?? previous.state,
    courtAccess: current.courtAccess ?? previous.courtAccess,
    commands: current.commands ?? previous.commands,
    snapshots: current.snapshots ?? previous.snapshots,
    replacementCandidates: current.replacementCandidates ?? previous.replacementCandidates,
    devices: current.devices ?? previous.devices,
    rosterMatches: current.rosterMatches ?? previous.rosterMatches,
    currentRosterFingerprint: current.currentRosterFingerprint ?? previous.currentRosterFingerprint,
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

function resultTeamNames(session: IndividualMixAdminSessionView, game: IndividualMixGame, side: IndividualMixSide): string {
  const lineup = getIndividualMixActualLineup(session.state, game)[side];
  return lineup.map((player) => player.name).join(' + ');
}

function gameMode(game: IndividualMixGame): string {
  if (game.mode === 'own_pairs') return 'Свои пары';
  if (game.mode === 'partner_swap') return 'Смена партнёров';
  return 'Полная игра пара на пару';
}

function syncLabel(status: SyncStatus, pending: number): { label: string; className: string } {
  if (status === 'demo') return { label: 'Безопасный демо-черновик', className: 'border-violet-400/35 bg-violet-400/10 text-violet-100' };
  if (status === 'synced') return { label: 'Синхронизировано', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' };
  if (status === 'conflict') return { label: 'Конфликт — нужен разбор', className: 'border-red-400/40 bg-red-400/15 text-red-100' };
  if (status === 'pending') return { label: `${pending} ожидают отправки`, className: 'border-amber-400/35 bg-amber-400/10 text-amber-100' };
  if (status === 'offline') return { label: 'Офлайн · сервер не подтверждён', className: 'border-sky-400/30 bg-sky-400/10 text-sky-100' };
  if (status === 'error') return { label: 'Ошибка синхронизации', className: 'border-red-400/35 bg-red-400/10 text-red-100' };
  return { label: 'Проверяем сервер…', className: 'border-white/15 bg-white/5 text-text-secondary' };
}

function demoPlayers(): IndividualMixPlayer[] {
  const names = ['Анна', 'Мария', 'Елена', 'Ольга', 'Дарья', 'Юлия', 'Ирина', 'Наталья', 'Светлана', 'Алина', 'Виктория', 'Ксения'];
  return names.map((name, index) => ({ id: `demo-w${index + 1}`, name, gender: 'W', drawSeed: index + 1 }));
}

function createDemoSession(tournamentId: string, tournamentName: string, roster: IndividualMixPlayer[]): IndividualMixAdminSessionView {
  const state = createIndividualMixLiveState({ players: roster, scheduleRevision: uuid() });
  return {
    id: uuid(), tournamentId, tournamentName, revision: 0, status: 'active', state,
    rosterMatches: true, currentRosterFingerprint: state.rosterFingerprint, updatedAt: new Date().toISOString(),
    courtAccess: [], commands: [], snapshots: [], devices: [],
    replacementCandidates: Array.from({ length: 4 }, (_, index) => ({ id: `demo-sub-${index + 1}`, name: `Запасная ${index + 1}`, gender: 'W' as const })),
  };
}

export function SixPairLiveWorkspace({ tournamentId, tournamentName, initialPlayers, demoMode = false }: Props) {
  const store = useMemo(() => new IndividualMixLiveOfflineStore(), []);
  const legacyStore = useMemo(() => new IndividualMixOfflineStore(), []);
  const scopeKey = useMemo(() => individualMixAdminScopeKey(tournamentId), [tournamentId]);
  const endpoint = `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/individual-mix`;
  const commandEndpoint = `${endpoint}/commands`;
  const [session, setSession] = useState<IndividualMixAdminSessionView | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [pendingCount, setPendingCount] = useState(0);
  const [conflict, setConflict] = useState<IndividualMixLiveConflict | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [activeCourt, setActiveCourt] = useState<1 | 2>(1);
  const [winner, setWinner] = useState<IndividualMixSide | null>(null);
  const [loserScore, setLoserScore] = useState(0);
  const [technicalKind, setTechnicalKind] = useState<TechnicalKind>('played');
  const [technicalReason, setTechnicalReason] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offlineMaster, setOfflineMaster] = useState(false);
  const [legacyBundle, setLegacyBundle] = useState<IndividualMixOfflineBundle | null>(null);
  const [correctionGameId, setCorrectionGameId] = useState('');
  const [correctionLeft, setCorrectionLeft] = useState('11');
  const [correctionRight, setCorrectionRight] = useState('0');
  const [correctionReason, setCorrectionReason] = useState('');
  const [replacementSlot, setReplacementSlot] = useState('');
  const [replacementPlayer, setReplacementPlayer] = useState('');
  const [replacementReason, setReplacementReason] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');

  const saveSession = useCallback(async (next: IndividualMixAdminSessionView, nextConflict?: IndividualMixLiveConflict) => {
    setSession(next);
    await store.saveSession(scopeKey, next, nextConflict).catch(() => undefined);
  }, [scopeKey, store]);

  const loadServerSession = useCallback(async (): Promise<IndividualMixAdminSessionView> => {
    let response = await fetch(endpoint, { cache: 'no-store' });
    if (response.status === 404) response = await fetch(endpoint, { method: 'POST' });
    const data = await responseJson(response);
    if (!response.ok) throw new ApiFailure(response.status, String(data.code ?? 'load_failed'), String(data.error ?? 'Не удалось подготовить live-сессию.'));
    return data.session as unknown as IndividualMixAdminSessionView;
  }, [endpoint]);

  const refresh = useCallback(async (quiet = false, baseline: IndividualMixAdminSessionView | null = session) => {
    if (!quiet) setSyncStatus('loading');
    try {
      const server = await loadServerSession();
      const pending = await store.listCommands(scopeKey);
      setPendingCount(pending.length);
      if (pending.length && baseline && server.revision !== baseline.revision - pending.length) {
        const nextConflict: IndividualMixLiveConflict = {
          commandId: pending[0].commandId,
          code: 'server_changed_with_local_queue',
          message: 'Сервер изменился, пока на устройстве оставались неотправленные действия.',
          current: mergeConflictCurrent(server, baseline),
          detectedAt: new Date().toISOString(),
        };
        setConflict(nextConflict);
        setSyncStatus('conflict');
        await store.saveSession(scopeKey, baseline, nextConflict);
        return;
      }
      if (pending.length && baseline) {
        setSession(baseline);
        setConflict(null);
        setSyncStatus('pending');
        return;
      }
      setConflict(null);
      await saveSession(server);
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus(pending.length ? 'pending' : 'synced');
      setError('');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Сервер недоступен.';
      if (!baseline) {
        const cached = await store.loadSession(scopeKey).catch(() => null);
        if (cached) {
          setSession(cached.session as IndividualMixAdminSessionView);
          setConflict(cached.conflict ?? null);
        }
      }
      setError(message);
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
    }
  }, [loadServerSession, saveSession, scopeKey, session, store]);

  useEffect(() => {
    document.body.classList.add('individual-mix-workspace');
    if (demoMode) {
      const roster = initialPlayers.length === 12 ? initialPlayers : demoPlayers();
      setSession(createDemoSession(tournamentId, tournamentName || 'Безопасный демо-турнир', roster));
      setSyncStatus('demo');
      return () => document.body.classList.remove('individual-mix-workspace');
    }
    let cancelled = false;
    void (async () => {
      const cached = await store.loadSession(scopeKey).catch(() => null);
      const queued = await store.listCommands(scopeKey).catch(() => []);
      if (cancelled) return;
      if (cached) {
        setSession(cached.session as IndividualMixAdminSessionView);
        setConflict(cached.conflict ?? null);
      }
      setPendingCount(queued.length);
      setSyncStatus(cached?.conflict ? 'conflict' : queued.length ? 'pending' : 'loading');
      await refresh(true, cached?.session as IndividualMixAdminSessionView | null ?? null);
    })();
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/individual-mix-sw.js', { scope: '/admin/tournaments/' }).catch(() => undefined);
    }
    setOfflineMaster(window.localStorage.getItem('lpvolley-individual-mix-offline-master') === '1');
    return () => {
      cancelled = true;
      document.body.classList.remove('individual-mix-workspace');
    };
    // Initial hydration intentionally runs once per tournament scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, initialPlayers, scopeKey, store, tournamentId, tournamentName]);

  useEffect(() => {
    if (demoMode || !session || Object.keys(session.state.results).length > 0) return;
    void legacyStore.loadBundle(tournamentId).then((bundle) => {
      if (!bundle || !Object.keys(bundle.results).length || bundle.rulesVersion !== session.state.presetVersion) return;
      const oldPlayers = bundle.schedules[0]?.players ?? [];
      if (buildIndividualMixRosterFingerprint(oldPlayers, session.state.presetVersion) === session.state.rosterFingerprint) setLegacyBundle(bundle);
    }).catch(() => undefined);
  }, [demoMode, legacyStore, session, tournamentId]);

  const makeEnvelope = useCallback((current: IndividualMixAdminSessionView, command: IndividualMixLiveCommand, courtNo: number | null): IndividualMixLiveCommandEnvelope => ({
    commandId: uuid(),
    expectedRevision: current.revision,
    expectedScheduleRevision: current.state.scheduleRevision,
    deviceId: getDeviceId(),
    courtNo,
    command,
  }), []);

  const setRevisionConflict = useCallback(async (
    envelope: IndividualMixLiveCommandEnvelope,
    data: Record<string, unknown>,
    previous: IndividualMixAdminSessionView,
  ) => {
    const current = mergeConflictCurrent((data.current ?? {}) as Partial<IndividualMixAdminSessionView>, previous);
    const nextConflict: IndividualMixLiveConflict = {
      commandId: envelope.commandId,
      code: String(data.code ?? 'revision_conflict'),
      message: String(data.error ?? 'Конфликт серверной ревизии.'),
      current,
      detectedAt: new Date().toISOString(),
    };
    setConflict(nextConflict);
    setSyncStatus('conflict');
    await store.saveSession(scopeKey, previous, nextConflict);
  }, [scopeKey, store]);

  const dispatchCommand = useCallback(async (command: IndividualMixLiveCommand, courtNo: number | null) => {
    if (!session || busy || conflict) return false;
    setBusy(true);
    setError('');
    setNotice('');
    const envelope = makeEnvelope(session, command, courtNo);
    const queueable = !['rebuild_schedule', 'restore_snapshot', 'start_postseason', 'finalize', 'correct_score'].includes(command.type);
    try {
      if (demoMode) {
        if (command.type === 'rebuild_schedule' || command.type === 'restore_snapshot') {
          setError('Снимки проверяются только в серверной сессии, не в демо.');
          return false;
        }
        const actorKind = command.type === 'correct_score' ? 'admin' : 'operator';
        const nextState = applyIndividualMixLiveCommand(session.state, command, {
          commandId: envelope.commandId, actorKind, actorId: 'demo-operator', courtNo,
          now: new Date().toISOString(), nextRevision: session.revision + 1,
        });
        setSession({ ...session, revision: session.revision + 1, state: nextState, status: nextState.status, updatedAt: new Date().toISOString() });
        setSyncStatus('demo');
        setNotice('Демо-действие сохранено только в этом черновике.');
        return true;
      }
      if (!navigator.onLine || pendingCount > 0) throw new TypeError('offline-or-queued');
      const response = await fetch(commandEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      const data = await responseJson(response);
      if (response.status === 409) {
        await setRevisionConflict(envelope, data, session);
        return false;
      }
      if (!response.ok) throw new ApiFailure(response.status, String(data.code ?? 'command_failed'), String(data.error ?? 'Команда отклонена сервером.'));
      const next = data.session as unknown as IndividualMixAdminSessionView;
      await saveSession(next);
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('synced');
      setNotice(next.duplicateCommand ? 'Дублированная команда уже была сохранена сервером.' : 'Сервер подтвердил действие.');
      return true;
    } catch (commandError) {
      if (commandError instanceof ApiFailure) {
        setError(commandError.message);
        setSyncStatus('error');
        return false;
      }
      if (!queueable) {
        setError('Выбор финального этапа, аварийные действия, исправления и финализация требуют связи с сервером.');
        setSyncStatus('offline');
        return false;
      }
      if (!offlineMaster) {
        setError('Сервер недоступен. Включите режим «Офлайн-мастер» на операторском устройстве, чтобы продолжить ввод обоих кортов.');
        setSyncStatus('offline');
        return false;
      }
      try {
        const optimisticState = applyIndividualMixLiveCommand(session.state, command, {
          commandId: envelope.commandId,
          actorKind: 'offline_master',
          actorId: getDeviceId(),
          courtNo,
          now: new Date().toISOString(),
          nextRevision: session.revision + 1,
        });
        const optimistic = { ...session, revision: session.revision + 1, state: optimisticState, updatedAt: new Date().toISOString() };
        const queued: IndividualMixLiveQueuedCommand = {
          commandId: envelope.commandId,
          scopeKey,
          endpoint: commandEndpoint,
          tournamentId,
          envelope,
          queuedAt: new Date().toISOString(),
        };
        await store.queueCommand(queued);
        await saveSession(optimistic);
        const count = (await store.listCommands(scopeKey)).length;
        setPendingCount(count);
        setSyncStatus('pending');
        setNotice('Действие сохранено офлайн и ждёт отправки.');
        return true;
      } catch (offlineError) {
        setError(offlineError instanceof Error ? offlineError.message : 'Не удалось сохранить действие офлайн.');
        return false;
      }
    } finally {
      setBusy(false);
    }
  }, [busy, commandEndpoint, conflict, demoMode, makeEnvelope, offlineMaster, pendingCount, saveSession, scopeKey, session, setRevisionConflict, store, tournamentId]);

  const flushQueue = useCallback(async () => {
    if (demoMode || !session || conflict || busy || !navigator.onLine) return;
    const commands = await store.listCommands(scopeKey).catch(() => []);
    if (!commands.length) {
      setPendingCount(0);
      await refresh(true);
      return;
    }
    setBusy(true);
    setSyncStatus('pending');
    let latest = session;
    try {
      for (const queued of commands) {
        const response = await fetch(queued.endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(queued.envelope),
        });
        const data = await responseJson(response);
        if (response.status === 409) {
          await setRevisionConflict(queued.envelope, data, latest);
          return;
        }
        if (!response.ok) throw new ApiFailure(response.status, String(data.code ?? 'sync_failed'), String(data.error ?? 'Сервер отклонил действие из очереди.'));
        latest = data.session as unknown as IndividualMixAdminSessionView;
        await store.removeCommand(queued.commandId);
        setPendingCount((count) => Math.max(0, count - 1));
      }
      await saveSession(latest);
      setPendingCount(0);
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('synced');
      setNotice('Офлайн-очередь полностью отправлена.');
    } catch (flushError) {
      setError(flushError instanceof Error ? flushError.message : 'Не удалось отправить очередь.');
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      setBusy(false);
    }
  }, [busy, conflict, demoMode, refresh, saveSession, scopeKey, session, setRevisionConflict, store]);

  useEffect(() => {
    const online = () => { void flushQueue(); };
    const offline = () => setSyncStatus((current) => current === 'pending' || current === 'conflict' ? current : 'offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [flushQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!demoMode && navigator.onLine && pendingCount === 0 && !conflict && !busy) void refresh(true);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [busy, conflict, demoMode, pendingCount, refresh]);

  const acceptServerConflict = async () => {
    if (!conflict || !session) return;
    const queued = await store.listCommands(scopeKey);
    const backup = { localSession: session, queued, conflict };
    await store.saveBackup(tournamentId, 'Конфликт перед принятием сервера', backup);
    downloadIndividualMixJsonBackup(`individual-mix-conflict-${tournamentId}.json`, backup);
    await store.clearCommands(scopeKey);
    await saveSession(conflict.current as IndividualMixAdminSessionView);
    setConflict(null);
    setPendingCount(0);
    setSyncStatus('synced');
    setNotice('Серверная версия принята. Локальные команды сохранены в JSON для ручного разбора.');
  };

  const importLegacyResults = async () => {
    if (!legacyBundle || !session || busy || conflict) return;
    setBusy(true);
    setError('');
    const backup = { importedAt: new Date().toISOString(), bundle: legacyBundle };
    await store.saveBackup(tournamentId, 'До импорта старого IndexedDB', backup);
    downloadIndividualMixJsonBackup(`individual-mix-before-import-${tournamentId}.json`, backup);
    let current = session;
    try {
      const allGames = getIndividualMixLiveGames(current.state);
      const sendOldResult = async (game: IndividualMixGame) => {
        const old = legacyBundle.results[game.id];
        if (!old) return;
        const envelope = makeEnvelope(current, {
          type: 'record_score',
          payload: { gameId: game.id, leftScore: old.leftScore, rightScore: old.rightScore, kind: old.kind, reason: old.reason },
        }, game.courtNo);
        const response = await fetch(commandEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) });
        const data = await responseJson(response);
        if (!response.ok) throw new Error(String(data.error ?? `Импорт остановлен на ${game.shortCode}.`));
        current = data.session as unknown as IndividualMixAdminSessionView;
      };
      for (let roundNo = 1; roundNo <= 6; roundNo += 1) {
        const roundGames = allGames.filter((game) => game.roundNo === roundNo);
        const court1 = roundGames.filter((game) => game.courtNo === 1).sort((left, right) => left.duelNo - right.duelNo || left.gameNo - right.gameNo);
        const firstMissing = court1.findIndex((game) => !legacyBundle.results[game.id]);
        if (firstMissing >= 0 && court1.slice(firstMissing + 1).some((game) => legacyBundle.results[game.id])) {
          throw new Error(`В старых данных корта 1 есть пропуск внутри тура ${roundNo}. Импорт остановлен без догадок.`);
        }
        for (const game of court1.slice(0, firstMissing < 0 ? court1.length : firstMissing)) await sendOldResult(game);
        const court2 = roundGames.filter((game) => game.courtNo === 2).sort((left, right) => left.duelNo - right.duelNo || left.gameNo - right.gameNo);
        const firstCourt2Missing = court2.findIndex((game) => !legacyBundle.results[game.id]);
        if (firstCourt2Missing >= 0 && court2.slice(firstCourt2Missing + 1).some((game) => legacyBundle.results[game.id])) {
          throw new Error(`В старых данных корта 2 есть пропуск внутри тура ${roundNo}. Импорт остановлен без догадок.`);
        }
        for (const game of court2.slice(0, firstCourt2Missing < 0 ? court2.length : firstCourt2Missing)) await sendOldResult(game);
        const completedInRound = roundGames.filter((game) => legacyBundle.results[game.id]?.kind !== 'cancelled' && legacyBundle.results[game.id]).length;
        if (completedInRound < roundGames.length) {
          const laterExists = allGames.some((game) => game.roundNo > roundNo && legacyBundle.results[game.id]);
          if (laterExists) throw new Error(`В старых данных есть результаты после незавершённого тура ${roundNo}. Импорт остановлен без догадок.`);
          break;
        }
      }
      await saveSession(current);
      setLegacyBundle(null);
      setSyncStatus('synced');
      setNotice('Совместимые локальные результаты импортированы на сервер. JSON-копия сохранена.');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Не удалось импортировать локальные результаты.');
      await refresh(true);
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return <main className="mx-auto min-h-[70vh] w-full max-w-5xl px-3 py-8 sm:px-5"><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-text-secondary">Подготавливаем официальную серверную сессию…</p>{error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}<button type="button" onClick={() => void refresh()} className="mt-4 min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold">Повторить</button></div></main>;
  }

  const state = session.state;
  const regularGames = getIndividualMixLiveGames(state);
  const allGames = getIndividualMixAllGames(state);
  const pageRosterFingerprint = initialPlayers.length === 12 ? buildIndividualMixRosterFingerprint(initialPlayers, state.presetVersion) : 'invalid-page-roster';
  const rosterSafe = demoMode || (session.rosterMatches && pageRosterFingerprint === state.rosterFingerprint);
  const progress = getIndividualMixLiveProgress(state);
  const postseasonProgress = getIndividualMixPostseasonProgress(state);
  const pairStandings = state.postseason?.pairStandings ?? calculateIndividualMixPairStandings(state);
  const roundProgress = state.currentRound <= 6 ? getIndividualMixRoundProgress(state) : getIndividualMixRoundProgress(state, 6);
  const currentGame = getIndividualMixCurrentGame(state, activeCourt);
  const currentLineup = currentGame ? getIndividualMixActualLineup(state, currentGame) : null;
  const activeStageGames = state.currentRound <= 6
    ? regularGames.filter((game) => game.roundNo === state.currentRound)
    : state.postseason?.games.filter((game) => game.roundNo === state.currentRound) ?? [];
  const stageProgress = {
    total: activeStageGames.length,
    completed: activeStageGames.filter((game) => state.results[game.id] && state.results[game.id].kind !== 'cancelled').length,
    court1: {
      total: activeStageGames.filter((game) => game.courtNo === 1).length,
      completed: activeStageGames.filter((game) => game.courtNo === 1 && state.results[game.id] && state.results[game.id].kind !== 'cancelled').length,
    },
    court2: {
      total: activeStageGames.filter((game) => game.courtNo === 2).length,
      completed: activeStageGames.filter((game) => game.courtNo === 2 && state.results[game.id] && state.results[game.id].kind !== 'cancelled').length,
    },
  };
  const visibleStageProgress = state.currentRound <= 6 || !state.postseason ? roundProgress : stageProgress;
  const postseasonRequired = state.presetVersion.endsWith('-v2');
  const postseasonReady = !postseasonRequired || postseasonProgress.complete;
  const finalizeReady = progress.completed === progress.total
    && postseasonReady
    && pendingCount === 0
    && !conflict
    && progress.cancelled === 0
    && state.status !== 'finalized';
  const regularGameIds = new Set(regularGames.map((game) => game.id));
  const standings = calculateIndividualMixStandings({ schedule: state.schedule, results: Object.values(state.results).filter((result) => regularGameIds.has(result.gameId)) });
  const completedGames = allGames
    .filter((game) => state.results[game.id])
    .sort((left, right) => String(state.results[right.id].recordedAt).localeCompare(String(state.results[left.id].recordedAt)));
  const latestCourtGame = completedGames.find((game) => game.courtNo === activeCourt);
  const sync = syncLabel(syncStatus, pendingCount);
  const activeOccupantIds = new Set(state.schedule.players.map((player) => {
    const upcoming = allGames.find((game) => !state.results[game.id] && [game.left.maleId, game.left.femaleId, game.right.maleId, game.right.femaleId].includes(player.id));
    return upcoming ? getIndividualMixActualLineup(state, upcoming).left.concat(getIndividualMixActualLineup(state, upcoming).right).find((actual) => actual.slotPlayerId === player.id)?.playerId ?? player.id : player.id;
  }));
  const candidates = session.replacementCandidates.filter((candidate) => !activeOccupantIds.has(candidate.id));

  const submitScore = async () => {
    if (!currentGame || !winner) return;
    const ok = await dispatchCommand({
      type: 'record_score',
      payload: {
        gameId: currentGame.id,
        leftScore: winner === 'left' ? 11 : loserScore,
        rightScore: winner === 'right' ? 11 : loserScore,
        kind: technicalKind,
        reason: technicalKind === 'played' ? undefined : technicalReason,
      },
    }, activeCourt);
    if (ok) {
      setWinner(null);
      setLoserScore(0);
      setTechnicalKind('played');
      setTechnicalReason('');
    }
  };

  const submitCorrection = async () => {
    if (!correctionGameId) return;
    const ok = await dispatchCommand({
      type: 'correct_score',
      payload: {
        gameId: correctionGameId,
        leftScore: Number(correctionLeft),
        rightScore: Number(correctionRight),
        kind: 'admin_adjusted',
        reason: correctionReason,
      },
    }, null);
    if (ok) {
      setCorrectionGameId('');
      setCorrectionReason('');
    }
  };

  const submitReplacement = async () => {
    const candidate = candidates.find((item) => item.id === replacementPlayer);
    if (!replacementSlot || !candidate) return;
    const ok = await dispatchCommand({
      type: 'replace_player',
      payload: {
        slotPlayerId: replacementSlot,
        playerId: candidate.id,
        playerName: candidate.name,
        gender: candidate.gender,
        reason: replacementReason,
      },
    }, null);
    if (ok) {
      setReplacementSlot('');
      setReplacementPlayer('');
      setReplacementReason('');
    }
  };

  const startPostseason = async (mode: 'semifinals' | 'direct_medals') => {
    const label = mode === 'semifinals'
      ? 'провести два полуфинала, затем финал и матч за третье место'
      : 'сразу провести матчи за первое-второе и третье-четвёртое места';
    if (!window.confirm(`Зафиксировать вариант: ${label}? После первого результата изменить схему можно только через восстановление снимка.`)) return;
    await dispatchCommand({ type: 'start_postseason', payload: { mode } }, null);
  };

  return (
    <main className="individual-mix-live-surface mx-auto w-full max-w-6xl px-3 pb-28 pt-4 sm:px-5 md:pb-10">
      <header className="individual-mix-live-header rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,91,0,.12),rgba(14,18,28,.96)_42%)] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/admin/tournaments/${tournamentId}`} className="text-xs font-bold text-brand hover:underline">← К турниру</Link>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-brand">Бездельники · 6 пар · preset {state.presetVersion.endsWith('-v2') ? 'v2' : 'v1'}</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{tournamentName || session.tournamentName}</h1>
            <p className="mt-2 text-sm text-text-secondary">12 игроков · 6 пар · 2 корта · 6 туров · {progress.total} игр до 11</p>
            {demoMode ? <p className="mt-2 text-xs font-bold text-violet-200">Вымышленные игроки, сервер и рейтинг не изменяются.</p> : null}
          </div>
          <div className="text-right">
            <span className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-black ${sync.className}`}>{sync.label}</span>
            <p className="mt-2 text-[11px] text-text-secondary">Серверная ревизия {session.revision}{lastSyncedAt ? ` · ${new Date(lastSyncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          </div>
        </div>
      </header>

      {!rosterSafe ? <section className="mt-4 rounded-2xl border border-red-400/45 bg-red-500/10 p-4 text-sm text-red-100"><strong className="block text-base">Состав изменился после создания расписания</strong><p className="mt-1 leading-6">Старое расписание заблокировано: сохранённый fingerprint {state.rosterFingerprint}, текущий {session.currentRosterFingerprint}. Используйте пересоздание со снимком в аварийном блоке.</p></section> : null}

      {conflict ? <section className="mt-4 rounded-2xl border border-red-400/45 bg-red-500/10 p-4 text-sm text-red-100"><strong className="block text-base">Конфликт ревизий — автоперезапись запрещена</strong><p className="mt-1 leading-6">{conflict.message}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => downloadIndividualMixJsonBackup(`individual-mix-conflict-${tournamentId}.json`, { session, conflict })} className="min-h-11 rounded-xl border border-white/20 px-3 font-bold">Скачать обе версии</button><button type="button" onClick={() => void acceptServerConflict()} className="min-h-11 rounded-xl bg-red-500 px-3 font-black text-white">Сохранить JSON и принять сервер</button></div></section> : null}
      {legacyBundle ? <section className="mt-4 rounded-2xl border border-amber-400/35 bg-amber-400/10 p-4 text-sm text-amber-100"><strong className="block text-base">Найдены совместимые локальные результаты: {Object.keys(legacyBundle.results).length}</strong><p className="mt-1">Версия пресета и состав совпали. Перед импортом автоматически сохранится и скачается JSON-копия.</p><button type="button" disabled={busy} onClick={() => void importLegacyResults()} className="mt-3 min-h-11 rounded-xl bg-amber-400 px-4 font-black text-black disabled:opacity-50">Создать backup и импортировать</button></section> : null}
      {error ? <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
      {notice ? <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">{notice}</div> : null}

      <section className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_.6fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
<div><p className="text-[10px] font-black uppercase tracking-[.18em] text-brand">{state.currentRound <= 6 ? 'Активный тур' : state.postseason ? 'Финальный этап' : 'Основная часть завершена'}</p><h2 className="mt-1 text-3xl font-black">{state.currentRound <= 6 ? `${state.currentRound} из 6` : !state.postseason ? 'Выберите продолжение' : state.postseason.status === 'complete' ? 'Места разыграны' : state.currentRound === 7 && state.postseason.mode === 'semifinals' ? 'Полуфиналы' : state.currentRound === 8 ? 'Финал и 3-е место' : 'Матчи за места'}</h2></div>
            <div className="text-right"><p className="text-2xl font-black">{progress.completed}/{progress.total}</p><p className="text-xs text-text-secondary">официальных результатов</p></div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-brand transition-all" style={{ width: `${progress.total ? progress.completed / progress.total * 100 : 0}%` }} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([1, 2] as const).map((courtNo) => {
              const court = courtNo === 1 ? visibleStageProgress.court1 : visibleStageProgress.court2;
              const postseasonGame = activeStageGames.find((game) => game.courtNo === courtNo);
              return <button key={courtNo} type="button" onClick={() => { setActiveCourt(courtNo); setWinner(null); }} className={`min-h-20 rounded-2xl border p-3 text-left ${activeCourt === courtNo ? 'border-brand bg-brand/15' : 'border-white/10 bg-black/15'}`}><span className="block text-base font-black">Корт {courtNo} — {court.completed}/{court.total}</span><span className="mt-1 block text-xs text-text-secondary">{state.currentRound <= 6 ? courtNo === 1 ? '4 Thai-игры' : `${court.total} полные игры · смена партнёров` : postseasonGame?.shortCode ?? (state.postseason ? 'Ждём другой корт' : 'Ожидание выбора схемы')}</span></button>;
            })}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-[.14em] text-text-secondary">Офлайн-мастер</p>
          <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" checked={offlineMaster} onChange={(event) => { setOfflineMaster(event.target.checked); window.localStorage.setItem('lpvolley-individual-mix-offline-master', event.target.checked ? '1' : '0'); }} className="mt-1 size-5" /><span><strong className="block text-white">Оператор принимает оба корта</strong>Включайте только при долгом отключении. Команды останутся в очереди до сверки с сервером.</span></label>
          {pendingCount ? <button type="button" disabled={busy || Boolean(conflict)} onClick={() => void flushQueue()} className="mt-4 min-h-11 w-full rounded-xl bg-amber-400 px-3 text-sm font-black text-black disabled:opacity-50">Отправить очередь ({pendingCount})</button> : null}
        </div>
      </section>

      <section className="individual-mix-live-game-card mt-4 overflow-hidden rounded-3xl border border-brand/35 bg-[linear-gradient(150deg,rgba(255,91,0,.12),rgba(11,15,24,.97)_45%)]">
        <div className="border-b border-white/10 px-4 py-3 sm:px-6"><p className="text-xs font-black uppercase tracking-[.16em] text-brand">Корт {activeCourt} · {state.currentRound <= 6 ? `тур ${state.currentRound}` : state.postseason ? state.currentRound === 7 && state.postseason.mode === 'semifinals' ? 'полуфинал' : state.currentRound === 8 ? 'медальные матчи' : 'матчи за места' : 'ожидание выбора'}</p></div>
        {currentGame && currentLineup && rosterSafe ? <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">{gameMode(currentGame)}</h2><span className="rounded-full border border-white/15 px-3 py-1 text-xs">{currentGame.shortCode}</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(['left', 'right'] as const).map((side) => <button key={side} type="button" onClick={() => setWinner(side)} className={`min-h-28 rounded-2xl border p-4 text-left transition ${winner === side ? 'border-brand bg-brand text-white' : 'border-white/15 bg-white/5 hover:border-brand/60'}`}><span className="text-[10px] font-black uppercase tracking-[.15em] opacity-70">{side === 'left' ? 'Команда A' : 'Команда B'} · нажмите победителя</span><strong className="mt-2 block text-lg leading-6">{currentLineup[side].map((player) => player.name).join(' + ')}</strong></button>)}
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="text-sm font-bold">Очки проигравшей стороны: <strong className="text-brand">{loserScore}</strong><input type="range" min={0} max={10} value={loserScore} onChange={(event) => setLoserScore(Number(event.target.value))} className="mt-3 block w-full accent-[#ff5b00]" /></label>
            <div className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-11">{Array.from({ length: 11 }, (_, score) => <button key={score} type="button" onClick={() => setLoserScore(score)} className={`min-h-10 rounded-lg border text-sm font-black ${loserScore === score ? 'border-brand bg-brand text-white' : 'border-white/10 bg-white/5'}`}>{score}</button>)}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Тип результата<select value={technicalKind} onChange={(event) => setTechnicalKind(event.target.value as TechnicalKind)} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b111b] px-3"><option value="played">Сыграно</option><option value="walkover">Технический исход</option><option value="retirement">Остановка / травма</option></select></label>{technicalKind !== 'played' ? <label className="text-sm">Причина<input value={technicalReason} onChange={(event) => setTechnicalReason(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b111b] px-3" placeholder="Обязательно" /></label> : null}</div>
          </div>
          <button type="button" disabled={busy || !winner || Boolean(conflict) || (technicalKind !== 'played' && technicalReason.trim().length < 4)} onClick={() => void submitScore()} className="mt-4 min-h-14 w-full rounded-2xl bg-brand text-base font-black text-white shadow-[0_12px_30px_rgba(255,91,0,.25)] disabled:opacity-40">Сохранить {winner ? `${winner === 'left' ? '11' : loserScore}:${winner === 'right' ? '11' : loserScore}` : 'результат'}</button>
        </div> : <div className="p-6 text-center"><h2 className="text-xl font-black">{!rosterSafe ? 'Расписание заблокировано' : state.currentRound <= 6 ? activeCourt === 2 && roundProgress.court2.completed === roundProgress.court2.total ? 'Ждём корт 1' : 'На этом корте тур завершён' : !state.postseason ? 'Выберите финальный этап ниже' : state.postseason.status === 'complete' ? 'Финальный этап завершён' : 'Ждём другой корт'}</h2><p className="mt-2 text-sm text-text-secondary">{state.currentRound <= 6 ? `Следующий тур откроется только после всех ${roundProgress.total} результатов тура ${state.currentRound}.` : !state.postseason ? 'Посев зафиксируется по сумме показателей двух игроков каждой стартовой пары.' : state.postseason.status === 'complete' ? 'Проверьте очередь и конфликты перед финализацией.' : 'Следующая стадия откроется только после всех игр текущей стадии.'}</p></div>}
      </section>

      {latestCourtGame ? <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-text-secondary">Последний результат · корт {activeCourt}</p><p className="mt-1 font-black">{resultTeamNames(session, latestCourtGame, 'left')} <span className="text-brand">{state.results[latestCourtGame.id].leftScore}:{state.results[latestCourtGame.id].rightScore}</span> {resultTeamNames(session, latestCourtGame, 'right')}</p></div><button type="button" disabled={busy || Boolean(conflict)} onClick={() => void dispatchCommand({ type: 'undo_last', payload: { courtNo: activeCourt } }, activeCourt)} className="min-h-11 rounded-xl border border-amber-400/30 px-4 text-sm font-black text-amber-100 disabled:opacity-40">Отменить последнее действие корта</button></section> : null}

      {activeStageGames.length ? <section className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5"><h2 className="text-lg font-black">{state.currentRound <= 6 ? 'Игры только активного тура' : 'Игры текущей финальной стадии'}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{activeStageGames.map((game) => { const result = state.results[game.id]; return <div key={game.id} className={`rounded-xl border p-3 text-sm ${result ? result.kind === 'cancelled' ? 'border-red-400/30 bg-red-400/10' : 'border-emerald-400/20 bg-emerald-400/[.07]' : 'border-white/10 bg-black/15'}`}><div className="flex justify-between gap-2"><strong>Корт {game.courtNo} · {game.shortCode}</strong><span>{result ? `${result.leftScore}:${result.rightScore}` : 'ожидает'}</span></div><p className="mt-1 text-xs leading-5 text-text-secondary">{resultTeamNames(session, game, 'left')} — {resultTeamNames(session, game, 'right')}</p></div>; })}</div></section> : null}

      {progress.completed === progress.total && state.presetVersion.endsWith('-v2') ? (
        <section className="mt-4 rounded-3xl border border-amber-400/25 bg-[linear-gradient(145deg,rgba(251,191,36,.09),rgba(11,15,24,.98)_48%)] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">После основной части</p><h2 className="mt-1 text-xl font-black">Финальный этап пар</h2></div>
            <p className="text-xs text-text-secondary">Пара = Джедай + Падаван · сумма показателей обоих</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {pairStandings.slice(0, 4).map((pair) => <div key={pair.pairNo} className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><strong className="text-amber-200">Посев {pair.position}</strong><span className="text-xs text-text-secondary">Пара {pair.pairNo}</span></div><p className="mt-2 text-sm font-black leading-5">{pair.playerIds.map((playerId) => getIndividualMixSlotLabel(state, playerId)).join(' + ')}</p><p className="mt-2 text-[11px] text-text-secondary">+/− {pair.pointDiff > 0 ? '+' : ''}{pair.pointDiff} · побед {pair.wins} · очков {pair.pointsFor}</p></div>)}
          </div>
          {!state.postseason && state.status === 'active' ? (
            <div className="mt-5">
              <p className="text-sm font-black">Выберите один вариант. Посев и схема сохранятся в серверном журнале.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={busy || pendingCount !== 0 || Boolean(conflict) || progress.cancelled !== 0 || (!demoMode && syncStatus !== 'synced')} onClick={() => void startPostseason('semifinals')} className="min-h-24 rounded-2xl border border-amber-400/35 bg-amber-400/10 p-4 text-left disabled:opacity-40"><strong className="block text-base text-amber-100">Полуфиналы → финал</strong><span className="mt-1 block text-xs leading-5 text-text-secondary">1–4 и 2–3, затем финал за 1–2 и отдельная игра за 3–4 место. Всего 4 игры.</span></button>
                <button type="button" disabled={busy || pendingCount !== 0 || Boolean(conflict) || progress.cancelled !== 0 || (!demoMode && syncStatus !== 'synced')} onClick={() => void startPostseason('direct_medals')} className="min-h-24 rounded-2xl border border-sky-400/35 bg-sky-400/10 p-4 text-left disabled:opacity-40"><strong className="block text-base text-sky-100">Сразу матчи за места</strong><span className="mt-1 block text-xs leading-5 text-text-secondary">1–2 играют за первое место, 3–4 — за третье. Всего 2 игры.</span></button>
              </div>
              {pendingCount || conflict || (!demoMode && syncStatus !== 'synced') ? <p className="mt-3 text-xs text-amber-100">Перед выбором отправьте очередь, разрешите конфликт и дождитесь статуса «Синхронизировано».</p> : null}
            </div>
          ) : state.postseason ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{state.postseason.mode === 'semifinals' ? 'Полуфиналы → финал + 3-е место' : 'Прямые матчи 1–2 и 3–4'}</strong><span className="rounded-full border border-white/10 px-3 py-1 text-xs">{postseasonProgress.completed}/{postseasonProgress.total}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{state.postseason.games.map((game) => { const result = state.results[game.id]; return <div key={game.id} className="rounded-xl border border-white/10 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{game.shortCode} · корт {game.courtNo}</strong><span>{result ? `${result.leftScore}:${result.rightScore}` : 'ожидает'}</span></div><p className="mt-1 text-xs leading-5 text-text-secondary">{resultTeamNames(session, game, 'left')} — {resultTeamNames(session, game, 'right')}</p></div>; })}</div>
              {state.postseason.finalPairOrder ? <div className="mt-4"><p className="text-xs font-black uppercase tracking-[.14em] text-emerald-300">Итоговые места пар</p><ol className="mt-2 grid gap-2 sm:grid-cols-2">{state.postseason.finalPairOrder.map((pairNo, index) => { const pair = pairStandings.find((row) => row.pairNo === pairNo); return pair ? <li key={pairNo} className="rounded-xl bg-emerald-400/[.07] px-3 py-2 text-sm"><strong>{index + 1} место · пара {pairNo}</strong><span className="mt-1 block text-xs text-text-secondary">{pair.playerIds.map((playerId) => getIndividualMixSlotLabel(state, playerId)).join(' + ')}</span></li> : null; })}</ol></div> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-brand">Общий зачёт</p><h2 className="mt-1 text-xl font-black">Таблица +/−</h2></div><p className="text-xs text-text-secondary">Критерии: +/− → победы → набранные очки → стартовый жребий</p></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[.12em] text-text-secondary"><tr><th className="p-2">#</th><th className="p-2">Игровой слот</th><th className="p-2 text-right">И</th><th className="p-2 text-right">В</th><th className="p-2 text-right">Очки</th><th className="p-2 text-right">+/−</th><th className="p-2 text-right">Жребий</th></tr></thead><tbody>{standings.map((row) => <tr key={row.playerId} className="border-t border-white/8"><td className="p-2 font-black">{row.position}</td><td className="p-2"><strong>{getIndividualMixSlotLabel(state, row.playerId)}</strong>{state.replacements.some((entry) => entry.slotPlayerId === row.playerId) ? <span className="ml-2 rounded-full border border-amber-400/25 px-2 py-0.5 text-[10px] text-amber-100">без авто-бонуса</span> : null}</td><td className="p-2 text-right">{row.played}</td><td className="p-2 text-right">{row.wins}</td><td className="p-2 text-right">{row.pointsFor}</td><td className={`p-2 text-right font-black ${row.pointDiff > 0 ? 'text-emerald-300' : row.pointDiff < 0 ? 'text-red-300' : ''}`}>{row.pointDiff > 0 ? '+' : ''}{row.pointDiff}</td><td className="p-2 text-right">{row.drawSeed}</td></tr>)}</tbody></table></div>
      </section>

      <details className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <summary className="cursor-pointer text-lg font-black">Исправления, замены и журнал</summary>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 p-4"><h3 className="font-black">Исправить любой результат</h3><p className="mt-1 text-xs leading-5 text-text-secondary">Только администратор. Причина обязательна, прежняя версия останется в журнале.</p><div className="mt-3 grid gap-2"><select value={correctionGameId} onChange={(event) => { const id = event.target.value; setCorrectionGameId(id); const result = state.results[id]; if (result) { setCorrectionLeft(String(result.leftScore)); setCorrectionRight(String(result.rightScore)); } }} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3 text-sm"><option value="">Выберите сыгранную игру</option>{completedGames.map((game) => <option key={game.id} value={game.id}>{game.shortCode} · {state.results[game.id].leftScore}:{state.results[game.id].rightScore}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min={0} max={11} value={correctionLeft} onChange={(event) => setCorrectionLeft(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3" aria-label="Счёт команды A" /><input type="number" min={0} max={11} value={correctionRight} onChange={(event) => setCorrectionRight(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3" aria-label="Счёт команды B" /></div><input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3 text-sm" placeholder="Причина исправления" /><button type="button" disabled={busy || !correctionGameId || correctionReason.trim().length < 4} onClick={() => void submitCorrection()} className="min-h-11 rounded-xl border border-brand/50 bg-brand/10 font-black text-brand disabled:opacity-40">Сохранить исправление</button></div></section>
          <section className="rounded-2xl border border-white/10 p-4"><h3 className="font-black">Замена со следующей несыгранной игры</h3><p className="mt-1 text-xs leading-5 text-text-secondary">Зачёт продолжит слот A → B; история матча запишет фактически игравшего.</p><div className="mt-3 grid gap-2"><select value={replacementSlot} onChange={(event) => setReplacementSlot(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3 text-sm"><option value="">Кого заменить</option>{state.schedule.players.map((player) => <option key={player.id} value={player.id}>{getIndividualMixSlotLabel(state, player.id)}</option>)}</select><select value={replacementPlayer} onChange={(event) => setReplacementPlayer(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3 text-sm"><option value="">Новый игрок того же пола</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><input value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#0b111b] px-3 text-sm" placeholder="Причина замены" /><button type="button" disabled={busy || !replacementSlot || !replacementPlayer || replacementReason.trim().length < 4} onClick={() => void submitReplacement()} className="min-h-11 rounded-xl border border-amber-400/40 bg-amber-400/10 font-black text-amber-100 disabled:opacity-40">Подтвердить замену</button></div></section>
        </div>
        <section className="mt-4 rounded-2xl border border-white/10 p-4"><h3 className="font-black">История команд</h3><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{session.commands.length ? session.commands.map((command) => <div key={command.commandId} className="rounded-xl border border-white/8 bg-black/15 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>{command.type} · ревизия {command.appliedRevision}</strong><span>{new Date(command.createdAt).toLocaleString('ru-RU')}</span></div><p className="mt-1 text-text-secondary">{command.actorKind}:{command.actorId}{command.courtNo ? ` · корт ${command.courtNo}` : ''}{command.reason ? ` · ${command.reason}` : ''}</p></div>) : <p className="text-sm text-text-secondary">Команд пока нет.</p>}</div></section>
      </details>

      {!demoMode ? <details className="mt-4 rounded-3xl border border-sky-400/20 bg-sky-400/[.05] p-4 sm:p-5">
        <summary className="cursor-pointer text-lg font-black">Судейские устройства и PIN-ссылки</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{session.courtAccess.map((access) => <div key={access.courtNo} className="rounded-2xl border border-white/10 p-4"><strong>Корт {access.courtNo} · PIN {access.pin}</strong><p className="mt-1 text-xs text-text-secondary">{access.lastSeenAt ? `Был в сети ${new Date(access.lastSeenAt).toLocaleString('ru-RU')}` : 'Ещё не открывался'}</p><div className="mt-3 flex gap-2"><a href={access.judgeUrl} target="_blank" rel="noreferrer" className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-sky-500 px-3 text-sm font-black text-white">Открыть экран</a><button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${access.judgeUrl}`)} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-bold">Копировать</button></div></div>)}</div>{session.devices.length ? <p className="mt-4 text-xs text-text-secondary">Активные устройства по журналу: {session.devices.map((device) => `${device.deviceId.slice(0, 8)}… (${device.courtNo ? `корт ${device.courtNo}` : device.actorKind})`).join(', ')}</p> : null}</details> : null}

      <details className="mt-4 rounded-3xl border border-red-400/25 bg-red-400/[.05] p-4 sm:p-5">
        <summary className="cursor-pointer text-lg font-black text-red-100">Закрытый аварийный блок и финализация</summary><p className="mt-3 text-sm leading-6 text-text-secondary">Пересоздание и восстановление требуют роли администратора и связи с сервером. Перед пересозданием сервер автоматически сохраняет восстанавливаемый снимок.</p><input value={emergencyReason} onChange={(event) => setEmergencyReason(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b111b] px-3 text-sm" placeholder="Обязательная причина аварийного действия" /><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy || emergencyReason.trim().length < 4} onClick={() => { if (window.confirm('Создать снимок и пересоздать расписание из текущего состава?')) void dispatchCommand({ type: 'rebuild_schedule', payload: { reason: emergencyReason } }, null); }} className="min-h-12 rounded-xl border border-red-400/35 text-sm font-black text-red-100 disabled:opacity-40">Снимок + пересоздать расписание</button><button type="button" disabled={busy} onClick={() => downloadIndividualMixJsonBackup(`individual-mix-session-${tournamentId}-r${session.revision}.json`, session)} className="min-h-12 rounded-xl border border-white/15 text-sm font-black">Скачать JSON текущей версии</button></div>{session.snapshots.length ? <div className="mt-4 space-y-2">{session.snapshots.map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm"><div><strong>{snapshot.label}</strong><p className="text-xs text-text-secondary">{snapshot.reason} · {new Date(snapshot.createdAt).toLocaleString('ru-RU')}</p></div><button type="button" disabled={busy || emergencyReason.trim().length < 4} onClick={() => { if (window.confirm(`Восстановить снимок ревизии ${snapshot.sourceRevision}? Текущая версия тоже будет сохранена.`)) void dispatchCommand({ type: 'restore_snapshot', payload: { snapshotId: snapshot.id, reason: emergencyReason } }, null); }} className="min-h-10 rounded-lg border border-amber-400/30 px-3 font-bold text-amber-100 disabled:opacity-40">Вернуть версию</button></div>)}</div> : null}<div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[.06] p-4"><h3 className="font-black">Финализация</h3><p className="mt-1 text-xs leading-5 text-text-secondary">Нужно: основная часть {progress.total}/{progress.total}{postseasonRequired ? `, финальный этап ${postseasonProgress.total}/${postseasonProgress.total}` : ''}, очередь 0, конфликтов 0, отменённых без технического исхода 0. Слоты с заменой не получают автоматический рейтинговый бонус.</p><button type="button" disabled={busy || !finalizeReady} onClick={() => { if (window.confirm('Финализировать официальный результат? После этого ввод будет закрыт.')) void dispatchCommand({ type: 'finalize', payload: { clientQueueDepth: pendingCount, clientHasConflict: Boolean(conflict), reason: emergencyReason || undefined } }, null); }} className="mt-3 min-h-12 w-full rounded-xl bg-emerald-500 text-sm font-black text-white disabled:opacity-40">{state.status === 'finalized' ? 'Турнир финализирован' : !postseasonReady ? 'Сначала завершите финальный этап' : `Финализировать ${progress.completed}/${progress.total} + ${postseasonProgress.completed}/${postseasonProgress.total}`}</button></div>
      </details>
    </main>
  );
}
