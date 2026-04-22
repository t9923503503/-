'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MatchScreen } from './MatchScreen';
import { SetupScreen } from './SetupScreen';
import { clearState, loadState, saveState } from '@/lib/judge-scoreboard/storage';
import { createInitialState, reducer } from '@/lib/judge-scoreboard/reducer';
import { createJudgeRealtimeChannel } from '@/lib/judge-scoreboard/realtime';
import {
  normalizeServeTeamState,
  normalizeTeamPlayers,
} from '@/lib/judge-scoreboard/serve';
import type {
  MatchCore,
  MatchEvent,
  MatchState,
  Preset,
  QueueMatch,
  TeamId,
  TeamPlayer,
} from '@/lib/judge-scoreboard/types';

interface Props {
  courtId: string;
  readOnly?: boolean;
}

function normalizeCourtId(input: unknown, fallback: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed) return fallback;
  const digits = trimmed.replace(/[^\d]/g, '');
  return digits || fallback;
}

function normalizePlayerRef(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const name = String(source.name || '').trim();
  if (!name) return null;
  const position = Number(source.position || 0);
  return {
    id: String(source.id || '').trim() || name.toLowerCase().replace(/\s+/g, '-'),
    name,
    position: Number.isFinite(position) && position > 0 ? Math.floor(position) : 1,
  };
}

function normalizeScoreSnapshot(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const scoreA = Number(source.A || 0);
  const scoreB = Number(source.B || 0);
  return {
    A: Number.isFinite(scoreA) ? Math.max(0, Math.floor(scoreA)) : 0,
    B: Number.isFinite(scoreB) ? Math.max(0, Math.floor(scoreB)) : 0,
  };
}

function normalizeQueueMatch(raw: unknown, fallbackCourtId: string, index: number): QueueMatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const teamA = String(source.teamA || '').trim() || `Команда ${index * 2 + 1}`;
  const teamB = String(source.teamB || '').trim() || `Команда ${index * 2 + 2}`;
  return {
    id: String(source.id || '').trim() || `q-${index + 1}`,
    title: String(source.title || '').trim() || `MATCH ${index + 1}`,
    teamA,
    teamB,
    groupLabel: String(source.groupLabel || '').trim() || 'GROUP B',
    courtId: normalizeCourtId(source.courtId, fallbackCourtId),
    teamAPlayers: normalizeTeamPlayers(source.teamAPlayers as TeamPlayer[] | undefined, teamA, 'a'),
    teamBPlayers: normalizeTeamPlayers(source.teamBPlayers as TeamPlayer[] | undefined, teamB, 'b'),
  };
}

function normalizeEvent(raw: unknown): MatchEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const rawType = String(source.type || '').trim();
  const normalizedType =
    rawType === 'point'
      ? 'rally'
      : rawType === 'switch-server'
        ? 'switch_serve'
        : rawType;
  const validType = [
    'rally',
    'correction',
    'switch_serve',
    'timeout',
    'disputed_ball',
    'end_set',
    'undo',
    'serve_setup',
    'swap_sides',
  ].includes(normalizedType)
    ? (normalizedType as MatchEvent['type'])
    : null;
  if (!validType) return null;

  const timestamp = Number(source.timestamp || 0);
  const team = source.team === 'A' || source.team === 'B' ? (source.team as TeamId) : undefined;
  const scoringTeam =
    source.scoringTeam === 'A' || source.scoringTeam === 'B'
      ? (source.scoringTeam as TeamId)
      : source.scoringTeam === null
        ? null
        : undefined;
  const servingTeamBefore =
    source.servingTeamBefore === 'A' || source.servingTeamBefore === 'B'
      ? (source.servingTeamBefore as TeamId)
      : source.server === 'A' || source.server === 'B'
        ? (source.server as TeamId)
        : null;
  const servingTeamAfter =
    source.servingTeamAfter === 'A' || source.servingTeamAfter === 'B'
      ? (source.servingTeamAfter as TeamId)
      : null;

  return {
    id: String(source.id || '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: validType,
    team,
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    note: typeof source.note === 'string' ? source.note : undefined,
    setNumber: Number.isFinite(Number(source.setNumber || 0))
      ? Math.max(0, Math.floor(Number(source.setNumber || 0)))
      : undefined,
    scoreBefore: normalizeScoreSnapshot(source.scoreBefore),
    scoreAfter: normalizeScoreSnapshot(source.scoreAfter),
    scoringTeam,
    servingTeamBefore,
    serverPlayerBefore: normalizePlayerRef(source.serverPlayerBefore),
    servingTeamAfter,
    serverPlayerAfter: normalizePlayerRef(source.serverPlayerAfter),
    isSideOut: typeof source.isSideOut === 'boolean' ? source.isSideOut : undefined,
  };
}

function normalizeCore(rawCore: unknown, fallbackCore: MatchCore): MatchCore {
  if (!rawCore || typeof rawCore !== 'object') {
    return fallbackCore;
  }

  const source = rawCore as Record<string, unknown>;
  const teamA = String(source.teamA || fallbackCore.teamA).trim() || fallbackCore.teamA;
  const teamB = String(source.teamB || fallbackCore.teamB).trim() || fallbackCore.teamB;
  const teamAPlayers = normalizeTeamPlayers(source.teamAPlayers as TeamPlayer[] | undefined, teamA, 'a');
  const teamBPlayers = normalizeTeamPlayers(source.teamBPlayers as TeamPlayer[] | undefined, teamB, 'b');
  const servingTeam =
    source.servingTeam === 'A' || source.servingTeam === 'B'
      ? (source.servingTeam as TeamId)
      : source.server === 'A' || source.server === 'B'
        ? (source.server as TeamId)
        : null;
  const rawStatus = String(source.status || '').trim();
  const status =
    rawStatus === 'setup' ||
    rawStatus === 'set_setup' ||
    rawStatus === 'playing' ||
    rawStatus === 'finished'
      ? rawStatus
      : 'setup';

  return {
    ...fallbackCore,
    ...source,
    teamA,
    teamB,
    teamAPlayers,
    teamBPlayers,
    scoreA: Number.isFinite(Number(source.scoreA || 0)) ? Math.max(0, Math.floor(Number(source.scoreA || 0))) : 0,
    scoreB: Number.isFinite(Number(source.scoreB || 0)) ? Math.max(0, Math.floor(Number(source.scoreB || 0))) : 0,
    setsA: Number.isFinite(Number(source.setsA || 0)) ? Math.max(0, Math.floor(Number(source.setsA || 0))) : 0,
    setsB: Number.isFinite(Number(source.setsB || 0)) ? Math.max(0, Math.floor(Number(source.setsB || 0))) : 0,
    currentSet:
      Number.isFinite(Number(source.currentSet || 0)) && Number(source.currentSet || 0) > 0
        ? Math.floor(Number(source.currentSet || 0))
        : 1,
    servingTeam,
    serveState: {
      A: normalizeServeTeamState(
        (source.serveState as Record<string, unknown> | undefined)?.A as MatchCore['serveState']['A'] | undefined,
        teamAPlayers,
        'a',
      ),
      B: normalizeServeTeamState(
        (source.serveState as Record<string, unknown> | undefined)?.B as MatchCore['serveState']['B'] | undefined,
        teamBPlayers,
        'b',
      ),
    },
    leftTeam: source.leftTeam === 'B' ? 'B' : 'A',
    status,
    winner: source.winner === 'A' || source.winner === 'B' ? (source.winner as TeamId) : null,
    sidesSwappedCount: Number.isFinite(Number(source.sidesSwappedCount || 0))
      ? Math.max(0, Math.floor(Number(source.sidesSwappedCount || 0)))
      : 0,
    lastSideSwapTotal: Number.isFinite(Number(source.lastSideSwapTotal || 0))
      ? Math.max(0, Math.floor(Number(source.lastSideSwapTotal || 0)))
      : 0,
    pendingSideSwap: Boolean(source.pendingSideSwap),
    timeoutAUsed: Number.isFinite(Number(source.timeoutAUsed || 0))
      ? Math.max(0, Math.floor(Number(source.timeoutAUsed || 0)))
      : 0,
    timeoutBUsed: Number.isFinite(Number(source.timeoutBUsed || 0))
      ? Math.max(0, Math.floor(Number(source.timeoutBUsed || 0)))
      : 0,
    timeoutActiveFor:
      source.timeoutActiveFor === 'A' || source.timeoutActiveFor === 'B'
        ? (source.timeoutActiveFor as TeamId)
        : null,
    timeoutEndsAt:
      typeof source.timeoutEndsAt === 'number' && Number.isFinite(source.timeoutEndsAt)
        ? source.timeoutEndsAt
        : null,
    lastActionAt:
      typeof source.lastActionAt === 'number' && Number.isFinite(source.lastActionAt)
        ? source.lastActionAt
        : 0,
    warning: typeof source.warning === 'string' ? source.warning : null,
  };
}

function normalizeRestoredState(courtId: string, raw: MatchState | null): MatchState {
  const fallback = createInitialState(courtId);
  if (!raw || !raw.meta || !raw.config || !raw.core) {
    return fallback;
  }

  const queueMatches = Array.isArray(raw.meta.queueMatches)
    ? raw.meta.queueMatches
        .map((item, index) => normalizeQueueMatch(item, courtId, index))
        .filter(Boolean) as QueueMatch[]
    : [];

  const config: MatchState['config'] = {
    ...fallback.config,
    ...raw.config,
    winByTwo: Boolean(raw.config.winByTwo),
    setsToWin: raw.config.setsToWin === 1 ? 1 : 2,
    timeoutsPerTeam:
      raw.config.timeoutsPerTeam === 0 ||
      raw.config.timeoutsPerTeam === 1 ||
      raw.config.timeoutsPerTeam === 2
        ? raw.config.timeoutsPerTeam
        : fallback.config.timeoutsPerTeam,
    timeoutDurationSec:
      raw.config.timeoutDurationSec === 30 ||
      raw.config.timeoutDurationSec === 45 ||
      raw.config.timeoutDurationSec === 60
        ? raw.config.timeoutDurationSec
        : fallback.config.timeoutDurationSec,
    lockScoreDuringTimeout: Boolean(raw.config.lockScoreDuringTimeout),
    autoServeOnPoint:
      typeof raw.config.autoServeOnPoint === 'boolean'
        ? raw.config.autoServeOnPoint
        : fallback.config.autoServeOnPoint,
    timerModeMinutes:
      raw.config.timerModeMinutes === 0 ||
      raw.config.timerModeMinutes === 6 ||
      raw.config.timerModeMinutes === 9 ||
      raw.config.timerModeMinutes === 10 ||
      raw.config.timerModeMinutes === 15
        ? raw.config.timerModeMinutes
        : fallback.config.timerModeMinutes,
    division:
      raw.config.division === 'WW' || raw.config.division === 'MIX' ? raw.config.division : 'MM',
  };

  const meta = {
    ...fallback.meta,
    ...raw.meta,
    courtId: normalizeCourtId(raw.meta.courtId, courtId),
    matchName:
      String(raw.meta.matchName || fallback.meta.matchName).trim() || fallback.meta.matchName,
    judgeName: String(raw.meta.judgeName || '').trim(),
    groupLabel:
      String(raw.meta.groupLabel || fallback.meta.groupLabel).trim() || fallback.meta.groupLabel,
    queueMatches: queueMatches.length > 0 ? queueMatches : fallback.meta.queueMatches,
  };

  const coreFallback = {
    ...fallback.core,
    status: raw.core.status === 'set_setup' ? 'set_setup' : fallback.core.status,
  } as MatchCore;
  const core = normalizeCore(raw.core, coreFallback);

  return {
    meta,
    config,
    core,
    history: Array.isArray(raw.history)
      ? raw.history.map((entry) => normalizeCore(entry, coreFallback))
      : [],
    events: Array.isArray(raw.events)
      ? raw.events.map((entry) => normalizeEvent(entry)).filter(Boolean) as MatchEvent[]
      : [],
  };
}

export function JudgeScoreboardScreen({ courtId, readOnly = false }: Props) {
  const [state, dispatch] = useReducer(reducer, courtId, createInitialState);
  const hydratedRef = useRef(false);
  const suppressNextOutboundRef = useRef({ broadcast: false, server: false });
  const channelRef = useRef<{ send: (type: string, payload: unknown) => void; destroy: () => void } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const serverVersionRef = useRef(0);
  const [syncConnected, setSyncConnected] = useState(false);
  const senderId = useMemo(
    () => `judge-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let restored: MatchState | null = null;
      try {
        const response = await fetch(`/api/judge-scoreboard/${encodeURIComponent(courtId)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { state?: MatchState | null; version?: number }
            | null;
          if (payload?.state && typeof payload.state === 'object') {
            restored = payload.state;
            serverVersionRef.current = Number(payload.version || 0);
          }
        }
      } catch {
        // ignore, fallback to local
      }
      if (!restored) {
        restored = loadState(courtId);
      }
      if (cancelled) return;
      dispatch({ type: 'RESTORE', state: normalizeRestoredState(courtId, restored) });
      hydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [courtId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveState(courtId, state);
  }, [courtId, state]);

  useEffect(() => {
    channelRef.current?.destroy();
    channelRef.current = createJudgeRealtimeChannel(
      courtId,
      senderId,
      (message) => {
        if (message.type === 'sync_state' && message.payload) {
          suppressNextOutboundRef.current.broadcast = true;
          suppressNextOutboundRef.current.server = true;
          dispatch({ type: 'RESTORE', state: normalizeRestoredState(courtId, message.payload as MatchState) });
        }
      },
      setSyncConnected,
    );
    return () => {
      channelRef.current?.destroy();
      channelRef.current = null;
    };
  }, [courtId, senderId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (readOnly) return;
    if (suppressNextOutboundRef.current.broadcast) {
      suppressNextOutboundRef.current.broadcast = false;
      return;
    }
    channelRef.current?.send('sync_state', state);
  }, [courtId, senderId, state, readOnly]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (readOnly) return;
    if (suppressNextOutboundRef.current.server) {
      suppressNextOutboundRef.current.server = false;
      return;
    }
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/judge-scoreboard/${encodeURIComponent(courtId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            senderId,
            expectedVersion: serverVersionRef.current,
          }),
        });
        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as { version?: number } | null;
          serverVersionRef.current = Math.max(serverVersionRef.current, Number(payload?.version || 0));
        } else if (response.status === 409) {
          const payload = (await response.json().catch(() => null)) as
            | { snapshot?: { state?: MatchState | null; version?: number } }
            | null;
          const remote = payload?.snapshot?.state;
          if (remote && typeof remote === 'object') {
            serverVersionRef.current = Number(payload?.snapshot?.version || serverVersionRef.current);
            suppressNextOutboundRef.current.broadcast = true;
            suppressNextOutboundRef.current.server = true;
            dispatch({ type: 'RESTORE', state: normalizeRestoredState(courtId, remote) });
          }
        }
      } catch {
        // network loss: local state remains source until server returns
      }
    }, 280);
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [courtId, senderId, state, readOnly]);

  useEffect(() => {
    if (!readOnly) return;
    if (!hydratedRef.current) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/judge-scoreboard/${encodeURIComponent(courtId)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as
          | { state?: MatchState | null; version?: number }
          | null;
        const nextVersion = Number(payload?.version || 0);
        if (
          payload?.state &&
          typeof payload.state === 'object' &&
          nextVersion > serverVersionRef.current &&
          !stopped
        ) {
          serverVersionRef.current = nextVersion;
          suppressNextOutboundRef.current.broadcast = true;
          suppressNextOutboundRef.current.server = true;
          dispatch({ type: 'RESTORE', state: normalizeRestoredState(courtId, payload.state) });
        }
      } catch {
        // ignore poll failures
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [courtId, readOnly]);

  const handleStart = ({
    preset,
    teamA,
    teamB,
    teamAPlayers,
    teamBPlayers,
    matchName,
    judgeName,
    groupLabel,
    courtId: selectedCourtId,
  }: {
    preset: Preset;
    teamA: string;
    teamB: string;
    teamAPlayers: TeamPlayer[];
    teamBPlayers: TeamPlayer[];
    matchName: string;
    judgeName: string;
    groupLabel: string;
    courtId: string;
  }) => {
    dispatch({
      type: 'START_MATCH',
      meta: {
        courtId: selectedCourtId || courtId,
        matchName,
        judgeName,
        groupLabel,
        queueMatches: state.meta.queueMatches,
      },
      config: preset.config,
      teamA,
      teamB,
      teamAPlayers,
      teamBPlayers,
    });
  };

  const handleResume = () => {
    const restored = normalizeRestoredState(courtId, loadState(courtId));
    dispatch({ type: 'RESTORE', state: restored });
    void (async () => {
      try {
        const response = await fetch(`/api/judge-scoreboard/${encodeURIComponent(courtId)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as
          | { state?: MatchState | null; version?: number }
          | null;
        if (payload?.state && typeof payload.state === 'object') {
          serverVersionRef.current = Number(payload.version || 0);
          suppressNextOutboundRef.current.broadcast = true;
          suppressNextOutboundRef.current.server = true;
          dispatch({ type: 'RESTORE', state: normalizeRestoredState(courtId, payload.state) });
        }
      } catch {
        // keep local state when server unavailable
      }
    })();
  };

  const handleDiscardSaved = () => {
    clearState(courtId);
    dispatch({ type: 'RESTORE', state: createInitialState(courtId) });
  };

  if (state.core.status !== 'setup') {
    return <MatchScreen state={state} dispatch={dispatch} readOnly={readOnly} syncConnected={syncConnected} />;
  }

  if (readOnly) {
    return <MatchScreen state={state} dispatch={dispatch} readOnly syncConnected={syncConnected} />;
  }

  return (
    <SetupScreen
      courtId={courtId}
      savedState={state}
      onStart={handleStart}
      onResume={handleResume}
      onDiscardSaved={handleDiscardSaved}
    />
  );
}
