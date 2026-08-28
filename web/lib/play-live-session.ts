import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import type { PlayActor } from '@/lib/play-auth';
import {
  PLAY_KING_POINT_LIMIT,
  generateKingRounds,
  generatePlayMatches,
  type PlayResultFormat,
  type StructuredPlayResult,
} from '@/lib/play-result-core';
import { buildQuickWinnerScore } from '@/lib/quick-winner-score';
import {
  canCompleteKingRound,
  getCurrentKingRound,
  type PlayLiveCommand,
  type PlayLiveHistorySnapshot,
  type PlayLiveSessionView,
  type PlayLiveState,
} from '@/lib/play-live-core';

export type { PlayLiveCommand, PlayLiveSessionView, PlayLiveState } from '@/lib/play-live-core';

export class PlayLiveSessionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function normalizeLiveState(value: unknown): PlayLiveState {
  const rawState = value && typeof value === 'object' ? value as Partial<PlayLiveState> : {};
  const matches = Array.isArray(rawState.matches) ? rawState.matches : [];
  const rounds = Array.isArray(rawState.rounds) ? rawState.rounds : [];
  const inferredRoster = [
    ...matches.flatMap((match) => [...match.teamA, ...match.teamB]),
    ...rounds.flatMap((round) => round.pairs.flatMap((pair) => pair.team)),
  ];
  const roster = Array.isArray(rawState.roster)
    ? [...new Set(rawState.roster.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [...new Set(inferredRoster)];
  return {
    format: rawState.format === 'thai_8' || rawState.format === 'king_sideout' ? rawState.format : 'classic_2x2',
    pairingMode: rawState.pairingMode === 'random' ? 'random' : 'fixed',
    pointLimit: rawState.format === 'king_sideout' ? PLAY_KING_POINT_LIMIT : Number(rawState.pointLimit) || 15,
    roundDurationMinutes: Number(rawState.roundDurationMinutes) || 10,
    roster,
    activeRoster: Array.isArray(rawState.activeRoster)
      ? [...new Set(rawState.activeRoster.map(Number).filter((id) => roster.includes(id)))]
      : [...roster],
    startedAt: typeof rawState.startedAt === 'string' ? rawState.startedAt : new Date().toISOString(),
    matches,
    rounds,
    completedRoundIds: Array.isArray(rawState.completedRoundIds)
      ? [...new Set(rawState.completedRoundIds.map(String))].filter((id) => rounds.some((round) => round.id === id))
      : [],
    history: Array.isArray(rawState.history) ? rawState.history : [],
  };
}

function mapSession(row: Record<string, unknown>): PlayLiveSessionView {
  return {
    id: String(row.id),
    postId: String(row.post_id ?? row.postId),
    status: String(row.status) as PlayLiveSessionView['status'],
    revision: Number(row.revision ?? 0),
    state: normalizeLiveState(row.state),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
  };
}

function resultFormat(value: unknown, participantCount: number): PlayResultFormat {
  const normalized = String(value || '');
  if (normalized === 'classic_2x2' || normalized === 'thai_8' || normalized === 'king_sideout') return normalized;
  if (participantCount === 4) return 'classic_2x2';
  if (participantCount === 8) return 'thai_8';
  return 'king_sideout';
}

function pointLimit(config: unknown, format: PlayResultFormat): number {
  if (format === 'king_sideout') return PLAY_KING_POINT_LIMIT;
  const parsed = config && typeof config === 'object' ? Number((config as { pointLimit?: unknown }).pointLimit) : 0;
  return [11, 15, 21].includes(parsed) ? parsed : format === 'classic_2x2' ? 21 : 15;
}

async function authorizePost(
  client: PoolClient,
  actor: PlayActor,
  postId: string,
  managerOnly: boolean,
  lock = false,
) {
  const loaded = await client.query(
    `SELECT post.id::text, post.kind, post.status, post.result_format, post.result_config,
            organizer.owner_user_id,
            EXISTS (
              SELECT 1 FROM play_post_participants participant
               WHERE participant.post_id = post.id AND participant.user_id = $2
                 AND participant.status = 'confirmed'
            ) AS confirmed_participant
       FROM play_posts post
       JOIN play_organizers organizer ON organizer.id = post.organizer_id
      WHERE post.id = $1::uuid
      ${lock ? 'FOR UPDATE OF post' : ''}`,
    [postId, actor.kind === 'user' ? actor.userId : null],
  );
  const post = loaded.rows[0];
  if (!post) throw new PlayLiveSessionError(404, 'Игра не найдена');
  if (String(post.kind) !== 'game') throw new PlayLiveSessionError(409, 'Live-режим доступен только для игры');
  if (String(post.status) === 'cancelled') throw new PlayLiveSessionError(409, 'Игра отменена');
  const manager = actor.kind === 'admin' || Number(post.owner_user_id) === actor.userId;
  if (managerOnly ? !manager : (!manager && !post.confirmed_participant)) {
    throw new PlayLiveSessionError(403, managerOnly ? 'Live-режим запускает организатор' : 'Нет доступа к live-режиму');
  }
  return { ...post, manager };
}

function initialState(format: PlayResultFormat, ids: number[], limit: number): PlayLiveState {
  const pairingMode: PlayLiveState['pairingMode'] = format === 'king_sideout' ? 'random' : 'fixed';
  const matches = format === 'king_sideout' ? [] : generatePlayMatches(ids, format, pairingMode);
  const rounds = format === 'king_sideout' ? generateKingRounds(ids, pairingMode) : [];
  if (format === 'classic_2x2' && ids.length < 4) throw new PlayLiveSessionError(409, 'Для 2×2 нужно минимум 4 игрока');
  if (format === 'thai_8' && (ids.length !== 8 || !matches.length)) throw new PlayLiveSessionError(409, 'Для тайского live нужно ровно 8 игроков');
  if (format === 'king_sideout' && (!rounds.length || ids.length < 6 || ids.length > 10)) throw new PlayLiveSessionError(409, 'Для KING нужно 6–10 игроков и чётный состав');
  return { format, pairingMode, pointLimit: limit, roundDurationMinutes: 10, roster: [...ids], activeRoster: [...ids], startedAt: new Date().toISOString(), matches, rounds, completedRoundIds: [], history: [] };
}

export async function startPlayLiveSession(actor: PlayActor, postId: string): Promise<PlayLiveSessionView> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const post = await authorizePost(client, actor, postId, true, true);
    const existing = await client.query(`SELECT * FROM play_game_sessions WHERE post_id = $1::uuid`, [postId]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return mapSession(existing.rows[0]);
    }
    if (String(post.status) !== 'published') {
      throw new PlayLiveSessionError(409, String(post.status) === 'completed' ? 'Игра уже завершена' : 'Сначала опубликуйте игру');
    }
    const roster = await client.query(
      `SELECT result_key FROM play_post_participants
        WHERE post_id = $1::uuid AND status = 'confirmed'
        ORDER BY created_at, id`,
      [postId],
    );
    const ids = roster.rows.map((row) => Number(row.result_key));
    const format = resultFormat(post.result_format, ids.length);
    const state = initialState(format, ids, pointLimit(post.result_config, format));
    const inserted = await client.query(
      `INSERT INTO play_game_sessions (post_id, format, state, created_by_user_id)
       VALUES ($1::uuid, $2, $3::jsonb, $4)
       RETURNING *`,
      [postId, format, JSON.stringify(state), actor.kind === 'user' ? actor.userId : null],
    );
    await client.query('COMMIT');
    return mapSession(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPlayLiveSession(actor: PlayActor, postId: string): Promise<PlayLiveSessionView | null> {
  const client = await getPool().connect();
  try {
    await authorizePost(client, actor, postId, false);
    const { rows } = await client.query(`SELECT * FROM play_game_sessions WHERE post_id = $1::uuid`, [postId]);
    return rows[0] ? mapSession(rows[0]) : null;
  } finally {
    client.release();
  }
}

function snapshot(state: PlayLiveState): PlayLiveHistorySnapshot {
  return JSON.parse(JSON.stringify({
    matches: state.matches,
    rounds: state.rounds,
    roster: state.roster,
    activeRoster: state.activeRoster,
    completedRoundIds: state.completedRoundIds,
  })) as PlayLiveHistorySnapshot;
}

export function applyPlayLiveStateCommand(state: PlayLiveState, command: PlayLiveCommand): PlayLiveState {
  const next = JSON.parse(JSON.stringify(normalizeLiveState(state))) as PlayLiveState;
  if (!Array.isArray(next.history)) next.history = [];
  if (command.type === 'undo') {
    const previous = next.history.pop();
    if (!previous) throw new PlayLiveSessionError(409, 'Отменять пока нечего');
    next.matches = previous.matches;
    next.rounds = previous.rounds;
    next.roster = previous.roster ?? next.roster;
    next.activeRoster = previous.activeRoster ?? next.roster;
    next.completedRoundIds = previous.completedRoundIds ?? [];
    return next;
  }

  next.history = [...next.history.slice(-19), snapshot(next)];
  if (command.type === 'set_match_score') {
    const index = next.matches.findIndex((match) => match.id === command.matchId);
    if (index < 0) throw new PlayLiveSessionError(404, 'Матч не найден');
    const target = next.matches[index].pointLimit ?? next.pointLimit;
    if (!['A', 'B'].includes(command.winner) || !Number.isInteger(command.loserPoints) || command.loserPoints < 0 || command.loserPoints >= target) {
      throw new PlayLiveSessionError(400, 'Некорректный быстрый счёт');
    }
    const score = buildQuickWinnerScore(target, command.winner, command.loserPoints);
    next.matches[index] = { ...next.matches[index], scoreA: score.scoreA, scoreB: score.scoreB };
  } else if (command.type === 'set_match_teams') {
    if (next.format !== 'classic_2x2') throw new PlayLiveSessionError(409, 'Состав партии можно менять только в игре 2×2');
    const lineup = [...command.teamA, ...command.teamB];
    const roster = new Set(next.activeRoster);
    if (
      command.teamA.length !== 2 || command.teamB.length !== 2 ||
      lineup.some((id) => !Number.isInteger(id) || !roster.has(id)) ||
      new Set(lineup).size !== 4
    ) throw new PlayLiveSessionError(400, 'Выберите четырёх разных игроков из состава');
    const index = next.matches.findIndex((match) => match.id === command.matchId);
    if (index < 0) throw new PlayLiveSessionError(404, 'Партия не найдена');
    next.matches[index] = {
      ...next.matches[index],
      teamA: [...command.teamA],
      teamB: [...command.teamB],
      scoreA: 0,
      scoreB: 0,
    };
  } else if (command.type === 'set_match_point_limit') {
    if (next.format !== 'classic_2x2' || ![11, 15, 21].includes(command.pointLimit)) {
      throw new PlayLiveSessionError(400, 'Партия может идти до 11, 15 или 21 очка');
    }
    const index = next.matches.findIndex((match) => match.id === command.matchId);
    if (index < 0) throw new PlayLiveSessionError(404, 'Партия не найдена');
    next.matches[index] = { ...next.matches[index], pointLimit: command.pointLimit, scoreA: 0, scoreB: 0 };
  } else if (command.type === 'set_player_active') {
    if (!next.roster.includes(command.resultKey)) throw new PlayLiveSessionError(404, 'Игрок не найден в составе');
    const playing = next.matches.some((match) => match.scoreA === match.scoreB && [...match.teamA, ...match.teamB].includes(command.resultKey));
    if (!command.active && playing) throw new PlayLiveSessionError(409, 'Сначала завершите текущую партию или замените игрока');
    next.activeRoster = command.active
      ? [...new Set([...next.activeRoster, command.resultKey])]
      : next.activeRoster.filter((id) => id !== command.resultKey);
    if (next.activeRoster.length < 4) throw new PlayLiveSessionError(409, 'Для игры нужно оставить минимум четырёх активных игроков');
  } else if (command.type === 'sync_roster') {
    const roster = Array.isArray(command.roster) ? [...new Set(command.roster)] : next.roster;
    next.roster = roster;
    next.activeRoster = [...new Set([...next.activeRoster, ...roster])].filter((id) => roster.includes(id));
  } else if (command.type === 'set_pair_points') {
    if (!Number.isInteger(command.pairIndex) || !Number.isInteger(command.points) || command.points < 0 || command.points > PLAY_KING_POINT_LIMIT) {
      throw new PlayLiveSessionError(400, 'Некорректные очки пары');
    }
    const roundIndex = next.rounds.findIndex((round) => round.id === command.roundId);
    if (roundIndex < 0 || !next.rounds[roundIndex].pairs[command.pairIndex]) throw new PlayLiveSessionError(404, 'Пара не найдена');
    if (next.completedRoundIds.includes(command.roundId)) {
      throw new PlayLiveSessionError(409, 'Раунд уже завершён — отмените последнее действие, чтобы исправить очки');
    }
    next.rounds[roundIndex].pairs[command.pairIndex].points = command.points;
  } else if (command.type === 'complete_king_round') {
    if (next.format !== 'king_sideout') {
      throw new PlayLiveSessionError(409, 'Завершение раунда доступно только для KING');
    }
    const currentRound = getCurrentKingRound(next);
    if (!currentRound || currentRound.id !== command.roundId) {
      throw new PlayLiveSessionError(409, 'Завершите текущий раунд по порядку');
    }
    if (!canCompleteKingRound(currentRound)) {
      throw new PlayLiveSessionError(409, 'Укажите очки хотя бы одной пары');
    }
    next.completedRoundIds.push(currentRound.id);
  } else if (command.type === 'add_set') {
    if (next.format !== 'classic_2x2' || !next.matches[0]) throw new PlayLiveSessionError(409, 'Новый сет доступен только для 2×2');
    const previous = next.matches[next.matches.length - 1];
    const lineup = command.teamA && command.teamB ? [...command.teamA, ...command.teamB] : [...previous.teamA, ...previous.teamB];
    if (lineup.length !== 4 || new Set(lineup).size !== 4 || lineup.some((id) => !next.activeRoster.includes(id))) {
      throw new PlayLiveSessionError(400, 'Для следующей партии нужны четыре активных игрока');
    }
    next.matches.push({
      ...previous,
      id: `set-${randomUUID()}`,
      teamA: command.teamA ? [...command.teamA] : [...previous.teamA],
      teamB: command.teamB ? [...command.teamB] : [...previous.teamB],
      pointLimit: command.pointLimit ?? previous.pointLimit,
      scoreA: 0,
      scoreB: 0,
    });
  }
  return next;
}

export async function applyPlayLiveCommand(
  actor: PlayActor,
  sessionId: string,
  commandId: string,
  expectedRevision: number,
  command: PlayLiveCommand,
): Promise<PlayLiveSessionView> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(commandId)) throw new PlayLiveSessionError(400, 'Некорректная команда');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const loaded = await client.query(`SELECT * FROM play_game_sessions WHERE id = $1::uuid FOR UPDATE`, [sessionId]);
    const row = loaded.rows[0];
    if (!row) throw new PlayLiveSessionError(404, 'Live-сессия не найдена');
    const access = await authorizePost(client, actor, String(row.post_id), false);
    if ((command.type === 'set_match_teams' || command.type === 'set_match_point_limit' || command.type === 'set_player_active' || command.type === 'sync_roster' || command.type === 'add_set' || command.type === 'undo') && !access.manager) {
      throw new PlayLiveSessionError(403, 'Настройки партий меняет организатор');
    }
    const duplicate = await client.query(
      `SELECT 1 FROM play_game_session_commands WHERE session_id = $1::uuid AND command_id = $2::uuid`,
      [sessionId, commandId],
    );
    if (duplicate.rows[0]) {
      await client.query('COMMIT');
      return mapSession(row);
    }
    if (String(row.status) !== 'active') throw new PlayLiveSessionError(409, 'Live-сессия уже завершена');
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(row.revision)) {
      throw new PlayLiveSessionError(409, 'Состояние игры обновилось — повторите действие');
    }
    let effectiveCommand = command;
    if (command.type === 'sync_roster') {
      const roster = await client.query(
        `SELECT result_key FROM play_post_participants WHERE post_id = $1::uuid AND status = 'confirmed' ORDER BY created_at, id`,
        [String(row.post_id)],
      );
      effectiveCommand = { type: 'sync_roster', roster: roster.rows.map((item) => Number(item.result_key)) };
    }
    const nextState = applyPlayLiveStateCommand(normalizeLiveState(row.state), effectiveCommand);
    const nextRevision = Number(row.revision) + 1;
    const updated = await client.query(
      `UPDATE play_game_sessions SET state = $2::jsonb, revision = $3, updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      [sessionId, JSON.stringify(nextState), nextRevision],
    );
    await client.query(
      `INSERT INTO play_game_session_commands
        (session_id, command_id, command_type, expected_revision, applied_revision, payload, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7)`,
      [sessionId, commandId, command.type, expectedRevision, nextRevision, JSON.stringify(command), actor.kind === 'user' ? actor.userId : null],
    );
    await client.query('COMMIT');
    return mapSession(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function liveStateToResult(state: PlayLiveState): StructuredPlayResult {
  return state.format === 'king_sideout'
    ? { version: 2, format: state.format, pairingMode: state.pairingMode, pointLimit: PLAY_KING_POINT_LIMIT, matches: [], rounds: state.rounds, roundDurationMinutes: state.roundDurationMinutes }
    : { version: 2, format: state.format, pairingMode: state.pairingMode, pointLimit: state.pointLimit, matches: state.matches };
}
