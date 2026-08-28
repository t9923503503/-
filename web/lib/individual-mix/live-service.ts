import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import {
  INDIVIDUAL_MIX_FORMAT,
  INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID,
  isIndividualMixFormat,
  normalizeIndividualMixAdminVariant,
} from './admin';
import {
  INDIVIDUAL_MIX_LIVE_STATE_SCHEMA_VERSION,
  applyIndividualMixLiveCommand,
  buildIndividualMixRosterFingerprint,
  createIndividualMixLiveState,
  type IndividualMixLiveActorKind,
  type IndividualMixLiveCommand,
  type IndividualMixLiveState,
} from './live-core';
import {
  INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1,
  INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2,
} from './six-pair-hybrid';
import type { IndividualMixPlayer } from './types';

export interface IndividualMixLiveActor {
  kind: IndividualMixLiveActorKind;
  id: string;
}

export interface IndividualMixLiveCommandEnvelope {
  commandId: string;
  expectedRevision: number;
  expectedScheduleRevision: string;
  deviceId: string;
  courtNo: number | null;
  command: IndividualMixLiveCommand;
}

export interface IndividualMixCourtAccessView {
  courtNo: number;
  pin: string;
  judgeUrl: string;
  lastSeenAt: string | null;
}

export interface IndividualMixCommandHistoryView {
  commandId: string;
  type: IndividualMixLiveCommand['type'];
  appliedRevision: number;
  deviceId: string;
  courtNo: number | null;
  actorKind: IndividualMixLiveActorKind;
  actorId: string;
  reason: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface IndividualMixSnapshotView {
  id: string;
  sourceRevision: number;
  label: string;
  reason: string;
  createdByActor: string;
  createdAt: string;
}

export interface IndividualMixReplacementCandidate {
  id: string;
  name: string;
  gender: 'M' | 'W';
}

export interface IndividualMixDeviceView {
  deviceId: string;
  actorKind: IndividualMixLiveActorKind;
  courtNo: number | null;
  lastSeenAt: string;
}

export interface IndividualMixAdminSessionView {
  id: string;
  tournamentId: string;
  tournamentName: string;
  revision: number;
  status: 'active' | 'finalized' | 'cancelled';
  state: IndividualMixLiveState;
  rosterMatches: boolean;
  currentRosterFingerprint: string;
  updatedAt: string;
  courtAccess: IndividualMixCourtAccessView[];
  commands: IndividualMixCommandHistoryView[];
  snapshots: IndividualMixSnapshotView[];
  replacementCandidates: IndividualMixReplacementCandidate[];
  devices: IndividualMixDeviceView[];
  duplicateCommand?: boolean;
}

export interface IndividualMixJudgeSessionView {
  id: string;
  tournamentId: string;
  tournamentName: string;
  revision: number;
  status: 'active' | 'finalized' | 'cancelled';
  state: IndividualMixLiveState;
  courtNo: number;
  pin: string;
  updatedAt: string;
  duplicateCommand?: boolean;
}

type SessionRow = Record<string, unknown>;

export class IndividualMixLiveServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function asIso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeState(value: unknown): IndividualMixLiveState {
  const state = asObject(value) as unknown as IndividualMixLiveState;
  if (
    (state.presetVersion !== INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V1
      && state.presetVersion !== INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION_V2) ||
    state.stateSchemaVersion !== INDIVIDUAL_MIX_LIVE_STATE_SCHEMA_VERSION ||
    !state.schedule || !Array.isArray(state.schedule.players) || !Array.isArray(state.schedule.rounds)
  ) {
    throw new IndividualMixLiveServiceError(500, 'state_schema_mismatch', 'Версия серверного состояния не поддерживается этим выпуском.');
  }
  return state;
}

function baseView(row: SessionRow): Omit<IndividualMixAdminSessionView, 'rosterMatches' | 'currentRosterFingerprint' | 'courtAccess' | 'commands' | 'snapshots' | 'replacementCandidates' | 'devices'> {
  const state = normalizeState(row.state);
  return {
    id: String(row.id),
    tournamentId: String(row.tournament_id),
    tournamentName: String(row.tournament_name ?? ''),
    revision: Number(row.revision ?? 0),
    status: String(row.status) as IndividualMixAdminSessionView['status'],
    state,
    updatedAt: asIso(row.updated_at),
  };
}

async function loadTournamentSetupTx(client: PoolClient, tournamentId: string, lock = false): Promise<{
  tournamentName: string;
  tournamentStatus: string;
  players: IndividualMixPlayer[];
}> {
  const tournament = await client.query(
    `SELECT id::text, name, format, division, settings, status
       FROM tournaments
      WHERE id = $1::uuid
      ${lock ? 'FOR UPDATE' : ''}`,
    [tournamentId],
  );
  const row = tournament.rows[0];
  if (!row) throw new IndividualMixLiveServiceError(404, 'tournament_not_found', 'Турнир не найден.');
  if (!isIndividualMixFormat(row.format) || normalizeIndividualMixAdminVariant(asObject(row.settings).individualMixVariant) !== INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID) {
    throw new IndividualMixLiveServiceError(409, 'wrong_tournament_format', `Серверный live-контур доступен только для «${INDIVIDUAL_MIX_FORMAT} · Бездельники · 6 пар».`);
  }
  const roster = await client.query(
    `SELECT tp.player_id::text AS id, p.name, p.gender, tp.position
       FROM tournament_participants tp
       JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1::uuid AND tp.is_waitlist = false
      ORDER BY tp.position, tp.registered_at, tp.id`,
    [tournamentId],
  );
  if (roster.rows.length !== 12) {
    throw new IndividualMixLiveServiceError(409, 'invalid_roster', 'Для live-сессии нужны ровно 12 игроков основного состава.');
  }
  const players: IndividualMixPlayer[] = roster.rows.map((player, index) => ({
    id: String(player.id),
    name: String(player.name),
    gender: String(player.gender) === 'W' ? 'W' : 'M',
    drawSeed: index + 1,
  }));
  if (new Set(players.map((player) => player.gender)).size !== 1) {
    throw new IndividualMixLiveServiceError(409, 'mixed_roster', 'Все 12 игроков схемы должны быть одного пола.');
  }
  return { tournamentName: String(row.name), tournamentStatus: String(row.status || 'open'), players };
}

async function sessionRowByTournamentTx(client: PoolClient, tournamentId: string, lock = false): Promise<SessionRow | null> {
  const { rows } = await client.query(
    `SELECT session.*, tournament.name AS tournament_name
       FROM individual_mix_sessions session
       JOIN tournaments tournament ON tournament.id = session.tournament_id
      WHERE session.tournament_id = $1::uuid
      ${lock ? 'FOR UPDATE OF session' : ''}`,
    [tournamentId],
  );
  return rows[0] ?? null;
}

async function sessionRowByPinTx(client: PoolClient, pin: string, lock = false): Promise<{ row: SessionRow; courtNo: number } | null> {
  const { rows } = await client.query(
    `SELECT session.*, tournament.name AS tournament_name, access.court_no
       FROM individual_mix_court_access access
       JOIN individual_mix_sessions session ON session.id = access.session_id
       JOIN tournaments tournament ON tournament.id = session.tournament_id
      WHERE access.pin_code = $1 AND access.active = true
      ${lock ? 'FOR UPDATE OF session' : ''}`,
    [pin],
  );
  return rows[0] ? { row: rows[0], courtNo: Number(rows[0].court_no) } : null;
}

async function createCourtAccessTx(client: PoolClient, sessionId: string): Promise<void> {
  for (const courtNo of [1, 2]) {
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      const pin = randomBytes(4).toString('hex').toUpperCase();
      const result = await client.query(
        `INSERT INTO individual_mix_court_access (session_id, court_no, pin_code)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT DO NOTHING`,
        [sessionId, courtNo, pin],
      );
      inserted = (result.rowCount ?? 0) > 0;
    }
    if (!inserted) throw new IndividualMixLiveServiceError(500, 'pin_generation_failed', 'Не удалось создать безопасную ссылку судьи.');
  }
}

async function loadAdminViewTx(client: PoolClient, row: SessionRow): Promise<IndividualMixAdminSessionView> {
  const base = baseView(row);
  const setup = await loadTournamentSetupTx(client, base.tournamentId).catch((error) => {
    if (
      error instanceof IndividualMixLiveServiceError
      && (error.code === 'invalid_roster' || error.code === 'mixed_roster')
    ) return null;
    throw error;
  });
  const currentRosterFingerprint = setup
    ? buildIndividualMixRosterFingerprint(setup.players, base.state.presetVersion)
    : 'invalid-roster';
  const [access, commands, snapshots, candidates] = await Promise.all([
    client.query(
      `SELECT court_no, pin_code, last_seen_at
         FROM individual_mix_court_access
        WHERE session_id = $1::uuid AND active = true
        ORDER BY court_no`,
      [base.id],
    ),
    client.query(
      `SELECT command_id::text, command_type, applied_revision, device_id, court_no,
              actor_kind, actor_id, reason, payload, created_at
         FROM individual_mix_commands
        WHERE session_id = $1::uuid
        ORDER BY applied_revision DESC
        LIMIT 100`,
      [base.id],
    ),
    client.query(
      `SELECT id::text, source_revision, label, reason, created_by_actor, created_at
         FROM individual_mix_snapshots
        WHERE session_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 20`,
      [base.id],
    ),
    client.query(
      `SELECT id::text, name, gender
         FROM players
        WHERE gender = $1
        ORDER BY lower(name), id
        LIMIT 300`,
      [base.state.schedule.players[0]?.gender ?? 'W'],
    ),
  ]);
  const commandViews: IndividualMixCommandHistoryView[] = commands.rows.map((command) => ({
    commandId: String(command.command_id),
    type: String(command.command_type) as IndividualMixLiveCommand['type'],
    appliedRevision: Number(command.applied_revision),
    deviceId: String(command.device_id),
    courtNo: command.court_no == null ? null : Number(command.court_no),
    actorKind: String(command.actor_kind) as IndividualMixLiveActorKind,
    actorId: String(command.actor_id),
    reason: command.reason ? String(command.reason) : null,
    payload: asObject(command.payload),
    createdAt: asIso(command.created_at),
  }));
  const devices = new Map<string, IndividualMixDeviceView>();
  for (const command of commandViews) {
    if (!devices.has(command.deviceId)) {
      devices.set(command.deviceId, {
        deviceId: command.deviceId,
        actorKind: command.actorKind,
        courtNo: command.courtNo,
        lastSeenAt: command.createdAt,
      });
    }
  }
  return {
    ...base,
    rosterMatches: currentRosterFingerprint === base.state.rosterFingerprint,
    currentRosterFingerprint,
    courtAccess: access.rows.map((item) => ({
      courtNo: Number(item.court_no),
      pin: String(item.pin_code),
      judgeUrl: `/individual-mix/judge/${encodeURIComponent(String(item.pin_code))}`,
      lastSeenAt: item.last_seen_at ? asIso(item.last_seen_at) : null,
    })),
    commands: commandViews,
    snapshots: snapshots.rows.map((snapshot) => ({
      id: String(snapshot.id),
      sourceRevision: Number(snapshot.source_revision),
      label: String(snapshot.label),
      reason: String(snapshot.reason),
      createdByActor: String(snapshot.created_by_actor),
      createdAt: asIso(snapshot.created_at),
    })),
    replacementCandidates: candidates.rows.map((candidate) => ({
      id: String(candidate.id),
      name: String(candidate.name),
      gender: String(candidate.gender) === 'W' ? 'W' : 'M',
    })),
    devices: [...devices.values()],
  };
}

function judgeView(row: SessionRow, courtNo: number, pin: string): IndividualMixJudgeSessionView {
  const base = baseView(row);
  return {
    id: base.id,
    tournamentId: base.tournamentId,
    tournamentName: base.tournamentName,
    revision: base.revision,
    status: base.status,
    state: base.state,
    courtNo,
    pin,
    updatedAt: base.updatedAt,
  };
}

function assertUuid(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new IndividualMixLiveServiceError(400, 'invalid_uuid', `${label} должен быть UUID.`);
  }
  return normalized;
}

function commandReason(command: IndividualMixLiveCommand): string | null {
  const payload = command.payload as { reason?: unknown };
  return String(payload.reason ?? '').trim() || null;
}

function revisionConflict(row: SessionRow): IndividualMixLiveServiceError {
  const base = baseView(row);
  return new IndividualMixLiveServiceError(409, 'revision_conflict', 'Состояние изменилось на другом устройстве. Сравните актуальный снимок перед повтором.', {
    current: {
      id: base.id,
      tournamentId: base.tournamentId,
      tournamentName: base.tournamentName,
      revision: base.revision,
      status: base.status,
      state: base.state,
      updatedAt: base.updatedAt,
    },
  });
}

async function insertSnapshotTx(client: PoolClient, input: {
  sessionId: string;
  sourceRevision: number;
  label: string;
  reason: string;
  state: IndividualMixLiveState;
  actor: IndividualMixLiveActor;
}): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO individual_mix_snapshots
       (session_id, source_revision, label, reason, state, created_by_actor)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6)
     RETURNING id::text`,
    [input.sessionId, input.sourceRevision, input.label, input.reason, JSON.stringify(input.state), `${input.actor.kind}:${input.actor.id}`],
  );
  return String(rows[0].id);
}

async function publishFinalStandingsTx(client: PoolClient, tournamentId: string, state: IndividualMixLiveState): Promise<void> {
  if (!state.finalStandings || state.finalStandings.length !== 12) {
    throw new IndividualMixLiveServiceError(409, 'final_standings_missing', 'Итоговая таблица не рассчитана.');
  }
  await client.query(`DELETE FROM tournament_results WHERE tournament_id = $1::uuid`, [tournamentId]);
  for (const row of state.finalStandings) {
    await client.query(
      `INSERT INTO tournament_results
         (tournament_id, player_id, place, game_pts, wins, diff, balls, rating_pts,
          gender, rating_type, rating_pool, rating_level, rating_excluded)
       SELECT $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 0,
              $8, $8, NULL,
              CASE
                WHEN lower(COALESCE(tournament.level, '')) IN ('advance', 'advanced') THEN 'advance'
                WHEN lower(COALESCE(tournament.level, '')) = 'medium' THEN 'medium'
                WHEN lower(COALESCE(tournament.level, '')) IN ('lite', 'light', 'easy') THEN 'lite'
                ELSE 'hard'
              END,
              $9
         FROM tournaments tournament
        WHERE tournament.id = $1::uuid`,
      [
        tournamentId, row.playerId, row.position, row.pointsFor, row.wins,
        row.pointDiff, row.pointsAgainst, row.gender, !row.ratingEligible,
      ],
    );
  }
  await client.query(`UPDATE tournaments SET status = 'finished' WHERE id = $1::uuid`, [tournamentId]);
}

async function unpublishFinalStandingsTx(client: PoolClient, tournamentId: string, state: IndividualMixLiveState): Promise<void> {
  await client.query(`DELETE FROM tournament_results WHERE tournament_id = $1::uuid`, [tournamentId]);
  const previousStatus = String(state.tournamentStatusBeforeFinalize || 'open');
  await client.query(`UPDATE tournaments SET status = $2 WHERE id = $1::uuid`, [tournamentId, previousStatus]);
}

export async function prepareIndividualMixLiveSession(
  actor: IndividualMixLiveActor,
  tournamentId: string,
): Promise<IndividualMixAdminSessionView> {
  const id = assertUuid(tournamentId, 'tournamentId');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const setup = await loadTournamentSetupTx(client, id, true);
    const existing = await sessionRowByTournamentTx(client, id, true);
    let row: SessionRow;
    if (!existing) {
      const state = createIndividualMixLiveState({ players: setup.players, scheduleRevision: randomUUID() });
      const inserted = await client.query(
        `INSERT INTO individual_mix_sessions
           (tournament_id, preset_version, state_schema_version, schedule_revision,
            roster_fingerprint, revision, current_round, state, created_by_actor)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5, 0, 1, $6::jsonb, $7)
         RETURNING *`,
        [id, state.presetVersion, state.stateSchemaVersion, state.scheduleRevision, state.rosterFingerprint, JSON.stringify(state), `${actor.kind}:${actor.id}`],
      );
      row = { ...inserted.rows[0], tournament_name: setup.tournamentName };
      await createCourtAccessTx(client, String(row.id));
    } else {
      row = existing;
    }
    const view = await loadAdminViewTx(client, row);
    await client.query('COMMIT');
    return view;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getIndividualMixAdminSession(tournamentId: string): Promise<IndividualMixAdminSessionView | null> {
  const id = assertUuid(tournamentId, 'tournamentId');
  const client = await getPool().connect();
  try {
    const row = await sessionRowByTournamentTx(client, id);
    return row ? await loadAdminViewTx(client, row) : null;
  } finally {
    client.release();
  }
}

export async function getIndividualMixJudgeSession(pinInput: string): Promise<IndividualMixJudgeSessionView> {
  const pin = String(pinInput || '').trim().toUpperCase();
  if (!pin) throw new IndividualMixLiveServiceError(404, 'pin_not_found', 'Судейская ссылка не найдена.');
  const client = await getPool().connect();
  try {
    const found = await sessionRowByPinTx(client, pin);
    if (!found) throw new IndividualMixLiveServiceError(404, 'pin_not_found', 'Судейская ссылка не найдена или отключена.');
    await client.query(
      `UPDATE individual_mix_court_access SET last_seen_at = now()
        WHERE session_id = $1::uuid AND court_no = $2`,
      [String(found.row.id), found.courtNo],
    );
    return judgeView(found.row, found.courtNo, pin);
  } finally {
    client.release();
  }
}

async function applyCommandTx(input: {
  actor: IndividualMixLiveActor;
  envelope: IndividualMixLiveCommandEnvelope;
  tournamentId?: string;
  pin?: string;
}): Promise<{ row: SessionRow; courtNo: number | null; duplicate: boolean }> {
  const envelope = input.envelope;
  const commandId = assertUuid(envelope.commandId, 'commandId');
  const deviceId = String(envelope.deviceId || '').trim();
  if (!deviceId || deviceId.length > 160) throw new IndividualMixLiveServiceError(400, 'invalid_device', 'Не задан корректный идентификатор устройства.');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const found = input.pin
      ? await sessionRowByPinTx(client, String(input.pin).trim().toUpperCase(), true)
      : null;
    const row = found?.row ?? (input.tournamentId ? await sessionRowByTournamentTx(client, assertUuid(input.tournamentId, 'tournamentId'), true) : null);
    if (!row) throw new IndividualMixLiveServiceError(404, 'session_not_found', 'Live-сессия не найдена.');
    const forcedCourtNo = found?.courtNo ?? null;
    const courtNo = forcedCourtNo ?? envelope.courtNo;
    const duplicate = await client.query(
      `SELECT 1 FROM individual_mix_commands WHERE session_id = $1::uuid AND command_id = $2::uuid`,
      [String(row.id), commandId],
    );
    if (duplicate.rows[0]) {
      await client.query('COMMIT');
      return { row, courtNo, duplicate: true };
    }
    if (Number(envelope.expectedRevision) !== Number(row.revision)) throw revisionConflict(row);
    if (String(envelope.expectedScheduleRevision) !== String(row.schedule_revision)) {
      throw new IndividualMixLiveServiceError(409, 'schedule_revision_conflict', 'Локальное расписание устарело. Загрузите актуальный серверный снимок.', {
        current: baseView(row),
      });
    }
    if (forcedCourtNo != null && envelope.courtNo != null && Number(envelope.courtNo) !== forcedCourtNo) {
      throw new IndividualMixLiveServiceError(403, 'court_forbidden', `Этот PIN закреплён за кортом ${forcedCourtNo}.`);
    }

    const beforeState = normalizeState(row.state);
    if (envelope.command.type !== 'rebuild_schedule' && envelope.command.type !== 'restore_snapshot') {
      const currentSetup = await loadTournamentSetupTx(client, String(row.tournament_id)).catch((error) => {
        if (
          error instanceof IndividualMixLiveServiceError
          && (error.code === 'invalid_roster' || error.code === 'mixed_roster')
        ) {
          throw new IndividualMixLiveServiceError(
            409,
            'roster_fingerprint_conflict',
            'Основной состав больше не соответствует схеме 6 пар. Ввод заблокирован до пересоздания со снимком.',
            { current: baseView(row), currentRosterFingerprint: 'invalid-roster' },
          );
        }
        throw error;
      });
      const currentFingerprint = buildIndividualMixRosterFingerprint(currentSetup.players, beforeState.presetVersion);
      if (currentFingerprint !== beforeState.rosterFingerprint) {
        throw new IndividualMixLiveServiceError(409, 'roster_fingerprint_conflict', 'Основной состав изменился после подготовки расписания. Ввод заблокирован до пересоздания со снимком.', {
          current: baseView(row),
          currentRosterFingerprint: currentFingerprint,
        });
      }
    }
    let effectiveCommand = envelope.command;
    if (envelope.command.type === 'replace_player') {
      const candidate = await client.query(
        `SELECT id::text, name, gender FROM players WHERE id = $1::uuid`,
        [assertUuid(envelope.command.payload.playerId, 'playerId')],
      );
      if (!candidate.rows[0]) throw new IndividualMixLiveServiceError(404, 'replacement_not_found', 'Игрок для замены не найден.');
      effectiveCommand = {
        ...envelope.command,
        payload: {
          ...envelope.command.payload,
          playerId: String(candidate.rows[0].id),
          playerName: String(candidate.rows[0].name),
          gender: String(candidate.rows[0].gender) === 'W' ? 'W' : 'M',
        },
      };
    }
    let replacementState: IndividualMixLiveState | undefined;
    let tournamentStatusBeforeFinalize: string | undefined;
    if (envelope.command.type === 'rebuild_schedule') {
      const reason = commandReason(envelope.command) ?? 'Пересоздание расписания';
      await insertSnapshotTx(client, {
        sessionId: String(row.id), sourceRevision: Number(row.revision), label: `До пересоздания · ревизия ${row.revision}`,
        reason, state: beforeState, actor: input.actor,
      });
      const setup = await loadTournamentSetupTx(client, String(row.tournament_id), true);
      replacementState = createIndividualMixLiveState({
        players: setup.players,
        scheduleRevision: randomUUID(),
        presetVersion: beforeState.presetVersion,
      });
    } else if (envelope.command.type === 'restore_snapshot') {
      const reason = commandReason(envelope.command) ?? 'Восстановление снимка';
      await insertSnapshotTx(client, {
        sessionId: String(row.id), sourceRevision: Number(row.revision), label: `До восстановления · ревизия ${row.revision}`,
        reason, state: beforeState, actor: input.actor,
      });
      const snapshot = await client.query(
        `SELECT state FROM individual_mix_snapshots WHERE id = $1::uuid AND session_id = $2::uuid`,
        [assertUuid(envelope.command.payload.snapshotId, 'snapshotId'), String(row.id)],
      );
      if (!snapshot.rows[0]) throw new IndividualMixLiveServiceError(404, 'snapshot_not_found', 'Снимок не найден.');
      replacementState = normalizeState(snapshot.rows[0].state);
      replacementState = {
        ...replacementState,
        scheduleRevision: randomUUID(),
        status: 'active',
        finalizedAt: undefined,
        finalStandings: undefined,
      };
    }

    if (effectiveCommand.type === 'finalize') {
      const setup = await loadTournamentSetupTx(client, String(row.tournament_id));
      tournamentStatusBeforeFinalize = setup.tournamentStatus;
    } else if ((effectiveCommand.type === 'rebuild_schedule' || effectiveCommand.type === 'restore_snapshot') && beforeState.status === 'finalized') {
      await unpublishFinalStandingsTx(client, String(row.tournament_id), beforeState);
    }

    const nextRevision = Number(row.revision) + 1;
    const nextState = applyIndividualMixLiveCommand(beforeState, effectiveCommand, {
      commandId,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      courtNo,
      now: new Date().toISOString(),
      nextRevision,
      replacementState,
      tournamentStatusBeforeFinalize,
    });
    if (effectiveCommand.type === 'finalize') {
      await publishFinalStandingsTx(client, String(row.tournament_id), nextState);
    }
    const updated = await client.query(
      `UPDATE individual_mix_sessions
          SET preset_version = $2,
              state_schema_version = $3,
              schedule_revision = $4::uuid,
              roster_fingerprint = $5,
              status = $6,
              revision = $7,
              current_round = $8,
              state = $9::jsonb,
              finalized_at = CASE WHEN $6 = 'finalized' THEN COALESCE(finalized_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [
        String(row.id), nextState.presetVersion, nextState.stateSchemaVersion, nextState.scheduleRevision,
        nextState.rosterFingerprint, nextState.status, nextRevision, nextState.currentRound, JSON.stringify(nextState),
      ],
    );
    await client.query(
      `INSERT INTO individual_mix_commands
         (session_id, command_id, command_type, expected_revision, applied_revision,
          expected_schedule_revision, device_id, court_no, actor_kind, actor_id,
          payload, reason, before_state, after_state)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb, $14::jsonb)`,
      [
        String(row.id), commandId, envelope.command.type, envelope.expectedRevision, nextRevision,
        envelope.expectedScheduleRevision, deviceId, courtNo, input.actor.kind, input.actor.id,
        JSON.stringify(effectiveCommand.payload), commandReason(effectiveCommand), JSON.stringify(beforeState), JSON.stringify(nextState),
      ],
    );
    await client.query('COMMIT');
    return {
      row: { ...updated.rows[0], tournament_name: row.tournament_name },
      courtNo,
      duplicate: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyIndividualMixAdminCommand(
  actor: IndividualMixLiveActor,
  tournamentId: string,
  envelope: IndividualMixLiveCommandEnvelope,
): Promise<IndividualMixAdminSessionView> {
  const applied = await applyCommandTx({ actor, tournamentId, envelope });
  const view = await getIndividualMixAdminSession(tournamentId);
  if (!view) throw new IndividualMixLiveServiceError(404, 'session_not_found', 'Live-сессия не найдена.');
  return { ...view, duplicateCommand: applied.duplicate };
}

export async function applyIndividualMixJudgeCommand(
  pinInput: string,
  envelope: IndividualMixLiveCommandEnvelope,
): Promise<IndividualMixJudgeSessionView> {
  const pin = String(pinInput || '').trim().toUpperCase();
  const applied = await applyCommandTx({ actor: { kind: 'judge', id: `court-${envelope.courtNo ?? 'pin'}` }, pin, envelope });
  return { ...judgeView(applied.row, Number(applied.courtNo), pin), duplicateCommand: applied.duplicate };
}

export function isIndividualMixLiveServiceError(error: unknown): error is IndividualMixLiveServiceError {
  return error instanceof IndividualMixLiveServiceError;
}
