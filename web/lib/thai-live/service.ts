import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import {
  normalizeThaiAdminSettings,
  normalizeThaiRosterMode,
  normalizeThaiRulesPreset,
  validateThaiRoster,
} from '@/lib/admin-legacy-sync';
import {
  THAI_JUDGE_MODULE_NEXT,
  THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
  buildThaiJudgeStructuralSignature,
  normalizeThaiJudgeBootstrapSignature,
  normalizeThaiJudgeModule,
  validateThaiNextTournamentSetup,
} from '@/lib/thai-judge-config';
import {
  buildThaiCourtBootstrapTours,
  buildThaiCourtLabel,
  buildThaiProgressRows,
  buildThaiStandingsGroups,
  resolveThaiPointLimitForRound,
  seedThaiRound2Courts,
  thaiZoneLabel,
  validateThaiMatchScore,
} from './core';
import {
  buildSchedulePrintCourt,
  placeholderR2CourtPlayers,
  r2FormationLegend,
} from './print-schedule';
import type { ThaiSchedulePrintPayload } from './print-schedule';
import type {
  ThaiBootstrapCourtPlayer,
  ThaiDrawPreview,
  ThaiDrawPreviewCourt,
  ThaiDrawPreviewPlayer,
  ThaiJudgeConfirmPayload,
  ThaiJudgeConfirmResult,
  ThaiJudgeCourtNavItem,
  ThaiJudgeCourtSummary,
  ThaiJudgeMatchView,
  ThaiJudgeRoundNavItem,
  ThaiJudgeSnapshot,
  ThaiJudgeStateSummary,
  ThaiJudgeTeamView,
  ThaiJudgeTournamentCourtTabItem,
  ThaiJudgeTournamentRoundItem,
  ThaiJudgeTournamentSnapshot,
  ThaiMatchStatus,
  ThaiOperatorActionResult,
  ThaiOperatorActionName,
  ThaiOperatorCourtRoundView,
  ThaiOperatorFinalZoneResult,
  ThaiOperatorProgressRow,
  ThaiOperatorRoundView,
  ThaiOperatorStage,
  ThaiOperatorStateSummary,
  ThaiOperatorTourSummary,
  ThaiPlayerRole,
  ThaiRoundStatus,
  ThaiRoundType,
  ThaiR2SeedDraft,
  ThaiR2SeedPlayer,
  ThaiR2SeedZone,
  ThaiStandingsGroup,
  ThaiStandingsRow,
  ThaiTourStatus,
  ThaiZoneKey,
} from './types';

interface TournamentRow {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  status: string;
  settings: Record<string, unknown>;
}

interface TournamentStructureParticipant {
  playerId: string;
  gender: 'M' | 'W';
  position: number;
  isWaitlist: boolean;
}

interface CourtRoundRow {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  settings: Record<string, unknown>;
  roundId: string;
  roundNo: number;
  roundType: ThaiRoundType;
  roundStatus: ThaiRoundStatus;
  currentTourNo: number;
  courtId: string;
  courtNo: number;
  courtLabel: string;
  pin: string;
  tourCount: number;
}

interface RoundRow {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  settings: Record<string, unknown>;
  roundId: string;
  roundNo: number;
  roundType: ThaiRoundType;
  roundStatus: ThaiRoundStatus;
  currentTourNo: number;
  tourCount: number;
}

interface CourtRow {
  courtId: string;
  courtNo: number;
  courtLabel: string;
  pin: string;
}

interface LoadedMatchPlayer {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  teamSide: 1 | 2;
  playerRole: ThaiPlayerRole;
}

interface LoadedMatch {
  matchId: string;
  matchNo: number;
  status: ThaiMatchStatus;
  team1Score: number | null;
  team2Score: number | null;
  players: LoadedMatchPlayer[];
}

interface LoadedTour {
  tourId: string;
  tourNo: number;
  status: ThaiTourStatus;
  matches: LoadedMatch[];
}

interface CourtAggregateView {
  courtId: string;
  courtNo: number;
  label: string;
  pin: string;
  judgeUrl: string;
  currentTourNo: number;
  currentTourStatus: ThaiTourStatus | 'finished';
  playerNames: string[];
  tours: ThaiOperatorTourSummary[];
  standingsGroups: ThaiStandingsGroup[];
}

export class ThaiJudgeError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, message: string, code?: string | null) {
    super(message);
    this.name = 'ThaiJudgeError';
    this.status = status;
    this.code = code ?? null;
  }
}

export function isThaiJudgeError(error: unknown): error is ThaiJudgeError {
  return error instanceof ThaiJudgeError;
}

function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new ThaiJudgeError(503, 'Service unavailable');
  }
}

function asNum(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

function judgeUrlForPin(pin: string): string {
  return `/court/${encodeURIComponent(pin)}`;
}

function normalizeThaiVariant(settings: Record<string, unknown>): string {
  return normalizeThaiAdminSettings(settings).variant;
}

function getThaiPointLimitForRound(settings: Record<string, unknown>, roundType: ThaiRoundType): number {
  return resolveThaiPointLimitForRound(settings, roundType === 'r2' ? 'r2' : 'r1');
}

function roundTypeFromValue(value: unknown): ThaiRoundType {
  return String(value || '').trim().toLowerCase() === 'r2' ? 'r2' : 'r1';
}

function roundStatusFromValue(value: unknown): ThaiRoundStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'finished') return normalized;
  return 'live';
}

function matchStatusFromValue(value: unknown): ThaiMatchStatus {
  return String(value || '').trim().toLowerCase() === 'confirmed' ? 'confirmed' : 'pending';
}

function tourStatusFromValue(value: unknown): ThaiTourStatus {
  return String(value || '').trim().toLowerCase() === 'confirmed' ? 'confirmed' : 'pending';
}

function roleFromValue(value: unknown): ThaiPlayerRole {
  return String(value || '').trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary';
}

function zoneFromCourtLabel(label: string): ThaiZoneKey | null {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'hard' || normalized === 'advance' || normalized === 'medium' || normalized === 'light') {
    return normalized;
  }
  return null;
}

function getThaiExpectedZones(courtCount: number): ThaiZoneKey[] {
  return (['hard', 'advance', 'medium', 'light'] as const).slice(0, Math.max(1, Math.min(4, courtCount)));
}

function getThaiExpectedCourtLabels(roundType: ThaiRoundType, courtCount: number): string[] {
  if (roundType === 'r2') {
    return getThaiExpectedZones(courtCount).map((zone) => thaiZoneLabel(zone).toUpperCase());
  }
  return Array.from({ length: courtCount }, (_, index) => buildThaiCourtLabel(index + 1));
}

function isR2Supported(variant: string, courtCount: number): boolean {
  void variant;
  return courtCount >= 1 && courtCount <= 4;
}

function buildDeterministicCourtPin(tournamentId: string, roundType: ThaiRoundType, courtNo: number): string {
  const digest = createHash('sha1')
    .update(`thai:${tournamentId}:${roundType}:${courtNo}`)
    .digest('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return digest.slice(0, 8) || `THAI${roundType}${courtNo}`;
}

function getThaiBaseSeed(settings: Record<string, unknown>): number {
  return Math.max(
    1,
    Math.trunc(
      Number(
        settings.seed ??
          settings.draftSeed ??
          settings.thaiSeed ??
          1,
      ) || 1,
    ),
  );
}

function getThaiDrawSeed(settings: Record<string, unknown>, requestedSeed?: unknown): number {
  const parsed = Math.trunc(Number(requestedSeed) || 0);
  if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  return getThaiBaseSeed(settings);
}

function createSeededRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleBySeed<T>(items: T[], seed: number): T[] {
  const rng = createSeededRng(seed);
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildCourtPreviewPlayers(
  players: ThaiBootstrapCourtPlayer[],
  variant: string,
): ThaiDrawPreviewPlayer[] {
  const normalizedVariant = String(variant || '').trim().toUpperCase();
  if (normalizedVariant === 'MF') {
    return [
      ...players.filter((player) => player.gender === 'M').map((player) => ({ ...player, role: 'primary' as const })),
      ...players.filter((player) => player.gender === 'W').map((player) => ({ ...player, role: 'secondary' as const })),
    ];
  }
  if (normalizedVariant === 'MN') {
    return players.map((player, index) => ({
      ...player,
      role: index < 4 ? 'primary' as const : 'secondary' as const,
    }));
  }
  return players.map((player) => ({ ...player, role: 'primary' as const }));
}

function buildThaiRound1CourtRosters(input: {
  players: ThaiBootstrapCourtPlayer[];
  variant: string;
  courts: number;
  seed: number;
  rosterMode?: unknown;
}): ThaiDrawPreviewCourt[] {
  const variant = String(input.variant || '').trim().toUpperCase();
  const courtCount = Math.max(1, Math.trunc(Number(input.courts) || 1));
  const players = input.players.slice();
  const rosterMode = normalizeThaiRosterMode(input.rosterMode);
  if (players.length !== courtCount * 8) {
    throw new ThaiJudgeError(400, `Thai bootstrap requires exactly ${courtCount * 8} players.`);
  }

  let courtPlayers: ThaiBootstrapCourtPlayer[][];
  if (rosterMode === 'manual') {
    courtPlayers = Array.from({ length: courtCount }, (_, index) => players.slice(index * 8, index * 8 + 8));
  } else if (variant === 'MF') {
    const men = shuffleBySeed(players.filter((player) => player.gender === 'M'), input.seed);
    const women = shuffleBySeed(players.filter((player) => player.gender === 'W'), input.seed + 101);
    if (men.length !== courtCount * 4 || women.length !== courtCount * 4) {
      throw new ThaiJudgeError(400, `Thai MF requires exactly ${courtCount * 4} men and ${courtCount * 4} women.`);
    }
    courtPlayers = Array.from({ length: courtCount }, (_, index) => [
      ...men.slice(index * 4, index * 4 + 4),
      ...women.slice(index * 4, index * 4 + 4),
    ]);
  } else if (variant === 'MN') {
    const allPros = Array.from({ length: courtCount }).flatMap((_, index) => players.slice(index * 8, index * 8 + 4));
    const allNovices = Array.from({ length: courtCount }).flatMap((_, index) => players.slice(index * 8 + 4, index * 8 + 8));
    const primary = shuffleBySeed(allPros, input.seed);
    const secondary = shuffleBySeed(allNovices, input.seed + 101);
    courtPlayers = Array.from({ length: courtCount }, (_, index) => [
      ...primary.slice(index * 4, index * 4 + 4),
      ...secondary.slice(index * 4, index * 4 + 4),
    ]);
  } else {
    const shuffled = shuffleBySeed(players, input.seed);
    courtPlayers = Array.from({ length: courtCount }, (_, index) => shuffled.slice(index * 8, index * 8 + 8));
  }

  return courtPlayers.map((playersForCourt, index) => ({
    courtNo: index + 1,
    courtLabel: buildThaiCourtLabel(index + 1),
    players: buildCourtPreviewPlayers(playersForCourt, variant),
  }));
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  requireDatabase();
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

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  requireDatabase();
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function loadTournamentTx(
  client: PoolClient,
  tournamentId: string,
  options?: { forUpdate?: boolean },
): Promise<TournamentRow> {
  const res = await client.query(
    `
      SELECT id, name, date, time, location, format, status, settings
      FROM tournaments
      WHERE id = $1
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE' : ''}
    `,
    [tournamentId],
  );
  const row = res.rows[0];
  if (!row) {
    throw new ThaiJudgeError(404, 'Tournament not found');
  }
  if (String(row.format || '').trim().toLowerCase() !== 'thai') {
    throw new ThaiJudgeError(400, 'Tournament is not Thai');
  }
  return {
    id: String(row.id),
    name: String(row.name || ''),
    date: toIsoDate(row.date),
    time: String(row.time || ''),
    location: String(row.location || ''),
    format: String(row.format || ''),
    status: String(row.status || ''),
    settings:
      row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {},
  };
}

async function listTournamentStructureParticipantsTx(
  client: PoolClient,
  tournamentId: string,
): Promise<TournamentStructureParticipant[]> {
  const res = await client.query(
    `
      SELECT
        p.id AS player_id,
        p.gender,
        tp.position,
        COALESCE(tp.is_waitlist, false) AS is_waitlist
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1
      ORDER BY tp.position ASC, tp.registered_at ASC, p.name ASC
    `,
    [tournamentId],
  );
  return res.rows.map((row) => ({
    playerId: String(row.player_id),
    gender: String(row.gender || 'M') === 'W' ? 'W' : 'M',
    position: asNum(row.position, 0),
    isWaitlist: Boolean(row.is_waitlist),
  }));
}

async function listTournamentRosterTx(client: PoolClient, tournamentId: string): Promise<ThaiBootstrapCourtPlayer[]> {
  const res = await client.query(
    `
      SELECT p.id AS player_id, p.name AS player_name, p.gender
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1
        AND COALESCE(tp.is_waitlist, false) = false
      ORDER BY tp.position ASC, tp.registered_at ASC, p.name ASC
    `,
    [tournamentId],
  );
  return res.rows.map((row) => ({
    playerId: String(row.player_id),
    playerName: String(row.player_name || ''),
    gender: String(row.gender || 'M') === 'W' ? 'W' : 'M',
  }));
}

async function listRoundsTx(client: PoolClient, tournamentId: string): Promise<RoundRow[]> {
  const res = await client.query(
    `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.date AS tournament_date,
        t.time AS tournament_time,
        t.location AS tournament_location,
        t.settings,
        r.id AS round_id,
        r.round_no,
        r.round_type,
        r.status AS round_status,
        r.current_tour_no,
        COALESCE(max_tours.max_tour_no, 0) AS tour_count
      FROM thai_round r
      JOIN tournaments t ON t.id = r.tournament_id
      LEFT JOIN LATERAL (
        SELECT MAX(tt.tour_no)::int AS max_tour_no
        FROM thai_tour tt
        JOIN thai_court c ON c.id = tt.court_id
        WHERE c.round_id = r.id
      ) max_tours ON true
      WHERE r.tournament_id = $1
      ORDER BY r.round_no ASC
    `,
    [tournamentId],
  );
  return res.rows.map((row) => ({
    tournamentId: String(row.tournament_id),
    tournamentName: String(row.tournament_name || ''),
    tournamentDate: toIsoDate(row.tournament_date),
    tournamentTime: String(row.tournament_time || ''),
    tournamentLocation: String(row.tournament_location || ''),
    settings:
      row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {},
    roundId: String(row.round_id),
    roundNo: asNum(row.round_no, 1),
    roundType: roundTypeFromValue(row.round_type),
    roundStatus: roundStatusFromValue(row.round_status),
    currentTourNo: asNum(row.current_tour_no, 1),
    tourCount: asNum(row.tour_count, 0),
  }));
}

async function loadRoundByTypeTx(
  client: PoolClient,
  tournamentId: string,
  roundType: ThaiRoundType,
  options?: { forUpdate?: boolean },
): Promise<RoundRow | null> {
  const res = await client.query(
    `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.date AS tournament_date,
        t.time AS tournament_time,
        t.location AS tournament_location,
        t.settings,
        r.id AS round_id,
        r.round_no,
        r.round_type,
        r.status AS round_status,
        r.current_tour_no,
        COALESCE(max_tours.max_tour_no, 0) AS tour_count
      FROM thai_round r
      JOIN tournaments t ON t.id = r.tournament_id
      LEFT JOIN LATERAL (
        SELECT MAX(tt.tour_no)::int AS max_tour_no
        FROM thai_tour tt
        JOIN thai_court c ON c.id = tt.court_id
        WHERE c.round_id = r.id
      ) max_tours ON true
      WHERE r.tournament_id = $1
        AND r.round_type = $2
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE OF r' : ''}
    `,
    [tournamentId, roundType],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    tournamentId: String(row.tournament_id),
    tournamentName: String(row.tournament_name || ''),
    tournamentDate: toIsoDate(row.tournament_date),
    tournamentTime: String(row.tournament_time || ''),
    tournamentLocation: String(row.tournament_location || ''),
    settings:
      row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {},
    roundId: String(row.round_id),
    roundNo: asNum(row.round_no, 1),
    roundType: roundTypeFromValue(row.round_type),
    roundStatus: roundStatusFromValue(row.round_status),
    currentTourNo: asNum(row.current_tour_no, 1),
    tourCount: asNum(row.tour_count, 0),
  };
}

async function listCourtsByRoundTx(client: PoolClient, roundId: string): Promise<CourtRow[]> {
  const res = await client.query(
    `
      SELECT id AS court_id, court_no, label, pin_code
      FROM thai_court
      WHERE round_id = $1
      ORDER BY court_no ASC
    `,
    [roundId],
  );
  return res.rows.map((row) => ({
    courtId: String(row.court_id),
    courtNo: asNum(row.court_no, 1),
    courtLabel: String(row.label || ''),
    pin: String(row.pin_code || ''),
  }));
}

async function loadRoundIdTx(client: PoolClient, tournamentId: string, roundType: ThaiRoundType = 'r1'): Promise<string | null> {
  const round = await loadRoundByTypeTx(client, tournamentId, roundType);
  return round?.roundId ?? null;
}

async function loadCourtRoundByPinTx(
  client: PoolClient,
  pin: string,
  options?: { forUpdate?: boolean },
): Promise<CourtRoundRow> {
  const res = await client.query(
    `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.date AS tournament_date,
        t.time AS tournament_time,
        t.location AS tournament_location,
        t.settings,
        r.id AS round_id,
        r.round_no,
        r.round_type,
        r.status AS round_status,
        r.current_tour_no,
        c.id AS court_id,
        c.court_no,
        c.label AS court_label,
        c.pin_code,
        COALESCE(max_tours.max_tour_no, 0) AS tour_count
      FROM thai_court c
      JOIN thai_round r ON r.id = c.round_id
      JOIN tournaments t ON t.id = c.tournament_id
      LEFT JOIN LATERAL (
        SELECT MAX(tour_no)::int AS max_tour_no
        FROM thai_tour
        WHERE court_id = c.id
      ) max_tours ON true
      WHERE c.pin_code = $1
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE OF c, r' : ''}
    `,
    [pin],
  );
  const row = res.rows[0];
  if (!row) {
    throw new ThaiJudgeError(404, 'Court not found');
  }
  const settings =
    row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  return {
    tournamentId: String(row.tournament_id),
    tournamentName: String(row.tournament_name || ''),
    tournamentDate: toIsoDate(row.tournament_date),
    tournamentTime: String(row.tournament_time || ''),
    tournamentLocation: String(row.tournament_location || ''),
    settings,
    roundId: String(row.round_id),
    roundNo: asNum(row.round_no, 1),
    roundType: roundTypeFromValue(row.round_type),
    roundStatus: roundStatusFromValue(row.round_status),
    currentTourNo: asNum(row.current_tour_no, 1),
    courtId: String(row.court_id),
    courtNo: asNum(row.court_no, 1),
    courtLabel: String(row.court_label || ''),
    pin: String(row.pin_code || ''),
    tourCount: asNum(row.tour_count, 0),
  };
}

async function loadMatchRowsByTourTx(
  client: PoolClient,
  tourId: string,
  options?: { forUpdate?: boolean },
): Promise<LoadedMatch[]> {
  const res = await client.query(
    `
      SELECT
        m.id AS match_id,
        m.match_no,
        m.status AS match_status,
        m.team1_score,
        m.team2_score,
        mp.player_id,
        mp.team_side,
        mp.player_role,
        p.name AS player_name,
        p.gender
      FROM thai_match m
      JOIN thai_match_player mp ON mp.match_id = m.id
      JOIN players p ON p.id = mp.player_id
      WHERE m.tour_id = $1
      ORDER BY m.match_no ASC, mp.team_side ASC, mp.player_role ASC, p.name ASC
      ${options?.forUpdate ? 'FOR UPDATE OF m' : ''}
    `,
    [tourId],
  );

  const byMatch = new Map<string, LoadedMatch>();
  for (const row of res.rows) {
    const matchId = String(row.match_id);
    const existing = byMatch.get(matchId) ?? {
      matchId,
      matchNo: asNum(row.match_no, 1),
      status: matchStatusFromValue(row.match_status),
      team1Score: row.team1_score == null ? null : asNum(row.team1_score),
      team2Score: row.team2_score == null ? null : asNum(row.team2_score),
      players: [],
    };
    existing.players.push({
      playerId: String(row.player_id),
      playerName: String(row.player_name || ''),
      gender: String(row.gender || 'M') === 'W' ? 'W' : 'M',
      teamSide: asNum(row.team_side, 1) === 2 ? 2 : 1,
      playerRole: roleFromValue(row.player_role),
    });
    byMatch.set(matchId, existing);
  }

  return [...byMatch.values()].sort((left, right) => left.matchNo - right.matchNo);
}

async function loadToursByCourtTx(client: PoolClient, courtId: string): Promise<LoadedTour[]> {
  const toursRes = await client.query(
    `
      SELECT id, tour_no, status
      FROM thai_tour
      WHERE court_id = $1
      ORDER BY tour_no ASC
    `,
    [courtId],
  );

  const tours: LoadedTour[] = [];
  for (const row of toursRes.rows) {
    const tourId = String(row.id);
    tours.push({
      tourId,
      tourNo: asNum(row.tour_no, 1),
      status: tourStatusFromValue(row.status),
      matches: await loadMatchRowsByTourTx(client, tourId),
    });
  }
  return tours;
}

function resolveCourtProgress(
  tours: LoadedTour[],
  roundStatus: ThaiRoundStatus,
): { currentTourNo: number; currentTour: LoadedTour | null; currentTourStatus: ThaiTourStatus | 'finished'; isCourtFinished: boolean } {
  const lastTour = tours[tours.length - 1] ?? null;
  if (roundStatus === 'finished') {
    return {
      currentTourNo: lastTour?.tourNo ?? 1,
      currentTour: lastTour,
      currentTourStatus: 'finished',
      isCourtFinished: true,
    };
  }

  const firstPendingTour = tours.find((tour) => tour.status === 'pending') ?? null;
  if (firstPendingTour) {
    return {
      currentTourNo: firstPendingTour.tourNo,
      currentTour: firstPendingTour,
      currentTourStatus: firstPendingTour.status,
      isCourtFinished: false,
    };
  }

  return {
    currentTourNo: lastTour?.tourNo ?? 1,
    currentTour: lastTour,
    currentTourStatus: 'finished',
    isCourtFinished: Boolean(lastTour),
  };
}

function buildTeamView(side: 1 | 2, players: LoadedMatchPlayer[]): ThaiJudgeTeamView {
  const orderedPlayers = players
    .slice()
    .sort((left, right) => {
      if (left.playerRole === right.playerRole) return left.playerName.localeCompare(right.playerName, 'ru');
      return left.playerRole === 'primary' ? -1 : 1;
    })
    .map((player) => ({
      id: player.playerId,
      name: player.playerName,
      role: player.playerRole,
    }));

  return {
    side,
    label: orderedPlayers.map((player) => player.name).join(' / '),
    players: orderedPlayers,
  };
}

function buildMatchViews(matches: LoadedMatch[]): ThaiJudgeMatchView[] {
  return matches.map((match) => {
    const team1Players = match.players.filter((player) => player.teamSide === 1);
    const team2Players = match.players.filter((player) => player.teamSide === 2);
    return {
      matchId: match.matchId,
      matchNo: match.matchNo,
      status: match.status,
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      team1: buildTeamView(1, team1Players),
      team2: buildTeamView(2, team2Players),
    };
  });
}

async function loadJudgeCourtNavTx(
  client: PoolClient,
  input: {
    roundId: string;
    activeCourtId: string;
    roundStatus: ThaiRoundStatus;
  },
): Promise<ThaiJudgeCourtNavItem[]> {
  const courts = await listCourtsByRoundTx(client, input.roundId);
  const navItems: ThaiJudgeCourtNavItem[] = [];

  for (const court of courts) {
    const progress = resolveCourtProgress(await loadToursByCourtTx(client, court.courtId), input.roundStatus);
    navItems.push({
      courtId: court.courtId,
      courtNo: court.courtNo,
      label: court.courtLabel,
      pin: court.pin,
      judgeUrl: judgeUrlForPin(court.pin),
      isActive: court.courtId === input.activeCourtId,
      currentTourStatus: progress.currentTourStatus,
    });
  }

  return navItems;
}

async function loadJudgeRoundNavTx(
  client: PoolClient,
  input: {
    tournamentId: string;
    activeRoundId: string;
    activeCourtNo: number;
  },
): Promise<ThaiJudgeRoundNavItem[]> {
  const rounds = await listRoundsTx(client, input.tournamentId);
  const roundByType = new Map(rounds.map((round) => [round.roundType, round] as const));
  const courtsByRoundType = new Map<ThaiRoundType, CourtRow[]>();

  for (const round of rounds) {
    courtsByRoundType.set(round.roundType, await listCourtsByRoundTx(client, round.roundId));
  }

  return (['r1', 'r2'] as const).map((roundType, index) => {
    const round = roundByType.get(roundType) ?? null;
    if (!round) {
      return {
        roundNo: index + 1,
        roundType,
        label: `ROUND ${index + 1}`,
        courtLabel: null,
        status: 'pending',
        judgeUrl: null,
        isActive: false,
        isAvailable: false,
      };
    }

    const targetCourt =
      courtsByRoundType
        .get(roundType)
        ?.find((court) => court.courtNo === input.activeCourtNo) ??
      courtsByRoundType.get(roundType)?.[0] ??
      null;

    return {
      roundNo: round.roundNo,
      roundType: round.roundType,
      label: `ROUND ${round.roundNo}`,
      courtLabel: targetCourt?.courtLabel ?? null,
      status: round.roundStatus,
      judgeUrl: targetCourt ? judgeUrlForPin(targetCourt.pin) : null,
      isActive: round.roundId === input.activeRoundId,
      isAvailable: Boolean(targetCourt),
    };
  });
}

function buildTournamentCourtTabs(input: {
  roundType: ThaiRoundType;
  courtCount: number;
  selectedCourtNo: number;
  existingCourts: Array<CourtRow & { currentTourNo: number | null; currentTourStatus: ThaiTourStatus | 'finished' }> ;
}): ThaiJudgeTournamentCourtTabItem[] {
  const expectedLabels = getThaiExpectedCourtLabels(input.roundType, input.courtCount);
  return expectedLabels.map((label, index) => {
    const courtNo = index + 1;
    const existing = input.existingCourts.find((court) => court.courtNo === courtNo) ?? null;
    return {
      courtId: existing?.courtId ?? null,
      courtNo,
      label,
      pin: existing?.pin ?? null,
      judgeUrl: existing ? judgeUrlForPin(existing.pin) : null,
      currentTourNo: existing?.currentTourNo ?? null,
      currentTourStatus: existing?.currentTourStatus ?? 'soon',
      isSelected: input.selectedCourtNo === courtNo,
      isAvailable: Boolean(existing),
    };
  });
}

async function loadJudgeTournamentSnapshotTx(
  client: PoolClient,
  tournamentId: string,
  options?: {
    selectedRoundType?: ThaiRoundType;
    selectedCourtNo?: number;
  },
): Promise<ThaiJudgeTournamentSnapshot> {
  const tournament = await loadTournamentTx(client, tournamentId);
  const rounds = await listRoundsTx(client, tournamentId);
  if (rounds.length === 0) {
    throw new ThaiJudgeError(404, 'Thai round not found');
  }

  const settings = normalizeThaiAdminSettings(tournament.settings);
  const courtCount = settings.courts;
  const roundByType = new Map(rounds.map((round) => [round.roundType, round] as const));
  const requestedRoundType = options?.selectedRoundType ?? (rounds.find((round) => round.roundStatus !== 'finished')?.roundType ?? rounds[0]?.roundType ?? 'r1');

  const roundsView: ThaiJudgeTournamentRoundItem[] = [];
  const roundCourtData = new Map<ThaiRoundType, Array<CourtRow & { currentTourNo: number | null; currentTourStatus: ThaiTourStatus | 'finished' }>>();

  for (const round of rounds) {
    const courts = await listCourtsByRoundTx(client, round.roundId);
    const courtsWithProgress: Array<CourtRow & { currentTourNo: number | null; currentTourStatus: ThaiTourStatus | 'finished' }> = [];
    for (const court of courts) {
      const progress = resolveCourtProgress(await loadToursByCourtTx(client, court.courtId), round.roundStatus);
      courtsWithProgress.push({
        ...court,
        currentTourNo: progress.currentTourNo,
        currentTourStatus: progress.currentTourStatus,
      });
    }
    roundCourtData.set(round.roundType, courtsWithProgress);
  }

  const fallbackRound = roundByType.get(requestedRoundType) ?? rounds.find((round) => round.roundStatus !== 'finished') ?? rounds[0];
  const requestedCourtNo = Math.max(1, Math.trunc(Number(options?.selectedCourtNo) || 0)) || 1;
  const actualCourtNo =
    roundCourtData.get(fallbackRound.roundType)?.find((court) => court.courtNo === requestedCourtNo)?.courtNo ??
    roundCourtData.get(fallbackRound.roundType)?.[0]?.courtNo ??
    1;

  for (const roundType of ['r1', 'r2'] as const) {
    const round = roundByType.get(roundType) ?? null;
    const selectedCourtNo = fallbackRound.roundType === roundType ? actualCourtNo : -1;
    const courts = buildTournamentCourtTabs({
      roundType,
      courtCount,
      selectedCourtNo,
      existingCourts: roundCourtData.get(roundType) ?? [],
    });
    roundsView.push({
      roundId: round?.roundId ?? null,
      roundNo: round?.roundNo ?? (roundType === 'r1' ? 1 : 2),
      roundType,
      label: `ROUND ${roundType === 'r1' ? 1 : 2}`,
      status: round?.roundStatus ?? 'pending',
      isSelected: fallbackRound.roundType === roundType,
      isAvailable: courts.some((court) => court.isAvailable),
      courts,
    });
  }

  const activeCourt =
    roundCourtData.get(fallbackRound.roundType)?.find((court) => court.courtNo === actualCourtNo) ??
    roundCourtData.get(fallbackRound.roundType)?.[0];
  if (!activeCourt) {
    throw new ThaiJudgeError(404, 'Court not found');
  }

  const activeSnapshot = await loadJudgeSnapshotByPinTx(client, activeCourt.pin);

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    tournamentDate: tournament.date,
    tournamentTime: tournament.time,
    tournamentLocation: tournament.location,
    variant: normalizeThaiVariant(tournament.settings),
    pointLimit: activeSnapshot.pointLimit,
    selectedRoundType: fallbackRound.roundType,
    selectedCourtNo: actualCourtNo,
    rounds: roundsView.map((round) => ({
      ...round,
      isSelected: round.roundType === fallbackRound.roundType,
      courts: round.courts.map((court) => ({
        ...court,
        isSelected: round.roundType === fallbackRound.roundType && court.courtNo === actualCourtNo,
      })),
    })),
    activeSnapshot,
  };
}

function appendMatchStats(
  rows: Map<string, ThaiStandingsRow>,
  match: LoadedMatch,
  tourIndex: number,
  variant: string,
  tourCount: number,
): void {
  if (match.team1Score == null || match.team2Score == null || match.status !== 'confirmed') {
    return;
  }

  const diff = match.team1Score - match.team2Score;
  const byTeam = [
    { teamSide: 1 as const, score: match.team1Score, delta: diff },
    { teamSide: 2 as const, score: match.team2Score, delta: -diff },
  ];

  for (const team of byTeam) {
    for (const player of match.players.filter((entry) => entry.teamSide === team.teamSide)) {
      const pool: ThaiStandingsRow['pool'] =
        variant === 'MF' || variant === 'MN' ? player.playerRole : 'all';
      const existing = rows.get(player.playerId) ?? {
        playerId: player.playerId,
        playerName: player.playerName,
        role: player.playerRole,
        pool,
        poolLabel:
          variant === 'MF'
            ? player.playerRole === 'primary'
              ? 'Мужчины'
              : 'Женщины'
            : variant === 'MN'
              ? player.playerRole === 'primary'
                ? 'Профи'
                : 'Новички'
              : 'Общий',
        place: 0,
        tourDiffs: Array.from({ length: tourCount }, () => 0),
        totalDiff: 0,
        pointsP: 0,
        kef: 1,
        totalScored: 0,
        wins: 0,
      };
      existing.tourDiffs[tourIndex] += team.delta;
      existing.totalDiff += team.delta;
      existing.totalScored += team.score;
      existing.pointsP += team.delta > 0 ? (team.delta === 1 ? 10 : team.delta === 2 ? 11 : team.delta <= 4 ? 12 : 13) : 0;
      if (team.delta > 0) existing.wins += 1;
      existing.kef = (60 - existing.totalDiff) <= 0 ? 999.99 : (60 + existing.totalDiff) / (60 - existing.totalDiff);
      rows.set(player.playerId, existing);
    }
  }
}

async function buildCourtAggregateViewTx(
  client: PoolClient,
  input: {
    court: Pick<CourtRow, 'courtId' | 'courtNo' | 'courtLabel' | 'pin'>;
    round: Pick<RoundRow, 'roundStatus' | 'tourCount' | 'settings'>;
    variant: string;
  },
): Promise<CourtAggregateView> {
  const tours = await loadToursByCourtTx(client, input.court.courtId);
  const progress = resolveCourtProgress(tours, input.round.roundStatus);

  const playerNamesById = new Map<string, string>();
  const rows = new Map<string, ThaiStandingsRow>();

  for (const tour of tours) {
    for (const match of tour.matches) {
      for (const player of match.players) {
        if (!playerNamesById.has(player.playerId)) {
          playerNamesById.set(player.playerId, player.playerName);
        }
      }
      appendMatchStats(rows, match, Math.max(0, tour.tourNo - 1), input.variant, input.round.tourCount);
    }
  }

  const standingsGroups = buildThaiStandingsGroups({
    variant: input.variant,
    rows: [...rows.values()],
    thaiRulesPreset: normalizeThaiRulesPreset(input.round.settings),
  });

  return {
    courtId: input.court.courtId,
    courtNo: input.court.courtNo,
    label: input.court.courtLabel,
    pin: input.court.pin,
    judgeUrl: judgeUrlForPin(input.court.pin),
    currentTourNo: progress.currentTourNo,
    currentTourStatus: progress.currentTourStatus,
    playerNames: [...playerNamesById.values()],
    tours: tours.map((tour) => ({
      tourId: tour.tourId,
      tourNo: tour.tourNo,
      status: tour.status,
      matches: tour.matches.map((match) => ({
        matchId: match.matchId,
        matchNo: match.matchNo,
        team1Label: buildTeamView(1, match.players.filter((player) => player.teamSide === 1)).label,
        team2Label: buildTeamView(2, match.players.filter((player) => player.teamSide === 2)).label,
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        status: match.status,
      })),
    })),
    standingsGroups,
  };
}

async function recomputeRoundStatsTx(client: PoolClient, roundId: string): Promise<void> {
  const roundRes = await client.query(
    `
      SELECT r.tournament_id, r.round_type, r.current_tour_no, t.settings
      FROM thai_round r
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.id = $1
      LIMIT 1
    `,
    [roundId],
  );
  const roundRow = roundRes.rows[0];
  if (!roundRow) {
    throw new ThaiJudgeError(404, 'Round not found');
  }
  const settings =
    roundRow.settings && typeof roundRow.settings === 'object' && !Array.isArray(roundRow.settings)
      ? (roundRow.settings as Record<string, unknown>)
      : {};
  const variant = normalizeThaiVariant(settings);
  const roundType = roundTypeFromValue(roundRow.round_type);
  const round: RoundRow = {
    tournamentId: String(roundRow.tournament_id),
    tournamentName: '',
    tournamentDate: '',
    tournamentTime: '',
    tournamentLocation: '',
    settings,
    roundId,
    roundNo: roundType === 'r2' ? 2 : 1,
    roundType,
    roundStatus: 'live',
    currentTourNo: asNum(roundRow.current_tour_no, 1),
    tourCount: normalizeThaiAdminSettings(settings).tourCount,
  };
  const courts = await listCourtsByRoundTx(client, roundId);

  const rowsToPersist: Array<{
    playerId: string;
    totalDiff: number;
    totalScored: number;
    pointsP: number;
    kef: number;
    wins: number;
    position: number;
    zone: ThaiZoneKey | null;
  }> = [];

  for (const court of courts) {
    const aggregate = await buildCourtAggregateViewTx(client, { court, round, variant });
    const zone = roundType === 'r2' ? zoneFromCourtLabel(court.courtLabel) : null;
    for (const group of aggregate.standingsGroups) {
      for (const row of group.rows) {
        rowsToPersist.push({
          playerId: row.playerId,
          totalDiff: row.totalDiff,
          totalScored: row.totalScored,
          pointsP: row.pointsP,
          kef: row.kef,
          wins: row.wins,
          position: row.place,
          zone,
        });
      }
    }
  }

  await client.query(`DELETE FROM thai_player_round_stat WHERE round_id = $1`, [roundId]);
  for (const row of rowsToPersist) {
    await client.query(
      `
        INSERT INTO thai_player_round_stat (
          tournament_id,
          round_id,
          player_id,
          total_diff,
          total_scored,
          points_p,
          kef,
          wins,
          position,
          zone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        String(roundRow.tournament_id),
        roundId,
        row.playerId,
        row.totalDiff,
        row.totalScored,
        row.pointsP,
        row.kef,
        row.wins,
        row.position,
        row.zone,
      ],
    );
  }
}

async function bootstrapThaiRoundTx(
  client: PoolClient,
  tournament: TournamentRow,
  options?: { seed?: number },
): Promise<string> {
  const roster = await listTournamentRosterTx(client, tournament.id);
  const settings = normalizeThaiAdminSettings(tournament.settings, roster.length);
  const rosterError = validateThaiRoster(
    roster.map((player) => ({ id: player.playerId, gender: player.gender })),
    tournament.settings,
  );
  if (rosterError) {
    throw new ThaiJudgeError(400, rosterError);
  }

  const seed = getThaiDrawSeed(tournament.settings, options?.seed);

  const roundRes = await client.query(
    `
      INSERT INTO thai_round (tournament_id, round_no, round_type, status, current_tour_no, seed, started_at)
      VALUES ($1, 1, 'r1', 'live', 1, $2, now())
      RETURNING id
    `,
    [tournament.id, seed],
  );
  const roundId = String(roundRes.rows[0].id);
  const courtRosters = buildThaiRound1CourtRosters({
    players: roster,
    variant: settings.variant,
    courts: settings.courts,
    seed,
    rosterMode: tournament.settings?.thaiRosterMode,
  });

  for (const courtRoster of courtRosters) {
    const courtRes = await client.query(
      `
        INSERT INTO thai_court (tournament_id, round_id, court_no, label, pin_code, status)
        VALUES ($1, $2, $3, $4, $5, 'live')
        RETURNING id
      `,
      [
        tournament.id,
        roundId,
        courtRoster.courtNo,
        courtRoster.courtLabel,
        buildDeterministicCourtPin(tournament.id, 'r1', courtRoster.courtNo),
      ],
    );
    const courtId = String(courtRes.rows[0].id);
    const tours = buildThaiCourtBootstrapTours({
      players: courtRoster.players.map(({ playerId, playerName, gender }) => ({ playerId, playerName, gender })),
      variant: settings.variant,
      tourCount: settings.tourCount,
      seed: seed + courtRoster.courtNo - 1,
    });

    for (const tour of tours) {
      const tourRes = await client.query(
        `
          INSERT INTO thai_tour (court_id, tour_no, status)
          VALUES ($1, $2, 'pending')
          RETURNING id
        `,
        [courtId, tour.tourNo],
      );
      const tourId = String(tourRes.rows[0].id);

      for (const match of tour.matches) {
        const matchRes = await client.query(
          `
            INSERT INTO thai_match (tour_id, match_no, status)
            VALUES ($1, $2, 'pending')
            RETURNING id
          `,
          [tourId, match.matchNo],
        );
        const matchId = String(matchRes.rows[0].id);
        for (const [teamSide, team] of [
          [1, match.team1],
          [2, match.team2],
        ] as const) {
          for (const player of team.players) {
            await client.query(
              `
                INSERT INTO thai_match_player (match_id, player_id, team_side, player_role)
                VALUES ($1, $2, $3, $4)
              `,
              [matchId, player.playerId, teamSide, player.role],
            );
          }
        }
      }
    }
  }

  await recomputeRoundStatsTx(client, roundId);
  return roundId;
}

async function ensureRoundTx(client: PoolClient, tournamentId: string): Promise<string> {
  const existingRoundId = await loadRoundIdTx(client, tournamentId, 'r1');
  if (existingRoundId) return existingRoundId;
  const tournament = await loadTournamentTx(client, tournamentId);
  return bootstrapThaiRoundTx(client, tournament);
}

async function loadJudgeSummaryTx(client: PoolClient, tournamentId: string): Promise<ThaiJudgeStateSummary> {
  const rounds = await listRoundsTx(client, tournamentId);
  const round = rounds.find((entry) => entry.roundStatus !== 'finished') ?? rounds[rounds.length - 1];
  if (!round) {
    throw new ThaiJudgeError(404, 'Thai round not found');
  }
  const settings = normalizeThaiAdminSettings(round.settings);
  const courts = await listCourtsByRoundTx(client, round.roundId);

  const summaryCourts: ThaiJudgeCourtSummary[] = [];
  for (const court of courts) {
    const aggregate = await buildCourtAggregateViewTx(client, {
      court,
      round,
      variant: settings.variant,
    });
    summaryCourts.push({
      courtId: aggregate.courtId,
      courtNo: aggregate.courtNo,
      label: aggregate.label,
      pin: aggregate.pin,
      judgeUrl: aggregate.judgeUrl,
      currentTourNo: aggregate.currentTourNo,
      currentTourStatus: aggregate.currentTourStatus,
      playerNames: aggregate.playerNames,
    });
  }

  return {
    tournamentId: round.tournamentId,
    tournamentName: round.tournamentName,
    tournamentDate: round.tournamentDate,
    tournamentTime: round.tournamentTime,
    tournamentLocation: round.tournamentLocation,
    variant: settings.variant,
    pointLimit: getThaiPointLimitForRound(round.settings, round.roundType),
    roundId: round.roundId,
    roundNo: round.roundNo,
    roundType: round.roundType,
    roundStatus: round.roundStatus,
    currentTourNo: round.currentTourNo,
    tourCount: round.tourCount,
    courtCount: summaryCourts.length,
    courts: summaryCourts,
  };
}

async function loadJudgeSummaryIfExistsTx(
  client: PoolClient,
  tournamentId: string,
): Promise<ThaiJudgeStateSummary | null> {
  const roundId = await loadRoundIdTx(client, tournamentId);
  if (!roundId) return null;
  return loadJudgeSummaryTx(client, tournamentId);
}

async function persistThaiJudgeBootstrapSignatureTx(
  client: PoolClient,
  tournament: TournamentRow,
  signature: string,
): Promise<void> {
  const nextSettings = {
    ...tournament.settings,
    thaiJudgeModule: normalizeThaiJudgeModule(
      tournament.settings.thaiJudgeModule,
      THAI_JUDGE_MODULE_NEXT,
    ),
    thaiJudgeBootstrapSignature: signature,
  };
  await client.query(
    `
      UPDATE tournaments
      SET settings = $2::jsonb
      WHERE id = $1
    `,
    [tournament.id, JSON.stringify(nextSettings)],
  );
}

function getTournamentStatusKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function validateThaiBootstrapPreflight(
  tournament: TournamentRow,
  participants: TournamentStructureParticipant[],
): { signature: string; storedSignature: string | null } {
  if (normalizeThaiJudgeModule(tournament.settings.thaiJudgeModule) !== THAI_JUDGE_MODULE_NEXT) {
    throw new ThaiJudgeError(409, 'Thai Next bootstrap is disabled for this tournament');
  }

  const statusKey = getTournamentStatusKey(tournament.status);
  if (statusKey === 'finished') {
    throw new ThaiJudgeError(409, 'Thai judge launch is blocked for finished tournaments');
  }
  if (statusKey === 'cancelled') {
    throw new ThaiJudgeError(409, 'Thai judge launch is blocked for cancelled tournaments');
  }

  const setupError = validateThaiNextTournamentSetup({
    format: tournament.format,
    settings: tournament.settings,
    participants,
  });
  if (setupError) {
    throw new ThaiJudgeError(400, setupError);
  }

  const signature = buildThaiJudgeStructuralSignature({
    settings: tournament.settings,
    participants,
  });
  const storedSignature = normalizeThaiJudgeBootstrapSignature(
    tournament.settings.thaiJudgeBootstrapSignature,
  );
  if (storedSignature && storedSignature !== signature) {
    throw new ThaiJudgeError(
      409,
      'structural Thai Next state already initialized; reset/recreate flow required',
      THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
    );
  }

  return { signature, storedSignature };
}

async function loadRoundViewsTx(client: PoolClient, tournamentId: string): Promise<ThaiOperatorRoundView[]> {
  const rounds = await listRoundsTx(client, tournamentId);
  const views: ThaiOperatorRoundView[] = [];

  for (const round of rounds) {
    const variant = normalizeThaiVariant(round.settings);
    const courts = await listCourtsByRoundTx(client, round.roundId);
    const courtViews: ThaiOperatorCourtRoundView[] = [];

    for (const court of courts) {
      const aggregate = await buildCourtAggregateViewTx(client, {
        court,
        round,
        variant,
      });
      courtViews.push({
        courtId: aggregate.courtId,
        courtNo: aggregate.courtNo,
        label: aggregate.label,
        pin: aggregate.pin,
        judgeUrl: aggregate.judgeUrl,
        currentTourNo: aggregate.currentTourNo,
        currentTourStatus: aggregate.currentTourStatus,
        playerNames: aggregate.playerNames,
        tours: aggregate.tours,
        standingsGroups: aggregate.standingsGroups,
      });
    }

    views.push({
      roundId: round.roundId,
      roundNo: round.roundNo,
      roundType: round.roundType,
      roundStatus: round.roundStatus,
      currentTourNo: round.currentTourNo,
      tourCount: round.tourCount,
      courts: courtViews,
      zones:
        round.roundType === 'r2'
          ? courtViews
              .map((court) => {
                const zone = zoneFromCourtLabel(court.label);
                if (!zone) return null;
                return {
                  zone,
                  label: thaiZoneLabel(zone),
                  courtId: court.courtId,
                  courtNo: court.courtNo,
                  courtLabel: court.label,
                  pin: court.pin,
                  judgeUrl: court.judgeUrl,
                  playerNames: court.playerNames,
                };
              })
              .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          : [],
    });
  }

  return views;
}

function buildFinalResults(rounds: ThaiOperatorRoundView[]): ThaiOperatorFinalZoneResult[] {
  const latestRound = [...rounds].reverse().find((round) => round.roundStatus === 'finished');
  if (!latestRound) return [];
  if (latestRound.roundType === 'r2') {
    return latestRound.courts.map((court) => {
      const flattened = court.standingsGroups.flatMap((group) => group.rows);
      const winners = court.standingsGroups.flatMap((group) => group.rows.slice(0, 1));
      return {
        zone: zoneFromCourtLabel(court.label) ?? 'hard',
        label: court.label,
        winners,
        top4: flattened.slice(0, 4),
      };
    });
  }

  return latestRound.courts.map((court) => ({
    zone: 'hard',
    label: court.label,
    winners: court.standingsGroups.flatMap((group) => group.rows.slice(0, 1)),
    top4: court.standingsGroups.flatMap((group) => group.rows).slice(0, 4),
  }));
}

function buildProgress(rounds: ThaiOperatorRoundView[]): ThaiOperatorProgressRow[] {
  const r1 = rounds.find((round) => round.roundType === 'r1' && round.roundStatus === 'finished');
  const r2 = rounds.find((round) => round.roundType === 'r2' && round.roundStatus === 'finished');
  if (!r1 || !r2) return [];

  return buildThaiProgressRows({
    r1: r1.courts.flatMap((court) => court.standingsGroups),
    r2: r2.courts.flatMap((court) => court.standingsGroups),
  });
}

async function loadThaiOperatorStateSummaryTx(client: PoolClient, tournamentId: string): Promise<ThaiOperatorStateSummary | null> {
  const tournament = await loadTournamentTx(client, tournamentId);
  const rounds = await loadRoundViewsTx(client, tournamentId);
  if (!rounds.length) return null;

  const hasR2 = rounds.some((round) => round.roundType === 'r2');
  const r1 = rounds.find((round) => round.roundType === 'r1') ?? null;
  const r2 = rounds.find((round) => round.roundType === 'r2') ?? null;
  const roster = await listTournamentRosterTx(client, tournamentId);
  const variant = normalizeThaiVariant(tournament.settings);

  let stage: ThaiOperatorStage = 'setup';
  if (r2) {
    stage = r2.roundStatus === 'finished' ? 'r2_finished' : 'r2_live';
  } else if (r1) {
    stage = r1.roundStatus === 'finished' ? 'r1_finished' : 'r1_live';
  }

  const rosterPrimaryCount =
    variant === 'MF' || variant === 'MN'
      ? Math.floor(roster.length / 2)
      : roster.length;
  const rosterSecondaryCount =
    variant === 'MF' || variant === 'MN'
      ? roster.length - rosterPrimaryCount
      : 0;

  /** Только до первого подтверждённого тура на любом корте: иначе риск сброса уже идущей игры. */
  const canReshuffleR1 =
    Boolean(r1) &&
    !hasR2 &&
    r1!.courts.every((court) => court.tours.every((tour) => tour.status !== 'confirmed')) &&
    r1!.courts.every((court) => court.currentTourNo === 1);

  const canFinishR1 =
    Boolean(r1) &&
    !hasR2 &&
    r1!.courts.every((court) => court.tours.every((tour) => tour.status === 'confirmed')) &&
    r1!.roundStatus !== 'finished';

  const canSeedR2 =
    Boolean(r1) &&
    r1!.roundStatus === 'finished' &&
    !hasR2 &&
    isR2Supported(variant, r1!.courts.length);

  const canFinishR2 =
    Boolean(r2) &&
    r2!.courts.every((court) => court.tours.every((tour) => tour.status === 'confirmed')) &&
    r2!.roundStatus !== 'finished';

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    tournamentDate: tournament.date,
    tournamentTime: tournament.time,
    tournamentLocation: tournament.location,
    variant,
    pointLimit: getThaiPointLimitForRound(tournament.settings, 'r1'),
    pointLimitR1: getThaiPointLimitForRound(tournament.settings, 'r1'),
    pointLimitR2: getThaiPointLimitForRound(tournament.settings, 'r2'),
    tourCount: normalizeThaiAdminSettings(tournament.settings, roster.length).tourCount,
    stage,
    rosterTotal: roster.length,
    rosterPrimaryCount,
    rosterSecondaryCount,
    canBootstrap: false,
    canReshuffleR1,
    canFinishR1,
    canSeedR2,
    canFinishR2,
    rounds,
    finalResults: buildFinalResults(rounds),
    progress: buildProgress(rounds),
  };
}

async function loadJudgeSnapshotByPinTx(client: PoolClient, pin: string): Promise<ThaiJudgeSnapshot> {
  const court = await loadCourtRoundByPinTx(client, pin);
  const variant = normalizeThaiVariant(court.settings);
  const pointLimit = getThaiPointLimitForRound(court.settings, court.roundType);
  const aggregate = await buildCourtAggregateViewTx(client, {
    court,
    round: court,
    variant,
  });
  const roundNav = await loadJudgeRoundNavTx(client, {
    tournamentId: court.tournamentId,
    activeRoundId: court.roundId,
    activeCourtNo: court.courtNo,
  });
  const courtNav = await loadJudgeCourtNavTx(client, {
    roundId: court.roundId,
    activeCourtId: court.courtId,
    roundStatus: court.roundStatus,
  });
  const tours = await loadToursByCourtTx(client, court.courtId);
  const progress = resolveCourtProgress(tours, court.roundStatus);

  const tourViews = tours.map((tour) => ({
    tourId: tour.tourId,
    tourNo: tour.tourNo,
    status: tour.status,
    isEditable:
      court.roundStatus !== 'finished' &&
      tour.tourNo === progress.currentTourNo &&
      tour.status === 'pending',
    matches: buildMatchViews(tour.matches),
  }));
  const activeTourView = tourViews.find((tour) => tour.tourNo === progress.currentTourNo) ?? tourViews[tourViews.length - 1];

  if (court.roundStatus === 'finished' || court.tourCount < 1) {
    return {
      kind: 'finished',
      tournamentId: court.tournamentId,
      tournamentName: court.tournamentName,
      tournamentDate: court.tournamentDate,
      tournamentTime: court.tournamentTime,
      tournamentLocation: court.tournamentLocation,
      variant,
      pointLimit,
      roundId: court.roundId,
      roundNo: court.roundNo,
      roundType: court.roundType,
      roundStatus: court.roundStatus,
      tourCount: court.tourCount,
      currentTourNo: progress.currentTourNo,
      courtId: court.courtId,
      courtLabel: court.courtLabel,
      courtNo: court.courtNo,
      pin: court.pin,
      tourId: activeTourView?.tourId ?? null,
      tourNo: activeTourView?.tourNo ?? null,
      tourStatus: activeTourView?.status ?? null,
      roundNav,
      courtNav,
      pendingCourtCount: 0,
      message: 'Раунд завершён. Судейский ввод больше не требуется.',
      tours: tourViews,
      matches: activeTourView?.matches ?? [],
      standingsGroups: aggregate.standingsGroups,
    };
  }

  if (progress.isCourtFinished) {
    return {
      kind: 'finished',
      tournamentId: court.tournamentId,
      tournamentName: court.tournamentName,
      tournamentDate: court.tournamentDate,
      tournamentTime: court.tournamentTime,
      tournamentLocation: court.tournamentLocation,
      variant,
      pointLimit,
      roundId: court.roundId,
      roundNo: court.roundNo,
      roundType: court.roundType,
      roundStatus: court.roundStatus,
      tourCount: court.tourCount,
      currentTourNo: progress.currentTourNo,
      courtId: court.courtId,
      courtLabel: court.courtLabel,
      courtNo: court.courtNo,
      pin: court.pin,
      tourId: progress.currentTour?.tourId ?? null,
      tourNo: progress.currentTourNo,
      tourStatus: progress.currentTour?.status ?? null,
      roundNav,
      courtNav,
      pendingCourtCount: 0,
      message: 'Все туры этого корта подтверждены.',
      tours: tourViews,
      matches: activeTourView?.matches ?? [],
      standingsGroups: aggregate.standingsGroups,
    };
  }

  return {
    kind: 'active',
    tournamentId: court.tournamentId,
    tournamentName: court.tournamentName,
    tournamentDate: court.tournamentDate,
    tournamentTime: court.tournamentTime,
    tournamentLocation: court.tournamentLocation,
    variant,
    pointLimit,
    roundId: court.roundId,
    roundNo: court.roundNo,
    roundType: court.roundType,
    roundStatus: court.roundStatus,
    tourCount: court.tourCount,
    currentTourNo: progress.currentTourNo,
    courtId: court.courtId,
    courtLabel: court.courtLabel,
    courtNo: court.courtNo,
    pin: court.pin,
    tourId: progress.currentTour?.tourId ?? null,
    tourNo: progress.currentTourNo,
    tourStatus: progress.currentTour?.status ?? null,
    roundNav,
    courtNav,
    pendingCourtCount: 0,
    message: `Введите финальный счёт двух матчей до ${pointLimit} очков.`,
    tours: tourViews,
    matches: activeTourView?.matches ?? [],
    standingsGroups: aggregate.standingsGroups,
  };
}

function normalizeConfirmPayload(payload: ThaiJudgeConfirmPayload): Map<string, { team1Score: number; team2Score: number }> {
  if (!payload || !Array.isArray(payload.matches)) {
    throw new ThaiJudgeError(400, 'Invalid match payload');
  }
  const result = new Map<string, { team1Score: number; team2Score: number }>();
  for (const row of payload.matches) {
    const matchId = String(row?.matchId || '').trim();
    if (!matchId || result.has(matchId)) {
      throw new ThaiJudgeError(400, 'Invalid match payload');
    }
    const team1Score = Math.max(0, Math.trunc(Number(row?.team1Score) || 0));
    const team2Score = Math.max(0, Math.trunc(Number(row?.team2Score) || 0));
    result.set(matchId, { team1Score, team2Score });
  }
  return result;
}

export async function ensureThaiJudgeState(tournamentId: string): Promise<ThaiJudgeStateSummary> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withTransaction(async (client) => {
    await ensureRoundTx(client, normalizedId);
    return loadJudgeSummaryTx(client, normalizedId);
  });
}

export async function getThaiJudgeStateSummary(tournamentId: string): Promise<ThaiJudgeStateSummary | null> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withClient((client) => loadJudgeSummaryIfExistsTx(client, normalizedId));
}

export async function getThaiJudgeTournamentSnapshot(
  tournamentId: string,
  options?: {
    selectedRoundType?: ThaiRoundType;
    selectedCourtNo?: number;
  },
): Promise<ThaiJudgeTournamentSnapshot> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }
  return withClient((client) => loadJudgeTournamentSnapshotTx(client, normalizedId, options));
}

export async function getThaiJudgeTournamentSnapshotByPin(pin: string): Promise<ThaiJudgeTournamentSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  if (!normalizedPin) {
    throw new ThaiJudgeError(400, 'pin is required');
  }
  return withClient(async (client) => {
    const court = await loadCourtRoundByPinTx(client, normalizedPin);
    return loadJudgeTournamentSnapshotTx(client, court.tournamentId, {
      selectedRoundType: court.roundType,
      selectedCourtNo: court.courtNo,
    });
  });
}

export async function getThaiOperatorStateSummary(tournamentId: string): Promise<ThaiOperatorStateSummary | null> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withClient((client) => loadThaiOperatorStateSummaryTx(client, normalizedId));
}

export async function bootstrapThaiJudgeState(
  tournamentId: string,
  options?: { seed?: number },
): Promise<ThaiJudgeStateSummary> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withTransaction(async (client) => {
    const tournament = await loadTournamentTx(client, normalizedId, { forUpdate: true });
    const participants = await listTournamentStructureParticipantsTx(client, normalizedId);
    const { signature, storedSignature } = validateThaiBootstrapPreflight(tournament, participants);

    const existingRoundId = await loadRoundIdTx(client, normalizedId, 'r1');
    if (!existingRoundId) {
      await bootstrapThaiRoundTx(client, tournament, { seed: options?.seed });
    }

    if (!storedSignature) {
      await persistThaiJudgeBootstrapSignatureTx(client, tournament, signature);
    }

    return loadJudgeSummaryTx(client, normalizedId);
  });
}

export async function resetThaiJudgeState(tournamentId: string): Promise<{
  tournamentId: string;
  removedRoundCount: number;
  removedCourtCount: number;
  removedTourCount: number;
  removedMatchCount: number;
  removedMatchPlayerCount: number;
  removedStatCount: number;
  clearedSignature: boolean;
}> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withTransaction((client) => resetThaiJudgeStateTx(client, normalizedId));
}

async function resetThaiJudgeStateTx(
  client: PoolClient,
  tournamentId: string,
): Promise<{
  tournamentId: string;
  removedRoundCount: number;
  removedCourtCount: number;
  removedTourCount: number;
  removedMatchCount: number;
  removedMatchPlayerCount: number;
  removedStatCount: number;
  clearedSignature: boolean;
}> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  const tournament = await loadTournamentTx(client, normalizedId, { forUpdate: true });
  const statsResult = await client.query(`DELETE FROM thai_player_round_stat WHERE tournament_id = $1`, [normalizedId]);
  const matchPlayersResult = await client.query(
    `
      DELETE FROM thai_match_player tmp
      USING thai_match tm, thai_tour tt, thai_court tc, thai_round tr
      WHERE tmp.match_id = tm.id
        AND tm.tour_id = tt.id
        AND tt.court_id = tc.id
        AND tc.round_id = tr.id
        AND tr.tournament_id = $1
    `,
    [normalizedId],
  );
  const matchesResult = await client.query(
    `
      DELETE FROM thai_match tm
      USING thai_tour tt, thai_court tc, thai_round tr
      WHERE tm.tour_id = tt.id
        AND tt.court_id = tc.id
        AND tc.round_id = tr.id
        AND tr.tournament_id = $1
    `,
    [normalizedId],
  );
  const toursResult = await client.query(
    `
      DELETE FROM thai_tour tt
      USING thai_court tc, thai_round tr
      WHERE tt.court_id = tc.id
        AND tc.round_id = tr.id
        AND tr.tournament_id = $1
    `,
    [normalizedId],
  );
  const courtsResult = await client.query(
    `
      DELETE FROM thai_court tc
      USING thai_round tr
      WHERE tc.round_id = tr.id
        AND tr.tournament_id = $1
    `,
    [normalizedId],
  );
  const roundsResult = await client.query(`DELETE FROM thai_round WHERE tournament_id = $1`, [normalizedId]);
  const settings = {
    ...tournament.settings,
    thaiJudgeBootstrapSignature: null,
  };
  await client.query(
    `
      UPDATE tournaments
      SET settings = $2::jsonb
      WHERE id = $1
    `,
    [normalizedId, JSON.stringify(settings)],
  );
  return {
    tournamentId: normalizedId,
    removedRoundCount: roundsResult.rowCount ?? 0,
    removedCourtCount: courtsResult.rowCount ?? 0,
    removedTourCount: toursResult.rowCount ?? 0,
    removedMatchCount: matchesResult.rowCount ?? 0,
    removedMatchPlayerCount: matchPlayersResult.rowCount ?? 0,
    removedStatCount: statsResult.rowCount ?? 0,
    clearedSignature: normalizeThaiJudgeBootstrapSignature(tournament.settings.thaiJudgeBootstrapSignature) != null,
  };
}

export async function getThaiJudgeSnapshotByPin(pin: string): Promise<ThaiJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  if (!normalizedPin) {
    throw new ThaiJudgeError(400, 'pin is required');
  }
  return withClient((client) => loadJudgeSnapshotByPinTx(client, normalizedPin));
}

export async function getThaiDrawPreview(tournamentId: string, seed?: number): Promise<ThaiDrawPreview> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }
  return withClient((client) => buildThaiDrawPreviewTx(client, normalizedId, seed));
}

export async function getThaiR2SeedDraft(tournamentId: string): Promise<ThaiR2SeedDraft> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }
  return withClient((client) => buildThaiR2SeedDraftTx(client, normalizedId));
}

export async function confirmThaiR2Seed(
  tournamentId: string,
  payload: unknown,
): Promise<ThaiOperatorActionResult> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withTransaction(async (client) => {
    const tournament = await loadTournamentTx(client, normalizedId, { forUpdate: true });
    const normalizedZones = normalizeThaiR2SeedDraftInput(payload);
    const draft = await buildThaiR2SeedDraftTx(client, normalizedId);
    assertThaiR2SeedMatchesDraft(draft, normalizedZones);
    const hydratedZones = hydrateThaiR2SeedFromDraft(draft, normalizedZones);
    const variant = normalizeThaiVariant(tournament.settings);
    const expectedZones = getThaiExpectedZones(draft.zones.length);
    if (hydratedZones.length !== expectedZones.length) {
      throw new ThaiJudgeError(400, `R2 seeding requires exactly ${expectedZones.length} zones`);
    }

    const seenPlayerIds = new Set<string>();
    const seededCourts = hydratedZones.map((zone, index) => {
      if (zone.zone !== expectedZones[index]) {
        throw new ThaiJudgeError(400, 'R2 zones must stay in HARD / ADVANCE / MEDIUM / LIGHT order');
      }
      if (zone.players.length !== 8) {
        throw new ThaiJudgeError(400, `${thaiZoneLabel(zone.zone)} must contain exactly 8 players`);
      }
      if (variant === 'MF' || variant === 'MN') {
        const primaryCount = zone.players.filter((player) => player.role === 'primary').length;
        const secondaryCount = zone.players.filter((player) => player.role === 'secondary').length;
        if (primaryCount !== 4 || secondaryCount !== 4) {
          throw new ThaiJudgeError(400, `${thaiZoneLabel(zone.zone)} must contain 4 primary and 4 secondary players`);
        }
      }
      for (const player of zone.players) {
        if (seenPlayerIds.has(player.playerId)) {
          throw new ThaiJudgeError(400, 'Each player can appear only once in R2 seeding');
        }
        seenPlayerIds.add(player.playerId);
      }
      let sortedPlayers = [...zone.players];
      if (variant === 'MF' || variant === 'MN') {
        sortedPlayers = [
          ...zone.players.filter((p) => p.role === 'primary'),
          ...zone.players.filter((p) => p.role === 'secondary'),
        ];
      }
      return {
        zone: zone.zone,
        courtNo: index + 1,
        players: sortedPlayers.map(({ playerId, playerName, gender }) => ({ playerId, playerName, gender })),
      };
    });

    await materializeThaiRound2Tx(client, tournament, seededCourts);
    return {
      success: true,
      state: (await loadThaiOperatorStateSummaryTx(client, normalizedId))!,
      judgeState: await loadJudgeSummaryIfExistsTx(client, normalizedId),
    };
  });
}

async function buildThaiDrawPreviewTx(
  client: PoolClient,
  tournamentId: string,
  requestedSeed?: unknown,
): Promise<ThaiDrawPreview> {
  const tournament = await loadTournamentTx(client, tournamentId);
  const roster = await listTournamentRosterTx(client, tournamentId);
  const settings = normalizeThaiAdminSettings(tournament.settings, roster.length);
  const rosterError = validateThaiRoster(
    roster.map((player) => ({ id: player.playerId, gender: player.gender })),
    tournament.settings,
  );
  if (rosterError) {
    throw new ThaiJudgeError(400, rosterError);
  }

  const seed = getThaiDrawSeed(tournament.settings, requestedSeed);
  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    variant: settings.variant,
    seed,
    courts: buildThaiRound1CourtRosters({
      players: roster,
      variant: settings.variant,
      courts: settings.courts,
      seed,
      rosterMode: tournament.settings?.thaiRosterMode,
    }),
  };
}

function buildR2PlacementMap(round: ThaiOperatorRoundView): Map<string, {
  poolLabel: string;
  sourceCourtLabel: string;
  sourcePlace: number;
  role: ThaiPlayerRole;
}> {
  const placement = new Map<string, {
    poolLabel: string;
    sourceCourtLabel: string;
    sourcePlace: number;
    role: ThaiPlayerRole;
  }>();

  for (const court of round.courts) {
    for (const group of court.standingsGroups) {
      for (const row of group.rows) {
        placement.set(row.playerId, {
          poolLabel: row.poolLabel,
          sourceCourtLabel: court.label,
          sourcePlace: row.place,
          role: row.role,
        });
      }
    }
  }
  return placement;
}

async function buildThaiR2SeedDraftTx(client: PoolClient, tournamentId: string): Promise<ThaiR2SeedDraft> {
  const tournament = await loadTournamentTx(client, tournamentId);
  const roundViews = await loadRoundViewsTx(client, tournamentId);
  const r1View = roundViews.find((round) => round.roundType === 'r1');
  const r2View = roundViews.find((round) => round.roundType === 'r2');
  if (!r1View) {
    throw new ThaiJudgeError(409, 'R1 standings are not available');
  }
  if (r1View.roundStatus !== 'finished') {
    throw new ThaiJudgeError(409, 'R1 must be finished before R2 seeding');
  }
  if (r2View) {
    throw new ThaiJudgeError(409, 'R2 already exists');
  }

  const roster = await listTournamentRosterTx(client, tournamentId);
  const variant = normalizeThaiVariant(tournament.settings);
  if (!isR2Supported(variant, r1View.courts.length)) {
    throw new ThaiJudgeError(409, 'Thai R2 seeding requires from 1 to 4 R1 courts');
  }

  const playerById = new Map(roster.map((player) => [player.playerId, player]));
  const placementByPlayerId = buildR2PlacementMap(r1View);
  const seededCourts = seedThaiRound2Courts({
    variant,
    r1Courts: r1View.courts.map((court) => ({
      courtId: court.courtId,
      courtNo: court.courtNo,
      courtLabel: court.label,
      groups: court.standingsGroups,
    })),
    playerById,
    thaiRulesPreset: normalizeThaiRulesPreset(tournament.settings),
  });

  const zones: ThaiR2SeedZone[] = seededCourts.map((seededCourt) => ({
    zone: seededCourt.zone,
    label: thaiZoneLabel(seededCourt.zone),
    courtNo: seededCourt.courtNo,
    players: seededCourt.players.map((player) => {
      const placement = placementByPlayerId.get(player.playerId);
      if (!placement) {
        throw new ThaiJudgeError(409, `Missing R1 placement for player ${player.playerName}`);
      }
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        gender: player.gender,
        role: placement.role,
        poolLabel: placement.poolLabel,
        sourceCourtLabel: placement.sourceCourtLabel,
        sourcePlace: placement.sourcePlace,
      };
    }),
  }));

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    variant,
    zones,
  };
}

function normalizeThaiZone(value: unknown): ThaiZoneKey {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hard' || normalized === 'advance' || normalized === 'medium') return normalized;
  return 'light';
}

function normalizeThaiR2SeedDraftInput(
  payload: unknown,
): Array<{ zone: ThaiZoneKey; courtNo: number; players: ThaiR2SeedPlayer[] }> {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? getThaiExpectedZones(
          Object.keys(payload as Record<string, unknown>).filter((zoneKey) =>
            ['hard', 'advance', 'medium', 'light'].includes(zoneKey),
          ).length || 4,
        ).map((zoneKey, index) => ({
          zone: zoneKey,
          courtNo: index + 1,
          players: Array.isArray((payload as Record<string, unknown>)[zoneKey])
            ? (payload as Record<string, unknown>)[zoneKey]
            : [],
        }))
      : null;
  if (!source) {
    throw new ThaiJudgeError(400, 'R2 seed payload must contain zones');
  }
  return source.map((zone, index) => {
    const record = zone && typeof zone === 'object' ? zone as Record<string, unknown> : {};
    const playersInput = Array.isArray(record.players) ? record.players : [];
    if (!playersInput.length) {
      throw new ThaiJudgeError(400, 'Each R2 zone must contain players');
    }
    const players = playersInput.map((player) => {
      if (typeof player === 'string') {
        const playerId = String(player || '').trim();
        if (!playerId) {
          throw new ThaiJudgeError(400, 'Each R2 seed player must have id');
        }
        return {
          playerId,
          playerName: playerId,
          gender: 'M' as const,
          role: 'primary' as const,
          poolLabel: '',
          sourceCourtLabel: '',
          sourcePlace: 1,
        } satisfies ThaiR2SeedPlayer;
      }
      const item = player && typeof player === 'object' ? player as Record<string, unknown> : {};
      const playerId = String(item.playerId || '').trim();
      const playerName = String(item.playerName || '').trim();
      if (!playerId) {
        throw new ThaiJudgeError(400, 'Each R2 seed player must have id');
      }
      return {
        playerId,
        playerName: playerName || playerId,
        gender: String(item.gender || 'M').trim().toUpperCase() === 'W' ? 'W' : 'M',
        role: String(item.role || '').trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary',
        poolLabel: String(item.poolLabel || '').trim(),
        sourceCourtLabel: String(item.sourceCourtLabel || '').trim(),
        sourcePlace: Math.max(1, Math.trunc(Number(item.sourcePlace) || 1)),
      } satisfies ThaiR2SeedPlayer;
    });
    return {
      zone: normalizeThaiZone(record.zone),
      courtNo: Math.max(1, Math.trunc(Number(record.courtNo) || index + 1)),
      players,
    };
  });
}

function assertThaiR2SeedMatchesDraft(
  draft: ThaiR2SeedDraft,
  zones: Array<{ zone: ThaiZoneKey; courtNo: number; players: ThaiR2SeedPlayer[] }>,
): void {
  const draftPlayerIds = new Set(draft.zones.flatMap((zone) => zone.players.map((player) => player.playerId)));
  const submittedPlayerIds = new Set(zones.flatMap((zone) => zone.players.map((player) => player.playerId)));
  if (draftPlayerIds.size !== submittedPlayerIds.size) {
    throw new ThaiJudgeError(400, 'R2 seeding payload does not match computed draft');
  }
  for (const playerId of draftPlayerIds) {
    if (!submittedPlayerIds.has(playerId)) {
      throw new ThaiJudgeError(400, 'R2 seeding payload does not match computed draft');
    }
  }
}

function hydrateThaiR2SeedFromDraft(
  draft: ThaiR2SeedDraft,
  zones: Array<{ zone: ThaiZoneKey; courtNo: number; players: ThaiR2SeedPlayer[] }>,
): Array<{ zone: ThaiZoneKey; courtNo: number; players: ThaiR2SeedPlayer[] }> {
  const playersById = new Map(
    draft.zones.flatMap((zone) => zone.players.map((player) => [player.playerId, player] as const)),
  );
  return zones.map((zone) => ({
    ...zone,
    players: zone.players.map((player) => {
      const draftPlayer = playersById.get(player.playerId);
      if (!draftPlayer) {
        throw new ThaiJudgeError(400, 'R2 seeding payload does not match computed draft');
      }
      return draftPlayer;
    }),
  }));
}

async function materializeThaiRound2Tx(
  client: PoolClient,
  tournament: TournamentRow,
  seededCourts: Array<{ zone: ThaiZoneKey; courtNo: number; players: ThaiBootstrapCourtPlayer[] }>,
): Promise<void> {
  const roster = await listTournamentRosterTx(client, tournament.id);
  const settings = normalizeThaiAdminSettings(tournament.settings, roster.length);
  const roundRes = await client.query(
    `
      INSERT INTO thai_round (tournament_id, round_no, round_type, status, current_tour_no, seed, started_at)
      VALUES ($1, 2, 'r2', 'live', 1, $2, now())
      RETURNING id
    `,
    [tournament.id, getThaiBaseSeed(tournament.settings) + 100],
  );
  const roundId = String(roundRes.rows[0].id);

  for (const seededCourt of seededCourts) {
    const zoneLabel = thaiZoneLabel(seededCourt.zone);
    const courtRes = await client.query(
      `
        INSERT INTO thai_court (tournament_id, round_id, court_no, label, pin_code, status)
        VALUES ($1, $2, $3, $4, $5, 'live')
        RETURNING id
      `,
      [
        tournament.id,
        roundId,
        seededCourt.courtNo,
        zoneLabel,
        buildDeterministicCourtPin(tournament.id, 'r2', seededCourt.courtNo),
      ],
    );
    const courtId = String(courtRes.rows[0].id);
    const tours = buildThaiCourtBootstrapTours({
      players: seededCourt.players,
      variant: normalizeThaiVariant(tournament.settings),
      tourCount: settings.tourCount,
      seed: 200 + seededCourt.courtNo,
    });

    for (const tour of tours) {
      const tourRes = await client.query(
        `
          INSERT INTO thai_tour (court_id, tour_no, status)
          VALUES ($1, $2, 'pending')
          RETURNING id
        `,
        [courtId, tour.tourNo],
      );
      const tourId = String(tourRes.rows[0].id);

      for (const match of tour.matches) {
        const matchRes = await client.query(
          `
            INSERT INTO thai_match (tour_id, match_no, status)
            VALUES ($1, $2, 'pending')
            RETURNING id
          `,
          [tourId, match.matchNo],
        );
        const matchId = String(matchRes.rows[0].id);
        for (const [teamSide, team] of [
          [1, match.team1],
          [2, match.team2],
        ] as const) {
          for (const player of team.players) {
            await client.query(
              `
                INSERT INTO thai_match_player (match_id, player_id, team_side, player_role)
                VALUES ($1, $2, $3, $4)
              `,
              [matchId, player.playerId, teamSide, player.role],
            );
          }
        }
      }
    }
  }

  await recomputeRoundStatsTx(client, roundId);
}

async function finishThaiRoundTx(client: PoolClient, tournamentId: string, roundType: ThaiRoundType): Promise<void> {
  const round = await loadRoundByTypeTx(client, tournamentId, roundType, { forUpdate: true });
  if (!round) {
    throw new ThaiJudgeError(409, `${roundType.toUpperCase()} is not initialized`);
  }
  if (round.roundStatus === 'finished') {
    return;
  }
  const pendingToursRes = await client.query(
    `
      SELECT 1
      FROM thai_tour tt
      JOIN thai_court tc ON tc.id = tt.court_id
      WHERE tc.round_id = $1
        AND tt.status <> 'confirmed'
      LIMIT 1
    `,
    [round.roundId],
  );
  if (pendingToursRes.rows[0]) {
    throw new ThaiJudgeError(409, `${roundType.toUpperCase()} cannot be finished until all tours are confirmed`);
  }
  await client.query(
    `
      UPDATE thai_round
      SET status = 'finished',
          finished_at = COALESCE(finished_at, now())
      WHERE id = $1
    `,
    [round.roundId],
  );
}

async function reshuffleThaiRound1Tx(client: PoolClient, tournamentId: string, requestedSeed?: number): Promise<void> {
  const tournament = await loadTournamentTx(client, tournamentId, { forUpdate: true });
  const r1 = await loadRoundByTypeTx(client, tournamentId, 'r1', { forUpdate: true });
  if (!r1) {
    await bootstrapThaiRoundTx(client, tournament, { seed: requestedSeed });
    return;
  }
  const confirmedRes = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM thai_match tm
      JOIN thai_tour tt ON tt.id = tm.tour_id
      JOIN thai_court tc ON tc.id = tt.court_id
      WHERE tc.round_id = $1
        AND tm.status = 'confirmed'
    `,
    [r1.roundId],
  );
  if (asNum(confirmedRes.rows[0]?.count, 0) > 0) {
    throw new ThaiJudgeError(
      409,
      'R1 уже идёт: есть подтверждённые матчи. Перемешивание отключено.',
    );
  }
  const courts = await listCourtsByRoundTx(client, r1.roundId);
  for (const court of courts) {
    const tours = await loadToursByCourtTx(client, court.courtId);
    const progress = resolveCourtProgress(tours, r1.roundStatus);
    if (progress.currentTourNo > 1) {
      throw new ThaiJudgeError(
        409,
        'R1 уже идёт: на корте начат тур после T1. Перемешивание отключено.',
      );
    }
  }
  await resetThaiJudgeStateTx(client, tournamentId);
  await bootstrapThaiRoundTx(client, tournament, {
    seed: Number.isFinite(requestedSeed) ? requestedSeed : getThaiBaseSeed(tournament.settings) + 1,
  });
}

async function seedThaiRound2Tx(client: PoolClient, tournamentId: string): Promise<void> {
  const tournament = await loadTournamentTx(client, tournamentId, { forUpdate: true });
  const existingR2 = await loadRoundByTypeTx(client, tournamentId, 'r2', { forUpdate: true });
  if (existingR2) {
    throw new ThaiJudgeError(409, 'R2 already exists');
  }
  const draft = await buildThaiR2SeedDraftTx(client, tournamentId);
  await materializeThaiRound2Tx(
    client,
    tournament,
    draft.zones.map((zone) => ({
      zone: zone.zone,
      courtNo: zone.courtNo,
      players: zone.players.map(({ playerId, playerName, gender }) => ({ playerId, playerName, gender })),
    })),
  );
}

export async function runThaiOperatorAction(
  tournamentId: string,
  action: ThaiOperatorActionName,
  options?: {
    seed?: number;
    zones?: unknown;
  },
): Promise<ThaiOperatorActionResult> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withTransaction(async (client) => {
    if (action === 'preview_draw') {
      const state = await loadThaiOperatorStateSummaryTx(client, normalizedId);
      if (!state) {
        throw new ThaiJudgeError(409, 'Thai state is not initialized');
      }
      return {
        success: true,
        state,
        judgeState: await loadJudgeSummaryIfExistsTx(client, normalizedId),
        preview: await buildThaiDrawPreviewTx(client, normalizedId, options?.seed),
      };
    }
    if (action === 'reshuffle_r1') {
      await reshuffleThaiRound1Tx(client, normalizedId, options?.seed);
    } else if (action === 'finish_r1') {
      await finishThaiRoundTx(client, normalizedId, 'r1');
    } else if (action === 'preview_r2_seed') {
      return {
        success: true,
        state: (await loadThaiOperatorStateSummaryTx(client, normalizedId))!,
        judgeState: await loadJudgeSummaryIfExistsTx(client, normalizedId),
        r2SeedDraft: await buildThaiR2SeedDraftTx(client, normalizedId),
      };
    } else if (action === 'confirm_r2_seed') {
      const tournament = await loadTournamentTx(client, normalizedId, { forUpdate: true });
      const normalizedZones = normalizeThaiR2SeedDraftInput(options?.zones);
      const draft = await buildThaiR2SeedDraftTx(client, normalizedId);
      assertThaiR2SeedMatchesDraft(draft, normalizedZones);
      const hydratedZones = hydrateThaiR2SeedFromDraft(draft, normalizedZones);
      await materializeThaiRound2Tx(
        client,
        tournament,
        hydratedZones.map((zone) => ({
          zone: zone.zone,
          courtNo: zone.courtNo,
          players: zone.players.map(({ playerId, playerName, gender }) => ({ playerId, playerName, gender })),
        })),
      );
    } else if (action === 'seed_r2') {
      await seedThaiRound2Tx(client, normalizedId);
    } else if (action === 'finish_r2') {
      await finishThaiRoundTx(client, normalizedId, 'r2');
    } else {
      throw new ThaiJudgeError(400, 'Unsupported Thai operator action');
    }

    return {
      success: true,
      state: (await loadThaiOperatorStateSummaryTx(client, normalizedId))!,
      judgeState: await loadJudgeSummaryIfExistsTx(client, normalizedId),
    };
  });
}

export interface ThaiAdminTourCorrectionAudit {
  tourId: string;
  tourNo: number;
  courtLabel: string;
  roundId: string;
  roundType: ThaiRoundType;
  beforeMatches: Array<{ matchId: string; team1Score: number | null; team2Score: number | null }>;
  afterMatches: Array<{ matchId: string; team1Score: number | null; team2Score: number | null }>;
}

/**
 * Исправление счёта уже подтверждённого тура (оператор/админ).
 * Пересчитывает thai_player_round_stat для раунда. Не меняет состав R2, если он уже разыгран.
 */
export async function adminCorrectThaiTourScores(
  tournamentId: string,
  input: {
    tourId: string;
    matches: Array<{ matchId: string; team1Score: number; team2Score: number }>;
  },
): Promise<ThaiAdminTourCorrectionAudit> {
  const tid = String(tournamentId || '').trim();
  const tourId = String(input.tourId || '').trim();
  if (!tid) throw new ThaiJudgeError(400, 'tournamentId is required');
  if (!tourId) throw new ThaiJudgeError(400, 'tourId is required');
  if (!Array.isArray(input.matches) || input.matches.length !== 2) {
    throw new ThaiJudgeError(400, 'Ожидается ровно два матча в туре');
  }
  const seen = new Set<string>();
  for (const m of input.matches) {
    const mid = String(m.matchId || '').trim();
    if (!mid || seen.has(mid)) {
      throw new ThaiJudgeError(400, 'matchId должны быть уникальными');
    }
    seen.add(mid);
  }

  return withTransaction(async (client) => {
    const tourMeta = await client.query(
      `
      SELECT
        tt.id AS tour_id,
        tt.tour_no,
        tt.status AS tour_status,
        c.round_id,
        c.label AS court_label,
        r.tournament_id,
        r.round_type,
        t.settings
      FROM thai_tour tt
      JOIN thai_court c ON c.id = tt.court_id
      JOIN thai_round r ON r.id = c.round_id
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE tt.id = $1 AND r.tournament_id = $2
      LIMIT 1
      `,
      [tourId, tid],
    );
    const row = tourMeta.rows[0];
    if (!row) {
      throw new ThaiJudgeError(404, 'Тур не найден для этого турнира');
    }
    if (tourStatusFromValue(row.tour_status) !== 'confirmed') {
      throw new ThaiJudgeError(409, 'Можно исправить только подтверждённый тур');
    }

    const settings =
      row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {};
    const roundType = roundTypeFromValue(row.round_type);
    const pointLimit = getThaiPointLimitForRound(settings, roundType);
    const roundId = String(row.round_id);
    const tourNo = asNum(row.tour_no, 1);
    const courtLabel = String(row.court_label || '');

    const loaded = await loadMatchRowsByTourTx(client, tourId, { forUpdate: true });
    if (loaded.length !== 2) {
      throw new ThaiJudgeError(409, 'Неверная структура тура');
    }

    const payloadById = new Map(
      input.matches.map((m) => [String(m.matchId).trim(), m] as const),
    );
    const beforeMatches = loaded.map((m) => ({
      matchId: m.matchId,
      team1Score: m.team1Score,
      team2Score: m.team2Score,
    }));

    for (const match of loaded) {
      const scores = payloadById.get(match.matchId);
      if (!scores) {
        throw new ThaiJudgeError(400, 'В теле запроса нет счёта для всех матчей тура');
      }
      const scoreError = validateThaiMatchScore(scores.team1Score, scores.team2Score, pointLimit);
      if (scoreError) {
        throw new ThaiJudgeError(422, scoreError);
      }
    }

    for (const match of loaded) {
      const scores = payloadById.get(match.matchId)!;
      await client.query(
        `
          UPDATE thai_match
          SET team1_score = $2,
              team2_score = $3,
              status = 'confirmed',
              updated_at = now()
          WHERE id = $1
        `,
        [match.matchId, scores.team1Score, scores.team2Score],
      );
    }

    await recomputeRoundStatsTx(client, roundId);

    const afterLoaded = await loadMatchRowsByTourTx(client, tourId);
    const afterMatches = afterLoaded.map((m) => ({
      matchId: m.matchId,
      team1Score: m.team1Score,
      team2Score: m.team2Score,
    }));

    return {
      tourId,
      tourNo,
      courtLabel,
      roundId,
      roundType,
      beforeMatches,
      afterMatches,
    };
  });
}

export async function confirmThaiTourByPin(
  pin: string,
  tourNumber: number,
  payload: ThaiJudgeConfirmPayload,
): Promise<ThaiJudgeConfirmResult> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedTourNumber = Math.max(1, Math.trunc(Number(tourNumber) || 0));
  if (!normalizedPin) throw new ThaiJudgeError(400, 'pin is required');
  if (!normalizedTourNumber) throw new ThaiJudgeError(400, 'tourNumber is required');

  const normalizedPayload = normalizeConfirmPayload(payload);
  const outcome = await withTransaction(async (client) => {
    const court = await loadCourtRoundByPinTx(client, normalizedPin, { forUpdate: true });
    if (court.roundStatus === 'finished') {
      throw new ThaiJudgeError(409, 'Round already finished');
    }
    const progress = resolveCourtProgress(await loadToursByCourtTx(client, court.courtId), court.roundStatus);
    if (progress.isCourtFinished || progress.currentTourNo !== normalizedTourNumber || !progress.currentTour) {
      throw new ThaiJudgeError(409, 'Tour is stale or already advanced');
    }
    if (progress.currentTour.status === 'confirmed') {
      throw new ThaiJudgeError(409, 'Tour already confirmed');
    }

    const loadedMatches = await loadMatchRowsByTourTx(client, progress.currentTour.tourId, { forUpdate: true });
    if (loadedMatches.length !== 2) {
      throw new ThaiJudgeError(409, 'Tour shape is invalid');
    }

    const pointLimit = getThaiPointLimitForRound(court.settings, court.roundType);
    for (const match of loadedMatches) {
      const scores = normalizedPayload.get(match.matchId);
      if (!scores) {
        throw new ThaiJudgeError(409, 'Tour payload does not match current court snapshot');
      }
      const scoreError = validateThaiMatchScore(scores.team1Score, scores.team2Score, pointLimit);
      if (scoreError) {
        throw new ThaiJudgeError(422, scoreError);
      }
    }

    for (const match of loadedMatches) {
      const scores = normalizedPayload.get(match.matchId)!;
      await client.query(
        `
          UPDATE thai_match
          SET team1_score = $2,
              team2_score = $3,
              status = 'confirmed',
              updated_at = now()
          WHERE id = $1
        `,
        [match.matchId, scores.team1Score, scores.team2Score],
      );
    }

    await client.query(
      `
        UPDATE thai_tour
        SET status = 'confirmed',
            confirmed_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [progress.currentTour.tourId],
    );

    await recomputeRoundStatsTx(client, court.roundId);

    const nextTourRes = await client.query(
      `
        SELECT 1
        FROM thai_tour
        WHERE court_id = $1
          AND tour_no = $2
        LIMIT 1
      `,
      [court.courtId, normalizedTourNumber + 1],
    );

    let nextTourNumber: number | undefined;

    if (nextTourRes.rows[0]) {
      nextTourNumber = normalizedTourNumber + 1;
      await client.query(
        `
          UPDATE thai_court
          SET status = 'live',
              updated_at = now()
          WHERE id = $1
        `,
        [court.courtId],
      );
    } else {
      await client.query(
        `
          UPDATE thai_court
          SET status = 'finished',
              updated_at = now()
          WHERE id = $1
        `,
        [court.courtId],
      );
    }

    return { nextTourNumber, roundFinished: false };
  });

  const snapshot = await getThaiJudgeSnapshotByPin(normalizedPin);
  const message = outcome.nextTourNumber
    ? 'Тур подтверждён. Следующий тур открыт.'
    : 'Тур подтверждён. Корт завершил свои туры.';

  return {
    success: true,
    message,
    nextTourNumber: outcome.nextTourNumber,
    roundFinished: outcome.roundFinished,
    snapshot,
  };
}

async function fetchThaiRoundSeedTx(
  client: PoolClient,
  tournamentId: string,
  roundType: ThaiRoundType,
): Promise<number | null> {
  const res = await client.query(
    `SELECT seed FROM thai_round WHERE tournament_id = $1 AND round_type = $2 LIMIT 1`,
    [tournamentId, roundType],
  );
  const row = res.rows[0];
  if (!row) return null;
  return Math.max(1, Math.trunc(Number(row.seed) || 1));
}

export type { ThaiSchedulePrintPayload } from './print-schedule';

export async function getThaiSchedulePrintPayload(
  tournamentId: string,
  options?: { previewSeed?: number },
): Promise<ThaiSchedulePrintPayload> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new ThaiJudgeError(400, 'tournamentId is required');
  }

  return withClient(async (client) => {
    const tournament = await loadTournamentTx(client, normalizedId);
    if (String(tournament.format || '').trim().toLowerCase() !== 'thai') {
      throw new ThaiJudgeError(400, 'Tournament is not Thai');
    }
    const roster = await listTournamentRosterTx(client, normalizedId);
    const settings = normalizeThaiAdminSettings(tournament.settings, roster.length);
    const rosterError = validateThaiRoster(
      roster.map((player) => ({ id: player.playerId, gender: player.gender })),
      tournament.settings,
    );
    if (rosterError) {
      throw new ThaiJudgeError(400, rosterError);
    }

    const variant = settings.variant;
    const tourCount = settings.tourCount;
    const pointLimitR1 = resolveThaiPointLimitForRound(tournament.settings, 'r1');
    const pointLimitR2 = resolveThaiPointLimitForRound(tournament.settings, 'r2');

    const r1SeedFromDb = await fetchThaiRoundSeedTx(client, normalizedId, 'r1');
    let r1SeedSource: 'database' | 'preview' | 'settings';
    let r1SeedUsed: number;
    if (r1SeedFromDb !== null) {
      r1SeedUsed = r1SeedFromDb;
      r1SeedSource = 'database';
    } else {
      const parsed = Math.trunc(Number(options?.previewSeed) || 0);
      if (Number.isFinite(parsed) && parsed >= 1) {
        r1SeedUsed = parsed;
        r1SeedSource = 'preview';
      } else {
        r1SeedUsed = getThaiDrawSeed(tournament.settings, undefined);
        r1SeedSource = 'settings';
      }
    }

    const courtRosters = buildThaiRound1CourtRosters({
      players: roster,
      variant,
      courts: settings.courts,
      seed: r1SeedUsed,
      rosterMode: tournament.settings?.thaiRosterMode,
    });

    const r1Courts = courtRosters.map((cr) => {
      const players = cr.players.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        gender: p.gender,
      }));
      const courtScheduleSeed = r1SeedUsed + cr.courtNo - 1;
      return buildSchedulePrintCourt({
        courtNo: cr.courtNo,
        courtLabel: cr.courtLabel,
        roundKind: 'r1',
        players,
        variant,
        tourCount,
        courtScheduleSeed,
      });
    });

    const courtCount = settings.courts;
    const r2Legend = r2FormationLegend(variant, courtCount);

    const roundsView = await loadRoundViewsTx(client, normalizedId);
    const r1View = roundsView.find((r) => r.roundType === 'r1') ?? null;

    let r2Courts: ThaiSchedulePrintPayload['r2Courts'] = [];
    let r2IsTemplate = true;

    const tryBuildR2FromR1 = (): boolean => {
      if (!r1View || r1View.roundStatus !== 'finished' || !isR2Supported(variant, r1View.courts.length)) {
        return false;
      }
      const playerById = new Map(roster.map((p) => [p.playerId, p] as const));
      try {
        const seeded = seedThaiRound2Courts({
          variant,
          r1Courts: r1View.courts.map((c) => ({
            courtId: c.courtId,
            courtNo: c.courtNo,
            courtLabel: c.label,
            groups: c.standingsGroups,
          })),
          playerById,
          thaiRulesPreset: normalizeThaiRulesPreset(tournament.settings),
        });
        r2Courts = seeded.map((sc) =>
          buildSchedulePrintCourt({
            courtNo: sc.courtNo,
            courtLabel: thaiZoneLabel(sc.zone),
            roundKind: 'r2',
            zoneKey: sc.zone,
            players: sc.players,
            variant,
            tourCount,
            courtScheduleSeed: 200 + sc.courtNo - 1,
          }),
        );
        r2IsTemplate = false;
        return true;
      } catch {
        return false;
      }
    };

    if (!tryBuildR2FromR1()) {
      const zones = getThaiExpectedZones(courtCount);
      r2Courts = zones.map((zone, i) =>
        buildSchedulePrintCourt({
          courtNo: i + 1,
          courtLabel: thaiZoneLabel(zone),
          roundKind: 'r2',
          zoneKey: zone,
          players: placeholderR2CourtPlayers(variant),
          variant,
          tourCount,
          courtScheduleSeed: 200 + i,
        }),
      );
      r2IsTemplate = true;
    }

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentDate: tournament.date,
      tournamentTime: tournament.time,
      tournamentLocation: tournament.location,
      variant,
      pointLimitR1,
      pointLimitR2,
      tourCount,
      r1SeedUsed,
      r1SeedSource,
      r2Legend,
      r1Courts,
      r2Courts,
      r2IsTemplate,
    };
  });
}
