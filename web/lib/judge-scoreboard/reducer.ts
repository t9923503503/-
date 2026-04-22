import {
  canEndSetNow,
  getCurrentTarget,
  getSideSwapInterval,
  isMatchWon,
  shouldSwapSides,
} from './rules';
import {
  advanceServeTeamState,
  cloneTeamPlayers,
  createServeTeamState,
  getServePlayerRef,
  normalizeTeamPlayers,
} from './serve';
import type {
  MatchConfig,
  MatchCore,
  MatchEvent,
  MatchMeta,
  MatchState,
  MatchStatus,
  QueueMatch,
  TeamId,
  TeamPlayer,
} from './types';

const HISTORY_LIMIT = 300;
const EVENT_LIMIT = 1200;

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
      teamAPlayers: TeamPlayer[];
      teamBPlayers: TeamPlayer[];
    }
  | { type: 'APPLY_SET_SERVE_SETUP'; teamAOrder: TeamPlayer[]; teamBOrder: TeamPlayer[]; firstServer: TeamId; swapSides: boolean }
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

function makeDefaultTeamPlayers(team: TeamId): TeamPlayer[] {
  return normalizeTeamPlayers(null, '', team === 'A' ? 'a' : 'b');
}

function makeEmptyCore(): MatchCore {
  const teamAPlayers = makeDefaultTeamPlayers('A');
  const teamBPlayers = makeDefaultTeamPlayers('B');
  return {
    teamA: 'КОМАНДА A',
    teamB: 'КОМАНДА B',
    teamAPlayers,
    teamBPlayers,
    scoreA: 0,
    scoreB: 0,
    setsA: 0,
    setsB: 0,
    currentSet: 1,
    servingTeam: null,
    serveState: {
      A: createServeTeamState(teamAPlayers, 'a'),
      B: createServeTeamState(teamBPlayers, 'b'),
    },
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

function cloneCore(core: MatchCore): MatchCore {
  return {
    ...core,
    teamAPlayers: cloneTeamPlayers(core.teamAPlayers),
    teamBPlayers: cloneTeamPlayers(core.teamBPlayers),
    serveState: {
      A: {
        ...core.serveState.A,
        order: cloneTeamPlayers(core.serveState.A.order),
      },
      B: {
        ...core.serveState.B,
        order: cloneTeamPlayers(core.serveState.B.order),
      },
    },
  };
}

function scoreSnapshot(core: MatchCore) {
  return { A: core.scoreA, B: core.scoreB };
}

function buildEventBase(prevCore: MatchCore): Pick<MatchEvent, 'setNumber' | 'scoreBefore' | 'servingTeamBefore' | 'serverPlayerBefore'> {
  const servingTeamBefore = prevCore.servingTeam;
  return {
    setNumber: prevCore.currentSet,
    scoreBefore: scoreSnapshot(prevCore),
    servingTeamBefore,
    serverPlayerBefore: servingTeamBefore ? getServePlayerRef(prevCore.serveState[servingTeamBefore]) : null,
  };
}

function buildAfterServeFields(nextCore: MatchCore): Pick<MatchEvent, 'scoreAfter' | 'servingTeamAfter' | 'serverPlayerAfter'> {
  const servingTeamAfter = nextCore.servingTeam;
  return {
    scoreAfter: scoreSnapshot(nextCore),
    servingTeamAfter,
    serverPlayerAfter: servingTeamAfter ? getServePlayerRef(nextCore.serveState[servingTeamAfter]) : null,
  };
}

function resetServeStateForNewSet(core: MatchCore): MatchCore['serveState'] {
  return {
    A: createServeTeamState(core.serveState.A.order.length ? core.serveState.A.order : core.teamAPlayers, 'a'),
    B: createServeTeamState(core.serveState.B.order.length ? core.serveState.B.order : core.teamBPlayers, 'b'),
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
        ...cloneCore(prevCore),
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
      ...cloneCore(prevCore),
      setsA,
      setsB,
      currentSet: prevCore.currentSet + 1,
      scoreA: 0,
      scoreB: 0,
      servingTeam: null,
      serveState: resetServeStateForNewSet(prevCore),
      status: 'set_setup',
      timeoutActiveFor: null,
      timeoutEndsAt: null,
      lastSideSwapTotal: 0,
      pendingSideSwap: false,
      warning: null,
    },
    status: 'set_setup',
    winner: null,
  };
}

function applyRallyPointOnce(state: MatchState, team: TeamId): MatchState {
  const prevCore = state.core;
  if (prevCore.status !== 'playing') return state;
  if (state.config.lockScoreDuringTimeout && prevCore.timeoutActiveFor) {
    return { ...state, core: { ...cloneCore(prevCore), warning: 'Идет тайм-аут: ввод очков заблокирован.' } };
  }

  const nextCore = cloneCore(prevCore);
  const resolvedServingTeam = prevCore.servingTeam ?? team;
  const sideOut = resolvedServingTeam !== team;

  if (team === 'A') nextCore.scoreA += 1;
  if (team === 'B') nextCore.scoreB += 1;

  if (sideOut) {
    nextCore.serveState[resolvedServingTeam] = advanceServeTeamState(nextCore.serveState[resolvedServingTeam]);
  }
  nextCore.servingTeam = team;

  const interval = getSideSwapInterval(state.config, prevCore.currentSet);
  if (shouldSwapSides(nextCore.scoreA, nextCore.scoreB, prevCore.lastSideSwapTotal, interval)) {
    nextCore.pendingSideSwap = true;
  }

  nextCore.lastActionAt = Date.now();
  nextCore.warning = null;

  const event: MatchEvent = {
    id: makeEventId(),
    type: 'rally',
    team,
    timestamp: nextCore.lastActionAt,
    scoringTeam: team,
    isSideOut: sideOut,
    ...buildEventBase(prevCore),
    ...buildAfterServeFields(nextCore),
  };

  return {
    ...state,
    core: nextCore,
    history: pushHistory(state.history, cloneCore(prevCore)),
    events: pushEvent(state.events, event),
  };
}

function applyManualCorrection(state: MatchState, team: TeamId, delta: -1 | 1): MatchState {
  const prevCore = state.core;
  if (prevCore.status !== 'playing' && prevCore.status !== 'finished') return state;

  const nextCore = cloneCore(prevCore);
  if (team === 'A') nextCore.scoreA = Math.max(0, nextCore.scoreA + delta);
  if (team === 'B') nextCore.scoreB = Math.max(0, nextCore.scoreB + delta);
  nextCore.warning = null;
  nextCore.lastActionAt = Date.now();

  const event: MatchEvent = {
    id: makeEventId(),
    type: 'correction',
    team,
    timestamp: nextCore.lastActionAt,
    note: delta > 0 ? 'manual_plus' : 'manual_minus',
    scoringTeam: team,
    isSideOut: false,
    ...buildEventBase(prevCore),
    ...buildAfterServeFields(nextCore),
  };

  return {
    ...state,
    core: nextCore,
    history: pushHistory(state.history, cloneCore(prevCore)),
    events: pushEvent(state.events, event),
  };
}

export function reducer(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case 'START_MATCH': {
      const teamAPlayers = normalizeTeamPlayers(action.teamAPlayers, action.teamA, 'a');
      const teamBPlayers = normalizeTeamPlayers(action.teamBPlayers, action.teamB, 'b');
      const core: MatchCore = {
        teamA: action.teamA.trim() || 'КОМАНДА A',
        teamB: action.teamB.trim() || 'КОМАНДА B',
        teamAPlayers,
        teamBPlayers,
        scoreA: 0,
        scoreB: 0,
        setsA: 0,
        setsB: 0,
        currentSet: 1,
        servingTeam: null,
        serveState: {
          A: createServeTeamState(teamAPlayers, 'a'),
          B: createServeTeamState(teamBPlayers, 'b'),
        },
        leftTeam: 'A',
        status: 'set_setup',
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

    case 'APPLY_SET_SERVE_SETUP': {
      const prevCore = state.core;
      const teamAOrder = normalizeTeamPlayers(action.teamAOrder, prevCore.teamA, 'a');
      const teamBOrder = normalizeTeamPlayers(action.teamBOrder, prevCore.teamB, 'b');
      const nextCore = cloneCore(prevCore);
      nextCore.serveState = {
        A: createServeTeamState(teamAOrder, 'a'),
        B: createServeTeamState(teamBOrder, 'b'),
      };
      nextCore.servingTeam = action.firstServer;
      nextCore.status = 'playing';
      nextCore.warning = null;
      nextCore.lastActionAt = Date.now();
      if (action.swapSides) {
        nextCore.leftTeam = prevCore.leftTeam === 'A' ? 'B' : 'A';
        nextCore.sidesSwappedCount += 1;
      }

      const event: MatchEvent = {
        id: makeEventId(),
        type: 'serve_setup',
        team: action.firstServer,
        timestamp: nextCore.lastActionAt,
        note: action.swapSides ? 'swap_sides=1' : 'swap_sides=0',
        scoringTeam: null,
        isSideOut: false,
        ...buildEventBase(prevCore),
        ...buildAfterServeFields(nextCore),
      };

      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, event),
      };
    }

    case 'ADD_POINT': {
      let nextState = state;
      for (let index = 0; index < action.delta; index += 1) {
        nextState = applyRallyPointOnce(nextState, action.team);
      }
      return nextState;
    }

    case 'REMOVE_POINT':
      return applyManualCorrection(state, action.team, -1);

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const prev = cloneCore(state.history[state.history.length - 1]);
      return {
        ...state,
        core: { ...prev, warning: null, lastActionAt: Date.now() },
        history: state.history.slice(0, -1),
        events: state.events.slice(0, -1),
      };
    }

    case 'ACCEPT_SIDE_SWAP': {
      const prevCore = state.core;
      const total = prevCore.scoreA + prevCore.scoreB;
      const nextCore = cloneCore(prevCore);
      nextCore.leftTeam = prevCore.leftTeam === 'A' ? 'B' : 'A';
      nextCore.sidesSwappedCount = prevCore.sidesSwappedCount + 1;
      nextCore.lastSideSwapTotal = total;
      nextCore.pendingSideSwap = false;
      nextCore.warning = null;

      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'swap_sides',
          timestamp: Date.now(),
          note: 'auto_side_swap',
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
        }),
      };
    }

    case 'DISMISS_SIDE_SWAP': {
      const prevCore = state.core;
      return {
        ...state,
        core: {
          ...cloneCore(prevCore),
          pendingSideSwap: false,
          lastSideSwapTotal: prevCore.scoreA + prevCore.scoreB,
          warning: null,
        },
      };
    }

    case 'MANUAL_SWAP_SIDES': {
      const prevCore = state.core;
      const nextCore = cloneCore(prevCore);
      nextCore.leftTeam = prevCore.leftTeam === 'A' ? 'B' : 'A';
      nextCore.sidesSwappedCount = prevCore.sidesSwappedCount + 1;
      nextCore.warning = null;
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'swap_sides',
          timestamp: Date.now(),
          note: 'manual_side_swap',
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
        }),
      };
    }

    case 'TOGGLE_SERVER': {
      const prevCore = state.core;
      const nextCore = cloneCore(prevCore);
      nextCore.servingTeam = prevCore.servingTeam === 'A' ? 'B' : 'A';
      nextCore.warning = null;
      nextCore.lastActionAt = Date.now();
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'switch_serve',
          timestamp: nextCore.lastActionAt,
          note: 'manual_override',
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
        }),
      };
    }

    case 'DISPUTED_BALL': {
      const prevCore = state.core;
      if (prevCore.status !== 'playing') return state;
      const nextCore = cloneCore(prevCore);
      nextCore.scoreA += 1;
      nextCore.scoreB += 1;
      nextCore.warning = null;
      nextCore.lastActionAt = Date.now();
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'disputed_ball',
          timestamp: nextCore.lastActionAt,
          note: 'special_event',
          scoringTeam: null,
          isSideOut: false,
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
        }),
      };
    }

    case 'START_TIMEOUT': {
      const prevCore = state.core;
      if (prevCore.status !== 'playing') return state;
      if (prevCore.timeoutActiveFor) {
        return { ...state, core: { ...cloneCore(prevCore), warning: 'Тайм-аут уже активен.' } };
      }
      if (action.team === 'A' && prevCore.timeoutAUsed >= state.config.timeoutsPerTeam) {
        return { ...state, core: { ...cloneCore(prevCore), warning: 'Лимит тайм-аутов A исчерпан.' } };
      }
      if (action.team === 'B' && prevCore.timeoutBUsed >= state.config.timeoutsPerTeam) {
        return { ...state, core: { ...cloneCore(prevCore), warning: 'Лимит тайм-аутов B исчерпан.' } };
      }
      const nextCore = cloneCore(prevCore);
      nextCore.timeoutAUsed = action.team === 'A' ? prevCore.timeoutAUsed + 1 : prevCore.timeoutAUsed;
      nextCore.timeoutBUsed = action.team === 'B' ? prevCore.timeoutBUsed + 1 : prevCore.timeoutBUsed;
      nextCore.timeoutActiveFor = action.team;
      nextCore.timeoutEndsAt = action.now + state.config.timeoutDurationSec * 1000;
      nextCore.warning = null;
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'timeout',
          team: action.team,
          timestamp: action.now,
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
        }),
      };
    }

    case 'END_TIMEOUT': {
      const prevCore = state.core;
      if (!prevCore.timeoutActiveFor) return state;
      return {
        ...state,
        core: {
          ...cloneCore(prevCore),
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
        return { ...state, core: { ...cloneCore(prevCore), warning: verdict.reason } };
      }
      const { nextCore } = applySetFinish(prevCore, state.config);
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'end_set',
          timestamp: Date.now(),
          team: prevCore.scoreA > prevCore.scoreB ? 'A' : 'B',
          scoringTeam: prevCore.scoreA > prevCore.scoreB ? 'A' : 'B',
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
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
      const nextCore = cloneCore(prevCore);
      nextCore.status = 'finished';
      nextCore.winner = winner;
      nextCore.timeoutActiveFor = null;
      nextCore.timeoutEndsAt = null;
      nextCore.warning = null;
      return {
        ...state,
        core: nextCore,
        history: pushHistory(state.history, cloneCore(prevCore)),
        events: pushEvent(state.events, {
          id: makeEventId(),
          type: 'end_set',
          timestamp: Date.now(),
          note: 'finish_match',
          team: winner ?? undefined,
          scoringTeam: winner,
          ...buildEventBase(prevCore),
          ...buildAfterServeFields(nextCore),
        }),
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
          ...cloneCore(prevCore),
          teamA: action.team === 'A' ? trimmed : prevCore.teamA,
          teamB: action.team === 'B' ? trimmed : prevCore.teamB,
        },
      };
    }

    case 'LOAD_QUEUE_MATCH': {
      const match = state.meta.queueMatches.find((item) => item.id === action.id);
      if (!match) return state;
      const teamAPlayers = normalizeTeamPlayers(match.teamAPlayers, match.teamA, 'a');
      const teamBPlayers = normalizeTeamPlayers(match.teamBPlayers, match.teamB, 'b');
      return {
        ...state,
        meta: {
          ...state.meta,
          matchName: match.title,
          groupLabel: match.groupLabel,
          courtId: match.courtId || state.meta.courtId,
        },
        core: {
          ...cloneCore(state.core),
          teamA: match.teamA,
          teamB: match.teamB,
          teamAPlayers,
          teamBPlayers,
          scoreA: 0,
          scoreB: 0,
          setsA: 0,
          setsB: 0,
          currentSet: 1,
          servingTeam: null,
          serveState: {
            A: createServeTeamState(teamAPlayers, 'a'),
            B: createServeTeamState(teamBPlayers, 'b'),
          },
          status: 'set_setup',
          winner: null,
          timeoutAUsed: 0,
          timeoutBUsed: 0,
          timeoutActiveFor: null,
          timeoutEndsAt: null,
          warning: null,
          leftTeam: 'A',
          lastSideSwapTotal: 0,
          pendingSideSwap: false,
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
          ...cloneCore(state.core),
          warning: null,
        },
      };

    default:
      return state;
  }
}
