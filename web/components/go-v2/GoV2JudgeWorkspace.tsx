'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  assessGoV2OfflineRebase,
  downloadGoV2ConflictBackup,
  GoV2OfflineStore,
  type GoV2OfflineConflict,
  type GoV2OfflineRemoteMatch,
  type GoV2OfflineSyncState,
  type GoV2QueuedCommand,
} from '@/lib/go-v2/client-offline';
import {
  buildGoV2JudgeCommandEnvelope,
  classifyGoV2JudgeHttpStatus,
  normalizeGoV2JudgeMatchRule,
  sendGoV2JudgeCommandWithRetry,
  validateGoV2JudgeFinish,
  validateGoV2JudgeSetClose,
  type GoV2JudgeCommandKind,
  type GoV2JudgeLiveScore,
} from '@/lib/go-v2/judge-client';
import type { MatchRule } from '@/lib/go-v2/core/types';

type JsonRecord = Record<string, unknown>;

type JudgeParticipant = {
  slotNo: number;
  entryId: string | null;
  displayName: string;
};

type JudgeMatch = {
  id: string;
  matchKey: string;
  playState: string;
  scheduleState: string;
  stageKey: string;
  stageType: string;
  tier: string | null;
  plannedStart: string | null;
  predictedStart: string | null;
  actualStart: string | null;
  commandVersion: number;
  liveScore: JsonRecord;
  matchRule: MatchRule;
  finishReviewRequired: boolean;
  participants: JudgeParticipant[];
};

type JudgeCourtState = {
  tournament: {
    id: string;
    name: string;
    date: string | null;
    lifecycleState: string;
    aggregateVersion: number;
  };
  court: { id: string; courtNo: number; label: string };
  grant: { id: string; deviceId: string; expiresAt: string };
  matches: JudgeMatch[];
};

type JudgeCommandRejection = {
  commandId: string;
  status: number;
  code: string;
  message: string;
};

type JudgeSendOutcome = 'sent' | 'retryable' | 'conflict' | 'authorization' | 'rejected';

const DEVICE_KEY = 'lpvolley:go-v2:judge-device-id';

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function makeId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'judge-server-render';
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = makeId('judge-web');
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

function normalizeState(value: unknown): JudgeCourtState | null {
  const root = asRecord(value);
  const tournament = asRecord(root.tournament);
  const court = asRecord(root.court);
  const grant = asRecord(root.grant);
  if (!tournament.id || !court.id || !grant.id) return null;
  return {
    tournament: {
      id: String(tournament.id),
      name: String(tournament.name ?? 'Турнир LPVolley'),
      date: tournament.date ? String(tournament.date) : null,
      lifecycleState: String(tournament.lifecycleState ?? ''),
      aggregateVersion: Number(tournament.aggregateVersion ?? 0),
    },
    court: {
      id: String(court.id),
      courtNo: Number(court.courtNo ?? 0),
      label: String(court.label ?? 'Корт'),
    },
    grant: {
      id: String(grant.id),
      deviceId: String(grant.deviceId ?? ''),
      expiresAt: String(grant.expiresAt ?? ''),
    },
    matches: Array.isArray(root.matches) ? root.matches.map((raw): JudgeMatch => {
      const match = asRecord(raw);
      return {
        id: String(match.id ?? ''),
        matchKey: String(match.matchKey ?? 'Матч'),
        playState: String(match.playState ?? 'pending'),
        scheduleState: String(match.scheduleState ?? 'planned'),
        stageKey: String(match.stageKey ?? ''),
        stageType: String(match.stageType ?? ''),
        tier: match.tier ? String(match.tier) : null,
        plannedStart: match.plannedStart ? String(match.plannedStart) : null,
        predictedStart: match.predictedStart ? String(match.predictedStart) : null,
        actualStart: match.actualStart ? String(match.actualStart) : null,
        commandVersion: Number(match.commandVersion ?? 0),
        liveScore: asRecord(match.liveScore),
        matchRule: normalizeGoV2JudgeMatchRule(match.matchRule),
        finishReviewRequired: match.finishReviewRequired === true,
        participants: Array.isArray(match.participants)
          ? match.participants.map((item) => {
              const participant = asRecord(item);
              return {
                slotNo: Number(participant.slotNo ?? 0),
                entryId: participant.entryId ? String(participant.entryId) : null,
                displayName: String(participant.displayName ?? 'Участник уточняется'),
              };
            })
          : [],
      };
    }) : [],
  };
}

function normalizeLiveScore(value: JsonRecord): GoV2JudgeLiveScore {
  const points = asRecord(value.points);
  const sets = Array.isArray(value.sets)
    ? value.sets.map((item) => {
        const set = asRecord(item);
        return { a: Math.max(0, Number(set.a ?? 0)), b: Math.max(0, Number(set.b ?? 0)) };
      })
    : [];
  return {
    currentSet: Math.max(1, Number(value.currentSet ?? sets.length + 1)),
    points: {
      a: Math.max(0, Number(points.a ?? value.pointsA ?? 0)),
      b: Math.max(0, Number(points.b ?? value.pointsB ?? 0)),
    },
    sets,
  };
}

function patchCourtMatch(
  current: JudgeCourtState,
  matchId: string,
  patch: Partial<JudgeMatch>,
): JudgeCourtState {
  return {
    ...current,
    matches: current.matches.map((match) => {
      if (match.id !== matchId) return match;
      if (patch.commandVersion != null && patch.commandVersion < match.commandVersion) return match;
      return { ...match, ...patch };
    }),
  };
}

function matchTime(match: JudgeMatch): string {
  const value = match.predictedStart ?? match.plannedStart;
  if (!value || !Number.isFinite(Date.parse(value))) return 'Время уточняется';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function stateLabel(state: GoV2OfflineSyncState): string {
  return {
    synced: 'Синхронизировано',
    pending: 'Отправка…',
    offline: 'Офлайн · команды сохранены',
    conflict: 'Конфликт журналов',
    authorization: 'Требуется переподключение',
    rejected: 'Команда отклонена',
    error: 'Ошибка синхронизации',
  }[state];
}

function matchRuleLabel(rule: MatchRule): string {
  if (rule.preset === 'single_21') return '1 партия до 21';
  if (rule.preset === 'best_of_3_15') return 'до 2 побед · партии до 15';
  return 'до 2 побед · 21 / 21 / 15';
}

function queuedCommandShape(command: GoV2QueuedCommand): {
  kind: string;
  matchId: string;
} {
  const envelope = asRecord(command.envelope);
  const body = asRecord(envelope.command);
  return { kind: String(body.type ?? 'unknown'), matchId: String(body.matchId ?? '') };
}

function commandLabel(kind: string): string {
  return {
    'match.start': 'Начать матч',
    'match.pause': 'Поставить на паузу',
    'match.resume': 'Продолжить матч',
    'score.replace': 'Заменить полный счёт',
    'match.finish.request': 'Отправить итог',
  }[kind] ?? kind;
}

function scoreLabel(match: JudgeMatch | null): string {
  if (!match) return 'матч отсутствует в снимке';
  const liveScore = normalizeLiveScore(match.liveScore);
  const sets = liveScore.sets.length
    ? liveScore.sets.map((set) => `${set.a}:${set.b}`).join(' · ')
    : 'партий нет';
  return `${sets}; текущий счёт ${liveScore.points.a}:${liveScore.points.b}`;
}

function remoteMatchForConflict(
  conflict: GoV2OfflineConflict<JudgeCourtState> | null,
  remoteState: JudgeCourtState | null,
): GoV2OfflineRemoteMatch | null {
  if (!conflict || !remoteState) return null;
  const conflictCommand = conflict.local.journal.find((command) => command.commandId === conflict.commandId);
  const matchId = conflictCommand ? queuedCommandShape(conflictCommand).matchId : '';
  const match = remoteState.matches.find((candidate) => candidate.id === matchId);
  return match ? { matchId: match.id, commandVersion: match.commandVersion, playState: match.playState } : null;
}

function JudgeMatchList({
  matches,
  selectedMatchId,
  onSelect,
}: {
  matches: JudgeMatch[];
  selectedMatchId: string;
  onSelect: (matchId: string) => void;
}) {
  if (!matches.length) {
    return <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-white/45">На этом корте пока нет опубликованных матчей.</p>;
  }
  return (
    <div className="space-y-2">
      {matches.map((match) => (
        <button key={match.id} type="button" onClick={() => onSelect(match.id)} className={`w-full rounded-xl border p-3 text-left ${match.id === selectedMatchId ? 'border-orange-400/60 bg-orange-500/10' : 'border-white/10 bg-black/20'}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-white/55">{matchTime(match)}</span><span className="text-[11px] uppercase text-white/40">{match.playState}</span></div>
          <p className="mt-2 truncate text-sm font-bold">{match.participants[0]?.displayName ?? 'Участник A'}</p>
          <p className="mt-1 truncate text-sm font-bold">{match.participants[1]?.displayName ?? 'Участник B'}</p>
        </button>
      ))}
    </div>
  );
}

export function GoV2JudgeWorkspace({ tournamentId }: { tournamentId: string }) {
  const store = useMemo(() => new GoV2OfflineStore(), []);
  const scopeKey = `judge:${tournamentId}`;
  const endpoint = `/api/go-v2/judge/tournaments/${encodeURIComponent(tournamentId)}`;
  const grantStorageKey = `lpvolley:go-v2:grant:${tournamentId}`;
  const [deviceId, setDeviceId] = useState('');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [courtState, setCourtState] = useState<JudgeCourtState | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [syncState, setSyncState] = useState<GoV2OfflineSyncState>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [conflict, setConflict] = useState<GoV2OfflineConflict<JudgeCourtState> | null>(null);
  const [rejection, setRejection] = useState<JudgeCommandRejection | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resolutionActor, setResolutionActor] = useState('');
  const [resolutionReason, setResolutionReason] = useState('');
  const [resolutionConfirmed, setResolutionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const sendInFlightRef = useRef(new Map<string, Promise<JudgeSendOutcome>>());
  const mobileMatchesRef = useRef<HTMLDetailsElement | null>(null);

  const selectedMatch = courtState?.matches.find((match) => match.id === selectedMatchId) ?? null;
  const score = useMemo(() => normalizeLiveScore(selectedMatch?.liveScore ?? {}), [selectedMatch?.liveScore]);
  const conflictRemoteState = useMemo(
    () => conflict ? normalizeState(conflict.remote.snapshot) : null,
    [conflict],
  );
  const conflictLocalState = useMemo(
    () => conflict?.local.snapshot?.payload ? normalizeState(conflict.local.snapshot.payload) : null,
    [conflict],
  );
  const conflictRemoteMatch = useMemo(
    () => remoteMatchForConflict(conflict, conflictRemoteState),
    [conflict, conflictRemoteState],
  );
  const conflictCommand = useMemo(
    () => conflict?.local.journal.find((command) => command.commandId === conflict.commandId) ?? null,
    [conflict],
  );
  const conflictMatchId = conflictCommand ? queuedCommandShape(conflictCommand).matchId : '';
  const conflictLocalMatch = conflictLocalState?.matches.find((match) => match.id === conflictMatchId) ?? null;
  const conflictRemoteJudgeMatch = conflictRemoteState?.matches.find((match) => match.id === conflictMatchId) ?? null;
  const rebaseAssessment = useMemo(
    () => conflict
      ? assessGoV2OfflineRebase(conflict.local.journal, conflict.commandId, conflictRemoteMatch)
      : null,
    [conflict, conflictRemoteMatch],
  );
  const conflictResolutionReady = Boolean(
    conflictRemoteState
    && resolutionActor.trim()
    && resolutionReason.trim().length >= 5
    && resolutionConfirmed,
  );
  const editingLocked = Boolean(conflict || rejection);

  useEffect(() => {
    document.body.classList.add('judge-workspace');
    return () => document.body.classList.remove('judge-workspace');
  }, []);

  const applyLocalMatch = useCallback((matchId: string, patch: Partial<JudgeMatch>) => {
    setCourtState((current) => {
      if (!current) return current;
      const next = patchCourtMatch(current, matchId, patch);
      // Persist optimistic commandVersion + score before returning control to
      // the judge. An offline reload must reconstruct the exact local journal,
      // otherwise a later whole-score replacement could erase queued points.
      void store.saveSnapshot(scopeKey, next.tournament.aggregateVersion, next).catch(() => undefined);
      return next;
    });
  }, [scopeKey, store]);

  const saveState = useCallback(async (next: JudgeCourtState) => {
    setCourtState(next);
    await store.saveSnapshot(scopeKey, next.tournament.aggregateVersion, next).catch(() => undefined);
  }, [scopeKey, store]);

  const requireRePair = useCallback((message: string) => {
    window.sessionStorage.removeItem(grantStorageKey);
    setToken('');
    setSyncState('authorization');
    setError(`${message} Подключите устройство к корту заново.`);
  }, [grantStorageKey]);

  const loadCourt = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!deviceId || !token) return;
    if (!options.silent) setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${endpoint}/court`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-go-v2-device-id': deviceId,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        requireRePair(String(asRecord(payload).error ?? 'Токен корта недействителен или истёк.'));
        return;
      }
      if (!response.ok) throw new Error(String(asRecord(payload).error ?? 'Доступ к корту не подтверждён'));
      const next = normalizeState(payload);
      if (!next) throw new Error('Сервер вернул неполное состояние корта');
      const queue = await store.listCommands(scopeKey);
      const cached = queue.length ? await store.loadSnapshot<JudgeCourtState>(scopeKey).catch(() => null) : null;
      const normalizedCached = cached?.payload ? normalizeState(cached.payload) : null;
      const visibleState = normalizedCached ?? next;
      if (normalizedCached) setCourtState(normalizedCached);
      else await saveState(next);
      setPendingCount(queue.length);
      setSyncState(queue.length ? 'pending' : 'synced');
      setError('');
      if (!selectedMatchId || !visibleState.matches.some((match) => match.id === selectedMatchId)) {
        const preferred = visibleState.matches.find((match) => ['live', 'paused'].includes(match.playState))
          ?? visibleState.matches.find((match) => ['ready', 'pending'].includes(match.playState))
          ?? visibleState.matches[0];
        setSelectedMatchId(preferred?.id ?? '');
      }
      if (queue.length) queueMicrotask(() => void flushRef.current());
    } catch (reason) {
      const cached = await store.loadSnapshot<JudgeCourtState>(scopeKey).catch(() => null);
      const normalizedCached = cached?.payload ? normalizeState(cached.payload) : null;
      if (normalizedCached) setCourtState(normalizedCached);
      setSyncState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      setError(reason instanceof Error ? reason.message : 'Не удалось получить состояние корта');
    } finally {
      window.clearTimeout(timeout);
      if (!options.silent) setBusy(false);
    }
  }, [deviceId, endpoint, requireRePair, saveState, scopeKey, selectedMatchId, store, token]);

  const sendQueuedCommandRaw = useCallback(async (queued: GoV2QueuedCommand): Promise<JudgeSendOutcome> => {
    try {
      const { response, payload } = await sendGoV2JudgeCommandWithRetry({
        endpoint: queued.endpoint,
        token,
        envelope: queued.envelope,
        timeoutMs: 8_000,
        maxAttempts: 2,
      });
      const classification = classifyGoV2JudgeHttpStatus(response.status);
      if (classification === 'authorization') {
        requireRePair(String(payload.error ?? 'Судейский доступ отозван или больше не относится к этому корту.'));
        return 'authorization';
      }
      if (classification === 'conflict') {
        let server: unknown = payload;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 5_000);
        try {
          const stateResponse = await fetch(`${endpoint}/court`, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, 'x-go-v2-device-id': deviceId },
          });
          if (stateResponse.ok) server = await stateResponse.json();
        } catch {
          // Preserve the original conflict response when the network drops again.
        } finally {
          window.clearTimeout(timeout);
        }
        const [journal, cachedSnapshot] = await Promise.all([
          store.listCommands(scopeKey).catch(() => [queued]),
          store.loadSnapshot<JudgeCourtState>(scopeKey).catch(() => null),
        ]);
        const remoteSnapshot = normalizeState(server);
        const queuedMatchId = queuedCommandShape(queued).matchId;
        const remoteMatch = remoteSnapshot?.matches.find((match) => match.id === queuedMatchId) ?? null;
        const nextConflict: GoV2OfflineConflict<JudgeCourtState> = {
          scopeKey,
          commandId: queued.commandId,
          detectedAt: new Date().toISOString(),
          code: String(payload.code ?? 'JUDGE_COMMAND_VERSION_CONFLICT'),
          message: String(payload.error ?? 'Серверное состояние изменилось на другом устройстве.'),
          local: { journal, snapshot: cachedSnapshot },
          remote: {
            snapshot: remoteSnapshot ?? (asRecord(server) as unknown as JudgeCourtState),
            version: remoteMatch?.commandVersion ?? Number(payload.currentVersion ?? -1),
            snapshotVersion: remoteSnapshot?.tournament.aggregateVersion ?? -1,
            receivedAt: new Date().toISOString(),
          },
        };
        await store.saveConflict(nextConflict);
        setConflict(nextConflict);
        setSyncState('conflict');
        return 'conflict';
      }
      if (classification === 'rejected') {
        const nextRejection: JudgeCommandRejection = {
          commandId: queued.commandId,
          status: response.status,
          code: String(payload.code ?? 'JUDGE_COMMAND_REJECTED'),
          message: String(payload.error ?? 'Команда нарушает правила матча и не была применена.'),
        };
        setRejection(nextRejection);
        setError(`${nextRejection.message} Команда сохранена локально; дальнейшее редактирование остановлено.`);
        setSyncState('rejected');
        return 'rejected';
      }
      if (!response.ok) {
        setError(String(payload.error ?? `Сервер временно недоступен (${response.status}). Команда сохранена.`));
        setSyncState('error');
        return 'retryable';
      }
      await store.removeCommand(queued.commandId);
      const matchId = String(payload.matchId ?? '');
      if (matchId) {
        applyLocalMatch(matchId, {
          commandVersion: Number(payload.resultingVersion ?? queued.expectedVersion + 1),
          playState: String(payload.playState ?? 'live'),
          liveScore: asRecord(payload.liveScore),
          finishReviewRequired: payload.finishReviewRequired === true,
        });
      }
      return 'sent';
    } catch (reason) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncState('offline');
        return 'retryable';
      }
      setError(reason instanceof Error ? reason.message : 'Команда сохранена, но не отправлена');
      setSyncState('error');
      return 'retryable';
    }
  }, [applyLocalMatch, deviceId, endpoint, requireRePair, scopeKey, store, token]);

  const sendQueuedCommand = useCallback((queued: GoV2QueuedCommand): Promise<JudgeSendOutcome> => {
    const current = sendInFlightRef.current.get(queued.commandId);
    if (current) return current;
    const running = sendQueuedCommandRaw(queued).finally(() => {
      if (sendInFlightRef.current.get(queued.commandId) === running) {
        sendInFlightRef.current.delete(queued.commandId);
      }
    });
    sendInFlightRef.current.set(queued.commandId, running);
    return running;
  }, [sendQueuedCommandRaw]);

  const flushQueue = useCallback(async () => {
    if (flushInFlightRef.current) return flushInFlightRef.current;
    if (!token || conflict || rejection || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const running = (async () => {
      setSyncState('pending');
      const queued = await store.listCommands(scopeKey).catch(() => []);
      setPendingCount(queued.length);
      for (const command of queued) {
        const outcome = await sendQueuedCommand(command);
        if (outcome !== 'sent') return;
        setPendingCount((current) => Math.max(0, current - 1));
      }
      setSyncState('synced');
      await loadCourt({ silent: true });
    })();
    flushInFlightRef.current = running;
    try {
      await running;
    } finally {
      if (flushInFlightRef.current === running) flushInFlightRef.current = null;
    }
  }, [conflict, loadCourt, rejection, scopeKey, sendQueuedCommand, store, token]);

  useEffect(() => { flushRef.current = flushQueue; }, [flushQueue]);

  useEffect(() => {
    const nextDeviceId = getOrCreateDeviceId();
    setDeviceId(nextDeviceId);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const pendingRaw = window.sessionStorage.getItem('lpvolley:go-v2:pending-grant');
    window.sessionStorage.removeItem('lpvolley:go-v2:pending-grant');
    const pending = (() => {
      try { return asRecord(pendingRaw ? JSON.parse(pendingRaw) : null); } catch { return {}; }
    })();
    const fragmentToken = String(pending.token ?? fragment.get('token') ?? '');
    const fragmentDevice = String(pending.device ?? fragment.get('device') ?? '');
    // Clear the fragment before any validation branch so a mismatched-device
    // link can never linger in browser history or third-party telemetry.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (fragmentDevice && fragmentDevice !== nextDeviceId) {
      setError('Эта ссылка выпущена для другого устройства. Передайте администратору код устройства с этого экрана.');
    } else if (fragmentToken) {
      window.sessionStorage.setItem(grantStorageKey, fragmentToken);
      setToken(fragmentToken);
    } else {
      setToken(window.sessionStorage.getItem(grantStorageKey) ?? '');
    }
    void navigator.serviceWorker?.register('/go-v2-sw.js').catch(() => undefined);
    void store.loadConflict<JudgeCourtState>(scopeKey).then((saved) => {
      if (saved) {
        setConflict(saved);
        setSyncState('conflict');
      }
    }).catch(() => undefined);
  }, [grantStorageKey, scopeKey, store]);

  useEffect(() => {
    if (!deviceId || !token) return;
    void loadCourt();
  }, [deviceId, loadCourt, token]);

  useEffect(() => {
    const handleOnline = () => void flushRef.current();
    const handleOffline = () => setSyncState('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const timer = window.setInterval(() => {
      if (!conflict && !rejection && document.visibilityState === 'visible') void flushRef.current();
    }, 15_000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(timer);
    };
  }, [conflict, rejection]);

  async function queueJudgeCommand(kind: GoV2JudgeCommandKind, payload: JsonRecord = {}) {
    if (!selectedMatch || !courtState || !deviceId || !token || editingLocked || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const commandId = makeId('judge');
    try {
      const envelope = await buildGoV2JudgeCommandEnvelope({
        tournamentId,
        commandId,
        expectedVersion: selectedMatch.commandVersion,
        deviceId,
        kind,
        matchId: selectedMatch.id,
        payload,
      });
      const optimistic: Partial<JudgeMatch> = { commandVersion: selectedMatch.commandVersion + 1 };
      if (kind === 'match.start' || kind === 'match.resume') optimistic.playState = 'live';
      if (kind === 'match.pause') optimistic.playState = 'paused';
      if (kind === 'score.replace') optimistic.liveScore = asRecord(payload.liveScore);
      if (kind === 'match.finish.request') optimistic.finishReviewRequired = true;
      const optimisticState = patchCourtMatch(courtState, selectedMatch.id, optimistic);
      const queued: GoV2QueuedCommand = {
        commandId,
        scopeKey,
        endpoint: `${endpoint}/commands`,
        method: 'POST',
        envelope,
        expectedVersion: selectedMatch.commandVersion,
        queuedAt: new Date().toISOString(),
      };
      await store.queueCommandAndSaveSnapshot(
        queued,
        optimisticState.tournament.aggregateVersion,
        optimisticState,
      );
      setCourtState(optimisticState);
      setPendingCount((current) => current + 1);
      const outcome = await sendQueuedCommand(queued);
      if (outcome === 'sent') {
        setPendingCount((current) => Math.max(0, current - 1));
        setSyncState('synced');
        setNotice(kind === 'match.finish.request' ? 'Результат отправлен директору на подтверждение.' : 'Команда принята сервером.');
      } else if (outcome === 'retryable') {
        setNotice('Команда сохранена на устройстве и будет повторена с тем же ID после восстановления подтверждения сервера.');
      }
    } catch (reason) {
      setSyncState('error');
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить команду');
    } finally {
      setBusy(false);
    }
  }

  function updatePoint(side: 'a' | 'b', delta: number) {
    const next: GoV2JudgeLiveScore = {
      ...score,
      points: { ...score.points, [side]: Math.max(0, score.points[side] + delta) },
    };
    void queueJudgeCommand('score.replace', { liveScore: next });
  }

  function closeCurrentSet() {
    if (!selectedMatch) return;
    const validation = validateGoV2JudgeSetClose(score, selectedMatch.matchRule);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    const next: GoV2JudgeLiveScore = {
      currentSet: score.currentSet + 1,
      points: { a: 0, b: 0 },
      sets: [...score.sets, score.points],
    };
    void queueJudgeCommand('score.replace', { liveScore: next });
  }

  function requestFinish() {
    if (!selectedMatch) return;
    const validation = validateGoV2JudgeFinish(score, selectedMatch.matchRule);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    void queueJudgeCommand('match.finish.request', { liveScore: score });
  }

  async function acceptToken() {
    const normalized = tokenInput.trim();
    if (normalized.length < 32) {
      setError('Вставьте полный одноразово выданный токен корта.');
      return;
    }
    window.sessionStorage.setItem(grantStorageKey, normalized);
    setToken(normalized);
    setTokenInput('');
  }

  function resetConflictResolutionForm() {
    setResolutionReason('');
    setResolutionConfirmed(false);
  }

  async function refreshConflictRemoteSnapshot() {
    if (!conflict || !deviceId || !token) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${endpoint}/court`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'x-go-v2-device-id': deviceId },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(asRecord(payload).error ?? 'Не удалось обновить серверный снимок.'));
      const remoteSnapshot = normalizeState(payload);
      if (!remoteSnapshot) throw new Error('Сервер вернул неполный снимок корта.');
      const queued = conflict.local.journal.find((command) => command.commandId === conflict.commandId);
      const matchId = queued ? queuedCommandShape(queued).matchId : '';
      const remoteMatch = remoteSnapshot.matches.find((match) => match.id === matchId) ?? null;
      const nextConflict: GoV2OfflineConflict<JudgeCourtState> = {
        ...conflict,
        remote: {
          snapshot: remoteSnapshot,
          version: remoteMatch?.commandVersion ?? remoteSnapshot.tournament.aggregateVersion,
          snapshotVersion: remoteSnapshot.tournament.aggregateVersion,
          receivedAt: new Date().toISOString(),
        },
      };
      await store.saveConflict(nextConflict);
      setConflict(nextConflict);
      setNotice('Серверный снимок обновлён. Сравните версии и выберите решение вручную.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось обновить серверный снимок.');
    } finally {
      setBusy(false);
    }
  }

  async function discardLocalJournal() {
    if (!conflict || !conflictRemoteState) {
      setError('Сначала получите полный серверный снимок корта.');
      return;
    }
    if (!resolutionConfirmed) {
      setError('Подтвердите, что сравнили локальную и серверную версии.');
      return;
    }
    const commandIds = conflict.local.journal
      .filter((command) => (command.status ?? 'pending') === 'pending')
      .map((command) => command.commandId);
    if (!window.confirm(`Принять серверную версию и пометить discarded ${commandIds.length} локальных команд?`)) return;
    setBusy(true);
    setError('');
    try {
      await store.discardConflict({
        scopeKey,
        conflictCommandId: conflict.commandId,
        commandIds,
        remoteSnapshot: conflictRemoteState,
        remoteVersion: conflictRemoteMatch?.commandVersion
          ?? Math.max(conflict.remote.version, conflictRemoteState.tournament.aggregateVersion),
        remoteSnapshotVersion: conflictRemoteState.tournament.aggregateVersion,
        identity: {
          actorId: resolutionActor,
          deviceId,
          reason: resolutionReason,
        },
      });
      setCourtState(conflictRemoteState);
      if (!conflictRemoteState.matches.some((match) => match.id === selectedMatchId)) {
        setSelectedMatchId(conflictRemoteState.matches[0]?.id ?? '');
      }
      setConflict(null);
      setPendingCount(0);
      setSyncState('synced');
      resetConflictResolutionForm();
      setNotice('Серверная версия принята. Локальные команды сохранены в журнале со статусом discarded.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Discard не выполнен.');
    } finally {
      setBusy(false);
    }
  }

  async function rebaseLocalIntent() {
    if (!conflict || !conflictRemoteState || !conflictRemoteMatch || !rebaseAssessment?.safe) {
      setError(rebaseAssessment && !rebaseAssessment.safe
        ? rebaseAssessment.message
        : 'Безопасный rebase для этой команды недоступен.');
      return;
    }
    if (!resolutionConfirmed) {
      setError('Подтвердите, что сравнили локальную и серверную версии.');
      return;
    }
    if (!window.confirm('Создать новую intent-команду поверх показанной серверной версии? Счёт не будет перенесён.')) return;
    setBusy(true);
    setError('');
    const commandId = makeId('judge-rebase');
    try {
      const envelope = await buildGoV2JudgeCommandEnvelope({
        tournamentId,
        commandId,
        expectedVersion: rebaseAssessment.expectedVersion,
        deviceId,
        kind: rebaseAssessment.kind,
        matchId: rebaseAssessment.matchId,
        payload: rebaseAssessment.payload,
      });
      const optimisticPatch: Partial<JudgeMatch> = {
        commandVersion: rebaseAssessment.expectedVersion + 1,
        playState: rebaseAssessment.kind === 'match.pause' ? 'paused' : 'live',
      };
      const optimisticState = patchCourtMatch(
        conflictRemoteState,
        rebaseAssessment.matchId,
        optimisticPatch,
      );
      const replacement: GoV2QueuedCommand = {
        commandId,
        scopeKey,
        endpoint: `${endpoint}/commands`,
        method: 'POST',
        envelope,
        expectedVersion: rebaseAssessment.expectedVersion,
        queuedAt: new Date().toISOString(),
      };
      await store.rebaseConflict({
        scopeKey,
        conflictCommandId: conflict.commandId,
        originalJournal: conflict.local.journal,
        remoteMatch: conflictRemoteMatch,
        remoteSnapshot: conflictRemoteState,
        remoteSnapshotVersion: conflictRemoteState.tournament.aggregateVersion,
        replacement,
        replacementSnapshot: optimisticState,
        identity: {
          actorId: resolutionActor,
          deviceId,
          reason: resolutionReason,
        },
      });
      setCourtState(optimisticState);
      setConflict(null);
      setPendingCount(1);
      setSyncState('pending');
      resetConflictResolutionForm();
      const outcome = await sendQueuedCommand(replacement);
      if (outcome === 'sent') {
        setPendingCount(0);
        setSyncState('synced');
        setNotice('Новая intent-команда принята. Старый commandId сохранён со статусом rebased.');
      } else if (outcome === 'retryable') {
        setNotice('Новая rebase-команда сохранена и будет повторена с новым commandId после восстановления связи.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Rebase не выполнен.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadRejectedJournal() {
    const [commands, snapshot] = await Promise.all([
      store.listCommands(scopeKey).catch(() => []),
      store.loadSnapshot<JudgeCourtState>(scopeKey).catch(() => null),
    ]);
    downloadGoV2ConflictBackup(
      `go-v2-rejected-${rejection?.commandId ?? 'journal'}.json`,
      { detectedAt: new Date().toISOString(), rejection, local: { commands, snapshot } },
    );
  }

  async function discardRejectedJournal() {
    if (!window.confirm('Сохранить копию и удалить весь локальный журнал отклонённой правки?')) return;
    await downloadRejectedJournal();
    await store.clearCommands(scopeKey);
    setRejection(null);
    setPendingCount(0);
    setSyncState('synced');
    setError('');
    await loadCourt();
  }

  if (!token) {
    return (
      <main
        className="go-v2-judge-surface mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-5 px-4 py-10 text-white"
        style={{
          paddingTop: 'max(2.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="rounded-3xl border border-white/10 bg-[#111722] p-5 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">Tournament Engine V2</p>
          <h1 className="mt-3 text-3xl font-black">Подключение судьи</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">Передайте администратору код устройства. Он назначит этому устройству один корт и выдаст временный токен.</p>
          <div className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-sky-100/60">Код устройства</p>
            <code className="mt-2 block break-all text-sm font-bold text-sky-50">{deviceId || 'создаётся…'}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(deviceId)} className="mt-3 min-h-11 rounded-xl border border-sky-300/30 px-4 text-sm font-semibold">Копировать код</button>
          </div>
          <label className="mt-5 block text-sm font-semibold text-white/75">Токен корта
            <textarea value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} rows={3} autoCapitalize="none" autoCorrect="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-3 font-mono text-xs text-white" placeholder="Вставьте токен или откройте ссылку администратора" />
          </label>
          <button type="button" onClick={() => void acceptToken()} className="mt-3 min-h-12 w-full rounded-xl bg-orange-500 px-4 font-bold">Подключить к корту</button>
          {error ? <p role="alert" className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
        </div>
        <Link href={`/calendar/${encodeURIComponent(tournamentId)}/live`} className="text-center text-sm text-white/55 underline underline-offset-4">Открыть публичный live-экран</Link>
      </main>
    );
  }

  return (
    <main
      className="go-v2-judge-surface mx-auto min-h-[100dvh] max-w-5xl px-3 py-3 text-white sm:px-5 sm:py-5"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <header className="rounded-2xl border border-white/10 bg-[#111722] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">{courtState?.court.label ?? 'Корт'}</p>
            <h1 className="mt-1 text-2xl font-black">{courtState?.tournament.name ?? 'LPVolley V2'}</h1>
            <p className="mt-1 text-xs text-white/45">Устройство: {deviceId.slice(0, 18)}… · доступ до {courtState?.grant.expiresAt ? new Date(courtState.grant.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
          </div>
          <div role="status" aria-live="polite" className={`rounded-full border px-3 py-2 text-xs font-bold ${['conflict', 'authorization', 'rejected', 'error'].includes(syncState) ? 'border-red-400/35 bg-red-500/10 text-red-100' : syncState === 'offline' ? 'border-amber-300/35 bg-amber-400/10 text-amber-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'}`}>
            {stateLabel(syncState)}{pendingCount ? ` · ${pendingCount}` : ''}
          </div>
        </div>
      </header>

      {conflict ? (
        <section role="alert" className="mt-3 rounded-2xl border-2 border-red-400/50 bg-red-950/60 p-4">
          <h2 className="text-lg font-black text-red-100">Редактирование заблокировано: split-brain</h2>
          <p className="mt-2 text-sm leading-6 text-red-100/75">{conflict.message} Автоматического объединения и last-write-wins нет. Сначала сравните версии, затем явно выберите rebase либо discard.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-amber-200/25 bg-black/20 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-200/70">Локально · не подтверждено</p>
              <p className="mt-2 text-sm font-bold">Версия матча: {conflictLocalMatch?.commandVersion ?? '—'}</p>
              <p className="mt-1 text-xs leading-5 text-white/65">{scoreLabel(conflictLocalMatch)}</p>
              <ul className="mt-3 space-y-2">
                {conflict.local.journal.map((command) => {
                  const shape = queuedCommandShape(command);
                  return (
                    <li key={command.commandId} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                      <span className="font-bold text-white">{commandLabel(shape.kind)}</span>
                      <span className="mt-1 block text-white/55">v{command.expectedVersion} · {new Date(command.queuedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <code className="mt-1 block break-all text-[10px] text-white/40">{command.commandId}</code>
                    </li>
                  );
                })}
              </ul>
            </article>

            <article className="rounded-xl border border-sky-300/30 bg-sky-950/30 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-200/70">Сервер · подтверждено</p>
              {conflictRemoteState ? (
                <>
                  <p className="mt-2 text-sm font-bold">Версия матча: {conflictRemoteMatch?.commandVersion ?? conflict.remote.version}</p>
                  <p className="mt-1 text-xs leading-5 text-white/65">Состояние: {conflictRemoteJudgeMatch?.playState ?? 'матч отсутствует'} · {scoreLabel(conflictRemoteJudgeMatch)}</p>
                  <p className="mt-2 text-[11px] text-white/45">Снимок получен {new Date(conflict.remote.receivedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-6 text-red-100">Полный серверный снимок не получен. Решения заблокированы.</p>
              )}
              <button type="button" onClick={() => void refreshConflictRemoteSnapshot()} disabled={busy} className="mt-3 min-h-11 w-full rounded-xl border border-sky-200/30 px-3 text-sm font-bold disabled:opacity-40">Обновить серверный снимок</button>
            </article>
          </div>

          <div className={`mt-3 rounded-xl border p-3 text-sm leading-6 ${rebaseAssessment?.safe ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-200/25 bg-amber-500/10 text-amber-100'}`}>
            {rebaseAssessment?.safe
              ? `Допустим безопасный rebase intent «${commandLabel(rebaseAssessment.kind)}». Будут созданы новые commandId, requestHash и expectedVersion ${rebaseAssessment.expectedVersion}; счёт не переносится.`
              : `Rebase заблокирован: ${rebaseAssessment?.message ?? 'нет точного серверного снимка'}`}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-red-50">Оператор, принимающий решение
              <input value={resolutionActor} onChange={(event) => setResolutionActor(event.target.value)} autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" placeholder="Имя или служебный ID" />
            </label>
            <label className="text-sm font-semibold text-red-50">Причина
              <input value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" placeholder="Что проверено и почему" />
            </label>
          </div>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-5 text-white/80">
            <input type="checkbox" checked={resolutionConfirmed} onChange={(event) => setResolutionConfirmed(event.target.checked)} className="mt-0.5 size-5 shrink-0" />
            <span>Я сравнил локальный журнал и серверный снимок. Понимаю, что discard не переносит локальный счёт, а rebase повторяет только безопасную intent-команду.</span>
          </label>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => downloadGoV2ConflictBackup(`go-v2-conflict-${conflict.commandId}.json`, conflict)} className="min-h-12 rounded-xl border border-red-300/35 px-4 text-sm font-bold">Скачать обе версии</button>
            <button type="button" onClick={() => void discardLocalJournal()} disabled={busy || !conflictResolutionReady} className="min-h-12 rounded-xl border border-red-300/40 bg-red-500/20 px-4 text-sm font-bold disabled:opacity-35">Принять сервер · discard</button>
            <button type="button" onClick={() => void rebaseLocalIntent()} disabled={busy || !conflictResolutionReady || !rebaseAssessment?.safe} className="min-h-12 rounded-xl bg-emerald-500 px-4 text-sm font-black text-slate-950 disabled:opacity-35">Rebase intent-команды</button>
          </div>
        </section>
      ) : null}

      {rejection ? (
        <section role="alert" className="mt-3 rounded-2xl border-2 border-amber-300/45 bg-amber-950/55 p-4">
          <h2 className="text-lg font-black text-amber-100">Команда отклонена · редактирование остановлено</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/75">{rejection.message} Код: {rejection.code}, HTTP {rejection.status}. Локальный журнал не удалён и не помечен как офлайн.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void downloadRejectedJournal()} className="min-h-11 rounded-xl border border-amber-200/35 px-4 text-sm font-bold">Скачать журнал</button>
            <button type="button" onClick={() => void discardRejectedJournal()} className="min-h-11 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950">Копия + отменить локальный журнал</button>
          </div>
        </section>
      ) : null}

      {error ? <p role="alert" className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</p> : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="order-2 rounded-2xl border border-white/10 bg-[#111722] p-3 lg:order-1">
          <details ref={mobileMatchesRef} className="group lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 font-bold [&::-webkit-details-marker]:hidden">
              <span>Другие матчи корта · {courtState?.matches.length ?? 0}</span>
              <span aria-hidden="true" className="text-white/45 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="mt-2 border-t border-white/10 pt-3">
              <button type="button" onClick={() => void loadCourt()} disabled={busy} className="mb-3 min-h-11 w-full rounded-xl border border-white/15 px-3 text-sm font-semibold disabled:opacity-50">Обновить список</button>
              <JudgeMatchList
                matches={courtState?.matches ?? []}
                selectedMatchId={selectedMatchId}
                onSelect={(matchId) => {
                  setSelectedMatchId(matchId);
                  if (mobileMatchesRef.current) mobileMatchesRef.current.open = false;
                  window.scrollTo({ top: 0 });
                }}
              />
            </div>
          </details>
          <div className="hidden lg:block">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <h2 className="text-sm font-bold">Матчи корта</h2>
              <button type="button" onClick={() => void loadCourt()} disabled={busy} className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold disabled:opacity-50">Обновить</button>
            </div>
            <JudgeMatchList matches={courtState?.matches ?? []} selectedMatchId={selectedMatchId} onSelect={setSelectedMatchId} />
          </div>
        </aside>

        <section className="order-1 rounded-2xl border border-white/10 bg-[#111722] p-4 sm:p-5 lg:order-2">
          {selectedMatch ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs uppercase tracking-wide text-white/45">{selectedMatch.matchKey} · {selectedMatch.tier ?? selectedMatch.stageKey}</p><h2 className="mt-1 text-xl font-black">{matchTime(selectedMatch)}</h2><p className="mt-1 text-xs text-white/50">{matchRuleLabel(selectedMatch.matchRule)}</p></div>
                <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold uppercase">{selectedMatch.playState}</span>
              </div>

              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_80px] gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                {(['a', 'b'] as const).map((side, index) => (
                  <div key={side} className="contents">
                    <div className="flex min-h-20 items-center rounded-2xl border border-white/10 bg-black/20 px-4 text-lg font-black">{selectedMatch.participants[index]?.displayName ?? `Участник ${side.toUpperCase()}`}</div>
                    <div className="flex min-h-20 items-center justify-center rounded-2xl bg-white text-4xl font-black text-slate-950">{score.points[side]}</div>
                    <div className="col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr]">
                      <button type="button" onClick={() => updatePoint(side, 1)} disabled={busy || editingLocked || !['live', 'paused'].includes(selectedMatch.playState)} className="min-h-14 rounded-xl bg-emerald-500 text-lg font-black disabled:opacity-35">+1 · {selectedMatch.participants[index]?.displayName ?? side.toUpperCase()}</button>
                      <button type="button" onClick={() => updatePoint(side, -1)} disabled={busy || editingLocked || !['live', 'paused'].includes(selectedMatch.playState) || score.points[side] === 0} className="min-h-14 rounded-xl border border-white/15 text-base font-bold disabled:opacity-35">Отменить −1</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                <span className="font-bold text-white">Партии:</span> {score.sets.length ? score.sets.map((set) => `${set.a}:${set.b}`).join(' · ') : 'ещё нет'} · текущая {score.currentSet}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {['pending', 'ready'].includes(selectedMatch.playState) ? <button type="button" onClick={() => void queueJudgeCommand('match.start')} disabled={busy || editingLocked} className="min-h-12 rounded-xl bg-orange-500 px-4 font-black disabled:opacity-40">Начать матч</button> : null}
                {selectedMatch.playState === 'live' ? <button type="button" onClick={() => void queueJudgeCommand('match.pause')} disabled={busy || editingLocked} className="min-h-12 rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 font-bold text-amber-100 disabled:opacity-40">Пауза</button> : null}
                {selectedMatch.playState === 'paused' ? <button type="button" onClick={() => void queueJudgeCommand('match.resume')} disabled={busy || editingLocked} className="min-h-12 rounded-xl bg-sky-500 px-4 font-bold disabled:opacity-40">Продолжить</button> : null}
                {['live', 'paused'].includes(selectedMatch.playState) ? <button type="button" onClick={closeCurrentSet} disabled={busy || editingLocked} className="min-h-12 rounded-xl border border-white/20 px-4 font-bold disabled:opacity-40">Завершить партию</button> : null}
                {['live', 'paused'].includes(selectedMatch.playState) ? <button type="button" onClick={requestFinish} disabled={busy || editingLocked || selectedMatch.finishReviewRequired} className="min-h-12 rounded-xl bg-emerald-500 px-4 font-black disabled:opacity-40">{selectedMatch.finishReviewRequired ? 'Ожидает директора' : 'Отправить финал'}</button> : null}
              </div>
              <p className="mt-4 text-xs leading-5 text-white/40">Judge-экран отправляет live-журнал. Итоговый спортивный результат и технические решения подтверждает директор турнира через impact preview.</p>
            </>
          ) : <p className="py-16 text-center text-sm text-white/45">Выберите матч слева.</p>}
        </section>
      </div>
    </main>
  );
}
