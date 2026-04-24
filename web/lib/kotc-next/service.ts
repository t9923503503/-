import { PoolClient } from 'pg';
import { upsertTournamentResults } from '@/lib/admin-queries';
import { getTournamentTableColumnsTx } from '@/lib/admin-queries-pg';
import {
  normalizeKotcJudgeBootstrapSignature,
  normalizeKotcJudgeModule,
  type KotcJudgeModule,
} from '@/lib/admin-legacy-sync';
import { getPool } from '@/lib/db';
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
import {
  applyManualPairSwitch,
  applyKingPoint,
  applyTakeover,
  applyUndo,
  addKotcNextKingRallyTiebreakers,
  buildKotcNextRoundPartnerIndexMap,
  calcKotcNextRaundStandings,
  getInitialKotcNextCourtState,
  seedKotcNextR2Courts,
} from './core';
import type {
  KotcNextCourtLiveState,
  KotcNextCourtOperatorView,
  KotcNextCourtRaundProgress,
  KotcNextCourtStatus,
  KotcNextFinalZoneResult,
  KotcNextGameEvent,
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
  KotcNextR2SeedZone,
  KotcNextRaundHistoryEntry,
  KotcNextRaundStatus,
  KotcNextRoundStatus,
  KotcNextRoundType,
  KotcNextVariant,
  KotcNextZoneKey,
} from './types';

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

interface ResolvedPairRow {
  pairIdx: number;
  primarySourcePairIdx: number;
  secondarySourcePairIdx: number;
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
  bestKingStreak: number;
  firstKingStreakSeq: number | null;
  takeovers: number;
  gamesPlayed: number;
  position: number;
  zone: KotcNextZoneKey | null;
}

interface AggregatePlayerRow {
  courtId: string;
  courtNo: number;
  courtLabel: string;
  line: 'primary' | 'secondary';
  sourcePairIdx: number;
  playerId: string | null;
  playerName: string;
  playerGender: 'M' | 'W' | null;
  kingWins: number;
  bestKingStreak: number;
  firstKingStreakSeq: number | null;
  takeovers: number;
  gamesPlayed: number;
  position: number;
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
  if (normalized === 'pending' || normalized === 'finished') return normalized;
  return 'running';
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

function resolvedPairLabel(pair: ResolvedPairRow): string {
  const primary = pair.primaryPlayerName.trim();
  const secondary = pair.secondaryPlayerName.trim();
  if (primary && secondary) return `${primary} / ${secondary}`;
  return primary || secondary || `Pair ${pair.pairIdx + 1}`;
}

function resolvePairsForRaund(pairs: PairRow[], raundNo: number): ResolvedPairRow[] {
  const count = pairs.length;
  if (!count) return [];
  return buildKotcNextRoundPartnerIndexMap(count, raundNo).map(({ pairIdx, secondaryIdx }) => {
    const pair = pairs[pairIdx] ?? pairs[0];
    const secondarySource = pairs[secondaryIdx] ?? pair;
    return {
      pairIdx: pair.pairIdx,
      primarySourcePairIdx: pair.pairIdx,
      secondarySourcePairIdx: secondarySource.pairIdx,
      primaryPlayerId: pair.primaryPlayerId,
      primaryPlayerName: pair.primaryPlayerName,
      primaryGender: pair.primaryGender,
      secondaryPlayerId: secondarySource.secondaryPlayerId,
      secondaryPlayerName: secondarySource.secondaryPlayerName,
      secondaryGender: secondarySource.secondaryGender,
    };
  });
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
        ${columns.has('kotc_raund_count') ? 'COALESCE(kotc_raund_count, 4) AS kotc_raund_count' : 'NULL::int AS kotc_raund_count'},
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
      asInt(rawSettings.kotcRaundCount ?? rawSettings.raundCount, 4),
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
        variant,
      },
    },
    roster,
  };
}

async function listRoundsTx(client: PoolClient, tournamentId: string): Promise<RoundRow[]> {
  const res = await client.query(
    `
      SELECT id, tournament_id, round_no, status, seed
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
      SELECT id, tournament_id, round_no, status, seed
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
    status: raundStatusFromValue(row.status),
    kingPairIdx: asInt(row.king_pair_idx, 0),
    challengerPairIdx: asInt(row.challenger_pair_idx, 1),
    queueOrder: normalizeQueueOrder(row.queue_order),
  };
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
        ${columns.has('kotc_raund_count') ? 'COALESCE(t.kotc_raund_count, 4) AS kotc_raund_count' : 'NULL::int AS kotc_raund_count'},
        ${columns.has('kotc_raund_timer_minutes') ? 'COALESCE(t.kotc_raund_timer_minutes, 10) AS kotc_raund_timer_minutes' : 'NULL::int AS kotc_raund_timer_minutes'},
        ${columns.has('kotc_ppc') ? 'COALESCE(t.kotc_ppc, 4) AS kotc_ppc' : 'NULL::int AS kotc_ppc'},
        ${columns.has('courts') ? 'COALESCE(t.courts, 1) AS courts' : 'NULL::int AS courts'},
        kr.id AS round_id,
        kr.round_no,
        kr.status AS round_status,
        kr.seed,
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
      asInt(rawSettings.kotcRaundCount ?? rawSettings.raundCount, 4),
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
        variant,
      },
    },
    round: {
      roundId: String(row.round_id),
      tournamentId: tournament.id,
      roundNo: asInt(row.round_no, 1),
      status: roundStatusFromValue(row.round_status),
      seed: asInt(row.seed, 1),
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

function buildPairViews(pairs: ResolvedPairRow[]): KotcNextPairView[] {
  return pairs.map((pair) => ({
    pairIdx: pair.pairIdx,
    primaryPlayer: pair.primaryPlayerId ? { id: pair.primaryPlayerId, name: pair.primaryPlayerName } : null,
    secondaryPlayer: pair.secondaryPlayerId ? { id: pair.secondaryPlayerId, name: pair.secondaryPlayerName } : null,
    label: resolvedPairLabel(pair),
  }));
}

function buildPairLiveStates(pairCount: number, stats: RaundStatRow[]): KotcNextPairLiveState[] {
  const byPair = new Map(stats.map((row) => [row.pairIdx, row]));
  return Array.from({ length: pairCount }, (_, pairIdx) => {
    const stat = byPair.get(pairIdx);
    return {
      pairIdx,
      kingWins: stat?.kingWins ?? 0,
      bestKingStreak: 0,
      firstKingStreakSeq: null,
      takeovers: stat?.takeovers ?? 0,
      gamesPlayed: stat?.gamesPlayed ?? 0,
    };
  });
}

function buildPairLiveStatesWithRally(
  pairCount: number,
  stats: RaundStatRow[],
  events: KotcNextGameEvent[],
): KotcNextPairLiveState[] {
  return addKotcNextKingRallyTiebreakers(buildPairLiveStates(pairCount, stats), events);
}

function buildLiveState(
  pairCount: number,
  raund: RaundRow,
  stats: RaundStatRow[],
  events: KotcNextGameEvent[] = [],
): KotcNextCourtLiveState {
  return {
    currentRaundNo: raund.raundNo,
    kingPairIdx: raund.kingPairIdx,
    challengerPairIdx: raund.challengerPairIdx,
    queueOrder: [...raund.queueOrder],
    pairs: buildPairLiveStatesWithRally(pairCount, stats, events),
    timerStartedAt: raund.startedAt,
    timerMinutes: raund.timerMinutes,
    status: raund.status,
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
          status = $7
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
  const state = applyUndo({
    pairCount: pairs.length,
    raundNo: raund.raundNo,
    seed: buildCourtSeed(round.seed, court.courtNo),
    timerMinutes: raund.timerMinutes,
    timerStartedAt: raund.startedAt,
    events: events.map((event) => ({ eventType: event.eventType })),
  });
  void tournament;
  await writeRaundStateTx(client, raund.raundId, state);
  return state;
}

function selectCurrentRaund(raunds: RaundRow[]): RaundRow | null {
  return raunds.find((row) => row.status === 'running') ?? raunds.find((row) => row.status === 'pending') ?? raunds[raunds.length - 1] ?? null;
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
  if (normalized === 'кин' || normalized === 'kin') return 'kin';
  if (normalized === 'аданс' || normalized === 'advance') return 'advance';
  if (normalized === 'медиум' || normalized === 'medium') return 'medium';
  if (normalized === 'лайт' || normalized === 'lite') return 'lite';
  return null;
}

function firstRallySeq(value: number | null | undefined): number {
  return Number.isFinite(value) && value != null ? value : Number.MAX_SAFE_INTEGER;
}

function compareAggregatePlayerRows(left: AggregatePlayerRow, right: AggregatePlayerRow): number {
  return (
    right.kingWins - left.kingWins ||
    right.bestKingStreak - left.bestKingStreak ||
    firstRallySeq(left.firstKingStreakSeq) - firstRallySeq(right.firstKingStreakSeq) ||
    right.takeovers - left.takeovers ||
    left.gamesPlayed - right.gamesPlayed ||
    left.sourcePairIdx - right.sourcePairIdx ||
    left.playerName.localeCompare(right.playerName, 'ru')
  );
}

function buildSeedDraftFromPlayerRows(summaryRows: AggregatePlayerRow[]): KotcNextR2SeedZone[] {
  type SeedRef = {
    courtNo: number;
    pairIdx: number;
    pairLabel: string;
    kingWins: number;
    bestKingStreak?: number;
    firstKingStreakSeq?: number | null;
    takeovers: number;
    gamesPlayed: number;
    playerId: string | null;
    playerName: string;
    playerGender: 'M' | 'W' | null;
  };
  type SeedZone = {
    zone: KotcNextZoneKey;
    pairRefs: SeedRef[];
  };

  const buildLineDraft = (line: 'primary' | 'secondary'): SeedZone[] => {
    const refs: SeedRef[] = summaryRows
      .filter((row) => row.line === line)
      .map((row) => ({
        courtNo: row.courtNo,
        pairIdx: row.sourcePairIdx,
        pairLabel: row.playerName,
        kingWins: row.kingWins,
        bestKingStreak: row.bestKingStreak,
        firstKingStreakSeq: row.firstKingStreakSeq,
        takeovers: row.takeovers,
        gamesPlayed: row.gamesPlayed,
        playerId: row.playerId,
        playerName: row.playerName,
        playerGender: row.playerGender,
      }));
    const seeded = seedKotcNextR2Courts(refs);
    return seeded.map((zone) => ({
      zone: zone.zone,
      pairRefs: zone.pairRefs.map((ref) => {
        const matched = refs.find((row) => row.courtNo === ref.courtNo && row.pairIdx === ref.pairIdx);
        return {
          courtNo: ref.courtNo,
          pairIdx: ref.pairIdx,
          pairLabel: ref.pairLabel,
          kingWins: ref.kingWins,
          bestKingStreak: ref.bestKingStreak ?? 0,
          firstKingStreakSeq: ref.firstKingStreakSeq ?? null,
          takeovers: ref.takeovers,
          gamesPlayed: ref.gamesPlayed ?? 0,
          playerId: matched?.playerId ?? null,
          playerName: matched?.playerName ?? ref.pairLabel,
          playerGender: matched?.playerGender ?? null,
        };
      }),
    }));
  };

  const primaryDraft = buildLineDraft('primary');
  const secondaryDraft = buildLineDraft('secondary');
  const secondaryByZone = new Map(secondaryDraft.map((zone) => [zone.zone, zone.pairRefs]));

  return primaryDraft.map((zone) => {
    const secondaryRefs = secondaryByZone.get(zone.zone) ?? [];
    const pairRefs = zone.pairRefs
      .map((primaryRef, index): KotcNextR2SeedZone['pairRefs'][number] | null => {
        const secondaryRef = secondaryRefs[index];
        if (!secondaryRef) return null;
        const bestKingStreak = Math.max(primaryRef.bestKingStreak ?? 0, secondaryRef.bestKingStreak ?? 0);
        const firstKingStreakSeq = [primaryRef.firstKingStreakSeq, secondaryRef.firstKingStreakSeq]
          .filter((value): value is number => Number.isFinite(value))
          .sort((left, right) => left - right)[0] ?? null;
        return {
          courtNo: primaryRef.courtNo,
          pairIdx: primaryRef.pairIdx,
          pairLabel: `${primaryRef.playerName ?? primaryRef.pairLabel} / ${secondaryRef.playerName ?? secondaryRef.pairLabel}`,
          kingWins: Math.round(((primaryRef.kingWins ?? 0) + (secondaryRef.kingWins ?? 0)) / 2),
          bestKingStreak,
          firstKingStreakSeq,
          takeovers: Math.round(((primaryRef.takeovers ?? 0) + (secondaryRef.takeovers ?? 0)) / 2),
          gamesPlayed: Math.round(((primaryRef.gamesPlayed ?? 0) + (secondaryRef.gamesPlayed ?? 0)) / 2),
          primaryPlayerId: primaryRef.playerId ?? null,
          primaryPlayerName: primaryRef.playerName ?? primaryRef.pairLabel,
          primaryGender: primaryRef.playerGender ?? null,
          secondaryPlayerId: secondaryRef.playerId ?? null,
          secondaryPlayerName: secondaryRef.playerName ?? secondaryRef.pairLabel,
          secondaryGender: secondaryRef.playerGender ?? null,
        };
      })
      .filter((ref): ref is KotcNextR2SeedZone['pairRefs'][number] => Boolean(ref));

    return {
      zone: zone.zone,
      pairRefs,
    };
  });
}

function buildR2ZoneMap(summaryRows: AggregatePlayerRow[]): Map<string, KotcNextZoneKey> {
  const draft = buildSeedDraftFromPlayerRows(summaryRows);
  const zoneMap = new Map<string, KotcNextZoneKey>();
  for (const zone of draft) {
    for (const ref of zone.pairRefs) {
      if (ref.primaryPlayerId) zoneMap.set(ref.primaryPlayerId, zone.zone);
      if (ref.secondaryPlayerId) zoneMap.set(ref.secondaryPlayerId, zone.zone);
    }
  }
  return zoneMap;
}

async function loadAggregatePlayerRowsTx(client: PoolClient, round: RoundRow): Promise<AggregatePlayerRow[]> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const result: AggregatePlayerRow[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    if (!pairs.length) continue;

    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const zone = zoneFromCourtLabel(court.label);

    const totals = new Map<string, AggregatePlayerRow>();
    pairs.forEach((pair, index) => {
      totals.set(`primary:${pair.pairIdx}`, {
        courtId: court.courtId,
        courtNo: court.courtNo,
        courtLabel: court.label,
        line: 'primary',
        sourcePairIdx: pair.pairIdx,
        playerId: pair.primaryPlayerId,
        playerName: pair.primaryPlayerName,
        playerGender: pair.primaryGender,
        kingWins: 0,
        bestKingStreak: 0,
        firstKingStreakSeq: null,
        takeovers: 0,
        gamesPlayed: 0,
        position: index + 1,
        zone,
      });
      totals.set(`secondary:${pair.pairIdx}`, {
        courtId: court.courtId,
        courtNo: court.courtNo,
        courtLabel: court.label,
        line: 'secondary',
        sourcePairIdx: pair.pairIdx,
        playerId: pair.secondaryPlayerId,
        playerName: pair.secondaryPlayerName,
        playerGender: pair.secondaryGender,
        kingWins: 0,
        bestKingStreak: 0,
        firstKingStreakSeq: null,
        takeovers: 0,
        gamesPlayed: 0,
        position: index + 1,
        zone,
      });
    });

    for (const raund of raunds) {
      const stats = await listRaundStatsTx(client, raund.raundId);
      const events = await listGameEventsTx(client, raund.raundId);
      const liveRows = buildPairLiveStatesWithRally(pairs.length, stats, events);
      const liveByPair = new Map(liveRows.map((row) => [row.pairIdx, row]));
      const resolvedPairs = resolvePairsForRaund(pairs, raund.raundNo);

      for (const resolved of resolvedPairs) {
        const live = liveByPair.get(resolved.pairIdx);
        if (!live) continue;
        const updates = [
          {
            key: `primary:${resolved.primarySourcePairIdx}`,
            playerId: resolved.primaryPlayerId,
            playerName: resolved.primaryPlayerName,
            playerGender: resolved.primaryGender,
          },
          {
            key: `secondary:${resolved.secondarySourcePairIdx}`,
            playerId: resolved.secondaryPlayerId,
            playerName: resolved.secondaryPlayerName,
            playerGender: resolved.secondaryGender,
          },
        ];
        for (const update of updates) {
          const target = totals.get(update.key);
          if (!target) continue;
          target.playerId = update.playerId;
          target.playerName = update.playerName;
          target.playerGender = update.playerGender;
          target.kingWins += live.kingWins;
          target.takeovers += live.takeovers;
          target.gamesPlayed += live.gamesPlayed;
          target.bestKingStreak = Math.max(target.bestKingStreak, live.bestKingStreak ?? 0);
          if (Number.isFinite(live.firstKingStreakSeq) && live.firstKingStreakSeq != null) {
            const globalSeq = raund.raundNo * 1_000_000 + Number(live.firstKingStreakSeq);
            target.firstKingStreakSeq =
              target.firstKingStreakSeq == null ? globalSeq : Math.min(target.firstKingStreakSeq, globalSeq);
          }
        }
      }
    }

    for (const line of ['primary', 'secondary'] as const) {
      const ranked = [...totals.values()]
        .filter((row) => row.line === line)
        .sort(compareAggregatePlayerRows)
        .map((row, index) => ({
          ...row,
          position: index + 1,
        }));
      result.push(...ranked);
    }
  }

  return result;
}

function buildAggregatePairRowsFromPlayers(summaryRows: AggregatePlayerRow[]): AggregatePairRow[] {
  const grouped = new Map<string, { primary: AggregatePlayerRow[]; secondary: AggregatePlayerRow[]; courtId: string; courtNo: number; courtLabel: string; zone: KotcNextZoneKey | null }>();

  for (const row of summaryRows) {
    const groupKey = `${row.zone ?? 'none'}:${row.courtNo}`;
    const group = grouped.get(groupKey) ?? {
      primary: [],
      secondary: [],
      courtId: row.courtId,
      courtNo: row.courtNo,
      courtLabel: row.courtLabel,
      zone: row.zone,
    };
    if (row.line === 'primary') group.primary.push(row);
    else group.secondary.push(row);
    grouped.set(groupKey, group);
  }

  const pairs: AggregatePairRow[] = [];
  for (const group of grouped.values()) {
    const primary = [...group.primary].sort((left, right) => left.position - right.position);
    const secondary = [...group.secondary].sort((left, right) => left.position - right.position);
    const count = Math.min(primary.length, secondary.length);
    for (let index = 0; index < count; index += 1) {
      const left = primary[index];
      const right = secondary[index];
      const firstSeq = [left.firstKingStreakSeq, right.firstKingStreakSeq]
        .filter((value): value is number => Number.isFinite(value))
        .sort((a, b) => a - b)[0] ?? null;
      pairs.push({
        courtId: group.courtId,
        courtNo: group.courtNo,
        courtLabel: group.courtLabel,
        pairIdx: index,
        pairLabel: `${left.playerName} / ${right.playerName}`,
        primaryPlayerId: left.playerId,
        primaryPlayerName: left.playerName,
        primaryGender: left.playerGender,
        secondaryPlayerId: right.playerId,
        secondaryPlayerName: right.playerName,
        secondaryGender: right.playerGender,
        kingWins: Math.round((left.kingWins + right.kingWins) / 2),
        bestKingStreak: Math.max(left.bestKingStreak, right.bestKingStreak),
        firstKingStreakSeq: firstSeq,
        takeovers: Math.round((left.takeovers + right.takeovers) / 2),
        gamesPlayed: Math.round((left.gamesPlayed + right.gamesPlayed) / 2),
        position: index + 1,
        zone: group.zone,
      });
    }
  }

  return pairs;
}

async function persistPlayerRoundStatsTx(client: PoolClient, round: RoundRow, summaryRows: AggregatePlayerRow[]): Promise<void> {
  await client.query(`DELETE FROM kotcn_player_round_stat WHERE round_id = $1`, [round.roundId]);
  const r1ZoneMap = round.roundNo === 1 ? buildR2ZoneMap(summaryRows) : new Map<string, KotcNextZoneKey>();

  for (const row of summaryRows) {
    if (!row.playerId || !row.playerName.trim()) continue;
    const zone = round.roundNo === 2 ? row.zone : r1ZoneMap.get(row.playerId) ?? null;
    await client.query(
      `
        INSERT INTO kotcn_player_round_stat (
          round_id, player_id, pair_idx, king_wins, takeovers, games_played, position, zone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [round.roundId, row.playerId, row.sourcePairIdx, row.kingWins, row.takeovers, row.gamesPlayed, row.position, zone],
    );
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
  clearedSignature: boolean;
}> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  return withTransaction((client) => resetKotcNextStateTx(client, normalizedId));
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
  clearedSignature: boolean;
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
    clearedSignature: normalizeKotcJudgeBootstrapSignature(
      tournament.settings.kotcJudgeBootstrapSignature ?? tournament.settings.kotcJudgeBootstrapSig,
    ) != null || tournament.kotcJudgeBootstrapSig != null,
  };
}

async function syncKotcNextResultsToTournamentResults(tournamentId: string): Promise<number> {
  const state = await getKotcNextOperatorStateSummary(tournamentId);
  if (!state || state.stage !== 'r2_finished' || !state.finalResults?.length) {
    return 0;
  }

  const playerResults: Array<{ playerName: string; gender: 'M' | 'W'; placement: number; points: number }> = [];
  let placement = 1;

  const sortedZones = [...state.finalResults].sort(
    (left, right) => ZONE_ORDER.indexOf(left.zone) - ZONE_ORDER.indexOf(right.zone),
  );
  for (const zone of sortedZones) {
    for (const pair of zone.pairs) {
      const names = pair.pairLabel.split(' / ').map((part) => part.trim()).filter(Boolean);
      if (pair.primaryPlayerId) {
        playerResults.push({
          playerName: names[0] || pair.pairLabel,
          gender: 'M',
          placement,
          points: pair.kingWins,
        });
      }
      if (pair.secondaryPlayerId) {
        playerResults.push({
          playerName: names[1] || names[0] || pair.pairLabel,
          gender: 'W',
          placement,
          points: pair.kingWins,
        });
      }
      placement += 1;
    }
  }

  return upsertTournamentResults(tournamentId, playerResults);
}

async function finalizeRoundIfReadyTx(
  client: PoolClient,
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
  await persistPlayerRoundStatsTx(client, round, await loadAggregatePlayerRowsTx(client, round));
  return { roundFinished: true, shouldPublishResults: round.roundNo === 2 };
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

  const refIdentity = (ref: KotcNextR2SeedZone['pairRefs'][number]): string => {
    const primaryId = String(ref.primaryPlayerId ?? '').trim();
    const secondaryId = String(ref.secondaryPlayerId ?? '').trim();
    if (primaryId || secondaryId) {
      return `${asInt(ref.courtNo, 0)}:${asInt(ref.pairIdx, -1)}:${primaryId}:${secondaryId}`;
    }
    return `${asInt(ref.courtNo, 0)}:${asInt(ref.pairIdx, -1)}:${String(ref.pairLabel || '').trim()}`;
  };

  const refByKey = new Map<string, KotcNextR2SeedZone['pairRefs'][number]>(
    draft.flatMap((zone) =>
      zone.pairRefs.map((ref) => [refIdentity(ref), ref] as const),
    ),
  );

  const normalized: KotcNextR2SeedZone[] = input.map((zoneInput) => {
    if (!zoneInput || typeof zoneInput !== 'object' || Array.isArray(zoneInput)) {
      throw new KotcNextError(400, 'Invalid R2 seed payload');
    }
    const zone = String((zoneInput as { zone?: unknown }).zone || '').trim().toLowerCase() as KotcNextZoneKey;
    const refs = Array.isArray((zoneInput as { pairRefs?: unknown }).pairRefs)
      ? (zoneInput as { pairRefs: Array<Record<string, unknown>> }).pairRefs
      : [];
    return {
      zone,
      pairRefs: refs.map((ref) => {
        const key = refIdentity(ref as KotcNextR2SeedZone['pairRefs'][number]);
        const draftRef = refByKey.get(key);
        if (!draftRef) {
          throw new KotcNextError(409, 'R2 seed payload no longer matches the draft');
        }
        return draftRef;
      }),
    };
  });

  const normalizedKeys = normalized.flatMap((zone) => zone.pairRefs.map((ref) => refIdentity(ref))).sort();
  const draftKeys = draft.flatMap((zone) => zone.pairRefs.map((ref) => refIdentity(ref))).sort();
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

async function setCourtStatusTx(client: PoolClient, courtId: string, status: KotcNextCourtStatus): Promise<void> {
  await client.query(`UPDATE kotcn_court SET status = $2 WHERE id = $1`, [courtId, status]);
}

async function startRaundTx(client: PoolClient, pin: string, raundNo: number): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  const roundCourts = await listCourtsByRoundTx(client, target.round.roundId);
  const startTargets: Array<{ court: CourtRow; raund: RaundRow }> = [];

  for (const court of roundCourts) {
    const courtRaund = await loadRaundByCourtAndNoTx(client, court.courtId, raundNo, { forUpdate: true });
    if (!courtRaund) {
      throw new KotcNextError(409, `Court ${court.label || `K${court.courtNo}`} has no raund ${raundNo}`);
    }
    if (courtRaund.status === 'finished') {
      throw new KotcNextError(423, `Raund ${raundNo} is already finished on ${court.label || `K${court.courtNo}`}`);
    }
    startTargets.push({ court, raund: courtRaund });
  }

  const runningStartedAt = startTargets
    .filter((entry) => entry.raund.status === 'running' && entry.raund.startedAt)
    .map((entry) => entry.raund.startedAt as string);
  const synchronizedStartedAt =
    runningStartedAt.sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ??
    new Date().toISOString();

  for (const entry of startTargets) {
    if (entry.raund.status === 'running') {
      await setCourtStatusTx(client, entry.court.courtId, 'live');
      continue;
    }

    const previous = await listRaundsByCourtTx(client, entry.court.courtId);
    const blockingRaund = previous.find((row) => row.raundNo < raundNo && row.status !== 'finished');
    if (blockingRaund) {
      throw new KotcNextError(
        409,
        `Finish raund ${blockingRaund.raundNo} on ${entry.court.label || `K${entry.court.courtNo}`} before starting the next one`,
      );
    }

    const state = buildInitialState(
      target.tournament,
      target.round,
      entry.court,
      raundNo,
      synchronizedStartedAt,
    );
    await writeRaundStateTx(client, entry.raund.raundId, {
      ...state,
      status: 'running',
    });
    await setCourtStatusTx(client, entry.court.courtId, 'live');
  }

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function recordEventTx(
  client: PoolClient,
  pin: string,
  raundNo: number,
  eventType: 'king_point' | 'takeover',
): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (target.raund.status !== 'running' || !target.raund.startedAt) {
    throw new KotcNextError(409, 'Raund is not running');
  }

  const currentState = buildLiveState(target.pairs.length, target.raund, target.stats, target.events);
  const nextState = eventType === 'takeover' ? applyTakeover(currentState) : applyKingPoint(currentState);
  const nextSeqNo = (target.events[target.events.length - 1]?.seqNo ?? 0) + 1;

  await client.query(
    `
      INSERT INTO kotcn_game (raund_id, seq_no, event_type, king_pair_idx, challenger_pair_idx)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [target.raund.raundId, nextSeqNo, eventType, currentState.kingPairIdx, currentState.challengerPairIdx],
  );
  await writeRaundStateTx(client, target.raund.raundId, nextState);
  await setCourtStatusTx(client, target.court.courtId, 'live');

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
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }

  const currentState = buildLiveState(target.pairs.length, target.raund, target.stats, target.events);
  const nextState = applyManualPairSwitch(currentState, slot, direction);
  await writeRaundStateTx(client, target.raund.raundId, nextState);
  await setCourtStatusTx(client, target.court.courtId, nextState.status === 'running' ? 'live' : 'pending');

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
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  const lastEvent = target.events[target.events.length - 1];
  if (!lastEvent) {
    throw new KotcNextError(400, 'There are no game events to undo');
  }

  await client.query(`DELETE FROM kotcn_game WHERE id = $1`, [lastEvent.id]);
  await recomputeRaundFromEventsTx(client, target.tournament, target.round, target.court, target.raund, target.pairs, target.events.slice(0, -1));

  return { tournamentId: target.tournament.id, pin, publishResults: false };
}

async function finishRaundTx(client: PoolClient, pin: string, raundNo: number): Promise<JudgeMutationResult> {
  const target = await loadActionTargetTx(client, pin, raundNo);
  if (target.raund.status === 'finished') {
    throw new KotcNextError(423, 'Raund already finished');
  }
  if (!target.raund.startedAt) {
    throw new KotcNextError(409, 'Raund has not been started');
  }

  await client.query(
    `
      UPDATE kotcn_raund
      SET status = 'finished',
          finished_at = now()
      WHERE id = $1
    `,
    [target.raund.raundId],
  );

  const remaining = await listRaundsByCourtTx(client, target.court.courtId);
  const hasPending = remaining.some((row) => row.raundNo !== raundNo && row.status !== 'finished');
  await setCourtStatusTx(client, target.court.courtId, hasPending ? 'pending' : 'finished');
  const finalization = await finalizeRoundIfReadyTx(client, target.round);

  return {
    tournamentId: target.tournament.id,
    pin,
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
    return buildSeedDraftFromPlayerRows(await loadAggregatePlayerRowsTx(client, r1));
  });
}

export async function bootstrapKotcNextR2(
  tournamentId: string,
  options?: { seed?: number; zones?: unknown },
): Promise<KotcNextOperatorState> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) throw new KotcNextError(400, 'tournamentId is required');

  await withTransaction(async (client) => {
    if (await loadRoundByNoTx(client, normalizedId, 2, { forUpdate: true })) {
      throw new KotcNextError(409, 'KOTC Next R2 already exists');
    }
    const r1 = await loadRoundByNoTx(client, normalizedId, 1, { forUpdate: true });
    if (!r1 || r1.status !== 'finished') {
      throw new KotcNextError(409, 'Finish R1 before bootstrapping R2');
    }

    const { tournament, roster } = await hydrateTournamentTx(client, normalizedId, { forUpdate: true });
    ensureKotcNextTournament(tournament, roster);

    const draft = await getKotcNextR2SeedDraft(normalizedId);
    const selectedZones = normalizeSeedDraftInput(options?.zones, draft);

    await bootstrapRoundTx(client, tournament, 2, {
      seed: Math.max(1, asInt(options?.seed, r1.seed + 1)),
      labelByCourt: (courtNo) => zoneLabel(selectedZones[courtNo - 1]?.zone ?? 'lite'),
      pairSources: selectedZones.map((zone, index) => ({
        courtNo: index + 1,
        pairs: zone.pairRefs.map((ref) => {
          if (!ref.primaryPlayerName || !ref.secondaryPlayerName) {
            throw new KotcNextError(409, 'R2 draft can no longer be materialized');
          }
          return {
            primaryPlayerId: ref.primaryPlayerId ?? null,
            primaryPlayerName: ref.primaryPlayerName,
            secondaryPlayerId: ref.secondaryPlayerId ?? null,
            secondaryPlayerName: ref.secondaryPlayerName,
            primaryGender: ref.primaryGender ?? null,
            secondaryGender: ref.secondaryGender ?? null,
          };
        }),
      })),
    });
  });

  return (await getKotcNextOperatorStateSummary(normalizedId))!;
}

export async function getKotcNextJudgeSnapshotByPin(pin: string): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  if (!normalizedPin) {
    throw new KotcNextError(400, 'pin is required');
  }

  return withClient(async (client) => {
    const { tournament, round, court } = await loadCourtByPinTx(client, normalizedPin);
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
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

    const currentRaund = selectCurrentRaund(raunds) ?? raunds[0];
    const currentStats = await listRaundStatsTx(client, currentRaund.raundId);
    const currentEvents = await listGameEventsTx(client, currentRaund.raundId);
    const raundHistory: KotcNextRaundHistoryEntry[] = [];

    for (const raund of raunds) {
      const raundEvents = await listGameEventsTx(client, raund.raundId);
      raundHistory.push({
        raundNo: raund.raundNo,
        status: raund.status,
        standings: calcKotcNextRaundStandings(
          buildPairLiveStatesWithRally(
            pairs.length,
            await listRaundStatsTx(client, raund.raundId),
            raundEvents,
          ),
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
      pairs: buildPairViews(resolvePairsForRaund(pairs, currentRaund.raundNo)),
      liveState: buildLiveState(pairs.length, currentRaund, currentStats, currentEvents),
      roundNav,
      courtNav,
      raundHistory,
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

export async function finishKotcNextRaund(pin: string, raundNo: number): Promise<KotcNextJudgeSnapshot> {
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const normalizedRaundNo = Math.max(1, asInt(raundNo, 0));
  if (!normalizedPin) throw new KotcNextError(400, 'pin is required');
  if (!normalizedRaundNo) throw new KotcNextError(400, 'raundNo is required');

  const result = await withTransaction((client) => finishRaundTx(client, normalizedPin, normalizedRaundNo));
  const { persistKotcNextSpectatorSnapshot } = await import('./spectator');
  void persistKotcNextSpectatorSnapshot(result.tournamentId).catch(() => {});
  if (result.publishResults) {
    await syncKotcNextResultsToTournamentResults(result.tournamentId);
  }
  return getKotcNextJudgeSnapshotByPin(normalizedPin);
}

async function buildRoundViewTx(client: PoolClient, round: RoundRow): Promise<KotcNextOperatorRoundView> {
  const courts = await listCourtsByRoundTx(client, round.roundId);
  const courtViews: KotcNextCourtOperatorView[] = [];

  for (const court of courts) {
    const pairs = await listPairsByCourtTx(client, court.courtId);
    const raunds = await listRaundsByCourtTx(client, court.courtId);
    const progress: KotcNextCourtRaundProgress[] = [];

    for (const raund of raunds) {
      const raundEvents = await listGameEventsTx(client, raund.raundId);
      progress.push({
        raundNo: raund.raundNo,
        status: raund.status,
        startedAt: raund.startedAt,
        finishedAt: raund.finishedAt,
        standings: raund.status === 'finished'
          ? calcKotcNextRaundStandings(
              buildPairLiveStatesWithRally(
                pairs.length,
                await listRaundStatsTx(client, raund.raundId),
                raundEvents,
              ),
            )
          : null,
      });
    }

    const currentRaund = selectCurrentRaund(raunds);
    const liveState =
      currentRaund == null
        ? null
        : buildLiveState(
            pairs.length,
            currentRaund,
            await listRaundStatsTx(client, currentRaund.raundId),
            await listGameEventsTx(client, currentRaund.raundId),
          );
    const status: KotcNextCourtStatus =
      raunds.length && raunds.every((row) => row.status === 'finished')
        ? 'finished'
        : raunds.some((row) => row.status === 'running')
          ? 'live'
          : 'pending';
    const displayRaundNo = currentRaund?.raundNo ?? 1;

    courtViews.push({
      courtId: court.courtId,
      courtNo: court.courtNo,
      label: court.label,
      pinCode: court.pinCode,
      judgeUrl: judgeUrlForPin(court.pinCode),
      status,
      pairs: buildPairViews(resolvePairsForRaund(pairs, displayRaundNo)),
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
        secondaryPlayerId: row.secondaryPlayerId,
        kingWins: row.kingWins,
        bestKingStreak: row.bestKingStreak,
        firstKingStreakSeq: row.firstKingStreakSeq,
        takeovers: row.takeovers,
      })),
  }));
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
        finalResults: null,
        canBootstrapR1: true,
        canFinishR1: false,
        canPreviewR2Seed: false,
        canConfirmR2Seed: false,
        canBootstrapR2: false,
        canFinishR2: false,
      };
    }

    const roundViews: KotcNextOperatorRoundView[] = [];
    for (const round of rounds) {
      roundViews.push(await buildRoundViewTx(client, round));
    }

    const stage = buildStage(rounds);
    const r1 = rounds.find((row) => row.roundNo === 1) ?? null;
    const r2 = rounds.find((row) => row.roundNo === 2) ?? null;

    return {
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
      finalResults: r2?.status === 'finished'
        ? buildFinalResults(buildAggregatePairRowsFromPlayers(await loadAggregatePlayerRowsTx(client, r2)))
        : null,
      canBootstrapR1: !r1,
      canFinishR1: Boolean(r1 && r1.status === 'finished' && !r2),
      canPreviewR2Seed: Boolean(r1 && r1.status === 'finished' && !r2),
      canConfirmR2Seed: Boolean(r1 && r1.status === 'finished' && !r2),
      canBootstrapR2: Boolean(r1 && r1.status === 'finished' && !r2),
      canFinishR2: Boolean(r2 && r2.status === 'finished'),
    };
  });
}

export async function runKotcNextOperatorAction(
  tournamentId: string,
  action: KotcNextOperatorActionName,
  options?: { seed?: number; zones?: unknown },
): Promise<{ success: true; state: KotcNextOperatorState; r2SeedDraft?: KotcNextR2SeedZone[] }> {
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
  if (action === 'confirm_r2_seed' || action === 'bootstrap_r2') {
    return { success: true, state: await bootstrapKotcNextR2(normalizedId, options) };
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
