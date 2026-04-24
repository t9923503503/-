import type {
  ThaiJudgeMatchView,
  ThaiJudgePointHistoryEvent,
  ThaiJudgeScoreLine,
  ThaiJudgeServerPlayerRef,
  ThaiJudgeServeState,
  ThaiJudgeTeamView,
} from './types';

function judgeEventTimestamp(input?: string | null): string {
  const normalized = String(input || '').trim();
  if (normalized) return normalized;
  return new Date().toISOString();
}

function cloneScore(score: ThaiJudgeScoreLine): ThaiJudgeScoreLine {
  return {
    team1: Math.max(0, Math.trunc(Number(score.team1) || 0)),
    team2: Math.max(0, Math.trunc(Number(score.team2) || 0)),
  };
}

function getTeamPlayers(match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>, side: 1 | 2): ThaiJudgeTeamView['players'] {
  return side === 1 ? match.team1.players : match.team2.players;
}

function buildServerRef(
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>,
  side: 1 | 2,
  playerId: string | null | undefined,
): ThaiJudgeServerPlayerRef | null {
  if (!playerId) return null;
  const player = getTeamPlayers(match, side).find((entry) => entry.id === playerId);
  if (!player) return null;
  return {
    playerId: player.id,
    playerName: player.name,
    role: player.role,
    teamSide: side,
  };
}

function normalizeOrderForTeam(
  players: ThaiJudgeTeamView['players'],
  order: string[] | null | undefined,
): string[] | null {
  const availableIds = players.map((player) => player.id);
  if (!availableIds.length) return [];
  const normalized = Array.isArray(order)
    ? order
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : [];
  if (normalized.length !== availableIds.length) return null;
  const unique = new Set(normalized);
  if (unique.size !== availableIds.length) return null;
  if (availableIds.some((id) => !unique.has(id))) return null;
  return normalized;
}

function normalizeCurrentIndex(index: unknown, length: number): number {
  if (length <= 0) return 0;
  const parsed = Math.trunc(Number(index) || 0);
  return ((parsed % length) + length) % length;
}

function currentPlayerId(order: string[], currentIndex: number): string | null {
  if (!order.length) return null;
  return order[normalizeCurrentIndex(currentIndex, order.length)] ?? null;
}

export function normalizeThaiJudgeServeState(
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>,
  input: ThaiJudgeServeState | null | undefined,
): ThaiJudgeServeState | null {
  if (!input) return null;
  const servingSide = input.servingSide === 2 ? 2 : input.servingSide === 1 ? 1 : null;
  if (!servingSide) return null;
  const team1Order = normalizeOrderForTeam(match.team1.players, input.team1Order);
  const team2Order = normalizeOrderForTeam(match.team2.players, input.team2Order);
  if (!team1Order || !team2Order) return null;
  return {
    servingSide,
    team1Order,
    team2Order,
    team1CurrentIndex: normalizeCurrentIndex(input.team1CurrentIndex, team1Order.length),
    team2CurrentIndex: normalizeCurrentIndex(input.team2CurrentIndex, team2Order.length),
  };
}

export function buildThaiJudgeServeStateFromSetup(
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>,
  input: {
    servingSide: 1 | 2;
    team1FirstServerId: string;
    team2FirstServerId: string;
  },
): ThaiJudgeServeState | null {
  const buildOrder = (players: ThaiJudgeTeamView['players'], firstServerId: string): string[] | null => {
    const normalizedFirst = String(firstServerId || '').trim();
    if (!normalizedFirst) return null;
    const playerIds = players.map((player) => player.id);
    if (!playerIds.includes(normalizedFirst)) return null;
    return [normalizedFirst, ...playerIds.filter((id) => id !== normalizedFirst)];
  };

  const team1Order = buildOrder(match.team1.players, input.team1FirstServerId);
  const team2Order = buildOrder(match.team2.players, input.team2FirstServerId);
  if (!team1Order || !team2Order) return null;

  return {
    servingSide: input.servingSide === 2 ? 2 : 1,
    team1Order,
    team2Order,
    team1CurrentIndex: 0,
    team2CurrentIndex: 0,
  };
}

export function getThaiJudgeCurrentServer(
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>,
  serveState: ThaiJudgeServeState | null | undefined,
): ThaiJudgeServerPlayerRef | null {
  const normalized = normalizeThaiJudgeServeState(match, serveState);
  if (!normalized) return null;
  const order = normalized.servingSide === 1 ? normalized.team1Order : normalized.team2Order;
  const index = normalized.servingSide === 1 ? normalized.team1CurrentIndex : normalized.team2CurrentIndex;
  return buildServerRef(match, normalized.servingSide, currentPlayerId(order, index));
}

export function getThaiJudgeTeamServer(
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>,
  serveState: ThaiJudgeServeState | null | undefined,
  side: 1 | 2,
  mode: 'current' | 'next' = 'current',
): ThaiJudgeServerPlayerRef | null {
  const normalized = normalizeThaiJudgeServeState(match, serveState);
  if (!normalized) return null;
  const order = side === 1 ? normalized.team1Order : normalized.team2Order;
  const currentIndex = side === 1 ? normalized.team1CurrentIndex : normalized.team2CurrentIndex;
  const targetIndex = mode === 'next' ? currentIndex + 1 : currentIndex;
  return buildServerRef(match, side, currentPlayerId(order, targetIndex));
}

export function applyThaiJudgeRally(input: {
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>;
  currentScore: ThaiJudgeScoreLine;
  serveState: ThaiJudgeServeState;
  scoringSide: 1 | 2;
  history: ThaiJudgePointHistoryEvent[];
  pointLimit?: number | null;
  recordedAt?: string | null;
}): {
  nextScore: ThaiJudgeScoreLine;
  nextServeState: ThaiJudgeServeState;
  event: ThaiJudgePointHistoryEvent;
} {
  const normalizedServe = normalizeThaiJudgeServeState(input.match, input.serveState);
  if (!normalizedServe) {
    throw new Error('Serve state is required before logging a rally');
  }

  const scoreBefore = cloneScore(input.currentScore);
  const rawScoreAfter = cloneScore({
    team1: scoreBefore.team1 + (input.scoringSide === 1 ? 1 : 0),
    team2: scoreBefore.team2 + (input.scoringSide === 2 ? 1 : 0),
  });
  const normalizedPointLimit = Math.max(0, Math.trunc(Number(input.pointLimit) || 0));
  const scoreAfter =
    normalizedPointLimit > 0
      ? {
          team1: Math.min(rawScoreAfter.team1, normalizedPointLimit),
          team2: Math.min(rawScoreAfter.team2, normalizedPointLimit),
        }
      : rawScoreAfter;
  const serverPlayerBefore = getThaiJudgeCurrentServer(input.match, normalizedServe);
  const isSideOut = normalizedServe.servingSide !== input.scoringSide;

  const nextServeState: ThaiJudgeServeState = {
    ...normalizedServe,
    team1Order: normalizedServe.team1Order.slice(),
    team2Order: normalizedServe.team2Order.slice(),
  };

  if (isSideOut) {
    if (normalizedServe.servingSide === 1) {
      nextServeState.team1CurrentIndex = normalizeCurrentIndex(
        normalizedServe.team1CurrentIndex + 1,
        normalizedServe.team1Order.length,
      );
    } else {
      nextServeState.team2CurrentIndex = normalizeCurrentIndex(
        normalizedServe.team2CurrentIndex + 1,
        normalizedServe.team2Order.length,
      );
    }
    nextServeState.servingSide = input.scoringSide;
  }

  const serverPlayerAfter = getThaiJudgeCurrentServer(input.match, nextServeState);
  return {
    nextScore: scoreAfter,
    nextServeState,
    event: {
      seqNo: input.history.length + 1,
      kind: 'rally',
      recordedAt: judgeEventTimestamp(input.recordedAt),
      scoringSide: input.scoringSide,
      scoreBefore,
      scoreAfter,
      servingSideBefore: normalizedServe.servingSide,
      serverPlayerBefore,
      servingSideAfter: nextServeState.servingSide,
      serverPlayerAfter,
      isSideOut,
    },
  };
}

export function buildThaiJudgeCorrectionEvent(input: {
  match: Pick<ThaiJudgeMatchView, 'team1' | 'team2'>;
  currentScore: ThaiJudgeScoreLine;
  nextScore: ThaiJudgeScoreLine;
  serveState: ThaiJudgeServeState | null;
  history: ThaiJudgePointHistoryEvent[];
  preserveServeState?: boolean;
  recordedAt?: string | null;
}): ThaiJudgePointHistoryEvent {
  const normalizedServe = normalizeThaiJudgeServeState(input.match, input.serveState);
  const scoreBefore = cloneScore(input.currentScore);
  const scoreAfter = cloneScore(input.nextScore);
  const preserveServeState = Boolean(input.preserveServeState && normalizedServe);
  return {
    seqNo: input.history.length + 1,
    kind: 'correction',
    recordedAt: judgeEventTimestamp(input.recordedAt),
    scoringSide: null,
    scoreBefore,
    scoreAfter,
    servingSideBefore: normalizedServe?.servingSide ?? null,
    serverPlayerBefore: normalizedServe ? getThaiJudgeCurrentServer(input.match, normalizedServe) : null,
    servingSideAfter: preserveServeState ? normalizedServe!.servingSide : null,
    serverPlayerAfter: preserveServeState ? getThaiJudgeCurrentServer(input.match, normalizedServe) : null,
    isSideOut: false,
  };
}
