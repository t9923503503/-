import type { PoolClient } from 'pg';

/** Gender of a slot based on order and tournament gender format. */
export function slotGender(order: number, fmt: 'male' | 'female' | 'mixed'): 'M' | 'W' {
  if (fmt === 'male') return 'M';
  if (fmt === 'female') return 'W';
  // mixed: slots 1–4 = M, 5–8 = W
  return order <= 4 ? 'M' : 'W';
}

export interface CourtSlotRow {
  slotId: string;
  courtId: string;
  courtNo: number;
  courtLabel: string;
  slotOrder: number;
  gender: 'M' | 'W';
  playerId: string | null;
  playerName: string | null;
  assignedAt: string | null;
}

export interface CourtWithSlots {
  courtId: string;
  courtNo: number;
  label: string;
  pinCode: string;
  lastClearedAt: string | null;
  slots: CourtSlotRow[];
  nextMatch: {
    matchId: string;
    status: string;
    teamAPlayer1Id: string | null;
    teamAPlayer2Id: string | null;
    teamBPlayer1Id: string | null;
    teamBPlayer2Id: string | null;
  } | null;
}

export interface TournamentPlayer {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  courtId: string | null;   // null if free
  courtNo: number | null;
  isLive: boolean;          // currently in a live match
}

/**
 * Create 8 slots for each court of a tournament.
 * Called inside bootstrapGroupsTx after courts are inserted.
 */
export async function initGoCourtSlots(
  client: PoolClient,
  tournamentId: string,
  genderFormat: 'male' | 'female' | 'mixed',
): Promise<void> {
  // Get all courts for this tournament
  const { rows: courts } = await client.query<{ id: string }>(
    `SELECT id FROM go_court WHERE tournament_id = $1 ORDER BY court_no`,
    [tournamentId],
  );

  for (const court of courts) {
    for (let order = 1; order <= 8; order++) {
      const gender = slotGender(order, genderFormat);
      await client.query(
        `INSERT INTO go_court_slot (court_id, slot_order, gender)
         VALUES ($1, $2, $3)
         ON CONFLICT (court_id, slot_order) DO NOTHING`,
        [court.id, order, gender],
      );
    }
  }
}

/**
 * Load courts with slots and next match info for a tournament.
 */
export async function loadCourtsWithSlots(
  client: PoolClient,
  tournamentId: string,
): Promise<CourtWithSlots[]> {
  const { rows: courtRows } = await client.query<{
    courtId: string;
    courtNo: number;
    label: string;
    pinCode: string;
    lastClearedAt: string | null;
  }>(
    `SELECT id::text AS "courtId", court_no AS "courtNo", label, pin_code AS "pinCode",
            last_cleared_at::text AS "lastClearedAt"
     FROM go_court
     WHERE tournament_id = $1
     ORDER BY court_no`,
    [tournamentId],
  );

  const { rows: slotRows } = await client.query<{
    slotId: string;
    courtId: string;
    courtNo: number;
    courtLabel: string;
    slotOrder: number;
    gender: 'M' | 'W';
    playerId: string | null;
    playerName: string | null;
    assignedAt: string | null;
  }>(
    `SELECT
       s.id::text AS "slotId",
       s.court_id::text AS "courtId",
       c.court_no AS "courtNo",
       c.label AS "courtLabel",
       s.slot_order AS "slotOrder",
       s.gender,
       s.player_id::text AS "playerId",
       s.player_name AS "playerName",
       s.assigned_at::text AS "assignedAt"
     FROM go_court_slot s
     JOIN go_court c ON c.id = s.court_id
     WHERE c.tournament_id = $1
     ORDER BY c.court_no, s.slot_order`,
    [tournamentId],
  );

  // Next match per court
  const { rows: matchRows } = await client.query<{
    courtNo: number;
    matchId: string;
    status: string;
    p1aId: string | null;
    p2aId: string | null;
    p1bId: string | null;
    p2bId: string | null;
  }>(
    `SELECT DISTINCT ON (m.court_no)
       m.court_no AS "courtNo",
       m.id::text AS "matchId",
       m.status,
       ta1.player1_id::text AS "p1aId",
       ta1.player2_id::text AS "p2aId",
       tb1.player1_id::text AS "p1bId",
       tb1.player2_id::text AS "p2bId"
     FROM go_match m
     JOIN go_round r ON r.id = m.round_id
     LEFT JOIN go_team ta1 ON ta1.id = m.team_a_id
     LEFT JOIN go_team tb1 ON tb1.id = m.team_b_id
     WHERE r.tournament_id = $1
       AND m.status IN ('pending', 'live')
       AND m.court_no IS NOT NULL
     ORDER BY m.court_no, m.match_no`,
    [tournamentId],
  );

  const matchByCourtNo = new Map(matchRows.map((row) => [row.courtNo, row]));
  const slotsByCourtId = new Map<string, CourtSlotRow[]>();
  for (const slot of slotRows) {
    const list = slotsByCourtId.get(slot.courtId) ?? [];
    list.push(slot);
    slotsByCourtId.set(slot.courtId, list);
  }

  return courtRows.map((court) => {
    const match = matchByCourtNo.get(court.courtNo) ?? null;
    return {
      courtId: court.courtId,
      courtNo: court.courtNo,
      label: court.label,
      pinCode: court.pinCode,
      lastClearedAt: court.lastClearedAt,
      slots: slotsByCourtId.get(court.courtId) ?? [],
      nextMatch: match
        ? {
            matchId: match.matchId,
            status: match.status,
            teamAPlayer1Id: match.p1aId,
            teamAPlayer2Id: match.p2aId,
            teamBPlayer1Id: match.p1bId,
            teamBPlayer2Id: match.p2bId,
          }
        : null,
    };
  });
}

/**
 * Load all tournament players with their current slot assignment status.
 */
export async function loadTournamentPlayers(
  client: PoolClient,
  tournamentId: string,
): Promise<TournamentPlayer[]> {
  const { rows } = await client.query<{
    playerId: string;
    playerName: string;
    gender: string;
    courtId: string | null;
    courtNo: number | null;
    isLive: boolean;
  }>(
    `SELECT
       p.id::text AS "playerId",
       p.name AS "playerName",
       COALESCE(p.gender, 'M') AS gender,
       s.court_id::text AS "courtId",
       c.court_no AS "courtNo",
       EXISTS(
         SELECT 1 FROM go_match m
         JOIN go_round r2 ON r2.id = m.round_id
         JOIN go_team ta ON ta.id = m.team_a_id
         JOIN go_team tb ON tb.id = m.team_b_id
         WHERE r2.tournament_id = $1
           AND m.status = 'live'
           AND (ta.player1_id = p.id OR ta.player2_id = p.id
                OR tb.player1_id = p.id OR tb.player2_id = p.id)
       ) AS "isLive"
     FROM players p
     JOIN go_team gt ON (gt.player1_id = p.id OR gt.player2_id = p.id)
     JOIN go_group gg ON gg.id = gt.group_id
     JOIN go_round gr ON gr.id = gg.round_id
     LEFT JOIN go_court_slot s ON s.player_id = p.id
       AND s.court_id IN (SELECT id FROM go_court WHERE tournament_id = $1)
     LEFT JOIN go_court c ON c.id = s.court_id
     WHERE gr.tournament_id = $1
       AND gt.is_bye = false
     GROUP BY p.id, p.name, p.gender, s.court_id, c.court_no`,
    [tournamentId],
  );

  return rows.map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    gender: (String(row.gender ?? '').toUpperCase() === 'W' ? 'W' : 'M') as 'M' | 'W',
    courtId: row.courtId ?? null,
    courtNo: row.courtNo ?? null,
    isLive: Boolean(row.isLive),
  }));
}
