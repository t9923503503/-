import { randomUUID } from 'crypto';
import { PoolClient, QueryResultRow } from 'pg';
import { getPool } from '@/lib/db';
import { createSeatNonce, issueSeatToken } from './token';
import {
  CommandActor,
  CommandExecutionResult,
  CommandInput,
  CommandScope,
  JoinSeatInput,
  JoinSeatResult,
  LiveCourtState,
  LiveDivisionState,
  LivePresenceSeat,
  LiveSeat,
  LiveSessionSummary,
  SeatTokenPayload,
  SessionSnapshot,
} from './types';

const LEASE_GRACE_SECONDS = 5;
const DEFAULT_NOTIFY_CHANNEL = 'kotc_events';

class LiveApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getNotifyChannel(): string {
  return String(process.env.KOTC_NOTIFY_CHANNEL || DEFAULT_NOTIFY_CHANNEL).trim() || DEFAULT_NOTIFY_CHANNEL;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return new Date(0).toISOString();
}

function parseStateJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asRecord(parsed);
    } catch {
      return {};
    }
  }
  return {};
}

function parseCourtIdx(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4) return null;
  return n;
}

function mapSeatRow(row: QueryResultRow): LiveSeat {
  return {
    seatId: Number(row.seat_id),
    sessionId: String(row.session_id),
    role: String(row.role) === 'hub' ? 'hub' : 'judge',
    courtIdx: row.court_idx == null ? null : Number(row.court_idx),
    deviceId: String(row.device_id || ''),
    displayName: String(row.display_name || ''),
    seatNonce: String(row.seat_nonce || ''),
    leaseUntil: asIso(row.lease_until),
    lastSeenAt: asIso(row.last_seen_at),
    createdAt: asIso(row.created_at),
  };
}

function mapSessionSummaryRow(row: QueryResultRow): LiveSessionSummary {
  return {
    sessionId: String(row.session_id),
    tournamentId: String(row.tournament_id),
    status: String(row.status) as LiveSessionSummary['status'],
    phase: String(row.phase || 'setup'),
    nc: asNum(row.nc, 4),
    ppc: asNum(row.ppc, 4),
    sessionVersion: asNum(row.session_version, 0),
    structureEpoch: asNum(row.structure_epoch, 0),
    updatedAt: asIso(row.updated_at),
    judgeCount: asNum(row.judge_count, 0),
  };
}

function mapCourtRow(row: QueryResultRow): LiveCourtState {
  return {
    sessionId: String(row.session_id),
    courtIdx: asNum(row.court_idx),
    courtVersion: asNum(row.court_version, 0),
    roundIdx: asNum(row.round_idx, 0),
    rosterM: asArray(row.roster_m_json),
    rosterW: asArray(row.roster_w_json),
    scores: asRecord(row.scores_json),
    timerStatus: (['idle', 'running', 'paused'].includes(String(row.timer_status))
      ? String(row.timer_status)
      : 'idle') as LiveCourtState['timerStatus'],
    timerDurationMs: asNum(row.timer_duration_ms, 0),
    timerEndsAt: row.timer_ends_at ? asIso(row.timer_ends_at) : null,
    timerPausedAt: row.timer_paused_at ? asIso(row.timer_paused_at) : null,
    lastCommandId: row.last_command_id ? String(row.last_command_id) : null,
    lastUpdatedAt: asIso(row.last_updated_at),
    lastUpdatedBy: row.last_updated_by ? String(row.last_updated_by) : null,
  };
}

function mapDivisionRow(row: QueryResultRow): LiveDivisionState {
  return {
    sessionId: String(row.session_id),
    divisionKey: String(row.division_key),
    divisionVersion: asNum(row.division_version, 0),
    roster: asArray(row.roster_json),
    scores: asRecord(row.scores_json),
    roundIdx: asNum(row.round_idx, 0),
    updatedAt: asIso(row.updated_at),
  };
}

function mapPresenceRow(row: QueryResultRow): LivePresenceSeat {
  return {
    seatId: asNum(row.seat_id),
    role: String(row.role) === 'hub' ? 'hub' : 'judge',
    courtIdx: row.court_idx == null ? null : asNum(row.court_idx),
    deviceId: String(row.device_id || ''),
    displayName: String(row.display_name || ''),
    leaseUntil: asIso(row.lease_until),
    lastSeenAt: asIso(row.last_seen_at),
    isOnline: Boolean(row.is_online),
  };
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupExpiredSeatsTx(client: PoolClient, sessionId?: string): Promise<void> {
  if (sessionId) {
    await client.query(
      `
      UPDATE live_kotc_seat
      SET released_at = COALESCE(released_at, now())
      WHERE session_id = $1
        AND released_at IS NULL
        AND lease_until < now() - ($2::text || ' seconds')::interval
      `,
      [sessionId, LEASE_GRACE_SECONDS]
    );
    return;
  }
  await client.query(
    `
    UPDATE live_kotc_seat
    SET released_at = COALESCE(released_at, now())
    WHERE released_at IS NULL
      AND lease_until < now() - ($1::text || ' seconds')::interval
    `,
    [LEASE_GRACE_SECONDS]
  );
}

async function loadSnapshotTx(
  client: PoolClient,
  sessionId: string,
  scope: 'global' | 'full'
): Promise<SessionSnapshot> {
  const sessionRes = await client.query(
    `
    SELECT session_id, tournament_id, status, phase, nc, ppc, session_version, structure_epoch,
           state_json, created_at, updated_at, finished_at
    FROM live_kotc_session
    WHERE session_id = $1
    LIMIT 1
    `,
    [sessionId]
  );
  const sessionRow = sessionRes.rows[0];
  if (!sessionRow) throw new LiveApiError(404, 'Session not found');

  const courtsRes = await client.query(
    `
    SELECT session_id, court_idx, court_version, round_idx, roster_m_json, roster_w_json, scores_json,
           timer_status, timer_duration_ms, timer_ends_at, timer_paused_at, last_command_id, last_updated_at, last_updated_by
    FROM live_kotc_court_state
    WHERE session_id = $1
    ORDER BY court_idx ASC
    `,
    [sessionId]
  );
  const presenceRes = await client.query(
    `
    SELECT seat_id, role, court_idx, device_id, display_name, lease_until, last_seen_at,
           (lease_until >= now() - interval '5 seconds') AS is_online
    FROM live_kotc_seat
    WHERE session_id = $1 AND released_at IS NULL
    ORDER BY role ASC, court_idx ASC NULLS FIRST
    `,
    [sessionId]
  );

  let divisions: LiveDivisionState[] = [];
  if (scope === 'full') {
    const divRes = await client.query(
      `
      SELECT session_id, division_key, division_version, roster_json, scores_json, round_idx, updated_at
      FROM live_kotc_division_state
      WHERE session_id = $1
      ORDER BY division_key ASC
      `,
      [sessionId]
    );
    divisions = divRes.rows.map(mapDivisionRow);
  }

  return {
    session: {
      sessionId: String(sessionRow.session_id),
      tournamentId: String(sessionRow.tournament_id),
      status: String(sessionRow.status) as SessionSnapshot['session']['status'],
      phase: String(sessionRow.phase || 'setup'),
      nc: asNum(sessionRow.nc, 4),
      ppc: asNum(sessionRow.ppc, 4),
      sessionVersion: asNum(sessionRow.session_version, 1),
      structureEpoch: asNum(sessionRow.structure_epoch, 0),
      state: parseStateJson(sessionRow.state_json),
      createdAt: asIso(sessionRow.created_at),
      updatedAt: asIso(sessionRow.updated_at),
      finishedAt: sessionRow.finished_at ? asIso(sessionRow.finished_at) : null,
    },
    courts: courtsRes.rows.map(mapCourtRow),
    divisions,
    presence: presenceRes.rows.map(mapPresenceRow),
    serverNow: Date.now(),
  };
}

function ensureJudgeScope(actor: CommandActor, scope: CommandScope): void {
  if (actor.kind !== 'seat') return;
  if (actor.token.role !== 'judge') return;
  if (scope === 'court') return;
  throw new LiveApiError(403, 'Judge can only execute court.* commands');
}

function commandScope(commandType: string): CommandScope {
  if (commandType.startsWith('court.')) return 'court';
  if (commandType.startsWith('roster.') || commandType.startsWith('phase.')) return 'structure';
  if (commandType.startsWith('session.')) return 'session';
  if (commandType.startsWith('division.')) return 'division';
  if (commandType.startsWith('seat.')) return 'seat';
  if (commandType.startsWith('global.')) return 'global';
  throw new LiveApiError(400, `Unsupported command type: ${commandType}`);
}

async function validateSeatActorTx(
  client: PoolClient,
  sessionId: string,
  token: SeatTokenPayload
): Promise<QueryResultRow> {
  if (token.session_id !== sessionId) throw new LiveApiError(401, 'Seat token belongs to another session');
  const seatRes = await client.query(
    `
    SELECT seat_id, session_id, role, court_idx, device_id, display_name, seat_nonce, lease_until, released_at
    FROM live_kotc_seat
    WHERE seat_id = $1 AND session_id = $2
    LIMIT 1
    `,
    [token.seat_id, sessionId]
  );
  const seat = seatRes.rows[0];
  if (!seat) throw new LiveApiError(401, 'Seat not found');
  if (seat.released_at) throw new LiveApiError(401, 'Seat is released');
  if (String(seat.seat_nonce) !== token.seat_nonce) throw new LiveApiError(401, 'Seat token nonce mismatch');
  if (String(seat.device_id) !== token.device_id) throw new LiveApiError(401, 'Seat token device mismatch');
  if (token.role !== seat.role) throw new LiveApiError(401, 'Seat token role mismatch');
  if (token.court_idx !== (seat.court_idx == null ? null : Number(seat.court_idx))) {
    throw new LiveApiError(401, 'Seat token court mismatch');
  }
  await client.query(
    `
    UPDATE live_kotc_seat
    SET last_seen_at = now(),
        lease_until = now() + interval '45 seconds'
    WHERE seat_id = $1
    `,
    [seat.seat_id]
  );
  return seat;
}

function cloneObject<T>(input: T): T {
  return JSON.parse(JSON.stringify(input ?? null)) as T;
}

function applyRosterAssign(
  state: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = cloneObject(state);
  const roster = asArray(next.roster);
  roster.push({
    playerId: String(payload.playerId ?? ''),
    playerName: String(payload.playerName ?? ''),
    gender: String(payload.gender ?? ''),
    courtIdx: parseCourtIdx(payload.courtIdx),
    addedAt: new Date().toISOString(),
  });
  next.roster = roster;
  return next;
}

function applyRosterRemove(
  state: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = cloneObject(state);
  const playerId = String(payload.playerId ?? '');
  const roster = asArray(next.roster).filter((item) => {
    const row = asRecord(item);
    return String(row.playerId || '') !== playerId;
  });
  next.roster = roster;
  return next;
}

function applyBroadcastMessage(
  state: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = cloneObject(state);
  const message = String(payload.message ?? '').trim();
  if (!message) return next;
  const messages = asArray(next.messages);
  messages.push({
    message,
    createdAt: new Date().toISOString(),
    level: String(payload.level || 'info'),
  });
  next.messages = messages;
  return next;
}

function mergeScores(
  current: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = cloneObject(current);
  const scoresPatch = asRecord(payload.scores);
  if (Object.keys(scoresPatch).length > 0) {
    return { ...next, ...scoresPatch };
  }
  const key = asText(payload.key, '');
  if (key) {
    next[key] = payload.value ?? null;
    return next;
  }
  const team = asText(payload.team, '');
  if (team) {
    next[team] = payload.value ?? null;
  }
  return next;
}

export async function listActiveSessions(): Promise<LiveSessionSummary[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `
    SELECT s.session_id, s.tournament_id, s.status, s.phase, s.nc, s.ppc,
           s.session_version, s.structure_epoch, s.updated_at,
           COALESCE(COUNT(seat.seat_id), 0)::int AS judge_count
    FROM live_kotc_session s
    LEFT JOIN live_kotc_seat seat
      ON seat.session_id = s.session_id
     AND seat.role = 'judge'
     AND seat.released_at IS NULL
     AND seat.lease_until >= now() - interval '5 seconds'
    WHERE s.status IN ('active', 'paused')
    GROUP BY s.session_id
    ORDER BY s.updated_at DESC
    `
  );
  return rows.map(mapSessionSummaryRow);
}

export async function createLiveSession(input: {
  tournamentId: string;
  sessionId?: string;
  nc?: number;
  phase?: string;
  state?: Record<string, unknown>;
}): Promise<SessionSnapshot> {
  const tournamentId = String(input.tournamentId || '').trim();
  if (!tournamentId) throw new LiveApiError(400, 'tournamentId is required');
  const sessionId = String(input.sessionId || randomUUID());
  const ncRaw = Number(input.nc ?? 4);
  const nc = Number.isInteger(ncRaw) && ncRaw >= 1 && ncRaw <= 4 ? ncRaw : 4;
  const phase = String(input.phase || 'setup');
  const state = asRecord(input.state ?? {});

  return withTransaction(async (client) => {
    const tRes = await client.query(`SELECT id FROM tournaments WHERE id = $1 LIMIT 1`, [tournamentId]);
    if (!tRes.rows[0]) throw new LiveApiError(404, 'Tournament not found');
    await client.query(
      `
      INSERT INTO live_kotc_session (
        session_id, tournament_id, status, phase, nc, ppc, state_json
      ) VALUES ($1, $2, 'active', $3, $4, 4, $5::jsonb)
      `,
      [sessionId, tournamentId, phase, nc, state]
    );
    for (let i = 1; i <= nc; i += 1) {
      await client.query(
        `
        INSERT INTO live_kotc_court_state (session_id, court_idx)
        VALUES ($1, $2)
        `,
        [sessionId, i]
      );
    }
    return loadSnapshotTx(client, sessionId, 'full');
  });
}

export async function getSessionSnapshot(
  sessionId: string,
  scope: 'global' | 'full' = 'full'
): Promise<SessionSnapshot> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await loadSnapshotTx(client, sessionId, scope);
  } finally {
    client.release();
  }
}

export async function getCourtSnapshot(sessionId: string, courtIdx: number): Promise<LiveCourtState> {
  const pool = getPool();
  const { rows } = await pool.query(
    `
    SELECT session_id, court_idx, court_version, round_idx, roster_m_json, roster_w_json, scores_json,
           timer_status, timer_duration_ms, timer_ends_at, timer_paused_at, last_command_id, last_updated_at, last_updated_by
    FROM live_kotc_court_state
    WHERE session_id = $1 AND court_idx = $2
    LIMIT 1
    `,
    [sessionId, courtIdx]
  );
  const row = rows[0];
  if (!row) throw new LiveApiError(404, 'Court state not found');
  return mapCourtRow(row);
}

export async function getPresence(sessionId: string): Promise<LivePresenceSeat[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `
    SELECT seat_id, role, court_idx, device_id, display_name, lease_until, last_seen_at,
           (lease_until >= now() - interval '5 seconds') AS is_online
    FROM live_kotc_seat
    WHERE session_id = $1 AND released_at IS NULL
    ORDER BY role ASC, court_idx ASC NULLS FIRST
    `,
    [sessionId]
  );
  return rows.map(mapPresenceRow);
}

export async function joinSeat(sessionId: string, input: JoinSeatInput): Promise<JoinSeatResult> {
  const role = input.role;
  const courtIdx = input.courtIdx;
  const deviceId = String(input.deviceId || '').trim();
  const displayName = String(input.displayName || '').trim();
  if (!deviceId) throw new LiveApiError(400, 'deviceId is required');

  return withTransaction(async (client) => {
    await cleanupExpiredSeatsTx(client, sessionId);
    const sessionRes = await client.query(
      `
      SELECT session_id, status, nc
      FROM live_kotc_session
      WHERE session_id = $1
      FOR UPDATE
      `,
      [sessionId]
    );
    const sessionRow = sessionRes.rows[0];
    if (!sessionRow) throw new LiveApiError(404, 'Session not found');
    const status = String(sessionRow.status);
    if (status === 'finished' || status === 'cancelled') {
      return { joined: false, reason: 'session_closed' };
    }

    await client.query(
      `
      UPDATE live_kotc_seat
      SET released_at = now()
      WHERE session_id = $1
        AND device_id = $2
        AND released_at IS NULL
      `,
      [sessionId, deviceId]
    );

    let seatRow: QueryResultRow | null = null;
    if (role === 'hub') {
      const hubRes = await client.query(
        `
        SELECT *
        FROM live_kotc_seat
        WHERE session_id = $1
          AND role = 'hub'
          AND released_at IS NULL
        FOR UPDATE
        `,
        [sessionId]
      );
      if (hubRes.rows[0] && String(hubRes.rows[0].device_id) !== deviceId) {
        return {
          joined: false,
          reason: 'occupied',
          occupiedBy: {
            displayName: String(hubRes.rows[0].display_name || ''),
            deviceId: String(hubRes.rows[0].device_id || ''),
            leaseUntil: asIso(hubRes.rows[0].lease_until),
          },
        };
      }
      const seatNonce = createSeatNonce();
      if (hubRes.rows[0]) {
        const upd = await client.query(
          `
          UPDATE live_kotc_seat
          SET device_id = $2,
              display_name = $3,
              seat_nonce = $4,
              lease_until = now() + interval '45 seconds',
              last_seen_at = now(),
              released_at = NULL
          WHERE seat_id = $1
          RETURNING *
          `,
          [hubRes.rows[0].seat_id, deviceId, displayName, seatNonce]
        );
        seatRow = upd.rows[0] || null;
      } else {
        const ins = await client.query(
          `
          INSERT INTO live_kotc_seat (session_id, role, court_idx, device_id, display_name, seat_nonce)
          VALUES ($1, 'hub', NULL, $2, $3, $4)
          RETURNING *
          `,
          [sessionId, deviceId, displayName, seatNonce]
        );
        seatRow = ins.rows[0] || null;
      }
      if (seatRow) {
        await client.query(
          `UPDATE live_kotc_session SET hub_seat_id = $2, updated_at = now() WHERE session_id = $1`,
          [sessionId, seatRow.seat_id]
        );
      }
    } else {
      const normalizedCourt = parseCourtIdx(courtIdx);
      const nc = asNum(sessionRow.nc, 4);
      if (!normalizedCourt || normalizedCourt > nc) {
        return { joined: false, reason: 'invalid_court' };
      }
      const courtSeatRes = await client.query(
        `
        SELECT *
        FROM live_kotc_seat
        WHERE session_id = $1
          AND role = 'judge'
          AND court_idx = $2
          AND released_at IS NULL
        FOR UPDATE
        `,
        [sessionId, normalizedCourt]
      );
      if (courtSeatRes.rows[0] && String(courtSeatRes.rows[0].device_id) !== deviceId) {
        return {
          joined: false,
          reason: 'occupied',
          occupiedBy: {
            displayName: String(courtSeatRes.rows[0].display_name || ''),
            deviceId: String(courtSeatRes.rows[0].device_id || ''),
            leaseUntil: asIso(courtSeatRes.rows[0].lease_until),
          },
        };
      }
      const seatNonce = createSeatNonce();
      if (courtSeatRes.rows[0]) {
        const upd = await client.query(
          `
          UPDATE live_kotc_seat
          SET device_id = $2,
              display_name = $3,
              seat_nonce = $4,
              lease_until = now() + interval '45 seconds',
              last_seen_at = now(),
              released_at = NULL
          WHERE seat_id = $1
          RETURNING *
          `,
          [courtSeatRes.rows[0].seat_id, deviceId, displayName, seatNonce]
        );
        seatRow = upd.rows[0] || null;
      } else {
        const ins = await client.query(
          `
          INSERT INTO live_kotc_seat (session_id, role, court_idx, device_id, display_name, seat_nonce)
          VALUES ($1, 'judge', $2, $3, $4, $5)
          RETURNING *
          `,
          [sessionId, normalizedCourt, deviceId, displayName, seatNonce]
        );
        seatRow = ins.rows[0] || null;
      }
    }

    if (!seatRow) throw new LiveApiError(500, 'Failed to claim seat');
    const seat = mapSeatRow(seatRow);
    const seatToken = issueSeatToken({
      sessionId,
      seatId: seat.seatId,
      role: seat.role,
      courtIdx: seat.courtIdx,
      deviceId: seat.deviceId,
      seatNonce: seat.seatNonce,
    });
    const snapshot = await loadSnapshotTx(client, sessionId, 'global');
    return {
      joined: true,
      seat,
      seatToken,
      snapshot,
    };
  });
}

export async function releaseSeat(
  sessionId: string,
  input: {
    seatToken?: SeatTokenPayload | null;
    courtIdx?: number | null;
  }
): Promise<{ released: boolean }> {
  return withTransaction(async (client) => {
    await cleanupExpiredSeatsTx(client, sessionId);
    if (input.seatToken) {
      await validateSeatActorTx(client, sessionId, input.seatToken);
      const rel = await client.query(
        `
        UPDATE live_kotc_seat
        SET released_at = now()
        WHERE session_id = $1
          AND seat_id = $2
          AND released_at IS NULL
        `,
        [sessionId, input.seatToken.seat_id]
      );
      return { released: (rel.rowCount ?? 0) > 0 };
    }

    const normalizedCourt = parseCourtIdx(input.courtIdx);
    if (!normalizedCourt) throw new LiveApiError(400, 'courtIdx is required for admin release');
    const rel = await client.query(
      `
      UPDATE live_kotc_seat
      SET released_at = now()
      WHERE session_id = $1
        AND role = 'judge'
        AND court_idx = $2
        AND released_at IS NULL
      `,
      [sessionId, normalizedCourt]
    );
    return { released: (rel.rowCount ?? 0) > 0 };
  });
}

type CommandApplyResult = {
  beforeVersion: number;
  sessionVersion: number;
  structureEpoch: number;
  courtVersion: number | null;
  divisionVersion: number | null;
  courtIdx: number | null;
  delta: Record<string, unknown> | null;
};

async function applyCommandTx(
  client: PoolClient,
  sessionId: string,
  actor: CommandActor,
  command: CommandInput
): Promise<CommandApplyResult> {
  const scope = commandScope(command.commandType);
  ensureJudgeScope(actor, scope);

  const payload = asRecord(command.payload);
  const expectedCourtVersion =
    command.expectedCourtVersion == null ? null : Number(command.expectedCourtVersion);
  const expectedStructureEpoch =
    command.expectedStructureEpoch == null ? null : Number(command.expectedStructureEpoch);

  if (scope === 'court') {
    let courtIdx = parseCourtIdx(payload.courtIdx);
    if (actor.kind === 'seat' && actor.token.role === 'judge') {
      courtIdx = actor.token.court_idx;
    }
    if (!courtIdx) throw new LiveApiError(400, 'courtIdx is required for court.* commands');

    const sessionRes = await client.query(
      `
      SELECT session_id, status, structure_epoch, session_version
      FROM live_kotc_session
      WHERE session_id = $1
      LIMIT 1
      `,
      [sessionId]
    );
    const session = sessionRes.rows[0];
    if (!session) throw new LiveApiError(404, 'Session not found');
    if (String(session.status) === 'finished' || String(session.status) === 'cancelled') {
      throw new LiveApiError(409, 'Session is closed');
    }

    const courtRes = await client.query(
      `
      SELECT *
      FROM live_kotc_court_state
      WHERE session_id = $1 AND court_idx = $2
      FOR UPDATE
      `,
      [sessionId, courtIdx]
    );
    const court = courtRes.rows[0];
    if (!court) throw new LiveApiError(404, 'Court state not found');
    const currentCourtVersion = asNum(court.court_version, 0);
    if (expectedCourtVersion != null && expectedCourtVersion !== currentCourtVersion) {
      throw new LiveApiError(409, `Court version mismatch: expected ${expectedCourtVersion}, got ${currentCourtVersion}`);
    }

    const actorId =
      actor.kind === 'admin'
        ? `admin:${actor.actorId}`
        : `${actor.token.role}:${actor.token.device_id}`;
    let nextRound = asNum(court.round_idx, 0);
    let nextScores = asRecord(court.scores_json);
    let nextTimerStatus = String(court.timer_status || 'idle');
    let nextTimerDuration = asNum(court.timer_duration_ms, 0);
    let nextTimerEndsAt: Date | null = court.timer_ends_at ? new Date(court.timer_ends_at) : null;
    let nextTimerPausedAt: Date | null = court.timer_paused_at ? new Date(court.timer_paused_at) : null;

    if (command.commandType === 'court.score_set') {
      nextScores = mergeScores(nextScores, payload);
    } else if (command.commandType === 'court.round_set') {
      nextRound = Math.max(0, Math.trunc(asNum(payload.roundIdx, nextRound)));
    } else if (command.commandType === 'court.timer_start') {
      const durationMs = Math.max(0, Math.trunc(asNum(payload.durationMs, nextTimerDuration)));
      nextTimerStatus = 'running';
      nextTimerDuration = durationMs;
      nextTimerEndsAt = new Date(Date.now() + durationMs);
      nextTimerPausedAt = null;
    } else if (command.commandType === 'court.timer_pause') {
      if (nextTimerStatus === 'running' && nextTimerEndsAt) {
        const remaining = Math.max(0, nextTimerEndsAt.getTime() - Date.now());
        nextTimerDuration = remaining;
      }
      nextTimerStatus = 'paused';
      nextTimerEndsAt = null;
      nextTimerPausedAt = new Date();
    } else if (command.commandType === 'court.timer_reset') {
      const durationMs = Math.max(0, Math.trunc(asNum(payload.durationMs, 0)));
      nextTimerStatus = 'idle';
      nextTimerDuration = durationMs;
      nextTimerEndsAt = null;
      nextTimerPausedAt = null;
    } else if (command.commandType === 'court.timer_adjust') {
      const deltaMs = Math.trunc(asNum(payload.deltaMs, 0));
      if (nextTimerStatus === 'running' && nextTimerEndsAt) {
        nextTimerEndsAt = new Date(nextTimerEndsAt.getTime() + deltaMs);
      } else {
        nextTimerDuration = Math.max(0, nextTimerDuration + deltaMs);
      }
    } else {
      throw new LiveApiError(400, `Unsupported court command: ${command.commandType}`);
    }

    const courtUpd = await client.query(
      `
      UPDATE live_kotc_court_state
      SET round_idx = $3,
          scores_json = $4::jsonb,
          timer_status = $5,
          timer_duration_ms = $6,
          timer_ends_at = $7,
          timer_paused_at = $8,
          last_command_id = $9,
          last_updated_at = now(),
          last_updated_by = $10,
          court_version = court_version + 1
      WHERE session_id = $1 AND court_idx = $2
      RETURNING court_version
      `,
      [
        sessionId,
        courtIdx,
        nextRound,
        nextScores,
        nextTimerStatus,
        nextTimerDuration,
        nextTimerEndsAt,
        nextTimerPausedAt,
        command.commandId,
        actorId,
      ]
    );
    const nextCourtVersion = asNum(courtUpd.rows[0]?.court_version, currentCourtVersion + 1);
    const sessionUpd = await client.query(
      `
      UPDATE live_kotc_session
      SET session_version = session_version + 1,
          updated_at = now()
      WHERE session_id = $1
      RETURNING session_version, structure_epoch
      `,
      [sessionId]
    );
    const nextSessionVersion = asNum(sessionUpd.rows[0]?.session_version, asNum(session.session_version, 0) + 1);
    const structureEpoch = asNum(sessionUpd.rows[0]?.structure_epoch, asNum(session.structure_epoch, 0));
    return {
      beforeVersion: asNum(session.session_version, 0),
      sessionVersion: nextSessionVersion,
      structureEpoch,
      courtVersion: nextCourtVersion,
      divisionVersion: null,
      courtIdx,
      delta: {
        court_idx: courtIdx,
        round_idx: nextRound,
        scores: nextScores,
        timer: {
          status: nextTimerStatus,
          durationMs: nextTimerDuration,
          endsAt: nextTimerEndsAt ? nextTimerEndsAt.toISOString() : null,
          pausedAt: nextTimerPausedAt ? nextTimerPausedAt.toISOString() : null,
        },
      },
    };
  }

  if (scope === 'structure') {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [sessionId]);
  }
  const sessionRes = await client.query(
    `
    SELECT session_id, status, phase, structure_epoch, session_version, state_json, finished_at
    FROM live_kotc_session
    WHERE session_id = $1
    FOR UPDATE
    `,
    [sessionId]
  );
  const session = sessionRes.rows[0];
  if (!session) throw new LiveApiError(404, 'Session not found');
  if (String(session.status) === 'finished' || String(session.status) === 'cancelled') {
    throw new LiveApiError(409, 'Session is closed');
  }
  const beforeVersion = asNum(session.session_version, 0);
  const currentStructureEpoch = asNum(session.structure_epoch, 0);
  if (scope === 'structure' && expectedStructureEpoch != null && expectedStructureEpoch !== currentStructureEpoch) {
    throw new LiveApiError(
      409,
      `Structure epoch mismatch: expected ${expectedStructureEpoch}, got ${currentStructureEpoch}`
    );
  }

  let nextStatus = String(session.status);
  let nextPhase = String(session.phase);
  let nextStructureEpoch = currentStructureEpoch;
  let nextState = parseStateJson(session.state_json);
  let finishedAt: Date | null = session.finished_at ? new Date(session.finished_at) : null;
  let delta: Record<string, unknown> | null = null;

  if (command.commandType === 'roster.assign_player') {
    nextState = applyRosterAssign(nextState, payload);
    nextStructureEpoch += 1;
    delta = { roster: nextState.roster ?? [] };
  } else if (command.commandType === 'roster.remove_player') {
    nextState = applyRosterRemove(nextState, payload);
    nextStructureEpoch += 1;
    delta = { roster: nextState.roster ?? [] };
  } else if (command.commandType === 'phase.start_stage1') {
    nextPhase = 'stage1';
    nextStructureEpoch += 1;
    nextState.stage1StartedAt = new Date().toISOString();
    delta = { phase: nextPhase };
  } else if (command.commandType === 'phase.start_divisions') {
    nextPhase = 'divisions';
    nextStructureEpoch += 1;
    nextState.divisionsStartedAt = new Date().toISOString();
    delta = { phase: nextPhase };
  } else if (command.commandType === 'phase.finish') {
    nextPhase = 'finished';
    nextStatus = 'finished';
    nextStructureEpoch += 1;
    finishedAt = new Date();
    nextState.finishedAt = finishedAt.toISOString();
    delta = { phase: nextPhase, status: nextStatus };
  } else if (command.commandType === 'session.pause') {
    nextStatus = 'paused';
    delta = { status: nextStatus };
  } else if (command.commandType === 'session.resume') {
    nextStatus = 'active';
    delta = { status: nextStatus };
  } else if (command.commandType === 'global.broadcast_message') {
    nextState = applyBroadcastMessage(nextState, payload);
    delta = { message: payload.message ?? '' };
  } else if (command.commandType === 'seat.force_release') {
    const courtIdx = parseCourtIdx(payload.courtIdx);
    if (!courtIdx) throw new LiveApiError(400, 'courtIdx is required for seat.force_release');
    await client.query(
      `
      UPDATE live_kotc_seat
      SET released_at = now()
      WHERE session_id = $1
        AND role = 'judge'
        AND court_idx = $2
        AND released_at IS NULL
      `,
      [sessionId, courtIdx]
    );
    delta = { releasedCourtIdx: courtIdx };
  } else {
    throw new LiveApiError(400, `Unsupported command type: ${command.commandType}`);
  }

  const sessionUpd = await client.query(
    `
    UPDATE live_kotc_session
    SET status = $2,
        phase = $3,
        structure_epoch = $4,
        state_json = $5::jsonb,
        session_version = session_version + 1,
        updated_at = now(),
        finished_at = $6
    WHERE session_id = $1
    RETURNING session_version, structure_epoch
    `,
    [sessionId, nextStatus, nextPhase, nextStructureEpoch, nextState, finishedAt]
  );
  return {
    beforeVersion,
    sessionVersion: asNum(sessionUpd.rows[0]?.session_version, beforeVersion + 1),
    structureEpoch: asNum(sessionUpd.rows[0]?.structure_epoch, nextStructureEpoch),
    courtVersion: null,
    divisionVersion: null,
    courtIdx: parseCourtIdx(payload.courtIdx),
    delta,
  };
}

export async function executeCommand(
  sessionId: string,
  actor: CommandActor,
  command: CommandInput,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<CommandExecutionResult> {
  const commandId = String(command.commandId || '').trim();
  const commandType = String(command.commandType || '').trim();
  if (!commandId) throw new LiveApiError(400, 'commandId is required');
  if (!commandType) throw new LiveApiError(400, 'commandType is required');
  const scope = commandScope(commandType);

  return withTransaction(async (client) => {
    await cleanupExpiredSeatsTx(client, sessionId);
    const existingRes = await client.query(
      `
      SELECT applied_result_json
      FROM live_kotc_command_log
      WHERE session_id = $1 AND command_id = $2
      LIMIT 1
      `,
      [sessionId, commandId]
    );
    if (existingRes.rows[0]) {
      const stored = existingRes.rows[0].applied_result_json;
      if (!stored) throw new LiveApiError(409, 'Duplicate command is still in progress');
      return { ...(stored as CommandExecutionResult), idempotent: true };
    }

    let seatId: number | null = null;
    let seatNonce: string | null = null;
    if (actor.kind === 'seat') {
      const seat = await validateSeatActorTx(client, sessionId, actor.token);
      seatId = asNum(seat.seat_id);
      seatNonce = String(seat.seat_nonce || '');
    }

    const insertRes = await client.query(
      `
      INSERT INTO live_kotc_command_log (
        session_id, seat_id, command_id, command_type, scope, court_idx, seat_nonce, ip, user_agent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
      ON CONFLICT (session_id, command_id) DO NOTHING
      RETURNING command_log_id
      `,
      [
        sessionId,
        seatId,
        commandId,
        commandType,
        scope,
        parseCourtIdx(command.payload ? asRecord(command.payload).courtIdx : null),
        seatNonce,
        meta.ip || null,
        meta.userAgent || null,
      ]
    );
    if (!insertRes.rows[0]) {
      const dupRes = await client.query(
        `
        SELECT applied_result_json
        FROM live_kotc_command_log
        WHERE session_id = $1 AND command_id = $2
        LIMIT 1
        `,
        [sessionId, commandId]
      );
      const stored = dupRes.rows[0]?.applied_result_json;
      if (!stored) throw new LiveApiError(409, 'Duplicate command is still in progress');
      return { ...(stored as CommandExecutionResult), idempotent: true };
    }
    const commandLogId = asNum(insertRes.rows[0].command_log_id);

    const applied = await applyCommandTx(client, sessionId, actor, command);
    const result: CommandExecutionResult = {
      success: true,
      appliedCommand: commandType,
      sessionVersion: applied.sessionVersion,
      structureEpoch: applied.structureEpoch,
      courtVersion: applied.courtVersion,
      divisionVersion: applied.divisionVersion,
      delta: applied.delta,
      serverNow: Date.now(),
    };

    await client.query(
      `
      UPDATE live_kotc_command_log
      SET before_version = $2,
          after_version = $3,
          court_idx = COALESCE(court_idx, $4),
          delta_json = $5::jsonb,
          applied_result_json = $6::jsonb
      WHERE command_log_id = $1
      `,
      [commandLogId, applied.beforeVersion, applied.sessionVersion, applied.courtIdx, applied.delta, result]
    );

    const notifyPayload = JSON.stringify({
      session_id: sessionId,
      command_log_id: commandLogId,
      scope,
      court_idx: applied.courtIdx,
      command_type: commandType,
      session_version: applied.sessionVersion,
    });
    await client.query(`SELECT pg_notify($1, $2)`, [getNotifyChannel(), notifyPayload]);
    return result;
  });
}

export async function finalizeSession(sessionId: string, actorId: string): Promise<CommandExecutionResult> {
  return executeCommand(
    sessionId,
    { kind: 'admin', actorId },
    {
      commandId: `finalize:${randomUUID()}`,
      commandType: 'phase.finish',
      payload: {},
    },
    {}
  );
}

export function isLiveApiError(error: unknown): error is LiveApiError {
  return error instanceof LiveApiError;
}
