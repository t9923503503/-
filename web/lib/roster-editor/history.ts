import { getPool } from '@/lib/db';
import type {
  RosterEditorAction,
  RosterEditorHistoryEntry,
  RosterEditorHistoryState,
  RosterEditorMutationOptions,
  RosterEditorSnapshot,
} from './types';

const HISTORY_LIMIT = 150;
const DEFAULT_ACTION_LOG_RETENTION_DAYS = 30;

interface PersistedHistoryRow {
  revision: number | string;
  session_id: string | null;
  cursor: number | string;
  stack_json: unknown;
}

class RosterEditorConflictError extends Error {
  readonly statusCode = 409;

  constructor(message = 'Roster editor history conflict') {
    super(message);
    this.name = 'RosterEditorConflictError';
  }
}

function normalizeTournamentId(input: string): string {
  return String(input || '').trim();
}

function clampCursor(cursor: number, stackLength: number): number {
  if (stackLength <= 0) return -1;
  if (!Number.isFinite(cursor)) return stackLength - 1;
  return Math.max(-1, Math.min(Math.trunc(cursor), stackLength - 1));
}

function normalizeSnapshot(input: unknown): RosterEditorSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const draftPlayersRaw = (input as { draftPlayers?: unknown }).draftPlayers;
  if (!Array.isArray(draftPlayersRaw)) return null;
  return {
    draftPlayers: draftPlayersRaw.map((slot) => {
      if (!slot || typeof slot !== 'object') return null;
      const gender = String((slot as { gender?: string }).gender || 'M').toUpperCase() === 'W' ? 'W' : 'M';
      const playerId = String((slot as { playerId?: string }).playerId || '').trim();
      const playerName = String((slot as { playerName?: string }).playerName || '').trim();
      if (!playerId || !playerName) return null;
      const levelRaw = String((slot as { playerLevel?: string }).playerLevel || '').toLowerCase();
      const playerLevel = levelRaw === 'hard' || levelRaw === 'medium' || levelRaw === 'easy' ? levelRaw : undefined;
      return { playerId, playerName, gender, playerLevel };
    }),
  };
}

function normalizeAction(input: unknown): RosterEditorAction {
  if (!input || typeof input !== 'object') return { type: 'assign', note: 'unknown-action' };
  const raw = input as RosterEditorAction;
  return {
    type:
      raw.type === 'assign' ||
      raw.type === 'swap' ||
      raw.type === 'move_pair' ||
      raw.type === 'remove' ||
      raw.type === 'clear_scope' ||
      raw.type === 'bulk_auto_fill'
        ? raw.type
        : 'assign',
    scope:
      raw.scope === 'categories' ||
      raw.scope === 'groups' ||
      raw.scope === 'courts' ||
      raw.scope === 'reserve' ||
      raw.scope === 'all' ||
      raw.scope === 'thai-r1'
        ? raw.scope
        : undefined,
    fromIndex: Number.isFinite(raw.fromIndex) ? Math.trunc(raw.fromIndex as number) : undefined,
    toIndex: Number.isFinite(raw.toIndex) ? Math.trunc(raw.toIndex as number) : undefined,
    indexes: Array.isArray(raw.indexes) ? raw.indexes.filter(Number.isFinite).map((value) => Math.trunc(value)) : undefined,
    pair:
      raw.pair &&
      Number.isFinite(raw.pair.fromStart) &&
      Number.isFinite(raw.pair.toStart)
        ? { fromStart: Math.trunc(raw.pair.fromStart), toStart: Math.trunc(raw.pair.toStart) }
        : undefined,
    note: typeof raw.note === 'string' ? raw.note : undefined,
  };
}

function normalizeEntry(input: unknown): RosterEditorHistoryEntry | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as { at?: unknown; action?: unknown; snapshot?: unknown };
  const snapshot = normalizeSnapshot(row.snapshot);
  if (!snapshot) return null;
  const at = typeof row.at === 'string' && row.at ? row.at : new Date().toISOString();
  return {
    at,
    action: normalizeAction(row.action),
    snapshot,
  };
}

function normalizeStack(input: unknown): RosterEditorHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry) => normalizeEntry(entry)).filter(Boolean) as RosterEditorHistoryEntry[];
}

function buildHistoryState(
  revision: number,
  sessionId: string | null,
  cursor: number,
  stack: RosterEditorHistoryEntry[],
): RosterEditorHistoryState {
  const normalizedCursor = clampCursor(cursor, stack.length);
  return {
    revision: Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : 0,
    sessionId: sessionId || null,
    cursor: normalizedCursor,
    stack,
    currentSnapshot: normalizedCursor >= 0 ? stack[normalizedCursor]?.snapshot ?? null : null,
    canUndo: normalizedCursor >= 0,
    canRedo: normalizedCursor >= 0 && normalizedCursor < stack.length - 1,
  };
}

export async function getRosterEditorHistoryState(
  tournamentIdInput: string,
  actorIdInput: string,
): Promise<RosterEditorHistoryState> {
  const tournamentId = normalizeTournamentId(tournamentIdInput);
  const actorId = String(actorIdInput || '').trim();
  if (!tournamentId || !actorId) {
    return buildHistoryState(0, null, -1, []);
  }
  const { rows } = await getPool().query<PersistedHistoryRow>(
    `SELECT revision, session_id, cursor, stack_json
       FROM roster_editor_history_state
      WHERE tournament_id = $1
        AND actor_id = $2
      LIMIT 1`,
    [tournamentId, actorId],
  );
  if (!rows[0]) return buildHistoryState(0, null, -1, []);
  return buildHistoryState(
    Number(rows[0].revision || 0),
    rows[0].session_id ?? null,
    Number(rows[0].cursor || -1),
    normalizeStack(rows[0].stack_json),
  );
}

async function persistHistoryState(
  tournamentId: string,
  actorId: string,
  revision: number,
  sessionId: string | null,
  cursor: number,
  stack: RosterEditorHistoryEntry[],
): Promise<RosterEditorHistoryState> {
  await getPool().query(
    `INSERT INTO roster_editor_history_state (tournament_id, actor_id, revision, session_id, cursor, stack_json, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
      ON CONFLICT (tournament_id, actor_id) DO UPDATE
            SET revision = EXCLUDED.revision,
                session_id = EXCLUDED.session_id,
                cursor = EXCLUDED.cursor,
                stack_json = EXCLUDED.stack_json,
                updated_at = now()`,
    [tournamentId, actorId, revision, sessionId, cursor, JSON.stringify(stack)],
  );
  return buildHistoryState(revision, sessionId, cursor, stack);
}

function assertExpectedRevision(
  current: RosterEditorHistoryState,
  expectedRevision: number | null | undefined,
): void {
  if (expectedRevision == null || !Number.isFinite(expectedRevision)) return;
  const expected = Math.max(0, Math.trunc(expectedRevision));
  if (current.revision !== expected) {
    throw new RosterEditorConflictError();
  }
}

export async function applyRosterEditorAction(
  tournamentIdInput: string,
  actorIdInput: string,
  actionInput: RosterEditorAction,
  snapshotInput: RosterEditorSnapshot,
  options?: RosterEditorMutationOptions,
): Promise<RosterEditorHistoryState> {
  const tournamentId = normalizeTournamentId(tournamentIdInput);
  const actorId = String(actorIdInput || '').trim();
  const normalizedSnapshot = normalizeSnapshot(snapshotInput);
  if (!tournamentId || !actorId || !normalizedSnapshot) {
    throw new Error('Invalid tournamentId/actorId/snapshot');
  }

  const current = await getRosterEditorHistoryState(tournamentId, actorId);
  assertExpectedRevision(current, options?.expectedRevision);
  const now = new Date().toISOString();
  const action = normalizeAction(actionInput);
  const branchBase = current.cursor >= 0 ? current.stack.slice(0, current.cursor + 1) : [];
  const pushed = [...branchBase, { at: now, action, snapshot: normalizedSnapshot }];
  const overflow = Math.max(0, pushed.length - HISTORY_LIMIT);
  const stack = overflow > 0 ? pushed.slice(overflow) : pushed;
  const nextCursor = stack.length - 1;
  const nextRevision = current.revision + 1;
  const nextSessionId = options?.sessionId ? String(options.sessionId).trim() || null : null;
  const requestId = options?.requestId ? String(options.requestId).trim() || null : null;

  await getPool().query(
    `INSERT INTO roster_editor_action_log (
        tournament_id,
        actor_id,
        session_id,
        request_id,
        revision_before,
        revision_after,
        action_json,
        snapshot_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())`,
    [
      tournamentId,
      actorId,
      nextSessionId,
      requestId,
      current.revision,
      nextRevision,
      JSON.stringify(action),
      JSON.stringify(normalizedSnapshot),
    ],
  );

  return persistHistoryState(tournamentId, actorId, nextRevision, nextSessionId, nextCursor, stack);
}

export async function undoRosterEditorAction(
  tournamentIdInput: string,
  actorIdInput: string,
  options?: RosterEditorMutationOptions,
): Promise<RosterEditorHistoryState> {
  const tournamentId = normalizeTournamentId(tournamentIdInput);
  const actorId = String(actorIdInput || '').trim();
  const current = await getRosterEditorHistoryState(tournamentId, actorId);
  assertExpectedRevision(current, options?.expectedRevision);
  if (current.cursor < 0) return current;
  return persistHistoryState(
    tournamentId,
    actorId,
    current.revision + 1,
    options?.sessionId ? String(options.sessionId).trim() || null : null,
    current.cursor - 1,
    current.stack,
  );
}

export async function redoRosterEditorAction(
  tournamentIdInput: string,
  actorIdInput: string,
  options?: RosterEditorMutationOptions,
): Promise<RosterEditorHistoryState> {
  const tournamentId = normalizeTournamentId(tournamentIdInput);
  const actorId = String(actorIdInput || '').trim();
  const current = await getRosterEditorHistoryState(tournamentId, actorId);
  assertExpectedRevision(current, options?.expectedRevision);
  if (!current.canRedo) return current;
  return persistHistoryState(
    tournamentId,
    actorId,
    current.revision + 1,
    options?.sessionId ? String(options.sessionId).trim() || null : null,
    current.cursor + 1,
    current.stack,
  );
}

export async function clearRosterEditorHistory(
  tournamentIdInput: string,
  actorIdInput: string,
  options?: RosterEditorMutationOptions,
): Promise<RosterEditorHistoryState> {
  const tournamentId = normalizeTournamentId(tournamentIdInput);
  const actorId = String(actorIdInput || '').trim();
  if (!tournamentId || !actorId) return buildHistoryState(0, null, -1, []);
  const current = await getRosterEditorHistoryState(tournamentId, actorId);
  assertExpectedRevision(current, options?.expectedRevision);
  await getPool().query(
    `INSERT INTO roster_editor_history_state (tournament_id, actor_id, revision, session_id, cursor, stack_json, updated_at)
          VALUES ($1, $2, $3, $4, -1, '[]'::jsonb, now())
      ON CONFLICT (tournament_id, actor_id) DO UPDATE
            SET revision = EXCLUDED.revision,
                session_id = EXCLUDED.session_id,
                cursor = -1,
                stack_json = '[]'::jsonb,
                updated_at = now()`,
    [
      tournamentId,
      actorId,
      current.revision + 1,
      options?.sessionId ? String(options.sessionId).trim() || null : null,
    ],
  );
  return buildHistoryState(
    current.revision + 1,
    options?.sessionId ? String(options.sessionId).trim() || null : null,
    -1,
    [],
  );
}

export function isRosterEditorConflictError(error: unknown): error is RosterEditorConflictError {
  return error instanceof RosterEditorConflictError;
}

export async function pruneRosterEditorActionLog(retentionDays = DEFAULT_ACTION_LOG_RETENTION_DAYS): Promise<number> {
  const days = Math.max(1, Math.trunc(Number(retentionDays) || DEFAULT_ACTION_LOG_RETENTION_DAYS));
  const { rowCount } = await getPool().query(
    `DELETE FROM roster_editor_action_log
      WHERE created_at < now() - ($1::text || ' days')::interval`,
    [String(days)],
  );
  return Number(rowCount || 0);
}
