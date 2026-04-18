'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { Action } from '@/lib/judge-scoreboard/reducer';
import type { MatchState, TeamId } from '@/lib/judge-scoreboard/types';
import { canEndSetNow, getCurrentTarget } from '@/lib/judge-scoreboard/rules';
import { ConfirmModal } from './ConfirmModal';
import { useLongPress } from './useLongPress';

interface Props {
  state: MatchState;
  dispatch: Dispatch<Action>;
  readOnly?: boolean;
  syncConnected?: boolean;
}

type ConfirmKind = 'finishMatch' | 'endSetWarn';

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // ignore
    }
  }
}

function safeName(value: string): string {
  return (value || '').trim() || '—';
}

export function MatchScreen({ state, dispatch, readOnly = false, syncConnected = false }: Props) {
  const { core, config, meta, history } = state;
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [minusCandidate, setMinusCandidate] = useState<TeamId | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const addDebounceRef = useRef<{ A: number; B: number }>({ A: 0, B: 0 });

  const leftTeam = 'A';
  const rightTeam = 'B';
  const target = getCurrentTarget(config, core.currentSet);
  const timeoutLeftSec = useMemo(() => {
    if (!core.timeoutEndsAt) return 0;
    return Math.max(0, Math.ceil((core.timeoutEndsAt - Date.now()) / 1000));
  }, [core.timeoutEndsAt]);

  useEffect(() => {
    const timeoutEndsAt = core.timeoutEndsAt;
    if (!timeoutEndsAt) return;
    const interval = window.setInterval(() => {
      if (Date.now() >= timeoutEndsAt) {
        dispatch({ type: 'END_TIMEOUT' });
      }
    }, 300);
    return () => window.clearInterval(interval);
  }, [core.timeoutEndsAt, dispatch]);

  const attemptAddPoint = useCallback(
    (team: TeamId, delta: 1 | 2 | 3 = 1) => {
      if (core.status !== 'playing' || readOnly) return;
      const now = Date.now();
      if (now - addDebounceRef.current[team] < 120) return;
      addDebounceRef.current[team] = now;
      dispatch({ type: 'ADD_POINT', team, delta });
      vibrate(35);
    },
    [core.status, dispatch, readOnly],
  );

  const handleSwitchServe = () => {
    if (readOnly) return;
    dispatch({ type: 'TOGGLE_SERVER' });
    vibrate(20);
  };

  const handleDisputedBall = () => {
    if (readOnly) return;
    dispatch({ type: 'DISPUTED_BALL' });
    vibrate(30);
  };

  const handleTimeout = (team: TeamId) => {
    if (readOnly) return;
    dispatch({ type: 'START_TIMEOUT', team, now: Date.now() });
  };

  const handleUndo = () => {
    if (readOnly) return;
    dispatch({ type: 'UNDO' });
  };

  const handleEndSet = () => {
    const verdict = canEndSetNow(core.scoreA, core.scoreB, target, config.winByTwo);
    if (!verdict.ok) {
      setConfirm('endSetWarn');
      return;
    }
    dispatch({ type: 'END_SET', force: false });
  };

  const leftPlus = useLongPress({
    onClick: () => attemptAddPoint('A', 1),
    onLongPress: () => setMinusCandidate('A'),
  });
  const rightPlus = useLongPress({
    onClick: () => attemptAddPoint('B', 1),
    onLongPress: () => setMinusCandidate('B'),
  });
  const leftMinus = useLongPress({
    onClick: () => setMinusCandidate('A'),
    onLongPress: () => {
      if (readOnly) return;
      dispatch({ type: 'REMOVE_POINT', team: 'A' });
    },
  });
  const rightMinus = useLongPress({
    onClick: () => setMinusCandidate('B'),
    onLongPress: () => {
      if (readOnly) return;
      dispatch({ type: 'REMOVE_POINT', team: 'B' });
    },
  });

  const serving = core.server;
  const canTimeoutA = core.timeoutAUsed < config.timeoutsPerTeam;
  const canTimeoutB = core.timeoutBUsed < config.timeoutsPerTeam;

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col bg-[#070c18] text-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 8px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 8px)',
      }}
    >
      <header className="mb-2 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="text-xl font-black uppercase"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            LPVOLLEY
          </div>
          <select
            value={meta.courtId}
            disabled={readOnly}
            onChange={(e) => dispatch({ type: 'UPDATE_META', patch: { courtId: e.target.value } })}
            className="rounded-lg border border-white/15 bg-[#10192b] px-2 py-1 text-sm font-black uppercase"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            {['1', '2', '3', '4'].map((id) => (
              <option key={id} value={id}>
                КОРТ {id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-widest ${
              syncConnected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
            }`}
          >
            {syncConnected ? 'WS LIVE' : 'OFFLINE'}
          </div>
          {readOnly ? (
            <div className="rounded-full bg-sky-500/20 px-2 py-1 text-[10px] uppercase tracking-widest text-sky-100">
              VIEWER
            </div>
          ) : null}
          <a
            href="/judge-scoreboard"
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-black uppercase tracking-widest text-white/80"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Назад
          </a>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-2">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
          <section
            className={`rounded-2xl border border-red-500/40 bg-gradient-to-br from-red-700/40 to-red-900/20 p-3 ${
              serving === leftTeam ? 'shadow-[0_0_24px_rgba(255,76,76,0.55)]' : ''
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2
                className="text-xl font-black uppercase leading-tight"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {safeName(core.teamA)}
              </h2>
              {serving === 'A' ? (
                <span className="rounded-full bg-yellow-400 px-2 py-1 text-xs font-black text-slate-900">
                  ПОДАЧА
                </span>
              ) : null}
            </div>
            <div
              className={`text-center text-[clamp(4rem,16vw,8rem)] font-black leading-none ${
                serving === 'A' ? 'text-white drop-shadow-[0_0_20px_rgba(255,220,60,0.8)]' : 'text-white/95'
              }`}
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              {core.scoreA}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                {...leftMinus}
                disabled={readOnly || core.status !== 'playing' || core.scoreA <= 0}
                className="min-h-[56px] rounded-xl border border-white/20 bg-black/25 text-4xl font-black"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                −
              </button>
              <button
                type="button"
                {...leftPlus}
                disabled={readOnly || core.status !== 'playing'}
                className="min-h-[92px] rounded-2xl bg-red-500 text-6xl font-black shadow-lg shadow-red-500/35"
                style={{ fontFamily: 'Bebas Neue, sans-serif', touchAction: 'manipulation' }}
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleTimeout('A')}
              disabled={readOnly || !canTimeoutA || core.timeoutActiveFor !== null}
              className="mt-2 min-h-[46px] w-full rounded-xl bg-yellow-400 text-base font-black uppercase text-slate-900 disabled:bg-white/20 disabled:text-white/40"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Тайм-аут A ({Math.max(0, config.timeoutsPerTeam - core.timeoutAUsed)})
            </button>
          </section>

          <section className="flex min-w-[120px] flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-black/35 px-2">
            <div className="text-4xl font-black" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {core.setsA} - {core.setsB}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/60">Сеты</div>
            <div
              className="text-3xl font-black uppercase"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              SET {core.currentSet}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/70">{meta.groupLabel}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">
              До {target} · {config.winByTwo ? 'разница 2' : 'без баланса'}
            </div>
          </section>

          <section
            className={`rounded-2xl border border-sky-500/40 bg-gradient-to-br from-sky-700/40 to-sky-900/20 p-3 ${
              serving === rightTeam ? 'shadow-[0_0_24px_rgba(47,171,255,0.55)]' : ''
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2
                className="text-xl font-black uppercase leading-tight"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {safeName(core.teamB)}
              </h2>
              {serving === 'B' ? (
                <span className="rounded-full bg-yellow-400 px-2 py-1 text-xs font-black text-slate-900">
                  ПОДАЧА
                </span>
              ) : null}
            </div>
            <div
              className={`text-center text-[clamp(4rem,16vw,8rem)] font-black leading-none ${
                serving === 'B' ? 'text-white drop-shadow-[0_0_20px_rgba(255,220,60,0.8)]' : 'text-white/95'
              }`}
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              {core.scoreB}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                {...rightPlus}
                disabled={readOnly || core.status !== 'playing'}
                className="min-h-[92px] rounded-2xl bg-sky-500 text-6xl font-black shadow-lg shadow-sky-500/35"
                style={{ fontFamily: 'Bebas Neue, sans-serif', touchAction: 'manipulation' }}
              >
                +
              </button>
              <button
                type="button"
                {...rightMinus}
                disabled={readOnly || core.status !== 'playing' || core.scoreB <= 0}
                className="min-h-[56px] rounded-xl border border-white/20 bg-black/25 text-4xl font-black"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                −
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleTimeout('B')}
              disabled={readOnly || !canTimeoutB || core.timeoutActiveFor !== null}
              className="mt-2 min-h-[46px] w-full rounded-xl bg-yellow-400 text-base font-black uppercase text-slate-900 disabled:bg-white/20 disabled:text-white/40"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Тайм-аут B ({Math.max(0, config.timeoutsPerTeam - core.timeoutBUsed)})
            </button>
          </section>
        </div>

        {core.timeoutActiveFor ? (
          <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center">
            <div className="text-xs uppercase tracking-widest text-amber-200">Тайм-аут активен</div>
            <div className="text-2xl font-black text-amber-100" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {core.timeoutActiveFor} · {timeoutLeftSec}s
            </div>
          </div>
        ) : null}

        {core.warning ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'CLEAR_WARNING' })}
            className="rounded-xl border border-rose-400/35 bg-rose-500/15 px-3 py-2 text-left text-sm text-rose-100"
          >
            {core.warning}
          </button>
        ) : null}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <button
            type="button"
            onClick={handleSwitchServe}
            disabled={readOnly}
            className="min-h-[58px] rounded-xl border border-white/20 bg-white/10 px-3 text-base font-black uppercase tracking-widest"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Смена подачи
          </button>
          <button
            type="button"
            onClick={handleDisputedBall}
            disabled={readOnly}
            className="min-h-[58px] rounded-xl border border-white/20 bg-white/10 px-3 text-base font-black uppercase tracking-widest"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Спорный мяч
          </button>
          <button
            type="button"
            onClick={handleEndSet}
            disabled={readOnly}
            className="min-h-[58px] rounded-xl border border-red-400/50 bg-red-500/20 px-3 text-base font-black uppercase tracking-widest text-red-100"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Завершить сет
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={readOnly || history.length === 0}
            className="min-h-[58px] rounded-xl border border-orange-300/50 bg-orange-500/20 px-3 text-base font-black uppercase tracking-widest text-orange-100 disabled:opacity-40"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => setConfirm('finishMatch')}
            disabled={readOnly}
            className="min-h-[58px] rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3 text-base font-black uppercase tracking-widest text-emerald-100"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Финиш
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setQueueOpen((v) => !v)}
            className="flex min-h-[48px] w-full items-center justify-between px-3 text-sm font-black uppercase tracking-widest text-white/80"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            <span>Очередь матчей ({meta.queueMatches.length})</span>
            <span>{queueOpen ? '▾' : '▸'}</span>
          </button>
          {queueOpen ? (
            <div className="border-t border-white/10 p-2">
              <ul className="space-y-2">
                {meta.queueMatches.slice(0, 6).map((item) => (
                  <li
                    key={item.id}
                    draggable={!readOnly}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingId && draggingId !== item.id) {
                        dispatch({ type: 'REORDER_QUEUE', fromId: draggingId, toId: item.id });
                      }
                      setDraggingId(null);
                    }}
                    className="rounded-xl border border-white/10 bg-black/25 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{item.teamA}</div>
                        <div className="text-sm font-semibold text-white">{item.teamB}</div>
                        <div className="text-[11px] uppercase tracking-widest text-white/40">
                          {item.title} · {item.groupLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'LOAD_QUEUE_MATCH', id: item.id })}
                        disabled={readOnly}
                        className="min-h-[38px] rounded-lg bg-sky-500 px-3 text-xs font-black uppercase tracking-widest text-white"
                        style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                      >
                        Загрузить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>

      {minusCandidate ? (
        <ConfirmModal
          title={`Снять очко с ${minusCandidate}?`}
          message="Короткий тап = подтверждение, долгий тап на кнопке '-' снимает без окна."
          confirmLabel="Снять очко"
          tone="danger"
          onConfirm={() => {
            dispatch({ type: 'REMOVE_POINT', team: minusCandidate });
            setMinusCandidate(null);
          }}
          onCancel={() => setMinusCandidate(null)}
        />
      ) : null}

      {confirm === 'finishMatch' ? (
        <ConfirmModal
          title="Завершить матч?"
          message="Матч будет закрыт. Для нового матча нажмите «Назад»."
          confirmLabel="Завершить"
          tone="success"
          onConfirm={() => {
            dispatch({ type: 'FINISH_MATCH' });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {confirm === 'endSetWarn' ? (
        <ConfirmModal
          title="Сет не готов к завершению"
          message="Лимит очков или разница 2 не выполнены. Завершить принудительно?"
          confirmLabel="Завершить принудительно"
          tone="danger"
          onConfirm={() => {
            dispatch({ type: 'END_SET', force: true });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}
