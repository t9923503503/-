'use client';

import { useEffect, useReducer, useRef } from 'react';
import { MatchScreen } from './MatchScreen';
import { SetupScreen } from './SetupScreen';
import { clearState, loadState, saveState } from '@/lib/judge-scoreboard/storage';
import { createInitialState, reducer } from '@/lib/judge-scoreboard/reducer';
import type { MatchState, Preset, TeamId } from '@/lib/judge-scoreboard/types';

interface Props {
  courtId: string;
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
    },
    config: {
      ...fallback.config,
      ...raw.config,
      winByTwo: true,
      setsToWin: raw.config.setsToWin === 1 ? 1 : 2,
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
    },
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

export function JudgeScoreboardScreen({ courtId }: Props) {
  const [state, dispatch] = useReducer(reducer, courtId, createInitialState);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const restored = normalizeRestoredState(courtId, loadState(courtId));
    dispatch({ type: 'RESTORE', state: restored });
    hydratedRef.current = true;
  }, [courtId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveState(courtId, state);
  }, [courtId, state]);

  const handleStart = ({
    preset,
    teamA,
    teamB,
    firstServer,
    matchName,
    judgeName,
  }: {
    preset: Preset;
    teamA: string;
    teamB: string;
    firstServer: TeamId;
    matchName: string;
    judgeName: string;
  }) => {
    dispatch({
      type: 'START_MATCH',
      meta: {
        courtId,
        matchName,
        judgeName,
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
  };

  const handleDiscardSaved = () => {
    clearState(courtId);
    dispatch({ type: 'RESTORE', state: createInitialState(courtId) });
  };

  if (state.core.status === 'playing' || state.core.status === 'finished') {
    return <MatchScreen state={state} dispatch={dispatch} />;
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
