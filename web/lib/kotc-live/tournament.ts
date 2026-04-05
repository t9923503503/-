import { PoolClient, QueryResultRow } from 'pg';
import { getPool } from '@/lib/db';

class KotcTournamentError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface KotcRosterEntry {
  id: string;
  tournamentId: string;
  tournamentParticipantId: string | null;
  playerId: string | null;
  displayName: string;
  seed: number | null;
  confirmed: boolean;
  active: boolean;
  dropped: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KotcRoundAssignmentView {
  assignmentId: string;
  rosterId: string;
  displayName: string;
  seed: number | null;
  courtIdx: number;
  slotIdx: number;
  levelIdx: number;
}

export interface KotcRoundView {
  id: string;
  tournamentId: string;
  roundNo: number;
  stageType: 'round1' | 'round2' | 'final';
  status: string;
  levelCount: number;
  sourceRoundId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  assignments: KotcRoundAssignmentView[];
}

export interface KotcRoundGenerateResult {
  round: KotcRoundView;
  rosterCount: number;
}

export function isKotcTournamentError(error: unknown): error is KotcTournamentError {
  return error instanceof KotcTournamentError;
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

function normalizeRosterInput(
  entries: unknown
): Array<{ playerId: string | null; displayName: string; seed: number | null; confirmed: boolean; active: boolean; dropped: boolean }> {
  if (!Array.isArray(entries)) {
    throw new KotcTournamentError(400, 'roster must be an array');
  }
  const normalized = entries.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const displayName = String(row.displayName ?? row.display_name ?? '').trim();
    const playerIdRaw = String(row.playerId ?? row.player_id ?? '').trim();
    const seedRaw = row.seed == null || row.seed === '' ? null : Number(row.seed);
    if (!displayName && !playerIdRaw) {
      throw new KotcTournamentError(400, `roster[${index}] must contain displayName or playerId`);
    }
    return {
      playerId: playerIdRaw || null,
      displayName: displayName || '',
      seed: seedRaw != null && Number.isFinite(seedRaw) ? seedRaw : null,
      confirmed: row.confirmed == null ? true : Boolean(row.confirmed),
      active: row.active == null ? true : Boolean(row.active),
      dropped: row.dropped == null ? false : Boolean(row.dropped),
    };
  });
  return normalized;
}

function mapRosterRow(row: QueryResultRow): KotcRosterEntry {
  return {
    id: String(row.id),
    tournamentId: String(row.tournament_id),
    tournamentParticipantId: row.tournament_participant_id ? String(row.tournament_participant_id) : null,
    playerId: row.player_id ? String(row.player_id) : null,
    displayName: String(row.display_name || ''),
    seed: row.seed == null ? null : asNum(row.seed),
    confirmed: Boolean(row.confirmed),
    active: Boolean(row.active),
    dropped: Boolean(row.dropped),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function mapRoundView(roundRow: QueryResultRow, assignmentRows: QueryResultRow[]): KotcRoundView {
  return {
    id: String(roundRow.id),
    tournamentId: String(roundRow.tournament_id),
    roundNo: asNum(roundRow.round_no),
    stageType: String(roundRow.stage_type) as KotcRoundView['stageType'],
    status: String(roundRow.status || 'draft'),
    levelCount: asNum(roundRow.level_count, 1),
    sourceRoundId: roundRow.source_round_id ? String(roundRow.source_round_id) : null,
    createdAt: asIso(roundRow.created_at),
    startedAt: roundRow.started_at ? asIso(roundRow.started_at) : null,
    finishedAt: roundRow.finished_at ? asIso(roundRow.finished_at) : null,
    assignments: assignmentRows.map((row) => ({
      assignmentId: String(row.id),
      rosterId: String(row.roster_id),
      displayName: String(row.display_name || ''),
      seed: row.seed == null ? null : asNum(row.seed),
      courtIdx: asNum(row.court_idx),
      slotIdx: asNum(row.slot_idx),
      levelIdx: asNum(row.level_idx, 1),
    })),
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

async function ensureTournamentExistsTx(client: PoolClient, tournamentId: string): Promise<void> {
  const res = await client.query(`SELECT id FROM tournaments WHERE id = $1 LIMIT 1`, [tournamentId]);
  if (!res.rows[0]) throw new KotcTournamentError(404, 'Tournament not found');
}

async function syncRosterFromTournamentParticipantsTx(client: PoolClient, tournamentId: string): Promise<void> {
  const existingRes = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM kotc_tournament_roster WHERE tournament_id = $1`,
    [tournamentId]
  );
  if (asNum(existingRes.rows[0]?.cnt, 0) > 0) return;

  const participantsRes = await client.query(
    `
    SELECT tp.id AS tournament_participant_id,
           tp.player_id,
           p.name AS display_name,
           ROW_NUMBER() OVER (ORDER BY tp.position ASC, p.name ASC, tp.registered_at ASC) AS seed
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = $1
      AND COALESCE(tp.is_waitlist, false) = false
    ORDER BY tp.position ASC, p.name ASC, tp.registered_at ASC
    `,
    [tournamentId]
  );

  for (const row of participantsRes.rows) {
    await client.query(
      `
      INSERT INTO kotc_tournament_roster (
        tournament_id, tournament_participant_id, player_id, display_name, seed, confirmed, active, dropped
      ) VALUES ($1, $2, $3, $4, $5, true, true, false)
      ON CONFLICT DO NOTHING
      `,
      [tournamentId, row.tournament_participant_id, row.player_id, row.display_name, asNum(row.seed)]
    );
  }
}

async function listRosterTx(client: PoolClient, tournamentId: string): Promise<KotcRosterEntry[]> {
  await ensureTournamentExistsTx(client, tournamentId);
  await syncRosterFromTournamentParticipantsTx(client, tournamentId);
  const { rows } = await client.query(
    `
    SELECT id, tournament_id, tournament_participant_id, player_id, display_name, seed,
           confirmed, active, dropped, created_at, updated_at
    FROM kotc_tournament_roster
    WHERE tournament_id = $1
    ORDER BY seed ASC NULLS LAST, display_name ASC, created_at ASC
    `,
    [tournamentId]
  );
  return rows.map(mapRosterRow);
}

async function ensureRoundsEditableTx(client: PoolClient, tournamentId: string): Promise<void> {
  const res = await client.query(
    `
    SELECT COUNT(*)::int AS cnt
    FROM kotc_tournament_round
    WHERE tournament_id = $1
      AND status IN ('live', 'finished')
    `,
    [tournamentId]
  );
  if (asNum(res.rows[0]?.cnt, 0) > 0) {
    throw new KotcTournamentError(409, 'Roster is locked after live/finished rounds are created');
  }
}

export async function listKotcRoster(tournamentId: string): Promise<KotcRosterEntry[]> {
  return withTransaction((client) => listRosterTx(client, tournamentId));
}

export async function replaceKotcRoster(
  tournamentId: string,
  entries: unknown
): Promise<KotcRosterEntry[]> {
  const normalized = normalizeRosterInput(entries);
  return withTransaction(async (client) => {
    await ensureTournamentExistsTx(client, tournamentId);
    await ensureRoundsEditableTx(client, tournamentId);
    await client.query(`DELETE FROM kotc_tournament_roster WHERE tournament_id = $1`, [tournamentId]);

    const usedPlayerIds = new Set<string>();
    let fallbackSeed = 1;
    for (const row of normalized) {
      if (row.playerId && usedPlayerIds.has(row.playerId)) {
        throw new KotcTournamentError(409, `Duplicate player in roster: ${row.playerId}`);
      }
      if (row.playerId) usedPlayerIds.add(row.playerId);
      const playerRes =
        row.playerId != null
          ? await client.query(`SELECT id, name FROM players WHERE id = $1 LIMIT 1`, [row.playerId])
          : { rows: [] as QueryResultRow[] };
      if (row.playerId && !playerRes.rows[0]) {
        throw new KotcTournamentError(404, `Player not found: ${row.playerId}`);
      }
      const tournamentParticipantId =
        row.playerId != null
          ? (
              await client.query(
                `SELECT id FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2 LIMIT 1`,
                [tournamentId, row.playerId]
              )
            ).rows[0]?.id ?? null
          : null;
      await client.query(
        `
        INSERT INTO kotc_tournament_roster (
          tournament_id, tournament_participant_id, player_id, display_name, seed,
          confirmed, active, dropped
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          tournamentId,
          tournamentParticipantId,
          row.playerId,
          row.displayName || String(playerRes.rows[0]?.name || ''),
          row.seed ?? fallbackSeed,
          row.confirmed,
          row.active,
          row.dropped,
        ]
      );
      fallbackSeed += 1;
    }

    return listRosterTx(client, tournamentId);
  });
}

function determineLevelCount(participantCount: number): number {
  if (participantCount < 1) return 1;
  return Math.max(1, Math.min(4, Math.ceil(participantCount / 4)));
}

function snakeCourtOrder(index: number, activeCourts: number): number {
  if (activeCourts <= 1) return 1;
  const cycle = activeCourts * 2 - 2;
  const mod = index % cycle;
  return mod < activeCourts ? mod + 1 : activeCourts - (mod - activeCourts + 1);
}

async function loadRoundViewTx(client: PoolClient, roundId: string): Promise<KotcRoundView> {
  const roundRes = await client.query(
    `
    SELECT id, tournament_id, round_no, stage_type, status, level_count, source_round_id, created_at, started_at, finished_at
    FROM kotc_tournament_round
    WHERE id = $1
    LIMIT 1
    `,
    [roundId]
  );
  const roundRow = roundRes.rows[0];
  if (!roundRow) throw new KotcTournamentError(404, 'Round not found');

  const assignmentRes = await client.query(
    `
    SELECT a.id, a.roster_id, a.court_idx, a.slot_idx, a.level_idx, r.display_name, r.seed
    FROM kotc_tournament_round_assignment a
    JOIN kotc_tournament_roster r ON r.id = a.roster_id
    WHERE a.round_id = $1
    ORDER BY a.court_idx ASC, a.slot_idx ASC
    `,
    [roundId]
  );
  return mapRoundView(roundRow, assignmentRes.rows);
}

export async function listKotcRounds(tournamentId: string): Promise<KotcRoundView[]> {
  return withTransaction(async (client) => {
    await ensureTournamentExistsTx(client, tournamentId);
    const roundRes = await client.query(
      `
      SELECT id
      FROM kotc_tournament_round
      WHERE tournament_id = $1
      ORDER BY round_no ASC
      `,
      [tournamentId]
    );
    const rounds: KotcRoundView[] = [];
    for (const row of roundRes.rows) {
      rounds.push(await loadRoundViewTx(client, String(row.id)));
    }
    return rounds;
  });
}

export async function generateKotcRound1(tournamentId: string): Promise<KotcRoundGenerateResult> {
  return withTransaction(async (client) => {
    await ensureTournamentExistsTx(client, tournamentId);
    const roster = await listRosterTx(client, tournamentId);
    const participants = roster.filter((row) => row.confirmed && row.active && !row.dropped);
    if (participants.length < 4) {
      throw new KotcTournamentError(409, 'At least 4 active participants are required for Round 1');
    }
    if (participants.length > 16) {
      throw new KotcTournamentError(409, 'Round 1 currently supports up to 16 participants across 4 courts');
    }

    const levelCount = determineLevelCount(participants.length);
    const roundRes = await client.query(
      `
      INSERT INTO kotc_tournament_round (tournament_id, round_no, stage_type, status, level_count)
      VALUES ($1, 1, 'round1', 'ready', $2)
      ON CONFLICT (tournament_id, round_no) DO UPDATE
      SET stage_type = EXCLUDED.stage_type,
          status = 'ready',
          level_count = EXCLUDED.level_count,
          source_round_id = NULL
      RETURNING id
      `,
      [tournamentId, levelCount]
    );
    const roundId = String(roundRes.rows[0].id);
    await client.query(`DELETE FROM kotc_tournament_round_assignment WHERE round_id = $1`, [roundId]);
    await client.query(`DELETE FROM kotc_tournament_round_result WHERE round_id = $1`, [roundId]);

    participants.forEach(async () => undefined);
    for (let idx = 0; idx < participants.length; idx += 1) {
      const courtIdx = snakeCourtOrder(idx, levelCount);
      const slotIdx =
        (
          await client.query(
            `SELECT COUNT(*)::int AS cnt FROM kotc_tournament_round_assignment WHERE round_id = $1 AND court_idx = $2`,
            [roundId, courtIdx]
          )
        ).rows[0]?.cnt ?? 0;
      await client.query(
        `
        INSERT INTO kotc_tournament_round_assignment (
          round_id, roster_id, court_idx, slot_idx, level_idx, assignment_status
        ) VALUES ($1, $2, $3, $4, 1, 'assigned')
        `,
        [roundId, participants[idx].id, courtIdx, asNum(slotIdx, 0) + 1]
      );
    }

    return {
      round: await loadRoundViewTx(client, roundId),
      rosterCount: participants.length,
    };
  });
}

async function loadLevelRuleCountTx(client: PoolClient, participantCount: number): Promise<number> {
  const res = await client.query(
    `
    SELECT level_count
    FROM kotc_tournament_level_rule
    WHERE format_code = 'KOTC_STANDARD_IPT'
      AND $1 BETWEEN min_participants AND max_participants
    ORDER BY min_participants DESC
    LIMIT 1
    `,
    [participantCount]
  );
  return asNum(res.rows[0]?.level_count, determineLevelCount(participantCount));
}

export async function generateKotcRound2(tournamentId: string): Promise<KotcRoundGenerateResult> {
  return withTransaction(async (client) => {
    await ensureTournamentExistsTx(client, tournamentId);
    const round1Res = await client.query(
      `
      SELECT id
      FROM kotc_tournament_round
      WHERE tournament_id = $1 AND stage_type = 'round1'
      LIMIT 1
      `,
      [tournamentId]
    );
    const round1Id = round1Res.rows[0]?.id ? String(round1Res.rows[0].id) : null;
    if (!round1Id) throw new KotcTournamentError(404, 'Round 1 is not created yet');

    const resultsRes = await client.query(
      `
      SELECT rr.roster_id, rr.points, rr.place_on_court, r.display_name, r.seed
      FROM kotc_tournament_round_result rr
      JOIN kotc_tournament_roster r ON r.id = rr.roster_id
      WHERE rr.round_id = $1
      ORDER BY rr.points DESC, rr.place_on_court ASC NULLS LAST, r.seed ASC NULLS LAST, r.display_name ASC
      `,
      [round1Id]
    );
    if (resultsRes.rows.length < 4) {
      throw new KotcTournamentError(409, 'Round 2 requires finished Round 1 results');
    }
    if (resultsRes.rows.length > 16) {
      throw new KotcTournamentError(409, 'Round 2 currently supports up to 16 participants');
    }

    const levelCount = await loadLevelRuleCountTx(client, resultsRes.rows.length);
    const round2Res = await client.query(
      `
      INSERT INTO kotc_tournament_round (tournament_id, round_no, stage_type, status, level_count, source_round_id)
      VALUES ($1, 2, 'round2', 'ready', $2, $3)
      ON CONFLICT (tournament_id, round_no) DO UPDATE
      SET stage_type = EXCLUDED.stage_type,
          status = 'ready',
          level_count = EXCLUDED.level_count,
          source_round_id = EXCLUDED.source_round_id
      RETURNING id
      `,
      [tournamentId, levelCount, round1Id]
    );
    const round2Id = String(round2Res.rows[0].id);
    await client.query(`DELETE FROM kotc_tournament_round_assignment WHERE round_id = $1`, [round2Id]);
    await client.query(`DELETE FROM kotc_tournament_round_result WHERE round_id = $1`, [round2Id]);

    const participantsPerLevel = Math.ceil(resultsRes.rows.length / levelCount);
    for (let idx = 0; idx < resultsRes.rows.length; idx += 1) {
      const levelIdx = Math.min(levelCount, Math.floor(idx / participantsPerLevel) + 1);
      const slotIdx = (idx % participantsPerLevel) + 1;
      if (slotIdx > 4) {
        throw new KotcTournamentError(409, 'Round 2 level would exceed 4 participants on a court');
      }
      await client.query(
        `
        INSERT INTO kotc_tournament_round_assignment (
          round_id, roster_id, court_idx, slot_idx, level_idx, assignment_status
        ) VALUES ($1, $2, $3, $4, $5, 'assigned')
        `,
        [round2Id, String(resultsRes.rows[idx].roster_id), levelIdx, slotIdx, levelIdx]
      );
    }

    return {
      round: await loadRoundViewTx(client, round2Id),
      rosterCount: resultsRes.rows.length,
    };
  });
}
