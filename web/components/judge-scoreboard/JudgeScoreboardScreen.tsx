'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MatchScreen } from './MatchScreen';
import { SetupScreen } from './SetupScreen';
import { clearState, loadState, saveState } from '@/lib/judge-scoreboard/storage';
import { createInitialState, reducer } from '@/lib/judge-scoreboard/reducer';
import { createJudgeRealtimeChannel } from '@/lib/judge-scoreboard/realtime';
import type { MatchState, Preset, TeamId } from '@/lib/judge-scoreboard/types';

interface Props {
  courtId: string;
  readOnly?: boolean;
}

function normalizeRestoredState(courtId: string, raw: MatchState | null): MatchState {
  const fallback = createInitialState(courtId);
  if (!raw || !raw.meta || !raw.config || !raw.core) {
    return fallback;
  }

  return {
    meta: {
      ...fallback.meta,
      ...raw.meta,
      courtId: String(raw.meta.courtId || courtId || fallback.meta.courtId).trim() || courtId,
      matchName:
        String(raw.meta.matchName || fallback.meta.matchName).trim() || fallback.meta.matchName,
      judgeName: String(raw.meta.judgeName || '').trim(),
      groupLabel:
        String(raw.meta.groupLabel || fallback.meta.groupLabel).trim() || fallback.meta.groupLabel,
      queueMatches:
        Array.isArray(raw.meta.queueMatches) && raw.meta.queueMatches.length > 0
          ? raw.meta.queueMatches
          : fallback.meta.queueMatches,
    },
    config: {
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
    },
    core: {
      ...fallback.core,
      ...raw.core,
      teamA: String(raw.core.teamA || fallback.core.teamA).trim() || fallback.core.teamA,
      teamB: String(raw.core.teamB || fallback.core.teamB).trim() || fallback.core.teamB,
      server: raw.core.server === 'B' ? 'B' : 'A',
      leftTeam: raw.core.leftTeam === 'B' ? 'B' : 'A',
      status:
        raw.core.status === 'playing' || raw.core.status === 'finished'
          ? raw.core.status
          : 'setup',
      winner: raw.core.winner === 'A' || raw.core.winner === 'B' ? raw.core.winner : null,
      timeoutAUsed: Number.isFinite(raw.core.timeoutAUsed) ? Math.max(0, raw.core.timeoutAUsed) : 0,
      timeoutBUsed: Number.isFinite(raw.core.timeoutBUsed) ? Math.max(0, raw.core.timeoutBUsed) : 0,
      timeoutActiveFor:
        raw.core.timeoutActiveFor === 'A' || raw.core.timeoutActiveFor === 'B'
          ? raw.core.timeoutActiveFor
          : null,
      timeoutEndsAt:
        typeof raw.core.timeoutEndsAt === 'number' && Number.isFinite(raw.core.timeoutEndsAt)
          ? raw.core.timeoutEndsAt
          : null,
      lastActionAt:
        typeof raw.core.lastActionAt === 'number' && Number.isFinite(raw.core.lastActionAt)
          ? raw.core.lastActionAt
          : 0,
      warning: typeof raw.core.warning === 'string' ? raw.core.warning : null,
    },
    history: Array.isArray(raw.history) ? raw.history : [],
    events: Array.isArray(raw.events) ? raw.events : [],
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
    firstServer,
    matchName,
    judgeName,
    groupLabel,
    courtId: selectedCourtId,
  }: {
    preset: Preset;
    teamA: string;
    teamB: string;
    firstServer: TeamId;
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
      firstServer,
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

  if (state.core.status === 'playing' || state.core.status === 'finished') {
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
