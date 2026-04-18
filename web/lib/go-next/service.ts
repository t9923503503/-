import { PoolClient } from 'pg';
import {
  isGoAdminFormat,
  normalizeGoAdminSettings,
} from '@/lib/admin-legacy-sync';
import { listRosterParticipants } from '@/lib/admin-queries';
import { getPool } from '@/lib/db';
import { buildGoCourtPin, buildGoStructuralSignature, validateGoSetup } from '@/lib/go-next-config';
import { initGoCourtSlots } from './court-slots';
import { generateBracketSlots } from './bracket-generator';
import {
  buildBalancedGoGroups,
  buildCourtSchedule,
  calculateStandings,
  compareCrossGroupRows,
  generateGroupSchedule,
} from './core';
import { syncGoResultsToTournamentResultsOrThrowBadRequest } from './sync-tournament-results';
import type {
  GoAdminSettings,
  GoJudgeActionName,
  GoBracketSlotView,
  GoInitialBucket,
  GoGroupStandingRow,
  GoGroupView,
  GoJudgeCourtView,
  GoJudgeMatchView,
  GoJudgeServerRef,
  GoJudgeSnapshot,
  GoJudgeState,
  GoJudgeTeamPlayerView,
  GoMatchResult,
  GoMatchStatus,
  GoMatchView,
  GoOperatorActionName,
  GoOperatorStage,
  GoOperatorState,
  GoRoundStatus,
  GoSpectatorPayload,
  GoTeamView,
  GoWalkover,
} from './types';

interface TournamentRow {
  id: string;
  name: string;
  date: string | null;
  time: string | null;
  format: string;
  division: string;
  status: string;
  settings: Record<string, unknown>;
}

interface RoundRow {
  roundId: string;
  roundNo: number;
  status: GoRoundStatus;
  seed: number;
  seedDraft: unknown;
}

interface CourtRow {
  courtNo: number;
  label: string;
  pinCode: string;
}

interface TeamRow {
  teamId: string;
  groupId: string;
  groupNo: number;
  groupLabel: string;
  groupStatus: string;
  teamIdx: number;
  seed: number | null;
  initialBucket: GoInitialBucket;
  isBye: boolean;
  ratingSnapshot: number;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
}

interface StandingDbRow {
  groupId: string;
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  matchPoints: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  position: number | null;
}

interface MatchRow {
  matchId: string;
  roundId: string;
  roundNo: number;
  groupId: string | null;
  bracketSlotId: string | null;
  bracketLevel: string | null;
  bracketRound: number | null;
  matchNo: number;
  courtNo: number | null;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  winnerId: string | null;
  walkover: GoWalkover;
  status: GoMatchStatus;
  scheduledAt: string | null;
  slotIndex: number | null;
  groupLabel: string | null;
  judgeState?: unknown;
  judgeHistory?: unknown;
  judgeVersion?: number;
}

interface SlotRow {
  slotId: string;
  roundId: string;
  bracketLevel: string;
  bracketRound: number;
  position: number;
  teamId: string | null;
  nextSlotId: string | null;
  isBye: boolean;
}

interface GoAdminBundle {
  tournament: TournamentRow;
  settings: GoAdminSettings;
  rounds: RoundRow[];
  courts: CourtRow[];
  groups: GoGroupView[];
  matches: GoMatchView[];
  brackets: Record<string, GoBracketSlotView[]>;
  seedDraft: Record<string, GoTeamView[]> | null;
  state: GoOperatorState;
}

interface RosterSourceRow {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  skillLevel: string;
  position: number;
  ratingM: number;
  ratingW: number;
  ratingMix: number;
}

interface SeedDraftInputTeam {
  teamId?: unknown;
}

export interface GoOperatorMatchPatchInput {
  matchId: string;
  courtNo?: number | null;
  scheduledAt?: string | null;
  status?: GoMatchStatus;
  scoreA?: number[];
  scoreB?: number[];
  setsA?: number;
  setsB?: number;
  winnerId?: string | null;
  note?: string;
  allowLiveReschedule?: boolean;
  allowFinishedReschedule?: boolean;
}

export interface GoOperatorMatchPatchResult {
  success: true;
  state: GoOperatorState;
  matches: GoMatchView[];
  updatedMatch: GoMatchView | null;
  audit: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
}

export class GoNextError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GoNextError';
    this.status = status;
  }
}

export function isGoNextError(error: unknown): error is GoNextError {
  return error instanceof GoNextError;
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new GoNextError(503, 'Service unavailable');
  }
}

function asInt(value: unknown, fallback = 0): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Math.max(0, asInt(item, 0)));
}

function normalizeGender(value: unknown): 'M' | 'W' {
  return String(value ?? '').trim().toUpperCase() === 'W' ? 'W' : 'M';
}

function normalizeRoundStatus(value: unknown): GoRoundStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'live' || normalized === 'finished') return normalized;
  return 'pending';
}

function normalizeMatchStatus(value: unknown): GoMatchStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'live' || normalized === 'finished' || normalized === 'cancelled') return normalized;
  return 'pending';
}

function normalizeWalkover(value: unknown): GoWalkover {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'team_a' || normalized === 'team_b' || normalized === 'mutual') return normalized;
  return 'none';
}

function normalizeGoSettings(
  settings?: Record<string, unknown>,
  participantCount?: number,
): GoAdminSettings {
  return normalizeGoAdminSettings(settings, participantCount) as GoAdminSettings;
}

function normalizeIsoDateOrFallback(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? '').trim();
  const candidate = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return fallback;
  const [yearRaw, monthRaw, dayRaw] = candidate.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return fallback;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return fallback;
  }
  return candidate;
}

function normalizeTimeOrFallback(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return fallback;
  const [hourRaw, minuteRaw] = raw.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return raw;
}

function normalizeIsoTimestampInput(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new GoNextError(400, 'Invalid scheduledAt value');
  }
  return parsed.toISOString();
}

function makeTeamLabel(player1Name: string, player2Name?: string | null): string {
  const left = String(player1Name || '').trim();
  const right = String(player2Name || '').trim();
  return right ? `${left} / ${right}` : left || 'TBD';
}

function asTeamSide(value: unknown): 'A' | 'B' | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'A' || raw === 'B') return raw;
  return null;
}

function asPlayerSlot(value: unknown): 1 | 2 | null {
  const slot = asInt(value, 0);
  return slot === 1 || slot === 2 ? slot : null;
}

function clampJudgeHistory(entries: GoJudgeState[], depth = 10): GoJudgeState[] {
  if (entries.length <= depth) return entries;
  return entries.slice(entries.length - depth);
}

function normalizeJudgeState(raw: unknown, match: MatchRow): GoJudgeState {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const scoreA = asIntArray(source.scoreA ?? match.scoreA ?? []);
  const scoreB = asIntArray(source.scoreB ?? match.scoreB ?? []);
  const activeSetIndex = Math.max(0, asInt(source.activeSetIndex, Math.max(scoreA.length, scoreB.length, 1) - 1));
  const servingTeam = asTeamSide(source.servingTeam);
  const currentServerRaw =
    source.currentServer && typeof source.currentServer === 'object' && !Array.isArray(source.currentServer)
      ? (source.currentServer as Record<string, unknown>)
      : null;
  const currentServerTeam = asTeamSide(currentServerRaw?.team);
  const currentServerSlot = asPlayerSlot(currentServerRaw?.playerSlot);
  const currentServer: GoJudgeServerRef | null =
    currentServerTeam && currentServerSlot ? { team: currentServerTeam, playerSlot: currentServerSlot } : null;
  const lastServerRaw =
    source.lastServer && typeof source.lastServer === 'object' && !Array.isArray(source.lastServer)
      ? (source.lastServer as Record<string, unknown>)
      : {};
  const startServerRaw =
    source.startServerByTeam && typeof source.startServerByTeam === 'object' && !Array.isArray(source.startServerByTeam)
      ? (source.startServerByTeam as Record<string, unknown>)
      : {};
  const sideSwapRaw =
    source.sideSwap && typeof source.sideSwap === 'object' && !Array.isArray(source.sideSwap)
      ? (source.sideSwap as Record<string, unknown>)
      : {};
  const ttoRaw =
    source.tto && typeof source.tto === 'object' && !Array.isArray(source.tto)
      ? (source.tto as Record<string, unknown>)
      : {};
  const timeoutsRaw =
    source.timeouts && typeof source.timeouts === 'object' && !Array.isArray(source.timeouts)
      ? (source.timeouts as Record<string, unknown>)
      : {};
  const technicalRaw =
    source.technicalTimeouts && typeof source.technicalTimeouts === 'object' && !Array.isArray(source.technicalTimeouts)
      ? (source.technicalTimeouts as Record<string, unknown>)
      : {};

  return {
    activeSetIndex,
    scoreA,
    scoreB,
    servingTeam,
    currentServer,
    lastServer: {
      A: asPlayerSlot(lastServerRaw.A),
      B: asPlayerSlot(lastServerRaw.B),
    },
    startServerByTeam: {
      A: asPlayerSlot(startServerRaw.A) ?? 1,
      B: asPlayerSlot(startServerRaw.B) ?? 1,
    },
    sideSwap: {
      pending: Boolean(sideSwapRaw.pending),
      confirmedAt: Array.isArray(sideSwapRaw.confirmedAt)
        ? sideSwapRaw.confirmedAt.map((item) => Math.max(0, asInt(item, 0)))
        : [],
    },
    manualSideSwap: Boolean(source.manualSideSwap),
    tto: {
      pending: Boolean(ttoRaw.pending),
      triggeredSets: Array.isArray(ttoRaw.triggeredSets)
        ? ttoRaw.triggeredSets.map((item) => Math.max(0, asInt(item, 0)))
        : [],
    },
    timeouts: {
      teamA: Math.max(0, Math.min(1, asInt(timeoutsRaw.teamA, 0))),
      teamB: Math.max(0, Math.min(1, asInt(timeoutsRaw.teamB, 0))),
    },
    technicalTimeouts: {
      setIndex: Array.isArray(technicalRaw.setIndex)
        ? technicalRaw.setIndex.map((item) => Math.max(0, asInt(item, 0)))
        : [],
    },
    replayCount: Math.max(0, asInt(source.replayCount, 0)),
  };
}

function setScoreTarget(settings: GoAdminSettings, match: MatchRow, setIndex: number): number {
  if (settings.matchFormat === 'single15') return 15;
  if (settings.matchFormat === 'single21') return 21;
  if (setIndex >= 2) return 15;
  return match.groupId ? settings.pointLimitGroup : settings.pointLimitBracket;
}

function isSetWon(scoreA: number, scoreB: number, target: number): boolean {
  return Math.max(scoreA, scoreB) >= target && Math.abs(scoreA - scoreB) >= 2;
}

function buildTeamView(row: TeamRow): GoTeamView {
  return {
    teamId: row.teamId,
    teamIdx: row.teamIdx,
    seed: row.seed,
    initialBucket: row.initialBucket,
    isBye: row.isBye,
    player1: {
      id: row.player1Id,
      name: row.player1Name,
    },
    player2: row.player2Id
      ? {
          id: row.player2Id,
          name: row.player2Name ?? '',
        }
      : null,
    ratingSnapshot: row.ratingSnapshot,
    label: row.isBye ? 'BYE' : makeTeamLabel(row.player1Name, row.player2Name),
  };
}

function buildStandingRow(row: StandingDbRow, teamView: GoTeamView | null): GoGroupStandingRow {
  const setsWon = row.setsWon;
  const setsLost = row.setsLost;
  const pointsFor = row.pointsFor;
  const pointsAgainst = row.pointsAgainst;
  return {
    teamId: row.teamId,
    teamLabel: teamView?.label ?? row.teamId,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    matchPoints: row.matchPoints,
    setsWon,
    setsLost,
    pointsFor,
    pointsAgainst,
    setQuotient: setsLost === 0 ? (setsWon === 0 ? 0 : Number.POSITIVE_INFINITY) : setsWon / setsLost,
    pointQuotient:
      pointsAgainst === 0 ? (pointsFor === 0 ? 0 : Number.POSITIVE_INFINITY) : pointsFor / pointsAgainst,
    pointDiff: pointsFor - pointsAgainst,
    position: row.position ?? 0,
  };
}

function ratingForRosterPlayer(row: RosterSourceRow, division: string): number {
  const normalizedDivision = String(division || '').trim().toLowerCase();
  if (normalizedDivision.includes('микс') || normalizedDivision.includes('mix')) {
    return asInt(row.ratingMix, 0);
  }
  if (normalizeGender(row.gender) === 'W') {
    return asInt(row.ratingW, 0);
  }
  return asInt(row.ratingM, 0);
}

function deriveGoBucket(left: RosterSourceRow, right: RosterSourceRow | null): GoInitialBucket {
  const weights = [left.skillLevel, right?.skillLevel ?? '']
    .map((value) => String(value).trim().toLowerCase())
    .map((value) => (value === 'pro' || value === 'advanced' ? 3 : value === 'medium' ? 2 : 1));
  const strength = Math.max(...weights, 1);
  if (strength >= 3) return 'hard';
  if (strength === 2) return 'medium';
  return 'lite';
}

function validatePairComposition(
  division: string,
  left: RosterSourceRow,
  right: RosterSourceRow | null,
): string | null {
  if (!right) return 'GO teams must be formed from complete pairs.';
  const normalizedDivision = String(division || '').trim().toLowerCase();
  const genders = [left.gender, right.gender].sort().join('');
  if (normalizedDivision.includes('mix') || normalizedDivision.includes('микс')) {
    return genders === 'MW' ? null : 'Mixed GO requires M/W pairs in roster order.';
  }
  if (normalizedDivision.includes('жен') || normalizedDivision.includes('women') || normalizedDivision.includes('ww')) {
    return genders === 'WW' ? null : 'Women GO requires W/W pairs in roster order.';
  }
  return genders === 'MM' ? null : 'Men GO requires M/M pairs in roster order.';
}

function buildStartDateTime(tournament: TournamentRow, settings: GoAdminSettings): string {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const datePart = normalizeIsoDateOrFallback(tournament.date, fallbackDate);
  const timePart = normalizeTimeOrFallback(settings.startTime || tournament.time || '08:00', '08:00');
  return `${datePart}T${timePart}:00.000Z`;
}

function buildStage(input: {
  rounds: RoundRow[];
  matches: MatchRow[];
  seedDraft: Record<string, GoTeamView[]> | null;
}): GoOperatorStage {
  const r1 = input.rounds.find((round) => round.roundNo === 1) ?? null;
  const r2 = input.rounds.find((round) => round.roundNo === 2) ?? null;
  if (!r1) return 'setup';
  if (r2?.status === 'finished') return 'finished';
  if (r2) {
    if (input.matches.some((match) => match.roundNo === 2)) return 'bracket_live';
    return 'bracket_ready';
  }
  if (input.seedDraft) return 'bracket_preview';
  if (r1.status === 'finished') return 'groups_finished';
  if (r1.status === 'live') return 'groups_live';
  return 'groups_ready';
}

async function loadTournamentTx(
  client: PoolClient,
  tournamentId: string,
  options?: { lock?: boolean },
): Promise<TournamentRow> {
  const query = `SELECT id::text, name, date::text, time, format, division, status, settings
                 FROM tournaments
                 WHERE id = $1${options?.lock ? ' FOR UPDATE' : ''}`;
  const res = await client.query(query, [tournamentId]);
  const row = res.rows[0];
  if (!row) throw new GoNextError(404, 'Tournament not found');

  const settings =
    row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  const tournament: TournamentRow = {
    id: String(row.id),
    name: String(row.name ?? ''),
    date: row.date ? String(row.date) : null,
    time: row.time ? String(row.time) : null,
    format: String(row.format ?? ''),
    division: String(row.division ?? ''),
    status: String(row.status ?? ''),
    settings,
  };
  if (!isGoAdminFormat(tournament.format)) {
    throw new GoNextError(400, `Unsupported tournament format: ${tournament.format}`);
  }
  return tournament;
}

async function loadRosterSourcesTx(client: PoolClient, tournamentId: string): Promise<RosterSourceRow[]> {
  const { rows } = await client.query(
    `SELECT
       tp.player_id::text AS "playerId",
       p.name AS "playerName",
       p.gender,
       COALESCE(p.skill_level, '') AS "skillLevel",
       tp.position,
       COALESCE(p.rating_m, 0) AS "ratingM",
       COALESCE(p.rating_w, 0) AS "ratingW",
       COALESCE(p.rating_mix, 0) AS "ratingMix"
     FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = $1
       AND tp.is_waitlist = false
     ORDER BY tp.position ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    playerId: String(row.playerId),
    playerName: String(row.playerName ?? ''),
    gender: normalizeGender(row.gender),
    skillLevel: String(row.skillLevel ?? ''),
    position: asInt(row.position, 0),
    ratingM: asInt(row.ratingM, 0),
    ratingW: asInt(row.ratingW, 0),
    ratingMix: asInt(row.ratingMix, 0),
  }));
}

async function clearGoStateTx(client: PoolClient, tournamentId: string): Promise<void> {
  await client.query(`DELETE FROM go_court WHERE tournament_id = $1`, [tournamentId]);
  await client.query(`DELETE FROM go_round WHERE tournament_id = $1`, [tournamentId]);
}

async function persistTournamentSettingsTx(
  client: PoolClient,
  tournament: TournamentRow,
  patch: Record<string, unknown>,
): Promise<void> {
  await client.query(`UPDATE tournaments SET settings = $2::jsonb WHERE id = $1`, [
    tournament.id,
    JSON.stringify({
      ...tournament.settings,
      ...patch,
    }),
  ]);
}

async function loadRoundsTx(client: PoolClient, tournamentId: string): Promise<RoundRow[]> {
  const { rows } = await client.query(
    `SELECT id::text AS "roundId", round_no AS "roundNo", status, seed, seed_draft AS "seedDraft"
     FROM go_round
     WHERE tournament_id = $1
     ORDER BY round_no ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    roundId: String(row.roundId),
    roundNo: asInt(row.roundNo, 0),
    status: normalizeRoundStatus(row.status),
    seed: asInt(row.seed, 0),
    seedDraft: row.seedDraft,
  }));
}

async function loadCourtsTx(client: PoolClient, tournamentId: string): Promise<CourtRow[]> {
  const { rows } = await client.query(
    `SELECT court_no AS "courtNo", label, pin_code AS "pinCode"
     FROM go_court
     WHERE tournament_id = $1
     ORDER BY court_no ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    courtNo: asInt(row.courtNo, 1),
    label: String(row.label ?? ''),
    pinCode: String(row.pinCode ?? '').trim().toUpperCase(),
  }));
}

async function loadTeamsTx(client: PoolClient, tournamentId: string): Promise<TeamRow[]> {
  const { rows } = await client.query(
    `SELECT
       t.id::text AS "teamId",
       g.id::text AS "groupId",
       g.group_no AS "groupNo",
       g.label AS "groupLabel",
       g.status AS "groupStatus",
       t.team_idx AS "teamIdx",
       t.seed,
       COALESCE(t.initial_bucket, 'lite') AS "initialBucket",
       COALESCE(t.is_bye, false) AS "isBye",
       t.rating_snapshot AS "ratingSnapshot",
       COALESCE(p1.id::text, '') AS "player1Id",
       COALESCE(p1.name, '') AS "player1Name",
       p2.id::text AS "player2Id",
       p2.name AS "player2Name"
     FROM go_team t
     JOIN go_group g ON g.id = t.group_id
     JOIN go_round r ON r.id = g.round_id
     LEFT JOIN players p1 ON p1.id = t.player1_id
     LEFT JOIN players p2 ON p2.id = t.player2_id
     WHERE r.tournament_id = $1
     ORDER BY g.group_no ASC, t.team_idx ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    teamId: String(row.teamId),
    groupId: String(row.groupId),
    groupNo: asInt(row.groupNo, 0),
    groupLabel: String(row.groupLabel ?? ''),
    groupStatus: String(row.groupStatus ?? 'pending'),
    teamIdx: asInt(row.teamIdx, 0),
    seed: row.seed == null ? null : asInt(row.seed, 0),
    initialBucket: String(row.initialBucket ?? 'lite').toLowerCase() === 'hard'
      ? 'hard'
      : String(row.initialBucket ?? 'lite').toLowerCase() === 'medium'
        ? 'medium'
        : 'lite',
    isBye: Boolean(row.isBye),
    ratingSnapshot: asInt(row.ratingSnapshot, 0),
    player1Id: String(row.player1Id ?? ''),
    player1Name: String(row.player1Name ?? ''),
    player2Id: row.player2Id ? String(row.player2Id) : null,
    player2Name: row.player2Name ? String(row.player2Name) : null,
  }));
}

async function loadStandingsTx(client: PoolClient, tournamentId: string): Promise<StandingDbRow[]> {
  const { rows } = await client.query(
    `SELECT
       gs.group_id::text AS "groupId",
       gs.team_id::text AS "teamId",
       gs.played,
       gs.wins,
       gs.losses,
       gs.match_points AS "matchPoints",
       gs.sets_won AS "setsWon",
       gs.sets_lost AS "setsLost",
       gs.points_for AS "pointsFor",
       gs.points_against AS "pointsAgainst",
       gs.position
     FROM go_group_standing gs
     JOIN go_group g ON g.id = gs.group_id
     JOIN go_round r ON r.id = g.round_id
     WHERE r.tournament_id = $1
     ORDER BY g.group_no ASC, gs.position ASC NULLS LAST, gs.team_id ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    groupId: String(row.groupId),
    teamId: String(row.teamId),
    played: asInt(row.played, 0),
    wins: asInt(row.wins, 0),
    losses: asInt(row.losses, 0),
    matchPoints: asInt(row.matchPoints, 0),
    setsWon: asInt(row.setsWon, 0),
    setsLost: asInt(row.setsLost, 0),
    pointsFor: asInt(row.pointsFor, 0),
    pointsAgainst: asInt(row.pointsAgainst, 0),
    position: row.position == null ? null : asInt(row.position, 0),
  }));
}

async function loadMatchesTx(client: PoolClient, tournamentId: string): Promise<MatchRow[]> {
  const { rows } = await client.query(
    `SELECT
       m.id::text AS "matchId",
       m.round_id::text AS "roundId",
       r.round_no AS "roundNo",
       m.group_id::text AS "groupId",
       m.bracket_slot_id::text AS "bracketSlotId",
       m.bracket_level AS "bracketLevel",
       bs.bracket_round AS "bracketRound",
       m.match_no AS "matchNo",
       m.court_no AS "courtNo",
       m.team_a_id::text AS "teamAId",
       m.team_b_id::text AS "teamBId",
       COALESCE(m.score_a, '{}') AS "scoreA",
       COALESCE(m.score_b, '{}') AS "scoreB",
       m.sets_a AS "setsA",
       m.sets_b AS "setsB",
       m.winner_id::text AS "winnerId",
       m.walkover,
       m.status,
       m.judge_state AS "judgeState",
       m.judge_history AS "judgeHistory",
       m.judge_version AS "judgeVersion",
       to_char(m.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAt",
       CASE
         WHEN m.scheduled_at IS NULL THEN NULL
         ELSE DENSE_RANK() OVER (ORDER BY m.scheduled_at ASC)
       END AS "slotIndex",
       g.label AS "groupLabel"
     FROM go_match m
     JOIN go_round r ON r.id = m.round_id
     LEFT JOIN go_group g ON g.id = m.group_id
     LEFT JOIN go_bracket_slot bs ON bs.id = m.bracket_slot_id
     WHERE r.tournament_id = $1
     ORDER BY m.match_no ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    matchId: String(row.matchId),
    roundId: String(row.roundId),
    roundNo: asInt(row.roundNo, 0),
    groupId: row.groupId ? String(row.groupId) : null,
    bracketSlotId: row.bracketSlotId ? String(row.bracketSlotId) : null,
    bracketLevel: row.bracketLevel ? String(row.bracketLevel) : null,
    bracketRound: row.bracketRound == null ? null : asInt(row.bracketRound, 0),
    matchNo: asInt(row.matchNo, 0),
    courtNo: row.courtNo == null ? null : asInt(row.courtNo, 0),
    teamAId: row.teamAId ? String(row.teamAId) : null,
    teamBId: row.teamBId ? String(row.teamBId) : null,
    scoreA: asIntArray(row.scoreA),
    scoreB: asIntArray(row.scoreB),
    setsA: asInt(row.setsA, 0),
    setsB: asInt(row.setsB, 0),
    winnerId: row.winnerId ? String(row.winnerId) : null,
    walkover: normalizeWalkover(row.walkover),
    status: normalizeMatchStatus(row.status),
    scheduledAt: row.scheduledAt ? String(row.scheduledAt) : null,
    slotIndex: row.slotIndex == null ? null : asInt(row.slotIndex, 0),
    groupLabel: row.groupLabel ? String(row.groupLabel) : null,
  }));
}

async function loadSlotsTx(client: PoolClient, tournamentId: string): Promise<SlotRow[]> {
  const { rows } = await client.query(
    `SELECT
       bs.id::text AS "slotId",
       bs.round_id::text AS "roundId",
       bs.bracket_level AS "bracketLevel",
       bs.bracket_round AS "bracketRound",
       bs.position,
       bs.team_id::text AS "teamId",
       bs.next_slot_id::text AS "nextSlotId",
       bs.is_bye AS "isBye"
     FROM go_bracket_slot bs
     JOIN go_round r ON r.id = bs.round_id
     WHERE r.tournament_id = $1
     ORDER BY bs.bracket_level ASC, bs.bracket_round ASC, bs.position ASC`,
    [tournamentId],
  );
  return rows.map((row) => ({
    slotId: String(row.slotId),
    roundId: String(row.roundId),
    bracketLevel: String(row.bracketLevel ?? ''),
    bracketRound: asInt(row.bracketRound, 0),
    position: asInt(row.position, 0),
    teamId: row.teamId ? String(row.teamId) : null,
    nextSlotId: row.nextSlotId ? String(row.nextSlotId) : null,
    isBye: Boolean(row.isBye),
  }));
}

function buildSeedDraftView(
  rawSeedDraft: unknown,
  teamMap: Map<string, GoTeamView>,
): Record<string, GoTeamView[]> | null {
  if (!rawSeedDraft || typeof rawSeedDraft !== 'object' || Array.isArray(rawSeedDraft)) return null;
  const result: Record<string, GoTeamView[]> = {};
  for (const [level, value] of Object.entries(rawSeedDraft as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    result[level] = value
      .map((item) => {
        const raw = item as SeedDraftInputTeam & Partial<GoTeamView>;
        const teamId = String(raw.teamId ?? '').trim();
        return teamMap.get(teamId) ?? (teamId && raw.label ? (raw as GoTeamView) : null);
      })
      .filter((item): item is GoTeamView => Boolean(item));
  }
  return Object.keys(result).length ? result : null;
}

async function loadGoAdminBundleTx(client: PoolClient, tournamentId: string): Promise<GoAdminBundle> {
  const tournament = await loadTournamentTx(client, tournamentId);
  const roster = await listRosterParticipants(tournamentId);
  const settings = normalizeGoSettings(tournament.settings, roster.filter((row) => !row.isWaitlist).length);
  const rounds = await loadRoundsTx(client, tournamentId);
  const courts = await loadCourtsTx(client, tournamentId);
  const teamRows = await loadTeamsTx(client, tournamentId);
  const standingsRows = await loadStandingsTx(client, tournamentId);
  const matchRows = await loadMatchesTx(client, tournamentId);
  const slotRows = await loadSlotsTx(client, tournamentId);

  const teamMap = new Map(teamRows.map((row) => [row.teamId, buildTeamView(row)]));
  const standingsByGroup = new Map<string, GoGroupStandingRow[]>();
  standingsRows.forEach((row) => {
    const current = standingsByGroup.get(row.groupId) ?? [];
    current.push(buildStandingRow(row, teamMap.get(row.teamId) ?? null));
    standingsByGroup.set(row.groupId, current);
  });

  const groupsById = new Map<string, GoGroupView>();
  teamRows.forEach((row) => {
    if (!groupsById.has(row.groupId)) {
      groupsById.set(row.groupId, {
        groupId: row.groupId,
        groupNo: row.groupNo,
        label: row.groupLabel,
        status:
          row.groupStatus === 'live' || row.groupStatus === 'finished' ? row.groupStatus : 'pending',
        effectiveTeamCount: 0,
        hasBye: false,
        teams: [],
        standings: standingsByGroup.get(row.groupId) ?? [],
      });
    }
    groupsById.get(row.groupId)?.teams.push(teamMap.get(row.teamId) as GoTeamView);
  });

  const groups = [...groupsById.values()]
    .map((group) => ({
      ...group,
      effectiveTeamCount: group.teams.filter((team) => !team.isBye).length,
      hasBye: group.teams.some((team) => team.isBye),
    }))
    .sort((left, right) => left.groupNo - right.groupNo);
  const matches = matchRows.map((row) => ({
    matchId: row.matchId,
    matchNo: row.matchNo,
    courtNo: row.courtNo,
    teamA: row.teamAId ? teamMap.get(row.teamAId) ?? null : null,
    teamB: row.teamBId ? teamMap.get(row.teamBId) ?? null : null,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    setsA: row.setsA,
    setsB: row.setsB,
    winnerId: row.winnerId,
    walkover: row.walkover,
    status: row.status,
    scheduledAt: row.scheduledAt,
    slotIndex: row.slotIndex,
    groupLabel: row.groupLabel,
    bracketLevel: row.bracketLevel,
    bracketRound: row.bracketRound,
  })) satisfies GoMatchView[];

  const brackets = slotRows.reduce<Record<string, GoBracketSlotView[]>>((acc, row) => {
    if (!acc[row.bracketLevel]) acc[row.bracketLevel] = [];
    acc[row.bracketLevel].push({
      slotId: row.slotId,
      bracketLevel: row.bracketLevel,
      bracketRound: row.bracketRound,
      position: row.position,
      team: row.teamId ? teamMap.get(row.teamId) ?? null : null,
      isBye: row.isBye,
      nextSlotId: row.nextSlotId,
      matchId:
        matchRows.find(
          (match) =>
            match.bracketSlotId === row.slotId &&
            match.bracketLevel === row.bracketLevel &&
            match.bracketRound === row.bracketRound,
        )?.matchId ?? null,
    });
    return acc;
  }, {});

  const r1 = rounds.find((round) => round.roundNo === 1) ?? null;
  const seedDraft = buildSeedDraftView(r1?.seedDraft ?? null, teamMap);
  const stage = buildStage({ rounds, matches: matchRows, seedDraft });
  const r2 = rounds.find((round) => round.roundNo === 2) ?? null;

  return {
    tournament,
    settings,
    rounds,
    courts,
    groups,
    matches,
    brackets,
    seedDraft,
    state: {
      tournamentId,
      stage,
      r1: r1 ? { roundId: r1.roundId, status: r1.status } : null,
      r2: r2 ? { roundId: r2.roundId, status: r2.status } : null,
      groups,
      bracketLevels: settings.enabledPlayoffLeagues.map((value) => String(value)),
      courts: courts.map((row) => ({
        courtNo: row.courtNo,
        label: row.label,
        pinCode: row.pinCode,
      })),
      settings,
    },
  };
}

function buildGoPlayoffSeedDraft(bundle: Pick<GoAdminBundle, 'groups' | 'settings'>): Record<string, GoTeamView[]> {
  const teamById = new Map(
    bundle.groups.flatMap((group) => group.teams.map((team) => [team.teamId, team] as const)),
  );
  const bands = new Map<number, Array<{ team: GoTeamView; row: GoGroupStandingRow }>>();
  for (const group of bundle.groups) {
    for (const row of group.standings) {
      const team = teamById.get(row.teamId);
      if (!team || team.isBye) continue;
      const current = bands.get(row.position) ?? [];
      current.push({ team, row });
      bands.set(row.position, current);
    }
  }

  for (const [position, items] of bands.entries()) {
    bands.set(
      position,
      [...items].sort((left, right) => {
        const rowCompare = compareCrossGroupRows(left.row, right.row);
        if (rowCompare !== 0) return rowCompare;
        if (right.team.ratingSnapshot !== left.team.ratingSnapshot) {
          return right.team.ratingSnapshot - left.team.ratingSnapshot;
        }
        return left.team.teamId.localeCompare(right.team.teamId);
      }),
    );
  }

  const draft: Record<string, GoTeamView[]> = {};
  const sortedPositions = [...bands.keys()].sort((left, right) => left - right);
  for (const league of bundle.settings.enabledPlayoffLeagues) {
    const required = Number(bundle.settings.bracketSizes[league] ?? 0);
    if (!required) continue;
    draft[league] = [];
    let remaining = required;
    for (const position of sortedPositions) {
      const band = bands.get(position) ?? [];
      if (!band.length || remaining <= 0) continue;
      if (band.length <= remaining) {
        draft[league].push(...band.map((item) => item.team));
        bands.set(position, []);
        remaining -= band.length;
      } else {
        draft[league].push(...band.slice(0, remaining).map((item) => item.team));
        bands.set(position, band.slice(remaining));
        remaining = 0;
      }
    }
  }
  return draft;
}

function normalizeSeedFromBundle(
  seedDraft: Record<string, GoTeamView[]> | null,
  teamMap: Map<string, GoTeamView>,
  requestedDraft: unknown,
  settings: GoAdminSettings,
): Record<string, string[]> {
  const levels = settings.enabledPlayoffLeagues.map((value) => String(value));
  const source = buildSeedDraftView(requestedDraft, teamMap) ?? seedDraft;
  if (!source) throw new GoNextError(400, 'Seed draft is not available');

  const normalized: Record<string, string[]> = {};
  for (const level of levels) {
    const teams = source[level] ?? [];
    if (!teams.length) continue;
    normalized[level] = teams.map((team) => team.teamId).filter(Boolean);
  }
  if (!Object.keys(normalized).length) {
    throw new GoNextError(400, 'Seed draft is empty');
  }
  return normalized;
}

async function recalcGroupStandingsTx(client: PoolClient, groupId: string, settings: GoAdminSettings): Promise<void> {
  const teamRes = await client.query(
    `SELECT id::text AS id
     FROM go_team
     WHERE group_id = $1
       AND COALESCE(is_bye, false) = false
     ORDER BY team_idx ASC`,
    [groupId],
  );
  const teamIds = teamRes.rows.map((row) => String(row.id));
  const matchRes = await client.query(
    `SELECT
       id::text AS id,
       team_a_id::text AS "teamAId",
       team_b_id::text AS "teamBId",
       sets_a AS "setsA",
       sets_b AS "setsB",
       COALESCE(score_a, '{}') AS "scoreA",
       COALESCE(score_b, '{}') AS "scoreB",
       walkover
     FROM go_match
     WHERE group_id = $1
       AND status = 'finished'
     ORDER BY match_no ASC`,
    [groupId],
  );

  const finishedMatches = matchRes.rows.map((row) => ({
    matchId: String(row.id),
    teamAId: String(row.teamAId ?? ''),
    teamBId: String(row.teamBId ?? ''),
    setsA: asInt(row.setsA, 0),
    setsB: asInt(row.setsB, 0),
    scoreA: asIntArray(row.scoreA),
    scoreB: asIntArray(row.scoreB),
    walkover: normalizeWalkover(row.walkover),
  })) satisfies GoMatchResult[];

  const standings = calculateStandings(finishedMatches, teamIds, {
    matchPointSystem: settings.matchPointSystem,
    tieBreakerLogic: settings.tieBreakerLogic,
  });

  await client.query(`DELETE FROM go_group_standing WHERE group_id = $1`, [groupId]);
  for (const row of standings) {
    await client.query(
      `INSERT INTO go_group_standing (
         group_id, team_id, played, wins, losses, match_points,
         sets_won, sets_lost, points_for, points_against, position
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        groupId,
        row.teamId,
        row.played,
        row.wins,
        row.losses,
        row.matchPoints,
        row.setsWon,
        row.setsLost,
        row.pointsFor,
        row.pointsAgainst,
        row.position,
      ],
    );
  }
}

function validateSubmittedScore(
  settings: GoAdminSettings,
  scoreA: number[],
  scoreB: number[],
  isBracket: boolean,
): { scoreA: number[]; scoreB: number[]; setsA: number; setsB: number; winnerSide: 'A' | 'B' } {
  const limit = isBracket ? settings.pointLimitBracket : settings.pointLimitGroup;
  const normalizedA = scoreA.map((value) => Math.max(0, asInt(value, 0)));
  const normalizedB = scoreB.map((value) => Math.max(0, asInt(value, 0)));

  if (settings.matchFormat === 'single15' || settings.matchFormat === 'single21') {
    const a = normalizedA[0] ?? 0;
    const b = normalizedB[0] ?? 0;
    if (a === b) throw new GoNextError(400, 'Draw scores are not allowed');
    if (Math.max(a, b) < limit || Math.abs(a - b) < 2) {
      throw new GoNextError(400, `Set must reach ${limit} points with a 2-point margin`);
    }
    return {
      scoreA: [a],
      scoreB: [b],
      setsA: a > b ? 1 : 0,
      setsB: b > a ? 1 : 0,
      winnerSide: a > b ? 'A' : 'B',
    };
  }

  const length = Math.max(normalizedA.length, normalizedB.length);
  if (length < 2 || length > 3) {
    throw new GoNextError(400, 'Best-of-3 requires 2 or 3 completed sets');
  }

  let setsA = 0;
  let setsB = 0;
  const finalA: number[] = [];
  const finalB: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const a = normalizedA[index] ?? 0;
    const b = normalizedB[index] ?? 0;
    if (a === b) throw new GoNextError(400, 'Each set must have a winner');
    if (Math.max(a, b) < limit || Math.abs(a - b) < 2) {
      throw new GoNextError(400, `Set ${index + 1} must reach ${limit} points with a 2-point margin`);
    }
    finalA.push(a);
    finalB.push(b);
    if (a > b) setsA += 1;
    if (b > a) setsB += 1;
    if ((setsA === 2 || setsB === 2) && index !== length - 1) {
      throw new GoNextError(400, 'Extra sets are not allowed after the winner is decided');
    }
  }
  if (setsA !== 2 && setsB !== 2) {
    throw new GoNextError(400, 'Best-of-3 match requires two winning sets');
  }

  return {
    scoreA: finalA,
    scoreB: finalB,
    setsA,
    setsB,
    winnerSide: setsA > setsB ? 'A' : 'B',
  };
}

async function createBracketMatchIfReadyTx(
  client: PoolClient,
  roundId: string,
  bracketLevel: string,
  bracketRound: number,
  leftSlotId: string,
  settings: GoAdminSettings,
): Promise<void> {
  const pairRes = await client.query(
    `SELECT id::text AS id, position, team_id::text AS "teamId"
     FROM go_bracket_slot
     WHERE round_id = $1
       AND bracket_level = $2
       AND bracket_round = $3
       AND position IN (
         (SELECT position FROM go_bracket_slot WHERE id = $4),
         (SELECT CASE WHEN position % 2 = 0 THEN position - 1 ELSE position + 1 END FROM go_bracket_slot WHERE id = $4)
       )
     ORDER BY position ASC`,
    [roundId, bracketLevel, bracketRound, leftSlotId],
  );
  if (pairRes.rows.length < 2) return;
  const left = pairRes.rows[0];
  const right = pairRes.rows[1];

  const existing = await client.query(`SELECT id FROM go_match WHERE bracket_slot_id = $1 LIMIT 1`, [String(left.id)]);
  if (existing.rowCount || !left.teamId || !right.teamId) return;

  const matchNoRes = await client.query(`SELECT COALESCE(MAX(match_no), 0) + 1 AS next_no FROM go_match WHERE round_id = $1`, [
    roundId,
  ]);
  const matchNo = asInt(matchNoRes.rows[0]?.next_no, 1);
  const courtNo = ((matchNo - 1) % Math.max(1, settings.courts)) + 1;
  await client.query(
    `INSERT INTO go_match (
       round_id, bracket_slot_id, bracket_level, match_no, court_no, team_a_id, team_b_id, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
    [roundId, String(left.id), bracketLevel, matchNo, courtNo, String(left.teamId), String(right.teamId)],
  );
}

async function advanceWinnerTx(client: PoolClient, matchId: string, settings: GoAdminSettings): Promise<void> {
  const res = await client.query(
    `SELECT
       m.id::text AS "matchId",
       m.winner_id::text AS "winnerId",
       bs.next_slot_id::text AS "nextSlotId"
     FROM go_match m
     JOIN go_bracket_slot bs ON bs.id = m.bracket_slot_id
     WHERE m.id = $1`,
    [matchId],
  );
  const row = res.rows[0];
  if (!row?.winnerId || !row?.nextSlotId) return;

  await client.query(`UPDATE go_bracket_slot SET team_id = $2 WHERE id = $1`, [
    String(row.nextSlotId),
    String(row.winnerId),
  ]);

  const nextSlotRes = await client.query(
    `SELECT id::text AS id, round_id::text AS "roundId", bracket_level AS "bracketLevel", bracket_round AS "bracketRound", position
     FROM go_bracket_slot
     WHERE id = $1`,
    [String(row.nextSlotId)],
  );
  const nextSlot = nextSlotRes.rows[0];
  if (!nextSlot) return;
  const leftPosition = asInt(nextSlot.position, 0) % 2 === 0 ? asInt(nextSlot.position, 0) - 1 : asInt(nextSlot.position, 0);
  const leftSlotRes = await client.query(
    `SELECT id::text AS id
     FROM go_bracket_slot
     WHERE round_id = $1
       AND bracket_level = $2
       AND bracket_round = $3
       AND position = $4`,
    [String(nextSlot.roundId), String(nextSlot.bracketLevel), asInt(nextSlot.bracketRound, 0), leftPosition],
  );
  const leftSlotId = String(leftSlotRes.rows[0]?.id ?? '');
  if (leftSlotId) {
    await createBracketMatchIfReadyTx(
      client,
      String(nextSlot.roundId),
      String(nextSlot.bracketLevel),
      asInt(nextSlot.bracketRound, 0),
      leftSlotId,
      settings,
    );
  }
}

async function refreshRoundStatusTx(client: PoolClient, roundId: string): Promise<void> {
  const summary = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'finished') AS finished_count,
       COUNT(*) FILTER (WHERE status IN ('pending', 'live')) AS open_count
     FROM go_match
     WHERE round_id = $1`,
    [roundId],
  );
  const finishedCount = asInt(summary.rows[0]?.finished_count, 0);
  const openCount = asInt(summary.rows[0]?.open_count, 0);
  const nextStatus =
    openCount === 0 && finishedCount > 0 ? 'finished' : finishedCount > 0 || openCount > 0 ? 'live' : 'pending';
  await client.query(`UPDATE go_round SET status = $2 WHERE id = $1`, [roundId, nextStatus]);
}

async function bootstrapGroupsTx(client: PoolClient, tournamentId: string, seed?: number): Promise<void> {
  const tournament = await loadTournamentTx(client, tournamentId, { lock: true });
  const roster = await loadRosterSourcesTx(client, tournamentId);
  const settings = normalizeGoSettings(tournament.settings, roster.length);
  const validationError = validateGoSetup(settings, roster.length);
  if (validationError) throw new GoNextError(400, validationError);

  await clearGoStateTx(client, tournamentId);

  const normalizedSeed = Number.isFinite(seed ?? NaN) ? Math.max(1, asInt(seed, 1)) : 1;
  const roundRes = await client.query(
    `INSERT INTO go_round (tournament_id, round_no, status, seed, finalized_settings)
     VALUES ($1, 1, 'pending', $2, $3)
     RETURNING id::text AS id`,
    [tournamentId, normalizedSeed, JSON.stringify(settings)],
  );
  const roundId = String(roundRes.rows[0]?.id ?? '');

  for (let courtNo = 1; courtNo <= settings.courts; courtNo += 1) {
    await client.query(
      `INSERT INTO go_court (tournament_id, court_no, label, pin_code)
       VALUES ($1, $2, $3, $4)`,
      [tournamentId, courtNo, `Court ${courtNo}`, buildGoCourtPin(tournamentId, courtNo)],
    );
  }

  // Create 8 player slots per court (locked to gender format at bootstrap time)
  const genderFormat = settings.teamGenderFormat ?? 'mixed';
  await initGoCourtSlots(client, tournamentId, genderFormat);

  const pairings = [];
  for (let index = 0; index < roster.length; index += 2) {
    const left = roster[index];
    const right = roster[index + 1] ?? null;
    const pairError = validatePairComposition(tournament.division, left, right);
    if (pairError) throw new GoNextError(400, pairError);
    pairings.push({
      tempId: `seed-${index / 2 + 1}`,
      player1: left,
      player2: right,
      initialBucket: deriveGoBucket(left, right),
      order: index / 2,
      ratingSnapshot:
        ratingForRosterPlayer(left, tournament.division) + (right ? ratingForRosterPlayer(right, tournament.division) : 0),
    });
  }

  const groupedTeams = buildBalancedGoGroups(
    pairings.map((team) => ({
      teamId: team.tempId,
      rating: team.ratingSnapshot,
      initialBucket: team.initialBucket,
      order: team.order,
    })),
    {
      groupFormula: settings.groupFormula,
      seedingMode: settings.seedingMode,
      seed: normalizedSeed,
    },
  );

  const pairingByTempId = new Map(pairings.map((team) => [team.tempId, team] as const));
  const startAtIso = buildStartDateTime(tournament, settings);
  const plannedMatches: Array<{
    matchKey: string;
    groupId: string;
    phase: number;
    source: 'fixed' | 'winners' | 'losers';
    matchNo: number;
    teamAId: string | null;
    teamBId: string | null;
  }> = [];
  let matchNo = 1;

  for (let groupIndex = 0; groupIndex < groupedTeams.length; groupIndex += 1) {
    const groupNo = groupIndex + 1;
    const label = String.fromCharCode(65 + groupIndex);
    const groupRes = await client.query(
      `INSERT INTO go_group (round_id, group_no, label, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id::text AS id`,
      [roundId, groupNo, label],
    );
    const groupId = String(groupRes.rows[0]?.id ?? '');
    const groupTeams = groupedTeams[groupIndex].map((seeded, seededIndex) => {
      const team = pairingByTempId.get(seeded.teamId);
      if (!team) {
        return {
          teamIdx: seededIndex + 1,
          seed: null,
          isBye: true,
          initialBucket: 'lite' as const,
          player1: null,
          player2: null,
          ratingSnapshot: 0,
        };
      }
      return {
        ...team,
        teamIdx: seededIndex + 1,
        seed: seededIndex + 1,
        isBye: false,
      };
    });

    const teamIdByIndex = new Map<number, string>();
    for (const team of groupTeams) {
      const teamRes = await client.query(
        `INSERT INTO go_team (
           group_id, team_idx, seed, player1_id, player2_id, rating_snapshot, initial_bucket, is_bye
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id::text AS id`,
        [
          groupId,
          team.teamIdx,
          team.seed,
          team.isBye ? null : team.player1?.playerId ?? null,
          team.isBye ? null : team.player2?.playerId ?? null,
          team.ratingSnapshot,
          team.initialBucket,
          team.isBye,
        ],
      );
      const teamId = String(teamRes.rows[0]?.id ?? '');
      teamIdByIndex.set(team.teamIdx - 1, teamId);
      if (!team.isBye) {
        await client.query(
          `INSERT INTO go_group_standing (
             group_id, team_id, played, wins, losses, match_points,
             sets_won, sets_lost, points_for, points_against, position
           )
           VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, NULL)`,
          [groupId, teamId],
        );
      }
    }

    const realTeamIndexes = groupTeams
      .map((team, index) => ({ index, isBye: team.isBye }))
      .filter((team) => !team.isBye)
      .map((team) => team.index);
    const schedule = generateGroupSchedule(realTeamIndexes.length, settings.matchFormat);
    for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex += 1) {
      const item = schedule[scheduleIndex];
      const teamAGroupIndex = item.teamAIndex == null ? null : realTeamIndexes[item.teamAIndex] ?? null;
      const teamBGroupIndex = item.teamBIndex == null ? null : realTeamIndexes[item.teamBIndex] ?? null;
      plannedMatches.push({
        matchKey: `${groupId}:${scheduleIndex + 1}`,
        groupId,
        phase: item.phase,
        source: item.source,
        matchNo,
        teamAId: teamAGroupIndex == null ? null : teamIdByIndex.get(teamAGroupIndex) ?? null,
        teamBId: teamBGroupIndex == null ? null : teamIdByIndex.get(teamBGroupIndex) ?? null,
      });
      matchNo += 1;
    }
  }

  const scheduledSlots = buildCourtSchedule(
    plannedMatches.map((match) => ({
      matchKey: match.matchKey,
      phase: match.phase,
      groupKey: match.groupId,
      teamIds: [match.teamAId, match.teamBId].filter((value): value is string => Boolean(value)),
    })),
    settings.courts,
    startAtIso,
    settings.slotMinutes,
  );
  const scheduleByKey = new Map(scheduledSlots.map((slot) => [slot.matchKey, slot] as const));
  for (const planned of plannedMatches) {
    const slot = scheduleByKey.get(planned.matchKey) ?? null;
    await client.query(
      `INSERT INTO go_match (
         round_id, group_id, match_no, court_no, team_a_id, team_b_id, status, scheduled_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::timestamptz)`,
      [
        roundId,
        planned.groupId,
        planned.matchNo,
        slot?.courtNo ?? null,
        planned.teamAId,
        planned.teamBId,
        slot?.scheduledAt ?? null,
      ],
    );
  }

  await persistTournamentSettingsTx(client, tournament, {
    goJudgeBootstrapSignature: buildGoStructuralSignature(settings, roster.length),
  });
}

async function previewBracketSeedTx(client: PoolClient, tournamentId: string): Promise<void> {
  const bundle = await loadGoAdminBundleTx(client, tournamentId);
  if (!bundle.state.r1) throw new GoNextError(400, 'Groups are not initialized');
  if (bundle.matches.some((match) => match.groupLabel && match.status !== 'finished')) {
    throw new GoNextError(400, 'Finish all group matches before building the bracket preview');
  }

  const draft = buildGoPlayoffSeedDraft(bundle);

  const r1 = bundle.rounds.find((round) => round.roundNo === 1);
  if (!r1) throw new GoNextError(400, 'R1 not found');
  await client.query(`UPDATE go_round SET seed_draft = $2::jsonb WHERE id = $1`, [r1.roundId, JSON.stringify(draft)]);
}

async function confirmBracketSeedTx(client: PoolClient, tournamentId: string, requestedDraft?: unknown): Promise<void> {
  const bundle = await loadGoAdminBundleTx(client, tournamentId);
  const teamMap = new Map(bundle.groups.flatMap((group) => group.teams.map((team) => [team.teamId, team] as const)));
  const normalizedDraft = normalizeSeedFromBundle(bundle.seedDraft, teamMap, requestedDraft, bundle.settings);
  const r1 = bundle.rounds.find((round) => round.roundNo === 1);
  if (!r1) throw new GoNextError(400, 'R1 not found');

  let r2 = bundle.rounds.find((round) => round.roundNo === 2) ?? null;
  if (r2) {
    const r2MatchStatus = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'finished') AS finished_count FROM go_match WHERE round_id = $1`,
      [r2.roundId],
    );
    if (asInt(r2MatchStatus.rows[0]?.finished_count, 0) > 0) {
      throw new GoNextError(400, 'Cannot rebuild bracket after bracket matches are finished');
    }
    await client.query(`DELETE FROM go_match WHERE round_id = $1`, [r2.roundId]);
    await client.query(`DELETE FROM go_bracket_slot WHERE round_id = $1`, [r2.roundId]);
  } else {
    const roundRes = await client.query(
      `INSERT INTO go_round (tournament_id, round_no, status, seed)
       VALUES ($1, 2, 'pending', $2)
       RETURNING id::text AS id`,
      [tournamentId, r1.seed],
    );
    r2 = {
      roundId: String(roundRes.rows[0]?.id ?? ''),
      roundNo: 2,
      status: 'pending',
      seed: r1.seed,
      seedDraft: null,
    };
  }

  await client.query(`UPDATE go_round SET seed_draft = $2::jsonb WHERE id = $1`, [
    r1.roundId,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(normalizedDraft).map(([level, teamIds]) => [
          level,
          teamIds.map((teamId) => teamMap.get(teamId)).filter(Boolean),
        ]),
      ),
    ),
  ]);

  const slotIdByKey = new Map<string, string>();
  const plannedLinks: Array<{ key: string; nextKey: string }> = [];
  const bracketSeeds = generateBracketSlots(
    Object.fromEntries(
      Object.entries(normalizedDraft).map(([level, teamIds]) => [
        level,
        teamIds.map((teamId, index) => ({
          teamId,
          seedQuality: teamIds.length - index,
        })),
      ]),
    ),
    Object.fromEntries(
      bundle.settings.enabledPlayoffLeagues.map((league) => [league, Number(bundle.settings.bracketSizes[league] ?? 0)]),
    ),
  );

  for (const seed of bracketSeeds) {
    for (const slot of seed.slots) {
      const insertRes = await client.query(
        `INSERT INTO go_bracket_slot (
           round_id, bracket_level, bracket_round, position, team_id, is_bye
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id::text AS id`,
        [r2.roundId, seed.level, slot.bracketRound, slot.position, slot.teamId, slot.isBye],
      );
      const key = `${seed.level}:${slot.bracketRound}:${slot.position}`;
      slotIdByKey.set(key, String(insertRes.rows[0]?.id ?? ''));
      if (slot.nextSlotPosition) {
        plannedLinks.push({
          key,
          nextKey: `${seed.level}:${slot.nextSlotPosition.round}:${slot.nextSlotPosition.position}`,
        });
      }
    }
  }

  for (const link of plannedLinks) {
    const slotId = slotIdByKey.get(link.key);
    const nextSlotId = slotIdByKey.get(link.nextKey);
    if (!slotId || !nextSlotId) continue;
    await client.query(`UPDATE go_bracket_slot SET next_slot_id = $2 WHERE id = $1`, [slotId, nextSlotId]);
  }
}

async function bootstrapBracketTx(client: PoolClient, tournamentId: string): Promise<void> {
  const bundle = await loadGoAdminBundleTx(client, tournamentId);
  const r2 = bundle.rounds.find((round) => round.roundNo === 2);
  if (!r2) throw new GoNextError(400, 'Bracket is not confirmed yet');

  const existingMatches = await client.query(`SELECT COUNT(*) AS count FROM go_match WHERE round_id = $1`, [r2.roundId]);
  if (asInt(existingMatches.rows[0]?.count, 0) > 0) {
    throw new GoNextError(400, 'Bracket matches are already created');
  }

  const slotsRes = await client.query(
    `SELECT id::text AS id, bracket_level AS "bracketLevel", position, team_id::text AS "teamId"
     FROM go_bracket_slot
     WHERE round_id = $1
       AND bracket_round = 1
     ORDER BY bracket_level ASC, position ASC`,
    [r2.roundId],
  );

  let matchNo = 1;
  const autoAdvanceMatchIds: string[] = [];
  const byLevel = new Map<string, Array<{ id: string; position: number; teamId: string | null }>>();
  slotsRes.rows.forEach((row) => {
    const level = String(row.bracketLevel ?? '');
    const list = byLevel.get(level) ?? [];
    list.push({
      id: String(row.id),
      position: asInt(row.position, 0),
      teamId: row.teamId ? String(row.teamId) : null,
    });
    byLevel.set(level, list);
  });

  for (const [level, slots] of byLevel.entries()) {
    const ordered = [...slots].sort((left, right) => left.position - right.position);
    for (let index = 0; index < ordered.length; index += 2) {
      const left = ordered[index];
      const right = ordered[index + 1];
      if (!left || !right) continue;
      const courtNo = ((matchNo - 1) % Math.max(1, bundle.settings.courts)) + 1;
      if (!left.teamId && !right.teamId) continue;

      if (left.teamId && right.teamId) {
        await client.query(
          `INSERT INTO go_match (
             round_id, bracket_slot_id, bracket_level, match_no, court_no, team_a_id, team_b_id, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
          [r2.roundId, left.id, level, matchNo, courtNo, left.teamId, right.teamId],
        );
      } else {
        const winnerId = left.teamId ?? right.teamId ?? null;
        const walkover = left.teamId ? 'team_b' : 'team_a';
        const insertRes = await client.query(
          `INSERT INTO go_match (
             round_id, bracket_slot_id, bracket_level, match_no, court_no,
             team_a_id, team_b_id, sets_a, sets_b, winner_id, walkover, status, finished_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'finished', now())
           RETURNING id::text AS id`,
          [
            r2.roundId,
            left.id,
            level,
            matchNo,
            courtNo,
            left.teamId,
            right.teamId,
            left.teamId ? 2 : 0,
            right.teamId ? 2 : 0,
            winnerId,
            walkover,
          ],
        );
        autoAdvanceMatchIds.push(String(insertRes.rows[0]?.id ?? ''));
      }
      matchNo += 1;
    }
  }

  for (const matchId of autoAdvanceMatchIds) {
    await advanceWinnerTx(client, matchId, bundle.settings);
  }
  await refreshRoundStatusTx(client, r2.roundId);
}

async function finishBracketTx(client: PoolClient, tournamentId: string): Promise<void> {
  const rounds = await loadRoundsTx(client, tournamentId);
  const r2 = rounds.find((round) => round.roundNo === 2);
  if (!r2) throw new GoNextError(400, 'Bracket is not initialized');
  const res = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'live')) AS open_count
     FROM go_match
     WHERE round_id = $1`,
    [r2.roundId],
  );
  if (asInt(res.rows[0]?.open_count, 0) > 0) {
    throw new GoNextError(400, 'Finish all bracket matches before completing the bracket stage');
  }
  await client.query(`UPDATE go_round SET status = 'finished' WHERE id = $1`, [r2.roundId]);
}

async function rollbackStageTx(client: PoolClient, tournamentId: string): Promise<void> {
  const rounds = await loadRoundsTx(client, tournamentId);
  const r2 = rounds.find((round) => round.roundNo === 2) ?? null;
  if (r2) {
    const finishedRes = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'finished') AS finished_count
       FROM go_match
       WHERE round_id = $1`,
      [r2.roundId],
    );
    if (asInt(finishedRes.rows[0]?.finished_count, 0) > 0) {
      throw new GoNextError(400, 'Cannot rollback after bracket results are confirmed');
    }
    await client.query(`DELETE FROM go_round WHERE id = $1`, [r2.roundId]);
    return;
  }

  const r1 = rounds.find((round) => round.roundNo === 1) ?? null;
  if (!r1) throw new GoNextError(400, 'Nothing to rollback');
  const finishedRes = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'finished') AS finished_count
     FROM go_match
     WHERE round_id = $1`,
    [r1.roundId],
  );
  if (asInt(finishedRes.rows[0]?.finished_count, 0) > 0) {
    throw new GoNextError(400, 'Cannot rollback after group scores are confirmed');
  }
  await clearGoStateTx(client, tournamentId);
}

async function updateGroupStatusTx(client: PoolClient, groupId: string): Promise<void> {
  const res = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'live')) AS open_count
     FROM go_match
     WHERE group_id = $1`,
    [groupId],
  );
  const openCount = asInt(res.rows[0]?.open_count, 0);
  await client.query(`UPDATE go_group SET status = $2 WHERE id = $1`, [groupId, openCount === 0 ? 'finished' : 'live']);
}

async function hydrateBo3GroupFollowupsTx(
  client: PoolClient,
  groupId: string,
  settings: GoAdminSettings,
): Promise<void> {
  if (settings.matchFormat !== 'bo3') return;
  const teamCountRes = await client.query(
    `SELECT COUNT(*) FILTER (WHERE COALESCE(is_bye, false) = false) AS real_count
     FROM go_team
     WHERE group_id = $1`,
    [groupId],
  );
  if (asInt(teamCountRes.rows[0]?.real_count, 0) !== 4) return;

  const matchRes = await client.query(
    `SELECT id::text AS id, match_no AS "matchNo", team_a_id::text AS "teamAId", team_b_id::text AS "teamBId",
            winner_id::text AS "winnerId", status
     FROM go_match
     WHERE group_id = $1
     ORDER BY match_no ASC`,
    [groupId],
  );
  if ((matchRes.rowCount ?? 0) < 4) return;
  const fixedA = matchRes.rows[0];
  const fixedB = matchRes.rows[1];
  if (!fixedA?.winnerId || !fixedB?.winnerId) return;

  const loserA =
    String(fixedA.winnerId) === String(fixedA.teamAId ?? '') ? String(fixedA.teamBId ?? '') : String(fixedA.teamAId ?? '');
  const loserB =
    String(fixedB.winnerId) === String(fixedB.teamAId ?? '') ? String(fixedB.teamBId ?? '') : String(fixedB.teamAId ?? '');

  const winnerMatch = matchRes.rows[2];
  const loserMatch = matchRes.rows[3];
  if (winnerMatch && !winnerMatch.teamAId && !winnerMatch.teamBId) {
    await client.query(`UPDATE go_match SET team_a_id = $2, team_b_id = $3 WHERE id = $1`, [
      String(winnerMatch.id),
      String(fixedA.winnerId),
      String(fixedB.winnerId),
    ]);
  }
  if (loserMatch && !loserMatch.teamAId && !loserMatch.teamBId) {
    await client.query(`UPDATE go_match SET team_a_id = $2, team_b_id = $3 WHERE id = $1`, [
      String(loserMatch.id),
      loserA || null,
      loserB || null,
    ]);
  }
}

async function applyMatchResultTx(
  client: PoolClient,
  matchId: string,
  updates: {
    scoreA: number[];
    scoreB: number[];
    setsA: number;
    setsB: number;
    winnerId: string | null;
    walkover: GoWalkover;
  },
): Promise<MatchRow> {
  const res = await client.query(
    `UPDATE go_match
     SET
       score_a = $2::int[],
       score_b = $3::int[],
       sets_a = $4,
       sets_b = $5,
       winner_id = $6,
       walkover = $7,
       status = 'finished',
       finished_at = now()
     WHERE id = $1
     RETURNING
       id::text AS "matchId",
       round_id::text AS "roundId",
       (SELECT round_no FROM go_round WHERE id = go_match.round_id) AS "roundNo",
       group_id::text AS "groupId",
       bracket_slot_id::text AS "bracketSlotId",
       bracket_level AS "bracketLevel",
       (SELECT bracket_round FROM go_bracket_slot WHERE id = go_match.bracket_slot_id) AS "bracketRound",
       match_no AS "matchNo",
       court_no AS "courtNo",
       team_a_id::text AS "teamAId",
       team_b_id::text AS "teamBId",
       score_a AS "scoreA",
       score_b AS "scoreB",
       sets_a AS "setsA",
       sets_b AS "setsB",
       winner_id::text AS "winnerId",
       walkover,
       status,
       to_char(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAt",
       (SELECT label FROM go_group WHERE id = go_match.group_id) AS "groupLabel"`,
    [
      matchId,
      updates.scoreA,
      updates.scoreB,
      updates.setsA,
      updates.setsB,
      updates.winnerId,
      updates.walkover,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new GoNextError(404, 'Match not found');
  return {
    matchId: String(row.matchId),
    roundId: String(row.roundId),
    roundNo: asInt(row.roundNo, 0),
    groupId: row.groupId ? String(row.groupId) : null,
    bracketSlotId: row.bracketSlotId ? String(row.bracketSlotId) : null,
    bracketLevel: row.bracketLevel ? String(row.bracketLevel) : null,
    bracketRound: row.bracketRound == null ? null : asInt(row.bracketRound, 0),
    matchNo: asInt(row.matchNo, 0),
    courtNo: row.courtNo == null ? null : asInt(row.courtNo, 0),
    teamAId: row.teamAId ? String(row.teamAId) : null,
    teamBId: row.teamBId ? String(row.teamBId) : null,
    scoreA: asIntArray(row.scoreA),
    scoreB: asIntArray(row.scoreB),
    setsA: asInt(row.setsA, 0),
    setsB: asInt(row.setsB, 0),
    winnerId: row.winnerId ? String(row.winnerId) : null,
    walkover: normalizeWalkover(row.walkover),
    status: normalizeMatchStatus(row.status),
    scheduledAt: row.scheduledAt ? String(row.scheduledAt) : null,
    slotIndex: null,
    groupLabel: row.groupLabel ? String(row.groupLabel) : null,
  };
}

async function resolveJudgeMatchTx(client: PoolClient, pin: string, matchId: string): Promise<{
  tournamentId: string;
  settings: GoAdminSettings;
  match: MatchRow;
}> {
  const tournamentRes = await client.query(
    `SELECT
       t.id::text AS id,
       t.settings
     FROM go_court c
     JOIN tournaments t ON t.id = c.tournament_id
     WHERE UPPER(c.pin_code) = $1
     LIMIT 1`,
    [String(pin || '').trim().toUpperCase()],
  );
  const tournamentRow = tournamentRes.rows[0];
  if (!tournamentRow) throw new GoNextError(404, 'Judge PIN not found');
  const settings = normalizeGoSettings(
    tournamentRow.settings && typeof tournamentRow.settings === 'object' && !Array.isArray(tournamentRow.settings)
      ? (tournamentRow.settings as Record<string, unknown>)
      : {},
  );

  const matchRes = await client.query(
    `SELECT
       m.id::text AS "matchId",
       m.round_id::text AS "roundId",
       (SELECT round_no FROM go_round WHERE id = m.round_id) AS "roundNo",
       m.group_id::text AS "groupId",
       m.bracket_slot_id::text AS "bracketSlotId",
       m.bracket_level AS "bracketLevel",
       (SELECT bracket_round FROM go_bracket_slot WHERE id = m.bracket_slot_id) AS "bracketRound",
       m.match_no AS "matchNo",
       m.court_no AS "courtNo",
       m.team_a_id::text AS "teamAId",
       m.team_b_id::text AS "teamBId",
       COALESCE(m.score_a, '{}') AS "scoreA",
       COALESCE(m.score_b, '{}') AS "scoreB",
       m.sets_a AS "setsA",
       m.sets_b AS "setsB",
       m.winner_id::text AS "winnerId",
       m.walkover,
       m.status,
       m.judge_state AS "judgeState",
       m.judge_history AS "judgeHistory",
       m.judge_version AS "judgeVersion",
       to_char(m.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAt",
       CASE
         WHEN m.scheduled_at IS NULL THEN NULL
         ELSE DENSE_RANK() OVER (ORDER BY m.scheduled_at ASC)
       END AS "slotIndex",
       (SELECT label FROM go_group WHERE id = m.group_id) AS "groupLabel"
     FROM go_match m
     JOIN go_round r ON r.id = m.round_id
     WHERE m.id = $1
       AND r.tournament_id = $2`,
    [matchId, String(tournamentRow.id)],
  );
  const row = matchRes.rows[0];
  if (!row) throw new GoNextError(404, 'Match not found');

  return {
    tournamentId: String(tournamentRow.id),
    settings,
    match: {
      matchId: String(row.matchId),
      roundId: String(row.roundId),
      roundNo: asInt(row.roundNo, 0),
      groupId: row.groupId ? String(row.groupId) : null,
      bracketSlotId: row.bracketSlotId ? String(row.bracketSlotId) : null,
      bracketLevel: row.bracketLevel ? String(row.bracketLevel) : null,
      bracketRound: row.bracketRound == null ? null : asInt(row.bracketRound, 0),
      matchNo: asInt(row.matchNo, 0),
      courtNo: row.courtNo == null ? null : asInt(row.courtNo, 0),
      teamAId: row.teamAId ? String(row.teamAId) : null,
      teamBId: row.teamBId ? String(row.teamBId) : null,
      scoreA: asIntArray(row.scoreA),
      scoreB: asIntArray(row.scoreB),
      setsA: asInt(row.setsA, 0),
      setsB: asInt(row.setsB, 0),
      winnerId: row.winnerId ? String(row.winnerId) : null,
      walkover: normalizeWalkover(row.walkover),
      status: normalizeMatchStatus(row.status),
      judgeState: row.judgeState,
      judgeHistory: row.judgeHistory,
      judgeVersion: asInt(row.judgeVersion, 0),
      scheduledAt: row.scheduledAt ? String(row.scheduledAt) : null,
      slotIndex: row.slotIndex == null ? null : asInt(row.slotIndex, 0),
      groupLabel: row.groupLabel ? String(row.groupLabel) : null,
    },
  };
}

export async function getGoAdminBundle(tournamentId: string): Promise<GoAdminBundle> {
  requireDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await loadGoAdminBundleTx(client, String(tournamentId || '').trim());
  } finally {
    client.release();
  }
}

export async function getGoOperatorState(tournamentId: string): Promise<GoOperatorState> {
  const bundle = await getGoAdminBundle(tournamentId);
  return bundle.state;
}

export async function getGoSpectatorPayload(tournamentId: string): Promise<GoSpectatorPayload> {
  const bundle = await getGoAdminBundle(tournamentId);
  return {
    tournamentId: bundle.tournament.id,
    tournamentName: bundle.tournament.name,
    stage: bundle.state.stage,
    groups: bundle.groups,
    brackets: bundle.brackets,
    liveMatches: bundle.matches.filter((match) => match.status !== 'finished' && match.courtNo != null),
  };
}

export async function getGoJudgeSnapshotByPin(pin: string): Promise<GoJudgeSnapshot> {
  requireDatabase();
  const normalizedPin = String(pin || '').trim().toUpperCase();
  if (!normalizedPin) throw new GoNextError(400, 'Judge PIN is required');

  const pool = getPool();
  const client = await pool.connect();
  try {
    const tournamentRes = await client.query(
      `SELECT tournament_id::text AS "tournamentId", court_no AS "courtNo"
       FROM go_court
       WHERE UPPER(pin_code) = $1
       LIMIT 1`,
      [normalizedPin],
    );
    const row = tournamentRes.rows[0];
    if (!row) throw new GoNextError(404, 'Judge PIN not found');

    const bundle = await loadGoAdminBundleTx(client, String(row.tournamentId));
    const judgeMetaRes = await client.query(
      `SELECT m.id::text AS "matchId", m.judge_state AS "judgeState", m.judge_version AS "judgeVersion"
       FROM go_match m
       JOIN go_round r ON r.id = m.round_id
       WHERE r.tournament_id = $1`,
      [String(row.tournamentId)],
    );
    const judgeMetaByMatch = new Map<
      string,
      {
        judgeState: unknown;
        judgeVersion: number;
      }
    >();
    for (const item of judgeMetaRes.rows) {
      judgeMetaByMatch.set(String(item.matchId), {
        judgeState: item.judgeState,
        judgeVersion: asInt(item.judgeVersion, 0),
      });
    }
    const courts: GoJudgeCourtView[] = bundle.courts.map((court) => {
      const courtMatches = bundle.matches.filter((match) => match.courtNo === court.courtNo);
      const mappedMatches: GoJudgeMatchView[] = courtMatches.map((match) => {
        const baseMatch: MatchRow = {
          matchId: match.matchId,
          roundId: '',
          roundNo: 0,
          groupId: null,
          bracketSlotId: null,
          bracketLevel: match.bracketLevel,
          bracketRound: match.bracketRound,
          matchNo: match.matchNo,
          courtNo: match.courtNo,
          teamAId: match.teamA?.teamId ?? null,
          teamBId: match.teamB?.teamId ?? null,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          setsA: match.setsA,
          setsB: match.setsB,
          winnerId: match.winnerId,
          walkover: match.walkover,
          status: match.status,
          scheduledAt: match.scheduledAt,
          slotIndex: null,
          groupLabel: match.groupLabel,
        };
        const judgeMeta = judgeMetaByMatch.get(match.matchId);
        const judgeState = normalizeJudgeState(judgeMeta?.judgeState, baseMatch);
        const teamAPlayers: GoJudgeTeamPlayerView[] = [
          { slot: 1, id: match.teamA?.player1?.id ?? null, name: match.teamA?.player1?.name ?? 'TBD' },
          { slot: 2, id: match.teamA?.player2?.id ?? null, name: match.teamA?.player2?.name ?? 'TBD' },
        ];
        const teamBPlayers: GoJudgeTeamPlayerView[] = [
          { slot: 1, id: match.teamB?.player1?.id ?? null, name: match.teamB?.player1?.name ?? 'TBD' },
          { slot: 2, id: match.teamB?.player2?.id ?? null, name: match.teamB?.player2?.name ?? 'TBD' },
        ];
        return {
          matchId: match.matchId,
          matchNo: match.matchNo,
          teamA: { label: match.teamA?.label ?? 'TBD', players: teamAPlayers },
          teamB: { label: match.teamB?.label ?? 'TBD', players: teamBPlayers },
          scoreA: judgeState.scoreA,
          scoreB: judgeState.scoreB,
          setsA: match.setsA,
          setsB: match.setsB,
          status: match.status,
          context: match.groupLabel
            ? `Group ${match.groupLabel}`
            : match.bracketLevel
              ? `${String(match.bracketLevel).toUpperCase()} R${match.bracketRound ?? 1}`
              : 'Match',
          judgeState,
          version: Math.max(0, judgeMeta?.judgeVersion ?? 0),
        };
      });
      return {
        courtNo: court.courtNo,
        label: court.label,
        matches: mappedMatches,
        currentMatchId:
          mappedMatches.find((match) => match.status === 'live')?.matchId ??
          mappedMatches.find((match) => match.status === 'pending')?.matchId ??
          mappedMatches[0]?.matchId ??
          null,
      };
    });

    return {
      tournamentId: bundle.tournament.id,
      courts,
      currentCourt: asInt(row.courtNo, courts[0]?.courtNo ?? 1),
    };
  } finally {
    client.release();
  }
}

function withRememberedState(state: GoJudgeState, history: GoJudgeState[]): GoJudgeState[] {
  return clampJudgeHistory([...history, JSON.parse(JSON.stringify(state)) as GoJudgeState], 10);
}

function parseJudgeHistory(raw: unknown, match: MatchRow): GoJudgeState[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeJudgeState(entry, match))
    .slice(-10);
}

function clearSetScopedServing(state: GoJudgeState): void {
  state.currentServer = null;
  state.servingTeam = null;
  state.lastServer = { A: null, B: null };
}

function ensureSetIndex(state: GoJudgeState): void {
  while (state.scoreA.length <= state.activeSetIndex) state.scoreA.push(0);
  while (state.scoreB.length <= state.activeSetIndex) state.scoreB.push(0);
}

function evaluateJudgeBlocks(state: GoJudgeState): void {
  ensureSetIndex(state);
  const a = state.scoreA[state.activeSetIndex] ?? 0;
  const b = state.scoreB[state.activeSetIndex] ?? 0;
  const total = a + b;
  const interval = state.activeSetIndex >= 2 ? 5 : 7;
  if (total > 0 && total % interval === 0) {
    state.sideSwap.pending = true;
  }
  if (state.activeSetIndex < 2 && total === 21 && !state.tto.triggeredSets.includes(state.activeSetIndex)) {
    state.tto.pending = true;
  }
}

function maybeAdvanceSet(state: GoJudgeState, settings: GoAdminSettings, match: MatchRow): void {
  ensureSetIndex(state);
  const a = state.scoreA[state.activeSetIndex] ?? 0;
  const b = state.scoreB[state.activeSetIndex] ?? 0;
  const target = setScoreTarget(settings, match, state.activeSetIndex);
  if (!isSetWon(a, b, target)) return;
  const canAdvance = settings.matchFormat === 'bo3' && state.activeSetIndex < 2;
  if (!canAdvance) return;
  state.activeSetIndex += 1;
  ensureSetIndex(state);
  state.sideSwap.pending = false;
  state.tto.pending = false;
  clearSetScopedServing(state);
}

async function persistJudgeStateTx(
  client: PoolClient,
  matchId: string,
  nextState: GoJudgeState,
  nextHistory: GoJudgeState[],
): Promise<number> {
  const res = await client.query(
    `UPDATE go_match
     SET judge_state = $2::jsonb,
         judge_history = $3::jsonb,
         judge_version = COALESCE(judge_version, 0) + 1
     WHERE id = $1
     RETURNING judge_version`,
    [matchId, JSON.stringify(nextState), JSON.stringify(nextHistory)],
  );
  if (!res.rows[0]) throw new GoNextError(404, 'Match not found');
  return asInt(res.rows[0].judge_version, 0);
}

async function setMatchStatusTx(
  client: PoolClient,
  matchId: string,
  status: GoMatchStatus,
): Promise<void> {
  await client.query(
    `UPDATE go_match
     SET status = $2
     WHERE id = $1`,
    [matchId, status],
  );
}

export async function runGoJudgeAction(
  pin: string,
  matchId: string,
  action: GoJudgeActionName,
  payload: Record<string, unknown>,
  expectedVersion?: number,
): Promise<GoJudgeSnapshot> {
  requireDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await resolveJudgeMatchTx(client, pin, matchId);
    if (!target.match.teamAId || !target.match.teamBId) {
      throw new GoNextError(400, 'Match participants are not resolved yet');
    }
    const currentVersion = Math.max(0, asInt(target.match.judgeVersion, 0));
    if (Number.isFinite(Number(expectedVersion)) && Number(expectedVersion) !== currentVersion) {
      throw new GoNextError(409, 'version_conflict');
    }
    const state = normalizeJudgeState(target.match.judgeState, target.match);
    const history = parseJudgeHistory(target.match.judgeHistory, target.match);

    if (action === 'undo') {
      if (!history.length) {
        await persistJudgeStateTx(client, matchId, state, history);
      } else {
        const nextHistory = [...history];
        const restored = nextHistory.pop() as GoJudgeState;
        await persistJudgeStateTx(client, matchId, restored, nextHistory);
      }
      await client.query('COMMIT');
      return await getGoJudgeSnapshotByPin(pin);
    }

    const nextHistory = withRememberedState(state, history);
    const winner = asTeamSide(payload.winner);
    const team = asTeamSide(payload.team);
    const playerSlot = asPlayerSlot(payload.playerSlot);
    const delta = asInt(payload.delta, 0);

    if ((action === 'point_won' || action === 'adjust_point') && (state.sideSwap.pending || state.tto.pending)) {
      throw new GoNextError(400, 'Confirm side swap / TTO before adding points');
    }

    switch (action) {
      case 'mark_live': {
        if (target.match.status !== 'finished') {
          await setMatchStatusTx(client, matchId, 'live');
        }
        break;
      }
      case 'point_won': {
        if (!winner) throw new GoNextError(400, 'winner is required');
        ensureSetIndex(state);
        if (!state.servingTeam || !state.currentServer) {
          throw new GoNextError(400, 'Select the server before scoring');
        }
        if (state.servingTeam !== winner) {
          const last = state.lastServer[winner];
          const nextSlot = last === 1 ? 2 : last === 2 ? 1 : state.startServerByTeam[winner];
          state.servingTeam = winner;
          state.currentServer = { team: winner, playerSlot: nextSlot };
          state.lastServer[winner] = nextSlot;
        }
        if (winner === 'A') state.scoreA[state.activeSetIndex] = (state.scoreA[state.activeSetIndex] ?? 0) + 1;
        if (winner === 'B') state.scoreB[state.activeSetIndex] = (state.scoreB[state.activeSetIndex] ?? 0) + 1;
        evaluateJudgeBlocks(state);
        maybeAdvanceSet(state, target.settings, target.match);
        break;
      }
      case 'adjust_point': {
        if (!team) throw new GoNextError(400, 'team is required');
        if (![-1, 1].includes(delta)) throw new GoNextError(400, 'delta must be -1 or 1');
        ensureSetIndex(state);
        if (team === 'A') state.scoreA[state.activeSetIndex] = Math.max(0, (state.scoreA[state.activeSetIndex] ?? 0) + delta);
        if (team === 'B') state.scoreB[state.activeSetIndex] = Math.max(0, (state.scoreB[state.activeSetIndex] ?? 0) + delta);
        break;
      }
      case 'set_start_server': {
        if (!team || !playerSlot) throw new GoNextError(400, 'team and playerSlot are required');
        state.startServerByTeam[team] = playerSlot;
        if (!state.currentServer) {
          state.currentServer = { team, playerSlot };
          state.servingTeam = team;
          state.lastServer[team] = playerSlot;
        }
        break;
      }
      case 'manual_server_override': {
        if (!team || !playerSlot) throw new GoNextError(400, 'team and playerSlot are required');
        state.servingTeam = team;
        state.currentServer = { team, playerSlot };
        state.lastServer[team] = playerSlot;
        break;
      }
      case 'confirm_side_swap': {
        state.sideSwap.pending = false;
        ensureSetIndex(state);
        state.sideSwap.confirmedAt.push((state.scoreA[state.activeSetIndex] ?? 0) + (state.scoreB[state.activeSetIndex] ?? 0));
        state.sideSwap.confirmedAt = state.sideSwap.confirmedAt.slice(-20);
        break;
      }
      case 'confirm_tto': {
        state.tto.pending = false;
        if (!state.tto.triggeredSets.includes(state.activeSetIndex)) state.tto.triggeredSets.push(state.activeSetIndex);
        if (!state.technicalTimeouts.setIndex.includes(state.activeSetIndex)) state.technicalTimeouts.setIndex.push(state.activeSetIndex);
        state.technicalTimeouts.setIndex = state.technicalTimeouts.setIndex.slice(-10);
        break;
      }
      case 'set_timeout': {
        if (!team) throw new GoNextError(400, 'team is required');
        if (team === 'A') state.timeouts.teamA = Math.min(1, state.timeouts.teamA + 1);
        if (team === 'B') state.timeouts.teamB = Math.min(1, state.timeouts.teamB + 1);
        break;
      }
      case 'replay_rally': {
        state.replayCount += 1;
        break;
      }
      case 'toggle_manual_swap': {
        state.manualSideSwap = !state.manualSideSwap;
        break;
      }
      default:
        throw new GoNextError(400, 'Unsupported action');
    }

    if (
      target.match.status === 'pending' &&
      (action === 'point_won' ||
        action === 'adjust_point' ||
        action === 'set_start_server' ||
        action === 'manual_server_override')
    ) {
      await setMatchStatusTx(client, matchId, 'live');
    }

    await persistJudgeStateTx(client, matchId, state, nextHistory);
    await client.query('COMMIT');
    return await getGoJudgeSnapshotByPin(pin);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function submitGoMatchScore(
  pin: string,
  matchId: string,
  scores: { scoreA: number[]; scoreB: number[] },
): Promise<GoJudgeSnapshot> {
  requireDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await resolveJudgeMatchTx(client, pin, matchId);
    if (!target.match.teamAId || !target.match.teamBId) {
      throw new GoNextError(400, 'Match participants are not resolved yet');
    }
    const liveState = normalizeJudgeState(target.match.judgeState, target.match);
    const submittedA = Array.isArray(scores.scoreA) && scores.scoreA.length ? scores.scoreA : liveState.scoreA;
    const submittedB = Array.isArray(scores.scoreB) && scores.scoreB.length ? scores.scoreB : liveState.scoreB;
    const validated = validateSubmittedScore(target.settings, submittedA, submittedB, !target.match.groupId);
    const winnerId =
      validated.winnerSide === 'A' ? target.match.teamAId ?? null : target.match.teamBId ?? null;
    const updatedMatch = await applyMatchResultTx(client, matchId, {
      scoreA: validated.scoreA,
      scoreB: validated.scoreB,
      setsA: validated.setsA,
      setsB: validated.setsB,
      winnerId,
      walkover: 'none',
    });
    await client.query(
      `UPDATE go_match
       SET judge_state = '{}'::jsonb, judge_history = '[]'::jsonb
       WHERE id = $1`,
      [matchId],
    );

    if (updatedMatch.groupId) {
      await hydrateBo3GroupFollowupsTx(client, updatedMatch.groupId, target.settings);
      await recalcGroupStandingsTx(client, updatedMatch.groupId, target.settings);
      await updateGroupStatusTx(client, updatedMatch.groupId);
      await refreshRoundStatusTx(client, updatedMatch.roundId);
    } else {
      await advanceWinnerTx(client, updatedMatch.matchId, target.settings);
      await refreshRoundStatusTx(client, updatedMatch.roundId);
    }

    await client.query('COMMIT');
    return await getGoJudgeSnapshotByPin(pin);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function walkoverMatch(
  pin: string,
  matchId: string,
  walkover: 'team_a' | 'team_b' | 'mutual',
): Promise<GoJudgeSnapshot> {
  requireDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await resolveJudgeMatchTx(client, pin, matchId);
    if (!target.match.teamAId || !target.match.teamBId) {
      throw new GoNextError(400, 'Match participants are not resolved yet');
    }
    const winnerId =
      walkover === 'team_a'
        ? target.match.teamBId
        : walkover === 'team_b'
          ? target.match.teamAId
          : null;
    const updatedMatch = await applyMatchResultTx(client, matchId, {
      scoreA: [],
      scoreB: [],
      setsA: walkover === 'team_b' ? 2 : 0,
      setsB: walkover === 'team_a' ? 2 : 0,
      winnerId: winnerId ?? null,
      walkover,
    });

    if (updatedMatch.groupId) {
      await hydrateBo3GroupFollowupsTx(client, updatedMatch.groupId, target.settings);
      await recalcGroupStandingsTx(client, updatedMatch.groupId, target.settings);
      await updateGroupStatusTx(client, updatedMatch.groupId);
      await refreshRoundStatusTx(client, updatedMatch.roundId);
    } else if (updatedMatch.winnerId) {
      await advanceWinnerTx(client, updatedMatch.matchId, target.settings);
      await refreshRoundStatusTx(client, updatedMatch.roundId);
    }

    await client.query('COMMIT');
    return await getGoJudgeSnapshotByPin(pin);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function patchGoMatchByOperator(
  tournamentId: string,
  input: GoOperatorMatchPatchInput,
): Promise<GoOperatorMatchPatchResult> {
  requireDatabase();
  const normalizedTournamentId = String(tournamentId || '').trim();
  const matchId = String(input.matchId || '').trim();
  if (!normalizedTournamentId) throw new GoNextError(400, 'tournamentId is required');
  if (!matchId) throw new GoNextError(400, 'matchId is required');

  const pool = getPool();
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const tournament = await loadTournamentTx(client, normalizedTournamentId, { lock: true });
    const settings = normalizeGoSettings(tournament.settings);

    const currentRes = await client.query<{
      matchId: string;
      roundId: string;
      groupId: string | null;
      matchNo: number;
      courtNo: number | null;
      teamAId: string | null;
      teamBId: string | null;
      teamALabel: string | null;
      teamBLabel: string | null;
      scoreA: number[];
      scoreB: number[];
      setsA: number;
      setsB: number;
      winnerId: string | null;
      walkover: GoWalkover;
      status: GoMatchStatus;
      scheduledAt: string | null;
      groupLabel: string | null;
      bracketLevel: string | null;
      bracketRound: number | null;
    }>(
      `SELECT
         m.id::text AS "matchId",
         m.round_id::text AS "roundId",
         m.group_id::text AS "groupId",
         m.match_no AS "matchNo",
         m.court_no AS "courtNo",
         m.team_a_id::text AS "teamAId",
         m.team_b_id::text AS "teamBId",
         ta.label AS "teamALabel",
         tb.label AS "teamBLabel",
         COALESCE(m.score_a, '{}') AS "scoreA",
         COALESCE(m.score_b, '{}') AS "scoreB",
         m.sets_a AS "setsA",
         m.sets_b AS "setsB",
         m.winner_id::text AS "winnerId",
         m.walkover,
         m.status,
         to_char(m.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS "scheduledAt",
         g.label AS "groupLabel",
         m.bracket_level AS "bracketLevel",
         bs.bracket_round AS "bracketRound"
       FROM go_match m
       JOIN go_round r ON r.id = m.round_id
       LEFT JOIN go_group g ON g.id = m.group_id
       LEFT JOIN go_bracket_slot bs ON bs.id = m.bracket_slot_id
       LEFT JOIN go_team ta ON ta.id = m.team_a_id
       LEFT JOIN go_team tb ON tb.id = m.team_b_id
       WHERE r.tournament_id = $1
         AND m.id = $2
       FOR UPDATE`,
      [normalizedTournamentId, matchId],
    );
    const current = currentRes.rows[0];
    if (!current) throw new GoNextError(404, 'Match not found');

    let nextCourtNo = current.courtNo;
    if (input.courtNo !== undefined) {
      if (input.courtNo == null) {
        nextCourtNo = null;
      } else {
        const parsedCourt = asInt(input.courtNo, 0);
        if (parsedCourt <= 0) throw new GoNextError(400, 'Invalid courtNo');
        const courtRes = await client.query(
          `SELECT 1
           FROM go_court
           WHERE tournament_id = $1
             AND court_no = $2
           LIMIT 1`,
          [normalizedTournamentId, parsedCourt],
        );
        if (!courtRes.rows.length) throw new GoNextError(400, `Court ${parsedCourt} does not exist`);
        nextCourtNo = parsedCourt;
      }
    }

    const nextScheduledAt = input.scheduledAt !== undefined
      ? normalizeIsoTimestampInput(input.scheduledAt)
      : current.scheduledAt;
    const nextStatus = input.status ? normalizeMatchStatus(input.status) : normalizeMatchStatus(current.status);
    const moving =
      nextCourtNo !== current.courtNo ||
      String(nextScheduledAt || '') !== String(current.scheduledAt || '');

    if (moving && current.status === 'live' && !input.allowLiveReschedule) {
      throw new GoNextError(409, 'Нельзя переносить LIVE матч без отдельного подтверждения');
    }
    if (moving && current.status === 'finished' && !input.allowFinishedReschedule) {
      throw new GoNextError(409, 'Нельзя переносить завершённый матч без подтверждения');
    }

    if (nextScheduledAt && nextCourtNo != null) {
      const courtConflict = await client.query<{
        matchNo: number;
      }>(
        `SELECT m.match_no AS "matchNo"
         FROM go_match m
         JOIN go_round r ON r.id = m.round_id
         WHERE r.tournament_id = $1
           AND m.id <> $2
           AND m.scheduled_at = $3::timestamptz
           AND m.court_no = $4
           AND m.status IN ('pending', 'live')
         LIMIT 1`,
        [normalizedTournamentId, matchId, nextScheduledAt, nextCourtNo],
      );
      if (courtConflict.rows[0]) {
        throw new GoNextError(409, `Корт ${nextCourtNo} уже содержит матч в этом слоте`);
      }
    }

    const teamIds = [current.teamAId, current.teamBId].filter((value): value is string => Boolean(value));
    if (nextScheduledAt && teamIds.length > 0) {
      const teamConflict = await client.query<{
        teamALabel: string | null;
        teamBLabel: string | null;
      }>(
        `SELECT ta.label AS "teamALabel", tb.label AS "teamBLabel"
         FROM go_match m
         JOIN go_round r ON r.id = m.round_id
         LEFT JOIN go_team ta ON ta.id = m.team_a_id
         LEFT JOIN go_team tb ON tb.id = m.team_b_id
         WHERE r.tournament_id = $1
           AND m.id <> $2
           AND m.scheduled_at = $3::timestamptz
           AND m.status IN ('pending', 'live')
           AND (
             m.team_a_id = ANY($4::uuid[])
             OR m.team_b_id = ANY($4::uuid[])
           )
         LIMIT 1`,
        [normalizedTournamentId, matchId, nextScheduledAt, teamIds],
      );
      if (teamConflict.rows[0]) {
        throw new GoNextError(409, 'Команда уже занята в это время');
      }
    }

    const incomingScoreA = input.scoreA ? asIntArray(input.scoreA) : current.scoreA;
    const incomingScoreB = input.scoreB ? asIntArray(input.scoreB) : current.scoreB;

    let nextScoreA = incomingScoreA;
    let nextScoreB = incomingScoreB;
    let nextSetsA = input.setsA == null ? asInt(current.setsA, 0) : Math.max(0, asInt(input.setsA, 0));
    let nextSetsB = input.setsB == null ? asInt(current.setsB, 0) : Math.max(0, asInt(input.setsB, 0));
    let nextWinnerId = input.winnerId === undefined ? current.winnerId : input.winnerId;
    let nextWalkover: GoWalkover = normalizeWalkover(current.walkover);

    if (nextStatus === 'finished') {
      const scoreProvided = input.scoreA !== undefined || input.scoreB !== undefined;
      if (scoreProvided) {
        const validated = validateSubmittedScore(settings, nextScoreA, nextScoreB, !current.groupId);
        nextScoreA = validated.scoreA;
        nextScoreB = validated.scoreB;
        nextSetsA = validated.setsA;
        nextSetsB = validated.setsB;
        nextWinnerId = validated.winnerSide === 'A' ? current.teamAId : current.teamBId;
      } else if (input.setsA !== undefined || input.setsB !== undefined || input.winnerId !== undefined) {
        if (nextSetsA === nextSetsB) throw new GoNextError(400, 'Для завершённого матча нужен победитель');
        if (!nextWinnerId) {
          nextWinnerId = nextSetsA > nextSetsB ? current.teamAId : current.teamBId;
        }
      }
      if (!nextWinnerId) {
        throw new GoNextError(400, 'Для завершённого матча укажите победителя');
      }
      if (nextWinnerId !== current.teamAId && nextWinnerId !== current.teamBId) {
        throw new GoNextError(400, 'Winner must belong to this match');
      }
      nextWalkover = normalizeWalkover(current.walkover) === 'mutual' ? 'none' : normalizeWalkover(current.walkover);
    } else if (nextStatus === 'cancelled') {
      nextScoreA = [];
      nextScoreB = [];
      nextSetsA = 0;
      nextSetsB = 0;
      nextWinnerId = null;
      nextWalkover = 'none';
    } else {
      nextWinnerId = null;
      if (nextStatus === 'pending') {
        nextScoreA = [];
        nextScoreB = [];
        nextSetsA = 0;
        nextSetsB = 0;
      }
      nextWalkover = 'none';
    }

    const updateRes = await client.query(
      `UPDATE go_match
       SET
         court_no = $2,
         scheduled_at = $3::timestamptz,
         status = $4,
         score_a = $5::int[],
         score_b = $6::int[],
         sets_a = $7,
         sets_b = $8,
         winner_id = $9,
         walkover = $10,
         started_at = CASE
           WHEN $4 = 'live' AND started_at IS NULL THEN now()
           WHEN $4 IN ('pending', 'cancelled') THEN NULL
           ELSE started_at
         END,
         finished_at = CASE
           WHEN $4 = 'finished' THEN COALESCE(finished_at, now())
           WHEN $4 IN ('pending', 'live', 'cancelled') THEN NULL
           ELSE finished_at
         END
       WHERE id = $1`,
      [
        matchId,
        nextCourtNo,
        nextScheduledAt,
        nextStatus,
        nextScoreA,
        nextScoreB,
        nextSetsA,
        nextSetsB,
        nextWinnerId,
        nextWalkover,
      ],
    );
    if (!updateRes.rowCount) throw new GoNextError(404, 'Match not found');

    await client.query('COMMIT');
    committed = true;

    const bundle = await getGoAdminBundle(normalizedTournamentId);
    const updatedMatch = bundle.matches.find((match) => match.matchId === matchId) ?? null;

    return {
      success: true,
      state: bundle.state,
      matches: bundle.matches,
      updatedMatch,
      audit: {
        before: {
          matchId: current.matchId,
          matchNo: current.matchNo,
          status: current.status,
          courtNo: current.courtNo,
          scheduledAt: current.scheduledAt,
          setsA: current.setsA,
          setsB: current.setsB,
          winnerId: current.winnerId,
          teamA: current.teamALabel,
          teamB: current.teamBLabel,
          groupLabel: current.groupLabel,
          bracketLevel: current.bracketLevel,
          bracketRound: current.bracketRound,
        },
        after: {
          matchId,
          status: nextStatus,
          courtNo: nextCourtNo,
          scheduledAt: nextScheduledAt,
          setsA: nextSetsA,
          setsB: nextSetsB,
          winnerId: nextWinnerId,
          scoreA: nextScoreA,
          scoreB: nextScoreB,
          note: input.note ? String(input.note) : '',
        },
      },
    };
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function runGoOperatorAction(
  tournamentId: string,
  action: GoOperatorActionName,
  options?: { seed?: number; groupId?: string; seedDraft?: unknown },
): Promise<{
  success: true;
  state: GoOperatorState;
  matches: GoMatchView[];
  brackets: Record<string, GoBracketSlotView[]>;
  seedDraft?: Record<string, GoTeamView[]> | null;
}> {
  requireDatabase();
  const normalizedTournamentId = String(tournamentId || '').trim();
  if (!normalizedTournamentId) throw new GoNextError(400, 'tournamentId is required');

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    switch (action) {
      case 'bootstrap_groups':
        await bootstrapGroupsTx(client, normalizedTournamentId, options?.seed);
        break;
      case 'start_group_stage': {
        const rounds = await loadRoundsTx(client, normalizedTournamentId);
        const r1 = rounds.find((round) => round.roundNo === 1);
        if (!r1) throw new GoNextError(400, 'Groups are not initialized');
        await client.query(`UPDATE go_round SET status = 'live' WHERE id = $1`, [r1.roundId]);
        await client.query(`UPDATE go_group SET status = 'live' WHERE round_id = $1`, [r1.roundId]);
        break;
      }
      case 'mass_walkover_group': {
        const groupId = String(options?.groupId || '').trim();
        if (!groupId) throw new GoNextError(400, 'groupId is required');
        const bundle = await loadGoAdminBundleTx(client, normalizedTournamentId);
        const affected = bundle.matches.filter(
          (match) =>
            match.status !== 'finished' && bundle.groups.some((group) => group.groupId === groupId && group.label === match.groupLabel),
        );
        for (const match of affected) {
          await applyMatchResultTx(client, match.matchId, {
            scoreA: [],
            scoreB: [],
            setsA: 0,
            setsB: 0,
            winnerId: null,
            walkover: 'mutual',
          });
        }
        await recalcGroupStandingsTx(client, groupId, bundle.settings);
        await updateGroupStatusTx(client, groupId);
        break;
      }
      case 'finish_group_stage': {
        const rounds = await loadRoundsTx(client, normalizedTournamentId);
        const r1 = rounds.find((round) => round.roundNo === 1);
        if (!r1) throw new GoNextError(400, 'Groups are not initialized');
        const res = await client.query(
          `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'live')) AS open_count FROM go_match WHERE round_id = $1`,
          [r1.roundId],
        );
        if (asInt(res.rows[0]?.open_count, 0) > 0) {
          throw new GoNextError(400, 'Finish all group matches before closing the group stage');
        }
        await client.query(`UPDATE go_group SET status = 'finished' WHERE round_id = $1`, [r1.roundId]);
        await client.query(`UPDATE go_round SET status = 'finished' WHERE id = $1`, [r1.roundId]);
        break;
      }
      case 'preview_bracket_seed':
        await previewBracketSeedTx(client, normalizedTournamentId);
        break;
      case 'confirm_bracket_seed':
        await confirmBracketSeedTx(client, normalizedTournamentId, options?.seedDraft);
        break;
      case 'bootstrap_bracket':
        await bootstrapBracketTx(client, normalizedTournamentId);
        break;
      case 'rollback_stage':
        await rollbackStageTx(client, normalizedTournamentId);
        break;
      case 'finish_bracket':
        await finishBracketTx(client, normalizedTournamentId);
        break;
      default:
        throw new GoNextError(400, `Unsupported GO operator action: ${action}`);
    }

    await client.query('COMMIT');
    if (action === 'finish_bracket') {
      await syncGoResultsToTournamentResultsOrThrowBadRequest(normalizedTournamentId);
    }
    const bundle = await getGoAdminBundle(normalizedTournamentId);
    return {
      success: true,
      state: bundle.state,
      matches: bundle.matches,
      brackets: bundle.brackets,
      seedDraft: bundle.seedDraft,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resetGoState(tournamentId: string): Promise<{ reset: true }> {
  requireDatabase();
  const normalizedTournamentId = String(tournamentId || '').trim();
  if (!normalizedTournamentId) throw new GoNextError(400, 'tournamentId is required');

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadTournamentTx(client, normalizedTournamentId, { lock: true });
    await clearGoStateTx(client, normalizedTournamentId);
    await client.query('COMMIT');
    return { reset: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
