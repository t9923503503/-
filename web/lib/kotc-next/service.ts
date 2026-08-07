import { PoolClient } from 'pg';
import { applyTournamentStatusOverride, upsertTournamentResults } from '@/lib/admin-queries';
import { getTournamentTableColumnsTx } from '@/lib/admin-queries-pg';
import {
  normalizeKotcJudgeBootstrapSignature,
  normalizeKotcJudgeModule,
  type KotcJudgeModule,
} from '@/lib/admin-legacy-sync';
import { getPool } from '@/lib/db';
import {
  normalizeTournamentRatingLevelFromZone,
  ratingPointsForLevelPlace,
} from '@/lib/rating-points';
import {
  KOTC_JUDGE_MODULE_NEXT,
  buildKotcNextCourtPin,
  buildKotcNextStructuralSignature,
  isKotcNextFormat,
  normalizeKotcAdminSettings,
  validateKotcNextSetup,
  validateKotcNextStructuralLock,
  zoneLabel,
} from '@/lib/kotc-next-config';
import { isKotcNextDemoTournament } from '@/lib/kotc-next-demo-config';
import {
  applyManualPairSwitch,
  applyKingPoint,
  applyKotcNextKingRunTieBreaks,
  applyNoTakeoversPairPoint,
  applyTakeover,
  applyUndo,
  calcKotcNextRaundStandings,
  getInitialKotcNextCourtState,
  getKotcNextTimerSnapshot,
  seedKotcNextR2Courts,
} from './core';
import type {
  KotcNextCourtLiveState,
  KotcNextCourtOperatorView,
  KotcNextCourtRaundProgress,
  KotcNextCourtStatus,
  KotcNextControlActor,
  KotcNextControlCommandInput,
  KotcNextControlCommandResult,
  KotcNextControlEvent,
  KotcNextFinalIndividualResult,
  KotcNextFinalZoneResult,
  KotcNextGameEvent,
  KotcNextJudgeAggregatePairStanding,
  KotcNextJudgeAggregatePlayerStanding,
  KotcNextJudgeCourtNavItem,
  KotcNextJudgeParams,
  KotcNextJudgeRoundNavItem,
  KotcNextJudgeSnapshot,
  KotcNextOperatorActionName,
  KotcNextOperatorRoundView,
  KotcNextOperatorStage,
  KotcNextOperatorState,
  KotcNextPairLiveState,
  KotcNextPairView,
  KotcNextR2ManualPlayerRef,
  KotcNextR2ManualZone,
  KotcNextR2SeedZone,
  KotcNextRaundHistoryEntry,
  KotcNextRaundStatus,
  KotcNextRoundStatus,
  KotcNextRoundType,
  KotcNextVariant,
  KotcNextZoneKey,
} from './types';

const KOTC_NEXT_START_COUNTDOWN_SECONDS = 10;

interface TournamentRow {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  status: string;
  settings: Record<string, unknown>;
  kotcJudgeModule: KotcJudgeModule;
  kotcJudgeBootstrapSig: string | null;
  courts: number;
  params: KotcNextJudgeParams;
  variant: KotcNextVariant;
}

interface RosterPlayer {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  position: number;
}

interface RoundRow {
  roundId: string;
  tournamentId: string;
  roundNo: number;
  status: KotcNextRoundStatus;
  seed: number;
  revision: number;
}

interface CourtRow {
  courtId: string;
  roundId: string;
  courtNo: number;
  label: string;
  pinCode: string;
  status: KotcNextCourtStatus;
}

interface PairRow {
  pairId: string;
  courtId: string;
  pairIdx: number;
  primaryPlayerId: string | null;
  primaryPlayerName: string;
  primaryGender: 'M' | 'W' | null;
  secondaryPlayerId: string | null;
  secondaryPlayerName: string;
  secondaryGender: 'M' | 'W' | null;
}

interface RaundRow {
  raundId: string;
  courtId: string;
  raundNo: number;
  timerMinutes: number;
  startedAt: string | null;
  finishedAt: string | null;
  pausedAt: string | null;
  accumulatedPauseMs: number;
  pausedPhase: 'countdown' | 'running' | null;
  statusChangedAt: string | null;
  lastControlledBy: KotcNextControlActor['kind'] | null;
  revision: number;
  status: KotcNextRaundStatus;
  kingPairIdx: number;
  challengerPairIdx: number;
  queueOrder: number[];
}

interface RaundStatRow {
  raundId: string;
  pairIdx: number;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
}

interface AggregatePairRow {
  courtId: string;
  courtNo: number;
  courtLabel: string;
  pairIdx: number;
  pairLabel: string;
  primaryPlayerId: string | null;
  primaryPlayerName: string;
  primaryGender: 'M' | 'W' | null;
  secondaryPlayerId: string | null;
  secondaryPlayerName: string;
  secondaryGender: 'M' | 'W' | null;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun: number;
  firstLongestKingRunOrder: number | null;
  position: number;
  zone: KotcNextZoneKey | null;
}

interface IndividualSeedRow {
  courtNo: number;
  pairIdx: number;
  playerId: string | null;
  playerName: string;
  gender: 'M' | 'W' | null;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun: number;
  firstLongestKingRunOrder: number | null;
  position: number;
}

interface IndividualRoundResultRow extends IndividualSeedRow {
  courtLabel: string;
  zone: KotcNextZoneKey | null;
}

interface ActionTarget {
  tournament: TournamentRow;
  round: RoundRow;
  court: CourtRow;
  raund: RaundRow;
  pairs: PairRow[];
  stats: RaundStatRow[];
  events: KotcNextGameEvent[];
}

interface JudgeMutationResult {
  tournamentId: string;
  pin: string;
  publishResults: boolean;
}

const ZONE_ORDER: KotcNextZoneKey[] = ['kin', 'advance', 'medium', 'lite'];

interface PairSourcePlayer {
  primaryPlayerId: string | null;
  primaryPlayerName: string;
  secondaryPlayerId: string | null;
  secondaryPlayerName: string;
  primaryGender: 'M' | 'W' | null;
  secondaryGender: 'M' | 'W' | null;
}

interface R1PairSource {
  courtNo: number;
  pairs: PairSourcePlayer[];
}

export interface KotcNextPlayerReplacementAudit {
  tournamentId: string;
  oldPlayerId: string;
  oldPlayerName: string;
  oldGender: 'M' | 'W';
  newPlayerId: string;
  newPlayerName: string;
  newGender: 'M' | 'W';
  pairsTouched: number;
  roundStatsTouched: number;
  resultsTouched: number;
}

export class KotcNextError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, message: string, code?: string | null) {
    super(message);
    this.name = 'KotcNextError';
    this.status = status;
    this.code = code ?? null;
  }
}

export function isKotcNextError(error: unknown): error is KotcNextError {
  return error instanceof KotcNextError;
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new KotcNextError(503, 'Service unavailable');
  }
}

function asInt(value: unknown, fallback = 0): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

function normalizeGender(value: unknown): 'M' | 'W' {
  return String(value ?? '').trim().toUpperCase() === 'W' ? 'W' : 'M';
}

function normalizeZoneKey(value: unknown): KotcNextZoneKey {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'kin' || normalized === 'advance' || normalized === 'medium' || normalized === 'lite') {
    return normalized;
  }
  throw new KotcNextError(400, 'Invalid R2 zone');
}

function roundTypeFromNo(roundNo: number): KotcNextRoundType {
  return roundNo === 2 ? 'r2' : 'r1';
}

function roundStatusFromValue(value: unknown): KotcNextRoundStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'finished') return normalized;
  return 'live';
}

function courtStatusFromValue(value: unknown): KotcNextCourtStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'finished') return normalized;
  return 'live';
}

function raundStatusFromValue(value: unknown): KotcNextRaundStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'paused' || normalized === 'finished') return normalized;
  return 'running';
}

function raundDisplayStatus(raund: Pick<RaundRow, 'status' | 'startedAt' | 'pausedPhase'>, now = Date.now()) {
  return getKotcNextTimerSnapshot({
    status: raund.status,
    startedAt: raund.startedAt,
    timerMinutes: 10,
    now,
  }).displayStatus;
}

function normalizeQueueOrder(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asInt(entry, -1))
    .filter((entry) => entry >= 0);
}

function judgeUrlForPin(pin: string): string {
  return `/kotc-next/judge/${encodeURIComponent(pin)}`;
}

function judgeRoundLabel(roundNo: number): string {
  return roundNo === 2 ? 'ТУР 2' : 'ТУР 1';
}

function buildCourtSeed(roundSeed: number, courtNo: number): number {
  return roundSeed * 1000 + courtNo * 97;
}

function pairLabel(pair: PairRow): string {
  const primary = pair.primaryPlayerName.trim();
  const secondary = pair.secondaryPlayerName.trim();
  if (primary && secondary) return `${primary} / ${secondary}`;
  return primary || secondary || `Pair ${pair.pairIdx + 1}`;
}

function inferKotcVariant(division: string, roster: RosterPlayer[]): KotcNextVariant {
  const normalizedDivision = String(division || '').trim().toLowerCase();
  const hasMen = roster.some((player) => player.gender === 'M');
  const hasWomen = roster.some((player) => player.gender === 'W');

  if (normalizedDivision.includes('жен') || (!hasMen && hasWomen)) return 'WW';
  if (normalizedDivision.includes('муж') || (hasMen && !hasWomen)) return 'MM';
  return 'MF';
}

function buildStructuralSignature(tournament: TournamentRow, roster: RosterPlayer[]): string {
  return buildKotcNextStructuralSignature({
    variant: tournament.variant,
    courts: tournament.params.courts,
    ppc: tournament.params.ppc,
    raundCount: tournament.params.raundCount,
    takeoversMode: tournament.params.takeoversMode,
    r2SeedingMode: tournament.params.r2SeedingMode,
    playerIds: roster.map((player) => player.playerId),
  });
}

function ensureKotcNextTournament(
  tournament: TournamentRow,
  roster: RosterPlayer[],
  options?: { allowFinished?: boolean },
): void {
  if (!isKotcNextFormat(tournament.format)) {
    throw new KotcNextError(400, 'Tournament is not KOTC');
  }
  if (tournament.kotcJudgeModule !== KOTC_JUDGE_MODULE_NEXT) {
    throw new KotcNextError(409, 'KOTC Next judge module is not enabled for this tournament');
  }

  const status = String(tournament.status || '').trim().toLowerCase();
  if (status === 'cancelled') {
    throw new KotcNextError(409, 'KOTC Next is blocked for cancelled tournaments');
  }
  if (!options?.allowFinished && status === 'finished') {
    throw new KotcNextError(409, 'KOTC Next is blocked for finished tournaments');
  }

  const setupError = validateKotcNextSetup({
    courts: tournament.params.courts,
    ppc: tournament.params.ppc,
    raundCount: tournament.params.raundCount,
    raundTimerMinutes: tournament.params.raundTimerMinutes,
    participantCount: roster.length,
  });
  if (setupError) {
    throw new KotcNextError(422, setupError);
  }

  const structuralLock = validateKotcNextStructuralLock({
    storedSignature: tournament.kotcJudgeBootstrapSig,
    currentSignature: buildStructuralSignature(tournament, roster),
  });
  if (structuralLock) {
    throw new KotcNextError(409, structuralLock.message, structuralLock.code);
  }
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  requireDatabase();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  requireDatabase();
  const client = await getPool().connect();
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

async function loadTournamentTx(
  client: PoolClient,
  tournamentId: string,
  options?: { forUpdate?: boolean },
): Promise<TournamentRow> {
  const columns = await getTournamentTableColumnsTx(client);
  const res = await client.query(
    `
      SELECT
        id,
        name,
        date,
        time,
        location,
        format,
        division,
        status,
        ${columns.has('settings') ? 'settings' : 'NULL::jsonb AS settings'},
        ${columns.has('kotc_judge_module') ? "COALESCE(kotc_judge_module, 'legacy') AS kotc_judge_module" : 'NULL::text AS kotc_judge_module'},
        ${columns.has('kotc_judge_bootstrap_sig') ? 'kotc_judge_bootstrap_sig' : 'NULL::text AS kotc_judge_bootstrap_sig'},
        ${columns.has('kotc_raund_count') ? 'COALESCE(kotc_raund_count, 2) AS kotc_raund_count' : 'NULL::int AS kotc_raund_count'},
        ${columns.has('kotc_raund_timer_minutes') ? 'COALESCE(kotc_raund_timer_minutes, 10) AS kotc_raund_timer_minutes' : 'NULL::int AS kotc_raund_timer_minutes'},
        ${columns.has('kotc_ppc') ? 'COALESCE(kotc_ppc, 4) AS kotc_ppc' : 'NULL::int AS kotc_ppc'},
        ${columns.has('courts') ? 'COALESCE(courts, 1) AS courts' : 'NULL::int AS courts'}
      FROM tournaments
      WHERE id = $1
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE' : ''}
    `,
    [tournamentId],
  );
  const row = res.rows[0];
  if (!row) {
    throw new KotcNextError(404, 'Tournament not found');
  }

  const rawSettings =
    row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  const paramsBase = normalizeKotcAdminSettings({
    ...rawSettings,
    courts: asInt(row.courts, asInt(rawSettings.courts, 1)),
    kotcPpc: asInt(row.kotc_ppc, asInt(rawSettings.kotcPpc ?? rawSettings.ppc, 4)),
    kotcRaundCount: asInt(
      row.kotc_raund_count,
      asInt(rawSettings.kotcRaundCount ?? rawSettings.raundCount, 2),
    ),
    kotcRaundTimerMinutes: asInt(
      row.kotc_raund_timer_minutes,
      asInt(rawSettings.kotcRaundTimerMinutes ?? rawSettings.raundTimerMinutes, 10),
    ),
  });

  return {
    id: String(row.id),
    name: String(row.name || ''),
    date: toIsoDate(row.date),
    time: String(row.time || ''),
    location: String(row.location || ''),
    format: String(row.format || ''),
    division: String(row.division || ''),
    status: String(row.status || ''),
    settings: rawSettings,
    kotcJudgeModule: normalizeKotcJudgeModule(row.kotc_judge_module ?? rawSettings.kotcJudgeModule, 'legacy'),
    kotcJudgeBootstrapSig: normalizeKotcJudgeBootstrapSignature(
      row.kotc_judge_bootstrap_sig ??
        rawSettings.kotcJudgeBootstrapSignature ??
        rawSettings.kotcJudgeBootstrapSig,
    ),
    courts: paramsBase.courts,
    params: {
      courts: paramsBase.courts,
      ppc: paramsBase.ppc,
      raundCount: paramsBase.raundCount,
      raundTimerMinutes: paramsBase.raundTimerMinutes,
      takeoversMode: paramsBase.takeoversMode,
      r2SeedingMode: paramsBase.r2SeedingMode,
      variant: 'MF',
    },
    variant: 'MF',
  };
}

async function listRosterTx(client: PoolClient, tournamentId: string): Promise<RosterPlayer[]> {
  const res = await client.query(
    `
      SELECT
        p.id AS player_id,
        p.name AS player_name,
        p.gender,
        tp.position
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
    gender: normalizeGender(row.gender),
    position: asInt(row.position, 0),
  }));
}

async function hydrateTournamentTx(
  client: PoolClient,
  tournamentId: string,
  options?: { forUpdate?: boolean },
): Promise<{ tournament: TournamentRow; roster: RosterPlayer[] }> {
  const tournament = await loadTournamentTx(client, tournamentId, options);
  const roster = await listRosterTx(client, tournamentId);
  const rawSettings =
    tournament.settings && typeof tournament.settings === 'object' && !Array.isArray(tournament.settings)
      ? tournament.settings
      : {};
  const ppcForCourts = Math.max(1, asInt(rawSettings.kotcPpc ?? rawSettings.ppc, tournament.params.ppc));
  const derivedCourts = Math.max(1, Math.ceil(roster.length / Math.max(1, ppcForCourts * 2)));
  const preferredCourts = asInt(rawSettings.courts, derivedCourts);
  const paramsAligned = normalizeKotcAdminSettings({
    ...rawSettings,
    courts: preferredCourts,
    kotcPpc: tournament.params.ppc,
    kotcRaundCount: tournament.params.raundCount,
    kotcRaundTimerMinutes: tournament.params.raundTimerMinutes,
  });
  const variant = inferKotcVariant(tournament.division, roster);
  return {
    tournament: {
      ...tournament,
      courts: paramsAligned.courts,
      variant,
      params: {
        courts: paramsAligned.courts,
        ppc: paramsAligned.ppc,
        raundCount: paramsAligned.raundCount,
        raundTimerMinutes: paramsAligned.raundTimerMinutes,
        takeoversMode: paramsAligned.takeoversMode,
        r2SeedingMode: paramsAligned.r2SeedingMode,
        variant,
      },
    },
    roster,
  };
}

async function listRoundsTx(client: PoolClient, tournamentId: string): Promise<RoundRow[]> {
  const res = await client.query(
    `
      SELECT id, tournament_id, round_no, status, seed, revision
      FROM kotcn_round
      WHERE tournament_id = $1
      ORDER BY round_no ASC
    `,
    [tournamentId],
  );

  return res.rows.map((row) => ({
    roundId: String(row.id),
    tournamentId: String(row.tournament_id),
    roundNo: asInt(row.round_no, 1),
    status: roundStatusFromValue(row.status),
    seed: asInt(row.seed, 1),
    revision: asInt(row.revision, 0),
  }));
}

async function loadRoundByNoTx(
  client: PoolClient,
  tournamentId: string,
  roundNo: number,
  options?: { forUpdate?: boolean },
): Promise<RoundRow | null> {
  const res = await client.query(
    `
      SELECT id, tournament_id, round_no, status, seed, revision
      FROM kotcn_round
      WHERE tournament_id = $1
        AND round_no = $2
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE' : ''}
    `,
    [tournamentId, roundNo],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    roundId: String(row.id),
    tournamentId: String(row.tournament_id),
    roundNo: asInt(row.round_no, 1),
    status: roundStatusFromValue(row.status),
    seed: asInt(row.seed, 1),
    revision: asInt(row.revision, 0),
  };
}

async function listCourtsByRoundTx(client: PoolClient, roundId: string): Promise<CourtRow[]> {
  const res = await client.query(
    `
      SELECT id, round_id, court_no, label, pin_code, status
      FROM kotcn_court
      WHERE round_id = $1
      ORDER BY court_no ASC
    `,
    [roundId],
  );

  return res.rows.map((row) => ({
    courtId: String(row.id),
    roundId: String(row.round_id),
    courtNo: asInt(row.court_no, 1),
    label: String(row.label || ''),
    pinCode: String(row.pin_code || '').trim().toUpperCase(),
    status: courtStatusFromValue(row.status),
  }));
}

async function listPairsByCourtTx(client: PoolClient, courtId: string): Promise<PairRow[]> {
  const res = await client.query(
    `
      SELECT
        kp.id,
        kp.court_id,
        kp.pair_idx,
        kp.player_primary_id,
        p1.name AS primary_player_name,
        p1.gender AS primary_gender,
        kp.player_secondary_id,
        p2.name AS secondary_player_name,
        p2.gender AS secondary_gender
      FROM kotcn_pair kp
      LEFT JOIN players p1 ON p1.id = kp.player_primary_id
      LEFT JOIN players p2 ON p2.id = kp.player_secondary_id
      WHERE kp.court_id = $1
      ORDER BY kp.pair_idx ASC
    `,
    [courtId],
  );

  return res.rows.map((row) => ({
    pairId: String(row.id),
    courtId: String(row.court_id),
    pairIdx: asInt(row.pair_idx, 0),
    primaryPlayerId: row.player_primary_id ? String(row.player_primary_id) : null,
    primaryPlayerName: String(row.primary_player_name || ''),
    primaryGender: row.primary_gender == null ? null : normalizeGender(row.primary_gender),
    secondaryPlayerId: row.player_secondary_id ? String(row.player_secondary_id) : null,
    secondaryPlayerName: String(row.secondary_player_name || ''),
    secondaryGender: row.secondary_gender == null ? null : normalizeGender(row.secondary_gender),
  }));
}

async function listRaundsByCourtTx(client: PoolClient, courtId: string): Promise<RaundRow[]> {
  const res = await client.query(
    `
      SELECT
        id,
        court_id,
        raund_no,
        timer_minutes,
        started_at,
        finished_at,
        paused_at,
        accumulated_pause_ms,
        paused_phase,
        status_changed_at,
        last_controlled_by,
        revision,
        status,
        king_pair_idx,
        challenger_pair_idx,
        queue_order
      FROM kotcn_raund
      WHERE court_id = $1
      ORDER BY raund_no ASC
    `,
    [courtId],
  );

  return res.rows.map((row) => ({
    raundId: String(row.id),
    courtId: String(row.court_id),
    raundNo: asInt(row.raund_no, 1),
    timerMinutes: asInt(row.timer_minutes, 10),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    pausedAt: row.paused_at ? new Date(row.paused_at).toISOString() : null,
    accumulatedPauseMs: asInt(row.accumulated_pause_ms, 0),
    pausedPhase: row.paused_phase === 'countdown' ? 'countdown' : row.paused_phase === 'running' ? 'running' : null,
    statusChangedAt: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : null,
    lastControlledBy:
      row.last_controlled_by === 'judge' || row.last_controlled_by === 'operator' || row.last_controlled_by === 'admin' || row.last_controlled_by === 'system'
        ? row.last_controlled_by
        : null,
    revision: asInt(row.revision, 0),
    status: raundStatusFromValue(row.status),
    kingPairIdx: asInt(row.king_pair_idx, 0),
    challengerPairIdx: asInt(row.challenger_pair_idx, 1),
    queueOrder: normalizeQueueOrder(row.queue_order),
  }));
}

async function loadRaundByCourtAndNoTx(
  client: PoolClient,
  courtId: string,
  raundNo: number,
  options?: { forUpdate?: boolean },
): Promise<RaundRow | null> {
  const res = await client.query(
    `
      SELECT
        id,
        court_id,
        raund_no,
        timer_minutes,
        started_at,
        finished_at,
        paused_at,
        accumulated_pause_ms,
        paused_phase,
        status_changed_at,
        last_controlled_by,
        revision,
        status,
        king_pair_idx,
        challenger_pair_idx,
        queue_order
      FROM kotcn_raund
      WHERE court_id = $1
        AND raund_no = $2
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE' : ''}
    `,
    [courtId, raundNo],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    raundId: String(row.id),
    courtId: String(row.court_id),
    raundNo: asInt(row.raund_no, 1),
    timerMinutes: asInt(row.timer_minutes, 10),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    pausedAt: row.paused_at ? new Date(row.paused_at).toISOString() : null,
    accumulatedPauseMs: asInt(row.accumulated_pause_ms, 0),
    pausedPhase: row.paused_phase === 'countdown' ? 'countdown' : row.paused_phase === 'running' ? 'running' : null,
    statusChangedAt: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : null,
    lastControlledBy:
      row.last_controlled_by === 'judge' || row.last_controlled_by === 'operator' || row.last_controlled_by === 'admin' || row.last_controlled_by === 'system'
        ? row.last_controlled_by
        : null,
    revision: asInt(row.revision, 0),
    status: raundStatusFromValue(row.status),
    kingPairIdx: asInt(row.king_pair_idx, 0),
    challengerPairIdx: asInt(row.challenger_pair_idx, 1),
    queueOrder: normalizeQueueOrder(row.queue_order),
  };
}

async function listRaundsByRoundAndNoTx(
  client: PoolClient,
  roundId: string,
  raundNo: number,
  options?: { forUpdate?: boolean },
): Promise<RaundRow[]> {
  const res = await client.query(
    `
      SELECT
        kr.id,
        kr.court_id,
        kr.raund_no,
        kr.timer_minutes,
        kr.started_at,
        kr.finished_at,
        kr.paused_at,
        kr.accumulated_pause_ms,
        kr.paused_phase,
        kr.status_changed_at,
        kr.last_controlled_by,
        kr.revision,
        kr.status,
        kr.king_pair_idx,
        kr.challenger_pair_idx,
        kr.queue_order
      FROM kotcn_raund kr
      JOIN kotcn_court kc ON kc.id = kr.court_id
      WHERE kc.round_id = $1
        AND kr.raund_no = $2
      ORDER BY kc.court_no ASC
      ${options?.forUpdate ? 'FOR UPDATE OF kr' : ''}
    `,
    [roundId, raundNo],
  );

  return res.rows.map((row) => ({
    raundId: String(row.id),
    courtId: String(row.court_id),
    raundNo: asInt(row.raund_no, 1),
    timerMinutes: asInt(row.timer_minutes, 10),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    pausedAt: row.paused_at ? new Date(row.paused_at).toISOString() : null,
    accumulatedPauseMs: asInt(row.accumulated_pause_ms, 0),
    pausedPhase: row.paused_phase === 'countdown' ? 'countdown' : row.paused_phase === 'running' ? 'running' : null,
    statusChangedAt: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : null,
    lastControlledBy:
      row.last_controlled_by === 'judge' || row.last_controlled_by === 'operator' || row.last_controlled_by === 'admin' || row.last_controlled_by === 'system'
        ? row.last_controlled_by
        : null,
    revision: asInt(row.revision, 0),
    status: raundStatusFromValue(row.status),
    kingPairIdx: asInt(row.king_pair_idx, 0),
    challengerPairIdx: asInt(row.challenger_pair_idx, 1),
    queueOrder: normalizeQueueOrder(row.queue_order),
  }));
}

async function listRaundStatsTx(client: PoolClient, raundId: string): Promise<RaundStatRow[]> {
  const res = await client.query(
    `
      SELECT raund_id, pair_idx, king_wins, takeovers, games_played
      FROM kotcn_raund_stat
      WHERE raund_id = $1
      ORDER BY pair_idx ASC
    `,
    [raundId],
  );

  return res.rows.map((row) => ({
    raundId: String(row.raund_id),
    pairIdx: asInt(row.pair_idx, 0),
    kingWins: asInt(row.king_wins, 0),
    takeovers: asInt(row.takeovers, 0),
    gamesPlayed: asInt(row.games_played, 0),
  }));
}

async function listGameEventsTx(client: PoolClient, raundId: string): Promise<KotcNextGameEvent[]> {
  const res = await client.query(
    `
      SELECT id, seq_no, event_type, king_pair_idx, challenger_pair_idx, played_at
      FROM kotcn_game
      WHERE raund_id = $1
        AND reverted_at IS NULL
      ORDER BY seq_no ASC
    `,
    [raundId],
  );

  return res.rows.map((row) => ({
    id: String(row.id),
    seqNo: asInt(row.seq_no, 0),
    eventType: String(row.event_type || '').trim().toLowerCase() === 'takeover' ? 'takeover' : 'king_point',
    kingPairIdx: asInt(row.king_pair_idx, 0),
    challengerPairIdx: asInt(row.challenger_pair_idx, 1),
    playedAt: new Date(row.played_at).toISOString(),
  }));
}

async function nextGameSeqNoTx(client: PoolClient, raundId: string): Promise<number> {
  const res = await client.query(`SELECT COALESCE(MAX(seq_no), 0) + 1 AS next_seq FROM kotcn_game WHERE raund_id = $1`, [raundId]);
  return asInt(res.rows[0]?.next_seq, 1);
}

async function loadCourtByPinTx(
  client: PoolClient,
  pin: string,
  options?: { forUpdate?: boolean },
): Promise<{ tournament: TournamentRow; round: RoundRow; court: CourtRow }> {
  const columns = await getTournamentTableColumnsTx(client);
  const res = await client.query(
    `
      SELECT
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.date AS tournament_date,
        t.time AS tournament_time,
        t.location AS tournament_location,
        t.format,
        t.division,
        t.status AS tournament_status,
        ${columns.has('settings') ? 't.settings' : 'NULL::jsonb AS settings'},
        ${columns.has('kotc_judge_module') ? "COALESCE(t.kotc_judge_module, 'legacy') AS kotc_judge_module" : 'NULL::text AS kotc_judge_module'},
        ${columns.has('kotc_judge_bootstrap_sig') ? 't.kotc_judge_bootstrap_sig' : 'NULL::text AS kotc_judge_bootstrap_sig'},
        ${columns.has('kotc_raund_count') ? 'COALESCE(t.kotc_raund_count, 2) AS kotc_raund_count' : 'NULL::int AS kotc_raund_count'},
        ${columns.has('kotc_raund_timer_minutes') ? 'COALESCE(t.kotc_raund_timer_minutes, 10) AS kotc_raund_timer_minutes' : 'NULL::int AS kotc_raund_timer_minutes'},
        ${columns.has('kotc_ppc') ? 'COALESCE(t.kotc_ppc, 4) AS kotc_ppc' : 'NULL::int AS kotc_ppc'},
        ${columns.has('courts') ? 'COALESCE(t.courts, 1) AS courts' : 'NULL::int AS courts'},
        kr.id AS round_id,
        kr.round_no,
        kr.status AS round_status,
        kr.seed,
        kr.revision AS round_revision,
        kc.id AS court_id,
        kc.court_no,
        kc.label,
        kc.pin_code,
        kc.status AS court_status
      FROM kotcn_court kc
      JOIN kotcn_round kr ON kr.id = kc.round_id
      JOIN tournaments t ON t.id = kr.tournament_id
      WHERE UPPER(kc.pin_code) = $1
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE OF kc, kr, t' : ''}
    `,
    [pin],
  );
  const row = res.rows[0];
  if (!row) {
    throw new KotcNextError(404, 'Court PIN not found');
  }

  const rawSettings =
    row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  const paramsBase = normalizeKotcAdminSettings({
    ...rawSettings,
    courts: asInt(row.courts, asInt(rawSettings.courts, 1)),
    kotcPpc: asInt(row.kotc_ppc, asInt(rawSettings.kotcPpc ?? rawSettings.ppc, 4)),
    kotcRaundCount: asInt(
      row.kotc_raund_count,
      asInt(rawSettings.kotcRaundCount ?? rawSettings.raundCount, 2),
    ),
    kotcRaundTimerMinutes: asInt(
      row.kotc_raund_timer_minutes,
      asInt(rawSettings.kotcRaundTimerMinutes ?? rawSettings.raundTimerMinutes, 10),
    ),
  });
  const tournament: TournamentRow = {
    id: String(row.tournament_id),
    name: String(row.tournament_name || ''),
    date: toIsoDate(row.tournament_date),
    time: String(row.tournament_time || ''),
    location: String(row.tournament_location || ''),
    format: String(row.format || ''),
    division: String(row.division || ''),
    status: String(row.tournament_status || ''),
    settings: rawSettings,
    kotcJudgeModule: normalizeKotcJudgeModule(row.kotc_judge_module ?? rawSettings.kotcJudgeModule, 'legacy'),
    kotcJudgeBootstrapSig: normalizeKotcJudgeBootstrapSignature(
      row.kotc_judge_bootstrap_sig ??
        rawSettings.kotcJudgeBootstrapSignature ??
        rawSettings.kotcJudgeBootstrapSig,
    ),
    courts: paramsBase.courts,
    params: {
      courts: paramsBase.courts,
      ppc: paramsBase.ppc,
      raundCount: paramsBase.raundCount,
      raundTimerMinutes: paramsBase.raundTimerMinutes,
      takeoversMode: paramsBase.takeoversMode,
      r2SeedingMode: paramsBase.r2SeedingMode,
      variant: 'MF',
    },
    variant: 'MF',
  };
  const roster = await listRosterTx(client, tournament.id);
  const rawSettingsAligned =
    tournament.settings && typeof tournament.settings === 'object' && !Array.isArray(tournament.settings)
      ? tournament.settings
      : {};
  const ppcForCourts = Math.max(
    1,
    asInt(rawSettingsAligned.kotcPpc ?? rawSettingsAligned.ppc, tournament.params.ppc),
  );
  const derivedCourts = Math.max(1, Math.ceil(roster.length / Math.max(1, ppcForCourts * 2)));
  const preferredCourts = asInt(rawSettingsAligned.courts, derivedCourts);
  const paramsAligned = normalizeKotcAdminSettings({
    ...rawSettingsAligned,
    courts: preferredCourts,
    kotcPpc: tournament.params.ppc,
    kotcRaundCount: tournament.params.raundCount,
    kotcRaundTimerMinutes: tournament.params.raundTimerMinutes,
  });
  const variant = inferKotcVariant(tournament.division, roster);

  return {
    tournament: {
      ...tournament,
      courts: paramsAligned.courts,
      variant,
      params: {
        courts: paramsAligned.courts,
        ppc: paramsAligned.ppc,
        raundCount: paramsAligned.raundCount,
        raundTimerMinutes: paramsAligned.raundTimerMinutes,
        takeoversMode: paramsAligned.takeoversMode,
        r2SeedingMode: paramsAligned.r2SeedingMode,
        variant,
      },
    },
    round: {
      roundId: String(row.round_id),
      tournamentId: tournament.id,
      roundNo: asInt(row.round_no, 1),
      status: roundStatusFromValue(row.round_status),
      seed: asInt(row.seed, 1),
      revision: asInt(row.round_revision, 0),
    },
    court: {
      courtId: String(row.court_id),
      roundId: String(row.round_id),
      courtNo: asInt(row.court_no, 1),
      label: String(row.label || ''),
      pinCode: String(row.pin_code || '').trim().toUpperCase(),
      status: courtStatusFromValue(row.court_status),
    },
  };
}

function buildInitialState(
  tournament: TournamentRow,
  round: RoundRow,
  court: CourtRow,
  raundNo: number,
  startedAt: string | null,
): KotcNextCourtLiveState {
  return getInitialKotcNextCourtState(
    tournament.params.ppc,
    raundNo,
    buildCourtSeed(round.seed, court.courtNo),
    tournament.params.raundTimerMinutes,
    startedAt,
  );
}

function buildPairViews(pairs: PairRow[]): KotcNextPairView[] {
  return pairs.map((pair) => ({
    pairIdx: pair.pairIdx,
    primaryPlayer: pair.primaryPlayerId ? { id: pair.primaryPlayerId, name: pair.primaryPlayerName } : null,
    secondaryPlayer: pair.secondaryPlayerId ? { id: pair.secondaryPlayerId, name: pair.secondaryPlayerName } : null,
    label: pairLabel(pair),
  }));
}

function buildPairLiveStates(pairCount: number, stats: RaundStatRow[]): KotcNextPairLiveState[] {
  const byPair = new Map(stats.map((row) => [row.pairIdx, row]));
  return Array.from({ length: pairCount }, (_, pairIdx) => {
    const stat = byPair.get(pairIdx);
    return {
      pairIdx,
      kingWins: stat?.kingWins ?? 0,
      takeovers: stat?.takeovers ?? 0,
      gamesPlayed: stat?.gamesPlayed ?? 0,
    };
  });
}

function eventSortOrder(raundNo: number, event: KotcNextGameEvent): number {
  const playedAtMs = new Date(event.playedAt).getTime();
  if (Number.isFinite(playedAtMs)) {
    return playedAtMs * 1000 + event.seqNo;
  }
  return raundNo * 1_000_000 + event.seqNo;
}

function buildPairLiveStatesWithRuns(
  pairCount: number,
  stats: RaundStatRow[],
  events: KotcNextGameEvent[] = [],
  raundNo = 1,
): KotcNextPairLiveState[] {
  return applyKotcNextKingRunTieBreaks(
    buildPairLiveStates(pairCount, stats),
    events.map((event) => ({
      eventType: event.eventType,
      kingPairIdx: event.kingPairIdx,
      seqNo: event.seqNo,
      order: eventSortOrder(raundNo, event),
    })),
  );
}

function buildLiveState(
  pairs: PairRow[],
  raund: RaundRow,
  stats: RaundStatRow[],
  events: KotcNextGameEvent[] = [],
): KotcNextCourtLiveState {
  return {
    currentRaundNo: raund.raundNo,
    kingPairIdx: raund.kingPairIdx,
    challengerPairIdx: raund.challengerPairIdx,
    queueOrder: [...raund.queueOrder],
    pairs: buildPairLiveStatesWithRuns(pairs.length, stats, events, raund.raundNo),
    timerStartedAt: raund.startedAt,
    timerPausedAt: raund.pausedAt,
    timerAccumulatedPauseMs: raund.accumulatedPauseMs,
    pausedPhase: raund.pausedPhase,
    lastStatusChangedAt: raund.statusChangedAt,
    timerControlledBy: raund.lastControlledBy,
    revision: raund.revision,
    timerMinutes: raund.timerMinutes,
    status: raund.status,
    displayStatus: raundDisplayStatus(raund),
  };
}

function isBlankRaundStats(stats: RaundStatRow[]): boolean {
  return stats.every((row) => row.kingWins === 0 && row.takeovers === 0 && row.gamesPlayed === 0);
}

function hasInitialOrderDrift(raund: RaundRow, initialState: KotcNextCourtLiveState): boolean {
  return (
    raund.kingPairIdx !== initialState.kingPairIdx ||
    raund.challengerPairIdx !== initialState.challengerPairIdx ||
    raund.queueOrder.join('|') !== initialState.queueOrder.join('|')
  );
}

async function repairPendingInitialRaundOrderTx(
  client: PoolClient,
  tournament: TournamentRow,
  round: RoundRow,
  court: CourtRow,
  raund: RaundRow,
  stats: RaundStatRow[],
  events: KotcNextGameEvent[],
): Promise<RaundRow> {
  if (raund.status !== 'pending' || events.length > 0 || !isBlankRaundStats(stats)) {
    return raund;
  }

  const initialState = buildInitialState(tournament, round, court, raund.raundNo, null);
  if (!hasInitialOrderDrift(raund, initialState)) {
    return raund;
  }

  await writeRaundStateTx(client, raund.raundId, initialState);
  return {
    ...raund,
    kingPairIdx: initialState.kingPairIdx,
    challengerPairIdx: initialState.challengerPairIdx,
    queueOrder: [...initialState.queueOrder],
    timerMinutes: initialState.timerMinutes,
    startedAt: initialState.timerStartedAt,
    status: initialState.status,
  };
}

function buildJudgeRaundInstanceKey(raund: RaundRow): string {
  return [
    raund.raundId,
    raund.startedAt ?? 'not-started',
    raund.finishedAt ?? 'not-finished',
    raund.status,
  ].join(':');
}

function buildJudgeRaundRevision(raund: RaundRow, events: KotcNextGameEvent[]): number {
  if (raund.revision > 0) return raund.revision;
  const eventScore = events.length * 100;
  const queueScore = raund.queueOrder.length * 10;
  const statusScore =
    raund.status === 'running'
      ? 3
      : raund.status === 'finished'
        ? 2
        : 1;
  const timerScore = raund.startedAt ? 1 : 0;
  return eventScore + queueScore + statusScore + timerScore;
}

async function ensureBlankRaundStatsTx(client: PoolClient, raundId: string, pairCount: number): Promise<void> {
  for (let pairIdx = 0; pairIdx < pairCount; pairIdx += 1) {
    await client.query(
      `
        INSERT INTO kotcn_raund_stat (raund_id, pair_idx, king_wins, takeovers, games_played)
        VALUES ($1, $2, 0, 0, 0)
        ON CONFLICT (raund_id, pair_idx) DO NOTHING
      `,
      [raundId, pairIdx],
    );
  }
}

async function writeRaundStateTx(client: PoolClient, raundId: string, state: KotcNextCourtLiveState): Promise<void> {
  await client.query(
    `
      UPDATE kotcn_raund
      SET king_pair_idx = $2,
          challenger_pair_idx = $3,
          queue_order = $4,
          started_at = $5,
          timer_minutes = $6,
          status = $7,
          revision = revision + 1
      WHERE id = $1
    `,
    [
      raundId,
      state.kingPairIdx,
      state.challengerPairIdx,
      state.queueOrder,
      state.timerStartedAt ? new Date(state.timerStartedAt) : null,
      state.timerMinutes,
      state.status,
    ],
  );

  for (const pair of state.pairs) {
    await client.query(
      `
        INSERT INTO kotcn_raund_stat (raund_id, pair_idx, king_wins, takeovers, games_played)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (raund_id, pair_idx)
        DO UPDATE SET
          king_wins = EXCLUDED.king_wins,
          takeovers = EXCLUDED.takeovers,
          games_played = EXCLUDED.games_played
      `,
      [raundId, pair.pairIdx, pair.kingWins, pair.takeovers, pair.gamesPlayed],
    );
  }
}

async function recomputeRaundFromEventsTx(
  client: PoolClient,
  tournament: TournamentRow,
  round: RoundRow,
  court: CourtRow,
  raund: RaundRow,
  pairs: PairRow[],
  events: KotcNextGameEvent[],
): Promise<KotcNextCourtLiveState> {
  const baseState = applyUndo({
    pairCount: pairs.length,
    raundNo: raund.raundNo,
    seed: buildCourtSeed(round.seed, court.courtNo),
    timerMinutes: raund.timerMinutes,
    timerStartedAt: raund.startedAt,
    takeoversMode: tournament.params.takeoversMode,
    events: events.map((event) => ({ eventType: event.eventType, kingPairIdx: event.kingPairIdx })),
  });
  const corrections = await client.query(
    `
      SELECT event.payload
      FROM kotcn_event_log event
      WHERE event.raund_id = $1
        AND event.event_type = 'correct_score'
        AND NOT EXISTS (
          SELECT 1 FROM kotcn_event_log revert_event
          WHERE revert_event.reverted_event_id = event.id
        )
      ORDER BY event.created_at ASC, event.id ASC
    `,
    [raund.raundId],
  );
  const deltas = new Map<number, number>();
  for (const row of corrections.rows) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {};
    const pairIdx = asInt(payload.pairIdx, -1);
    const delta = asInt(payload.delta, 0);
    if (pairIdx >= 0 && delta) deltas.set(pairIdx, (deltas.get(pairIdx) ?? 0) + delta);
  }
  const state: KotcNextCourtLiveState = {
    ...baseState,
    pairs: baseState.pairs.map((pair) => {
      const delta = deltas.get(pair.pairIdx) ?? 0;
      return delta
        ? { ...pair, kingWins: Math.max(0, pair.kingWins + delta), gamesPlayed: Math.max(0, pair.gamesPlayed + delta) }
        : pair;
    }),
    timerPausedAt: raund.pausedAt,
    timerAccumulatedPauseMs: raund.accumulatedPauseMs,
    pausedPhase: raund.pausedPhase,
    lastStatusChangedAt: raund.statusChangedAt,
    timerControlledBy: raund.lastControlledBy,
    revision: raund.revision,
    status: raund.status,
    displayStatus: raundDisplayStatus(raund),
  };
  void tournament;
  await writeRaundStateTx(client, raund.raundId, state);
  return state;
}

function getAccessibleRaundNos(raunds: RaundRow[]): Set<number> {
  const accessible = new Set<number>();
  for (const raund of raunds) {
    if (raund.status === 'finished' || raund.status === 'running' || raund.status === 'paused') {
      accessible.add(raund.raundNo);
    }
  }
  const firstPending = raunds.find((row) => row.status === 'pending') ?? null;
  if (firstPending) accessible.add(firstPending.raundNo);
  return accessible;
}

function selectCurrentRaund(raunds: RaundRow[], selectedRaundNo?: number | null): RaundRow | null {
  const accessible = getAccessibleRaundNos(raunds);
  const requestedRaundNo =
    Number.isInteger(selectedRaundNo) && selectedRaundNo != null
      ? Math.trunc(selectedRaundNo)
      : null;
  const explicit =
    requestedRaundNo != null && accessible.has(requestedRaundNo)
      ? raunds.find((row) => row.raundNo === requestedRaundNo)
      : null;
  return explicit ?? raunds.find((row) => row.status === 'running' || row.status === 'paused') ?? raunds.find((row) => row.status === 'pending') ?? raunds[raunds.length - 1] ?? null;
}

async function loadJudgeRoundNavTx(
  client: PoolClient,
  tournamentId: string,
  selectedRoundNo: number,
  selectedCourtNo: number,
  maxCourts: number,
): Promise<{ roundNav: KotcNextJudgeRoundNavItem[]; courtNav: KotcNextJudgeCourtNavItem[] }> {
  const rounds = await listRoundsTx(client, tournamentId);
  const courtsByRoundNo = new Map<number, CourtRow[]>();

  for (const round of rounds) {
    courtsByRoundNo.set(round.roundNo, await listCourtsByRoundTx(client, round.roundId));
  }

  const roundNav: KotcNextJudgeRoundNavItem[] = [1, 2].map((roundNo) => {
    const round = rounds.find((entry) => entry.roundNo === roundNo) ?? null;
    const roundCourts = courtsByRoundNo.get(roundNo) ?? [];
    const courts: KotcNextJudgeCourtNavItem[] = Array.from(
      { length: Math.max(1, maxCourts) },
      (_, index) => {
        const courtNo = index + 1;
        const court = roundCourts.find((entry) => entry.courtNo === courtNo) ?? null;
        return {
          courtId: court?.courtId ?? null,
          courtNo,
          label: court?.label ?? `K${courtNo}`,
          judgeUrl: court ? judgeUrlForPin(court.pinCode) : null,
          isSelected: roundNo === selectedRoundNo && courtNo === selectedCourtNo,
          isAvailable: Boolean(court),
        };
      },
    );

    return {
      roundId: round?.roundId ?? null,
      roundNo,
      roundType: roundTypeFromNo(roundNo),
      label: judgeRoundLabel(roundNo),
      isSelected: roundNo === selectedRoundNo,
      isAvailable: Boolean(round),
      courts,
    };
  });

  const courtNav =
    roundNav.find((entry) => entry.roundNo === selectedRoundNo)?.courts ??
    roundNav[0]?.courts ??
    [];

  return { roundNav, courtNav };
}

function zoneFromCourtLabel(label: string): KotcNextZoneKey | null {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === '\u0445\u0430\u0440\u0434' || normalized === 'hard') return 'kin';
  if (normalized === '\u043a\u0438\u043d') return 'kin';
  if (normalized === '\u0430\u0434\u0430\u043d\u0441' || normalized === '\u0430\u0434\u0432\u0430\u043d\u0441') return 'advance';
  if (normalized === '\u043c\u0435\u0434\u0438\u0443\u043c') return 'medium';
  if (normalized === '\u043b\u0430\u0439\u0442') return 'lite';
  if (normalized === 'кин' || normalized === 'kin') return 'kin';
  if (normalized === 'аданс' || normalized === 'advance') return 'advance';
  if (normalized === 'медиум' || normalized === 'medium') return 'medium';
  if (normalized === 'лайт' || normalized === 'lite') return 'lite';
  return null;
}

async function loadAggregatePairRowsTx(
  client: PoolClient,
  round: RoundRow,
  takeoversMode: TournamentRow['params']['takeoversMode'],
): Promise<AggregatePairRow[]> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const result: AggregatePairRow[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const totals = new Map<number, KotcNextPairLiveState>();

    for (const pair of pairs) {
      totals.set(pair.pairIdx, {
        pairIdx: pair.pairIdx,
        kingWins: 0,
        takeovers: 0,
        gamesPlayed: 0,
      });
    }

    for (const raund of raunds) {
      const stats = await listRaundStatsTx(client, raund.raundId);
      const events = await listGameEventsTx(client, raund.raundId);
      for (const stat of stats) {
        const target = totals.get(stat.pairIdx);
        if (!target) continue;
        target.kingWins += stat.kingWins;
        target.takeovers += stat.takeovers;
        target.gamesPlayed += stat.gamesPlayed;
      }
      const withRuns = applyKotcNextKingRunTieBreaks(
        [...totals.values()],
        events.map((event) => ({
          eventType: event.eventType,
          kingPairIdx: event.kingPairIdx,
          seqNo: event.seqNo,
          order: eventSortOrder(raund.raundNo, event),
        })),
      );
      for (const row of withRuns) {
        const target = totals.get(row.pairIdx);
        if (!target) continue;
        const currentRun = target.longestKingRun ?? 0;
        const candidateRun = row.longestKingRun ?? 0;
        const currentOrder = target.firstLongestKingRunOrder ?? Number.POSITIVE_INFINITY;
        const candidateOrder = row.firstLongestKingRunOrder ?? Number.POSITIVE_INFINITY;
        if (candidateRun > currentRun || (candidateRun === currentRun && candidateRun > 0 && candidateOrder < currentOrder)) {
          target.longestKingRun = candidateRun;
          target.firstLongestKingRunOrder = Number.isFinite(candidateOrder) ? candidateOrder : null;
        }
      }
    }

    const ranked = calcKotcNextRaundStandings([...totals.values()], takeoversMode).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
    const positionByPair = new Map(ranked.map((entry) => [entry.pairIdx, entry.position]));

    for (const pair of pairs) {
      const total = totals.get(pair.pairIdx) ?? { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 };
      result.push({
        courtId: court.courtId,
        courtNo: court.courtNo,
        courtLabel: court.label,
        pairIdx: pair.pairIdx,
        pairLabel: pairLabel(pair),
        primaryPlayerId: pair.primaryPlayerId,
        primaryPlayerName: pair.primaryPlayerName,
        primaryGender: pair.primaryGender,
        secondaryPlayerId: pair.secondaryPlayerId,
        secondaryPlayerName: pair.secondaryPlayerName,
        secondaryGender: pair.secondaryGender,
        kingWins: total.kingWins,
        takeovers: total.takeovers,
        gamesPlayed: total.gamesPlayed,
        longestKingRun: total.longestKingRun ?? 0,
        firstLongestKingRunOrder: total.firstLongestKingRunOrder ?? null,
        position: positionByPair.get(pair.pairIdx) ?? pairs.length,
        zone: zoneFromCourtLabel(court.label),
      });
    }
  }

  return result;
}

function rotatingSecondaryPairIdx(pairIdx: number, raundNo: number, pairCount: number): number {
  if (pairCount <= 0) return pairIdx;
  return (pairIdx + Math.max(0, raundNo - 1)) % pairCount;
}

async function loadJudgeRaundPairRowsTx(
  client: PoolClient,
  round: RoundRow,
  tournament: TournamentRow,
  raundNo: number,
): Promise<AggregatePairRow[]> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const result: AggregatePairRow[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const raund = raunds.find((row) => row.raundNo === raundNo) ?? null;
    if (!raund) continue;

    const stats = await listRaundStatsTx(client, raund.raundId);
    const events = await listGameEventsTx(client, raund.raundId);
    const liveRows = buildPairLiveStatesWithRuns(pairs.length, stats, events, raund.raundNo);
    const ranked = calcKotcNextRaundStandings(liveRows, tournament.params.takeoversMode).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
    const zone = zoneFromCourtLabel(court.label);

    for (const row of ranked) {
      const primaryPair = pairs.find((pair) => pair.pairIdx === row.pairIdx) ?? null;
      if (!primaryPair) continue;
      const secondaryIdx =
        tournament.variant === 'MF' || tournament.variant === 'MN'
          ? rotatingSecondaryPairIdx(row.pairIdx, raund.raundNo, pairs.length)
          : row.pairIdx;
      const secondaryPair = pairs.find((pair) => pair.pairIdx === secondaryIdx) ?? primaryPair;

      result.push({
        courtId: court.courtId,
        courtNo: court.courtNo,
        courtLabel: court.label,
        pairIdx: row.pairIdx,
        pairLabel:
          tournament.variant === 'MF' || tournament.variant === 'MN'
            ? `${primaryPair.primaryPlayerName} / ${secondaryPair.secondaryPlayerName}`
            : pairLabel(primaryPair),
        primaryPlayerId: primaryPair.primaryPlayerId,
        primaryPlayerName: primaryPair.primaryPlayerName,
        primaryGender: primaryPair.primaryGender,
        secondaryPlayerId:
          tournament.variant === 'MF' || tournament.variant === 'MN'
            ? secondaryPair.secondaryPlayerId
            : primaryPair.secondaryPlayerId,
        secondaryPlayerName:
          tournament.variant === 'MF' || tournament.variant === 'MN'
            ? secondaryPair.secondaryPlayerName
            : primaryPair.secondaryPlayerName,
        secondaryGender:
          tournament.variant === 'MF' || tournament.variant === 'MN'
            ? secondaryPair.secondaryGender
            : primaryPair.secondaryGender,
        kingWins: row.kingWins,
        takeovers: row.takeovers,
        gamesPlayed: row.gamesPlayed,
        longestKingRun: row.longestKingRun ?? 0,
        firstLongestKingRunOrder: row.firstLongestKingRunOrder ?? null,
        position: row.position,
        zone,
      });
    }
  }

  return result;
}

function rankAggregateStandingsRows<T extends {
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun?: number;
  firstLongestKingRunOrder?: number | null;
}>(
  rows: T[],
  takeoversMode: TournamentRow['params']['takeoversMode'],
): Array<T & { position: number }> {
  const ranked = calcKotcNextRaundStandings(
    rows.map((row, syntheticPairIdx) => ({
      pairIdx: syntheticPairIdx,
      kingWins: row.kingWins,
      takeovers: row.takeovers,
      gamesPlayed: row.gamesPlayed,
      longestKingRun: row.longestKingRun ?? 0,
      firstLongestKingRunOrder: row.firstLongestKingRunOrder ?? null,
    })),
    takeoversMode,
  );
  return ranked.map((entry, index) => ({
    ...rows[entry.pairIdx]!,
    position: index + 1,
  }));
}

function buildJudgeAggregatePairStandings(
  rows: AggregatePairRow[],
  takeoversMode: TournamentRow['params']['takeoversMode'],
): KotcNextJudgeAggregatePairStanding[] {
  return rankAggregateStandingsRows(rows, takeoversMode).map((row) => ({
    position: row.position,
    courtNo: row.courtNo,
    courtLabel: row.courtLabel,
    zone: row.zone,
    zoneLabel: row.zone ? zoneLabel(row.zone) : null,
    pairIdx: row.pairIdx,
    pairLabel: row.pairLabel,
    kingWins: row.kingWins,
    takeovers: row.takeovers,
    gamesPlayed: row.gamesPlayed,
    longestKingRun: row.longestKingRun ?? 0,
    firstLongestKingRunOrder: row.firstLongestKingRunOrder ?? null,
  }));
}

function buildJudgeAggregatePlayerStandings(
  rows: IndividualRoundResultRow[],
  takeoversMode: TournamentRow['params']['takeoversMode'],
  gender: 'M' | 'W',
): KotcNextJudgeAggregatePlayerStanding[] {
  return rankAggregateStandingsRows(
    rows.filter((row) => row.gender === gender && (row.playerId || row.playerName.trim())),
    takeoversMode,
  ).map((row) => ({
    position: row.position,
    courtNo: row.courtNo,
    courtLabel: row.courtLabel,
    zone: row.zone,
    zoneLabel: row.zone ? zoneLabel(row.zone) : null,
    playerId: row.playerId,
    playerName: row.playerName,
    gender: row.gender,
    kingWins: row.kingWins,
    takeovers: row.takeovers,
    gamesPlayed: row.gamesPlayed,
    longestKingRun: row.longestKingRun ?? 0,
    firstLongestKingRunOrder: row.firstLongestKingRunOrder ?? null,
  }));
}

async function loadIndividualRoundResultRowsTx(
  client: PoolClient,
  round: RoundRow,
  tournament: TournamentRow,
): Promise<IndividualRoundResultRow[]> {
  if (tournament.variant !== 'MF') {
    const summaryRows = await loadAggregatePairRowsTx(client, round, tournament.params.takeoversMode);
    return summaryRows.flatMap((row) =>
      [
        {
          courtNo: row.courtNo,
          courtLabel: row.courtLabel,
          pairIdx: row.pairIdx,
          playerId: row.primaryPlayerId,
          playerName: row.primaryPlayerName,
          gender: row.primaryGender,
          kingWins: row.kingWins,
          takeovers: row.takeovers,
          gamesPlayed: row.gamesPlayed,
          longestKingRun: row.longestKingRun,
          firstLongestKingRunOrder: row.firstLongestKingRunOrder,
          position: row.position,
          zone: row.zone,
        },
        {
          courtNo: row.courtNo,
          courtLabel: row.courtLabel,
          pairIdx: row.pairIdx,
          playerId: row.secondaryPlayerId,
          playerName: row.secondaryPlayerName,
          gender: row.secondaryGender,
          kingWins: row.kingWins,
          takeovers: row.takeovers,
          gamesPlayed: row.gamesPlayed,
          longestKingRun: row.longestKingRun,
          firstLongestKingRunOrder: row.firstLongestKingRunOrder,
          position: row.position,
          zone: row.zone,
        },
      ].filter((player) => player.playerId || player.playerName.trim()),
    );
  }

  const courts = await listCourtsByRoundTx(client, round.roundId);
  const result: IndividualRoundResultRow[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const primaryTotals = new Map<number, KotcNextPairLiveState>();
    const secondaryTotals = new Map<number, KotcNextPairLiveState>();

    for (const pair of pairs) {
      primaryTotals.set(pair.pairIdx, { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 });
      secondaryTotals.set(pair.pairIdx, { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 });
    }

    for (const raund of raunds) {
      const stats = await listRaundStatsTx(client, raund.raundId);
      for (const stat of stats) {
        const primary = primaryTotals.get(stat.pairIdx);
        if (primary) {
          primary.kingWins += stat.kingWins;
          primary.takeovers += stat.takeovers;
          primary.gamesPlayed += stat.gamesPlayed;
        }
        const secondaryIdx = rotatingSecondaryPairIdx(stat.pairIdx, raund.raundNo, pairs.length);
        const secondary = secondaryTotals.get(secondaryIdx);
        if (secondary) {
          secondary.kingWins += stat.kingWins;
          secondary.takeovers += stat.takeovers;
          secondary.gamesPlayed += stat.gamesPlayed;
        }
      }
    }

    const rankedPrimary = calcKotcNextRaundStandings([...primaryTotals.values()], tournament.params.takeoversMode).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
    const rankedSecondary = calcKotcNextRaundStandings([...secondaryTotals.values()], tournament.params.takeoversMode).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
    const primaryPosition = new Map(rankedPrimary.map((entry) => [entry.pairIdx, entry.position]));
    const secondaryPosition = new Map(rankedSecondary.map((entry) => [entry.pairIdx, entry.position]));
    const zone = zoneFromCourtLabel(court.label);

    for (const pair of pairs) {
      const primary = primaryTotals.get(pair.pairIdx) ?? { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 };
      result.push({
        courtNo: court.courtNo,
        courtLabel: court.label,
        pairIdx: pair.pairIdx,
        playerId: pair.primaryPlayerId,
        playerName: pair.primaryPlayerName,
        gender: pair.primaryGender,
        kingWins: primary.kingWins,
        takeovers: primary.takeovers,
        gamesPlayed: primary.gamesPlayed,
        longestKingRun: primary.longestKingRun ?? 0,
        firstLongestKingRunOrder: primary.firstLongestKingRunOrder ?? null,
        position: primaryPosition.get(pair.pairIdx) ?? pairs.length,
        zone,
      });

      const secondary = secondaryTotals.get(pair.pairIdx) ?? { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 };
      result.push({
        courtNo: court.courtNo,
        courtLabel: court.label,
        pairIdx: pair.pairIdx,
        playerId: pair.secondaryPlayerId,
        playerName: pair.secondaryPlayerName,
        gender: pair.secondaryGender,
        kingWins: secondary.kingWins,
        takeovers: secondary.takeovers,
        gamesPlayed: secondary.gamesPlayed,
        longestKingRun: secondary.longestKingRun ?? 0,
        firstLongestKingRunOrder: secondary.firstLongestKingRunOrder ?? null,
        position: secondaryPosition.get(pair.pairIdx) ?? pairs.length,
        zone,
      });
    }
  }

  return result;
}

async function loadR1IndividualSeedRowsTx(
  client: PoolClient,
  round: RoundRow,
  takeoversMode: TournamentRow['params']['takeoversMode'],
): Promise<IndividualSeedRow[]> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const result: IndividualSeedRow[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const primaryTotals = new Map<number, KotcNextPairLiveState>();
    const secondaryTotals = new Map<number, KotcNextPairLiveState>();

    for (const pair of pairs) {
      primaryTotals.set(pair.pairIdx, { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 });
      secondaryTotals.set(pair.pairIdx, { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 });
    }

    for (const raund of raunds) {
      const stats = await listRaundStatsTx(client, raund.raundId);
      for (const stat of stats) {
        const primary = primaryTotals.get(stat.pairIdx);
        if (primary) {
          primary.kingWins += stat.kingWins;
          primary.takeovers += stat.takeovers;
          primary.gamesPlayed += stat.gamesPlayed;
        }
        const secondaryIdx = rotatingSecondaryPairIdx(stat.pairIdx, raund.raundNo, pairs.length);
        const secondary = secondaryTotals.get(secondaryIdx);
        if (secondary) {
          secondary.kingWins += stat.kingWins;
          secondary.takeovers += stat.takeovers;
          secondary.gamesPlayed += stat.gamesPlayed;
        }
      }
    }

    const rankedPrimary = calcKotcNextRaundStandings([...primaryTotals.values()], takeoversMode).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
    const rankedSecondary = calcKotcNextRaundStandings([...secondaryTotals.values()], takeoversMode).map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
    const primaryPosition = new Map(rankedPrimary.map((entry) => [entry.pairIdx, entry.position]));
    const secondaryPosition = new Map(rankedSecondary.map((entry) => [entry.pairIdx, entry.position]));

    for (const pair of pairs) {
      const primary = primaryTotals.get(pair.pairIdx) ?? { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 };
      result.push({
        courtNo: court.courtNo,
        pairIdx: pair.pairIdx,
        playerId: pair.primaryPlayerId,
        playerName: pair.primaryPlayerName,
        gender: pair.primaryGender,
        kingWins: primary.kingWins,
        takeovers: primary.takeovers,
        gamesPlayed: primary.gamesPlayed,
        longestKingRun: primary.longestKingRun ?? 0,
        firstLongestKingRunOrder: primary.firstLongestKingRunOrder ?? null,
        position: primaryPosition.get(pair.pairIdx) ?? pairs.length,
      });

      const secondary = secondaryTotals.get(pair.pairIdx) ?? { pairIdx: pair.pairIdx, kingWins: 0, takeovers: 0, gamesPlayed: 0 };
      result.push({
        courtNo: court.courtNo,
        pairIdx: pair.pairIdx,
        playerId: pair.secondaryPlayerId,
        playerName: pair.secondaryPlayerName,
        gender: pair.secondaryGender,
        kingWins: secondary.kingWins,
        takeovers: secondary.takeovers,
        gamesPlayed: secondary.gamesPlayed,
        longestKingRun: secondary.longestKingRun ?? 0,
        firstLongestKingRunOrder: secondary.firstLongestKingRunOrder ?? null,
        position: secondaryPosition.get(pair.pairIdx) ?? pairs.length,
      });
    }
  }

  return result;
}

function buildR2ZoneMap(
  summaryRows: AggregatePairRow[],
  takeoversMode: TournamentRow['params']['takeoversMode'],
  r2SeedingMode: TournamentRow['params']['r2SeedingMode'],
): Map<string, KotcNextZoneKey> {
  const draft = seedKotcNextR2Courts(
    summaryRows.map((row) => ({
      courtNo: row.courtNo,
      pairIdx: row.pairIdx,
      pairLabel: row.pairLabel,
      kingWins: row.kingWins,
      takeovers: row.takeovers,
      gamesPlayed: row.gamesPlayed,
      longestKingRun: row.longestKingRun,
      firstLongestKingRunOrder: row.firstLongestKingRunOrder,
    })),
    takeoversMode,
    r2SeedingMode,
  );
  const zoneMap = new Map<string, KotcNextZoneKey>();
  for (const zone of draft) {
    for (const ref of zone.pairRefs) {
      zoneMap.set(`${ref.courtNo}:${ref.pairIdx}`, zone.zone);
    }
  }
  return zoneMap;
}

function seedRowsByGender(
  rows: IndividualSeedRow[],
  gender: 'M' | 'W',
  takeoversMode: TournamentRow['params']['takeoversMode'],
  r2SeedingMode: TournamentRow['params']['r2SeedingMode'],
): KotcNextR2SeedZone[] {
  return seedKotcNextR2Courts(
    rows
      .filter((row) => row.gender === gender && row.playerId && row.playerName.trim())
      .map((row) => ({
        courtNo: row.courtNo,
        pairIdx: row.pairIdx,
        pairLabel: row.playerName,
        kingWins: row.kingWins,
        takeovers: row.takeovers,
        gamesPlayed: row.gamesPlayed,
        longestKingRun: row.longestKingRun,
        firstLongestKingRunOrder: row.firstLongestKingRunOrder,
      })),
    takeoversMode,
    r2SeedingMode,
  );
}

function findIndividualSeedRow(rows: IndividualSeedRow[], gender: 'M' | 'W', ref: { courtNo: number; pairIdx: number }): IndividualSeedRow | null {
  return rows.find((row) => row.gender === gender && row.courtNo === ref.courtNo && row.pairIdx === ref.pairIdx) ?? null;
}

async function getKotcNextR2IndividualSeedDraftTx(
  client: PoolClient,
  tournament: TournamentRow,
  r1: RoundRow,
): Promise<KotcNextR2SeedZone[]> {
  const rows = await loadR1IndividualSeedRowsTx(client, r1, tournament.params.takeoversMode);
  const menZones = seedRowsByGender(rows, 'M', tournament.params.takeoversMode, tournament.params.r2SeedingMode);
  const womenZones = seedRowsByGender(rows, 'W', tournament.params.takeoversMode, tournament.params.r2SeedingMode);
  const zoneCount = Math.max(menZones.length, womenZones.length);

  return Array.from({ length: zoneCount }, (_, zoneIndex) => {
    const menRefs = menZones[zoneIndex]?.pairRefs ?? [];
    const womenRefs = womenZones[zoneIndex]?.pairRefs ?? [];
    const zone = menZones[zoneIndex]?.zone ?? womenZones[zoneIndex]?.zone ?? 'lite';
    const size = Math.max(menRefs.length, womenRefs.length);

    return {
      zone,
      pairRefs: Array.from({ length: size }, (__, pairIdx) => {
        const man = menRefs[pairIdx] ? findIndividualSeedRow(rows, 'M', menRefs[pairIdx]) : null;
        const woman = womenRefs[pairIdx] ? findIndividualSeedRow(rows, 'W', womenRefs[pairIdx]) : null;
        return {
          courtNo: zoneIndex + 1,
          pairIdx,
          pairLabel: `${man?.playerName || 'M'} / ${woman?.playerName || 'W'}`,
          kingWins: (man?.kingWins ?? 0) + (woman?.kingWins ?? 0),
          takeovers: (man?.takeovers ?? 0) + (woman?.takeovers ?? 0),
          longestKingRun: Math.max(man?.longestKingRun ?? 0, woman?.longestKingRun ?? 0),
          firstLongestKingRunOrder: man?.firstLongestKingRunOrder ?? woman?.firstLongestKingRunOrder ?? null,
          primaryPlayerId: man?.playerId ?? null,
          primaryPlayerName: man?.playerName ?? '',
          primaryGender: man?.gender ?? 'M',
          secondaryPlayerId: woman?.playerId ?? null,
          secondaryPlayerName: woman?.playerName ?? '',
          secondaryGender: woman?.gender ?? 'W',
        };
      }),
    };
  });
}

function buildManualZonesFromSeedDraft(draft: KotcNextR2SeedZone[]): KotcNextR2ManualZone[] {
  return draft.map((zone) => ({
    zone: zone.zone,
    players: zone.pairRefs.flatMap((pair) => [
      {
        playerId: pair.primaryPlayerId ?? null,
        playerName: pair.primaryPlayerName ?? '',
        gender: pair.primaryGender ?? null,
        sourceCourtNo: pair.courtNo,
        sourcePairIdx: pair.pairIdx,
        kingWins: pair.kingWins,
        takeovers: pair.takeovers,
        gamesPlayed: 0,
        longestKingRun: pair.longestKingRun ?? 0,
        firstLongestKingRunOrder: pair.firstLongestKingRunOrder ?? null,
        position: pair.pairIdx + 1,
      },
      {
        playerId: pair.secondaryPlayerId ?? null,
        playerName: pair.secondaryPlayerName ?? '',
        gender: pair.secondaryGender ?? null,
        sourceCourtNo: pair.courtNo,
        sourcePairIdx: pair.pairIdx,
        kingWins: pair.kingWins,
        takeovers: pair.takeovers,
        gamesPlayed: 0,
        longestKingRun: pair.longestKingRun ?? 0,
        firstLongestKingRunOrder: pair.firstLongestKingRunOrder ?? null,
        position: pair.pairIdx + 1,
      },
    ]).filter((player) => player.playerId || player.playerName.trim()),
  }));
}

function buildManualZonesFromAggregateRows(
  rows: AggregatePairRow[],
  takeoversMode: TournamentRow['params']['takeoversMode'],
  r2SeedingMode: TournamentRow['params']['r2SeedingMode'],
): KotcNextR2ManualZone[] {
  const seeded = seedKotcNextR2Courts(
    rows.map((row) => ({
      courtNo: row.courtNo,
      pairIdx: row.pairIdx,
      pairLabel: row.pairLabel,
      kingWins: row.kingWins,
      takeovers: row.takeovers,
      gamesPlayed: row.gamesPlayed,
      longestKingRun: row.longestKingRun,
      firstLongestKingRunOrder: row.firstLongestKingRunOrder,
    })),
    takeoversMode,
    r2SeedingMode,
  );
  const rowsByKey = new Map(rows.map((row) => [`${row.courtNo}:${row.pairIdx}`, row] as const));
  return seeded.map((zone) => ({
    zone: zone.zone,
    players: zone.pairRefs.flatMap((ref) => {
      const row = rowsByKey.get(`${ref.courtNo}:${ref.pairIdx}`);
      if (!row) return [];
      return [
        {
          playerId: row.primaryPlayerId ?? null,
          playerName: row.primaryPlayerName,
          gender: row.primaryGender ?? null,
          sourceCourtNo: row.courtNo,
          sourcePairIdx: row.pairIdx,
          kingWins: row.kingWins,
          takeovers: row.takeovers,
          gamesPlayed: row.gamesPlayed,
          longestKingRun: row.longestKingRun,
          firstLongestKingRunOrder: row.firstLongestKingRunOrder,
          position: row.position,
        },
        {
          playerId: row.secondaryPlayerId ?? null,
          playerName: row.secondaryPlayerName,
          gender: row.secondaryGender ?? null,
          sourceCourtNo: row.courtNo,
          sourcePairIdx: row.pairIdx,
          kingWins: row.kingWins,
          takeovers: row.takeovers,
          gamesPlayed: row.gamesPlayed,
          longestKingRun: row.longestKingRun,
          firstLongestKingRunOrder: row.firstLongestKingRunOrder,
          position: row.position,
        },
      ].filter((player) => player.playerId || player.playerName.trim());
    }),
  }));
}

async function buildManualZonesFromCurrentRoundTx(
  client: PoolClient,
  tournament: TournamentRow,
  r1: RoundRow,
  r2: RoundRow,
): Promise<KotcNextR2ManualZone[]> {
  const baselineDraft =
    tournament.variant === 'MF'
      ? buildManualZonesFromSeedDraft(await getKotcNextR2IndividualSeedDraftTx(client, tournament, r1))
      : buildManualZonesFromAggregateRows(
          await loadAggregatePairRowsTx(client, r1, tournament.params.takeoversMode),
          tournament.params.takeoversMode,
          tournament.params.r2SeedingMode,
        );

  const baselineByPlayerId = new Map<string, KotcNextR2ManualPlayerRef>();
  const baselineByName = new Map<string, KotcNextR2ManualPlayerRef>();
  for (const zone of baselineDraft) {
    for (const player of zone.players) {
      if (player.playerId) baselineByPlayerId.set(player.playerId, player);
      const normalizedName = player.playerName.trim().toLowerCase();
      if (normalizedName) baselineByName.set(normalizedName, player);
    }
  }

  const courts = await listCourtsByRoundTx(client, r2.roundId);
  const zones: KotcNextR2ManualZone[] = [];
  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const zone = zoneFromCourtLabel(court.label) ?? ZONE_ORDER[Math.max(0, court.courtNo - 1)] ?? 'lite';
    const players: KotcNextR2ManualPlayerRef[] = [];

    for (const pair of pairs) {
      for (const current of [
        {
          playerId: pair.primaryPlayerId,
          playerName: pair.primaryPlayerName,
          gender: pair.primaryGender,
        },
        {
          playerId: pair.secondaryPlayerId,
          playerName: pair.secondaryPlayerName,
          gender: pair.secondaryGender,
        },
      ]) {
        const normalizedName = String(current.playerName || '').trim().toLowerCase();
        const source =
          (current.playerId ? baselineByPlayerId.get(current.playerId) : null) ??
          (normalizedName ? baselineByName.get(normalizedName) : null);
        players.push({
          playerId: current.playerId ?? source?.playerId ?? null,
          playerName: String(current.playerName || source?.playerName || ''),
          gender: current.gender ?? source?.gender ?? null,
          sourceCourtNo: source?.sourceCourtNo ?? court.courtNo,
          sourcePairIdx: source?.sourcePairIdx ?? pair.pairIdx,
          kingWins: source?.kingWins ?? 0,
          takeovers: source?.takeovers ?? 0,
          gamesPlayed: source?.gamesPlayed ?? 0,
          longestKingRun: source?.longestKingRun ?? 0,
          firstLongestKingRunOrder: source?.firstLongestKingRunOrder ?? null,
          position: source?.position ?? pair.pairIdx + 1,
        });
      }
    }

    zones.push({ zone, players });
  }

  return zones;
}

async function getKotcNextR2ManualDraftTx(
  client: PoolClient,
  tournament: TournamentRow,
  r1: RoundRow,
): Promise<KotcNextR2ManualZone[]> {
  const r2 = await loadRoundByNoTx(client, tournament.id, 2);
  if (r2) {
    return buildManualZonesFromCurrentRoundTx(client, tournament, r1, r2);
  }
  if (tournament.variant === 'MF') {
    return buildManualZonesFromSeedDraft(await getKotcNextR2IndividualSeedDraftTx(client, tournament, r1));
  }
  return buildManualZonesFromAggregateRows(
    await loadAggregatePairRowsTx(client, r1, tournament.params.takeoversMode),
    tournament.params.takeoversMode,
    tournament.params.r2SeedingMode,
  );
}

function manualDraftPlayerKey(player: Pick<KotcNextR2ManualPlayerRef, 'playerId' | 'playerName' | 'sourceCourtNo' | 'sourcePairIdx'>): string {
  return [
    String(player.playerId || '').trim(),
    String(player.playerName || '').trim().toLowerCase(),
    player.sourceCourtNo,
    player.sourcePairIdx,
  ].join(':');
}

function normalizeManualDraftInput(
  input: unknown,
  draft: KotcNextR2ManualZone[],
): KotcNextR2ManualZone[] {
  if (!Array.isArray(input) || !input.length) return draft;

  const draftByPlayer = new Map<string, KotcNextR2ManualPlayerRef>();
  const expectedKeys = draft.flatMap((zone) => zone.players.map((player) => manualDraftPlayerKey(player))).sort();
  for (const zone of draft) {
    for (const player of zone.players) {
      draftByPlayer.set(manualDraftPlayerKey(player), player);
    }
  }

  const normalized = input.map((zoneInput) => {
    if (!zoneInput || typeof zoneInput !== 'object' || Array.isArray(zoneInput)) {
      throw new KotcNextError(400, 'Invalid manual R2 payload');
    }
    const zone = normalizeZoneKey((zoneInput as { zone?: unknown }).zone);
    const players = Array.isArray((zoneInput as { players?: unknown }).players)
      ? (zoneInput as { players: Array<Record<string, unknown>> }).players
      : [];
    return {
      zone,
      players: players.map((player) => {
        const key = manualDraftPlayerKey({
          playerId: typeof player.playerId === 'string' ? player.playerId : null,
          playerName: String(player.playerName || ''),
          sourceCourtNo: asInt(player.sourceCourtNo, 0),
          sourcePairIdx: asInt(player.sourcePairIdx, -1),
        });
        const source = draftByPlayer.get(key);
        if (!source) {
          throw new KotcNextError(409, 'Manual R2 payload no longer matches the draft');
        }
        return source;
      }),
    } satisfies KotcNextR2ManualZone;
  });

  const normalizedKeys = normalized.flatMap((zone) => zone.players.map((player) => manualDraftPlayerKey(player))).sort();
  if (normalizedKeys.join('|') !== expectedKeys.join('|')) {
    throw new KotcNextError(409, 'Manual R2 payload no longer matches the draft');
  }
  return normalized;
}

function buildPairSourcesFromManualDraft(
  tournament: TournamentRow,
  draft: KotcNextR2ManualZone[],
): R1PairSource[] {
  return draft.map((zone, index) => {
    if (tournament.variant === 'MF') {
      if (zone.players.length < 2 || zone.players.length % 2 !== 0) {
        throw new KotcNextError(409, `Manual R2 zone ${zoneLabel(zone.zone)} must contain complete mixed pairs`);
      }
      return {
        courtNo: index + 1,
        pairs: Array.from({ length: zone.players.length / 2 }, (_, pairIdx) => {
          const primary = zone.players[pairIdx * 2];
          const secondary = zone.players[pairIdx * 2 + 1];
          if (!primary || !secondary) {
            throw new KotcNextError(409, `Manual R2 zone ${zoneLabel(zone.zone)} is missing a pair slot`);
          }
          if (primary.gender === secondary.gender) {
            throw new KotcNextError(
              409,
              `Manual R2 zone ${zoneLabel(zone.zone)} must contain one man and one woman in each pair`,
            );
          }
          return {
            primaryPlayerId: primary.playerId,
            primaryPlayerName: primary.playerName,
            secondaryPlayerId: secondary.playerId,
            secondaryPlayerName: secondary.playerName,
            primaryGender: primary.gender,
            secondaryGender: secondary.gender,
          };
        }),
      };
    }

    if (zone.players.length < 2 || zone.players.length % 2 !== 0) {
      throw new KotcNextError(409, `Manual R2 zone ${zoneLabel(zone.zone)} must contain complete pairs`);
    }

    return {
      courtNo: index + 1,
      pairs: Array.from({ length: zone.players.length / 2 }, (_, pairIdx) => {
        const primary = zone.players[pairIdx * 2];
        const secondary = zone.players[pairIdx * 2 + 1];
        if (!primary || !secondary) {
          throw new KotcNextError(409, `Manual R2 zone ${zoneLabel(zone.zone)} is missing a pair slot`);
        }
        return {
          primaryPlayerId: primary.playerId,
          primaryPlayerName: primary.playerName,
          secondaryPlayerId: secondary.playerId,
          secondaryPlayerName: secondary.playerName,
          primaryGender: primary.gender,
          secondaryGender: secondary.gender,
        };
      }),
    };
  });
}

async function persistPlayerRoundStatsTx(
  client: PoolClient,
  round: RoundRow,
  summaryRows: AggregatePairRow[],
  takeoversMode: TournamentRow['params']['takeoversMode'],
  r2SeedingMode: TournamentRow['params']['r2SeedingMode'],
): Promise<void> {
  await client.query(`DELETE FROM kotcn_player_round_stat WHERE round_id = $1`, [round.roundId]);
  const r1ZoneMap =
    round.roundNo === 1 ? buildR2ZoneMap(summaryRows, takeoversMode, r2SeedingMode) : new Map<string, KotcNextZoneKey>();

  for (const row of summaryRows) {
    const zone = round.roundNo === 2 ? row.zone : r1ZoneMap.get(`${row.courtNo}:${row.pairIdx}`) ?? null;
    for (const player of [
      { playerId: row.primaryPlayerId, playerName: row.primaryPlayerName },
      { playerId: row.secondaryPlayerId, playerName: row.secondaryPlayerName },
    ]) {
      if (!player.playerId || !player.playerName.trim()) continue;
      await client.query(
        `
          INSERT INTO kotcn_player_round_stat (
            round_id, player_id, pair_idx, king_wins, takeovers, games_played, position, zone
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [round.roundId, player.playerId, row.pairIdx, row.kingWins, row.takeovers, row.gamesPlayed, row.position, zone],
      );
    }
  }
}

export async function resetKotcNextState(tournamentId: string): Promise<{
  tournamentId: string;
  removedRoundCount: number;
  removedCourtCount: number;
  removedPairCount: number;
  removedRaundCount: number;
  removedGameCount: number;
  removedRaundStatCount: number;
  removedPlayerRoundStatCount: number;
  removedTournamentResultCount: number;
  clearedSignature: boolean;
  clearedSpectatorSnapshot: boolean;
}> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  return withTransaction((client) => resetKotcNextStateTx(client, normalizedId));
}

export async function replaceKotcNextTournamentPlayer(
  tournamentId: string,
  input: { oldPlayerId: string; newPlayerId: string },
): Promise<KotcNextPlayerReplacementAudit> {
  const normalizedTournamentId = String(tournamentId || '').trim();
  const oldPlayerId = String(input.oldPlayerId || '').trim();
  const newPlayerId = String(input.newPlayerId || '').trim();
  if (!normalizedTournamentId) throw new KotcNextError(400, 'tournamentId is required');
  if (!oldPlayerId) throw new KotcNextError(400, 'oldPlayerId is required');
  if (!newPlayerId) throw new KotcNextError(400, 'newPlayerId is required');
  if (oldPlayerId === newPlayerId) {
    throw new KotcNextError(400, 'Нужно выбрать другого игрока для замены');
  }

  return withTransaction(async (client) => {
    const { tournament } = await hydrateTournamentTx(client, normalizedTournamentId, { forUpdate: true });
    ensureKotcNextTournament(tournament, await listRosterTx(client, normalizedTournamentId), { allowFinished: true });
    if (String(tournament.status || '').trim().toLowerCase() === 'cancelled') {
      throw new KotcNextError(409, 'Нельзя менять состав в отменённом турнире');
    }

    const oldPlayerRes = await client.query(
      `
        SELECT tp.player_id, tp.position, COALESCE(tp.is_waitlist, false) AS is_waitlist, p.name, p.gender
        FROM tournament_participants tp
        JOIN players p ON p.id = tp.player_id
        WHERE tp.tournament_id = $1
          AND tp.player_id = $2
        LIMIT 1
        FOR UPDATE OF tp
      `,
      [normalizedTournamentId, oldPlayerId],
    );
    const oldPlayerRow = oldPlayerRes.rows[0];
    if (!oldPlayerRow) {
      throw new KotcNextError(404, 'Игрок для замены не найден в составе турнира');
    }
    if (Boolean(oldPlayerRow.is_waitlist)) {
      throw new KotcNextError(409, 'Через KOTC Next можно заменять только игрока основного состава');
    }

    const newPlayerRes = await client.query(`SELECT id, name, gender FROM players WHERE id = $1 LIMIT 1`, [newPlayerId]);
    const newPlayerRow = newPlayerRes.rows[0];
    if (!newPlayerRow) {
      throw new KotcNextError(404, 'Новый игрок не найден');
    }

    const oldGender = normalizeGender(oldPlayerRow.gender);
    const newGender = normalizeGender(newPlayerRow.gender);
    if (oldGender !== newGender) {
      throw new KotcNextError(409, 'Замена возможна только на игрока того же пола');
    }

    const duplicateRes = await client.query(
      `
        SELECT 1
        FROM tournament_participants
        WHERE tournament_id = $1
          AND player_id = $2
        LIMIT 1
      `,
      [normalizedTournamentId, newPlayerId],
    );
    if (duplicateRes.rows[0]) {
      throw new KotcNextError(409, 'Этот игрок уже есть в составе турнира');
    }

    await client.query(
      `
        UPDATE tournament_participants
        SET player_id = $3
        WHERE tournament_id = $1
          AND player_id = $2
      `,
      [normalizedTournamentId, oldPlayerId, newPlayerId],
    );

    const primaryUpdate = await client.query(
      `
        UPDATE kotcn_pair kp
        SET player_primary_id = $3
        FROM kotcn_court kc
        JOIN kotcn_round kr ON kr.id = kc.round_id
        WHERE kp.court_id = kc.id
          AND kr.tournament_id = $1
          AND kp.player_primary_id = $2
      `,
      [normalizedTournamentId, oldPlayerId, newPlayerId],
    );
    const secondaryUpdate = await client.query(
      `
        UPDATE kotcn_pair kp
        SET player_secondary_id = $3
        FROM kotcn_court kc
        JOIN kotcn_round kr ON kr.id = kc.round_id
        WHERE kp.court_id = kc.id
          AND kr.tournament_id = $1
          AND kp.player_secondary_id = $2
      `,
      [normalizedTournamentId, oldPlayerId, newPlayerId],
    );
    const roundStatsUpdate = await client.query(
      `
        UPDATE kotcn_player_round_stat stats
        SET player_id = $3
        FROM kotcn_round round
        WHERE stats.round_id = round.id
          AND round.tournament_id = $1
          AND stats.player_id = $2
      `,
      [normalizedTournamentId, oldPlayerId, newPlayerId],
    );
    const resultsUpdate = await client.query(
      `
        UPDATE tournament_results
        SET player_id = $3
        WHERE tournament_id = $1
          AND player_id = $2
      `,
      [normalizedTournamentId, oldPlayerId, newPlayerId],
    );

    const nextRoster = await listRosterTx(client, normalizedTournamentId);
    const hasMaterializedRows =
      Number(primaryUpdate.rowCount || 0) + Number(secondaryUpdate.rowCount || 0) + Number(roundStatsUpdate.rowCount || 0) > 0;
    if (tournament.kotcJudgeBootstrapSig || hasMaterializedRows) {
      const nextSignature = buildStructuralSignature(tournament, nextRoster);
      await client.query(
        `
          UPDATE tournaments
          SET kotc_judge_bootstrap_sig = $2,
              settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{kotcJudgeBootstrapSignature}', to_jsonb($2::text), true)
          WHERE id = $1
        `,
        [normalizedTournamentId, nextSignature],
      );
    }

    return {
      tournamentId: normalizedTournamentId,
      oldPlayerId,
      oldPlayerName: String(oldPlayerRow.name || ''),
      oldGender,
      newPlayerId,
      newPlayerName: String(newPlayerRow.name || ''),
      newGender,
      pairsTouched: Number(primaryUpdate.rowCount || 0) + Number(secondaryUpdate.rowCount || 0),
      roundStatsTouched: Number(roundStatsUpdate.rowCount || 0),
      resultsTouched: Number(resultsUpdate.rowCount || 0),
    };
  });
}

async function resetKotcNextStateTx(
  client: PoolClient,
  tournamentId: string,
): Promise<{
  tournamentId: string;
  removedRoundCount: number;
  removedCourtCount: number;
  removedPairCount: number;
  removedRaundCount: number;
  removedGameCount: number;
  removedRaundStatCount: number;
  removedPlayerRoundStatCount: number;
  removedTournamentResultCount: number;
  clearedSignature: boolean;
  clearedSpectatorSnapshot: boolean;
}> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  const tournament = await loadTournamentTx(client, normalizedId, { forUpdate: true });
  const playerRoundStatsResult = await client.query(
    `
      DELETE FROM kotcn_player_round_stat stats
      USING kotcn_round rounds
      WHERE stats.round_id = rounds.id
        AND rounds.tournament_id = $1
    `,
    [normalizedId],
  );
  const gamesResult = await client.query(
    `
      DELETE FROM kotcn_game games
      USING kotcn_raund raunds, kotcn_court courts, kotcn_round rounds
      WHERE games.raund_id = raunds.id
        AND raunds.court_id = courts.id
        AND courts.round_id = rounds.id
        AND rounds.tournament_id = $1
    `,
    [normalizedId],
  );
  const raundStatsResult = await client.query(
    `
      DELETE FROM kotcn_raund_stat stats
      USING kotcn_raund raunds, kotcn_court courts, kotcn_round rounds
      WHERE stats.raund_id = raunds.id
        AND raunds.court_id = courts.id
        AND courts.round_id = rounds.id
        AND rounds.tournament_id = $1
    `,
    [normalizedId],
  );
  const raundsResult = await client.query(
    `
      DELETE FROM kotcn_raund raunds
      USING kotcn_court courts, kotcn_round rounds
      WHERE raunds.court_id = courts.id
        AND courts.round_id = rounds.id
        AND rounds.tournament_id = $1
    `,
    [normalizedId],
  );
  const pairsResult = await client.query(
    `
      DELETE FROM kotcn_pair pairs
      USING kotcn_court courts, kotcn_round rounds
      WHERE pairs.court_id = courts.id
        AND courts.round_id = rounds.id
        AND rounds.tournament_id = $1
    `,
    [normalizedId],
  );
  const courtsResult = await client.query(
    `
      DELETE FROM kotcn_court courts
      USING kotcn_round rounds
      WHERE courts.round_id = rounds.id
        AND rounds.tournament_id = $1
    `,
    [normalizedId],
  );
  const roundsResult = await client.query(`DELETE FROM kotcn_round WHERE tournament_id = $1`, [normalizedId]);
  const tournamentResultsResult = await client.query(`DELETE FROM tournament_results WHERE tournament_id = $1`, [
    normalizedId,
  ]);
  const columns = await getTournamentTableColumnsTx(client);
  let hadSpectatorSnapshot = false;
  if (columns.has('kotc_spectator_snapshot')) {
    const snapshotResult = await client.query(
      `SELECT kotc_spectator_snapshot IS NOT NULL AS has_snapshot FROM tournaments WHERE id = $1 LIMIT 1`,
      [normalizedId],
    );
    hadSpectatorSnapshot = Boolean(snapshotResult.rows[0]?.has_snapshot);
  }

  const settings = {
    ...tournament.settings,
    kotcJudgeBootstrapSignature: null,
    kotcJudgeBootstrapSig: null,
  };
  await client.query(
    `
      UPDATE tournaments
      SET settings = $2::jsonb,
          kotc_judge_bootstrap_sig = NULL
          ${columns.has('kotc_spectator_snapshot') ? ', kotc_spectator_snapshot = NULL' : ''}
      WHERE id = $1
    `,
    [normalizedId, JSON.stringify(settings)],
  );

  return {
    tournamentId: normalizedId,
    removedRoundCount: roundsResult.rowCount ?? 0,
    removedCourtCount: courtsResult.rowCount ?? 0,
    removedPairCount: pairsResult.rowCount ?? 0,
    removedRaundCount: raundsResult.rowCount ?? 0,
    removedGameCount: gamesResult.rowCount ?? 0,
    removedRaundStatCount: raundStatsResult.rowCount ?? 0,
    removedPlayerRoundStatCount: playerRoundStatsResult.rowCount ?? 0,
    removedTournamentResultCount: tournamentResultsResult.rowCount ?? 0,
    clearedSignature: normalizeKotcJudgeBootstrapSignature(
      tournament.settings.kotcJudgeBootstrapSignature ?? tournament.settings.kotcJudgeBootstrapSig,
    ) != null || tournament.kotcJudgeBootstrapSig != null,
    clearedSpectatorSnapshot: hadSpectatorSnapshot,
  };
}

async function syncKotcNextResultsToTournamentResults(tournamentId: string): Promise<number> {
  const isDemoTournament = await withClient(async (client) => {
    const tournament = await loadTournamentTx(client, tournamentId);
    return isKotcNextDemoTournament({ format: tournament.format, settings: tournament.settings });
  });
  if (isDemoTournament) {
    return 0;
  }

  const state = await getKotcNextOperatorStateSummary(tournamentId);
  if (!state || state.stage !== 'r2_finished' || !state.finalResults?.length) {
    return 0;
  }

  const playerResults: Array<{
    playerName: string;
    gender: 'M' | 'W';
    placement: number;
    points: number;
    ratingPts: number;
    ratingPool: 'pro';
  }> = (state.finalIndividualResults ?? []).map((row) => ({
    playerName: row.playerName,
    gender: row.gender === 'W' ? 'W' : 'M',
    placement: row.finalPosition,
    points: row.r2?.kingWins ?? 0,
    ratingPts: ratingPointsForLevelPlace(
      row.finalPosition,
      normalizeTournamentRatingLevelFromZone(row.finalZone),
      'pro',
    ),
    ratingPool: 'pro' as const,
  }));

  return upsertTournamentResults(tournamentId, playerResults);
}

async function closeKotcNextTournament(tournamentId: string): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  const state = await getKotcNextOperatorStateSummary(normalizedId);
  if (!state) {
    throw new KotcNextError(409, 'KOTC Next state is not initialized');
  }
  if (state.stage !== 'r2_finished' || !state.finalResults?.length) {
    throw new KotcNextError(409, 'Finish R2 before closing the tournament');
  }

  await syncKotcNextResultsToTournamentResults(normalizedId);
  const updatedTournament = await applyTournamentStatusOverride({
    tournamentId: normalizedId,
    status: 'finished',
  });
  if (!updatedTournament) {
    throw new KotcNextError(404, 'Tournament not found');
  }
  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(normalizedId).catch(() => {});
  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

async function finalizeRoundIfReadyTx(
  client: PoolClient,
  tournament: TournamentRow,
  round: RoundRow,
): Promise<{ roundFinished: boolean; shouldPublishResults: boolean }> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  if (!courts.length) return { roundFinished: false, shouldPublishResults: false };

  for (const court of courts) {
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    if (!raunds.length || raunds.some((raund) => raund.status !== 'finished')) {
      return { roundFinished: false, shouldPublishResults: false };
    }
  }

  await client.query(`UPDATE kotcn_round SET status = 'finished' WHERE id = $1`, [round.roundId]);
  await persistPlayerRoundStatsTx(
    client,
    round,
    await loadAggregatePairRowsTx(client, round, tournament.params.takeoversMode),
    tournament.params.takeoversMode,
    tournament.params.r2SeedingMode,
  );
  return { roundFinished: true, shouldPublishResults: round.roundNo === 2 };
}

async function persistFinishedRoundPlayerStatsTx(
  client: PoolClient,
  round: RoundRow,
  tournament: TournamentRow,
): Promise<void> {
  if (round.status !== 'finished') return;
  await persistPlayerRoundStatsTx(
    client,
    round,
    await loadAggregatePairRowsTx(client, round, tournament.params.takeoversMode),
    tournament.params.takeoversMode,
    tournament.params.r2SeedingMode,
  );
}

async function bootstrapRoundTx(
  client: PoolClient,
  tournament: TournamentRow,
  roundNo: 1 | 2,
  input: {
    seed: number;
    labelByCourt: (courtNo: number) => string;
    pairSources: Array<{
      courtNo: number;
      pairs: Array<{
        primaryPlayerId: string | null;
        primaryPlayerName: string;
        secondaryPlayerId: string | null;
        secondaryPlayerName: string;
        primaryGender: 'M' | 'W' | null;
        secondaryGender: 'M' | 'W' | null;
      }>;
    }>;
  },
): Promise<void> {
  const roundRes = await client.query(
    `
      INSERT INTO kotcn_round (tournament_id, round_no, status, seed)
      VALUES ($1, $2, 'live', $3)
      RETURNING id
    `,
    [tournament.id, roundNo, input.seed],
  );
  const roundId = String(roundRes.rows[0].id);
  const roundType = roundTypeFromNo(roundNo);

  for (const courtSource of input.pairSources) {
    const courtRes = await client.query(
      `
        INSERT INTO kotcn_court (round_id, court_no, label, pin_code, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id
      `,
      [roundId, courtSource.courtNo, input.labelByCourt(courtSource.courtNo), buildKotcNextCourtPin(tournament.id, roundType, courtSource.courtNo)],
    );
    const courtId = String(courtRes.rows[0].id);

    for (const [pairIdx, pair] of courtSource.pairs.entries()) {
      await client.query(
        `
          INSERT INTO kotcn_pair (court_id, pair_idx, player_primary_id, player_secondary_id)
          VALUES ($1, $2, $3, $4)
        `,
        [courtId, pairIdx, pair.primaryPlayerId, pair.secondaryPlayerId],
      );
    }

    for (let raundNo = 1; raundNo <= tournament.params.raundCount; raundNo += 1) {
      const initialState = getInitialKotcNextCourtState(
        courtSource.pairs.length,
        raundNo,
        buildCourtSeed(input.seed, courtSource.courtNo),
        tournament.params.raundTimerMinutes,
        null,
      );
      const raundRes = await client.query(
        `
          INSERT INTO kotcn_raund (
            court_id, raund_no, timer_minutes, status, king_pair_idx, challenger_pair_idx, queue_order
          )
          VALUES ($1, $2, $3, 'pending', $4, $5, $6)
          RETURNING id
        `,
        [courtId, raundNo, tournament.params.raundTimerMinutes, initialState.kingPairIdx, initialState.challengerPairIdx, initialState.queueOrder],
      );
      await ensureBlankRaundStatsTx(client, String(raundRes.rows[0].id), courtSource.pairs.length);
    }
  }
}

function toPairSource(primary: RosterPlayer, secondary: RosterPlayer): PairSourcePlayer {
  return {
    primaryPlayerId: primary.playerId,
    primaryPlayerName: primary.playerName,
    secondaryPlayerId: secondary.playerId,
    secondaryPlayerName: secondary.playerName,
    primaryGender: primary.gender,
    secondaryGender: secondary.gender,
  };
}

function buildSequentialR1PairSources(
  roster: RosterPlayer[],
  params: Pick<KotcNextJudgeParams, 'courts' | 'ppc'>,
): R1PairSource[] {
  const playersPerCourt = params.ppc * 2;
  return Array.from({ length: params.courts }, (_, courtIdx) => {
    const courtPlayers = roster.slice(courtIdx * playersPerCourt, courtIdx * playersPerCourt + playersPerCourt);
    const pairs = Array.from({ length: params.ppc }, (_, pairIdx) => {
      const primary = courtPlayers[pairIdx * 2];
      const secondary = courtPlayers[pairIdx * 2 + 1];
      if (!primary || !secondary) {
        throw new KotcNextError(422, 'Roster does not match KOTC Next pair capacity');
      }
      return toPairSource(primary, secondary);
    });
    return { courtNo: courtIdx + 1, pairs };
  });
}

function buildMixedR1PairSources(
  roster: RosterPlayer[],
  params: Pick<KotcNextJudgeParams, 'courts' | 'ppc'>,
): R1PairSource[] {
  const men = roster.filter((player) => player.gender === 'M');
  const women = roster.filter((player) => player.gender === 'W');
  const expectedPerGender = params.courts * params.ppc;

  if (men.length !== expectedPerGender || women.length !== expectedPerGender) {
    throw new KotcNextError(
      422,
      `Mixed KOTC requires ${expectedPerGender} men and ${expectedPerGender} women, received ${men.length} men and ${women.length} women`,
    );
  }

  return Array.from({ length: params.courts }, (_, courtIdx) => {
    const pairs = Array.from({ length: params.ppc }, (_, pairIdx) => {
      const rosterIdx = courtIdx * params.ppc + pairIdx;
      const primary = men[rosterIdx];
      const secondary = women[rosterIdx];
      if (!primary || !secondary) {
        throw new KotcNextError(422, 'Roster does not match KOTC Next pair capacity');
      }
      return toPairSource(primary, secondary);
    });
    return { courtNo: courtIdx + 1, pairs };
  });
}

export function buildKotcNextR1PairSources(
  roster: RosterPlayer[],
  options: Pick<KotcNextJudgeParams, 'courts' | 'ppc' | 'variant'>,
): R1PairSource[] {
  if (options.variant === 'MF') {
    return buildMixedR1PairSources(roster, options);
  }
  return buildSequentialR1PairSources(roster, options);
}

function buildR1Pairs(roster: RosterPlayer[], tournament: TournamentRow): R1PairSource[] {
  return buildKotcNextR1PairSources(roster, tournament.params);
}

function normalizeSeedDraftInput(input: unknown, draft: KotcNextR2SeedZone[]): KotcNextR2SeedZone[] {
  if (!Array.isArray(input) || !input.length) return draft;

  const refByKey = new Map<string, KotcNextR2SeedZone['pairRefs'][number]>(
    draft.flatMap((zone) =>
      zone.pairRefs.map((ref) => [`${ref.courtNo}:${ref.pairIdx}`, ref] as const),
    ),
  );
  const expectedZoneSizes = new Map(draft.map((zone) => [zone.zone, zone.pairRefs.length] as const));

  const normalized: KotcNextR2SeedZone[] = input.map((zoneInput) => {
    if (!zoneInput || typeof zoneInput !== 'object' || Array.isArray(zoneInput)) {
      throw new KotcNextError(400, 'Invalid R2 seed payload');
    }
    const zone = normalizeZoneKey((zoneInput as { zone?: unknown }).zone);
    const refs = Array.isArray((zoneInput as { pairRefs?: unknown }).pairRefs)
      ? (zoneInput as { pairRefs: Array<Record<string, unknown>> }).pairRefs
      : [];
    return {
      zone,
      pairRefs: refs.map((ref) => {
        const key = `${asInt(ref.courtNo, 0)}:${asInt(ref.pairIdx, -1)}`;
        const draftRef = refByKey.get(key);
        if (!draftRef) {
          throw new KotcNextError(409, 'R2 seed payload no longer matches the draft');
        }
        return draftRef;
      }),
    };
  });

  const zoneKeys = normalized.map((zone) => zone.zone);
  if (new Set(zoneKeys).size !== zoneKeys.length || zoneKeys.length !== expectedZoneSizes.size) {
    throw new KotcNextError(409, 'R2 seed must contain every zone exactly once');
  }
  for (const zone of normalized) {
    if (zone.pairRefs.length !== expectedZoneSizes.get(zone.zone)) {
      throw new KotcNextError(409, `R2 zone ${zoneLabel(zone.zone)} has invalid capacity`);
    }
  }

  const normalizedKeys = normalized.flatMap((zone) => zone.pairRefs.map((ref) => `${ref.courtNo}:${ref.pairIdx}`)).sort();
  const draftKeys = draft.flatMap((zone) => zone.pairRefs.map((ref) => `${ref.courtNo}:${ref.pairIdx}`)).sort();
  if (normalizedKeys.join('|') !== draftKeys.join('|')) {
    throw new KotcNextError(409, 'R2 seed payload no longer matches the draft');
  }
  return normalized;
}

async function loadActionTargetTx(client: PoolClient, pin: string, raundNo: number): Promise<ActionTarget> {
  const { tournament, round, court } = await loadCourtByPinTx(client, pin, { forUpdate: true });
  const raund = await loadRaundByCourtAndNoTx(client, court.courtId, raundNo, { forUpdate: true });
  if (!raund) {
    throw new KotcNextError(404, 'Raund not found');
  }
  const roster = await listRosterTx(client, tournament.id);
  ensureKotcNextTournament(tournament, roster);
  return {
    tournament,
    round,
    court,
    raund,
    pairs: await listPairsByCourtTx(client, court.courtId),
    stats: await listRaundStatsTx(client, raund.raundId),
    events: await listGameEventsTx(client, raund.raundId),
  };
}

async function loadActionTargetByTournamentCourtTx(
  client: PoolClient,
  tournamentId: string,
  roundNo: number,
  courtNo: number,
  raundNo: number,
): Promise<ActionTarget> {
  const normalizedTournamentId = String(tournamentId || '').trim();
  const normalizedRoundNo = Math.trunc(Number(roundNo));
  const normalizedCourtNo = Math.trunc(Number(courtNo));
  const normalizedRaundNo = Math.trunc(Number(raundNo));
  if (!normalizedTournamentId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }
  if (!Number.isInteger(normalizedRoundNo) || (normalizedRoundNo !== 1 && normalizedRoundNo !== 2)) {
    throw new KotcNextError(400, 'roundNo is required');
  }
  if (!Number.isInteger(normalizedCourtNo) || normalizedCourtNo < 1) {
    throw new KotcNextError(400, 'courtNo is required');
  }
  if (!Number.isInteger(normalizedRaundNo) || normalizedRaundNo < 1) {
    throw new KotcNextError(400, 'raundNo is required');
  }

  const { tournament, roster } = await hydrateTournamentTx(client, normalizedTournamentId, { forUpdate: true });
  ensureKotcNextTournament(tournament, roster, { allowFinished: true });
  const round = await loadRoundByNoTx(client, normalizedTournamentId, normalizedRoundNo, { forUpdate: true });
  if (!round) {
    throw new KotcNextError(404, 'Round not found');
  }
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const court = courts.find((row) => row.courtNo === normalizedCourtNo) ?? null;
  if (!court) {
    throw new KotcNextError(404, 'Court not found');
  }
  const raund = await loadRaundByCourtAndNoTx(client, court.courtId, normalizedRaundNo, { forUpdate: true });
  if (!raund) {
    throw new KotcNextError(404, 'Raund not found');
  }
  return {
    tournament,
    round,
    court,
    raund,
    pairs: await listPairsByCourtTx(client, court.courtId),
    stats: await listRaundStatsTx(client, raund.raundId),
    events: await listGameEventsTx(client, raund.raundId),
  };
}

async function setCourtStatusTx(client: PoolClient, courtId: string, status: KotcNextCourtStatus): Promise<void> {
  await client.query(`UPDATE kotcn_court SET status = $2 WHERE id = $1`, [courtId, status]);
}

function assertRaundCountdownComplete(raund: RaundRow): void {
  if (!raund.startedAt) {
    throw new KotcNextError(409, 'Raund is not running');
  }
  const startedAtMs = new Date(raund.startedAt).getTime();
  if (Number.isFinite(startedAtMs) && startedAtMs > Date.now()) {
    throw new KotcNextError(409, 'Raund start countdown is still running');
  }
}

async function assertPreviousRaundsFinishedAcrossRoundTx(
  client: PoolClient,
  roundId: string,
  raundNo: number,
): Promise<void> {
  const blocking = await client.query(
    `
      SELECT kc.label, kr.raund_no
      FROM kotcn_raund kr
      JOIN kotcn_court kc ON kc.id = kr.court_id
      WHERE kc.round_id = $1
        AND kr.raund_no < $2
        AND kr.status <> 'finished'
      ORDER BY kr.raund_no ASC, kc.court_no ASC
      LIMIT 1
    `,
    [roundId, raundNo],
  );
  const row = blocking.rows[0];
  if (row) {
    throw new KotcNextError(409, `Finish raund ${asInt(row.raund_no, 1)} on all courts before starting the next one`);
  }
}

async function refreshCourtStatusesForRoundTx(client: PoolClient, roundId: string): Promise<void> {
  const courts = await listCourtsByRoundTx(client, roundId);
  for (const court of courts) {
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const hasLive = raunds.some((row) => row.status === 'running' || row.status === 'paused');
    const hasPending = raunds.some((row) => row.status !== 'finished');
    await setCourtStatusTx(client, court.courtId, hasLive ? 'live' : hasPending ? 'pending' : 'finished');
  }
}

async function ensureRaundStartedAcrossRoundTx(client: PoolClient, target: ActionTarget, raundNo: number): Promise<void> {
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (target.raund.status === 'paused') {
    throw new KotcNextError(409, 'Raund is paused; resume it from the control center');
  }
  await assertPreviousRaundsFinishedAcrossRoundTx(client, target.round.roundId, raundNo);

  const raunds = await listRaundsByRoundAndNoTx(client, target.round.roundId, raundNo, { forUpdate: true });
  const startedAt =
    raunds.find((row) => row.status === 'running' && row.startedAt)?.startedAt ??
    target.raund.startedAt ??
    new Date(Date.now() + KOTC_NEXT_START_COUNTDOWN_SECONDS * 1000).toISOString();
  const courts = await listCourtsByRoundTx(client, target.round.roundId);
  const courtsById = new Map(courts.map((court) => [court.courtId, court]));
  for (const raund of raunds) {
    const court = courtsById.get(raund.courtId);
    if (!court) continue;
    await repairPendingInitialRaundOrderTx(
      client,
      target.tournament,
      target.round,
      court,
      raund,
      await listRaundStatsTx(client, raund.raundId),
      await listGameEventsTx(client, raund.raundId),
    );
  }
  const runnableIds = raunds.filter((row) => row.status !== 'finished').map((row) => row.raundId);
  if (runnableIds.length) {
    await client.query(
      `
        UPDATE kotcn_raund
        SET status = 'running',
            started_at = COALESCE(started_at, $2),
            finished_at = NULL,
            paused_at = NULL,
            paused_phase = NULL,
            status_changed_at = now(),
            last_controlled_by = COALESCE(last_controlled_by, 'judge'),
            revision = revision + 1
        WHERE id = ANY($1::uuid[])
      `,
      [runnableIds, new Date(startedAt)],
    );
  }
  await refreshCourtStatusesForRoundTx(client, target.round.roundId);
}

async function startRaundTx(client: PoolClient, pin: string, raundNo: number): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const revisionBefore = await getControlRevisionTx(client, target.tournament.id);
  await ensureRaundStartedAcrossRoundTx(client, target, raundNo);
  const revisionAfter = revisionBefore + 1;
  await appendControlEventTx(client, {
    tournamentId: target.tournament.id,
    roundId: target.round.roundId,
    courtId: target.court.courtId,
    raundId: target.raund.raundId,
    roundNo: target.round.roundNo,
    courtNo: target.court.courtNo,
    raundNo,
    commandId: `judge-start:${target.raund.raundId}:${revisionAfter}`,
    eventType: 'start_raund',
    actor: { kind: 'judge', id: pin },
    revisionBefore,
    revisionAfter,
  });

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function recordEventTx(
  client: PoolClient,
  pin: string,
  raundNo: number,
  eventType: 'king_point' | 'takeover',
): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const revisionBefore = await getControlRevisionTx(client, target.tournament.id);
  if (target.tournament.params.takeoversMode === 'no_takeovers') {
    throw new KotcNextError(409, 'Use pair-point action for no-takeovers KOTC');
  }
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (target.raund.status !== 'running' || !target.raund.startedAt) {
    throw new KotcNextError(409, 'Raund is not running');
  }
  assertRaundCountdownComplete(target.raund);

  const currentState = buildLiveState(target.pairs, target.raund, target.stats);
  const nextState = eventType === 'takeover' ? applyTakeover(currentState) : applyKingPoint(currentState);
  const nextSeqNo = await nextGameSeqNoTx(client, target.raund.raundId);

  const inserted = await client.query(
    `
      INSERT INTO kotcn_game (raund_id, seq_no, event_type, king_pair_idx, challenger_pair_idx)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [target.raund.raundId, nextSeqNo, eventType, currentState.kingPairIdx, currentState.challengerPairIdx],
  );
  await writeRaundStateTx(client, target.raund.raundId, nextState);
  await setCourtStatusTx(client, target.court.courtId, 'live');
  const revisionAfter = revisionBefore + 1;
  await appendControlEventTx(client, {
    tournamentId: target.tournament.id,
    roundId: target.round.roundId,
    courtId: target.court.courtId,
    raundId: target.raund.raundId,
    roundNo: target.round.roundNo,
    courtNo: target.court.courtNo,
    raundNo,
    commandId: `judge-score:${target.raund.raundId}:${nextSeqNo}`,
    eventType,
    actor: { kind: 'judge', id: pin },
    payload: { legacyGameId: String(inserted.rows[0]?.id || ''), seqNo: nextSeqNo },
    revisionBefore,
    revisionAfter,
  });

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function recordPairPointTx(
  client: PoolClient,
  pin: string,
  raundNo: number,
  pairIdx: number,
): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const revisionBefore = await getControlRevisionTx(client, target.tournament.id);
  if (target.tournament.params.takeoversMode !== 'no_takeovers') {
    throw new KotcNextError(409, 'Pair-point action is only available for no-takeovers KOTC');
  }
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (target.raund.status !== 'running' || !target.raund.startedAt) {
    throw new KotcNextError(409, 'Raund is not running');
  }
  assertRaundCountdownComplete(target.raund);

  const normalizedPairIdx = Math.trunc(Number(pairIdx));
  if (!Number.isInteger(normalizedPairIdx) || !target.pairs.some((pair) => pair.pairIdx === normalizedPairIdx)) {
    throw new KotcNextError(400, 'pairIdx is invalid');
  }

  const currentState = buildLiveState(target.pairs, target.raund, target.stats);
  const nextState = applyNoTakeoversPairPoint(currentState, normalizedPairIdx);
  const nextSeqNo = await nextGameSeqNoTx(client, target.raund.raundId);

  const inserted = await client.query(
    `
      INSERT INTO kotcn_game (raund_id, seq_no, event_type, king_pair_idx, challenger_pair_idx)
      VALUES ($1, $2, 'king_point', $3, $4)
      RETURNING id
    `,
    [target.raund.raundId, nextSeqNo, normalizedPairIdx, currentState.challengerPairIdx],
  );
  await writeRaundStateTx(client, target.raund.raundId, nextState);
  await setCourtStatusTx(client, target.court.courtId, 'live');
  const revisionAfter = revisionBefore + 1;
  await appendControlEventTx(client, {
    tournamentId: target.tournament.id,
    roundId: target.round.roundId,
    courtId: target.court.courtId,
    raundId: target.raund.raundId,
    roundNo: target.round.roundNo,
    courtNo: target.court.courtNo,
    raundNo,
    commandId: `judge-pair-point:${target.raund.raundId}:${nextSeqNo}`,
    eventType: 'pair_point',
    actor: { kind: 'judge', id: pin },
    payload: { legacyGameId: String(inserted.rows[0]?.id || ''), seqNo: nextSeqNo, pairIdx: normalizedPairIdx },
    revisionBefore,
    revisionAfter,
  });

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function manualPairSwitchTx(
  client: PoolClient,
  pin: string,
  raundNo: number,
  slot: 'king' | 'challenger',
  direction: 'prev' | 'next',
): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const revisionBefore = await getControlRevisionTx(client, target.tournament.id);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }

  const currentState = buildLiveState(target.pairs, target.raund, target.stats);
  const nextState = applyManualPairSwitch(currentState, slot, direction);
  await writeRaundStateTx(client, target.raund.raundId, nextState);
  await setCourtStatusTx(client, target.court.courtId, nextState.status === 'running' ? 'live' : 'pending');
  const revisionAfter = revisionBefore + 1;
  await appendControlEventTx(client, {
    tournamentId: target.tournament.id,
    roundId: target.round.roundId,
    courtId: target.court.courtId,
    raundId: target.raund.raundId,
    roundNo: target.round.roundNo,
    courtNo: target.court.courtNo,
    raundNo,
    commandId: `judge-pair-switch:${target.raund.raundId}:${revisionAfter}`,
    eventType: 'manual_pair_switch',
    actor: { kind: 'judge', id: pin },
    payload: { slot, direction },
    beforeState: currentState,
    afterState: nextState,
    revisionBefore,
    revisionAfter,
  });

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function resetRaundTx(client: PoolClient, pin: string, raundNo: number): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Finished raund cannot be reset from the judge screen');
  }

  await client.query(`DELETE FROM kotcn_game WHERE raund_id = $1`, [target.raund.raundId]);
  const state = buildInitialState(target.tournament, target.round, target.court, raundNo, null);
  await writeRaundStateTx(client, target.raund.raundId, state);
  await setCourtStatusTx(client, target.court.courtId, 'pending');

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function undoLastEventTx(client: PoolClient, pin: string, raundNo: number): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const revisionBefore = await getControlRevisionTx(client, target.tournament.id);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  const lastEvent = target.events[target.events.length - 1];
  if (!lastEvent) {
    throw new KotcNextError(400, 'There are no game events to undo');
  }

  await client.query(
    `UPDATE kotcn_game SET reverted_at = now(), reverted_reason = 'judge_undo' WHERE id = $1 AND reverted_at IS NULL`,
    [lastEvent.id],
  );
  const nextState = await recomputeRaundFromEventsTx(client, target.tournament, target.round, target.court, target.raund, target.pairs, target.events.slice(0, -1));
  const revisionAfter = revisionBefore + 1;
  await appendControlEventTx(client, {
    tournamentId: target.tournament.id,
    roundId: target.round.roundId,
    courtId: target.court.courtId,
    raundId: target.raund.raundId,
    roundNo: target.round.roundNo,
    courtNo: target.court.courtNo,
    raundNo,
    commandId: `judge-undo:${target.raund.raundId}:${revisionAfter}`,
    eventType: 'undo',
    actor: { kind: 'judge', id: pin },
    payload: { legacyGameId: lastEvent.id, seqNo: lastEvent.seqNo },
    beforeState: buildLiveState(target.pairs, target.raund, target.stats, target.events),
    afterState: nextState,
    revisionBefore,
    revisionAfter,
  });

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

function remainingRaundMs(raund: RaundRow, now = Date.now()): number {
  return getKotcNextTimerSnapshot({
    status: raund.status,
    startedAt: raund.startedAt,
    pausedAt: raund.pausedAt,
    timerMinutes: raund.timerMinutes,
    now,
  }).remainingMs;
}

function hasRaundTimerEnded(raund: RaundRow): boolean {
  return remainingRaundMs(raund) === 0;
}

function assertFinishAllowedByTimer(raund: RaundRow): void {
  if (hasRaundTimerEnded(raund)) return;
  throw new KotcNextError(403, 'Finish before timer end is available only in the admin control center');
}

async function finishRaundTx(
  client: PoolClient,
  pin: string,
  raundNo: number,
  _password?: string,
): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const revisionBefore = await getControlRevisionTx(client, target.tournament.id);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (!target.raund.startedAt) {
    throw new KotcNextError(409, 'Raund has not been started');
  }
  assertFinishAllowedByTimer(target.raund);

  await client.query(
    `
      UPDATE kotcn_raund
      SET status = 'finished',
          finished_at = now(),
          paused_at = NULL,
          paused_phase = NULL,
          status_changed_at = now(),
          last_controlled_by = 'judge',
          revision = revision + 1
      WHERE id IN (
        SELECT kr.id
        FROM kotcn_raund kr
        JOIN kotcn_court kc ON kc.id = kr.court_id
        WHERE kc.round_id = $1
          AND kr.raund_no = $2
          AND kr.status <> 'finished'
      )
    `,
    [target.round.roundId, raundNo],
  );

  await refreshCourtStatusesForRoundTx(client, target.round.roundId);
  const finalization = await finalizeRoundIfReadyTx(client, target.tournament, target.round);
  const revisionAfter = revisionBefore + 1;
  await appendControlEventTx(client, {
    tournamentId: target.tournament.id,
    roundId: target.round.roundId,
    courtId: target.court.courtId,
    raundId: target.raund.raundId,
    roundNo: target.round.roundNo,
    courtNo: target.court.courtNo,
    raundNo,
    commandId: `judge-finish:${target.round.roundId}:${raundNo}:${revisionAfter}`,
    eventType: 'finish_raund',
    actor: { kind: 'judge', id: pin },
    revisionBefore,
    revisionAfter,
  });

  return {
    tournamentId: target.tournament.id,
    pin,
    publishResults: finalization.shouldPublishResults,
  };
}

async function forceFinishRaundByCourtTx(
  client: PoolClient,
  tournamentId: string,
  roundNo: number,
  courtNo: number,
  raundNo: number,
): Promise<{ tournamentId: string; publishResults: boolean }> {
  const target = await loadActionTargetByTournamentCourtTx(client, tournamentId, roundNo, courtNo, raundNo);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (!target.raund.startedAt || target.raund.status !== 'running') {
    await assertPreviousRaundsFinishedAcrossRoundTx(client, target.round.roundId, raundNo);
    await repairPendingInitialRaundOrderTx(
      client,
      target.tournament,
      target.round,
      target.court,
      target.raund,
      target.stats,
      target.events,
    );
    await client.query(
      `
        UPDATE kotcn_raund
        SET status = 'running',
            started_at = COALESCE(started_at, $2),
            finished_at = NULL,
            paused_at = NULL,
            paused_phase = NULL,
            status_changed_at = now(),
            last_controlled_by = 'admin',
            revision = revision + 1
        WHERE id = $1
      `,
      [target.raund.raundId, new Date()],
    );
    await setCourtStatusTx(client, target.court.courtId, 'live');
  }

  await client.query(
    `
      UPDATE kotcn_raund
      SET status = 'finished',
          finished_at = now(),
          paused_at = NULL,
          paused_phase = NULL,
          status_changed_at = now(),
          last_controlled_by = 'admin',
          revision = revision + 1
      WHERE id = $1
    `,
    [target.raund.raundId],
  );

  await refreshCourtStatusesForRoundTx(client, target.round.roundId);
  const finalization = await finalizeRoundIfReadyTx(client, target.tournament, target.round);
  return {
    tournamentId: target.tournament.id,
    publishResults: finalization.shouldPublishResults,
  };
}

export async function bootstrapKotcNextR1(tournamentId: string, options?: { seed?: number }): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  await withTransaction(async (client) => {
    if (await loadRoundByNoTx(client, normalizedId, 1, { forUpdate: true })) {
      throw new KotcNextError(409, 'KOTC Next R1 already exists');
    }
    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster);

    await bootstrapRoundTx(client, tournament, 1, {
      seed: Math.max(1, asInt(options?.seed, 1)),
      labelByCourt: (courtNo) => `K${courtNo}`,
      pairSources: buildR1Pairs(roster, tournament),
    });
    await client.query(`UPDATE tournaments SET kotc_judge_bootstrap_sig = $2 WHERE id = $1`, [
      normalizedId,
      buildStructuralSignature(tournament, roster),
    ]);
  });

  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function getKotcNextR2SeedDraft(tournamentId: string): Promise<KotcNextR2SeedZone[]> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  return withClient(async (client) => {
    const r1 = await loadRoundByNoTx(client, normalizedId, 1);
    if (!r1) throw new KotcNextError(409, 'KOTC Next R1 is not initialized');
    if (r1.status !== 'finished') throw new KotcNextError(409, 'Finish R1 before seeding R2');
    const tournament = await loadTournamentTx(client, normalizedId);
    if (tournament.variant === 'MF') {
      return getKotcNextR2IndividualSeedDraftTx(client, tournament, r1);
    }
    return seedKotcNextR2Courts(
      (await loadAggregatePairRowsTx(client, r1, tournament.params.takeoversMode)).map((row) => ({
        courtNo: row.courtNo,
        pairIdx: row.pairIdx,
        pairLabel: row.pairLabel,
        kingWins: row.kingWins,
        takeovers: row.takeovers,
        gamesPlayed: row.gamesPlayed,
        longestKingRun: row.longestKingRun,
        firstLongestKingRunOrder: row.firstLongestKingRunOrder,
      })),
      tournament.params.takeoversMode,
      tournament.params.r2SeedingMode,
    );
  });
}

export async function getKotcNextR2ManualDraft(tournamentId: string): Promise<KotcNextR2ManualZone[]> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  return withClient(async (client) => {
    const r1 = await loadRoundByNoTx(client, normalizedId, 1);
    if (!r1) throw new KotcNextError(409, 'KOTC Next R1 is not initialized');
    if (r1.status !== 'finished') throw new KotcNextError(409, 'Finish R1 before preparing manual R2');
    const tournament = await loadTournamentTx(client, normalizedId);
    return getKotcNextR2ManualDraftTx(client, tournament, r1);
  });
}

async function adjustRaundStatScoreTx(
  client: PoolClient,
  courtId: string,
  raundNo: number,
  pairIdx: number,
  delta: number,
  roundLabel = 'R1',
): Promise<void> {
  const rows = await client.query(
    `
      SELECT kr.id AS raund_id,
             kr.raund_no,
             COALESCE(krs.king_wins, 0) AS king_wins,
             COALESCE(krs.games_played, 0) AS games_played
      FROM kotcn_raund kr
      LEFT JOIN kotcn_raund_stat krs
        ON krs.raund_id = kr.id
       AND krs.pair_idx = $2
      WHERE kr.court_id = $1
        AND kr.raund_no = $3
      ORDER BY kr.raund_no DESC
      FOR UPDATE OF kr
    `,
    [courtId, pairIdx, raundNo],
  );
  if (!rows.rowCount) {
    throw new KotcNextError(409, `KOTC Next ${roundLabel} raund not found`);
  }

  const total = rows.rows.reduce((sum, row) => sum + asInt(row.king_wins, 0), 0);
  if (total + delta < 0) {
    throw new KotcNextError(409, `${roundLabel} pair score cannot be negative`);
  }

  if (delta > 0) {
    const target = rows.rows[0];
    await client.query(
      `
        INSERT INTO kotcn_raund_stat (raund_id, pair_idx, king_wins, takeovers, games_played)
        VALUES ($1, $2, $3, 0, $3)
        ON CONFLICT (raund_id, pair_idx)
        DO UPDATE SET
          king_wins = kotcn_raund_stat.king_wins + EXCLUDED.king_wins,
          games_played = kotcn_raund_stat.games_played + EXCLUDED.games_played
      `,
      [String(target.raund_id), pairIdx, delta],
    );
    return;
  }

  let remaining = Math.abs(delta);
  for (const row of rows.rows) {
    if (remaining <= 0) break;
    const available = asInt(row.king_wins, 0);
    if (available <= 0) continue;
    const decrement = Math.min(available, remaining);
    await client.query(
      `
        UPDATE kotcn_raund_stat
        SET king_wins = GREATEST(0, king_wins - $3),
            games_played = GREATEST(0, games_played - $3)
        WHERE raund_id = $1
          AND pair_idx = $2
      `,
      [String(row.raund_id), pairIdx, decrement],
    );
    remaining -= decrement;
  }
}

async function resetKotcNextR2Tx(client: PoolClient, tournamentId: string): Promise<void> {
  const r2 = await loadRoundByNoTx(client, tournamentId, 2, { forUpdate: true });
  if (!r2) {
    throw new KotcNextError(409, 'KOTC Next R2 is not initialized');
  }

  await client.query(`DELETE FROM kotcn_round WHERE id = $1`, [r2.roundId]);
  await client.query(`DELETE FROM tournament_results WHERE tournament_id = $1`, [tournamentId]);
}

export async function adjustKotcNextR1PairScore(
  tournamentId: string,
  input: { courtNo: number; raundNo: number; pairIdx: number; delta: number },
): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  const courtNo = Math.trunc(Number(input.courtNo));
  const raundNo = Math.trunc(Number(input.raundNo));
  const pairIdx = Math.trunc(Number(input.pairIdx));
  const delta = Math.trunc(Number(input.delta));
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');
  if (!Number.isInteger(courtNo) || courtNo < 1) throw new KotcNextError(400, 'courtNo is required');
  if (!Number.isInteger(raundNo) || raundNo < 1) throw new KotcNextError(400, 'raundNo is required');
  if (!Number.isInteger(pairIdx) || pairIdx < 0) throw new KotcNextError(400, 'pairIdx is required');
  if (!Number.isInteger(delta) || delta === 0) throw new KotcNextError(400, 'delta is required');
  if (Math.abs(delta) > 50) throw new KotcNextError(400, 'Score adjustment is too large');

  await withTransaction(async (client) => {
    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster, { allowFinished: true });

    const r1 = await loadRoundByNoTx(client, normalizedId, 1, { forUpdate: true });
    if (!r1) throw new KotcNextError(409, 'KOTC Next R1 is not initialized');
    const r2 = await loadRoundByNoTx(client, normalizedId, 2);
    if (r2) throw new KotcNextError(409, 'R1 score adjustment is closed after R2 starts');

    const courts = await listCourtsByRoundTx(client, r1.roundId);
    const court = courts.find((row) => row.courtNo === courtNo) ?? null;
    if (!court) throw new KotcNextError(404, 'KOTC Next court not found');
    const pairs = await listPairsByCourtTx(client, court.courtId);
    if (!pairs.some((row) => row.pairIdx === pairIdx)) {
      throw new KotcNextError(404, 'KOTC Next pair not found');
    }

    await adjustRaundStatScoreTx(client, court.courtId, raundNo, pairIdx, delta, 'R1');
    await persistFinishedRoundPlayerStatsTx(client, r1, tournament);
  });

  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(normalizedId).catch(() => {});
  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function adjustKotcNextR2PairScore(
  tournamentId: string,
  input: { courtNo: number; raundNo: number; pairIdx: number; delta: number },
): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  const courtNo = Math.trunc(Number(input.courtNo));
  const raundNo = Math.trunc(Number(input.raundNo));
  const pairIdx = Math.trunc(Number(input.pairIdx));
  const delta = Math.trunc(Number(input.delta));
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');
  if (!Number.isInteger(courtNo) || courtNo < 1) throw new KotcNextError(400, 'courtNo is required');
  if (!Number.isInteger(raundNo) || raundNo < 1) throw new KotcNextError(400, 'raundNo is required');
  if (!Number.isInteger(pairIdx) || pairIdx < 0) throw new KotcNextError(400, 'pairIdx is required');
  if (!Number.isInteger(delta) || delta === 0) throw new KotcNextError(400, 'delta is required');
  if (Math.abs(delta) > 50) throw new KotcNextError(400, 'Score adjustment is too large');

  await withTransaction(async (client) => {
    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster, { allowFinished: true });

    const r2 = await loadRoundByNoTx(client, normalizedId, 2, { forUpdate: true });
    if (!r2) throw new KotcNextError(409, 'KOTC Next R2 is not initialized');
    const courts = await listCourtsByRoundTx(client, r2.roundId);
    const court = courts.find((row) => row.courtNo === courtNo) ?? null;
    if (!court) throw new KotcNextError(404, 'KOTC Next R2 court not found');
    const pairs = await listPairsByCourtTx(client, court.courtId);
    if (!pairs.some((row) => row.pairIdx === pairIdx)) {
      throw new KotcNextError(404, 'KOTC Next R2 pair not found');
    }

    await adjustRaundStatScoreTx(client, court.courtId, raundNo, pairIdx, delta, 'R2');
    await persistFinishedRoundPlayerStatsTx(client, r2, tournament);
  });

  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(normalizedId).catch(() => {});
  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function bootstrapKotcNextR2(
  tournamentId: string,
  options?: { seed?: number; zones?: unknown; manualDraft?: unknown },
): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');

  await withTransaction(async (client) => {
    const r1 = await loadRoundByNoTx(client, normalizedId, 1, { forUpdate: true });
    if (!r1 || r1.status !== 'finished') {
      throw new KotcNextError(409, 'Finish R1 before bootstrapping R2');
    }

    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster);

    if (await loadRoundByNoTx(client, normalizedId, 2, { forUpdate: true })) {
      throw new KotcNextError(409, 'R2 already exists; rollback R2 before applying a new seed', 'R2_ROLLBACK_REQUIRED');
    }

    const hasManualDraft = Array.isArray(options?.manualDraft) && options?.manualDraft.length > 0;
    let pairSources: R1PairSource[];
    let courtLabels: KotcNextZoneKey[];

    if (hasManualDraft) {
      const draft = await getKotcNextR2ManualDraftTx(client, tournament, r1);
      const selectedManualDraft = normalizeManualDraftInput(options?.manualDraft, draft);
      pairSources = buildPairSourcesFromManualDraft(tournament, selectedManualDraft);
      courtLabels = selectedManualDraft.map((zone) => zone.zone);
    } else {
      const draft = tournament.variant === 'MF'
        ? await getKotcNextR2IndividualSeedDraftTx(client, tournament, r1)
        : seedKotcNextR2Courts(
            (await loadAggregatePairRowsTx(client, r1, tournament.params.takeoversMode)).map((row) => ({
              courtNo: row.courtNo,
              pairIdx: row.pairIdx,
              pairLabel: row.pairLabel,
              kingWins: row.kingWins,
              takeovers: row.takeovers,
              gamesPlayed: row.gamesPlayed,
              longestKingRun: row.longestKingRun,
              firstLongestKingRunOrder: row.firstLongestKingRunOrder,
            })),
            tournament.params.takeoversMode,
            tournament.params.r2SeedingMode,
          );
      const selectedZones = normalizeSeedDraftInput(options?.zones, draft);
      const pairMap = new Map<string, PairRow>();
      for (const court of await listCourtsByRoundTx(client, r1.roundId)) {
        for (const pair of await listPairsByCourtTx(client, court.courtId)) {
          pairMap.set(`${court.courtNo}:${pair.pairIdx}`, pair);
        }
      }
      pairSources = selectedZones.map((zone, index) => ({
        courtNo: index + 1,
        pairs: zone.pairRefs.map((ref) => {
          if (ref.primaryPlayerId || ref.secondaryPlayerId) {
            return {
              primaryPlayerId: ref.primaryPlayerId ?? null,
              primaryPlayerName: ref.primaryPlayerName ?? '',
              secondaryPlayerId: ref.secondaryPlayerId ?? null,
              secondaryPlayerName: ref.secondaryPlayerName ?? '',
              primaryGender: ref.primaryGender ?? 'M',
              secondaryGender: ref.secondaryGender ?? 'W',
            };
          }
          const pair = pairMap.get(`${ref.courtNo}:${ref.pairIdx}`);
          if (!pair) throw new KotcNextError(409, 'R2 draft can no longer be materialized');
          return {
            primaryPlayerId: pair.primaryPlayerId,
            primaryPlayerName: pair.primaryPlayerName,
            secondaryPlayerId: pair.secondaryPlayerId,
            secondaryPlayerName: pair.secondaryPlayerName,
            primaryGender: pair.primaryGender,
            secondaryGender: pair.secondaryGender,
          };
        }),
      }));
      courtLabels = selectedZones.map((zone) => zone.zone);
    }

    await bootstrapRoundTx(client, tournament, 2, {
      seed: Math.max(1, asInt(options?.seed, r1.seed + 1)),
      labelByCourt: (courtNo) => zoneLabel(courtLabels[courtNo - 1] ?? 'lite'),
      pairSources,
    });
  });

  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function resetKotcNextR2(tournamentId: string): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');

  await withTransaction(async (client) => {
    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster, { allowFinished: true });
    await resetKotcNextR2Tx(client, normalizedId);
  });

  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(normalizedId).catch(() => {});
  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function getKotcNextJudgeSnapshotByPin(
  pin: string,
  options?: { raundNo?: number | null },
): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  if (!normalizedPin) {
    throw new KotcNextError(400, 'pin is required');
  }
  const selectedRaundNo = Number.isInteger(options?.raundNo)
    ? Math.max(1, Math.trunc(Number(options?.raundNo)))
    : null;

  return withTransaction(async (client) => {
    const { tournament, round, court } = await loadCourtByPinTx(client, normalizedPin);
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const aggregateIndividualRows = await loadIndividualRoundResultRowsTx(client, round, tournament);
    const { roundNav, courtNav } = await loadJudgeRoundNavTx(
      client,
      tournament.id,
      round.roundNo,
      court.courtNo,
      tournament.params.courts,
    );
    if (!raunds.length) {
      throw new KotcNextError(409, 'Court has no raunds');
    }

    let currentRaund = selectCurrentRaund(raunds, selectedRaundNo) ?? raunds[0];
    let currentStats = await listRaundStatsTx(client, currentRaund.raundId);
    let currentEvents = await listGameEventsTx(client, currentRaund.raundId);
    currentRaund = await repairPendingInitialRaundOrderTx(
      client,
      tournament,
      round,
      court,
      currentRaund,
      currentStats,
      currentEvents,
    );
    currentStats = await listRaundStatsTx(client, currentRaund.raundId);
    currentEvents = await listGameEventsTx(client, currentRaund.raundId);
    const aggregatePairRows = await loadJudgeRaundPairRowsTx(client, round, tournament, currentRaund.raundNo);
    const raundHistory: KotcNextRaundHistoryEntry[] = [];

    for (const raund of raunds) {
      const raundStats = await listRaundStatsTx(client, raund.raundId);
      const raundEvents = await listGameEventsTx(client, raund.raundId);
      raundHistory.push({
        raundNo: raund.raundNo,
        status: raund.status,
        standings: calcKotcNextRaundStandings(
          buildPairLiveStatesWithRuns(pairs.length, raundStats, raundEvents, raund.raundNo),
          tournament.params.takeoversMode,
        ),
      });
    }

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentDate: tournament.date,
      tournamentTime: tournament.time,
      tournamentLocation: tournament.location,
      variant: tournament.variant,
      params: tournament.params,
      roundType: roundTypeFromNo(round.roundNo),
      roundId: round.roundId,
      courtId: court.courtId,
      courtNo: court.courtNo,
      courtLabel: court.label,
      pinCode: court.pinCode,
      pairs: buildPairViews(pairs),
      liveState: buildLiveState(pairs, currentRaund, currentStats, currentEvents),
      aggregateStandings: {
        pairs: buildJudgeAggregatePairStandings(aggregatePairRows, tournament.params.takeoversMode),
        men: buildJudgeAggregatePlayerStandings(aggregateIndividualRows, tournament.params.takeoversMode, 'M'),
        women: buildJudgeAggregatePlayerStandings(aggregateIndividualRows, tournament.params.takeoversMode, 'W'),
      },
      roundNav,
      courtNav,
      raundHistory,
      selectedRaundNo: currentRaund.raundNo,
      currentEvents,
      currentRaundInstanceKey: buildJudgeRaundInstanceKey(currentRaund),
      currentRaundRevision: buildJudgeRaundRevision(currentRaund, currentEvents),
      canUndo: currentEvents.length > 0 && currentRaund.status !== 'finished',
    };
  });
}

export async function startKotcNextRaund(pin: string, raundNo: number): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  await withTransaction((client) => startRaundTx(client, normalizedPin, normalizedRaundNo));
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function recordKotcNextKingPoint(pin: string, raundNo: number): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  await withTransaction((client) => recordEventTx(client, normalizedPin, normalizedRaundNo, 'king_point'));
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function recordKotcNextTakeover(pin: string, raundNo: number): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  await withTransaction((client) => recordEventTx(client, normalizedPin, normalizedRaundNo, 'takeover'));
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function recordKotcNextPairPoint(
  pin: string,
  raundNo: number,
  pairIdx: number,
): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  const normalizedPairIdx = Math.trunc(Number(pairIdx));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');
  if (!Number.isInteger(normalizedPairIdx)) throw new KotcNextError(400, 'pairIdx is required');

  await withTransaction((client) =>
    recordPairPointTx(client, normalizedPin, normalizedRaundNo, normalizedPairIdx),
  );
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function manualRotateKotcNextPairs(
  pin: string,
  raundNo: number,
  slot: 'king' | 'challenger',
  direction: 'prev' | 'next',
): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');
  if (slot !== 'king' && slot !== 'challenger') {
    throw new KotcNextError(400, 'slot must be king or challenger');
  }
  if (direction !== 'prev' && direction !== 'next') {
    throw new KotcNextError(400, 'direction must be prev or next');
  }

  await withTransaction((client) =>
    manualPairSwitchTx(client, normalizedPin, normalizedRaundNo, slot, direction),
  );
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function resetKotcNextRaund(pin: string, raundNo: number): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  await withTransaction((client) => resetRaundTx(client, normalizedPin, normalizedRaundNo));
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function undoKotcNextLastEvent(pin: string, raundNo: number): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  await withTransaction((client) => undoLastEventTx(client, normalizedPin, normalizedRaundNo));
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function finishKotcNextRaund(
  pin: string,
  raundNo: number,
  password?: string,
): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  const result = await withTransaction((client) => finishRaundTx(client, normalizedPin, normalizedRaundNo, password));
  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(result.tournamentId).catch(() => {});
  if (result.publishResults) {
    await syncKotcNextResultsToTournamentResults(result.tournamentId);
  }
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

export async function forceFinishKotcNextRaundByCourt(
  tournamentId: string,
  input: { roundNo: number; courtNo: number; raundNo: number },
): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  const roundNo = Math.trunc(Number(input.roundNo));
  const courtNo = Math.trunc(Number(input.courtNo));
  const raundNo = Math.trunc(Number(input.raundNo));
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');
  if (!Number.isInteger(roundNo) || (roundNo !== 1 && roundNo !== 2)) throw new KotcNextError(400, 'roundNo is required');
  if (!Number.isInteger(courtNo) || courtNo < 1) throw new KotcNextError(400, 'courtNo is required');
  if (!Number.isInteger(raundNo) || raundNo < 1) throw new KotcNextError(400, 'raundNo is required');

  const result = await withTransaction((client) =>
    forceFinishRaundByCourtTx(client, normalizedId, roundNo, courtNo, raundNo),
  );
  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(result.tournamentId).catch(() => {});
  if (result.publishResults) {
    await syncKotcNextResultsToTournamentResults(result.tournamentId);
  }
  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function forceFinishAllKotcNextRaunds(
  tournamentId: string,
): Promise<{ state: KotcNextOperatorState; completedCount: number }> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');
  const outcome = await withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kotcn:${normalizedId}`]);
    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster, { allowFinished: true });
    const rounds = await listRoundsTx(client, normalizedId);
    if (!rounds.length) throw new KotcNextError(404, 'KOTC Next state not found');

    let completedCount = 0;
    let shouldPublishResults = false;
    for (const round of rounds.sort((a, b) => a.roundNo - b.roundNo)) {
      const updated = await client.query(
        `
          UPDATE kotcn_raund kr
          SET status = 'finished',
              started_at = COALESCE(kr.started_at, now()),
              finished_at = now(),
              paused_at = NULL,
              paused_phase = NULL,
              status_changed_at = now(),
              last_controlled_by = 'admin',
              revision = revision + 1
          FROM kotcn_court kc
          WHERE kr.court_id = kc.id
            AND kc.round_id = $1
            AND kr.status <> 'finished'
          RETURNING kr.id
        `,
        [round.roundId],
      );
      completedCount += updated.rowCount ?? 0;
      await refreshCourtStatusesForRoundTx(client, round.roundId);
      const finalization = await finalizeRoundIfReadyTx(client, tournament, round);
      shouldPublishResults ||= finalization.shouldPublishResults;
    }

    return { completedCount, shouldPublishResults };
  });

  if (outcome.shouldPublishResults) {
    await syncKotcNextResultsToTournamentResults(normalizedId);
  }
  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(normalizedId).catch(() => {});
  return {
    state: (await getKotcNextOperatorStateSummary(normalizedId))!,
    completedCount: outcome.completedCount,
  };
}

function normalizeControlAction(value: unknown): KotcNextControlCommandInput['action'] {
  const action = String(value || '').trim().toLowerCase() as KotcNextControlCommandInput['action'];
  if (
    action === 'start_raund' ||
    action === 'pause_raund' ||
    action === 'resume_raund' ||
    action === 'finish_raund' ||
    action === 'force_finish_court' ||
    action === 'force_finish_all' ||
    action === 'correct_score' ||
    action === 'correct_positions' ||
    action === 'set_remaining_time' ||
    action === 'revert_correction' ||
    action === 'rollback_r2'
  ) {
    return action;
  }
  throw new KotcNextError(400, 'Unsupported KOTC Next control action');
}

function isAdminControlAction(action: KotcNextControlCommandInput['action']): boolean {
  return (
    action === 'force_finish_court' ||
    action === 'force_finish_all' ||
    action === 'correct_score' ||
    action === 'correct_positions' ||
    action === 'set_remaining_time' ||
    action === 'revert_correction' ||
    action === 'rollback_r2'
  );
}

async function getControlRevisionTx(client: PoolClient, tournamentId: string): Promise<number> {
  const res = await client.query(
    `
      SELECT COUNT(*)::bigint AS revision
      FROM kotcn_event_log
      WHERE tournament_id = $1
    `,
    [tournamentId],
  );
  return asInt(res.rows[0]?.revision, 0);
}

function controlEventFromRow(row: Record<string, unknown>): KotcNextControlEvent {
  const rawPayload = row.payload;
  return {
    id: String(row.id),
    commandId: row.command_id ? String(row.command_id) : null,
    eventType: String(row.event_type || ''),
    actorKind:
      row.actor_kind === 'judge' || row.actor_kind === 'operator' || row.actor_kind === 'admin'
        ? row.actor_kind
        : 'system',
    actorId: row.actor_id ? String(row.actor_id) : null,
    reason: row.reason ? String(row.reason) : null,
    roundNo: row.round_no == null ? null : asInt(row.round_no, 0),
    courtNo: row.court_no == null ? null : asInt(row.court_no, 0),
    raundNo: row.raund_no == null ? null : asInt(row.raund_no, 0),
    payload:
      rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? (rawPayload as Record<string, unknown>)
        : {},
    revisionBefore: row.revision_before == null ? null : asInt(row.revision_before, 0),
    revisionAfter: row.revision_after == null ? null : asInt(row.revision_after, 0),
    revertedEventId: row.reverted_event_id ? String(row.reverted_event_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

async function appendControlEventTx(
  client: PoolClient,
  input: {
    tournamentId: string;
    roundId?: string | null;
    courtId?: string | null;
    raundId?: string | null;
    roundNo?: number | null;
    courtNo?: number | null;
    raundNo?: number | null;
    commandId: string;
    eventType: string;
    actor: KotcNextControlActor;
    reason?: string | null;
    payload?: Record<string, unknown>;
    beforeState?: unknown;
    afterState?: unknown;
    revisionBefore: number;
    revisionAfter: number;
    revertedEventId?: string | null;
  },
): Promise<KotcNextControlEvent> {
  const payload = {
    ...(input.payload ?? {}),
    roundNo: input.roundNo ?? null,
    courtNo: input.courtNo ?? null,
    raundNo: input.raundNo ?? null,
  };
  const res = await client.query(
    `
      INSERT INTO kotcn_event_log (
        tournament_id, round_id, court_id, raund_id, command_id, event_type,
        actor_kind, actor_id, reason, payload, before_state, after_state,
        revision_before, revision_after, reverted_event_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15)
      RETURNING *,
        ($10::jsonb ->> 'roundNo')::int AS round_no,
        ($10::jsonb ->> 'courtNo')::int AS court_no,
        ($10::jsonb ->> 'raundNo')::int AS raund_no
    `,
    [
      input.tournamentId,
      input.roundId ?? null,
      input.courtId ?? null,
      input.raundId ?? null,
      input.commandId,
      input.eventType,
      input.actor.kind,
      input.actor.id ?? null,
      input.reason ?? null,
      JSON.stringify(payload),
      input.beforeState == null ? null : JSON.stringify(input.beforeState),
      input.afterState == null ? null : JSON.stringify(input.afterState),
      input.revisionBefore,
      input.revisionAfter,
      input.revertedEventId ?? null,
    ],
  );
  return controlEventFromRow(res.rows[0]);
}

export async function getKotcNextControlHistory(
  tournamentId: string,
  limit = 100,
): Promise<KotcNextControlEvent[]> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(Number(limit) || 100)));
  return withClient(async (client) => {
    const res = await client.query(
      `
        SELECT events.*,
               rounds.round_no,
               courts.court_no,
               raunds.raund_no
        FROM kotcn_event_log events
        LEFT JOIN kotcn_round rounds ON rounds.id = events.round_id
        LEFT JOIN kotcn_court courts ON courts.id = events.court_id
        LEFT JOIN kotcn_raund raunds ON raunds.id = events.raund_id
        WHERE events.tournament_id = $1
        ORDER BY events.created_at DESC, events.id DESC
        LIMIT $2
      `,
      [normalizedId, safeLimit],
    );
    return res.rows.map((row) => controlEventFromRow(row));
  });
}

export async function executeKotcNextControlCommand(
  tournamentId: string,
  actor: KotcNextControlActor,
  input: KotcNextControlCommandInput,
): Promise<KotcNextControlCommandResult> {
  const normalizedId = String(tournamentId || '').trim();
  const commandId = String(input.commandId || '').trim().slice(0, 160);
  const action = normalizeControlAction(input.action);
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');
  if (!commandId) throw new KotcNextError(400, 'commandId is required');
  if (isAdminControlAction(action) && actor.kind !== 'admin') {
    throw new KotcNextError(403, 'This KOTC Next action requires admin role');
  }
  const reason = String(input.reason || '').trim();
  if (isAdminControlAction(action) && !reason) {
    throw new KotcNextError(400, 'Reason is required');
  }

  const transactionResult = await withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kotcn:${normalizedId}`]);
    const existing = await client.query(
      `SELECT result_json FROM kotcn_control_command WHERE tournament_id = $1 AND command_id = $2 LIMIT 1`,
      [normalizedId, commandId],
    );
    if (existing.rows[0]) {
      if (!existing.rows[0].result_json) {
        throw new KotcNextError(409, 'Duplicate command is still in progress');
      }
      return { existing: existing.rows[0].result_json as KotcNextControlCommandResult };
    }

    await client.query(
      `
        INSERT INTO kotcn_control_command (
          tournament_id, command_id, action, actor_kind, actor_id, request_json
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [normalizedId, commandId, action, actor.kind, actor.id ?? null, JSON.stringify(input)],
    );

    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster, { allowFinished: true });
    const revisionBefore = await getControlRevisionTx(client, normalizedId);
    if (input.expectedRevision != null && Math.trunc(Number(input.expectedRevision)) !== revisionBefore) {
      throw new KotcNextError(409, `Control revision mismatch: expected ${input.expectedRevision}, got ${revisionBefore}`, 'REVISION_MISMATCH');
    }

    const roundNo = Math.trunc(Number(input.roundNo) || 0);
    const raundNo = Math.trunc(Number(input.raundNo) || 0);
    const courtNo = Math.trunc(Number(input.courtNo) || 0);
    let round: RoundRow | null = null;
    let targetCourt: CourtRow | null = null;
    let targetRaund: RaundRow | null = null;
    let shouldPublishResults = false;
    let payload: Record<string, unknown> = { ...(input.payload ?? {}) };
    let beforeState: unknown = null;
    let afterState: unknown = null;
    let revertedEventId: string | null = null;

    if (action !== 'force_finish_all' && action !== 'rollback_r2' && action !== 'revert_correction') {
      if (roundNo !== 1 && roundNo !== 2) throw new KotcNextError(400, 'roundNo is required');
      round = await loadRoundByNoTx(client, normalizedId, roundNo, { forUpdate: true });
      if (!round) throw new KotcNextError(404, `KOTC Next R${roundNo} not found`);
    }

    if (action === 'start_raund' || action === 'pause_raund' || action === 'resume_raund' || action === 'finish_raund') {
      if (!round || raundNo < 1) throw new KotcNextError(400, 'raundNo is required');
      await assertPreviousRaundsFinishedAcrossRoundTx(client, round.roundId, raundNo);
      const raunds = await listRaundsByRoundAndNoTx(client, round.roundId, raundNo, { forUpdate: true });
      if (!raunds.length) throw new KotcNextError(404, 'KOTC Next raund not found');
      beforeState = raunds;

      if (action === 'start_raund') {
        if (raunds.some((entry) => entry.status === 'paused')) {
          throw new KotcNextError(409, 'Raund is paused; use resume');
        }
        const startsAt = new Date(Date.now() + KOTC_NEXT_START_COUNTDOWN_SECONDS * 1000);
        await client.query(
          `
            UPDATE kotcn_raund
            SET status = 'running', started_at = COALESCE(started_at, $2), finished_at = NULL,
                paused_at = NULL, paused_phase = NULL, status_changed_at = now(),
                last_controlled_by = $3, revision = revision + 1
            WHERE id = ANY($1::uuid[]) AND status = 'pending'
          `,
          [raunds.map((entry) => entry.raundId), startsAt, actor.kind],
        );
      } else if (action === 'pause_raund') {
        if (!raunds.some((entry) => entry.status === 'running')) throw new KotcNextError(409, 'Raund is not running');
        await client.query(
          `
            UPDATE kotcn_raund
            SET status = 'paused', paused_at = now(),
                paused_phase = CASE WHEN started_at > now() THEN 'countdown' ELSE 'running' END,
                status_changed_at = now(), last_controlled_by = $2, revision = revision + 1
            WHERE id = ANY($1::uuid[]) AND status = 'running'
          `,
          [raunds.map((entry) => entry.raundId), actor.kind],
        );
      } else if (action === 'resume_raund') {
        if (!raunds.some((entry) => entry.status === 'paused')) throw new KotcNextError(409, 'Raund is not paused');
        await client.query(
          `
            UPDATE kotcn_raund
            SET status = 'running',
                started_at = started_at + (now() - paused_at),
                accumulated_pause_ms = accumulated_pause_ms + GREATEST(0, EXTRACT(EPOCH FROM (now() - paused_at)) * 1000)::bigint,
                paused_at = NULL, paused_phase = NULL, status_changed_at = now(),
                last_controlled_by = $2, revision = revision + 1
            WHERE id = ANY($1::uuid[]) AND status = 'paused' AND paused_at IS NOT NULL
          `,
          [raunds.map((entry) => entry.raundId), actor.kind],
        );
      } else {
        const unfinished = raunds.filter((entry) => entry.status !== 'finished');
        if (!unfinished.length) throw new KotcNextError(423, 'Raund already finished');
        if (unfinished.some((entry) => remainingRaundMs(entry) > 0)) {
          throw new KotcNextError(403, 'Timer is not finished; use admin force-finish with a reason');
        }
        await client.query(
          `
            UPDATE kotcn_raund
            SET status = 'finished', finished_at = now(), paused_at = NULL, paused_phase = NULL,
                status_changed_at = now(), last_controlled_by = $2, revision = revision + 1
            WHERE id = ANY($1::uuid[]) AND status <> 'finished'
          `,
          [unfinished.map((entry) => entry.raundId), actor.kind],
        );
        const finalization = await finalizeRoundIfReadyTx(client, tournament, round);
        shouldPublishResults = finalization.shouldPublishResults;
      }
      await refreshCourtStatusesForRoundTx(client, round.roundId);
      afterState = await listRaundsByRoundAndNoTx(client, round.roundId, raundNo);
    } else if (action === 'force_finish_court') {
      if (!round || courtNo < 1 || raundNo < 1) throw new KotcNextError(400, 'courtNo and raundNo are required');
      const target = await loadActionTargetByTournamentCourtTx(client, normalizedId, roundNo, courtNo, raundNo);
      targetCourt = target.court;
      targetRaund = target.raund;
      beforeState = target.raund;
      if (target.raund.status === 'finished') throw new KotcNextError(423, 'Raund already finished');
      await client.query(
        `
          UPDATE kotcn_raund
          SET status = 'finished', started_at = COALESCE(started_at, now()), finished_at = now(),
              paused_at = NULL, paused_phase = NULL, status_changed_at = now(),
              last_controlled_by = 'admin', revision = revision + 1
          WHERE id = $1
        `,
        [target.raund.raundId],
      );
      await refreshCourtStatusesForRoundTx(client, round.roundId);
      const finalization = await finalizeRoundIfReadyTx(client, tournament, round);
      shouldPublishResults = finalization.shouldPublishResults;
      afterState = await loadRaundByCourtAndNoTx(client, target.court.courtId, raundNo);
    } else if (action === 'force_finish_all') {
      const rounds = await listRoundsTx(client, normalizedId);
      beforeState = { unfinished: await getControlRevisionTx(client, normalizedId) };
      let completedCount = 0;
      for (const currentRound of rounds.sort((a, b) => a.roundNo - b.roundNo)) {
        const updated = await client.query(
          `
            UPDATE kotcn_raund raund
            SET status = 'finished', started_at = COALESCE(started_at, now()), finished_at = now(),
                paused_at = NULL, paused_phase = NULL, status_changed_at = now(),
                last_controlled_by = 'admin', revision = revision + 1
            FROM kotcn_court court
            WHERE raund.court_id = court.id AND court.round_id = $1 AND raund.status <> 'finished'
            RETURNING raund.id
          `,
          [currentRound.roundId],
        );
        completedCount += updated.rowCount ?? 0;
        await refreshCourtStatusesForRoundTx(client, currentRound.roundId);
        const finalization = await finalizeRoundIfReadyTx(client, tournament, currentRound);
        shouldPublishResults ||= finalization.shouldPublishResults;
      }
      payload = { ...payload, completedCount };
      afterState = { completedCount };
    } else if (action === 'set_remaining_time') {
      if (!round || raundNo < 1) throw new KotcNextError(400, 'roundNo and raundNo are required');
      const remainingMs = Math.trunc(Number(input.payload?.remainingMs));
      if (!Number.isInteger(remainingMs) || remainingMs < 0) {
        throw new KotcNextError(400, 'remainingMs must be a non-negative integer');
      }
      const raunds = await listRaundsByRoundAndNoTx(client, round.roundId, raundNo, { forUpdate: true });
      if (!raunds.length) throw new KotcNextError(404, 'KOTC Next raund not found');
      if (raunds.some((entry) => entry.status !== 'pending' && entry.status !== 'paused')) {
        throw new KotcNextError(409, 'Remaining time can only be corrected while pending or paused');
      }
      if (raunds.some((entry) => remainingMs > entry.timerMinutes * 60_000)) {
        throw new KotcNextError(400, 'remainingMs exceeds the configured raund duration');
      }
      beforeState = raunds;
      await client.query(
        `
          UPDATE kotcn_raund
          SET status = 'paused',
              started_at = now() + $2 * interval '1 millisecond' - timer_minutes * interval '1 minute',
              finished_at = NULL, paused_at = now(), paused_phase = 'running',
              status_changed_at = now(), last_controlled_by = 'admin', revision = revision + 1
          WHERE id = ANY($1::uuid[])
        `,
        [raunds.map((entry) => entry.raundId), remainingMs],
      );
      payload = { ...payload, remainingMs };
      afterState = await listRaundsByRoundAndNoTx(client, round.roundId, raundNo);
    } else if (action === 'correct_positions') {
      if (!round || courtNo < 1 || raundNo < 1) throw new KotcNextError(400, 'roundNo, courtNo and raundNo are required');
      const target = await loadActionTargetByTournamentCourtTx(client, normalizedId, roundNo, courtNo, raundNo);
      targetCourt = target.court;
      targetRaund = target.raund;
      if (targetRaund.status !== 'pending' && targetRaund.status !== 'paused') {
        throw new KotcNextError(409, 'Positions can only be corrected while pending or paused');
      }
      const kingPairIdx = Math.trunc(Number(input.payload?.kingPairIdx));
      const challengerPairIdx = Math.trunc(Number(input.payload?.challengerPairIdx));
      const rawQueue = input.payload?.queueOrder;
      if (!Array.isArray(rawQueue)) throw new KotcNextError(400, 'queueOrder must be an array');
      const queueOrder = rawQueue.map((value) => Math.trunc(Number(value)));
      const available = (await listPairsByCourtTx(client, targetCourt.courtId)).map((pair) => pair.pairIdx).sort((a, b) => a - b);
      const proposed = [kingPairIdx, challengerPairIdx, ...queueOrder];
      const unique = [...new Set(proposed)].sort((a, b) => a - b);
      if (
        !Number.isInteger(kingPairIdx) ||
        !Number.isInteger(challengerPairIdx) ||
        unique.length !== proposed.length ||
        unique.length !== available.length ||
        unique.some((value, index) => value !== available[index])
      ) {
        throw new KotcNextError(400, 'Positions must contain every court pair exactly once');
      }
      beforeState = targetRaund;
      await client.query(
        `
          UPDATE kotcn_raund
          SET king_pair_idx = $2, challenger_pair_idx = $3, queue_order = $4::jsonb,
              status_changed_at = now(), last_controlled_by = 'admin', revision = revision + 1
          WHERE id = $1
        `,
        [targetRaund.raundId, kingPairIdx, challengerPairIdx, JSON.stringify(queueOrder)],
      );
      payload = { ...payload, kingPairIdx, challengerPairIdx, queueOrder };
      afterState = await loadRaundByCourtAndNoTx(client, targetCourt.courtId, raundNo);
    } else if (action === 'correct_score') {
      if (!round || courtNo < 1 || raundNo < 1) throw new KotcNextError(400, 'roundNo, courtNo and raundNo are required');
      const pairIdx = Math.trunc(Number(input.payload?.pairIdx));
      const delta = Math.trunc(Number(input.payload?.delta));
      if (!Number.isInteger(pairIdx) || pairIdx < 0 || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 50) {
        throw new KotcNextError(400, 'pairIdx and delta are invalid');
      }
      if (roundNo === 1 && (await loadRoundByNoTx(client, normalizedId, 2, { forUpdate: true }))) {
        throw new KotcNextError(409, 'Rollback R2 before correcting R1', 'R2_ROLLBACK_REQUIRED');
      }
      const courts = await listCourtsByRoundTx(client, round.roundId);
      targetCourt = courts.find((entry) => entry.courtNo === courtNo) ?? null;
      if (!targetCourt) throw new KotcNextError(404, 'KOTC Next court not found');
      targetRaund = await loadRaundByCourtAndNoTx(client, targetCourt.courtId, raundNo, { forUpdate: true });
      if (!targetRaund) throw new KotcNextError(404, 'KOTC Next raund not found');
      beforeState = await listRaundStatsTx(client, targetRaund.raundId);
      await adjustRaundStatScoreTx(client, targetCourt.courtId, raundNo, pairIdx, delta, `R${roundNo}`);
      await client.query(`UPDATE kotcn_raund SET revision = revision + 1 WHERE id = $1`, [targetRaund.raundId]);
      await persistFinishedRoundPlayerStatsTx(client, round, tournament);
      shouldPublishResults = roundNo === 2 && round.status === 'finished';
      payload = { ...payload, pairIdx, delta };
      afterState = await listRaundStatsTx(client, targetRaund.raundId);
    } else if (action === 'revert_correction') {
      const eventId = String(input.payload?.eventId || '').trim();
      if (!eventId) throw new KotcNextError(400, 'eventId is required');
      const eventRes = await client.query(
        `
          SELECT * FROM kotcn_event_log
          WHERE id = $1 AND tournament_id = $2 AND event_type = 'correct_score'
          LIMIT 1 FOR UPDATE
        `,
        [eventId, normalizedId],
      );
      const sourceEvent = eventRes.rows[0];
      if (!sourceEvent) throw new KotcNextError(404, 'Correction event not found');
      const reverted = await client.query(`SELECT 1 FROM kotcn_event_log WHERE reverted_event_id = $1 LIMIT 1`, [eventId]);
      if (reverted.rows[0]) throw new KotcNextError(409, 'Correction is already reverted');
      const sourcePayload = sourceEvent.payload as Record<string, unknown>;
      const sourceRoundNo = asInt(sourcePayload.roundNo, 0);
      const sourceCourtNo = asInt(sourcePayload.courtNo, 0);
      const sourceRaundNo = asInt(sourcePayload.raundNo, 0);
      const pairIdx = asInt(sourcePayload.pairIdx, -1);
      const delta = asInt(sourcePayload.delta, 0);
      round = await loadRoundByNoTx(client, normalizedId, sourceRoundNo, { forUpdate: true });
      if (!round) throw new KotcNextError(404, 'Correction round not found');
      if (sourceRoundNo === 1 && (await loadRoundByNoTx(client, normalizedId, 2, { forUpdate: true }))) {
        throw new KotcNextError(409, 'Rollback R2 before reverting an R1 correction', 'R2_ROLLBACK_REQUIRED');
      }
      const courts = await listCourtsByRoundTx(client, round.roundId);
      targetCourt = courts.find((entry) => entry.courtNo === sourceCourtNo) ?? null;
      if (!targetCourt) throw new KotcNextError(404, 'Correction court not found');
      targetRaund = await loadRaundByCourtAndNoTx(client, targetCourt.courtId, sourceRaundNo, { forUpdate: true });
      if (!targetRaund) throw new KotcNextError(404, 'Correction raund not found');
      await adjustRaundStatScoreTx(client, targetCourt.courtId, sourceRaundNo, pairIdx, -delta, `R${sourceRoundNo}`);
      await client.query(`UPDATE kotcn_raund SET revision = revision + 1 WHERE id = $1`, [targetRaund.raundId]);
      await persistFinishedRoundPlayerStatsTx(client, round, tournament);
      shouldPublishResults = sourceRoundNo === 2 && round.status === 'finished';
      payload = { eventId, pairIdx, delta: -delta };
      revertedEventId = eventId;
      beforeState = sourceEvent.after_state;
      afterState = await listRaundStatsTx(client, targetRaund.raundId);
    } else if (action === 'rollback_r2') {
      round = await loadRoundByNoTx(client, normalizedId, 2, { forUpdate: true });
      if (!round) throw new KotcNextError(409, 'KOTC Next R2 is not initialized');
      beforeState = { roundId: round.roundId, status: round.status };
      await resetKotcNextR2Tx(client, normalizedId);
      afterState = { removedRoundId: round.roundId };
    }

    const revisionAfter = revisionBefore + 1;
    const event = await appendControlEventTx(client, {
      tournamentId: normalizedId,
      roundId: round?.roundId ?? null,
      courtId: targetCourt?.courtId ?? null,
      raundId: targetRaund?.raundId ?? null,
      roundNo: round?.roundNo ?? (roundNo || null),
      courtNo: targetCourt?.courtNo ?? (courtNo || null),
      raundNo: targetRaund?.raundNo ?? (raundNo || null),
      commandId,
      eventType: action,
      actor,
      reason,
      payload,
      beforeState,
      afterState,
      revisionBefore,
      revisionAfter,
      revertedEventId,
    });
    return { event, shouldPublishResults };
  });

  if ('existing' in transactionResult) {
    return { ...(transactionResult.existing as KotcNextControlCommandResult), idempotent: true };
  }
  if (transactionResult.shouldPublishResults) {
    await syncKotcNextResultsToTournamentResults(normalizedId);
  }
  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  await persistKotcNextSpectatorSnapshot(normalizedId).catch(() => {});
  const state = await getKotcNextOperatorStateSummary(normalizedId);
  if (!state) throw new KotcNextError(404, 'KOTC Next state not found');
  const result: KotcNextControlCommandResult = {
    success: true,
    action,
    state,
    event: transactionResult.event,
    idempotent: false,
    serverNow: Date.now(),
  };
  await withClient((client) =>
    client.query(
      `UPDATE kotcn_control_command SET result_json = $3::jsonb, completed_at = now() WHERE tournament_id = $1 AND command_id = $2`,
      [normalizedId, commandId, JSON.stringify(result)],
    ).then(() => undefined),
  );
  return result;
}

async function buildRoundViewTx(
  client: PoolClient,
  round: RoundRow,
  takeoversMode: TournamentRow['params']['takeoversMode'],
): Promise<KotcNextOperatorRoundView> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const courtViews: KotcNextCourtOperatorView[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const progress: KotcNextCourtRaundProgress[] = [];

    for (const raund of raunds) {
      const raundStats = await listRaundStatsTx(client, raund.raundId);
      const raundEvents = await listGameEventsTx(client, raund.raundId);
      progress.push({
        raundNo: raund.raundNo,
        status: raund.status,
        startedAt: raund.startedAt,
        finishedAt: raund.finishedAt,
        pausedAt: raund.pausedAt,
        accumulatedPauseMs: raund.accumulatedPauseMs,
        displayStatus: raundDisplayStatus(raund),
        revision: raund.revision,
        standings: calcKotcNextRaundStandings(
          buildPairLiveStatesWithRuns(pairs.length, raundStats, raundEvents, raund.raundNo),
          takeoversMode,
        ),
        canAdminForceFinish: raund.status !== 'finished',
      });
    }

    const currentRaund = selectCurrentRaund(raunds);
    const liveState = currentRaund == null
      ? null
      : buildLiveState(
          pairs,
          currentRaund,
          await listRaundStatsTx(client, currentRaund.raundId),
          await listGameEventsTx(client, currentRaund.raundId),
        );
    const status: KotcNextCourtStatus =
      raunds.length && raunds.every((row) => row.status === 'finished')
        ? 'finished'
        : raunds.some((row) => row.status === 'running' || row.status === 'paused')
          ? 'live'
          : 'pending';

    courtViews.push({
      courtId: court.courtId,
      courtNo: court.courtNo,
      label: court.label,
      pinCode: court.pinCode,
      judgeUrl: judgeUrlForPin(court.pinCode),
      status,
      pairs: buildPairViews(pairs),
      raunds: progress,
      currentRaundNo: currentRaund?.raundNo ?? null,
      liveState,
    });
  }

  return {
    roundId: round.roundId,
    roundNo: round.roundNo,
    roundType: roundTypeFromNo(round.roundNo),
    status: round.status,
    courts: courtViews,
  };
}

function buildStage(rounds: RoundRow[]): KotcNextOperatorStage {
  const r1 = rounds.find((row) => row.roundNo === 1) ?? null;
  const r2 = rounds.find((row) => row.roundNo === 2) ?? null;
  if (!r1) return 'setup';
  if (r1.status !== 'finished') return 'r1_live';
  if (!r2) return 'r1_finished';
  if (r2.status !== 'finished') return 'r2_live';
  return 'r2_finished';
}

function buildFinalResults(summaryRows: AggregatePairRow[]): KotcNextFinalZoneResult[] {
  const grouped = new Map<KotcNextZoneKey, AggregatePairRow[]>();
  for (const row of summaryRows) {
    if (!row.zone) continue;
    const current = grouped.get(row.zone) ?? [];
    current.push(row);
    grouped.set(row.zone, current);
  }

  return ZONE_ORDER.filter((zone) => grouped.has(zone)).map((zone) => ({
    zone,
    zoneLabel: zoneLabel(zone),
    pairs: (grouped.get(zone) ?? [])
      .sort((left, right) => left.position - right.position)
      .map((row) => ({
        position: row.position,
        pairLabel: row.pairLabel,
        primaryPlayerId: row.primaryPlayerId,
        primaryPlayerName: row.primaryPlayerName,
        primaryGender: row.primaryGender,
        secondaryPlayerId: row.secondaryPlayerId,
        secondaryPlayerName: row.secondaryPlayerName,
        secondaryGender: row.secondaryGender,
        kingWins: row.kingWins,
        takeovers: row.takeovers,
        longestKingRun: row.longestKingRun,
        firstLongestKingRunOrder: row.firstLongestKingRunOrder,
      })),
  }));
}

function individualResultKey(playerId: string | null, playerName: string): string {
  const normalizedId = String(playerId || '').trim();
  if (normalizedId) return `id:${normalizedId}`;
  return `name:${String(playerName || '').trim().toLowerCase()}`;
}

function roundResultFromRow(row: IndividualRoundResultRow): KotcNextFinalIndividualResult['r1'] {
  return {
    courtNo: row.courtNo,
    courtLabel: row.courtLabel,
    zone: row.zone,
    zoneLabel: row.zone ? zoneLabel(row.zone) : null,
    position: row.position,
    kingWins: row.kingWins,
    takeovers: row.takeovers,
    gamesPlayed: row.gamesPlayed,
    longestKingRun: row.longestKingRun,
    firstLongestKingRunOrder: row.firstLongestKingRunOrder,
  };
}

function indexIndividualRoundRows(rows: IndividualRoundResultRow[]): Map<string, IndividualRoundResultRow> {
  const result = new Map<string, IndividualRoundResultRow>();
  for (const row of rows) {
    if (!row.playerId && !row.playerName.trim()) continue;
    result.set(individualResultKey(row.playerId, row.playerName), row);
  }
  return result;
}

function buildFinalIndividualResults(
  finalResults: KotcNextFinalZoneResult[],
  r1Rows: IndividualRoundResultRow[],
  r2Rows: IndividualRoundResultRow[],
): KotcNextFinalIndividualResult[] {
  const r1ByPlayer = indexIndividualRoundRows(r1Rows);
  const r2ByPlayer = indexIndividualRoundRows(r2Rows);
  const result: KotcNextFinalIndividualResult[] = [];

  for (const zone of [...finalResults].sort((left, right) => ZONE_ORDER.indexOf(left.zone) - ZONE_ORDER.indexOf(right.zone))) {
    for (const pair of [...zone.pairs].sort((left, right) => left.position - right.position)) {
      for (const player of [
        {
          playerId: pair.primaryPlayerId,
          playerName: pair.primaryPlayerName,
          gender: pair.primaryGender,
        },
        {
          playerId: pair.secondaryPlayerId,
          playerName: pair.secondaryPlayerName,
          gender: pair.secondaryGender,
        },
      ]) {
        if (!player.playerId && !player.playerName.trim()) continue;
        const key = individualResultKey(player.playerId, player.playerName);
        const r1 = r1ByPlayer.get(key) ?? null;
        const r2 = r2ByPlayer.get(key) ?? null;
        result.push({
          playerId: player.playerId,
          playerName: player.playerName,
          gender: player.gender,
          finalZone: zone.zone,
          finalZoneLabel: zone.zoneLabel,
          finalPosition: r2?.position ?? pair.position,
          finalPairLabel: pair.pairLabel,
          r1: r1 ? roundResultFromRow(r1) : null,
          r2: r2 ? roundResultFromRow(r2) : null,
          totalKingWins: (r1?.kingWins ?? 0) + (r2?.kingWins ?? 0),
          totalTakeovers: (r1?.takeovers ?? 0) + (r2?.takeovers ?? 0),
          totalGamesPlayed: (r1?.gamesPlayed ?? 0) + (r2?.gamesPlayed ?? 0),
          totalLongestKingRun: Math.max(r1?.longestKingRun ?? 0, r2?.longestKingRun ?? 0),
          firstTotalLongestKingRunOrder:
            [r1?.firstLongestKingRunOrder ?? null, r2?.firstLongestKingRunOrder ?? null]
              .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
              .sort((left, right) => left - right)[0] ?? null,
        });
      }
    }
  }

  return result;
}

export async function getKotcNextOperatorStateSummary(tournamentId: string): Promise<KotcNextOperatorState | null> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  return withClient(async (client) => {
    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId);
    ensureKotcNextTournament(tournament, roster, { allowFinished: true });
    const rounds = await listRoundsTx(client, normalizedId);

    if (!rounds.length) {
      return {
        controlRevision: await getControlRevisionTx(client, normalizedId),
        serverNow: Date.now(),
        stage: 'setup',
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentDate: tournament.date,
        tournamentTime: tournament.time,
        tournamentLocation: tournament.location,
        variant: tournament.variant,
        params: tournament.params,
        rounds: [],
        r2SeedDraft: null,
        manualR2Draft: null,
        finalResults: null,
        finalIndividualResults: null,
        canBootstrapR1: true,
        canFinishR1: false,
        canPreviewR2Seed: false,
        canConfirmR2Seed: false,
        canPreviewManualR2: false,
        canConfirmManualR2: false,
        canBootstrapR2: false,
        canFinishR2: false,
        canResetR2: false,
        canAdjustR2PairScore: false,
      };
    }

    const roundViews: KotcNextOperatorRoundView[] = [];
    for (const round of rounds) {
      roundViews.push(await buildRoundViewTx(client, round, tournament.params.takeoversMode));
    }

    const stage = buildStage(rounds);
    const r1 = rounds.find((row) => row.roundNo === 1) ?? null;
    const r2 = rounds.find((row) => row.roundNo === 2) ?? null;
    const r2FinalRows =
      r2?.status === 'finished' ? await loadAggregatePairRowsTx(client, r2, tournament.params.takeoversMode) : null;
    const finalResults = r2FinalRows ? buildFinalResults(r2FinalRows) : null;
    const finalIndividualResults =
      r1 && r2 && finalResults
        ? buildFinalIndividualResults(
            finalResults,
            await loadIndividualRoundResultRowsTx(client, r1, tournament),
            await loadIndividualRoundResultRowsTx(client, r2, tournament),
          )
        : null;

    return {
      controlRevision: await getControlRevisionTx(client, normalizedId),
      serverNow: Date.now(),
      stage,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentDate: tournament.date,
      tournamentTime: tournament.time,
      tournamentLocation: tournament.location,
      variant: tournament.variant,
      params: tournament.params,
      rounds: roundViews,
      r2SeedDraft: stage === 'r1_finished' && r1 ? await getKotcNextR2SeedDraft(normalizedId) : null,
      manualR2Draft: r1 && r1.status === 'finished' ? await getKotcNextR2ManualDraftTx(client, tournament, r1) : null,
      finalResults,
      finalIndividualResults,
      canBootstrapR1: !r1,
      canFinishR1: false,
      canPreviewR2Seed: Boolean(r1 && r1.status === 'finished' && !r2),
      canConfirmR2Seed: Boolean(r1 && r1.status === 'finished' && !r2),
      canPreviewManualR2: Boolean(r1 && r1.status === 'finished'),
      canConfirmManualR2: Boolean(r1 && r1.status === 'finished'),
      canBootstrapR2: Boolean(r1 && r1.status === 'finished' && !r2),
      canFinishR2: false,
      canResetR2: Boolean(r2),
      canAdjustR2PairScore: Boolean(r2),
    };
  });
}

export async function runKotcNextOperatorAction(
  tournamentId: string,
  action: KotcNextOperatorActionName,
  options?: { seed?: number; zones?: unknown; manualDraft?: unknown; courtNo?: unknown; raundNo?: unknown; pairIdx?: unknown; delta?: unknown },
): Promise<{ success: true; state: KotcNextOperatorState; r2SeedDraft?: KotcNextR2SeedZone[]; manualR2Draft?: KotcNextR2ManualZone[] }> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  if (action === 'bootstrap_r1') {
    return { success: true, state: await bootstrapKotcNextR1(normalizedId, { seed: options?.seed }) };
  }
  if (action === 'preview_r2_seed') {
    const [state, draft] = await Promise.all([
      getKotcNextOperatorStateSummary(normalizedId),
      getKotcNextR2SeedDraft(normalizedId),
    ]);
    if (!state) throw new KotcNextError(409, 'KOTC Next state is not initialized');
    return { success: true, state, r2SeedDraft: draft };
  }
  if (action === 'preview_manual_r2') {
    const [state, draft] = await Promise.all([
      getKotcNextOperatorStateSummary(normalizedId),
      getKotcNextR2ManualDraft(normalizedId),
    ]);
    if (!state) throw new KotcNextError(409, 'KOTC Next state is not initialized');
    return { success: true, state, manualR2Draft: draft };
  }
  if (action === 'confirm_r2_seed' || action === 'bootstrap_r2') {
    return { success: true, state: await bootstrapKotcNextR2(normalizedId, options) };
  }
  if (action === 'confirm_manual_r2') {
    return { success: true, state: await bootstrapKotcNextR2(normalizedId, { seed: options?.seed, manualDraft: options?.manualDraft }) };
  }
  if (action === 'close_tournament') {
    return { success: true, state: await closeKotcNextTournament(normalizedId) };
  }
  if (action === 'reset_r2') {
    return { success: true, state: await resetKotcNextR2(normalizedId) };
  }
  if (action === 'adjust_r1_pair_score') {
    return {
      success: true,
      state: await adjustKotcNextR1PairScore(normalizedId, {
        courtNo: asInt(options?.courtNo, 0),
        raundNo: asInt(options?.raundNo, 0),
        pairIdx: asInt(options?.pairIdx, -1),
        delta: asInt(options?.delta, 0),
      }),
    };
  }
  if (action === 'adjust_r2_pair_score') {
    return {
      success: true,
      state: await adjustKotcNextR2PairScore(normalizedId, {
        courtNo: asInt(options?.courtNo, 0),
        raundNo: asInt(options?.raundNo, 0),
        pairIdx: asInt(options?.pairIdx, -1),
        delta: asInt(options?.delta, 0),
      }),
    };
  }

  const state = await getKotcNextOperatorStateSummary(normalizedId);
  if (!state) throw new KotcNextError(409, 'KOTC Next state is not initialized');

  if (action === 'finish_r1') {
    const r1 = state.rounds.find((round) => round.roundType === 'r1');
    if (!r1 || r1.status !== 'finished') {
      throw new KotcNextError(409, 'R1 is not finished yet');
    }
    return { success: true, state };
  }
  if (action === 'finish_r2') {
    const r2 = state.rounds.find((round) => round.roundType === 'r2');
    if (!r2 || r2.status !== 'finished') {
      throw new KotcNextError(409, 'R2 is not finished yet');
    }
    return { success: true, state };
  }

  throw new KotcNextError(400, 'Unsupported KOTC Next operator action');
}
