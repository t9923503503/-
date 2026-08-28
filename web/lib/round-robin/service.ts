import type { PoolClient } from 'pg';
import { upsertTournamentResults } from '@/lib/admin-queries';
import { getPool } from '@/lib/db';
import { parseQuickWinnerScore } from '@/lib/quick-winner-score';
import {
  buildRrCourtSchedule,
  buildRrPlayoffPreview,
  calculateRrStandings,
  isHardCapSetFinished,
  normalizeRrDivision,
  normalizeRrMatchFormat,
  seedRrGroups,
  validateFixedTeam,
} from './core';
import type {
  RrAvailablePlayer,
  RrConfig,
  RrGroup,
  RrInitializeInput,
  RrJudgeActionInput,
  RrJudgeActionName,
  RrJudgeSnapshot,
  RrMatch,
  RrMatchFormat,
  RrOperatorActionName,
  RrPlayoffLevelPreview,
  RrPlayoffPreview,
  RrStandingRow,
  RrTeam,
  RrTournamentStage,
} from './types';

type DbRow = Record<string, unknown>;
type RrActor = { kind: 'judge' | 'operator' | 'admin' | 'system'; id?: string | null };

export class RrError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'rr_error') {
    super(message);
    this.name = 'RrError';
    this.status = status;
    this.code = code;
  }
}

export function isRrError(error: unknown): error is RrError {
  return error instanceof RrError;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) && value.length ? value.map((item) => Math.max(0, Math.floor(Number(item) || 0))) : [0];
}

function dateOnly(value: unknown): string {
  const text = String(value ?? '');
  return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? text;
}

function ratingForDivision(row: DbRow, division: ReturnType<typeof normalizeRrDivision>): number {
  if (division === 'mixed') return Number(row.rating_mix ?? 0);
  if (division === 'female') return Number(row.rating_w ?? 0);
  return Number(row.rating_m ?? 0);
}

async function loadTournament(client: PoolClient, tournamentId: string): Promise<DbRow> {
  const result = await client.query(
    `SELECT id::text, name, date, time, location, division, level, status, settings
     FROM tournaments WHERE id = $1`,
    [tournamentId],
  );
  if (!result.rows[0]) throw new RrError(404, 'Турнир не найден.', 'not_found');
  return result.rows[0] as DbRow;
}

async function loadAvailablePlayers(client: PoolClient, tournamentId: string, division: ReturnType<typeof normalizeRrDivision>): Promise<RrAvailablePlayer[]> {
  const result = await client.query(
    `SELECT p.id::text, p.name, p.gender, p.rating_m, p.rating_w, p.rating_mix, tp.position
     FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = $1 AND COALESCE(tp.is_waitlist, false) = false
     ORDER BY tp.position ASC, p.name ASC`,
    [tournamentId],
  );
  return result.rows.map((raw) => {
    const row = raw as DbRow;
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      gender: String(row.gender ?? 'M') === 'W' ? 'W' as const : 'M' as const,
      rating: ratingForDivision(row, division),
      position: Number(row.position ?? 0),
    };
  });
}

function mapMatch(row: DbRow): RrMatch {
  return {
    id: String(row.id ?? ''),
    stageType: String(row.stage_type) === 'playoff' ? 'playoff' : 'group',
    groupId: row.group_id ? String(row.group_id) : null,
    bracketLevel: row.bracket_level ? String(row.bracket_level) : null,
    bracketRound: row.bracket_round ? String(row.bracket_round) : null,
    roundNo: Number(row.round_no ?? 1),
    matchNo: Number(row.match_no ?? 0),
    scheduleSlot: Number(row.schedule_slot ?? 1),
    courtNo: row.court_no == null ? null : Number(row.court_no),
    teamAId: row.team_a_id ? String(row.team_a_id) : null,
    teamBId: row.team_b_id ? String(row.team_b_id) : null,
    format: normalizeRrMatchFormat(row.match_format),
    scoreA: asNumberArray(row.score_a),
    scoreB: asNumberArray(row.score_b),
    setsA: Number(row.sets_a ?? 0),
    setsB: Number(row.sets_b ?? 0),
    serving: row.serving === 'a' || row.serving === 'b' ? row.serving : null,
    timerRemainingSec: row.timer_remaining_sec == null ? null : Number(row.timer_remaining_sec),
    timerRunning: Boolean(row.timer_running),
    winnerId: row.winner_id ? String(row.winner_id) : null,
    forfeitSide: row.forfeit_side === 'a' || row.forfeit_side === 'b' ? row.forfeit_side : null,
    status: String(row.status ?? 'scheduled') as RrMatch['status'],
    version: Number(row.judge_version ?? 0),
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

async function loadTeams(client: PoolClient, tournamentId: string): Promise<RrTeam[]> {
  const result = await client.query(
    `SELECT t.id::text, t.group_id::text, t.team_no, t.seed, t.rating_snapshot, t.confirmed,
            t.final_placement, t.manual_rank,
            p1.id::text AS player1_id, p1.name AS player1_name, p1.gender AS player1_gender,
            p2.id::text AS player2_id, p2.name AS player2_name, p2.gender AS player2_gender
     FROM rr_team t
     JOIN players p1 ON p1.id = t.player1_id
     JOIN players p2 ON p2.id = t.player2_id
     WHERE t.tournament_id = $1
     ORDER BY t.seed ASC`,
    [tournamentId],
  );
  return result.rows.map((raw) => {
    const row = raw as DbRow;
    const player = (position: 1 | 2): RrAvailablePlayer => ({
      id: String(row[`player${position}_id`] ?? ''),
      name: String(row[`player${position}_name`] ?? ''),
      gender: String(row[`player${position}_gender`] ?? 'M') === 'W' ? 'W' : 'M',
      rating: 0,
      position,
    });
    return {
      id: String(row.id ?? ''),
      teamNo: Number(row.team_no ?? 0),
      seed: Number(row.seed ?? 0),
      groupId: row.group_id ? String(row.group_id) : null,
      player1: player(1),
      player2: player(2),
      rating: Number(row.rating_snapshot ?? 0),
      confirmed: Boolean(row.confirmed),
      finalPlacement: row.final_placement == null ? null : Number(row.final_placement),
      manualRank: row.manual_rank == null ? null : Number(row.manual_rank),
    };
  });
}

async function loadGroups(client: PoolClient, tournamentId: string, teams: RrTeam[]): Promise<RrGroup[]> {
  const result = await client.query(
    `SELECT id::text, group_no, label, status FROM rr_group WHERE tournament_id = $1 ORDER BY group_no`,
    [tournamentId],
  );
  return result.rows.map((raw) => {
    const row = raw as DbRow;
    const id = String(row.id ?? '');
    return {
      id,
      groupNo: Number(row.group_no ?? 0),
      label: String(row.label ?? ''),
      status: String(row.status ?? 'ready') as RrGroup['status'],
      teamIds: teams.filter((team) => team.groupId === id).map((team) => team.id),
    };
  });
}

async function loadMatches(client: PoolClient, tournamentId: string): Promise<RrMatch[]> {
  const result = await client.query(
    `SELECT * FROM rr_match WHERE tournament_id = $1 ORDER BY schedule_slot, court_no NULLS LAST, match_no`,
    [tournamentId],
  );
  return result.rows.map((row) => mapMatch(row as DbRow));
}

async function loadStandings(client: PoolClient, tournamentId: string): Promise<RrStandingRow[]> {
  const result = await client.query(
    `SELECT s.*, t.seed, t.manual_rank
     FROM rr_standing s
     JOIN rr_group g ON g.id = s.group_id
     JOIN rr_team t ON t.id = s.team_id
     WHERE g.tournament_id = $1
     ORDER BY g.group_no, s.position NULLS LAST, t.seed`,
    [tournamentId],
  );
  return result.rows.map((raw) => {
    const row = raw as DbRow;
    return {
      groupId: String(row.group_id ?? ''),
      teamId: String(row.team_id ?? ''),
      position: Number(row.position ?? 0),
      played: Number(row.played ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      matchPoints: Number(row.match_points ?? 0),
      setsWon: Number(row.sets_won ?? 0),
      setsLost: Number(row.sets_lost ?? 0),
      pointsFor: Number(row.points_for ?? 0),
      pointsAgainst: Number(row.points_against ?? 0),
      pointDiff: Number(row.point_diff ?? 0),
      pointQuotient: Number(row.point_quotient ?? 0),
      tiebreakNote: row.tiebreak_note ? String(row.tiebreak_note) : null,
      seed: Number(row.seed ?? 0),
      manualRank: row.manual_rank == null ? null : Number(row.manual_rank),
    };
  });
}

function defaultConfig(settings: Record<string, unknown>): RrConfig {
  return {
    playoffMode: settings.rrPlayoffMode === 'all_levels' ? 'all_levels' : 'championship',
    seedingMode: settings.rrSeedingMode === 'random' || settings.rrSeedingMode === 'manual' ? settings.rrSeedingMode : 'serpentine',
    groupCount: Math.max(1, Math.min(4, Math.floor(Number(settings.rrGroupCount ?? 2)))),
    courtCount: Math.max(1, Math.min(16, Math.floor(Number(settings.rrCourts ?? settings.courts ?? 1)))),
    groupMatchFormat: normalizeRrMatchFormat(settings.rrGroupMatchFormat ?? 'single15'),
    playoffMatchFormat: normalizeRrMatchFormat(settings.rrPlayoffMatchFormat ?? 'single15'),
  };
}

export async function listRrFrequentPlayers(tournamentId: string, gender: 'M' | 'W'): Promise<Array<RrAvailablePlayer & { activityCount: number }>> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT p.id::text, p.name, p.gender, p.rating_m, p.rating_w, p.rating_mix,
            COUNT(DISTINCT history.tournament_id)::int AS activity_count,
            MAX(history_tournament.date) AS last_tournament_date
     FROM players p
     LEFT JOIN tournament_participants history
       ON history.player_id = p.id AND COALESCE(history.is_waitlist, false) = false
     LEFT JOIN tournaments history_tournament ON history_tournament.id = history.tournament_id
     WHERE p.gender = $2
       AND NOT EXISTS (
         SELECT 1 FROM tournament_participants current_roster
         WHERE current_roster.tournament_id = $1 AND current_roster.player_id = p.id
       )
     GROUP BY p.id, p.name, p.gender, p.rating_m, p.rating_w, p.rating_mix
     ORDER BY activity_count DESC, last_tournament_date DESC NULLS LAST, p.name ASC
     LIMIT 10`,
    [tournamentId, gender],
  );
  const division = gender === 'W' ? 'female' : 'male';
  return result.rows.map((raw) => {
    const row = raw as DbRow;
    return {
      id: String(row.id), name: String(row.name ?? ''), gender: String(row.gender) === 'W' ? 'W' : 'M',
      rating: ratingForDivision(row, division), position: 0, activityCount: Number(row.activity_count ?? 0),
    };
  });
}

export async function addRrSetupTeam(tournamentId: string, player1Id: string, player2Id: string): Promise<RrJudgeSnapshot> {
  const ids = [String(player1Id || '').trim(), String(player2Id || '').trim()];
  if (!String(tournamentId || '').trim() || ids.some((id) => !id) || ids[0] === ids[1]) {
    throw new RrError(400, 'Выберите двух разных игроков.', 'invalid_team');
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tournamentResult = await client.query(
      `SELECT id::text, division, status, capacity FROM tournaments WHERE id = $1 FOR UPDATE`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0] as DbRow | undefined;
    if (!tournament) throw new RrError(404, 'Турнир не найден.', 'not_found');
    if (tournament.status === 'finished' || tournament.status === 'cancelled') throw new RrError(409, 'Состав завершённого турнира менять нельзя.', 'stage_conflict');
    const initialized = await client.query(`SELECT stage FROM rr_tournament WHERE tournament_id = $1`, [tournamentId]);
    if (initialized.rows[0]) throw new RrError(409, 'Команды уже подтверждены. Сначала выполните откат к формированию.', 'stage_conflict');

    const division = normalizeRrDivision(tournament.division);
    const playersResult = await client.query(
      `SELECT id::text, name, gender, rating_m, rating_w, rating_mix FROM players WHERE id::text = ANY($1::text[])`,
      [ids],
    );
    const byId = new Map(playersResult.rows.map((raw) => {
      const row = raw as DbRow;
      const player: RrAvailablePlayer = {
        id: String(row.id), name: String(row.name ?? ''), gender: String(row.gender) === 'W' ? 'W' : 'M',
        rating: ratingForDivision(row, division), position: 0,
      };
      return [player.id, player] as const;
    }));
    const first = byId.get(ids[0]);
    const second = byId.get(ids[1]);
    if (!first || !second) throw new RrError(404, 'Один из игроков не найден.', 'invalid_player');
    const teamError = validateFixedTeam([first, second], division);
    if (teamError) throw new RrError(400, teamError, 'invalid_team');
    if (division === 'mixed' && (first.gender !== 'M' || second.gender !== 'W')) throw new RrError(400, 'Для микста сначала выберите мужчину, затем женщину.', 'invalid_team');

    const existing = await client.query(
      `SELECT player_id::text FROM tournament_participants WHERE tournament_id = $1 AND player_id::text = ANY($2::text[])`,
      [tournamentId, ids],
    );
    if (existing.rows.length) throw new RrError(409, 'Один из игроков уже добавлен в турнир.', 'duplicate_player');
    const roster = await client.query(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(is_waitlist, false) = false)::int AS count, COALESCE(MAX(position), 0)::int AS max_position FROM tournament_participants WHERE tournament_id = $1`,
      [tournamentId],
    );
    const currentCount = Number(roster.rows[0]?.count ?? 0);
    const firstPosition = Number(roster.rows[0]?.max_position ?? 0) + 1;
    await client.query(`UPDATE tournaments SET capacity = GREATEST(COALESCE(capacity, 0), $2) WHERE id = $1`, [tournamentId, currentCount + 2]);
    await client.query(
      `INSERT INTO tournament_participants (tournament_id, player_id, is_waitlist, position) VALUES ($1, $2, false, $4), ($1, $3, false, $5)`,
      [tournamentId, ids[0], ids[1], firstPosition, firstPosition + 1],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getRrJudgeSnapshot(tournamentId);
}

export async function getRrJudgeSnapshot(tournamentId: string): Promise<RrJudgeSnapshot> {
  const id = String(tournamentId || '').trim();
  if (!id) throw new RrError(400, 'tournamentId обязателен.', 'bad_request');
  const client = await getPool().connect();
  try {
    const tournament = await loadTournament(client, id);
    const division = normalizeRrDivision(tournament.division);
    const availablePlayers = await loadAvailablePlayers(client, id, division);
    const stateResult = await client.query(`SELECT * FROM rr_tournament WHERE tournament_id = $1`, [id]);
    const state = stateResult.rows[0] as DbRow | undefined;
    const fallbackConfig = defaultConfig(asRecord(tournament.settings));
    if (!state) {
      return {
        initialized: false,
        tournament: {
          id,
          name: String(tournament.name ?? ''),
          date: dateOnly(tournament.date),
          time: String(tournament.time ?? ''),
          location: String(tournament.location ?? ''),
          division,
          level: String(tournament.level ?? ''),
          status: String(tournament.status ?? ''),
        },
        stage: 'setup',
        version: 0,
        config: fallbackConfig,
        availablePlayers,
        teams: [],
        groups: [],
        courts: [],
        matches: [],
        standings: [],
        playoffPreview: null,
        generatedAt: new Date().toISOString(),
      };
    }
    const teams = await loadTeams(client, id);
    const groups = await loadGroups(client, id, teams);
    const courtsResult = await client.query(
      `SELECT id::text, court_no, label FROM rr_court WHERE tournament_id = $1 ORDER BY court_no`,
      [id],
    );
    const config: RrConfig = {
      playoffMode: state.playoff_mode === 'all_levels' ? 'all_levels' : 'championship',
      seedingMode: state.seeding_mode === 'random' || state.seeding_mode === 'manual' ? state.seeding_mode : 'serpentine',
      groupCount: Number(state.group_count ?? 2),
      courtCount: Number(state.court_count ?? 1),
      groupMatchFormat: normalizeRrMatchFormat(state.group_match_format),
      playoffMatchFormat: normalizeRrMatchFormat(state.playoff_match_format),
    };
    return {
      initialized: true,
      tournament: {
        id,
        name: String(tournament.name ?? ''),
        date: dateOnly(tournament.date),
        time: String(tournament.time ?? ''),
        location: String(tournament.location ?? ''),
        division,
        level: String(tournament.level ?? ''),
        status: String(tournament.status ?? ''),
      },
      stage: String(state.stage ?? 'setup') as RrTournamentStage,
      version: Number(state.version ?? 1),
      config,
      availablePlayers,
      teams,
      groups,
      courts: courtsResult.rows.map((raw) => {
        const row = raw as DbRow;
        return { id: String(row.id ?? ''), courtNo: Number(row.court_no ?? 0), label: String(row.label ?? '') };
      }),
      matches: await loadMatches(client, id),
      standings: await loadStandings(client, id),
      playoffPreview: state.playoff_preview ? state.playoff_preview as RrPlayoffPreview : null,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

function assertFormat(input: RrMatchFormat): RrMatchFormat {
  return normalizeRrMatchFormat(input);
}

export async function initializeRrTournament(tournamentId: string, input: RrInitializeInput): Promise<RrJudgeSnapshot> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tournament = await loadTournament(client, tournamentId);
    const division = normalizeRrDivision(tournament.division);
    const players = await loadAvailablePlayers(client, tournamentId, division);
    const playersById = new Map(players.map((player) => [player.id, player]));
    const groupCount = Math.max(1, Math.min(4, Math.floor(Number(input.groupCount))));
    const courtCount = Math.max(1, Math.min(16, Math.floor(Number(input.courtCount))));
    if (input.playoffMode === 'championship' && groupCount !== 2) {
      throw new RrError(400, 'Чемпионский режим требует ровно две группы.', 'invalid_groups');
    }
    if (input.teams.length < groupCount * 3 || input.teams.length > groupCount * 8) {
      throw new RrError(400, `В каждой группе должно быть от 3 до 8 команд. Для ${groupCount} групп требуется от ${groupCount * 3} до ${groupCount * 8} команд.`, 'invalid_team_count');
    }
    const used = new Set<string>();
    const teamDrafts = input.teams.map((pair, index) => {
      const player1 = playersById.get(String(pair.player1Id));
      const player2 = playersById.get(String(pair.player2Id));
      if (!player1 || !player2) throw new RrError(400, `Команда ${index + 1}: игрок не найден в основном составе.`, 'invalid_player');
      const teamError = validateFixedTeam([player1, player2], division);
      if (teamError) throw new RrError(400, `Команда ${index + 1}: ${teamError}`, 'invalid_team');
      if (used.has(player1.id) || used.has(player2.id)) throw new RrError(400, 'Один игрок назначен в несколько команд.', 'duplicate_player');
      used.add(player1.id);
      used.add(player2.id);
      return { player1, player2, rating: player1.rating + player2.rating, seed: index + 1 };
    });
    const old = await client.query(`SELECT stage FROM rr_tournament WHERE tournament_id = $1 FOR UPDATE`, [tournamentId]);
    if (old.rows[0] && String((old.rows[0] as DbRow).stage) !== 'setup') {
      throw new RrError(409, 'Турнир уже сформирован. Сначала выполните откат к настройке.', 'stage_conflict');
    }
    await client.query(`DELETE FROM rr_tournament WHERE tournament_id = $1`, [tournamentId]);
    const groupFormat = assertFormat(input.groupMatchFormat);
    const playoffFormat = assertFormat(input.playoffMatchFormat);
    await client.query(
      `INSERT INTO rr_tournament
       (tournament_id, stage, playoff_mode, seeding_mode, group_count, court_count, group_match_format, playoff_match_format)
       VALUES ($1, 'setup', $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [tournamentId, input.playoffMode, input.seedingMode, groupCount, courtCount, JSON.stringify(groupFormat), JSON.stringify(playoffFormat)],
    );
    const groups: Array<{ id: string; groupNo: number }> = [];
    for (let index = 0; index < groupCount; index += 1) {
      const inserted = await client.query(
        `INSERT INTO rr_group (tournament_id, group_no, label) VALUES ($1, $2, $3) RETURNING id::text`,
        [tournamentId, index + 1, `Группа ${String.fromCharCode(1040 + index)}`],
      );
      groups.push({ id: String((inserted.rows[0] as DbRow).id), groupNo: index + 1 });
    }
    for (let court = 1; court <= courtCount; court += 1) {
      await client.query(`INSERT INTO rr_court (tournament_id, court_no, label) VALUES ($1, $2, $3)`, [tournamentId, court, `Корт ${court}`]);
    }
    const insertedTeams: RrTeam[] = [];
    for (let index = 0; index < teamDrafts.length; index += 1) {
      const draft = teamDrafts[index];
      const inserted = await client.query(
        `INSERT INTO rr_team
         (tournament_id, team_no, seed, player1_id, player2_id, rating_snapshot, confirmed)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id::text`,
        [tournamentId, index + 1, index + 1, draft.player1.id, draft.player2.id, draft.rating],
      );
      insertedTeams.push({
        id: String((inserted.rows[0] as DbRow).id), teamNo: index + 1, seed: index + 1, groupId: null,
        player1: draft.player1, player2: draft.player2, rating: draft.rating, confirmed: true,
        finalPlacement: null, manualRank: null,
      });
    }
    let manual: RrTeam[][] | undefined;
    if (input.seedingMode === 'manual' && input.manualGroups?.length === groupCount) {
      const bySeed = new Map(insertedTeams.map((team) => [String(team.seed), team]));
      manual = input.manualGroups.map((seeds) => seeds.map((seed) => bySeed.get(String(seed))).filter((team): team is RrTeam => Boolean(team)));
      if (manual.flat().length !== insertedTeams.length) throw new RrError(400, 'Ручное распределение содержит не все команды.', 'invalid_manual_groups');
    }
    const seeded = seedRrGroups(insertedTeams, groupCount, input.seedingMode, input.randomSeed, manual);
    if (seeded.some((group) => group.length < 3 || group.length > 8)) throw new RrError(400, 'В каждой группе должно быть от 3 до 8 команд.', 'invalid_group_size');
    for (let groupIndex = 0; groupIndex < seeded.length; groupIndex += 1) {
      for (const team of seeded[groupIndex]) {
        team.groupId = groups[groupIndex].id;
        await client.query(`UPDATE rr_team SET group_id = $2 WHERE id = $1`, [team.id, groups[groupIndex].id]);
      }
    }
    const schedule = buildRrCourtSchedule(seeded.map((group) => group.map((team) => team.id)), courtCount);
    for (let index = 0; index < schedule.length; index += 1) {
      const match = schedule[index];
      await client.query(
        `INSERT INTO rr_match
         (tournament_id, group_id, stage_type, round_no, match_no, schedule_slot, court_no,
          team_a_id, team_b_id, match_format, timer_remaining_sec, status)
         VALUES ($1, $2, 'group', $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'scheduled')`,
        [tournamentId, groups[match.groupIndex].id, match.roundNo, index + 1, match.scheduleSlot, match.courtNo,
          match.teamAId, match.teamBId, JSON.stringify(groupFormat), groupFormat.code === 'timed' ? (groupFormat.durationMinutes ?? 15) * 60 : null],
      );
    }
    await client.query(`UPDATE rr_tournament SET stage = 'groups_ready', version = version + 1, updated_at = now() WHERE tournament_id = $1`, [tournamentId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getRrJudgeSnapshot(tournamentId);
}

interface MutableMatchState {
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  serving: 'a' | 'b' | null;
  timerRemainingSec: number | null;
  timerRunning: boolean;
  winnerId: string | null;
  forfeitSide: 'a' | 'b' | null;
  status: RrMatch['status'];
}

function mutableState(match: RrMatch): MutableMatchState {
  return {
    scoreA: [...match.scoreA], scoreB: [...match.scoreB], setsA: match.setsA, setsB: match.setsB,
    serving: match.serving, timerRemainingSec: match.timerRemainingSec, timerRunning: match.timerRunning,
    winnerId: match.winnerId, forfeitSide: match.forfeitSide, status: match.status,
  };
}

function parseMutableState(value: unknown): MutableMatchState {
  const row = asRecord(value);
  return {
    scoreA: asNumberArray(row.scoreA), scoreB: asNumberArray(row.scoreB), setsA: Number(row.setsA ?? 0), setsB: Number(row.setsB ?? 0),
    serving: row.serving === 'a' || row.serving === 'b' ? row.serving : null,
    timerRemainingSec: row.timerRemainingSec == null ? null : Number(row.timerRemainingSec), timerRunning: Boolean(row.timerRunning),
    winnerId: row.winnerId ? String(row.winnerId) : null,
    forfeitSide: row.forfeitSide === 'a' || row.forfeitSide === 'b' ? row.forfeitSide : null,
    status: String(row.status ?? 'live') as RrMatch['status'],
  };
}

function applyPoint(match: RrMatch, state: MutableMatchState, side: 'a' | 'b'): void {
  if (!match.teamAId || !match.teamBId) throw new RrError(409, 'Состав матча ещё не определён.', 'match_not_ready');
  if (state.status === 'finished' || state.status === 'forfeit' || state.status === 'cancelled') throw new RrError(409, 'Матч уже завершён.', 'match_finished');
  if (state.status === 'scheduled' || state.status === 'ready' || state.status === 'paused') state.status = 'live';
  const index = Math.max(state.scoreA.length, state.scoreB.length) - 1;
  while (state.scoreA.length <= index) state.scoreA.push(0);
  while (state.scoreB.length <= index) state.scoreB.push(0);
  if (side === 'a') state.scoreA[index] += 1; else state.scoreB[index] += 1;
  if (match.format.code === 'timed') return;
  if (!isHardCapSetFinished(match.format, index, state.scoreA[index], state.scoreB[index])) return;
  const aWon = state.scoreA[index] > state.scoreB[index];
  if (aWon) state.setsA += 1; else state.setsB += 1;
  const matchFinished = match.format.code === 'bo3_21_15' ? state.setsA >= 2 || state.setsB >= 2 : true;
  if (matchFinished) {
    state.status = 'finished';
    state.timerRunning = false;
    state.winnerId = aWon ? match.teamAId : match.teamBId;
  } else {
    state.scoreA.push(0);
    state.scoreB.push(0);
    state.serving = aWon ? 'b' : 'a';
  }
}

function applyJudgeAction(match: RrMatch, action: RrJudgeActionName, payload: Record<string, unknown>, restored?: MutableMatchState): MutableMatchState {
  if (restored) return restored;
  const state = mutableState(match);
  if (action === 'start' || action === 'resume') state.status = 'live';
  else if (action === 'pause') { state.status = 'paused'; state.timerRunning = false; }
  else if (action === 'point_a' || action === 'point_b') applyPoint(match, state, action === 'point_a' ? 'a' : 'b');
  else if (action === 'serve_a' || action === 'serve_b') {
    if (state.status === 'finished' || state.status === 'forfeit' || state.status === 'cancelled') throw new RrError(409, 'Матч уже завершён.', 'match_finished');
    state.serving = action === 'serve_a' ? 'a' : 'b';
    if (state.status === 'scheduled' || state.status === 'ready') state.status = 'live';
  }
  else if (action === 'timer_start') { state.status = 'live'; state.timerRunning = true; }
  else if (action === 'timer_pause') state.timerRunning = false;
  else if (action === 'quick_result') {
    if (!match.teamAId || !match.teamBId) throw new RrError(409, 'Состав матча ещё не определён.', 'match_not_ready');
    const target = match.format.code === 'single11' ? 11 : match.format.code === 'single15' ? 15 : match.format.code === 'single21' ? 21 : null;
    if (!target) throw new RrError(409, 'Быстрый результат доступен только для одного сета до 11, 15 или 21.', 'quick_result_unavailable');
    const scoreA = Math.floor(Number(payload.scoreA));
    const scoreB = Math.floor(Number(payload.scoreB));
    if (!parseQuickWinnerScore(target, scoreA, scoreB)) {
      throw new RrError(400, `Победитель должен набрать ${target}, проигравший — от 0 до ${target - 1}.`, 'invalid_quick_result');
    }
    state.scoreA = [scoreA]; state.scoreB = [scoreB];
    state.setsA = scoreA > scoreB ? 1 : 0; state.setsB = scoreB > scoreA ? 1 : 0;
    state.status = 'finished'; state.timerRunning = false; state.serving = null;
    state.winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
  }
  else if (action === 'finish_match') {
    if (!match.teamAId || !match.teamBId) throw new RrError(409, 'Состав матча ещё не определён.', 'match_not_ready');
    const scoreA = state.scoreA[state.scoreA.length - 1] ?? 0;
    const scoreB = state.scoreB[state.scoreB.length - 1] ?? 0;
    const target = match.format.code === 'single11' ? 11 : match.format.code === 'single15' ? 15 : match.format.code === 'single21' ? 21 : null;
    if (target && !((scoreA === target && scoreB < target) || (scoreB === target && scoreA < target))) {
      throw new RrError(409, `Матч играется до ${target}. Доведите счёт победителя до ${target}.`, 'target_score_required');
    }
    if (match.format.code === 'bo3_21_15' && state.setsA < 2 && state.setsB < 2) {
      throw new RrError(409, 'Для завершения BO3 команда должна выиграть два сета.', 'sets_required');
    }
    if (scoreA === scoreB) throw new RrError(409, 'При равном счёте разыграйте Golden Point.', 'golden_point_required');
    state.status = 'finished'; state.timerRunning = false; state.winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
    state.setsA = scoreA > scoreB ? Math.max(1, state.setsA) : state.setsA;
    state.setsB = scoreB > scoreA ? Math.max(1, state.setsB) : state.setsB;
  } else if (action === 'forfeit_a' || action === 'forfeit_b') {
    if (!match.teamAId || !match.teamBId) throw new RrError(409, 'Состав матча ещё не определён.', 'match_not_ready');
    state.status = 'forfeit'; state.forfeitSide = action === 'forfeit_a' ? 'a' : 'b'; state.timerRunning = false;
    state.winnerId = action === 'forfeit_a' ? match.teamBId : match.teamAId;
    state.setsA = action === 'forfeit_a' ? 0 : 1; state.setsB = action === 'forfeit_b' ? 0 : 1;
  } else if (action === 'correct_score') {
    state.scoreA = asNumberArray(payload.scoreA);
    state.scoreB = asNumberArray(payload.scoreB);
    state.setsA = Math.max(0, Number(payload.setsA ?? state.setsA));
    state.setsB = Math.max(0, Number(payload.setsB ?? state.setsB));
  } else if (action === 'reopen') {
    state.status = 'paused'; state.winnerId = null; state.forfeitSide = null; state.timerRunning = false;
  }
  return state;
}

async function updateMatchState(client: PoolClient, matchId: string, state: MutableMatchState, version: number): Promise<void> {
  await client.query(
    `UPDATE rr_match SET score_a = $2, score_b = $3, sets_a = $4, sets_b = $5, serving = $6,
            timer_remaining_sec = $7, timer_running = $8, winner_id = $9, forfeit_side = $10,
            status = $11, judge_version = $12,
            started_at = CASE WHEN $11 = 'live' AND started_at IS NULL THEN now() ELSE started_at END,
            finished_at = CASE WHEN $11 IN ('finished', 'forfeit') THEN now() WHEN $11 = 'paused' AND winner_id IS NOT NULL THEN NULL ELSE finished_at END,
            updated_at = now()
     WHERE id = $1`,
    [matchId, state.scoreA, state.scoreB, state.setsA, state.setsB, state.serving, state.timerRemainingSec,
      state.timerRunning, state.winnerId, state.forfeitSide, state.status, version],
  );
}

async function recalculateGroup(client: PoolClient, tournamentId: string, groupId: string): Promise<void> {
  const teams = await loadTeams(client, tournamentId);
  const matches = await loadMatches(client, tournamentId);
  const standings = calculateRrStandings(groupId, teams, matches);
  for (const row of standings) {
    await client.query(
      `INSERT INTO rr_standing
       (group_id, team_id, position, played, wins, losses, match_points, sets_won, sets_lost,
        points_for, points_against, point_diff, point_quotient, tiebreak_note, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
       ON CONFLICT (group_id, team_id) DO UPDATE SET
         position=EXCLUDED.position, played=EXCLUDED.played, wins=EXCLUDED.wins, losses=EXCLUDED.losses,
         match_points=EXCLUDED.match_points, sets_won=EXCLUDED.sets_won, sets_lost=EXCLUDED.sets_lost,
         points_for=EXCLUDED.points_for, points_against=EXCLUDED.points_against,
         point_diff=EXCLUDED.point_diff, point_quotient=EXCLUDED.point_quotient,
         tiebreak_note=EXCLUDED.tiebreak_note, updated_at=now()`,
      [row.groupId, row.teamId, row.position, row.played, row.wins, row.losses, row.matchPoints,
        row.setsWon, row.setsLost, row.pointsFor, row.pointsAgainst, row.pointDiff, row.pointQuotient, row.tiebreakNote],
    );
  }
}

async function propagatePlayoffResult(client: PoolClient, match: RrMatch, state: MutableMatchState): Promise<void> {
  if (match.stageType !== 'playoff' || !state.winnerId || !match.teamAId || !match.teamBId) return;
  const loserId = state.winnerId === match.teamAId ? match.teamBId : match.teamAId;
  await client.query(
    `UPDATE rr_match SET team_a_id = CASE WHEN source_a_kind = 'winner' THEN $2::uuid ELSE $3::uuid END,
                         status = CASE WHEN team_b_id IS NOT NULL THEN 'ready' ELSE status END,
                         updated_at = now()
     WHERE source_a_match_id = $1`,
    [match.id, state.winnerId, loserId],
  );
  await client.query(
    `UPDATE rr_match SET team_b_id = CASE WHEN source_b_kind = 'winner' THEN $2::uuid ELSE $3::uuid END,
                         status = CASE WHEN team_a_id IS NOT NULL THEN 'ready' ELSE status END,
                         updated_at = now()
     WHERE source_b_match_id = $1`,
    [match.id, state.winnerId, loserId],
  );
  await client.query(
    `UPDATE rr_match SET status = 'ready', updated_at = now()
     WHERE status = 'scheduled' AND team_a_id IS NOT NULL AND team_b_id IS NOT NULL
       AND (source_a_match_id = $1 OR source_b_match_id = $1)`,
    [match.id],
  );
}

export async function runRrJudgeAction(input: RrJudgeActionInput, actor: RrActor): Promise<RrJudgeSnapshot> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const duplicate = await client.query(
      `SELECT id FROM rr_judge_event WHERE tournament_id = $1 AND client_event_id = $2`,
      [input.tournamentId, input.clientEventId],
    );
    if (duplicate.rows[0]) {
      await client.query('COMMIT');
      return await getRrJudgeSnapshot(input.tournamentId);
    }
    const result = await client.query(`SELECT * FROM rr_match WHERE id = $1 AND tournament_id = $2 FOR UPDATE`, [input.matchId, input.tournamentId]);
    if (!result.rows[0]) throw new RrError(404, 'Матч не найден.', 'match_not_found');
    const match = mapMatch(result.rows[0] as DbRow);
    if (match.version !== input.expectedVersion) throw new RrError(409, 'Состояние матча изменилось на другом устройстве.', 'version_conflict');
    if ((input.action === 'correct_score' || input.action === 'reopen') && actor.kind === 'judge') {
      throw new RrError(403, 'Это действие доступно только администратору.', 'forbidden');
    }
    const before = mutableState(match);
    let restored: MutableMatchState | undefined;
    if (input.action === 'undo') {
      const previous = await client.query(
        `SELECT id, before_state FROM rr_judge_event
         WHERE match_id = $1 AND undone = false AND action IN ('point_a', 'point_b')
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [match.id],
      );
      if (!previous.rows[0]) throw new RrError(409, 'Нет локального очкового действия для отмены.', 'nothing_to_undo');
      restored = parseMutableState((previous.rows[0] as DbRow).before_state);
      await client.query(`UPDATE rr_judge_event SET undone = true WHERE id = $1`, [(previous.rows[0] as DbRow).id]);
    }
    const after = applyJudgeAction(match, input.action, input.payload ?? {}, restored);
    const nextVersion = match.version + 1;
    await updateMatchState(client, match.id, after, nextVersion);
    await client.query(
      `INSERT INTO rr_judge_event
       (tournament_id, match_id, client_event_id, expected_version, resulting_version, action,
        actor_kind, actor_id, payload, before_state, after_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
      [input.tournamentId, match.id, input.clientEventId, input.expectedVersion, nextVersion, input.action,
        actor.kind, actor.id ?? null, JSON.stringify(input.payload ?? {}), JSON.stringify(before), JSON.stringify(after)],
    );
    if ((after.status === 'finished' || after.status === 'forfeit') && match.groupId) {
      await recalculateGroup(client, input.tournamentId, match.groupId);
    }
    if (after.status === 'finished' || after.status === 'forfeit') {
      await propagatePlayoffResult(client, match, after);
    }
    await client.query(`UPDATE rr_tournament SET version = version + 1, updated_at = now() WHERE tournament_id = $1`, [input.tournamentId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getRrJudgeSnapshot(input.tournamentId);
}

type BracketSource = { teamId?: string; matchId?: string; kind?: 'winner' | 'loser' } | null;

async function insertPlayoffMatch(
  client: PoolClient,
  tournamentId: string,
  level: RrPlayoffLevelPreview,
  round: string,
  roundNo: number,
  matchNo: number,
  scheduleSlot: number,
  courtNo: number,
  format: RrMatchFormat,
  left: BracketSource,
  right: BracketSource,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO rr_match
     (tournament_id, stage_type, bracket_level, bracket_round, round_no, match_no, schedule_slot, court_no,
      team_a_id, team_b_id, source_a_match_id, source_b_match_id, source_a_kind, source_b_kind,
      match_format, timer_remaining_sec, status)
     VALUES ($1,'playoff',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
     RETURNING id::text`,
    [tournamentId, level.key, round, roundNo, matchNo, scheduleSlot, courtNo,
      left?.teamId ?? null, right?.teamId ?? null, left?.matchId ?? null, right?.matchId ?? null,
      left?.matchId ? left.kind ?? 'winner' : null, right?.matchId ? right.kind ?? 'winner' : null,
      JSON.stringify(format), format.code === 'timed' ? (format.durationMinutes ?? 15) * 60 : null,
      left?.teamId && right?.teamId ? 'ready' : 'scheduled'],
  );
  return String((result.rows[0] as DbRow).id);
}

function seededPairs(teamIds: string[], bracketSize: 4 | 8): Array<[string | null, string | null]> {
  const padded = [...teamIds, ...Array.from({ length: bracketSize - teamIds.length }, () => null)];
  const indexes = bracketSize === 4 ? [[0, 3], [1, 2]] : [[0, 7], [3, 4], [1, 6], [2, 5]];
  return indexes.map(([a, b]) => [padded[a] ?? null, padded[b] ?? null]);
}

async function createPlayoffMatches(client: PoolClient, tournamentId: string, preview: RrPlayoffPreview, format: RrMatchFormat, courtCount: number): Promise<void> {
  await client.query(`DELETE FROM rr_match WHERE tournament_id = $1 AND stage_type = 'playoff'`, [tournamentId]);
  const maxResult = await client.query(`SELECT COALESCE(MAX(match_no), 0) AS max_no FROM rr_match WHERE tournament_id = $1`, [tournamentId]);
  let matchNo = Number((maxResult.rows[0] as DbRow).max_no ?? 0);
  let slot = Number((await client.query(`SELECT COALESCE(MAX(schedule_slot), 0) AS max_slot FROM rr_match WHERE tournament_id = $1`, [tournamentId])).rows[0].max_slot ?? 0) + 1;
  for (const level of preview.levels) {
    const pairs = level.firstRoundPairs ?? seededPairs(level.teamIds, level.bracketSize);
    const openingRound = level.bracketSize === 8 ? 'quarterfinal' : 'semifinal';
    const openingNodes: BracketSource[] = [];
    for (let index = 0; index < pairs.length; index += 1) {
      const [left, right] = pairs[index];
      if (left && right) {
        matchNo += 1;
        const id = await insertPlayoffMatch(client, tournamentId, level, openingRound, 1, matchNo, slot + Math.floor(index / courtCount), index % courtCount + 1, format, { teamId: left }, { teamId: right });
        openingNodes.push({ matchId: id, kind: 'winner' });
      } else {
        openingNodes.push(left || right ? { teamId: left ?? right ?? undefined } : null);
      }
    }
    slot += Math.max(1, Math.ceil(pairs.length / courtCount));
    let semifinalNodes = openingNodes;
    let semifinalMatches: string[] = [];
    if (level.bracketSize === 8) {
      semifinalNodes = [];
      for (let index = 0; index < 2; index += 1) {
        const left = openingNodes[index * 2];
        const right = openingNodes[index * 2 + 1];
        if (left && right) {
          matchNo += 1;
          const id = await insertPlayoffMatch(client, tournamentId, level, 'semifinal', 2, matchNo, slot, index + 1, format, left, right);
          semifinalNodes.push({ matchId: id, kind: 'winner' });
          semifinalMatches.push(id);
        } else semifinalNodes.push(left ?? right);
      }
      slot += 1;
    } else {
      semifinalMatches = openingNodes.filter((node): node is NonNullable<BracketSource> => Boolean(node?.matchId)).map((node) => String(node.matchId));
    }
    if (semifinalNodes[0] && semifinalNodes[1]) {
      matchNo += 1;
      await insertPlayoffMatch(client, tournamentId, level, 'final', level.bracketSize === 8 ? 3 : 2, matchNo, slot, 1, format, semifinalNodes[0], semifinalNodes[1]);
    }
    if (semifinalMatches.length === 2) {
      matchNo += 1;
      await insertPlayoffMatch(client, tournamentId, level, 'bronze', level.bracketSize === 8 ? 3 : 2, matchNo, slot, Math.min(2, courtCount), format,
        { matchId: semifinalMatches[0], kind: 'loser' }, { matchId: semifinalMatches[1], kind: 'loser' });
    }
    slot += 1;
  }
}

async function setStage(client: PoolClient, tournamentId: string, stage: RrTournamentStage): Promise<void> {
  await client.query(`UPDATE rr_tournament SET stage = $2, version = version + 1, updated_at = now() WHERE tournament_id = $1`, [tournamentId, stage]);
}

async function assignFinalPlacements(client: PoolClient, tournamentId: string): Promise<void> {
  const result = await client.query(
    `SELECT id::text, bracket_level, bracket_round, team_a_id::text, team_b_id::text, winner_id::text, status
     FROM rr_match WHERE tournament_id = $1 AND stage_type = 'playoff'
     ORDER BY CASE bracket_level WHEN 'championship' THEN 0 WHEN 'hard' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, match_no`,
    [tournamentId],
  );
  const levelOrder = ['championship', 'hard', 'medium', 'lite'];
  let placement = 1;
  const assigned = new Set<string>();
  for (const level of levelOrder) {
    const rows = result.rows.map((row) => row as DbRow).filter((row) => String(row.bracket_level) === level);
    if (!rows.length) continue;
    const final = rows.find((row) => row.bracket_round === 'final' && row.winner_id);
    const bronze = rows.find((row) => row.bracket_round === 'bronze' && row.winner_id);
    const ordered: string[] = [];
    if (final?.winner_id) {
      const winner = String(final.winner_id);
      const runner = winner === String(final.team_a_id) ? String(final.team_b_id ?? '') : String(final.team_a_id ?? '');
      ordered.push(winner, runner);
    }
    if (bronze?.winner_id) {
      const winner = String(bronze.winner_id);
      const loser = winner === String(bronze.team_a_id) ? String(bronze.team_b_id ?? '') : String(bronze.team_a_id ?? '');
      ordered.push(winner, loser);
    }
    const levelTeamResult = await client.query(
      `SELECT DISTINCT team_id FROM (
         SELECT team_a_id AS team_id FROM rr_match WHERE tournament_id=$1 AND bracket_level=$2
         UNION SELECT team_b_id AS team_id FROM rr_match WHERE tournament_id=$1 AND bracket_level=$2
       ) q WHERE team_id IS NOT NULL`,
      [tournamentId, level],
    );
    ordered.push(...levelTeamResult.rows.map((row) => String((row as DbRow).team_id)));
    for (const teamId of ordered.filter(Boolean)) {
      if (assigned.has(teamId)) continue;
      assigned.add(teamId);
      await client.query(`UPDATE rr_team SET final_placement = $2 WHERE id = $1`, [teamId, placement]);
      placement += 1;
    }
  }
  const remaining = await client.query(`SELECT id::text FROM rr_team WHERE tournament_id=$1 AND final_placement IS NULL ORDER BY seed`, [tournamentId]);
  for (const row of remaining.rows) {
    await client.query(`UPDATE rr_team SET final_placement=$2 WHERE id=$1`, [String((row as DbRow).id), placement]);
    placement += 1;
  }
}

async function syncResults(tournamentId: string): Promise<void> {
  const snapshot = await getRrJudgeSnapshot(tournamentId);
  const points = [100, 92, 84, 76, 68, 60, 52, 44, 36, 28, 20, 16, 12, 8, 4, 2];
  const rows = snapshot.teams.flatMap((team) => {
    if (!team.finalPlacement) return [];
    const ratingPts = points[Math.min(points.length - 1, team.finalPlacement - 1)];
    return [team.player1, team.player2].map((player) => ({
      playerName: player.name,
      gender: player.gender,
      placement: team.finalPlacement as number,
      points: ratingPts,
      ratingPts,
      ratingPool: 'pro' as const,
    }));
  });
  if (rows.length) await upsertTournamentResults(tournamentId, rows);
}

export async function runRrOperatorAction(
  tournamentId: string,
  action: RrOperatorActionName,
  payload: Record<string, unknown>,
  actor: RrActor,
): Promise<RrJudgeSnapshot> {
  if (action === 'initialize') return initializeRrTournament(tournamentId, payload as unknown as RrInitializeInput);
  if (action === 'judge_action') {
    return runRrJudgeAction({
      tournamentId,
      matchId: String(payload.matchId ?? ''),
      action: String(payload.judgeAction ?? '') as RrJudgeActionName,
      clientEventId: String(payload.clientEventId ?? ''),
      expectedVersion: Number(payload.expectedVersion ?? 0),
      payload: asRecord(payload.payload),
    }, actor);
  }
  const client = await getPool().connect();
  let shouldSync = false;
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT * FROM rr_tournament WHERE tournament_id=$1 FOR UPDATE`, [tournamentId]);
    if (!locked.rows[0]) throw new RrError(409, 'Сначала сформируйте команды и группы.', 'not_initialized');
    const currentStage = String((locked.rows[0] as DbRow).stage) as RrTournamentStage;
    if (action === 'start_groups') {
      if (currentStage !== 'groups_ready') throw new RrError(409, 'Групповой этап нельзя запустить из текущего состояния.', 'stage_conflict');
      await client.query(`UPDATE rr_match SET status='ready' WHERE tournament_id=$1 AND stage_type='group' AND schedule_slot=(SELECT MIN(schedule_slot) FROM rr_match WHERE tournament_id=$1 AND stage_type='group')`, [tournamentId]);
      await client.query(`UPDATE rr_group SET status='live' WHERE tournament_id=$1`, [tournamentId]);
      await setStage(client, tournamentId, 'groups_live');
    } else if (action === 'finish_groups') {
      if (currentStage !== 'groups_live') throw new RrError(409, 'Групповой этап ещё не запущен.', 'stage_conflict');
      const unfinished = await client.query(`SELECT count(*)::int AS count FROM rr_match WHERE tournament_id=$1 AND stage_type='group' AND status NOT IN ('finished','forfeit','cancelled')`, [tournamentId]);
      if (Number((unfinished.rows[0] as DbRow).count ?? 0) > 0) throw new RrError(409, 'Не все матчи группового этапа подтверждены.', 'unfinished_matches');
      await client.query(`UPDATE rr_group SET status='finished' WHERE tournament_id=$1`, [tournamentId]);
      await setStage(client, tournamentId, 'groups_finished');
    } else if (action === 'preview_playoff') {
      if (currentStage !== 'groups_finished' && currentStage !== 'playoff_preview') throw new RrError(409, 'Сначала завершите групповой этап.', 'stage_conflict');
      const teams = await loadTeams(client, tournamentId);
      const groups = await loadGroups(client, tournamentId, teams);
      const standings = await loadStandings(client, tournamentId);
      const mode = (locked.rows[0] as DbRow).playoff_mode === 'all_levels' ? 'all_levels' : 'championship';
      const preview = buildRrPlayoffPreview(groups, standings, mode);
      await client.query(`UPDATE rr_tournament SET playoff_preview=$2::jsonb WHERE tournament_id=$1`, [tournamentId, JSON.stringify(preview)]);
      await setStage(client, tournamentId, 'playoff_preview');
    } else if (action === 'confirm_playoff') {
      if (currentStage !== 'playoff_preview') throw new RrError(409, 'Сначала сформируйте предварительный плей-офф.', 'stage_conflict');
      const state = locked.rows[0] as DbRow;
      const preview = payload.preview ? payload.preview as unknown as RrPlayoffPreview : state.playoff_preview as RrPlayoffPreview;
      if (!preview?.levels?.length) throw new RrError(400, 'Предварительный расклад плей-офф пуст.', 'invalid_preview');
      await createPlayoffMatches(client, tournamentId, preview, normalizeRrMatchFormat(state.playoff_match_format), Number(state.court_count ?? 1));
      await client.query(`UPDATE rr_tournament SET playoff_preview=$2::jsonb WHERE tournament_id=$1`, [tournamentId, JSON.stringify(preview)]);
      await setStage(client, tournamentId, 'playoff_ready');
    } else if (action === 'start_playoff') {
      if (currentStage !== 'playoff_ready') throw new RrError(409, 'Плей-офф ещё не подтверждён.', 'stage_conflict');
      await client.query(`UPDATE rr_match SET status='ready' WHERE tournament_id=$1 AND stage_type='playoff' AND team_a_id IS NOT NULL AND team_b_id IS NOT NULL AND round_no=1`, [tournamentId]);
      await setStage(client, tournamentId, 'playoff_live');
    } else if (action === 'finish_tournament') {
      if (currentStage !== 'playoff_live' && currentStage !== 'groups_finished') throw new RrError(409, 'Турнир нельзя завершить из текущего состояния.', 'stage_conflict');
      const unfinished = await client.query(`SELECT count(*)::int AS count FROM rr_match WHERE tournament_id=$1 AND stage_type='playoff' AND status NOT IN ('finished','forfeit','cancelled')`, [tournamentId]);
      if (currentStage === 'playoff_live' && Number((unfinished.rows[0] as DbRow).count ?? 0) > 0) throw new RrError(409, 'Не все матчи плей-офф завершены.', 'unfinished_matches');
      await assignFinalPlacements(client, tournamentId);
      await setStage(client, tournamentId, 'finished');
      await client.query(`UPDATE tournaments SET status='finished' WHERE id=$1`, [tournamentId]);
      shouldSync = true;
    } else if (action === 'rollback_stage') {
      const target: Record<RrTournamentStage, RrTournamentStage> = {
        setup: 'setup', groups_ready: 'setup', groups_live: 'groups_ready', groups_finished: 'groups_live',
        playoff_preview: 'groups_finished', playoff_ready: 'playoff_preview', playoff_live: 'playoff_ready', finished: 'playoff_live',
      };
      const next = target[currentStage];
      if (next === 'setup') {
        await client.query(`DELETE FROM rr_tournament WHERE tournament_id=$1`, [tournamentId]);
      } else {
        if (currentStage === 'playoff_ready' || currentStage === 'playoff_live') await client.query(`DELETE FROM rr_match WHERE tournament_id=$1 AND stage_type='playoff'`, [tournamentId]);
        await setStage(client, tournamentId, next);
      }
    } else {
      throw new RrError(400, `Неподдерживаемое действие: ${action}`, 'unsupported_action');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (shouldSync) await syncResults(tournamentId);
  return getRrJudgeSnapshot(tournamentId);
}
