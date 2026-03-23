import { randomUUID } from 'crypto';
import { getPool } from './db';

export interface AdminTournament {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  level: string;
  capacity: number;
  status: string;
  participantCount: number;
  photoUrl: string;
}

export interface ArchiveResult {
  playerName: string;
  gender: 'M' | 'W';
  placement: number;
  points: number;
}

export interface ArchiveTournament extends AdminTournament {
  results: ArchiveResult[];
}

export interface AdminPlayer {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status: 'active' | 'temporary';
  ratingM: number;
  ratingW: number;
  ratingMix: number;
  wins: number;
  totalPts: number;
}

function mapTournament(row: Record<string, unknown>): AdminTournament {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    date: String(row.date ?? ''),
    time: String(row.time ?? ''),
    location: String(row.location ?? ''),
    format: String(row.format ?? ''),
    division: String(row.division ?? ''),
    level: String(row.level ?? ''),
    capacity: Number(row.capacity ?? 0),
    status: String(row.status ?? 'open'),
    participantCount: Number(row.participant_count ?? 0),
    photoUrl: String(row.photo_url ?? ''),
  };
}

function mapPlayer(row: Record<string, unknown>): AdminPlayer {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    status: String(row.status ?? 'active') === 'temporary' ? 'temporary' : 'active',
    ratingM: Number(row.rating_m ?? 0),
    ratingW: Number(row.rating_w ?? 0),
    ratingMix: Number(row.rating_mix ?? 0),
    wins: Number(row.wins ?? 0),
    totalPts: Number(row.total_pts ?? 0),
  };
}

export async function listTournaments(query = ''): Promise<AdminTournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const term = String(query || '').trim();
  const hasFilter = term.length > 0;
  const { rows } = await pool.query(
    `
      SELECT t.*, COUNT(tp.id)::int AS participant_count
      FROM tournaments t
      LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
      ${hasFilter ? "WHERE t.name ILIKE $1 OR t.location ILIKE $1 OR t.status ILIKE $1" : ''}
      GROUP BY t.id
      ORDER BY t.date DESC, t.time DESC
      LIMIT 200
    `,
    hasFilter ? [`%${term}%`] : []
  );
  return rows.map((row) => mapTournament(row));
}

export async function createTournament(input: Partial<AdminTournament>): Promise<AdminTournament> {
  const pool = getPool();
  const id = String(input.id || randomUUID());
  const { rows } = await pool.query(
    `INSERT INTO tournaments
      (id, name, date, time, location, format, division, level, capacity, status, photo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url`,
    [
      id,
      String(input.name || '').trim(),
      String(input.date || '').trim(),
      String(input.time || ''),
      String(input.location || ''),
      String(input.format || ''),
      String(input.division || ''),
      String(input.level || ''),
      Number(input.capacity || 0),
      String(input.status || 'open'),
      String(input.photoUrl || '') || null,
    ]
  );
  const data = rows[0] ?? {};
  return { ...mapTournament(data), participantCount: 0 };
}

export async function updateTournament(
  id: string,
  input: Partial<AdminTournament>
): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments
     SET name=$2, date=$3, time=$4, location=$5, format=$6, division=$7, level=$8, capacity=$9, status=$10, photo_url=$11
     WHERE id=$1
     RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url`,
    [
      id,
      String(input.name || '').trim(),
      String(input.date || '').trim(),
      String(input.time || ''),
      String(input.location || ''),
      String(input.format || ''),
      String(input.division || ''),
      String(input.level || ''),
      Number(input.capacity || 0),
      String(input.status || 'open'),
      String(input.photoUrl || '') || null,
    ]
  );
  const data = rows[0];
  if (!data) return null;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count FROM tournament_participants WHERE tournament_id = $1`,
    [id]
  );
  const participantCount = Number(countRes.rows[0]?.participant_count ?? 0);
  return { ...mapTournament(data), participantCount };
}

export async function deleteTournament(id: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getTournamentById(id: string): Promise<AdminTournament | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT t.*, COUNT(tp.id)::int AS participant_count
      FROM tournaments t
      LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
      WHERE t.id = $1
      GROUP BY t.id
      LIMIT 1
    `,
    [id]
  );
  const data = rows[0];
  return data ? mapTournament(data) : null;
}

export async function listPlayers(query = ''): Promise<AdminPlayer[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const term = String(query || '').trim();
  const hasFilter = term.length > 0;
  const { rows } = await pool.query(
    `
      SELECT id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts
      FROM players
      ${hasFilter ? 'WHERE name ILIKE $1 OR id ILIKE $1' : ''}
      ORDER BY name ASC
      LIMIT 500
    `,
    hasFilter ? [`%${term}%`] : []
  );
  return rows.map((row) => mapPlayer(row));
}

export async function getPlayerById(id: string): Promise<AdminPlayer | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts FROM players WHERE id = $1 LIMIT 1`,
    [id]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function createPlayer(input: Partial<AdminPlayer>): Promise<AdminPlayer> {
  const pool = getPool();
  const id = String(input.id || randomUUID());
  const gender = String(input.gender || 'M') === 'W' ? 'W' : 'M';
  const status = String(input.status || 'active') === 'temporary' ? 'temporary' : 'active';
  const { rows } = await pool.query(
    `INSERT INTO players
      (id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [
      id,
      String(input.name || '').trim(),
      gender,
      status,
      Number(input.ratingM || 0),
      Number(input.ratingW || 0),
      Number(input.ratingMix || 0),
      Number(input.wins || 0),
      Number(input.totalPts || 0),
    ]
  );
  return mapPlayer(rows[0] ?? {});
}

export async function updatePlayer(id: string, input: Partial<AdminPlayer>): Promise<AdminPlayer | null> {
  const pool = getPool();
  const gender = String(input.gender || 'M') === 'W' ? 'W' : 'M';
  const status = String(input.status || 'active') === 'temporary' ? 'temporary' : 'active';
  const { rows } = await pool.query(
    `UPDATE players
     SET name=$2, gender=$3, status=$4, rating_m=$5, rating_w=$6, rating_mix=$7, wins=$8, total_pts=$9
     WHERE id=$1
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [
      id,
      String(input.name || '').trim(),
      gender,
      status,
      Number(input.ratingM || 0),
      Number(input.ratingW || 0),
      Number(input.ratingMix || 0),
      Number(input.wins || 0),
      Number(input.totalPts || 0),
    ]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function deletePlayer(id: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query('DELETE FROM players WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function applyTournamentStatusOverride(input: {
  tournamentId: string;
  status: string;
}): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments SET status = $2 WHERE id = $1
     RETURNING id, name, date, time, location, format, division, level, capacity, status`,
    [input.tournamentId, input.status]
  );
  const data = rows[0];
  if (!data) return null;
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count FROM tournament_participants WHERE tournament_id = $1`,
    [input.tournamentId]
  );
  return {
    ...mapTournament(data),
    participantCount: Number(countRes.rows[0]?.participant_count ?? 0),
  };
}

export async function applyPlayerRecalcOverride(input: { playerId: string }): Promise<AdminPlayer | null> {
  const pool = getPool();
  const totalsRes = await pool.query(
    `SELECT
       COALESCE(SUM(wins), 0)::int AS wins,
       COALESCE(SUM(game_pts), 0)::int AS total_pts
     FROM tournament_results
     WHERE player_id = $1`,
    [input.playerId]
  );
  const wins = Number(totalsRes.rows[0]?.wins ?? 0);
  const totalPts = Number(totalsRes.rows[0]?.total_pts ?? 0);
  const { rows } = await pool.query(
    `UPDATE players
     SET wins = $2, total_pts = $3
     WHERE id = $1
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [input.playerId, wins, totalPts]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

export async function applyPlayerRatingOverride(input: {
  playerId: string;
  ratingM?: number;
  ratingW?: number;
  ratingMix?: number;
}): Promise<AdminPlayer | null> {
  const pool = getPool();
  const current = await getPlayerById(input.playerId);
  if (!current) return null;
  const nextRatingM = input.ratingM != null ? Number(input.ratingM) : current.ratingM;
  const nextRatingW = input.ratingW != null ? Number(input.ratingW) : current.ratingW;
  const nextRatingMix = input.ratingMix != null ? Number(input.ratingMix) : current.ratingMix;

  const { rows } = await pool.query(
    `UPDATE players
     SET rating_m = $2, rating_w = $3, rating_mix = $4
     WHERE id = $1
     RETURNING id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts`,
    [input.playerId, nextRatingM, nextRatingW, nextRatingMix]
  );
  const data = rows[0];
  return data ? mapPlayer(data) : null;
}

// ═══════════════════════════════════════════════════════════
// ROSTER: Участники турнира
// ═══════════════════════════════════════════════════════════

export interface RosterParticipant {
  id: string;
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  isWaitlist: boolean;
  position: number;
  registeredAt: string;
}

function mapParticipant(row: Record<string, unknown>): RosterParticipant {
  return {
    id: String(row.id ?? ''),
    playerId: String(row.player_id ?? ''),
    playerName: String(row.player_name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    isWaitlist: Boolean(row.is_waitlist),
    position: Number(row.position ?? 0),
    registeredAt: row.registered_at ? String(row.registered_at) : '',
  };
}

export async function listRosterParticipants(tournamentId: string): Promise<RosterParticipant[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT tp.id, tp.player_id, p.name AS player_name, p.gender,
            tp.is_waitlist, tp.position, tp.registered_at
     FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = $1
     ORDER BY tp.is_waitlist ASC, tp.position ASC`,
    [tournamentId]
  );
  return rows.map((r) => mapParticipant(r));
}

export async function addParticipant(
  tournamentId: string,
  playerId: string
): Promise<{ ok: boolean; waitlist: boolean; message: string }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query(
      `SELECT capacity, status FROM tournaments WHERE id = $1 FOR UPDATE`,
      [tournamentId]
    );
    const t = tRes.rows[0];
    if (!t) { await client.query('ROLLBACK'); return { ok: false, waitlist: false, message: 'Tournament not found' }; }
    if (t.status === 'finished' || t.status === 'cancelled') {
      await client.query('ROLLBACK');
      return { ok: false, waitlist: false, message: 'Tournament is ' + t.status };
    }
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM tournament_participants WHERE tournament_id = $1 AND is_waitlist = false`,
      [tournamentId]
    );
    const cnt = Number(countRes.rows[0]?.cnt ?? 0);
    const capacity = Number(t.capacity ?? 9999);
    const isWaitlist = cnt >= capacity;

    const posRes = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM tournament_participants WHERE tournament_id = $1 AND is_waitlist = $2`,
      [tournamentId, isWaitlist]
    );
    const nextPos = Number(posRes.rows[0]?.next_pos ?? 1);

    const insRes = await client.query(
      `INSERT INTO tournament_participants (tournament_id, player_id, is_waitlist, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tournament_id, player_id) DO NOTHING
       RETURNING id`,
      [tournamentId, playerId, isWaitlist, nextPos]
    );
    await client.query('COMMIT');
    if (!insRes.rows[0]) return { ok: false, waitlist: false, message: 'Player already registered' };
    return { ok: true, waitlist: isWaitlist, message: isWaitlist ? 'Added to waitlist' : 'Registered' };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function removeParticipant(
  tournamentId: string,
  playerId: string
): Promise<{ removed: boolean; promotedPlayerId: string | null }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);

    const delRes = await client.query(
      `DELETE FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2 RETURNING is_waitlist`,
      [tournamentId, playerId]
    );
    if (!delRes.rows[0]) { await client.query('COMMIT'); return { removed: false, promotedPlayerId: null }; }

    let promotedPlayerId: string | null = null;
    const wasMain = !delRes.rows[0].is_waitlist;
    if (wasMain) {
      const promRes = await client.query(
        `UPDATE tournament_participants
         SET is_waitlist = false
         WHERE id = (
           SELECT id FROM tournament_participants
           WHERE tournament_id = $1 AND is_waitlist = true
           ORDER BY position ASC LIMIT 1
         )
         RETURNING player_id`,
        [tournamentId]
      );
      promotedPlayerId = promRes.rows[0]?.player_id ?? null;
    }
    await client.query('COMMIT');
    return { removed: true, promotedPlayerId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function promoteFromWaitlist(
  tournamentId: string,
  playerId: string
): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE tournament_participants
     SET is_waitlist = false, position = (
       SELECT COALESCE(MAX(position), 0) + 1
       FROM tournament_participants
       WHERE tournament_id = $1 AND is_waitlist = false
     )
     WHERE tournament_id = $1 AND player_id = $2 AND is_waitlist = true`,
    [tournamentId, playerId]
  );
  return (rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════
// REQUESTS: Заявки игроков
// ═══════════════════════════════════════════════════════════

export interface PlayerRequest {
  id: string;
  name: string;
  gender: string;
  phone: string;
  tournamentId: string;
  tournamentName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
}

function mapRequest(row: Record<string, unknown>): PlayerRequest {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? ''),
    phone: String(row.phone ?? ''),
    tournamentId: String(row.tournament_id ?? ''),
    tournamentName: String(row.tournament_name ?? ''),
    status: (['pending', 'approved', 'rejected'].includes(String(row.status)) ? String(row.status) : 'pending') as PlayerRequest['status'],
    createdAt: row.created_at ? String(row.created_at) : '',
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

export async function listPendingRequests(tournamentId?: string): Promise<PlayerRequest[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const hasFilter = Boolean(tournamentId);
  const { rows } = await pool.query(
    `SELECT pr.*, t.name AS tournament_name
     FROM player_requests pr
     LEFT JOIN tournaments t ON t.id = pr.tournament_id
     WHERE pr.status = 'pending'
     ${hasFilter ? 'AND pr.tournament_id = $1' : ''}
     ORDER BY pr.created_at DESC
     LIMIT 200`,
    hasFilter ? [tournamentId] : []
  );
  return rows.map((r) => mapRequest(r));
}

export async function approveRequest(
  requestId: string
): Promise<{ request: PlayerRequest | null; newPlayerId: string | null }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reqRes = await client.query(
      `SELECT * FROM player_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    const req = reqRes.rows[0];
    if (!req || req.status !== 'pending') {
      await client.query('ROLLBACK');
      return { request: null, newPlayerId: null };
    }

    const playerRes = await client.query(
      `INSERT INTO players (name, gender, status, phone)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (lower(name), gender) DO UPDATE SET phone = COALESCE(NULLIF($3, ''), players.phone)
       RETURNING id`,
      [req.name, req.gender, req.phone || '']
    );
    const newPlayerId = String(playerRes.rows[0]?.id ?? '');

    await client.query(
      `UPDATE player_requests
       SET status = 'approved', approved_player_id = $2, reviewed_at = now()
       WHERE id = $1`,
      [requestId, newPlayerId]
    );

    if (req.tournament_id) {
      await client.query(
        `INSERT INTO tournament_participants (tournament_id, player_id, is_waitlist, position)
         VALUES ($1, $2, false, (SELECT COALESCE(MAX(position),0)+1 FROM tournament_participants WHERE tournament_id=$1 AND is_waitlist=false))
         ON CONFLICT (tournament_id, player_id) DO NOTHING`,
        [req.tournament_id, newPlayerId]
      );
    }

    const updRes = await client.query(
      `SELECT pr.*, t.name AS tournament_name
       FROM player_requests pr LEFT JOIN tournaments t ON t.id = pr.tournament_id
       WHERE pr.id = $1`,
      [requestId]
    );
    await client.query('COMMIT');
    return { request: updRes.rows[0] ? mapRequest(updRes.rows[0]) : null, newPlayerId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectRequest(requestId: string): Promise<PlayerRequest | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE player_requests
     SET status = 'rejected', reviewed_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [requestId]
  );
  if (!rows[0]) return null;
  const full = await pool.query(
    `SELECT pr.*, t.name AS tournament_name
     FROM player_requests pr LEFT JOIN tournaments t ON t.id = pr.tournament_id
     WHERE pr.id = $1`,
    [requestId]
  );
  return full.rows[0] ? mapRequest(full.rows[0]) : null;
}

// ═══════════════════════════════════════════════════════════
// MERGE: Склейка временных профилей
// ═══════════════════════════════════════════════════════════

export interface TempPlayer {
  id: string;
  name: string;
  gender: 'M' | 'W';
  tournamentsPlayed: number;
}

export async function listTempPlayers(): Promise<TempPlayer[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, gender, tournaments_played
     FROM players WHERE status = 'temporary'
     ORDER BY name ASC LIMIT 200`
  );
  return rows.map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    gender: String(r.gender ?? 'M') === 'W' ? 'W' as const : 'M' as const,
    tournamentsPlayed: Number(r.tournaments_played ?? 0),
  }));
}

export async function mergeTempPlayer(
  tempId: string,
  realId: string
): Promise<{ ok: boolean; moved: number; message: string }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bothRes = await client.query(
      `SELECT id, name, gender, status, tournaments_played, total_pts FROM players WHERE id IN ($1, $2) FOR UPDATE`,
      [tempId, realId]
    );
    const tempRow = bothRes.rows.find((r: Record<string, unknown>) => String(r.id) === tempId);
    const realRow = bothRes.rows.find((r: Record<string, unknown>) => String(r.id) === realId);

    if (!tempRow) { await client.query('ROLLBACK'); return { ok: false, moved: 0, message: 'Temp player not found' }; }
    if (!realRow) { await client.query('ROLLBACK'); return { ok: false, moved: 0, message: 'Target player not found' }; }
    if (tempRow.status !== 'temporary') { await client.query('ROLLBACK'); return { ok: false, moved: 0, message: 'Source is not temporary' }; }

    const tpRes = await client.query(
      `SELECT tournament_id FROM tournament_participants WHERE player_id = $1`,
      [tempId]
    );
    let moved = 0;
    for (const tp of tpRes.rows) {
      const upd = await client.query(
        `UPDATE tournament_participants SET player_id = $2
         WHERE tournament_id = $1 AND player_id = $3
         AND NOT EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2)`,
        [tp.tournament_id, realId, tempId]
      );
      if ((upd.rowCount ?? 0) > 0) moved++;
    }
    await client.query(`DELETE FROM tournament_participants WHERE player_id = $1`, [tempId]);

    await client.query(
      `UPDATE player_requests SET approved_player_id = $2 WHERE approved_player_id = $1`,
      [tempId, realId]
    );

    await client.query(
      `UPDATE players SET
         tournaments_played = tournaments_played + $2,
         total_pts = total_pts + $3
       WHERE id = $1`,
      [realId, Number(tempRow.tournaments_played ?? 0), Number(tempRow.total_pts ?? 0)]
    );

    await client.query(
      `INSERT INTO merge_audit (temp_player_id, real_player_id, temp_name, real_name, records_moved)
       VALUES ($1, $2, $3, $4, $5)`,
      [tempId, realId, tempRow.name, realRow.name, moved]
    );

    await client.query(`DELETE FROM players WHERE id = $1`, [tempId]);

    await client.query('COMMIT');
    return { ok: true, moved, message: `Merged: ${moved} tournaments moved` };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════
// ARCHIVE: Завершённые турниры с результатами
// ═══════════════════════════════════════════════════════════

export async function getArchiveTournaments(): Promise<ArchiveTournament[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.date, t.time, t.location, t.format, t.division,
           t.level, t.capacity, t.status, t.photo_url,
           0 AS participant_count,
           COALESCE(
             json_agg(
               json_build_object(
                 'playerName', p.name,
                 'gender', p.gender,
                 'placement', tr.placement,
                 'points', tr.points
               ) ORDER BY tr.placement ASC
             ) FILTER (WHERE tr.id IS NOT NULL),
             '[]'
           ) AS results
    FROM tournaments t
    LEFT JOIN tournament_results tr ON tr.tournament_id = t.id
    LEFT JOIN players p ON p.id = tr.player_id
    WHERE t.status = 'finished'
    GROUP BY t.id
    ORDER BY t.date DESC
  `);
  return rows.map((row) => ({
    ...mapTournament(row),
    results: (row.results as ArchiveResult[]) ?? [],
  }));
}

export async function setTournamentPhotoUrl(
  id: string,
  photoUrl: string
): Promise<AdminTournament | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE tournaments SET photo_url = $2 WHERE id = $1
     RETURNING id, name, date, time, location, format, division, level, capacity, status, photo_url`,
    [id, photoUrl || null]
  );
  const data = rows[0];
  if (!data) return null;
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS participant_count FROM tournament_participants WHERE tournament_id = $1`,
    [id]
  );
  return { ...mapTournament(data), participantCount: Number(countRes.rows[0]?.participant_count ?? 0) };
}

export async function upsertTournamentResults(
  tournamentId: string,
  results: Array<{ playerName: string; gender: 'M' | 'W'; placement: number; points: number }>
): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM tournament_results WHERE tournament_id = $1`, [tournamentId]);
    let inserted = 0;
    for (const r of results) {
      const gender = r.gender === 'W' ? 'W' : 'M';
      const playerRes = await client.query(
        `INSERT INTO players (name, gender, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (lower(name), gender) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [r.playerName.trim(), gender]
      );
      const playerId = String(playerRes.rows[0]?.id ?? '');
      if (!playerId) continue;
      await client.query(
        `INSERT INTO tournament_results (tournament_id, player_id, placement, points)
         VALUES ($1, $2, $3, $4)`,
        [tournamentId, playerId, Number(r.placement), Number(r.points)]
      );
      inserted++;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
