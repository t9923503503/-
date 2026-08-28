'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IndividualMixLiveOfflineStore,
  applyIndividualMixLiveCommand,
  downloadIndividualMixJsonBackup,
  getIndividualMixActualLineup,
  getIndividualMixAllGames,
  getIndividualMixCurrentGame,
  getIndividualMixLiveProgress,
  getIndividualMixPostseasonProgress,
  getIndividualMixRoundProgress,
  individualMixJudgeScopeKey,
  type IndividualMixLiveCommand,
  type IndividualMixLiveQueuedCommand,
  type IndividualMixSide,
} from '@/lib/individual-mix';
import type {
  IndividualMixJudgeSessionView,
  IndividualMixLiveCommandEnvelope,
} from '@/lib/individual-mix/live-service';

type Props = { pin: string };
type Status = 'loading' | 'synced' | 'pending' | 'conflict' | 'offline' | 'error';

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deviceId(): string {
  const key = 'lpvolley-individual-mix-judge-device-id';
  const value = localStorage.getItem(key);
  if (value) return value;
  const next = uuid();
  localStorage.setItem(key, next);
  return next;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

function statusStyle(status: Status, pending: number): { text: string; className: string } {
  if (status === 'synced') return { text: 'Синхронизировано', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' };
  if (status === 'pending') return { text: `${pending} ждут отправки`, className: 'border-amber-400/35 bg-amber-400/10 text-amber-100' };
  if (status === 'conflict') return { text: 'Конфликт', className: 'border-red-400/40 bg-red-400/15 text-red-100' };
  if (status === 'offline') return { text: 'Офлайн', className: 'border-sky-400/30 bg-sky-400/10 text-sky-100' };
  if (status === 'error') return { text: 'Ошибка', className: 'border-red-400/30 bg-red-400/10 text-red-100' };
  return { text: 'Загрузка…', className: 'border-white/15 bg-white/5 text-white/60' };
}

export function IndividualMixJudgeWorkspace({ pin: rawPin }: Props) {
  const pin = rawPin.trim().toUpperCase();
  const endpoint = `/api/individual-mix/judge/${encodeURIComponent(pin)}`;
  const commandsEndpoint = `${endpoint}/commands`;
  const scopeKey = individualMixJudgeScopeKey(pin);
  const store = useMemo(() => new IndividualMixLiveOfflineStore(), []);
  const [session, setSession] = useState<IndividualMixJudgeSessionView | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [pending, setPending] = useState(0);
  const [serverConflict, setServerConflict] = useState<IndividualMixJudgeSessionView | null>(null);
  const [winner, setWinner] = useState<IndividualMixSide | null>(null);
  const [loserScore, setLoserScore] = useState(0);
  const [kind, setKind] = useState<'played' | 'walkover' | 'retirement'>('played');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const save = useCallback(async (next: IndividualMixJudgeSessionView) => {
    setSession(next);
    await store.saveSession(scopeKey, next).catch(() => undefined);
  }, [scopeKey, store]);

  const fetchServer = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const data = await json(response);
    if (!response.ok) throw new Error(String(data.error ?? 'Судейская сессия недоступна.'));
    return data.session as unknown as IndividualMixJudgeSessionView;
  }, [endpoint]);

  const refresh = useCallback(async (baseline: IndividualMixJudgeSessionView | null = session) => {
    try {
      const next = await fetchServer();
      const queued = await store.listCommands(scopeKey);
      if (queued.length && baseline && next.revision !== baseline.revision - queued.length) {
        setServerConflict(next);
        setStatus('conflict');
        setMessage('Сервер изменился при непустой локальной очереди. Позовите оператора.');
        return;
      }
      if (queued.length && baseline) {
        setSession(baseline);
        setPending(queued.length);
        setStatus('pending');
        return;
      }
      await save(next);
      setPending(queued.length);
      setStatus(queued.length ? 'pending' : 'synced');
      setMessage('');
    } catch (error) {
      setStatus(navigator.onLine ? 'error' : 'offline');
      setMessage(error instanceof Error ? error.message : 'Нет связи с сервером.');
    }
  }, [fetchServer, save, scopeKey, session, store]);

  useEffect(() => {
    document.body.classList.add('individual-mix-workspace');
    let cancelled = false;
    void (async () => {
      const cached = await store.loadSession(scopeKey).catch(() => null);
      const queued = await store.listCommands(scopeKey).catch(() => []);
      if (cancelled) return;
      if (cached) setSession(cached.session as IndividualMixJudgeSessionView);
      setPending(queued.length);
      setStatus(queued.length ? 'pending' : 'loading');
      await refresh(cached?.session as IndividualMixJudgeSessionView | null ?? null);
    })();
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/individual-mix-sw.js', { scope: '/individual-mix/' }).catch(() => undefined);
    return () => {
      cancelled = true;
      document.body.classList.remove('individual-mix-workspace');
    };
    // Hydrate once for this PIN.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, store]);

  const envelope = useCallback((current: IndividualMixJudgeSessionView, command: IndividualMixLiveCommand): IndividualMixLiveCommandEnvelope => ({
    commandId: uuid(),
    expectedRevision: current.revision,
    expectedScheduleRevision: current.state.scheduleRevision,
    deviceId: deviceId(),
    courtNo: current.courtNo,
    command,
  }), []);

  const dispatch = useCallback(async (command: IndividualMixLiveCommand) => {
    if (!session || busy || serverConflict) return false;
    setBusy(true);
    setMessage('');
    const nextEnvelope = envelope(session, command);
    try {
      if (!navigator.onLine || pending > 0) throw new TypeError('offline-or-queued');
      const response = await fetch(commandsEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextEnvelope) });
      const data = await json(response);
      if (response.status === 409) {
        const current = data.current as Partial<IndividualMixJudgeSessionView> | undefined;
        setServerConflict(current ? { ...session, ...current, state: current.state ?? session.state } : session);
        setStatus('conflict');
        setMessage(String(data.error ?? 'Конфликт серверной ревизии. Позовите оператора.'));
        return false;
      }
      if (!response.ok) {
        setStatus('error');
        setMessage(String(data.error ?? 'Сервер отклонил действие.'));
        return false;
      }
      await save(data.session as unknown as IndividualMixJudgeSessionView);
      setStatus('synced');
      setMessage('Результат подтверждён сервером.');
      return true;
    } catch {
      try {
        const optimisticState = applyIndividualMixLiveCommand(session.state, command, {
          commandId: nextEnvelope.commandId,
          actorKind: 'judge', actorId: `court-${session.courtNo}`, courtNo: session.courtNo,
          now: new Date().toISOString(), nextRevision: session.revision + 1,
        });
        const optimistic = { ...session, revision: session.revision + 1, state: optimisticState, updatedAt: new Date().toISOString() };
        const queued: IndividualMixLiveQueuedCommand = {
          commandId: nextEnvelope.commandId, scopeKey, endpoint: commandsEndpoint,
          tournamentId: session.tournamentId, pin, envelope: nextEnvelope, queuedAt: new Date().toISOString(),
        };
        await store.queueCommand(queued);
        await save(optimistic);
        const count = (await store.listCommands(scopeKey)).length;
        setPending(count);
        setStatus('pending');
        setMessage('Сохранено на этом устройстве. Не меняйте устройство до отправки.');
        return true;
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Не удалось сохранить офлайн.');
        return false;
      }
    } finally {
      setBusy(false);
    }
  }, [busy, commandsEndpoint, envelope, pending, pin, save, scopeKey, serverConflict, session, store]);

  const flush = useCallback(async () => {
    if (!session || busy || serverConflict || !navigator.onLine) return;
    const queued = await store.listCommands(scopeKey);
    if (!queued.length) return void refresh();
    setBusy(true);
    let latest = session;
    try {
      for (const item of queued) {
        const response = await fetch(item.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item.envelope) });
        const data = await json(response);
        if (response.status === 409) {
          const current = data.current as Partial<IndividualMixJudgeSessionView> | undefined;
          setServerConflict(current ? { ...latest, ...current, state: current.state ?? latest.state } : latest);
          setStatus('conflict');
          setMessage('Очередь конфликтует с сервером. Позовите оператора.');
          return;
        }
        if (!response.ok) throw new Error(String(data.error ?? 'Команда из очереди отклонена.'));
        latest = data.session as unknown as IndividualMixJudgeSessionView;
        await store.removeCommand(item.commandId);
      }
      await save(latest);
      setPending(0);
      setStatus('synced');
      setMessage('Очередь отправлена.');
    } catch (error) {
      setStatus(navigator.onLine ? 'error' : 'offline');
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить очередь.');
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, save, scopeKey, serverConflict, session, store]);

  useEffect(() => {
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (navigator.onLine && pending === 0 && !serverConflict && !busy) void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [busy, pending, refresh, serverConflict]);

  const acceptServer = async () => {
    if (!session || !serverConflict) return;
    const queue = await store.listCommands(scopeKey);
    downloadIndividualMixJsonBackup(`court-${session.courtNo}-conflict-${pin}.json`, { local: session, server: serverConflict, queue });
    await store.clearCommands(scopeKey);
    await save(serverConflict);
    setServerConflict(null);
    setPending(0);
    setStatus('synced');
    setMessage('Серверная версия принята, локальная сохранена в JSON. Сообщите оператору.');
  };

  if (!session) return <main className="mx-auto min-h-screen max-w-xl bg-[#080d15] p-4 text-white"><div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6"><h1 className="text-2xl font-black">Судейский экран</h1><p className="mt-3 text-sm text-white/60">Загружаем корт по PIN {pin}…</p>{message ? <p className="mt-3 text-sm text-red-200">{message}</p> : null}<button type="button" onClick={() => void refresh()} className="mt-4 min-h-12 rounded-xl border border-white/15 px-4 font-bold">Повторить</button></div></main>;

  const state = session.state;
  const current = getIndividualMixCurrentGame(state, session.courtNo);
  const lineup = current ? getIndividualMixActualLineup(state, current) : null;
  const progress = getIndividualMixLiveProgress(state);
  const postseasonProgress = getIndividualMixPostseasonProgress(state);
  const round = state.currentRound <= 6 ? getIndividualMixRoundProgress(state) : getIndividualMixRoundProgress(state, 6);
  const postseasonStageGames = state.currentRound > 6 ? state.postseason?.games.filter((game) => game.roundNo === state.currentRound) ?? [] : [];
  const postseasonCourtGames = postseasonStageGames.filter((game) => game.courtNo === session.courtNo);
  const courtProgress = state.currentRound <= 6
    ? session.courtNo === 1 ? round.court1 : round.court2
    : { completed: postseasonCourtGames.filter((game) => state.results[game.id] && state.results[game.id].kind !== 'cancelled').length, total: postseasonCourtGames.length };
  const lastGame = getIndividualMixAllGames(state).filter((game) => game.courtNo === session.courtNo && state.results[game.id]).sort((a, b) => state.results[b.id].recordedAt.localeCompare(state.results[a.id].recordedAt))[0];
  const badge = statusStyle(status, pending);

  const submit = async () => {
    if (!current || !winner) return;
    const ok = await dispatch({ type: 'record_score', payload: { gameId: current.id, leftScore: winner === 'left' ? 11 : loserScore, rightScore: winner === 'right' ? 11 : loserScore, kind, reason: kind === 'played' ? undefined : reason } });
    if (ok) { setWinner(null); setLoserScore(0); setKind('played'); setReason(''); }
  };

  return <main className="individual-mix-judge-surface mx-auto min-h-screen max-w-xl bg-[#080d15] px-3 pb-10 pt-3 text-white">
    <header className="individual-mix-judge-header rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,91,0,.16),rgba(12,17,27,.98)_50%)] p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#ff7a2e]">Бездельники · судья</p><h1 className="mt-1 text-2xl font-black">Корт {session.courtNo}</h1><p className="mt-1 text-xs text-white/60">{session.tournamentName} · PIN {pin}</p></div><span className={`rounded-full border px-3 py-2 text-[11px] font-black ${badge.className}`}>{badge.text}</span></div>
      <div className="mt-4 flex items-end justify-between"><div><span className="text-xs text-white/60">{state.currentRound <= 6 ? 'Тур' : state.postseason ? 'Финальный этап' : 'Ожидание'}</span><strong className="ml-2 text-2xl">{state.currentRound <= 6 ? state.currentRound : state.postseason?.status === 'complete' ? '✓' : state.postseason ? state.currentRound === 7 ? 'I' : 'II' : '…'}</strong></div><div className="text-right"><strong className="text-xl">{courtProgress.completed}/{courtProgress.total}</strong><p className="text-[10px] text-white/50">на корте · основа {progress.completed}/{progress.total}{state.postseason ? ` · финал ${postseasonProgress.completed}/${postseasonProgress.total}` : ''}</p></div></div>
    </header>
    {message ? <div className={`mt-3 rounded-xl border p-3 text-sm ${serverConflict ? 'border-red-400/35 bg-red-400/10 text-red-100' : 'border-white/10 bg-white/5 text-white/75'}`}>{message}</div> : null}
    {serverConflict ? <section className="mt-3 rounded-2xl border border-red-400/40 bg-red-400/10 p-4"><strong>Остановите ввод</strong><p className="mt-1 text-sm text-red-100/80">Не выбирайте победителя на другом устройстве. Позовите оператора для сверки.</p><button type="button" onClick={() => void acceptServer()} className="mt-3 min-h-12 w-full rounded-xl bg-red-500 font-black">Скачать JSON и принять сервер</button></section> : null}
    {pending ? <button type="button" disabled={busy || Boolean(serverConflict)} onClick={() => void flush()} className="mt-3 min-h-12 w-full rounded-xl bg-amber-400 font-black text-black disabled:opacity-40">Отправить очередь ({pending})</button> : null}
    <section className="mt-3 overflow-hidden rounded-3xl border border-[#ff6a18]/35 bg-white/[.04]">
      {current && lineup ? <div className="p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff7a2e]">Текущая игра</p><h2 className="mt-1 text-xl font-black">{current.mode === 'partner_swap' ? 'Смена партнёров' : current.mode === 'own_pairs' ? 'Свои пары' : 'Полная игра'}</h2></div><span className="text-xs text-white/50">{current.shortCode}</span></div>
        <div className="mt-4 grid gap-3">{(['left', 'right'] as const).map((side) => <button key={side} type="button" disabled={busy || Boolean(serverConflict)} onClick={() => setWinner(side)} className={`min-h-24 rounded-2xl border p-4 text-left ${winner === side ? 'border-[#ff6a18] bg-[#ff5b00]' : 'border-white/12 bg-white/[.04]'}`}><span className="text-[10px] font-black uppercase tracking-[.14em] opacity-65">{side === 'left' ? 'Команда A' : 'Команда B'} · победитель</span><strong className="mt-2 block text-lg">{lineup[side].map((player) => player.name).join(' + ')}</strong></button>)}</div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-sm font-bold">Проигравшие</span><strong className="text-2xl text-[#ff7a2e]">{loserScore}</strong></div><div className="mt-3 grid grid-cols-6 gap-1">{Array.from({ length: 11 }, (_, score) => <button key={score} type="button" onClick={() => setLoserScore(score)} className={`min-h-10 rounded-lg border font-black ${score === loserScore ? 'border-[#ff6a18] bg-[#ff5b00]' : 'border-white/10 bg-white/5'}`}>{score}</button>)}</div><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b111b] px-3"><option value="played">Сыграно</option><option value="walkover">Технический исход</option><option value="retirement">Остановка / травма</option></select>{kind !== 'played' ? <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b111b] px-3" placeholder="Причина обязательна" /> : null}</div>
        <button type="button" disabled={busy || !winner || Boolean(serverConflict) || (kind !== 'played' && reason.trim().length < 4)} onClick={() => void submit()} className="mt-4 min-h-16 w-full rounded-2xl bg-[#ff5b00] text-lg font-black disabled:opacity-40">Сохранить {winner ? `${winner === 'left' ? 11 : loserScore}:${winner === 'right' ? 11 : loserScore}` : 'результат'}</button>
      </div> : <div className="p-8 text-center"><div className="text-4xl">⏳</div><h2 className="mt-3 text-xl font-black">{state.currentRound <= 6 ? session.courtNo === 2 && courtProgress.completed === courtProgress.total ? 'Ждём корт 1' : 'Игры этого корта завершены' : !state.postseason ? 'Ждём выбор финального этапа' : state.postseason.status === 'complete' ? 'Финальный этап завершён' : 'Ждём другой корт'}</h2><p className="mt-2 text-sm leading-6 text-white/60">{state.currentRound <= 6 ? `Новый тур откроется только после всех ${round.total} результатов текущего тура.` : !state.postseason ? 'Оператор выберет полуфиналы или прямые матчи за места.' : state.postseason.status === 'complete' ? 'Все финальные результаты сохранены.' : 'Следующая стадия откроется после всех игр текущей стадии.'}</p></div>}
    </section>
    {lastGame ? <section className="mt-3 rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/50">Последний сохранённый</p><p className="mt-1 text-lg font-black">{state.results[lastGame.id].leftScore}:{state.results[lastGame.id].rightScore} · {lastGame.shortCode}</p><button type="button" disabled={busy || Boolean(serverConflict)} onClick={() => void dispatch({ type: 'undo_last', payload: {} })} className="mt-3 min-h-12 w-full rounded-xl border border-amber-400/35 font-black text-amber-100 disabled:opacity-40">Отменить последнее действие корта</button></section> : null}
    <p className="mt-4 text-center text-[11px] leading-5 text-white/40">Официальный источник — сервер. При офлайне не закрывайте экран до отправки очереди. При долгом отключении передайте ввод оператору в режиме офлайн-мастера.</p>
  </main>;
}
