'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { Action } from '@/lib/judge-scoreboard/reducer';
import { getServePlayerRef } from '@/lib/judge-scoreboard/serve';
import type { MatchEvent, MatchState, TeamId, TeamPlayer } from '@/lib/judge-scoreboard/types';
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
type FeedFilter = 'all' | TeamId;

interface FeedRow {
  id: string;
  type: MatchEvent['type'];
  scoringTeam: TeamId;
  teamLabel: string;
  beforeScore: string;
  afterScore: string;
  serverName: string;
  serverPosition: number | null;
  streakCount: number;
  isCorrection: boolean;
  isSideOut: boolean;
}

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

function getTeamName(core: MatchState['core'], team: TeamId): string {
  return team === 'A' ? safeName(core.teamA) : safeName(core.teamB);
}

function getTeamScore(core: MatchState['core'], team: TeamId): number {
  return team === 'A' ? core.scoreA : core.scoreB;
}

function getTeamSets(core: MatchState['core'], team: TeamId): number {
  return team === 'A' ? core.setsA : core.setsB;
}

function positionBadge(position: number | null | undefined): string {
  if (!position) return '';
  return ['①', '②', '③', '④'][position - 1] ?? `#${position}`;
}

function buildServeOrder(roster: TeamPlayer[], currentOrder: TeamPlayer[]): TeamPlayer[] {
  const rosterById = new Map(roster.map((player) => [player.id, player] as const));
  const rosterByName = new Map(roster.map((player) => [player.name.toLowerCase(), player] as const));
  const next: TeamPlayer[] = [];
  const seen = new Set<string>();

  const push = (player: TeamPlayer | null | undefined) => {
    if (!player) return;
    const key = player.id || player.name.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    next.push(player);
  };

  currentOrder.forEach((player) => {
    const byId = rosterById.get(player.id);
    const byName = rosterByName.get(player.name.toLowerCase());
    push(byId ?? byName ?? null);
  });
  roster.forEach((player) => push(player));

  return next.length > 0 ? next : roster.slice(0, 1);
}

function formatScore(snapshot: MatchEvent['scoreBefore'] | MatchEvent['scoreAfter']): string {
  if (!snapshot) return '0-0';
  return `${snapshot.A}-${snapshot.B}`;
}

export function MatchScreen({ state, dispatch, readOnly = false, syncConnected = false }: Props) {
  const { core, config, meta, history, events } = state;
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [minusCandidate, setMinusCandidate] = useState<TeamId | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [serveSetup, setServeSetup] = useState(() => ({
    teamAOrder: buildServeOrder(core.teamAPlayers, core.serveState.A.order),
    teamBOrder: buildServeOrder(core.teamBPlayers, core.serveState.B.order),
    firstServer: 'A' as TeamId,
    swapSides: false,
  }));
  const addDebounceRef = useRef<{ A: number; B: number }>({ A: 0, B: 0 });
  const feedRef = useRef<HTMLDivElement | null>(null);

  const leftTeam = core.leftTeam;
  const rightTeam = core.leftTeam === 'A' ? 'B' : 'A';
  const target = getCurrentTarget(config, core.currentSet);
  const timeoutLeftSec = useMemo(() => {
    if (!core.timeoutEndsAt) return 0;
    return Math.max(0, Math.ceil((core.timeoutEndsAt - clockTick) / 1000));
  }, [core.timeoutEndsAt, clockTick]);

  useEffect(() => {
    setFeedFilter('all');
  }, [core.currentSet]);

  useEffect(() => {
    if (!core.timeoutEndsAt) return;
    const timeoutEndsAt = core.timeoutEndsAt;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setClockTick(now);
      if (now >= timeoutEndsAt) {
        dispatch({ type: 'END_TIMEOUT' });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [core.timeoutEndsAt, dispatch]);

  useEffect(() => {
    if (core.status !== 'set_setup') return;
    setServeSetup({
      teamAOrder: buildServeOrder(core.teamAPlayers, core.serveState.A.order),
      teamBOrder: buildServeOrder(core.teamBPlayers, core.serveState.B.order),
      firstServer: 'A',
      swapSides: false,
    });
  }, [core.currentSet, core.status, core.teamAPlayers, core.teamBPlayers, core.serveState]);

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
    if (readOnly || core.status !== 'playing') return;
    dispatch({ type: 'TOGGLE_SERVER' });
    vibrate(20);
  };

  const handleDisputedBall = () => {
    if (readOnly || core.status !== 'playing') return;
    dispatch({ type: 'DISPUTED_BALL' });
    vibrate(30);
  };

  const handleManualSwapSides = () => {
    if (readOnly) return;
    dispatch({ type: 'MANUAL_SWAP_SIDES' });
  };

  const handleTimeout = (team: TeamId) => {
    if (readOnly || core.status !== 'playing') return;
    dispatch({ type: 'START_TIMEOUT', team, now: Date.now() });
  };

  const handleUndo = () => {
    if (readOnly) return;
    dispatch({ type: 'UNDO' });
  };

  const handleEndSet = () => {
    if (core.status !== 'playing') return;
    const verdict = canEndSetNow(core.scoreA, core.scoreB, target, config.winByTwo);
    if (!verdict.ok) {
      setConfirm('endSetWarn');
      return;
    }
    dispatch({ type: 'END_SET', force: false });
  };

  const leftPlus = useLongPress({
    onClick: () => attemptAddPoint(leftTeam, 1),
    onLongPress: () => setMinusCandidate(leftTeam),
  });
  const rightPlus = useLongPress({
    onClick: () => attemptAddPoint(rightTeam, 1),
    onLongPress: () => setMinusCandidate(rightTeam),
  });
  const leftMinus = useLongPress({
    onClick: () => setMinusCandidate(leftTeam),
    onLongPress: () => {
      if (readOnly) return;
      dispatch({ type: 'REMOVE_POINT', team: leftTeam });
    },
  });
  const rightMinus = useLongPress({
    onClick: () => setMinusCandidate(rightTeam),
    onLongPress: () => {
      if (readOnly) return;
      dispatch({ type: 'REMOVE_POINT', team: rightTeam });
    },
  });

  const teamPanels = useMemo(() => {
    return ([leftTeam, rightTeam] as TeamId[]).map((team) => {
      const serveState = core.serveState[team];
      return {
        team,
        name: getTeamName(core, team),
        score: getTeamScore(core, team),
        sets: getTeamSets(core, team),
        isServing: core.servingTeam === team,
        currentServer: getServePlayerRef(serveState, 'current'),
        nextServer: getServePlayerRef(serveState, 'next'),
        timeoutsRemaining:
          config.timeoutsPerTeam - (team === 'A' ? core.timeoutAUsed : core.timeoutBUsed),
      };
    });
  }, [config.timeoutsPerTeam, core, leftTeam, rightTeam]);

  const feedRows = useMemo(() => {
    let streakTeam: TeamId | null = null;
    let streakCount = 0;

    return events
      .filter((event) => {
        if ((event.type !== 'rally' && event.type !== 'correction') || !event.scoringTeam) {
          return false;
        }
        return event.setNumber === core.currentSet;
      })
      .filter((event) => feedFilter === 'all' || event.scoringTeam === feedFilter)
      .map((event) => {
        const scoringTeam = event.scoringTeam as TeamId;
        const isCorrection = event.type === 'correction';
        if (!isCorrection && scoringTeam === streakTeam) {
          streakCount += 1;
        } else if (!isCorrection) {
          streakTeam = scoringTeam;
          streakCount = 1;
        } else {
          streakTeam = null;
          streakCount = 0;
        }
        return {
          id: event.id,
          type: event.type,
          scoringTeam,
          teamLabel: getTeamName(core, scoringTeam),
          beforeScore: formatScore(event.scoreBefore),
          afterScore: formatScore(event.scoreAfter),
          serverName: safeName(event.serverPlayerBefore?.name || ''),
          serverPosition: event.serverPlayerBefore?.position ?? null,
          streakCount: isCorrection ? 0 : streakCount,
          isCorrection,
          isSideOut: Boolean(event.isSideOut),
        } satisfies FeedRow;
      });
  }, [core, events, feedFilter]);

  useEffect(() => {
    if (!feedRef.current || feedRows.length === 0) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [feedRows]);

  const leftPanel = teamPanels[0];
  const rightPanel = teamPanels[1];
  const canTimeoutA = core.timeoutAUsed < config.timeoutsPerTeam;
  const canTimeoutB = core.timeoutBUsed < config.timeoutsPerTeam;
  const canSaveServeSetup = serveSetup.teamAOrder.length > 0 && serveSetup.teamBOrder.length > 0;

  const updateServeOrder = (team: TeamId, index: number, playerId: string) => {
    const roster = team === 'A' ? core.teamAPlayers : core.teamBPlayers;
    const selectedPlayer = roster.find((player) => player.id === playerId);
    if (!selectedPlayer) return;
    setServeSetup((current) => {
      const key = team === 'A' ? 'teamAOrder' : 'teamBOrder';
      const nextOrder = [...current[key]];
      nextOrder[index] = selectedPlayer;
      return {
        ...current,
        [key]: nextOrder,
      };
    });
  };

  const addServeOrderSlot = (team: TeamId) => {
    const roster = team === 'A' ? core.teamAPlayers : core.teamBPlayers;
    setServeSetup((current) => {
      const key = team === 'A' ? 'teamAOrder' : 'teamBOrder';
      const order = current[key];
      if (order.length >= roster.length) return current;
      const used = new Set(order.map((player) => player.id));
      const nextPlayer = roster.find((player) => !used.has(player.id));
      if (!nextPlayer) return current;
      return {
        ...current,
        [key]: [...order, nextPlayer],
      };
    });
  };

  const removeServeOrderSlot = (team: TeamId) => {
    setServeSetup((current) => {
      const key = team === 'A' ? 'teamAOrder' : 'teamBOrder';
      const order = current[key];
      if (order.length <= 1) return current;
      return {
        ...current,
        [key]: order.slice(0, -1),
      };
    });
  };

  const saveServeSetup = () => {
    if (readOnly || !canSaveServeSetup) return;
    dispatch({
      type: 'APPLY_SET_SERVE_SETUP',
      teamAOrder: serveSetup.teamAOrder,
      teamBOrder: serveSetup.teamBOrder,
      firstServer: serveSetup.firstServer,
      swapSides: serveSetup.swapSides,
    });
  };

  const renderServeOrderEditor = (
    team: TeamId,
    title: string,
    accentClass: string,
    cardClass: string,
  ) => {
    const roster = team === 'A' ? core.teamAPlayers : core.teamBPlayers;
    const order = team === 'A' ? serveSetup.teamAOrder : serveSetup.teamBOrder;

    return (
      <div className={`rounded-2xl border p-4 ${cardClass}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className={`text-xs uppercase tracking-widest ${accentClass}`}>{title}</p>
            <p className="text-[11px] uppercase tracking-widest text-white/45">Порядок подачи</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => removeServeOrderSlot(team)}
              disabled={order.length <= 1}
              className="min-h-[36px] rounded-xl border border-white/15 bg-black/20 px-3 text-[11px] font-black uppercase tracking-widest text-white/70 disabled:opacity-30"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              - игрок
            </button>
            <button
              type="button"
              onClick={() => addServeOrderSlot(team)}
              disabled={order.length >= roster.length}
              className="min-h-[36px] rounded-xl border border-white/15 bg-white/10 px-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-30"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              + игрок
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {order.map((player, index) => {
            const usedIds = new Set(
              order.filter((_, itemIndex) => itemIndex !== index).map((item) => item.id),
            );
            const options = roster.filter((item) => !usedIds.has(item.id) || item.id === player.id);
            return (
              <label
                key={`${team}-${index}`}
                className="block text-[11px] uppercase tracking-widest text-white/55"
              >
                {index === 0 ? 'Текущий подающий' : `Позиция ${index + 1}`}
                <select
                  value={player.id}
                  onChange={(event) => updateServeOrder(team, index, event.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col bg-[#070c18] text-white"
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
            onChange={(event) => dispatch({ type: 'UPDATE_META', patch: { courtId: event.target.value } })}
            className="rounded-lg border border-white/15 bg-[#10192b] px-2 py-1 text-sm font-black uppercase"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            {['1', '2', '3', '4'].map((id) => (
              <option key={id} value={id}>
                КОРТ {id}
              </option>
            ))}
          </select>
          <div className="hidden text-[11px] uppercase tracking-widest text-white/45 md:block">
            {meta.matchName}
          </div>
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
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/45">{meta.groupLabel}</div>
              <div className="text-lg font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {meta.matchName}
              </div>
            </div>
            <div className="text-right text-[11px] uppercase tracking-widest text-white/45">
              <div>Судья: {safeName(meta.judgeName)}</div>
              <div>
                Сет {core.currentSet} · до {target} · {config.winByTwo ? 'разница 2' : 'без баланса'}
              </div>
            </div>
          </div>
        </div>

        {core.status === 'set_setup' && readOnly ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-center">
            <div className="text-xs uppercase tracking-widest text-sky-200">Ожидание судьи</div>
            <div className="mt-1 text-lg font-black text-sky-50" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Ожидание настройки подачи для сета {core.currentSet}
            </div>
          </div>
        ) : null}

        {core.timeoutActiveFor ? (
          <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center">
            <div className="text-xs uppercase tracking-widest text-amber-200">Тайм-аут активен</div>
            <div className="text-2xl font-black text-amber-100" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {core.timeoutActiveFor} · {timeoutLeftSec}s
            </div>
          </div>
        ) : null}

        {core.pendingSideSwap ? (
          <div className="rounded-2xl border border-fuchsia-400/35 bg-fuchsia-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-fuchsia-200">Смена сторон</div>
                <div className="text-sm text-white/80">Достигнут порог для смены сторон в текущем сете.</div>
              </div>
              {readOnly ? (
                <div className="text-[11px] uppercase tracking-widest text-white/55">Ждём подтверждение судьи</div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'ACCEPT_SIDE_SWAP' })}
                    className="min-h-[42px] rounded-xl bg-fuchsia-500 px-4 text-sm font-black uppercase tracking-widest text-white"
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    Поменять сейчас
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'DISMISS_SIDE_SWAP' })}
                    className="min-h-[42px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-black uppercase tracking-widest text-white/75"
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    Позже
                  </button>
                </div>
              )}
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

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_1fr]">
          {[leftPanel, rightPanel].map((panel, index) => {
            const isLeft = index === 0;
            const plusHandlers = isLeft ? leftPlus : rightPlus;
            const minusHandlers = isLeft ? leftMinus : rightMinus;
            const canTimeout = panel.team === 'A' ? canTimeoutA : canTimeoutB;
            const timeoutLabel = panel.team === 'A' ? 'A' : 'B';
            const toneClass =
              panel.team === 'A'
                ? 'border-red-500/40 bg-gradient-to-br from-red-700/40 to-red-900/20'
                : 'border-sky-500/40 bg-gradient-to-br from-sky-700/40 to-sky-900/20';
            const activeShadow =
              panel.team === 'A'
                ? 'shadow-[0_0_24px_rgba(255,76,76,0.55)]'
                : 'shadow-[0_0_24px_rgba(47,171,255,0.55)]';
            const primaryButtonClass =
              panel.team === 'A' ? 'bg-red-500 shadow-red-500/35' : 'bg-sky-500 shadow-sky-500/35';

            return (
              <section
                key={panel.team}
                className={`rounded-2xl border p-3 ${toneClass} ${panel.isServing ? activeShadow : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2
                    className="text-xl font-black uppercase leading-tight"
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    {panel.name}
                  </h2>
                  {panel.isServing ? (
                    <span className="rounded-full bg-yellow-400 px-2 py-1 text-xs font-black text-slate-900">
                      ПОДАЧА
                    </span>
                  ) : null}
                </div>
                <div
                  className={`text-center text-[clamp(4rem,16vw,8rem)] font-black leading-none ${
                    panel.isServing ? 'text-white drop-shadow-[0_0_20px_rgba(255,220,60,0.8)]' : 'text-white/95'
                  }`}
                  style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                >
                  {panel.score}
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center gap-2 text-sm text-white/85">
                    <span className={`text-xl ${panel.isServing ? 'text-yellow-300' : 'text-white/25'}`}>●</span>
                    <span className="uppercase tracking-widest text-white/55">Подача:</span>
                    <span className="font-semibold text-white">
                      {safeName(panel.currentServer?.name || '')} {positionBadge(panel.currentServer?.position)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-widest text-white/45">
                    След: {safeName(panel.nextServer?.name || '')} {positionBadge(panel.nextServer?.position)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    {...minusHandlers}
                    disabled={readOnly || core.status !== 'playing' || panel.score <= 0}
                    className="min-h-[56px] rounded-xl border border-white/20 bg-black/25 text-4xl font-black"
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    {...plusHandlers}
                    disabled={readOnly || core.status !== 'playing'}
                    className={`min-h-[92px] rounded-2xl text-6xl font-black shadow-lg ${primaryButtonClass}`}
                    style={{ fontFamily: 'Bebas Neue, sans-serif', touchAction: 'manipulation' }}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleTimeout(panel.team)}
                  disabled={readOnly || !canTimeout || core.timeoutActiveFor !== null || core.status !== 'playing'}
                  className="mt-2 min-h-[46px] w-full rounded-xl bg-yellow-400 text-base font-black uppercase text-slate-900 disabled:bg-white/20 disabled:text-white/40"
                  style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                >
                  Тайм-аут {timeoutLabel} ({Math.max(0, panel.timeoutsRemaining)})
                </button>
              </section>
            );
          })}

          <section className="flex min-w-[150px] flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-4">
            <div className="text-4xl font-black" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {leftPanel.sets} - {rightPanel.sets}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/60">Сеты</div>
            <div className="text-3xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              SET {core.currentSet}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/70">{meta.groupLabel}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">
              {leftPanel.name} · {rightPanel.name}
            </div>
            {core.status === 'finished' && core.winner ? (
              <div className="mt-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs uppercase tracking-widest text-emerald-100">
                Победитель: {getTeamName(core, core.winner)}
              </div>
            ) : null}
          </section>
        </div>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <button
            type="button"
            onClick={handleSwitchServe}
            disabled={readOnly || core.status !== 'playing'}
            className="min-h-[58px] rounded-xl border border-white/20 bg-white/10 px-3 text-base font-black uppercase tracking-widest disabled:opacity-40"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Смена подачи
          </button>
          <button
            type="button"
            onClick={handleDisputedBall}
            disabled={readOnly || core.status !== 'playing'}
            className="min-h-[58px] rounded-xl border border-white/20 bg-white/10 px-3 text-base font-black uppercase tracking-widest disabled:opacity-40"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Спорный мяч
          </button>
          <button
            type="button"
            onClick={handleManualSwapSides}
            disabled={readOnly}
            className="min-h-[58px] rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 text-base font-black uppercase tracking-widest text-fuchsia-100 disabled:opacity-40"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Смена сторон
          </button>
          <button
            type="button"
            onClick={handleEndSet}
            disabled={readOnly || core.status !== 'playing'}
            className="min-h-[58px] rounded-xl border border-red-400/50 bg-red-500/20 px-3 text-base font-black uppercase tracking-widest text-red-100 disabled:opacity-40"
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
            disabled={readOnly || core.status === 'setup'}
            className="min-h-[58px] rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3 text-base font-black uppercase tracking-widest text-emerald-100 disabled:opacity-40"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            Финиш
          </button>
        </section>

        <section className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/45">Лента очков</div>
                <div className="text-sm uppercase tracking-widest text-white/70">Сет {core.currentSet}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'all', label: 'Все' },
                  { id: 'A', label: 'Команда A' },
                  { id: 'B', label: 'Команда B' },
                ] as Array<{ id: FeedFilter; label: string }>).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFeedFilter(item.id)}
                    className={`min-h-[34px] rounded-full border px-3 text-[11px] font-black uppercase tracking-widest ${
                      feedFilter === item.id
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-white/15 bg-black/20 text-white/55'
                    }`}
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div ref={feedRef} className="max-h-[360px] space-y-2 overflow-y-auto p-3">
              {feedRows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-center text-sm text-white/50">
                  Для текущего сета ещё нет розыгрышей.
                </div>
              ) : (
                feedRows.map((row) => {
                  const teamTone =
                    row.scoringTeam === 'A'
                      ? 'border-red-400/20 bg-red-500/10'
                      : 'border-sky-400/20 bg-sky-500/10';
                  return (
                    <div
                      key={row.id}
                      className={`rounded-2xl border px-3 py-3 ${teamTone} ${row.streakCount >= 2 ? 'ring-1 ring-yellow-300/40' : ''}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-white/45">{row.beforeScore}</span>
                        <span className="text-lg font-black text-white/60">→</span>
                        <span className="font-semibold text-white">
                          {row.isCorrection ? `Коррекция · ${row.teamLabel}` : row.teamLabel}
                        </span>
                        <span className="text-white/45">
                          (подача: {row.serverName}
                          {row.serverPosition ? ` ${positionBadge(row.serverPosition)}` : ''})
                        </span>
                        <span className="text-lg font-black text-white">{row.afterScore}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
                        {row.isSideOut ? (
                          <span className="rounded-full bg-yellow-400/15 px-2 py-1 text-yellow-100">side-out</span>
                        ) : null}
                        {row.streakCount >= 2 ? (
                          <span className="rounded-full bg-white/10 px-2 py-1 text-white/80">
                            {row.streakCount} подряд
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
            <button
              type="button"
              onClick={() => setQueueOpen((value) => !value)}
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
                      onDragOver={(event) => event.preventDefault()}
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
                          className="min-h-[38px] rounded-lg bg-sky-500 px-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
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
        </section>
      </main>

      {core.status === 'set_setup' && !readOnly ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          }}
        >
          <div className="mx-auto w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0b1222] p-5 text-white shadow-2xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/45">Настройка подачи</div>
                <h2 className="text-3xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  Сет {core.currentSet}
                </h2>
              </div>
              <div className="text-right text-[11px] uppercase tracking-widest text-white/45">
                <div>Сначала задайте порядок подачи обеих команд</div>
                <div>Затем выберите первую подачу и старт сета</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {renderServeOrderEditor('A', getTeamName(core, 'A'), 'text-red-200', 'border-red-400/25 bg-red-500/10')}
              {renderServeOrderEditor('B', getTeamName(core, 'B'), 'text-sky-200', 'border-sky-400/25 bg-sky-500/10')}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-widest text-white/45">Кто подаёт первым</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setServeSetup((current) => ({ ...current, firstServer: 'A' }))}
                    className={`min-h-[46px] rounded-xl border text-sm font-black uppercase tracking-widest ${
                      serveSetup.firstServer === 'A'
                        ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                        : 'border-white/15 bg-white/5 text-white/60'
                    }`}
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    {getTeamName(core, 'A')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setServeSetup((current) => ({ ...current, firstServer: 'B' }))}
                    className={`min-h-[46px] rounded-xl border text-sm font-black uppercase tracking-widest ${
                      serveSetup.firstServer === 'B'
                        ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                        : 'border-white/15 bg-white/5 text-white/60'
                    }`}
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    {getTeamName(core, 'B')}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setServeSetup((current) => ({ ...current, swapSides: !current.swapSides }))}
                className={`min-h-[52px] rounded-2xl border px-4 text-sm font-black uppercase tracking-widest ${
                  serveSetup.swapSides
                    ? 'border-fuchsia-300 bg-fuchsia-500/20 text-fuchsia-100'
                    : 'border-white/15 bg-white/5 text-white/70'
                }`}
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {serveSetup.swapSides ? 'Стороны поменяются при старте' : 'Поменять стороны'}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={saveServeSetup}
                disabled={!canSaveServeSetup}
                className="min-h-[56px] rounded-2xl bg-emerald-500 px-6 text-lg font-black uppercase tracking-widest text-white disabled:bg-white/10 disabled:text-white/30"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                Сохранить и начать сет
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {minusCandidate ? (
        <ConfirmModal
          title={`Снять очко с ${getTeamName(core, minusCandidate)}?`}
          message="Короткий тап подтверждает снятие, долгий тап по кнопке '-' снимает очко сразу."
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
