import { getPool } from '@/lib/db';
import type { MatchState } from './types';

export interface JudgeScoreboardServerSnapshot {
  state: MatchState | null;
  version: number;
  updatedAt: string | null;
}

export class JudgeScoreboardConflictError extends Error {
  snapshot: JudgeScoreboardServerSnapshot;

  constructor(message: string, snapshot: JudgeScoreboardServerSnapshot) {
    super(message);
    this.name = 'JudgeScoreboardConflictError';
    this.snapshot = snapshot;
  }
}

function normalizeCourtId(input: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '1';
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits === '1' || digits === '2' || digits === '3' || digits === '4') return digits;
  return '1';
}

export async function getJudgeScoreboardServerState(
  courtIdInput: string,
): Promise<JudgeScoreboardServerSnapshot> {
  const courtId = normalizeCourtId(courtIdInput);
  const { rows } = await getPool().query<{
    state_json: unknown;
    version: number | string;
    updated_at: string | Date | null;
  }>(
    `SELECT state_json, version, updated_at
       FROM judge_scoreboard_state
      WHERE court_id = $1
      LIMIT 1`,
    [courtId],
  );
  const row = rows[0];
  if (!row) {
    return { state: null, version: 0, updatedAt: null };
  }
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at
        ? String(row.updated_at)
        : null;
  return {
    state: row.state_json && typeof row.state_json === 'object' ? (row.state_json as MatchState) : null,
    version: Number(row.version || 0),
    updatedAt,
  };
}

export async function upsertJudgeScoreboardServerState(
  courtIdInput: string,
  state: MatchState,
  updatedBy: string | null,
  expectedVersion?: number,
): Promise<JudgeScoreboardServerSnapshot> {
  const courtId = normalizeCourtId(courtIdInput);
  const pool = getPool();
  const normalizedExpected =
    typeof expectedVersion === 'number' && Number.isFinite(expectedVersion) && expectedVersion >= 0
      ? Math.floor(expectedVersion)
      : null;
  const { rows } = await pool.query<{
    state_json: unknown;
    version: number | string;
    updated_at: string | Date | null;
  }>(
    `INSERT INTO judge_scoreboard_state (court_id, state_json, version, updated_by, updated_at)
          VALUES ($1, $2::jsonb, 1, $3, now())
      ON CONFLICT (court_id) DO UPDATE
            SET state_json = EXCLUDED.state_json,
                version = judge_scoreboard_state.version + 1,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
          WHERE ($4::bigint IS NULL) OR (judge_scoreboard_state.version = $4::bigint)
      RETURNING state_json, version, updated_at`,
    [courtId, JSON.stringify(state), updatedBy, normalizedExpected],
  );
  if (!rows[0]) {
    const snapshot = await getJudgeScoreboardServerState(courtId);
    throw new JudgeScoreboardConflictError('Version conflict', snapshot);
  }
  const row = rows[0];
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at
        ? String(row.updated_at)
        : null;
  return {
    state: row.state_json && typeof row.state_json === 'object' ? (row.state_json as MatchState) : null,
    version: Number(row.version || 0),
    updatedAt,
  };
}
