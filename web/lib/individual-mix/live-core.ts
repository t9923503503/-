import { calculateIndividualMixStandings } from './core';
import {
  INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT,
  INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION,
  INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2,
  buildSixPairHybridScheduleForVersion,
  validateSixPairHybridSchedule,
  type IndividualMixSixPairRulesVersion,
} from './six-pair-hybrid';
import type {
  IndividualMixGame,
  IndividualMixGameResult,
  IndividualMixPlayer,
  IndividualMixPoolSchedule,
  IndividualMixResultKind,
  IndividualMixStandingRow,
} from './types';

export const INDIVIDUAL_MIX_LIVE_STATE_SCHEMA_VERSION = 1;

export type IndividualMixLiveStatus = 'active' | 'finalized' | 'cancelled';
export type IndividualMixLiveActorKind = 'admin' | 'operator' | 'judge' | 'offline_master' | 'system';

export interface IndividualMixLiveActualPlayer {
  slotPlayerId: string;
  playerId: string;
  name: string;
}

export interface IndividualMixLiveResult extends IndividualMixGameResult {
  actualLeft: [IndividualMixLiveActualPlayer, IndividualMixLiveActualPlayer];
  actualRight: [IndividualMixLiveActualPlayer, IndividualMixLiveActualPlayer];
  recordedAt: string;
  recordedBy: string;
  recordedRevision: number;
}

export interface IndividualMixReplacement {
  id: string;
  slotPlayerId: string;
  replacedPlayerId: string;
  playerId: string;
  playerName: string;
  effectiveFromGameId: string;
  effectiveOrder: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface IndividualMixLiveAction {
  commandId: string;
  type: IndividualMixLiveCommand['type'];
  actorKind: IndividualMixLiveActorKind;
  actorId: string;
  courtNo: number | null;
  gameId?: string;
  targetCommandId?: string;
  reason?: string;
  beforeResult?: IndividualMixLiveResult;
  afterResult?: IndividualMixLiveResult;
  undoneByCommandId?: string;
  createdAt: string;
  revision: number;
}

export interface IndividualMixFinalStanding extends IndividualMixStandingRow {
  slotLabel: string;
  ratingEligible: boolean;
}

export type IndividualMixPostseasonMode = 'semifinals' | 'direct_medals';
export type IndividualMixPostseasonStage = 'semifinal' | 'gold' | 'bronze';

export interface IndividualMixPairStanding {
  pairNo: number;
  playerIds: [string, string];
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  position: number;
}

export interface IndividualMixPostseasonGame extends IndividualMixGame {
  postseasonStage: IndividualMixPostseasonStage;
}

export interface IndividualMixPostseason {
  mode: IndividualMixPostseasonMode;
  status: 'active' | 'complete';
  seededAt: string;
  seededBy: string;
  pairStandings: IndividualMixPairStanding[];
  games: IndividualMixPostseasonGame[];
  finalPairOrder?: number[];
}

export interface IndividualMixLiveState {
  presetVersion: IndividualMixSixPairRulesVersion;
  stateSchemaVersion: typeof INDIVIDUAL_MIX_LIVE_STATE_SCHEMA_VERSION;
  scheduleRevision: string;
  rosterFingerprint: string;
  pointLimit: typeof INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT;
  currentRound: number;
  status: IndividualMixLiveStatus;
  preparedAt: string;
  finalizedAt?: string;
  tournamentStatusBeforeFinalize?: string;
  schedule: IndividualMixPoolSchedule;
  results: Record<string, IndividualMixLiveResult>;
  replacements: IndividualMixReplacement[];
  actions: IndividualMixLiveAction[];
  postseason?: IndividualMixPostseason;
  finalStandings?: IndividualMixFinalStanding[];
}

export type IndividualMixLiveScorePayload = {
  gameId: string;
  leftScore: number;
  rightScore: number;
  kind: IndividualMixResultKind;
  reason?: string;
};

export type IndividualMixLiveCommand =
  | { type: 'record_score'; payload: IndividualMixLiveScorePayload }
  | { type: 'undo_last'; payload: { courtNo?: number } }
  | { type: 'correct_score'; payload: IndividualMixLiveScorePayload & { reason: string } }
  | {
      type: 'replace_player';
      payload: {
        slotPlayerId: string;
        playerId: string;
        playerName: string;
        gender: 'M' | 'W';
        reason: string;
      };
    }
  | { type: 'rebuild_schedule'; payload: { reason: string } }
  | { type: 'restore_snapshot'; payload: { snapshotId: string; reason: string } }
  | { type: 'start_postseason'; payload: { mode: IndividualMixPostseasonMode; reason?: string } }
  | { type: 'finalize'; payload: { clientQueueDepth: number; clientHasConflict: boolean; reason?: string } };

export interface IndividualMixLiveCommandContext {
  commandId: string;
  actorKind: IndividualMixLiveActorKind;
  actorId: string;
  courtNo: number | null;
  now: string;
  nextRevision: number;
  replacementState?: IndividualMixLiveState;
  tournamentStatusBeforeFinalize?: string;
}

export class IndividualMixLiveDomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getIndividualMixLiveGames(state: Pick<IndividualMixLiveState, 'schedule'>): IndividualMixGame[] {
  return state.schedule.rounds.flatMap((round) =>
    round.duels.flatMap((duel) => duel.games),
  );
}

export function getIndividualMixAllGames(
  state: Pick<IndividualMixLiveState, 'schedule' | 'postseason'>,
): IndividualMixGame[] {
  return [...getIndividualMixLiveGames(state), ...(state.postseason?.games ?? [])];
}

export function calculateIndividualMixPairStandings(
  state: Pick<IndividualMixLiveState, 'schedule' | 'results'>,
): IndividualMixPairStanding[] {
  const regularGameIds = new Set(getIndividualMixLiveGames(state).map((game) => game.id));
  const regularResults = Object.values(state.results).filter((result) => regularGameIds.has(result.gameId));
  const individualRows = calculateIndividualMixStandings({ schedule: state.schedule, results: regularResults });
  const rowByPlayer = new Map(individualRows.map((row) => [row.playerId, row]));
  const rows = Array.from({ length: 6 }, (_, index): IndividualMixPairStanding => {
    const playerIds: [string, string] = [state.schedule.players[index * 2].id, state.schedule.players[index * 2 + 1].id];
    const members = playerIds.map((playerId) => rowByPlayer.get(playerId));
    const sum = (field: 'played' | 'wins' | 'losses' | 'pointsFor' | 'pointsAgainst' | 'pointDiff') =>
      members.reduce((total, row) => total + Number(row?.[field] ?? 0), 0);
    return {
      pairNo: index + 1,
      playerIds,
      played: sum('played'),
      wins: sum('wins'),
      losses: sum('losses'),
      pointsFor: sum('pointsFor'),
      pointsAgainst: sum('pointsAgainst'),
      pointDiff: sum('pointDiff'),
      position: 0,
    };
  });
  rows.sort((left, right) =>
    right.pointDiff - left.pointDiff
    || right.wins - left.wins
    || right.pointsFor - left.pointsFor
    || left.pairNo - right.pairNo,
  );
  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}

function postseasonGame(input: {
  state: Pick<IndividualMixLiveState, 'schedule'>;
  id: string;
  shortCode: string;
  stage: IndividualMixPostseasonStage;
  courtNo: 1 | 2;
  roundNo: 7 | 8;
  pairNos: [number, number];
}): IndividualMixPostseasonGame {
  const pair = (pairNo: number): [string, string] => {
    const offset = (pairNo - 1) * 2;
    const left = input.state.schedule.players[offset];
    const right = input.state.schedule.players[offset + 1];
    if (!left || !right) throw new IndividualMixLiveDomainError('postseason_pair_missing', `Стартовая пара ${pairNo} не найдена.`);
    return [left.id, right.id];
  };
  const left = pair(input.pairNos[0]);
  const right = pair(input.pairNos[1]);
  return {
    id: `${input.state.schedule.poolId}-postseason-${input.id}`,
    poolId: input.state.schedule.poolId,
    courtNo: input.courtNo,
    roundNo: input.roundNo,
    duelNo: input.courtNo,
    gameNo: 1,
    shortCode: input.shortCode,
    mode: 'fixed_pairs',
    sourcePairNos: input.pairNos,
    postseasonStage: input.stage,
    left: { maleId: left[0], femaleId: left[1] },
    right: { maleId: right[0], femaleId: right[1] },
  };
}

function initialPostseasonGames(
  state: Pick<IndividualMixLiveState, 'schedule'>,
  mode: IndividualMixPostseasonMode,
  seeds: IndividualMixPairStanding[],
): IndividualMixPostseasonGame[] {
  const pairNo = (seed: number) => {
    const row = seeds[seed - 1];
    if (!row) throw new IndividualMixLiveDomainError('postseason_seed_missing', `Посев ${seed} не рассчитан.`);
    return row.pairNo;
  };
  if (mode === 'direct_medals') {
    return [
      postseasonGame({ state, id: 'gold', shortCode: '1–2 МЕСТО', stage: 'gold', courtNo: 1, roundNo: 7, pairNos: [pairNo(1), pairNo(2)] }),
      postseasonGame({ state, id: 'bronze', shortCode: '3–4 МЕСТО', stage: 'bronze', courtNo: 2, roundNo: 7, pairNos: [pairNo(3), pairNo(4)] }),
    ];
  }
  return [
    postseasonGame({ state, id: 'sf1', shortCode: 'ПОЛУФИНАЛ 1', stage: 'semifinal', courtNo: 1, roundNo: 7, pairNos: [pairNo(1), pairNo(4)] }),
    postseasonGame({ state, id: 'sf2', shortCode: 'ПОЛУФИНАЛ 2', stage: 'semifinal', courtNo: 2, roundNo: 7, pairNos: [pairNo(2), pairNo(3)] }),
  ];
}

function gameWinnerPairNo(state: IndividualMixLiveState, game: IndividualMixPostseasonGame): number | null {
  const result = state.results[game.id];
  if (!isIndividualMixLiveResultComplete(result) || result.leftScore === result.rightScore) return null;
  return result.leftScore > result.rightScore ? game.sourcePairNos![0] : game.sourcePairNos![1];
}

function gameLoserPairNo(state: IndividualMixLiveState, game: IndividualMixPostseasonGame): number | null {
  const winner = gameWinnerPairNo(state, game);
  if (!winner) return null;
  return game.sourcePairNos![0] === winner ? game.sourcePairNos![1] : game.sourcePairNos![0];
}

function hasPostseasonMedalResult(state: IndividualMixLiveState): boolean {
  return Boolean(state.postseason?.games.some((game) =>
    game.postseasonStage !== 'semifinal' && isIndividualMixLiveResultComplete(state.results[game.id]),
  ));
}

function refreshPostseason(state: IndividualMixLiveState): void {
  const postseason = state.postseason;
  if (!postseason) return;
  if (postseason.mode === 'semifinals') {
    const semifinals = postseason.games.filter((game) => game.postseasonStage === 'semifinal');
    const winners = semifinals.map((game) => gameWinnerPairNo(state, game));
    const losers = semifinals.map((game) => gameLoserPairNo(state, game));
    if (semifinals.length === 2 && winners.every(Boolean) && losers.every(Boolean)) {
      const medals = [
        postseasonGame({ state, id: 'gold', shortCode: 'ФИНАЛ · 1–2', stage: 'gold', courtNo: 1, roundNo: 8, pairNos: [winners[0]!, winners[1]!] }),
        postseasonGame({ state, id: 'bronze', shortCode: '3–4 МЕСТО', stage: 'bronze', courtNo: 2, roundNo: 8, pairNos: [losers[0]!, losers[1]!] }),
      ];
      postseason.games = [...semifinals, ...medals];
    } else if (!hasPostseasonMedalResult(state)) {
      postseason.games = semifinals;
    }
  }
  const complete = postseason.games.length === (postseason.mode === 'semifinals' ? 4 : 2)
    && postseason.games.every((game) => isIndividualMixLiveResultComplete(state.results[game.id]));
  postseason.status = complete ? 'complete' : 'active';
  if (!complete) {
    delete postseason.finalPairOrder;
    return;
  }
  const gold = postseason.games.find((game) => game.postseasonStage === 'gold')!;
  const bronze = postseason.games.find((game) => game.postseasonStage === 'bronze')!;
  const medalOrder = [gameWinnerPairNo(state, gold), gameLoserPairNo(state, gold), gameWinnerPairNo(state, bronze), gameLoserPairNo(state, bronze)]
    .filter((pairNo): pairNo is number => Boolean(pairNo));
  const remaining = postseason.pairStandings.map((row) => row.pairNo).filter((pairNo) => !medalOrder.includes(pairNo));
  postseason.finalPairOrder = [...medalOrder, ...remaining];
}

export function getIndividualMixPostseasonProgress(state: IndividualMixLiveState): {
  selected: boolean;
  mode: IndividualMixPostseasonMode | null;
  completed: number;
  total: number;
  complete: boolean;
} {
  const games = state.postseason?.games ?? [];
  const completed = games.filter((game) => isIndividualMixLiveResultComplete(state.results[game.id])).length;
  const total = state.postseason ? (state.postseason.mode === 'semifinals' ? 4 : 2) : 0;
  return { selected: Boolean(state.postseason), mode: state.postseason?.mode ?? null, completed, total, complete: Boolean(state.postseason && completed === total) };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildIndividualMixRosterFingerprint(
  players: IndividualMixPlayer[],
  presetVersion: IndividualMixSixPairRulesVersion = INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION,
): string {
  const canonical = players.map((player, index) => ({
    order: index + 1,
    id: String(player.id).trim(),
    gender: player.gender,
    drawSeed: Number(player.drawSeed ?? index + 1),
  }));
  return `imrf1-${stableHash(JSON.stringify({
    preset: presetVersion,
    pointLimit: INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT,
    players: canonical,
  }))}`;
}

export function createIndividualMixLiveState(input: {
  players: IndividualMixPlayer[];
  scheduleRevision: string;
  preparedAt?: string;
  presetVersion?: IndividualMixSixPairRulesVersion;
}): IndividualMixLiveState {
  const presetVersion = input.presetVersion ?? INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION;
  const schedule = buildSixPairHybridScheduleForVersion(presetVersion, { poolId: 'six-pair-hybrid', players: input.players });
  const errors = validateSixPairHybridSchedule(schedule, presetVersion);
  if (errors.length) {
    throw new IndividualMixLiveDomainError('invalid_preset', `Некорректный пресет: ${errors.join('; ')}`);
  }
  if (!input.scheduleRevision.trim()) {
    throw new IndividualMixLiveDomainError('missing_schedule_revision', 'Не задана версия расписания.');
  }
  return {
    presetVersion,
    stateSchemaVersion: INDIVIDUAL_MIX_LIVE_STATE_SCHEMA_VERSION,
    scheduleRevision: input.scheduleRevision,
    rosterFingerprint: buildIndividualMixRosterFingerprint(input.players, presetVersion),
    pointLimit: INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT,
    currentRound: 1,
    status: 'active',
    preparedAt: input.preparedAt ?? new Date().toISOString(),
    schedule,
    results: {},
    replacements: [],
    actions: [],
  };
}

export function isIndividualMixLiveResultComplete(result: IndividualMixLiveResult | undefined): boolean {
  return Boolean(result && result.kind !== 'cancelled');
}

export function getIndividualMixRoundProgress(state: IndividualMixLiveState, roundNo = state.currentRound): {
  roundNo: number;
  total: number;
  completed: number;
  court1: { completed: number; total: number };
  court2: { completed: number; total: number };
} {
  const games = getIndividualMixLiveGames(state).filter((game) => game.roundNo === roundNo);
  const completed = (courtNo?: number) => games.filter((game) =>
    (courtNo == null || game.courtNo === courtNo) && isIndividualMixLiveResultComplete(state.results[game.id]),
  ).length;
  return {
    roundNo,
    total: games.length,
    completed: completed(),
    court1: { completed: completed(1), total: games.filter((game) => game.courtNo === 1).length },
    court2: { completed: completed(2), total: games.filter((game) => game.courtNo === 2).length },
  };
}

export function getIndividualMixCurrentRound(state: IndividualMixLiveState): number {
  for (let roundNo = 1; roundNo <= 6; roundNo += 1) {
    const progress = getIndividualMixRoundProgress(state, roundNo);
    if (progress.completed < progress.total) return roundNo;
  }
  if (!state.postseason) return 7;
  const incomplete = state.postseason.games.filter((game) => !isIndividualMixLiveResultComplete(state.results[game.id]));
  if (incomplete.length) return Math.min(...incomplete.map((game) => game.roundNo));
  return state.postseason.mode === 'semifinals' ? 9 : 8;
}

export function getIndividualMixCurrentGame(state: IndividualMixLiveState, courtNo: number): IndividualMixGame | null {
  if (state.status !== 'active') return null;
  const games = state.currentRound <= 6 ? getIndividualMixLiveGames(state) : state.postseason?.games ?? [];
  return games
    .filter((game) => game.roundNo === state.currentRound && game.courtNo === courtNo)
    .sort((left, right) => left.duelNo - right.duelNo || left.gameNo - right.gameNo)
    .find((game) => !isIndividualMixLiveResultComplete(state.results[game.id])) ?? null;
}

function gameOrderMap(state: IndividualMixLiveState): Map<string, number> {
  return new Map(
    getIndividualMixAllGames(state)
      .sort((left, right) => left.roundNo - right.roundNo || left.courtNo - right.courtNo || left.duelNo - right.duelNo || left.gameNo - right.gameNo)
      .map((game, index) => [game.id, index + 1]),
  );
}

function gameSlotIds(game: IndividualMixGame): [string, string, string, string] {
  return [game.left.maleId, game.left.femaleId, game.right.maleId, game.right.femaleId];
}

function initialPlayer(state: IndividualMixLiveState, slotPlayerId: string): IndividualMixPlayer {
  const player = state.schedule.players.find((candidate) => candidate.id === slotPlayerId);
  if (!player) throw new IndividualMixLiveDomainError('unknown_slot', 'Игровой слот не найден в исходном составе.');
  return player;
}

export function resolveIndividualMixSlotPlayer(
  state: IndividualMixLiveState,
  slotPlayerId: string,
  gameId: string,
): IndividualMixLiveActualPlayer {
  const initial = initialPlayer(state, slotPlayerId);
  const order = gameOrderMap(state).get(gameId);
  if (!order) throw new IndividualMixLiveDomainError('unknown_game', 'Игра отсутствует в расписании.');
  const replacement = state.replacements
    .filter((entry) => entry.slotPlayerId === slotPlayerId && entry.effectiveOrder <= order)
    .sort((left, right) => right.effectiveOrder - left.effectiveOrder || right.createdAt.localeCompare(left.createdAt))[0];
  return replacement
    ? { slotPlayerId, playerId: replacement.playerId, name: replacement.playerName }
    : { slotPlayerId, playerId: initial.id, name: initial.name };
}

export function getIndividualMixActualLineup(state: IndividualMixLiveState, game: IndividualMixGame): {
  left: [IndividualMixLiveActualPlayer, IndividualMixLiveActualPlayer];
  right: [IndividualMixLiveActualPlayer, IndividualMixLiveActualPlayer];
} {
  return {
    left: [
      resolveIndividualMixSlotPlayer(state, game.left.maleId, game.id),
      resolveIndividualMixSlotPlayer(state, game.left.femaleId, game.id),
    ],
    right: [
      resolveIndividualMixSlotPlayer(state, game.right.maleId, game.id),
      resolveIndividualMixSlotPlayer(state, game.right.femaleId, game.id),
    ],
  };
}

function requiredReason(value: unknown, label = 'Укажите причину.'): string {
  const reason = String(value ?? '').trim();
  if (reason.length < 4) throw new IndividualMixLiveDomainError('reason_required', label);
  return reason;
}

function validateScore(payload: IndividualMixLiveScorePayload, pointLimit: number): void {
  const left = Number(payload.leftScore);
  const right = Number(payload.rightScore);
  if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0) {
    throw new IndividualMixLiveDomainError('invalid_score', 'Счёт должен состоять из целых неотрицательных чисел.');
  }
  if (payload.kind === 'cancelled') {
    requiredReason(payload.reason, 'Для отменённой игры обязательна причина.');
    if (left !== 0 || right !== 0) {
      throw new IndividualMixLiveDomainError('invalid_cancelled_score', 'Отменённая игра без технического исхода хранится со счётом 0:0.');
    }
    return;
  }
  const validWinner = (left === pointLimit && right < pointLimit) || (right === pointLimit && left < pointLimit);
  if (!validWinner) {
    throw new IndividualMixLiveDomainError('invalid_score', `Одна сторона должна набрать ровно ${pointLimit}, проигравшая — от 0 до ${pointLimit - 1}.`);
  }
  if (payload.kind !== 'played' && payload.kind !== 'admin_adjusted') {
    requiredReason(payload.reason, 'Для технического результата обязательна причина.');
  }
}

function assertCourtScope(game: IndividualMixGame, context: IndividualMixLiveCommandContext): void {
  if (context.courtNo != null && game.courtNo !== context.courtNo) {
    throw new IndividualMixLiveDomainError('court_forbidden', `Это устройство закреплено за кортом ${context.courtNo}.`);
  }
}

function actionBase(command: IndividualMixLiveCommand, context: IndividualMixLiveCommandContext): IndividualMixLiveAction {
  return {
    commandId: context.commandId,
    type: command.type,
    actorKind: context.actorKind,
    actorId: context.actorId,
    courtNo: context.courtNo,
    createdAt: context.now,
    revision: context.nextRevision,
  };
}

function addAction(state: IndividualMixLiveState, action: IndividualMixLiveAction): void {
  state.actions.push(action);
  if (state.actions.length > 300) state.actions = state.actions.slice(-300);
}

function applyReplacementState(
  current: IndividualMixLiveState,
  command: Extract<IndividualMixLiveCommand, { type: 'rebuild_schedule' | 'restore_snapshot' }>,
  context: IndividualMixLiveCommandContext,
): IndividualMixLiveState {
  if (context.actorKind !== 'admin') {
    throw new IndividualMixLiveDomainError('admin_required', 'Пересоздание и восстановление доступны только администратору.');
  }
  const reason = requiredReason(command.payload.reason);
  if (!context.replacementState) {
    throw new IndividualMixLiveDomainError('replacement_state_required', 'Сервер не подготовил восстанавливаемое состояние.');
  }
  const replacement = clone(context.replacementState);
  replacement.actions = [...current.actions];
  addAction(replacement, { ...actionBase(command, context), reason });
  return replacement;
}

export function applyIndividualMixLiveCommand(
  current: IndividualMixLiveState,
  command: IndividualMixLiveCommand,
  context: IndividualMixLiveCommandContext,
): IndividualMixLiveState {
  if (!context.commandId.trim()) throw new IndividualMixLiveDomainError('command_id_required', 'Не задан commandId.');
  if (current.actions.some((action) => action.commandId === context.commandId)) return current;
  if (command.type === 'rebuild_schedule' || command.type === 'restore_snapshot') {
    return applyReplacementState(current, command, context);
  }

  const next = clone(current);
  if (next.status !== 'active') {
    throw new IndividualMixLiveDomainError('session_locked', 'Турнир уже финализирован или отменён.');
  }

  if (command.type === 'start_postseason') {
    if (context.actorKind === 'judge') {
      throw new IndividualMixLiveDomainError('operator_required', 'Финальный этап выбирает оператор или администратор.');
    }
    if (next.presetVersion !== INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2) {
      throw new IndividualMixLiveDomainError('postseason_unavailable', 'Выбор финального этапа доступен только для схемы v2.');
    }
    if (next.postseason) {
      throw new IndividualMixLiveDomainError('postseason_exists', 'Финальный этап уже выбран.');
    }
    const regularGames = getIndividualMixLiveGames(next);
    if (regularGames.some((game) => !isIndividualMixLiveResultComplete(next.results[game.id]))) {
      throw new IndividualMixLiveDomainError('regular_incomplete', `Сначала завершите все ${regularGames.length} игр основной части.`);
    }
    if (regularGames.some((game) => next.results[game.id]?.kind === 'cancelled')) {
      throw new IndividualMixLiveDomainError('cancelled_results', 'Отменённые игры нужно заменить техническим результатом до выбора финального этапа.');
    }
    if (command.payload.mode !== 'semifinals' && command.payload.mode !== 'direct_medals') {
      throw new IndividualMixLiveDomainError('invalid_postseason_mode', 'Неизвестный вариант финального этапа.');
    }
    const pairStandings = calculateIndividualMixPairStandings(next);
    next.postseason = {
      mode: command.payload.mode,
      status: 'active',
      seededAt: context.now,
      seededBy: `${context.actorKind}:${context.actorId}`,
      pairStandings,
      games: initialPostseasonGames(next, command.payload.mode, pairStandings),
    };
    addAction(next, { ...actionBase(command, context), reason: command.payload.reason?.trim() || undefined });
  } else if (command.type === 'record_score') {
    const regularGame = getIndividualMixLiveGames(next).find((candidate) => candidate.id === command.payload.gameId);
    const game = getIndividualMixAllGames(next).find((candidate) => candidate.id === command.payload.gameId);
    if (!game) throw new IndividualMixLiveDomainError('unknown_game', 'Игра отсутствует в расписании.');
    assertCourtScope(game, context);
    if (game.roundNo !== next.currentRound) {
      throw new IndividualMixLiveDomainError('round_locked', next.currentRound <= 6 ? `Сейчас открыт только тур ${next.currentRound}.` : 'Сейчас открыт другой этап финальных игр.');
    }
    const currentGame = getIndividualMixCurrentGame(next, game.courtNo);
    if (!currentGame || currentGame.id !== game.id) {
      throw new IndividualMixLiveDomainError('game_order_locked', 'Сначала завершите предыдущую игру этого корта.');
    }
    if (next.results[game.id]) {
      throw new IndividualMixLiveDomainError('score_exists', 'Результат уже сохранён. Для изменения используйте исправление.');
    }
    validateScore(command.payload, next.pointLimit);
    const lineup = getIndividualMixActualLineup(next, game);
    const result: IndividualMixLiveResult = {
      gameId: game.id,
      leftScore: command.payload.leftScore,
      rightScore: command.payload.rightScore,
      kind: command.payload.kind,
      reason: command.payload.reason?.trim() || undefined,
      actualLeft: lineup.left,
      actualRight: lineup.right,
      recordedAt: context.now,
      recordedBy: `${context.actorKind}:${context.actorId}`,
      recordedRevision: context.nextRevision,
    };
    next.results[game.id] = result;
    addAction(next, { ...actionBase(command, context), courtNo: game.courtNo, gameId: game.id, afterResult: result });
    if (!regularGame) refreshPostseason(next);
  } else if (command.type === 'correct_score') {
    if (context.actorKind !== 'admin') {
      throw new IndividualMixLiveDomainError('admin_required', 'Любой сохранённый счёт исправляет только администратор.');
    }
    const game = getIndividualMixAllGames(next).find((candidate) => candidate.id === command.payload.gameId);
    if (!game) throw new IndividualMixLiveDomainError('unknown_game', 'Игра отсутствует в расписании.');
    const postseasonGameEntry = next.postseason?.games.find((candidate) => candidate.id === game.id);
    if (postseasonGameEntry?.postseasonStage === 'semifinal' && hasPostseasonMedalResult(next)) {
      throw new IndividualMixLiveDomainError('postseason_medals_started', 'Сначала отмените результаты финала и матча за третье место.');
    }
    const before = next.results[game.id];
    if (!before) throw new IndividualMixLiveDomainError('score_missing', 'У этой игры ещё нет результата.');
    const reason = requiredReason(command.payload.reason, 'Для исправления счёта обязательна причина.');
    validateScore(command.payload, next.pointLimit);
    const after: IndividualMixLiveResult = {
      ...before,
      leftScore: command.payload.leftScore,
      rightScore: command.payload.rightScore,
      kind: command.payload.kind,
      reason,
      recordedAt: context.now,
      recordedBy: `${context.actorKind}:${context.actorId}`,
      recordedRevision: context.nextRevision,
    };
    next.results[game.id] = after;
    addAction(next, { ...actionBase(command, context), courtNo: game.courtNo, gameId: game.id, reason, beforeResult: before, afterResult: after });
    if (postseasonGameEntry) refreshPostseason(next);
  } else if (command.type === 'undo_last') {
    const courtNo = context.courtNo ?? Number(command.payload.courtNo);
    if (courtNo !== 1 && courtNo !== 2) {
      throw new IndividualMixLiveDomainError('court_required', 'Для отмены укажите корт 1 или 2.');
    }
    const courtActions = next.actions.filter((action) => action.courtNo === courtNo && !action.undoneByCommandId);
    const target = courtActions[courtActions.length - 1];
    if (!target || target.type !== 'record_score' || !target.gameId) {
      throw new IndividualMixLiveDomainError('undo_forbidden', 'Можно отменить только последнее сохранение результата на своём корте.');
    }
    if (context.actorKind === 'judge' && target.actorKind !== 'judge') {
      throw new IndividualMixLiveDomainError('undo_forbidden', 'Последнее действие выполнил оператор или администратор — обратитесь к нему.');
    }
    const postseasonGameEntry = next.postseason?.games.find((game) => game.id === target.gameId);
    if (postseasonGameEntry?.postseasonStage === 'semifinal' && hasPostseasonMedalResult(next)) {
      throw new IndividualMixLiveDomainError('postseason_medals_started', 'Сначала отмените результаты финала и матча за третье место.');
    }
    if (target.beforeResult) next.results[target.gameId] = target.beforeResult;
    else delete next.results[target.gameId];
    target.undoneByCommandId = context.commandId;
    addAction(next, {
      ...actionBase(command, context),
      courtNo,
      gameId: target.gameId,
      targetCommandId: target.commandId,
      beforeResult: target.afterResult,
      afterResult: target.beforeResult,
    });
    if (postseasonGameEntry) refreshPostseason(next);
  } else if (command.type === 'replace_player') {
    if (context.actorKind === 'judge') {
      throw new IndividualMixLiveDomainError('operator_required', 'Замены доступны оператору или администратору.');
    }
    const reason = requiredReason(command.payload.reason, 'Для замены обязательна причина.');
    const slot = initialPlayer(next, command.payload.slotPlayerId);
    if (slot.gender !== command.payload.gender) {
      throw new IndividualMixLiveDomainError('replacement_gender', 'Замена должна быть того же пола, что и игровой слот.');
    }
    const orders = gameOrderMap(next);
    const futureGame = getIndividualMixAllGames(next)
      .filter((game) => gameSlotIds(game).includes(slot.id) && !next.results[game.id])
      .sort((left, right) => (orders.get(left.id) ?? 0) - (orders.get(right.id) ?? 0))[0];
    if (!futureGame) {
      throw new IndividualMixLiveDomainError('replacement_too_late', 'У этого игрового слота не осталось несыгранных матчей.');
    }
    const effectiveOrder = orders.get(futureGame.id);
    if (!effectiveOrder) throw new IndividualMixLiveDomainError('unknown_game', 'Не удалось определить следующую игру.');
    const occupied = next.schedule.players.map((player) =>
      resolveIndividualMixSlotPlayer(next, player.id, futureGame.id).playerId,
    );
    if (occupied.includes(command.payload.playerId)) {
      throw new IndividualMixLiveDomainError('replacement_occupied', 'Этот игрок уже занимает другой активный слот.');
    }
    const currentPlayer = resolveIndividualMixSlotPlayer(next, slot.id, futureGame.id);
    if (currentPlayer.playerId === command.payload.playerId) {
      throw new IndividualMixLiveDomainError('replacement_same_player', 'Выбран тот же игрок.');
    }
    next.replacements.push({
      id: context.commandId,
      slotPlayerId: slot.id,
      replacedPlayerId: currentPlayer.playerId,
      playerId: command.payload.playerId,
      playerName: command.payload.playerName.trim(),
      effectiveFromGameId: futureGame.id,
      effectiveOrder,
      reason,
      createdAt: context.now,
      createdBy: `${context.actorKind}:${context.actorId}`,
    });
    addAction(next, { ...actionBase(command, context), reason });
  } else if (command.type === 'finalize') {
    if (context.actorKind === 'judge') {
      throw new IndividualMixLiveDomainError('operator_required', 'Финализировать турнир может оператор или администратор.');
    }
    if (command.payload.clientQueueDepth !== 0 || command.payload.clientHasConflict) {
      throw new IndividualMixLiveDomainError('sync_not_clean', 'Сначала отправьте всю очередь и разрешите конфликт синхронизации.');
    }
    const regularGames = getIndividualMixLiveGames(next);
    if (regularGames.some((game) => !isIndividualMixLiveResultComplete(next.results[game.id]))) {
      throw new IndividualMixLiveDomainError('results_incomplete', `Финализация доступна только после ${regularGames.length} из ${regularGames.length} технически завершённых игр основной части.`);
    }
    if (next.presetVersion === INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2) {
      if (!next.postseason) {
        throw new IndividualMixLiveDomainError('postseason_required', 'Выберите и проведите финальный этап.');
      }
      refreshPostseason(next);
      if (next.postseason.status !== 'complete') {
        throw new IndividualMixLiveDomainError('postseason_incomplete', 'Сначала завершите все игры выбранного финального этапа.');
      }
    }
    const regularGameIds = new Set(regularGames.map((game) => game.id));
    const regularResults = Object.values(next.results).filter((result) => regularGameIds.has(result.gameId));
    if (regularResults.some((result) => !isIndividualMixLiveResultComplete(result))) {
      throw new IndividualMixLiveDomainError('cancelled_results', 'Отменённая без технического результата игра блокирует финализацию.');
    }
    const rows = calculateIndividualMixStandings({ schedule: next.schedule, results: regularResults });
    next.finalStandings = rows.map((row) => {
      const chain = next.replacements.filter((entry) => entry.slotPlayerId === row.playerId);
      const slot = initialPlayer(next, row.playerId);
      return {
        ...row,
        slotLabel: [slot.name, ...chain.map((entry) => entry.playerName)].join(' → '),
        ratingEligible: chain.length === 0,
      };
    });
    next.status = 'finalized';
    next.finalizedAt = context.now;
    next.tournamentStatusBeforeFinalize = context.tournamentStatusBeforeFinalize || next.tournamentStatusBeforeFinalize || 'open';
    addAction(next, { ...actionBase(command, context), reason: command.payload.reason?.trim() || undefined });
  }

  refreshPostseason(next);
  next.currentRound = getIndividualMixCurrentRound(next);
  return next;
}

export function getIndividualMixSlotLabel(state: IndividualMixLiveState, slotPlayerId: string): string {
  const slot = initialPlayer(state, slotPlayerId);
  return [slot.name, ...state.replacements.filter((entry) => entry.slotPlayerId === slotPlayerId).map((entry) => entry.playerName)].join(' → ');
}

export function getIndividualMixLiveProgress(state: IndividualMixLiveState): {
  completed: number;
  total: number;
  cancelled: number;
} {
  const regularGameIds = new Set(getIndividualMixLiveGames(state).map((game) => game.id));
  const results = Object.values(state.results).filter((result) => regularGameIds.has(result.gameId));
  return {
    completed: results.filter(isIndividualMixLiveResultComplete).length,
    total: getIndividualMixLiveGames(state).length,
    cancelled: results.filter((result) => result.kind === 'cancelled').length,
  };
}
