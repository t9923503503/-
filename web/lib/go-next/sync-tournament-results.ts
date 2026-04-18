import { isGoAdminFormat, normalizeGoAdminSettings } from '@/lib/admin-legacy-sync';
import { getTournamentById, upsertTournamentResults } from '@/lib/admin-queries';
import { getPool } from '@/lib/db';
import type { GoPlayoffLeague } from './types';

interface TeamPlayerRow {
  team_id: string;
  player1_name: string | null;
  player1_gender: string | null;
  player2_name: string | null;
  player2_gender: string | null;
}

interface BracketFinalRow {
  bracket_level: string | null;
  bracket_round: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_id: string | null;
  status: string;
}

interface StandingFallbackRow {
  position: number | null;
  group_no: number | null;
  team_id: string;
}

export function isGoNextTournamentForRatingSync(input: {
  format?: unknown;
  settings?: Record<string, unknown> | null;
} | null | undefined): boolean {
  return isGoAdminFormat(input?.format);
}

export async function syncGoResultsToTournamentResultsOrThrowBadRequest(
  tournamentId: string,
): Promise<{ inserted: number; source: string }> {
  try {
    return await syncGoResultsToTournamentResults(tournamentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`BadRequest: ${message}`);
  }
}

function normalizeGender(value: unknown): 'M' | 'W' {
  return String(value ?? '').trim().toUpperCase() === 'W' ? 'W' : 'M';
}

function expandTeamPlacement(
  teamPlayers: Map<string, TeamPlayerRow>,
  teamId: string,
  placement: number,
  ratingPts: number,
): Array<{
  playerName: string;
  gender: 'M' | 'W';
  placement: number;
  points: number;
  ratingPts: number;
  ratingPool: 'pro';
}> {
  const row = teamPlayers.get(teamId);
  if (!row) return [];

  const players = [
    { name: String(row.player1_name ?? '').trim(), gender: normalizeGender(row.player1_gender) },
    { name: String(row.player2_name ?? '').trim(), gender: normalizeGender(row.player2_gender) },
  ].filter((player) => player.name);

  return players.map((player) => ({
    playerName: player.name,
    gender: player.gender,
    placement,
    points: ratingPts,
    ratingPts,
    ratingPool: 'pro' as const,
  }));
}

const GO_RATING_POINTS_TABLE: Record<GoPlayoffLeague, number[]> = {
  lyutye: [100, 92, 84, 76, 68, 60, 52, 44, 36, 28, 20, 16, 12, 8, 4, 2],
  hard: [100, 92, 84, 76, 68, 60, 52, 44, 36, 28, 20, 16, 12, 8, 4, 2],
  medium: [72, 66, 60, 54, 48, 42, 36, 30, 24, 18, 14, 10, 8, 6, 4, 2],
  lite: [48, 44, 40, 36, 32, 28, 24, 20, 16, 12, 10, 8, 6, 4, 2, 1],
};

function goRatingPointsForLeaguePlace(league: GoPlayoffLeague, placeInLeague: number): number {
  const table = GO_RATING_POINTS_TABLE[league] ?? GO_RATING_POINTS_TABLE.hard;
  const idx = Math.max(0, Math.min(table.length - 1, Math.floor(placeInLeague) - 1));
  return table[idx];
}

export async function syncGoResultsToTournamentResults(tournamentId: string): Promise<{
  inserted: number;
  source: string;
}> {
  const id = String(tournamentId || '').trim();
  if (!id) throw new Error('tournamentId is required');

  const tournament = await getTournamentById(id);
  if (!tournament) throw new Error('Tournament not found');
  if (!isGoAdminFormat(tournament.format)) {
    throw new Error('GO rating sync requires Groups + Olympic format');
  }

  const settings = normalizeGoAdminSettings(tournament.settings);
  const levelOrder = settings.enabledPlayoffLeagues.map((value) => String(value));
  const pool = getPool();

  const teamPlayersRes = await pool.query<TeamPlayerRow>(
    `SELECT
       t.id::text AS team_id,
       p1.name AS player1_name,
       p1.gender AS player1_gender,
       p2.name AS player2_name,
       p2.gender AS player2_gender
     FROM go_team t
     JOIN go_group g ON g.id = t.group_id
     JOIN go_round r ON r.id = g.round_id
     LEFT JOIN players p1 ON p1.id = t.player1_id
     LEFT JOIN players p2 ON p2.id = t.player2_id
     WHERE r.tournament_id = $1`,
    [id],
  );
  const teamPlayers = new Map(teamPlayersRes.rows.map((row) => [String(row.team_id), row]));

  const bracketRes = await pool.query<BracketFinalRow>(
    `SELECT
       m.bracket_level,
       bs.bracket_round,
       m.team_a_id::text,
       m.team_b_id::text,
       m.winner_id::text,
       m.status
     FROM go_match m
     JOIN go_round r ON r.id = m.round_id
     LEFT JOIN go_bracket_slot bs ON bs.id = m.bracket_slot_id
     WHERE r.tournament_id = $1
       AND r.round_no = 2
     ORDER BY m.bracket_level ASC, bs.bracket_round DESC, m.match_no ASC`,
    [id],
  );

  const placements: Array<{ teamId: string; placement: number; league: GoPlayoffLeague; leaguePlace: number }> = [];
  let placementCursor = 1;

  for (const level of levelOrder) {
    const levelMatches = bracketRes.rows.filter((row) => String(row.bracket_level || '') === level);
    if (!levelMatches.length) continue;
    const maxRound = Math.max(...levelMatches.map((row) => Number(row.bracket_round || 0)));
    const finalMatch = levelMatches.find(
      (row) => Number(row.bracket_round || 0) === maxRound && String(row.status || '') === 'finished' && row.winner_id,
    );
    if (!finalMatch?.winner_id) continue;

    const winnerId = String(finalMatch.winner_id);
    const runnerUpId =
      winnerId === String(finalMatch.team_a_id || '')
        ? String(finalMatch.team_b_id || '')
        : String(finalMatch.team_a_id || '');

    placements.push({
      teamId: winnerId,
      placement: placementCursor,
      league: level as GoPlayoffLeague,
      leaguePlace: 1,
    });
    placementCursor += 1;
    if (runnerUpId) {
      placements.push({
        teamId: runnerUpId,
        placement: placementCursor,
        league: level as GoPlayoffLeague,
        leaguePlace: 2,
      });
      placementCursor += 1;
    }
  }

  let source = 'bracket';
  if (!placements.length) {
    source = 'groups';
    const standingsRes = await pool.query<StandingFallbackRow>(
      `SELECT
         gs.position,
         g.group_no,
         gs.team_id::text AS team_id
       FROM go_group_standing gs
       JOIN go_group g ON g.id = gs.group_id
       JOIN go_round r ON r.id = g.round_id
       WHERE r.tournament_id = $1
         AND r.round_no = 1
       ORDER BY gs.position ASC NULLS LAST, g.group_no ASC, gs.team_id ASC`,
      [id],
    );

    standingsRes.rows.forEach((row, index) => {
      placements.push({
        teamId: String(row.team_id),
        placement: index + 1,
        league: 'hard',
        leaguePlace: index + 1,
      });
    });
  }

  if (!placements.length) {
    throw new Error('No GO placements available for sync');
  }

  const results = placements.flatMap((row) =>
    expandTeamPlacement(teamPlayers, row.teamId, row.placement, goRatingPointsForLeaguePlace(row.league, row.leaguePlace)),
  );
  const inserted = await upsertTournamentResults(id, results);
  return { inserted, source };
}
