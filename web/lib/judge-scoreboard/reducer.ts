import {
  getCurrentTarget,
  getSideSwapInterval,
  isMatchWon,
  isSetWon,
  shouldSwapSides,
} from './rules';
import type { MatchConfig, MatchCore, MatchMeta, MatchState, MatchStatus, TeamId } from './types';

const HISTORY_LIMIT = 200;

export type Action =
  | {
      type: 'START_MATCH';
      meta: MatchMeta;
      config: MatchConfig;
      teamA: string;
      teamB: string;
      firstServer: TeamId;
    }
  | { type: 'ADD_POINT'; team: TeamId; delta: 1 | 2 | 3 }
  | { type: 'REMOVE_POINT'; team: TeamId }
  | { type: 'UNDO' }
  | { type: 'ACCEPT_SIDE_SWAP' }
  | { type: 'DISMISS_SIDE_SWAP' }
  | { type: 'MANUAL_SWAP_SIDES' }
  | { type: 'TOGGLE_SERVER' }
  | { type: 'RESET_SET' }
  | { type: 'FINISH_MATCH' }
  | { type: 'BACK_TO_SETUP' }
  | { type: 'RESTORE'; state: MatchState }
  | { type: 'UPDATE_META'; patch: Partial<MatchMeta> }
  | { type: 'UPDATE_TEAM_NAME'; team: TeamId; name: string };

function pushHistory(history: MatchCore[], core: MatchCore): MatchCore[] {
  const next = [...history, core];
  if (next.length > HISTORY_LIMIT) {
    return next.slice(next.length - HISTORY_LIMIT);
  }
  return next;
}

function makeEmptyCore(courtId: string): MatchCore {
  return {
    teamA: 'Команда A',
    teamB: 'Команда B',
    scoreA: 0,
    scoreB: 0,
    setsA: 0,
    setsB: 0,
    currentSet: 1,
    server: 'A',
    leftTeam: 'A',
    status: 'setup',
    winner: null,
    sidesSwappedCount: 0,
    lastSideSwapTotal: 0,
    pendingSideSwap: false,
  };
}

export function createInitialState(courtId: string): MatchState {
  return {
    meta: {
      courtId,
      matchName: `Корт ${courtId}`,
      judgeName: '',
    },
    config: {
      format: 'bo3',
      targetMain: 21,
      targetDecider: 15,
      winByTwo: true,
      setsToWin: 2,
    },
    core: makeEmptyCore(courtId),
    history: [],
  };
}

function applyScoreChange(
  state: MatchState,
  team: TeamId,
  delta: number,
): MatchState {
  const prevCore = state.core;
  if (prevCore.status !== 'playing') return state;

  let scoreA = prevCore.scoreA + (team === 'A' ? delta : 0);
  let scoreB = prevCore.scoreB + (team === 'B' ? delta : 0);
  if (scoreA < 0) scoreA = 0;
  if (scoreB < 0) scoreB = 0;

  const target = getCurrentTarget(state.config, prevCore.currentSet);
  const interval = getSideSwapInterval(state.config, prevCore.currentSet);

  let server: TeamId = prevCore.server;
  let setsA = prevCore.setsA;
  let setsB = prevCore.setsB;
  let currentSet = prevCore.currentSet;
  let status: MatchStatus = prevCore.status;
  let winner = prevCore.winner;
  let lastSideSwapTotal = prevCore.lastSideSwapTotal;
  let sidesSwappedCount = prevCore.sidesSwappedCount;
  let leftTeam = prevCore.leftTeam;
  let pendingSideSwap = prevCore.pendingSideSwap;

  if (delta > 0) {
    server = team;
  }

  const setWinner = isSetWon(scoreA, scoreB, target, state.config.winByTwo);
  if (setWinner) {
    if (setWinner === 'A') setsA += 1;
    else setsB += 1;

    const matchWinner = isMatchWon(setsA, setsB, state.config.setsToWin);
    if (matchWinner) {
      status = 'finished';
      winner = matchWinner;
    } else {
      currentSet += 1;
      scoreA = 0;
      scoreB = 0;
      lastSideSwapTotal = 0;
      // В решающем сете меняем стороны сразу — но это триггер уведомления,
      // не автоматический свап. Пусть судья подтвердит. Оставим без pending.
    }
  } else {
    // Проверяем свап сторон только пока сет идёт.
    if (shouldSwapSides(scoreA, scoreB, lastSideSwapTotal, interval)) {
      pendingSideSwap = true;
    }
  }

  const nextCore: MatchCore = {
    ...prevCore,
    scoreA,
    scoreB,
    setsA,
    setsB,
    currentSet,
    server,
    status,
    winner,
    lastSideSwapTotal,
    sidesSwappedCount,
    leftTeam,
    pendingSideSwap,
  };

  return {
    ...state,
    core: nextCore,
    history: pushHistory(state.history, prevCore),
  };
}

export function reducer(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case 'START_MATCH': {
      const core: MatchCore = {
        teamA: action.teamA.trim() || 'Команда A',
        teamB: action.teamB.trim() || 'Команда B',
        scoreA: 0,
        scoreB: 0,
        setsA: 0,
        setsB: 0,
        currentSet: 1,
        server: action.firstServer,
        leftTeam: 'A',
        status: 'playing',
        winner: null,
        sidesSwappedCount: 0,
        lastSideSwapTotal: 0,
        pendingSideSwap: false,
      };
      return {
        meta: action.meta,
        config: action.config,
        core,
        history: [],
      };
    }

    case 'ADD_POINT':
      return applyScoreChange(state, action.team, action.delta);

    case 'REMOVE_POINT':
      return applyScoreChange(state, action.team, -1);

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      return {
        ...state,
        core: prev,
        history: state.history.slice(0, -1),
      };
    }

    case 'ACCEPT_SIDE_SWAP': {
      const prevCore = state.core;
      const total = prevCore.scoreA + prevCore.scoreB;
      const nextCore: MatchCore = {
        ...prevCore,
        leftTeam: prevCore.leftTeam === 'A' ? 'B' : 'A',
        sidesSwappedCount: prevCore.sidesSwappedCount + 1,
        lastSideSwapTotal: total,
        pendingSideSwap: false,
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'DISMISS_SIDE_SWAP': {
      const prevCore = state.core;
      const total = prevCore.scoreA + prevCore.scoreB;
      return {
        ...state,
        core: {
          ...prevCore,
          pendingSideSwap: false,
          lastSideSwapTotal: total,
        },
      };
    }

    case 'MANUAL_SWAP_SIDES': {
      const prevCore = state.core;
      const nextCore: MatchCore = {
        ...prevCore,
        leftTeam: prevCore.leftTeam === 'A' ? 'B' : 'A',
        sidesSwappedCount: prevCore.sidesSwappedCount + 1,
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'TOGGLE_SERVER': {
      const prevCore = state.core;
      const nextCore: MatchCore = {
        ...prevCore,
        server: prevCore.server === 'A' ? 'B' : 'A',
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'RESET_SET': {
      const prevCore = state.core;
      const nextCore: MatchCore = {
        ...prevCore,
        scoreA: 0,
        scoreB: 0,
        lastSideSwapTotal: 0,
        pendingSideSwap: false,
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'FINISH_MATCH': {
      const prevCore = state.core;
      const winner =
        prevCore.winner ??
        (prevCore.setsA > prevCore.setsB
          ? 'A'
          : prevCore.setsB > prevCore.setsA
            ? 'B'
            : null);
      const nextCore: MatchCore = {
        ...prevCore,
        status: 'finished',
        winner,
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'BACK_TO_SETUP':
      return {
        ...state,
        core: makeEmptyCore(state.meta.courtId),
        history: [],
      };

    case 'RESTORE':
      return action.state;

    case 'UPDATE_META':
      return {
        ...state,
        meta: { ...state.meta, ...action.patch },
      };

    case 'UPDATE_TEAM_NAME': {
      const prevCore = state.core;
      const trimmed = action.name.trim();
      if (!trimmed) return state;
      const nextCore: MatchCore = {
        ...prevCore,
        teamA: action.team === 'A' ? trimmed : prevCore.teamA,
        teamB: action.team === 'B' ? trimmed : prevCore.teamB,
      };
      return { ...state, core: nextCore };
    }

    default:
      return state;
  }
}
