import {
  canEndSetNow,
  getCurrentTarget,
  getSideSwapInterval,
  isMatchWon,
  shouldSwapSides,
} from './rules';
import type {
  MatchConfig,
  MatchCore,
  MatchEvent,
  MatchMeta,
  MatchState,
  MatchStatus,
  QueueMatch,
  TeamId,
} from './types';

const HISTORY_LIMIT = 200;
const EVENT_LIMIT = 200;

function makeEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  | { type: 'DISPUTED_BALL' }
  | { type: 'START_TIMEOUT'; team: TeamId; now: number }
  | { type: 'END_TIMEOUT' }
  | { type: 'END_SET'; force: boolean }
  | { type: 'FINISH_MATCH' }
  | { type: 'BACK_TO_SETUP' }
  | { type: 'RESTORE'; state: MatchState }
  | { type: 'UPDATE_META'; patch: Partial<MatchMeta> }
  | { type: 'UPDATE_TEAM_NAME'; team: TeamId; name: string }
  | { type: 'LOAD_QUEUE_MATCH'; id: string }
  | { type: 'REORDER_QUEUE'; fromId: string; toId: string }
  | { type: 'CLEAR_WARNING' };

function pushHistory(history: MatchCore[], core: MatchCore): MatchCore[] {
  const next = [...history, core];
  if (next.length > HISTORY_LIMIT) {
    return next.slice(next.length - HISTORY_LIMIT);
  }
  return next;
}

function pushEvent(events: MatchEvent[], event: MatchEvent): MatchEvent[] {
  const next = [...events, event];
  if (next.length > EVENT_LIMIT) {
    return next.slice(next.length - EVENT_LIMIT);
  }
  return next;
}

function makeDefaultQueue(courtId: string): QueueMatch[] {
  return Array.from({ length: 4 }).map((_, idx) => ({
    id: `q-${idx + 1}`,
    title: `MATCH ${idx + 1}`,
    teamA: `Команда ${idx * 2 + 1}`,
    teamB: `Команда ${idx * 2 + 2}`,
    groupLabel: 'GROUP B',
    courtId,
  }));
}

function makeEmptyCore(): MatchCore {
  return {
    teamA: 'КОМАНДА A',
    teamB: 'КОМАНДА B',
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
    timeoutAUsed: 0,
    timeoutBUsed: 0,
    timeoutActiveFor: null,
    timeoutEndsAt: null,
    lastActionAt: 0,
    warning: null,
  };
}

export function createInitialState(courtId: string): MatchState {
  return {
    meta: {
      courtId,
      matchName: `КОРТ ${courtId}`,
      judgeName: '',
      groupLabel: 'GROUP B',
      queueMatches: makeDefaultQueue(courtId),
    },
    config: {
      format: 'single21',
      targetMain: 21,
      targetDecider: 21,
      winByTwo: true,
      setsToWin: 1,
      timeoutsPerTeam: 1,
      timeoutDurationSec: 45,
      lockScoreDuringTimeout: false,
      autoServeOnPoint: true,
      timerModeMinutes: 0,
      division: 'MM',
    },
    core: makeEmptyCore(),
    history: [],
    events: [],
  };
}

function applySetFinish(
  prevCore: MatchCore,
  config: MatchConfig,
): { nextCore: MatchCore; status: MatchStatus; winner: TeamId | null } {
  let setsA = prevCore.setsA;
  let setsB = prevCore.setsB;
  if (prevCore.scoreA > prevCore.scoreB) {
    setsA += 1;
  } else {
    setsB += 1;
  }
  const matchWinner = isMatchWon(setsA, setsB, config.setsToWin);
  if (matchWinner) {
    return {
      nextCore: {
        ...prevCore,
        setsA,
        setsB,
        status: 'finished',
        winner: matchWinner,
        warning: null,
      },
      status: 'finished',
      winner: matchWinner,
    };
  }

  return {
    nextCore: {
      ...prevCore,
      setsA,
      setsB,
      currentSet: prevCore.currentSet + 1,
      scoreA: 0,
      scoreB: 0,
      timeoutActiveFor: null,
      timeoutEndsAt: null,
      lastSideSwapTotal: 0,
      pendingSideSwap: false,
      warning: null,
    },
    status: 'playing',
    winner: null,
  };
}

function applyScoreChange(state: MatchState, team: TeamId, delta: number): MatchState {
  const prevCore = state.core;
  if (prevCore.status !== 'playing') return state;
  if (state.config.lockScoreDuringTimeout && prevCore.timeoutActiveFor) {
    return { ...state, core: { ...prevCore, warning: 'Идет тайм-аут: ввод очков заблокирован.' } };
  }

  let scoreA = prevCore.scoreA + (team === 'A' ? delta : 0);
  let scoreB = prevCore.scoreB + (team === 'B' ? delta : 0);
  if (scoreA < 0) scoreA = 0;
  if (scoreB < 0) scoreB = 0;

  const interval = getSideSwapInterval(state.config, prevCore.currentSet);
  let server: TeamId = prevCore.server;
  if (delta > 0 && state.config.autoServeOnPoint) {
    server = team;
  }

  let pendingSideSwap = prevCore.pendingSideSwap;
  const total = scoreA + scoreB;
  if (shouldSwapSides(scoreA, scoreB, prevCore.lastSideSwapTotal, interval)) {
    pendingSideSwap = true;
  }

  const nextCore: MatchCore = {
    ...prevCore,
    scoreA,
    scoreB,
    server,
    pendingSideSwap,
    lastActionAt: Date.now(),
    warning: null,
  };

  const event: MatchEvent = {
    id: makeEventId(),
    type: delta > 0 ? 'add_point' : 'remove_point',
    team,
    timestamp: Date.now(),
  };

  return {
    ...state,
    core: nextCore,
    history: pushHistory(state.history, prevCore),
    events: pushEvent(state.events, event),
  };
}

export function reducer(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case 'START_MATCH': {
      const core: MatchCore = {
        teamA: action.teamA.trim() || 'КОМАНДА A',
        teamB: action.teamB.trim() || 'КОМАНДА B',
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
        timeoutAUsed: 0,
        timeoutBUsed: 0,
        timeoutActiveFor: null,
        timeoutEndsAt: null,
        lastActionAt: Date.now(),
        warning: null,
      };
      return {
        meta: action.meta,
        config: action.config,
        core,
        history: [],
        events: [],
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
        core: { ...prev, warning: null, lastActionAt: Date.now() },
        history: state.history.slice(0, -1),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'undo',
          timestamp: Date.now(),
        }),
      };
    }

    case 'ACCEPT_SIDE_SWAP': {
      const prevCore = state.core;
      const total = prevCore.scoreA + prevCore.scoreB;
      return {
        ...state,
        core: {
          ...prevCore,
          leftTeam: prevCore.leftTeam === 'A' ? 'B' : 'A',
          sidesSwappedCount: prevCore.sidesSwappedCount + 1,
          lastSideSwapTotal: total,
          pendingSideSwap: false,
          warning: null,
        },
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'DISMISS_SIDE_SWAP': {
      const prevCore = state.core;
      return {
        ...state,
        core: {
          ...prevCore,
          pendingSideSwap: false,
          lastSideSwapTotal: prevCore.scoreA + prevCore.scoreB,
          warning: null,
        },
      };
    }

    case 'MANUAL_SWAP_SIDES': {
      const prevCore = state.core;
      return {
        ...state,
        core: {
          ...prevCore,
          leftTeam: prevCore.leftTeam === 'A' ? 'B' : 'A',
          sidesSwappedCount: prevCore.sidesSwappedCount + 1,
          warning: null,
        },
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'TOGGLE_SERVER': {
      const prevCore = state.core;
      return {
        ...state,
        core: {
          ...prevCore,
          server: prevCore.server === 'A' ? 'B' : 'A',
          warning: null,
        },
        history: pushHistory(state.history, prevCore),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'switch_serve',
          timestamp: Date.now(),
        }),
      };
    }

    case 'DISPUTED_BALL': {
      const prevCore = state.core;
      if (prevCore.status !== 'playing') return state;
      const nextCore: MatchCore = {
        ...prevCore,
        scoreA: prevCore.scoreA + 1,
        scoreB: prevCore.scoreB + 1,
        warning: null,
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'disputed_ball',
          timestamp: Date.now(),
          note: 'special event',
        }),
      };
    }

    case 'START_TIMEOUT': {
      const prevCore = state.core;
      if (prevCore.status !== 'playing') return state;
      if (prevCore.timeoutActiveFor) {
        return { ...state, core: { ...prevCore, warning: 'Тайм-аут уже активен.' } };
      }
      if (action.team === 'A' && prevCore.timeoutAUsed >= state.config.timeoutsPerTeam) {
        return { ...state, core: { ...prevCore, warning: 'Лимит тайм-аутов A исчерпан.' } };
      }
      if (action.team === 'B' && prevCore.timeoutBUsed >= state.config.timeoutsPerTeam) {
        return { ...state, core: { ...prevCore, warning: 'Лимит тайм-аутов B исчерпан.' } };
      }
      const nextCore: MatchCore = {
        ...prevCore,
        timeoutAUsed: action.team === 'A' ? prevCore.timeoutAUsed + 1 : prevCore.timeoutAUsed,
        timeoutBUsed: action.team === 'B' ? prevCore.timeoutBUsed + 1 : prevCore.timeoutBUsed,
        timeoutActiveFor: action.team,
        timeoutEndsAt: action.now + state.config.timeoutDurationSec * 1000,
        warning: null,
      };
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'timeout',
          team: action.team,
          timestamp: action.now,
        }),
      };
    }

    case 'END_TIMEOUT': {
      const prevCore = state.core;
      if (!prevCore.timeoutActiveFor) return state;
      return {
        ...state,
        core: {
          ...prevCore,
          timeoutActiveFor: null,
          timeoutEndsAt: null,
          warning: null,
        },
      };
    }

    case 'END_SET': {
      const prevCore = state.core;
      if (prevCore.status !== 'playing') return state;
      const target = getCurrentTarget(state.config, prevCore.currentSet);
      const verdict = canEndSetNow(prevCore.scoreA, prevCore.scoreB, target, state.config.winByTwo);
      if (!verdict.ok && !action.force) {
        return { ...state, core: { ...prevCore, warning: verdict.reason } };
      }
      const { nextCore } = applySetFinish(prevCore, state.config);
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, prevCore),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'end_set',
          timestamp: Date.now(),
        }),
      };
    }

    case 'FINISH_MATCH': {
      const prevCore = state.core;
      const winner =
        prevCore.scoreA === prevCore.scoreB
          ? prevCore.winner
          : prevCore.scoreA > prevCore.scoreB
            ? 'A'
            : 'B';
      return {
        ...state,
        core: {
          ...prevCore,
          status: 'finished',
          winner,
          timeoutActiveFor: null,
          timeoutEndsAt: null,
          warning: null,
        },
        history: pushHistory(state.history, prevCore),
      };
    }

    case 'BACK_TO_SETUP':
      return {
        ...state,
        core: makeEmptyCore(),
        history: [],
        events: [],
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
      return {
        ...state,
        core: {
          ...prevCore,
          teamA: action.team === 'A' ? trimmed : prevCore.teamA,
          teamB: action.team === 'B' ? trimmed : prevCore.teamB,
        },
      };
    }

    case 'LOAD_QUEUE_MATCH': {
      const match = state.meta.queueMatches.find((item) => item.id === action.id);
      if (!match) return state;
      return {
        ...state,
        meta: {
          ...state.meta,
          matchName: match.title,
          groupLabel: match.groupLabel,
          courtId: match.courtId || state.meta.courtId,
        },
        core: {
          ...state.core,
          teamA: match.teamA,
          teamB: match.teamB,
          scoreA: 0,
          scoreB: 0,
          setsA: 0,
          setsB: 0,
          currentSet: 1,
          status: 'playing',
          winner: null,
          timeoutAUsed: 0,
          timeoutBUsed: 0,
          timeoutActiveFor: null,
          timeoutEndsAt: null,
          warning: null,
        },
        history: [],
        events: [],
      };
    }

    case 'REORDER_QUEUE': {
      const fromIndex = state.meta.queueMatches.findIndex((item) => item.id === action.fromId);
      const toIndex = state.meta.queueMatches.findIndex((item) => item.id === action.toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state;
      const nextQueue = [...state.meta.queueMatches];
      const [moved] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, moved);
      return {
        ...state,
        meta: {
          ...state.meta,
          queueMatches: nextQueue,
        },
      };
    }

    case 'CLEAR_WARNING':
      return {
        ...state,
        core: {
          ...state.core,
          warning: null,
        },
      };

    default:
      return state;
  }
}
