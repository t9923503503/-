'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QuickWinnerScoreInput,
  type QuickWinnerScoreMember,
} from '@/components/QuickWinnerScoreInput';
import PlayGameFlowSteps from '@/components/play/PlayGameFlowSteps';
import { PLAY_KING_POINT_LIMIT } from '@/lib/play-result-core';
import {
  canCompleteKingRound,
  chooseFreshLiveTeams,
  getCurrentKingRound,
  type PlayLiveCommand,
  type PlayLiveSessionView,
  type PlayLiveState,
} from '@/lib/play-live-core';

interface LiveParticipant {
  resultKey: number;
  name: string;
  avatarUrl?: string | null;
  registered?: boolean;
}

type KotyaraPollOption = { id: string; title: string; startsAt: string; goingCount: number; maybeCount: number };

function liveResultPayload(state: PlayLiveState) {
  return state.format === 'king_sideout'
    ? { version: 2, format: state.format, pairingMode: state.pairingMode, pointLimit: PLAY_KING_POINT_LIMIT, matches: [], rounds: state.rounds, roundDurationMinutes: state.roundDurationMinutes }
    : { version: 2, format: state.format, pairingMode: state.pairingMode, pointLimit: state.pointLimit, matches: state.matches };
}

export default function PlayLiveSessionPanel({
  postId,
  participants,
  canStart,
  canSubmit,
  endsAt,
  initialSession,
  focusMode = false,
  postCompleted = false,
}: {
  postId: string;
  participants: LiveParticipant[];
  canStart: boolean;
  canSubmit: boolean;
  endsAt: string;
  initialSession?: PlayLiveSessionView | null;
  focusMode?: boolean;
  postCompleted?: boolean;
}) {
  const router = useRouter();
  const hasInitialSession = initialSession !== undefined;
  const [session, setSession] = useState<PlayLiveSessionView | null>(initialSession ?? null);
  const [loading, setLoading] = useState(!hasInitialSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(true);
  const [courtMode, setCourtMode] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [kotyaraPolls, setKotyaraPolls] = useState<KotyaraPollOption[]>([]);
  const [kotyaraPollId, setKotyaraPollId] = useState('');
  const names = useMemo(() => new Map(participants.map((participant) => [participant.resultKey, participant.name])), [participants]);
  const participantVisuals = useMemo(() => new Map<number, QuickWinnerScoreMember>(participants.map((participant) => [
    participant.resultKey,
    { name: participant.name, avatarUrl: participant.avatarUrl, registered: participant.registered },
  ])), [participants]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/play-posts/${postId}/session`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (response.ok) setSession(data || null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!hasInitialSession) void load();
  }, [hasInitialSession, load]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!online || !session) return;
    const pendingKey = `lp-play-pending:${session.id}`;
    const raw = localStorage.getItem(pendingKey);
    if (!raw) return;
    void fetch(`/api/play-sessions/${session.id}/commands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        localStorage.removeItem(pendingKey);
        setSession(data as PlayLiveSessionView);
        setNotice('Отложенное действие отправлено после восстановления сети');
      } else if (response.status === 409) {
        localStorage.removeItem(pendingKey);
        await load();
        setError('Игра успела измениться с другого устройства — проверьте последнее действие');
      }
    }).catch(() => undefined);
  }, [online, session, load]);

  useEffect(() => {
    if (!canStart) return;
    const controller = new AbortController();
    void fetch(`/api/play-posts/${postId}/kotyara-poll`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ([]));
        if (!response.ok) return;
        const polls = Array.isArray(data) ? data as KotyaraPollOption[] : [];
        setKotyaraPolls(polls);
        setKotyaraPollId((current) => current || polls[0]?.id || '');
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [canStart, postId]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/play-posts/${postId}/session/start`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось запустить live-режим');
      const started = data as PlayLiveSessionView;
      setSession(started);
      await prepareFirstPairs(started);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  async function prepareFirstPairs(started: PlayLiveSessionView) {
    if (started.state.format !== 'classic_2x2' || !started.state.matches[0]) return;
    const match = started.state.matches[0];
    const response = await fetch(`/api/play-posts/${postId}/pairing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fresh', selectedResultKeys: [...match.teamA, ...match.teamB] }),
    });
    const pairs = await response.json().catch(() => ({}));
    if (!response.ok) return;
    await sendCommand(started, { type: 'set_match_teams', matchId: match.id, teamA: pairs.teamA, teamB: pairs.teamB });
  }

  async function importKotyaraAndStart() {
    if (!kotyaraPollId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const importedResponse = await fetch(`/api/play-posts/${postId}/kotyara-poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: kotyaraPollId }),
      });
      const imported = await importedResponse.json().catch(() => ({}));
      if (!importedResponse.ok) throw new Error(imported.error || 'Не удалось забрать состав из Котяры');
      const startResponse = await fetch(`/api/play-posts/${postId}/session/start`, { method: 'POST' });
      const started = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok) throw new Error(started.error || 'Состав добавлен, но live-режим не запустился');
      setSession(started as PlayLiveSessionView);
      await prepareFirstPairs(started as PlayLiveSessionView);
      setNotice(`Состав из Котяры готов: добавлено ${Number(imported.added || 0)}, резерв ${Number(imported.reserved || 0)}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand(activeSession: PlayLiveSessionView, commandPayload: PlayLiveCommand) {
      const commandId = crypto.randomUUID();
      const pendingKey = `lp-play-pending:${activeSession.id}`;
      localStorage.setItem(pendingKey, JSON.stringify({ commandId, expectedRevision: activeSession.revision, command: commandPayload }));
      const response = await fetch(`/api/play-sessions/${activeSession.id}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandId,
          expectedRevision: activeSession.revision,
          command: commandPayload,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) await load();
        throw new Error(data.error || 'Не удалось сохранить счёт');
      }
      localStorage.removeItem(pendingKey);
      const nextSession = data as PlayLiveSessionView;
      setSession(nextSession);
      return nextSession;
  }

  async function command(commandPayload: PlayLiveCommand) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendCommand(session, commandPayload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  async function syncLateArrivals() {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const previousRoster = new Set(session.state.roster);
      const updated = await sendCommand(session, { type: 'sync_roster' });
      const addedCount = updated.state.roster.filter((resultKey) => !previousRoster.has(resultKey)).length;
      if (addedCount > 0) {
        setNotice(addedCount === 1 ? 'Добавлен 1 новый игрок' : `Добавлено новых игроков: ${addedCount}`);
        router.refresh();
      } else {
        setNotice('Новых подтверждённых игроков пока нет');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  async function requestPairing(
    match: PlayLiveState['matches'][number],
    mode: 'balanced' | 'random',
    selectedResultKeys = [...match.teamA, ...match.teamB],
    successMessage?: string,
  ) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/play-posts/${postId}/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, selectedResultKeys }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось собрать пары');
      await sendCommand(session, {
        type: 'set_match_teams',
        matchId: match.id,
        teamA: data.teamA,
        teamB: data.teamB,
      });
      setNotice(successMessage || (mode === 'balanced' ? 'Пары выровнены по игровому рейтингу' : 'Пары составлены случайно'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  function replaceLineupPlayer(match: PlayLiveState['matches'][number], slotIndex: number, resultKey: number) {
    const lineup = [...match.teamA, ...match.teamB];
    const currentIndex = lineup.indexOf(resultKey);
    if (currentIndex === slotIndex) return;
    if (currentIndex >= 0) [lineup[slotIndex], lineup[currentIndex]] = [lineup[currentIndex], lineup[slotIndex]];
    else lineup[slotIndex] = resultKey;
    void command({ type: 'set_match_teams', matchId: match.id, teamA: lineup.slice(0, 2), teamB: lineup.slice(2, 4) });
  }

  function leastUsedLineup(state: PlayLiveState): number[] {
    const appearances = new Map<number, number>();
    for (const match of state.matches) {
      if (match.scoreA === match.scoreB) continue;
      for (const resultKey of [...match.teamA, ...match.teamB]) {
        appearances.set(resultKey, (appearances.get(resultKey) ?? 0) + 1);
      }
    }
    const lastPlayed = new Map<number, number>();
    state.matches.forEach((match, index) => [...match.teamA, ...match.teamB].forEach((id) => lastPlayed.set(id, index)));
    return [...state.activeRoster]
      .sort((left, right) => (appearances.get(left) ?? 0) - (appearances.get(right) ?? 0) || state.roster.indexOf(left) - state.roster.indexOf(right))
      .sort((left, right) => (lastPlayed.get(left) ?? -1) - (lastPlayed.get(right) ?? -1) || (appearances.get(left) ?? 0) - (appearances.get(right) ?? 0))
      .slice(0, 4);
  }

  async function addSmartParty(state: PlayLiveState, mode: 'fresh' | 'balanced' = 'fresh') {
    if (!session || busy) return;
    const selectedResultKeys = leastUsedLineup(state);
    setBusy(true); setError(''); setNotice('');
    try {
      let teams = mode === 'fresh' ? chooseFreshLiveTeams(selectedResultKeys, state.matches) : null;
      if (!teams) {
        const response = await fetch(`/api/play-posts/${postId}/pairing`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, selectedResultKeys }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось подготовить следующую партию');
        teams = { teamA: data.teamA, teamB: data.teamB };
      }
      const remainingMinutes = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 60_000));
      const recommendedLimit: 11 | 15 | 21 = remainingMinutes < 20 || state.activeRoster.length >= 8 ? 11 : remainingMinutes < 45 ? 15 : 21;
      await sendCommand(session, { type: 'add_set', teamA: teams.teamA, teamB: teams.teamB, pointLimit: recommendedLimit });
      setNotice(`Следующая партия готова · до ${recommendedLimit}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ошибка сети'); }
    finally { setBusy(false); }
  }

  function addRematchParty(state: PlayLiveState) {
    const previous = state.matches[state.matches.length - 1];
    if (!previous) return;
    const previousLimit = previous.pointLimit ?? state.pointLimit;
    const pointLimit: 11 | 15 | 21 = previousLimit === 11 || previousLimit === 15 || previousLimit === 21
      ? previousLimit
      : 21;
    void command({
      type: 'add_set',
      teamA: [...previous.teamA],
      teamB: [...previous.teamB],
      pointLimit,
    });
  }

  async function submitResult() {
    if (!session || busy) return;
    const state = session.state;
    if (state.format === 'king_sideout') {
      if (getCurrentKingRound(state)) {
        setError('Завершите все раунды KING перед отправкой результата');
        return;
      }
    } else if (state.matches.some((match) => match.scoreA === match.scoreB)) {
      setError('Заполните все матчи или сеты');
      return;
    }
    const endedByTime = new Date(endsAt).getTime() <= Date.now();
    if (!endedByTime && !postCompleted) {
      if (!canStart) {
        setError('Результат можно отправить после окончания игры');
        return;
      }
      const confirmed = window.confirm('Завершить игру раньше и сохранить этот результат?');
      if (!confirmed) return;
    }
    setBusy(true);
    setError('');
    try {
      if (!endedByTime && !postCompleted) {
        const finishResponse = await fetch(`/api/play-posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        });
        const finishData = await finishResponse.json().catch(() => ({}));
        if (!finishResponse.ok) throw new Error(finishData.error || 'Не удалось завершить игру');
      }
      const response = await fetch(`/api/play-posts/${postId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: liveResultPayload(state) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось отправить результат');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="grid gap-4">
      {focusMode ? <PlayGameFlowSteps current={1} /> : null}
      <p className="text-xs text-text-secondary">Проверяем live-сессию…</p>
    </div>
  );
  if (!session) {
    return (
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-card p-4 shadow-lg sm:p-5">
        {focusMode ? <PlayGameFlowSteps current={1} /> : null}
        {canStart ? <div className="grid gap-3">
        {focusMode ? <div><p className="text-xs font-black uppercase tracking-[0.14em] text-brand">Шаг 1 из 3</p><h2 className="mt-1 text-2xl font-black text-text-primary">Подготовьте состав</h2></div> : null}
        <p className="text-sm text-text-secondary">Автоматические пары, ротация и быстрый счёт с безопасной отменой последнего действия.</p>
        {kotyaraPolls.length ? <div className="rounded-xl border border-orange-300/25 bg-orange-300/5 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-orange-200">Самый быстрый старт</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select value={kotyaraPollId} onChange={(event) => setKotyaraPollId(event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-white/10 bg-surface px-3 text-sm font-semibold text-text-primary">
              {kotyaraPolls.map((poll) => <option key={poll.id} value={poll.id}>{new Date(poll.startsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · {poll.title} · идут {poll.goingCount}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={() => void importKotyaraAndStart()} className="min-h-12 rounded-xl bg-brand px-4 text-sm font-black text-white disabled:opacity-60">{busy ? 'Собираем…' : '🐾 Состав из Котяры → начать'}</button>
          </div>
          <p className="mt-2 text-[11px] text-text-secondary">Одним нажатием добавим всех «иду», пропустим повторы и сразу откроем первую партию 2×2.</p>
        </div> : null}
        <button type="button" disabled={busy} onClick={() => void start()} className="min-h-11 justify-self-start rounded-xl border border-white/15 px-4 text-sm font-semibold text-text-primary disabled:opacity-60">{busy ? 'Запускаем…' : participants.length > 4 ? `Начать с текущим составом · ${participants.length}` : 'Провести игру'}</button>
        {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}
        </div> : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="font-bold text-text-primary">Организатор ещё не запустил игру</p><p className="mt-1 text-sm text-text-secondary">Оставьте этот экран открытым и обновите его после старта.</p><button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-text-primary">Обновить</button></div>}
      </div>
    );
  }

  const state = session.state;
  const currentMatch = state.matches.find((match) => match.scoreA === match.scoreB);
  const completeMatches = state.matches.filter((match) => match.scoreA !== match.scoreB);
  const currentRound = getCurrentKingRound(state);
  const canFinishNow = new Date(endsAt).getTime() <= Date.now();
  const teamName = (ids: number[]) => ids.map((id) => names.get(id) || `#${id}`).join(' + ');
  const teamMembers = (ids: number[]) => ids.map((id) => participantVisuals.get(id) || { name: names.get(id) || `#${id}`, registered: false });
  const activePlayerIds = new Set(currentMatch ? [...currentMatch.teamA, ...currentMatch.teamB] : []);
  const bench = participants.filter((participant) => state.activeRoster.includes(participant.resultKey) && !activePlayerIds.has(participant.resultKey));
  const paused = participants.filter((participant) => !state.activeRoster.includes(participant.resultKey));
  const nextFour = leastUsedLineup(state);
  const remainingMinutes = Math.max(0, Math.floor((new Date(endsAt).getTime() - clock) / 60_000));
  const completedDuration = Math.max(1, (clock - new Date(state.startedAt).getTime()) / 60_000);
  const averageMinutes = completeMatches.length ? Math.max(5, Math.round(completedDuration / completeMatches.length)) : 10;
  const estimatedParties = Math.max(0, Math.floor(remainingMinutes / averageMinutes));
  const currentMatchNumber = currentMatch ? state.matches.indexOf(currentMatch) + 1 : null;
  const currentRoundReady = currentRound ? canCompleteKingRound(currentRound) : false;
  const resultReady = state.format === 'king_sideout'
    ? state.rounds.length > 0 && !currentRound
    : state.matches.length > 0 && !currentMatch;
  const canSendResult = resultReady && (canFinishNow || postCompleted || canStart);
  const flowStep: 2 | 3 = resultReady ? 3 : 2;
  const formatSummary = state.format === 'thai_8'
    ? 'Тайский · 4 тура × 2 матча'
    : state.format === 'king_sideout'
      ? `KING · ${state.rounds.length} раундов`
      : `2×2 · ${state.matches.length} партий · ${state.roster.length} игроков`;

  return (
    <div className={`${courtMode ? 'fixed inset-0 z-[100] overflow-y-auto bg-surface p-3 pb-24 sm:p-6' : ''} grid gap-3 sm:gap-4`}>
      {focusMode ? <PlayGameFlowSteps current={flowStep} /> : null}
      <div className={`${courtMode ? 'sticky top-0 z-20 -mx-3 -mt-3 border-b border-white/10 bg-surface/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6' : ''} flex flex-wrap items-center justify-between gap-2`}>
        <div className="min-w-0">
          <p
            className={`text-xs font-bold uppercase tracking-[0.14em] ${online ? 'text-emerald-200' : 'text-amber-200'}`}
            title={`Техническая ревизия ${session.revision}`}
          >
            {online ? '● Сохранено' : '○ Нет сети · действие сохранено на устройстве'}{courtMode || focusMode ? '' : ` · ревизия ${session.revision}`}
          </p>
          <p className="mt-1 truncate text-sm text-text-secondary">{formatSummary}</p>
        </div>
        <div className="flex gap-2">
          {!focusMode ? <button type="button" onClick={() => setCourtMode((value) => !value)} className="min-h-11 rounded-xl border border-white/15 px-3 text-xs font-bold text-text-primary">
            {courtMode ? 'Закрыть пульт' : '⛶ Экран площадки'}
          </button> : null}
          {canStart && state.history.length ? <button type="button" disabled={busy} onClick={() => void command({ type: 'undo' })} className="min-h-11 rounded-xl border border-white/15 px-3 text-xs font-semibold text-text-primary disabled:opacity-40">
            ↶ Отменить
          </button> : null}
        </div>
      </div>

      {notice ? <p className="rounded-xl bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100" role="status">✓ {notice}</p> : null}
      {error ? <p className="rounded-xl bg-rose-300/10 px-3 py-2 text-xs text-rose-100" role="alert">{error}</p> : null}

      {state.format === 'king_sideout' ? (
        currentRound ? (
          <section className="rounded-2xl border border-orange-300/30 bg-orange-300/5 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-200">Текущий раунд</p>
                <h3 className="mt-1 text-lg font-black text-text-primary">Раунд {currentRound.roundNumber} из {state.rounds.length}</h3>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-text-secondary">готово {state.completedRoundIds.length}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {currentRound.pairs.map((pair, pairIndex) => (
                <div key={`${currentRound.id}-${pairIndex}`} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-white/10 bg-card/50 p-3">
                  <span className="min-w-0 text-sm font-semibold text-text-primary">{teamName(pair.team)}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" aria-label={`Убавить очко у пары ${teamName(pair.team)}`} disabled={busy || pair.points <= 0} onClick={() => void command({ type: 'set_pair_points', roundId: currentRound.id, pairIndex, points: pair.points - 1 })} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-xl text-text-primary disabled:opacity-30">−</button>
                    <strong className="w-11 text-center text-2xl text-text-primary">{pair.points}</strong>
                    <button type="button" aria-label={`Добавить очко паре ${teamName(pair.team)}`} disabled={busy || pair.points >= PLAY_KING_POINT_LIMIT} onClick={() => void command({ type: 'set_pair_points', roundId: currentRound.id, pairIndex, points: pair.points + 1 })} className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-xl text-white disabled:opacity-30">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !currentRoundReady}
              onClick={() => void command({ type: 'complete_king_round', roundId: currentRound.id })}
              className="mt-3 min-h-12 w-full rounded-xl bg-brand px-5 text-sm font-black text-white disabled:opacity-40"
            >
              Завершить раунд →
            </button>
            {!currentRoundReady ? <p className="mt-2 text-center text-xs text-text-secondary">Добавьте очки хотя бы одной паре — раунд не переключится сам.</p> : null}
          </section>
        ) : <p className="rounded-xl bg-emerald-300/10 p-4 text-sm font-semibold text-emerald-100">Все раунды завершены. Результат готов к отправке.</p>
      ) : currentMatch ? (
        <section className="rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-4 shadow-sm">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
            {currentMatch.tourNumber ? `Тур ${currentMatch.tourNumber}` : `Партия ${currentMatchNumber}`} · быстрый счёт до {currentMatch.pointLimit ?? state.pointLimit}
          </p>
          <QuickWinnerScoreInput
            teamA={teamName(currentMatch.teamA)}
            teamB={teamName(currentMatch.teamB)}
            teamAMembers={teamMembers(currentMatch.teamA)}
            teamBMembers={teamMembers(currentMatch.teamB)}
            target={currentMatch.pointLimit ?? state.pointLimit}
            scoreA={currentMatch.scoreA}
            scoreB={currentMatch.scoreB}
            disabled={busy}
            resetKey={`${currentMatch.id}:${session.revision}`}
            onComplete={(score) => void command({ type: 'set_match_score', matchId: currentMatch.id, winner: score.winner, loserPoints: score.loserPoints })}
          />
        </section>
      ) : <p className="rounded-xl bg-emerald-300/10 p-3 text-sm font-semibold text-emerald-100">Все матчи заполнены.</p>}

      {state.format === 'classic_2x2' && currentMatch ? (
        <details open={!focusMode} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-3 sm:p-4">
          <summary className={focusMode ? 'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-text-secondary' : 'hidden'}>
            <span>Настроить пары и лимит</span>
            <span className="shrink-0 text-xs text-text-primary">до {currentMatch.pointLimit ?? state.pointLimit}</span>
          </summary>
          <div className={focusMode ? 'mt-3 border-t border-white/10 pt-3' : ''}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Быстрые настройки партии {currentMatchNumber}</p>
              <p className="mt-1 text-sm font-bold text-text-primary">{teamName(currentMatch.teamA)} <span className="text-text-secondary">против</span> {teamName(currentMatch.teamB)}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-text-secondary">До</span>
              {([11, 15, 21] as const).map((limit) => {
                const selected = (currentMatch.pointLimit ?? state.pointLimit) === limit;
                return <button key={limit} type="button" disabled={busy || !canStart} aria-pressed={selected} onClick={() => void command({ type: 'set_match_point_limit', matchId: currentMatch.id, pointLimit: limit })} className={`min-h-11 min-w-11 rounded-xl px-2 text-sm font-black disabled:opacity-60 ${selected ? 'bg-brand text-white' : 'border border-white/15 text-text-primary'}`}>{limit}</button>;
              })}
            </div>
          </div>

          {canStart ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" disabled={busy || state.roster.length <= 4} onClick={() => void requestPairing(currentMatch, 'balanced', leastUsedLineup(state), 'Выбраны игроки с наименьшим числом партий')} className="min-h-11 rounded-xl bg-brand px-2 text-xs font-bold text-white disabled:opacity-40">↻ Следующие 4</button>
              <button type="button" disabled={busy} onClick={() => void requestPairing(currentMatch, 'balanced')} className="min-h-11 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-2 text-xs font-bold text-cyan-100 disabled:opacity-40">⚖ Равные</button>
              <button type="button" disabled={busy} onClick={() => void requestPairing(currentMatch, 'random')} className="min-h-11 rounded-xl border border-white/15 px-2 text-xs font-bold text-text-primary disabled:opacity-40">🎲 Перемешать</button>
            </div>
          ) : null}

          <details className="mt-3 border-t border-white/10 pt-2" open={!courtMode && !focusMode}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-bold text-text-secondary">Изменить игроков вручную</summary>
            <div className="grid gap-3 pb-1 sm:grid-cols-2">
              {[currentMatch.teamA, currentMatch.teamB].map((team, teamIndex) => (
                <fieldset key={teamIndex} className="rounded-xl border border-white/10 bg-card/50 p-3">
                  <legend className="px-1 text-[11px] font-black uppercase tracking-widest text-text-secondary">Пара {teamIndex === 0 ? 'A' : 'Б'}</legend>
                  <div className="grid gap-2">
                    {team.map((resultKey, playerIndex) => {
                      const slotIndex = teamIndex * 2 + playerIndex;
                      return (
                        <select
                          key={slotIndex}
                          aria-label={`Игрок ${playerIndex + 1} пары ${teamIndex === 0 ? 'A' : 'Б'}`}
                          value={resultKey}
                          disabled={busy || !canStart}
                          onChange={(event) => replaceLineupPlayer(currentMatch, slotIndex, Number(event.target.value))}
                          className="min-h-12 w-full rounded-xl border border-white/10 bg-surface px-3 text-sm font-semibold text-text-primary outline-none focus:border-cyan-300 disabled:opacity-60"
                        >
                          {participants.filter((participant) => state.activeRoster.includes(participant.resultKey)).map((participant) => <option key={participant.resultKey} value={participant.resultKey}>{participant.name}</option>)}
                        </select>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            {bench.length ? <p className="mt-2 text-xs text-text-secondary">Вне партии: {bench.map((participant) => participant.name).join(', ')}</p> : null}
            {!canStart ? <p className="mt-2 text-xs text-text-secondary">Состав партии меняет организатор.</p> : null}
          </details>
          </div>
        </details>
      ) : null}

      {state.format === 'classic_2x2' && state.roster.length > 4 ? <section className="rounded-2xl border border-orange-300/20 bg-orange-300/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-wide text-orange-200">Дальше играют</p><p className="mt-1 text-sm font-bold text-text-primary">{nextFour.map((id) => names.get(id)).filter(Boolean).join(' · ') || 'Нужно 4 активных игрока'}</p></div>
          <div className="text-right text-xs text-text-secondary"><strong className="block text-sm text-text-primary">Осталось {remainingMinutes} мин</strong>≈ ещё {estimatedParties} партий</div>
        </div>
      </section> : null}

      {state.format === 'classic_2x2' && canStart ? (
        <details className="rounded-2xl border border-white/10 bg-card/50 p-3 sm:p-4" open={!courtMode && !focusMode}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-black uppercase tracking-wide text-text-secondary">
            <span>Состав и замены</span><span className="normal-case tracking-normal">играют {state.activeRoster.length} из {state.roster.length}</span>
          </summary>
          <div className="mt-2 flex flex-col items-stretch gap-1.5 sm:items-end">
            <button type="button" disabled={busy} onClick={() => void syncLateArrivals()} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-text-primary disabled:opacity-60">
              {busy ? 'Обновляем…' : '↻ Обновить состав'}
            </button>
            <p className="text-xs text-text-secondary">Добавит игроков, которые подтвердили участие после старта.</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{participants.filter((player) => state.roster.includes(player.resultKey)).map((player) => {
            const active = state.activeRoster.includes(player.resultKey);
            const playing = activePlayerIds.has(player.resultKey);
            return <button key={player.resultKey} type="button" disabled={busy || playing} aria-pressed={active} onClick={() => void command({ type: 'set_player_active', resultKey: player.resultKey, active: !active })} className={`min-h-12 rounded-xl border px-3 text-left text-sm font-bold disabled:opacity-60 ${active ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[.03] text-text-secondary'}`}>{active ? '✓ ' : 'Ⅱ '}{player.name}{playing ? <small className="block font-normal">сейчас играет</small> : null}</button>;
          })}</div>
          {paused.length ? <p className="mt-2 text-xs text-text-secondary">Пауза: {paused.map((player) => player.name).join(', ')}</p> : null}
        </details>
      ) : null}

      {completeMatches.length ? (
        <details className="rounded-xl border border-white/10 p-3" open={!courtMode && !focusMode}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-bold text-text-secondary">Сыграно · {completeMatches.length}</summary>
          <div className="mt-2 flex flex-wrap gap-2">{completeMatches.map((match) => <span key={match.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-text-secondary">{match.tourNumber ? `Тур ${match.tourNumber}` : `Партия ${state.matches.indexOf(match) + 1}`}: {teamName(match.teamA)} — {teamName(match.teamB)} · {match.scoreA}:{match.scoreB}</span>)}</div>
        </details>
      ) : null}

      {(state.format === 'classic_2x2' && canStart && !currentMatch) || (canSubmit && resultReady) ? <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {state.format === 'classic_2x2' && canStart && !currentMatch ? <><button type="button" disabled={busy || nextFour.length < 4} onClick={() => void addSmartParty(state, 'fresh')} className="min-h-12 rounded-xl bg-brand px-5 text-sm font-black text-white disabled:opacity-40">Следующая партия →</button><button type="button" disabled={busy} onClick={() => addRematchParty(state)} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-text-primary disabled:opacity-40">Реванш теми же парами</button></> : null}
        {canSubmit && resultReady ? <button type="button" disabled={busy || !canSendResult} onClick={() => void submitResult()} className="min-h-12 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-40">{canStart ? (canFinishNow || postCompleted ? 'Завершить и сохранить результат' : 'Завершить игру раньше и сохранить') : (canFinishNow || postCompleted ? 'Отправить результат организатору' : 'Результат — после окончания игры')}</button> : null}
      </div> : null}

      {courtMode ? (
        <details className="rounded-xl border border-white/10 px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-semibold text-text-secondary">Техническое состояние</summary>
          <p className="pb-3 text-xs text-text-secondary">Ревизия {session.revision} · {online ? 'данные синхронизированы' : 'ожидаем сеть, последнее действие хранится на устройстве'}</p>
        </details>
      ) : null}
    </div>
  );
}
