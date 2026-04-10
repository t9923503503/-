import { createHmac, randomUUID } from 'crypto';
import { readServerEnv } from './server-env';
import { getTournamentFormatCode } from './admin-tournament-db';
import {
  buildLegacyIptTournamentState,
  buildLegacyPlayerDbState,
  isKotcAdminFormat,
  isIptMixedFormat,
  normalizeKotcAdminSettings,
  type KotcJudgeModule,
} from './admin-legacy-sync';
import type {
  AdminPlayer,
  AdminTournament,
  AdminTournamentParticipantInput,
  ArchiveTournament,
  PlayerRequest,
  RosterParticipant,
  TempPlayer,
} from './admin-queries-pg';
import {
  effectiveRatingPtsFromStored,
  type RatingPool,
} from './rating-points';
import { sanitizeServerImageUrl } from './server-image-url';
import { augmentArchiveTournamentWithThaiBoard } from './thai-archive-meta';

type JsonObject = Record<string, unknown>;

type TournamentCapabilities = {
  photoUrl: boolean;
  settings: boolean;
  formatCode: boolean;
  externalId: boolean;
  gameState: boolean;
  syncedAt: boolean;
  kotcJudgeModule: boolean;
  kotcJudgeBootstrapSig: boolean;
  kotcRaundCount: boolean;
  kotcRaundTimerMinutes: boolean;
  kotcPpc: boolean;
};

type PlayerCapabilities = {
  ratingM: boolean;
  ratingW: boolean;
  ratingMix: boolean;
  wins: boolean;
  totalPts: boolean;
  tournamentsPlayed: boolean;
  photoUrl: boolean;
  birthDate: boolean;
  heightCm: boolean;
  weightKg: boolean;
  skillLevel: boolean;
  preferredPosition: boolean;
  mixReady: boolean;
  phone: boolean;
  telegram: boolean;
  adminComment: boolean;
};

type PlayerStatus = AdminPlayer['status'];
type PlayerSkillLevel = NonNullable<AdminPlayer['skillLevel']>;
type PlayerPreferredPosition = NonNullable<AdminPlayer['preferredPosition']>;

const PLAYER_STATUSES = new Set<PlayerStatus>(['active', 'temporary', 'inactive', 'injured', 'vacation']);
const PLAYER_SKILL_LEVELS = new Set<PlayerSkillLevel>(['light', 'medium', 'advanced', 'pro']);
const PLAYER_POSITIONS = new Set<PlayerPreferredPosition>(['attacker', 'defender', 'universal', 'setter', 'blocker']);

const PLAYER_DB_EXTERNAL_ID = '__playerdb__';
const capabilityCache = new Map<string, Promise<boolean>>();

function b64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

export function normalizeAdminApiBase(value: string): string {
  const base = String(value || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (base.endsWith('/rest/v1')) return base;
  if (base.endsWith('/api')) return `${base}/rest/v1`;
  return `${base}/rest/v1`;
}

export function createPostgrestAdminJwt(secret: string, role = 'authenticated'): string {
  const cleanSecret = String(secret || '').trim();
  if (!cleanSecret) return '';
  const header = b64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64UrlEncode(
    JSON.stringify({
      role,
      sub: 'next-admin-panel',
      is_admin: true,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    })
  );
  const signature = createHmac('sha256', cleanSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function readFirstServerEnv(names: string[]): string {
  for (const name of names) {
    const value = String(readServerEnv(name) || '').trim();
    if (value) return value;
  }
  return '';
}

function getAdminApiBase(): string {
  return normalizeAdminApiBase(
    readFirstServerEnv(['APP_API_BASE', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
  );
}

function getAdminApiKey(): string {
  return readFirstServerEnv([
    'APP_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]);
}

function getAdminBearerToken(): string {
  const explicitToken = readFirstServerEnv(['POSTGREST_ADMIN_TOKEN']);
  if (explicitToken) return explicitToken;

  const jwtSecret = readFirstServerEnv(['POSTGREST_JWT_SECRET']);
  if (!jwtSecret) return '';

  const role = readFirstServerEnv(['POSTGREST_ADMIN_ROLE']) || 'authenticated';
  return createPostgrestAdminJwt(jwtSecret, role);
}

export function hasAdminPostgrestConfig(): boolean {
  const base = getAdminApiBase();
  return Boolean(base && (getAdminBearerToken() || getAdminApiKey()));
}

function getAdminPostgrestConfig() {
  const restBase = getAdminApiBase();
  if (!restBase) {
    throw new Error('Missing admin server DB config: APP_API_BASE');
  }

  const bearerToken = getAdminBearerToken();
  const apiKey = getAdminApiKey();
  if (!bearerToken && !apiKey) {
    throw new Error(
      'Missing admin server DB auth: set POSTGREST_JWT_SECRET, POSTGREST_ADMIN_TOKEN, or APP_SUPABASE_ANON_KEY'
    );
  }

  return {
    restBase,
    bearerToken,
    apiKey,
  };
}

function buildAuthHeaders(extra?: HeadersInit): Headers {
  const cfg = getAdminPostgrestConfig();
  const headers = new Headers(extra);
  headers.set('Accept', 'application/json');
  if (cfg.apiKey) {
    headers.set('apikey', cfg.apiKey);
  }
  if (cfg.bearerToken) {
    headers.set('Authorization', `Bearer ${cfg.bearerToken}`);
  } else if (cfg.apiKey) {
    headers.set('Authorization', `Bearer ${cfg.apiKey}`);
  }
  return headers;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatRemoteError(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (payload && typeof payload === 'object') {
    const data = payload as JsonObject;
    const message = String(data.message ?? data.error ?? data.hint ?? data.details ?? '').trim();
    if (message) return message;
  }
  return fallback;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: { allow404?: boolean } = {}
): Promise<T> {
  const headers = buildAuthHeaders(init.headers);
  if (init.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const cfg = getAdminPostgrestConfig();
  const res = await fetch(`${cfg.restBase}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  });

  if (options.allow404 && res.status === 404) {
    return null as T;
  }

  const text = await res.text();
  const payload = text ? safeParseJson(text) : null;
  if (!res.ok) {
    if (options.allow404 && payload == null) {
      return null as T;
    }
    throw new Error(formatRemoteError(payload, `Remote request failed (${res.status})`));
  }

  return payload as T;
}

async function requestNoContent(path: string, init: RequestInit = {}): Promise<void> {
  const headers = buildAuthHeaders(init.headers);
  if (init.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const cfg = getAdminPostgrestConfig();
  const res = await fetch(`${cfg.restBase}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatRemoteError(text ? safeParseJson(text) : null, `Remote request failed (${res.status})`));
  }
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  if (value && typeof value === 'object') return value as T;
  return null;
}

function toIsoDate(value: unknown): string {
  if (!value) return '';
  const raw = String(value);
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function toUiTime(value: unknown): string {
  if (!value) return '';
  const raw = String(value).trim();
  return /^\d{2}:\d{2}:\d{2}$/.test(raw) ? raw.slice(0, 5) : raw;
}

function mapTournament(row: JsonObject | null, participantCount = 0): AdminTournament {
  const source = row ?? {};
  const baseSettings =
    source.settings && typeof source.settings === 'object'
      ? (source.settings as Record<string, unknown>)
      : {};
  const format = String(source.format ?? '');
  const kotc =
    isKotcAdminFormat(format)
      ? normalizeKotcAdminSettings({
          ...baseSettings,
          kotcJudgeModule: source.kotc_judge_module ?? baseSettings.kotcJudgeModule,
          kotcJudgeBootstrapSignature:
            source.kotc_judge_bootstrap_sig ?? baseSettings.kotcJudgeBootstrapSignature,
          kotcRaundCount: source.kotc_raund_count ?? baseSettings.kotcRaundCount,
          kotcRaundTimerMinutes:
            source.kotc_raund_timer_minutes ?? baseSettings.kotcRaundTimerMinutes,
          kotcPpc: source.kotc_ppc ?? baseSettings.kotcPpc,
        })
      : null;
  return {
    id: String(source.id ?? ''),
    name: String(source.name ?? ''),
    date: toIsoDate(source.date),
    time: toUiTime(source.time),
    location: String(source.location ?? ''),
    format: String(source.format ?? ''),
    division: String(source.division ?? ''),
    level: String(source.level ?? ''),
    capacity: Number(source.capacity ?? 0),
    status: String(source.status ?? 'open'),
    participantCount,
    photoUrl: sanitizeServerImageUrl(source.photo_url),
    settings: kotc ? { ...baseSettings, ...kotc } : baseSettings,
    kotcJudgeModule: (kotc?.kotcJudgeModule ?? null) as KotcJudgeModule | null,
    kotcJudgeBootstrapSig: kotc?.kotcJudgeBootstrapSignature ?? null,
    kotcRaundCount: kotc?.raundCount ?? null,
    kotcRaundTimerMinutes: kotc?.raundTimerMinutes ?? null,
    kotcPpc: kotc?.ppc ?? null,
  };
}

function mapPlayer(row: JsonObject | null): AdminPlayer {
  const source = row ?? {};
  const status = String(source.status ?? 'active') as PlayerStatus;
  const skillLevel = String(source.skill_level ?? '') as PlayerSkillLevel;
  const preferredPosition = String(source.preferred_position ?? '') as PlayerPreferredPosition;
  return {
    id: String(source.id ?? ''),
    name: String(source.name ?? ''),
    gender: String(source.gender ?? 'M') === 'W' ? 'W' : 'M',
    status: PLAYER_STATUSES.has(status) ? status : 'active',
    ratingM: Number(source.rating_m ?? 0),
    ratingW: Number(source.rating_w ?? 0),
    ratingMix: Number(source.rating_mix ?? 0),
    wins: Number(source.wins ?? 0),
    totalPts: Number(source.total_pts ?? 0),
    tournamentsPlayed: Number(source.tournaments_played ?? 0),
    photoUrl: sanitizeServerImageUrl(source.photo_url),
    birthDate: toIsoDate(source.birth_date),
    heightCm: source.height_cm == null ? null : Number(source.height_cm),
    weightKg: source.weight_kg == null ? null : Number(source.weight_kg),
    skillLevel: PLAYER_SKILL_LEVELS.has(skillLevel) ? skillLevel : null,
    preferredPosition: PLAYER_POSITIONS.has(preferredPosition) ? preferredPosition : null,
    mixReady: Boolean(source.mix_ready),
    phone: String(source.phone ?? ''),
    telegram: String(source.telegram ?? ''),
    adminComment: String(source.admin_comment ?? ''),
  };
}

function mapFilterPreset(row: JsonObject | null) {
  const source = row ?? {};
  return {
    id: String(source.id ?? ''),
    actorId: String(source.actor_id ?? ''),
    name: String(source.name ?? ''),
    scope: String(source.scope ?? ''),
    filters:
      source.filters && typeof source.filters === 'object' && !Array.isArray(source.filters)
        ? (source.filters as Record<string, unknown>)
        : {},
    createdAt: source.created_at ? String(source.created_at) : '',
    updatedAt: source.updated_at ? String(source.updated_at) : '',
  };
}

function mapRosterParticipant(row: JsonObject | null): RosterParticipant {
  const source = row ?? {};
  const player = source.players && typeof source.players === 'object' ? (source.players as JsonObject) : {};
  return {
    id: String(source.id ?? ''),
    playerId: String(source.player_id ?? ''),
    playerName: String(player.name ?? ''),
    gender: String(player.gender ?? 'M') === 'W' ? 'W' : 'M',
    isWaitlist: Boolean(source.is_waitlist),
    position: Number(source.position ?? 0),
    registeredAt: String(source.registered_at ?? ''),
  };
}

function mapPlayerRequest(row: JsonObject | null): PlayerRequest {
  const source = row ?? {};
  const tournament =
    source.tournaments && typeof source.tournaments === 'object'
      ? (source.tournaments as JsonObject)
      : {};
  const status = String(source.status ?? 'pending');
  return {
    id: String(source.id ?? ''),
    name: String(source.name ?? ''),
    gender: String(source.gender ?? ''),
    phone: String(source.phone ?? ''),
    tournamentId: String(source.tournament_id ?? ''),
    tournamentName: String(tournament.name ?? ''),
    status:
      status === 'approved' || status === 'rejected'
        ? status
        : 'pending',
    createdAt: String(source.created_at ?? ''),
    reviewedAt: source.reviewed_at ? String(source.reviewed_at) : null,
  };
}

async function probeColumn(table: string, column: string): Promise<boolean> {
  const cacheKey = `${table}.${column}`;
  let promise = capabilityCache.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      try {
        await requestJson<unknown>(
          `/${table}?select=${encodeURIComponent(column)}&limit=1`
        );
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/column|select|schema cache/i.test(message) && message.includes(column)) {
          return false;
        }
        throw error;
      }
    })();
    capabilityCache.set(cacheKey, promise);
  }
  return promise;
}

async function getTournamentCapabilities(): Promise<TournamentCapabilities> {
  return {
    photoUrl: await probeColumn('tournaments', 'photo_url'),
    settings: await probeColumn('tournaments', 'settings'),
    formatCode: await probeColumn('tournaments', 'format_code'),
    externalId: await probeColumn('tournaments', 'external_id'),
    gameState: await probeColumn('tournaments', 'game_state'),
    syncedAt: await probeColumn('tournaments', 'synced_at'),
    kotcJudgeModule: await probeColumn('tournaments', 'kotc_judge_module'),
    kotcJudgeBootstrapSig: await probeColumn('tournaments', 'kotc_judge_bootstrap_sig'),
    kotcRaundCount: await probeColumn('tournaments', 'kotc_raund_count'),
    kotcRaundTimerMinutes: await probeColumn('tournaments', 'kotc_raund_timer_minutes'),
    kotcPpc: await probeColumn('tournaments', 'kotc_ppc'),
  };
}

async function getPlayerCapabilities(): Promise<PlayerCapabilities> {
  return {
    ratingM: await probeColumn('players', 'rating_m'),
    ratingW: await probeColumn('players', 'rating_w'),
    ratingMix: await probeColumn('players', 'rating_mix'),
    wins: await probeColumn('players', 'wins'),
    totalPts: await probeColumn('players', 'total_pts'),
    tournamentsPlayed: await probeColumn('players', 'tournaments_played'),
    photoUrl: await probeColumn('players', 'photo_url'),
    birthDate: await probeColumn('players', 'birth_date'),
    heightCm: await probeColumn('players', 'height_cm'),
    weightKg: await probeColumn('players', 'weight_kg'),
    skillLevel: await probeColumn('players', 'skill_level'),
    preferredPosition: await probeColumn('players', 'preferred_position'),
    mixReady: await probeColumn('players', 'mix_ready'),
    phone: await probeColumn('players', 'phone'),
    telegram: await probeColumn('players', 'telegram'),
    adminComment: await probeColumn('players', 'admin_comment'),
  };
}

function buildPlayerSelect(caps: PlayerCapabilities): string {
  return [
    'id',
    'name',
    'gender',
    'status',
    ...(caps.ratingM ? ['rating_m'] : []),
    ...(caps.ratingW ? ['rating_w'] : []),
    ...(caps.ratingMix ? ['rating_mix'] : []),
    ...(caps.wins ? ['wins'] : []),
    ...(caps.totalPts ? ['total_pts'] : []),
    ...(caps.tournamentsPlayed ? ['tournaments_played'] : []),
    ...(caps.photoUrl ? ['photo_url'] : []),
    ...(caps.birthDate ? ['birth_date'] : []),
    ...(caps.heightCm ? ['height_cm'] : []),
    ...(caps.weightKg ? ['weight_kg'] : []),
    ...(caps.skillLevel ? ['skill_level'] : []),
    ...(caps.preferredPosition ? ['preferred_position'] : []),
    ...(caps.mixReady ? ['mix_ready'] : []),
    ...(caps.phone ? ['phone'] : []),
    ...(caps.telegram ? ['telegram'] : []),
    ...(caps.adminComment ? ['admin_comment'] : []),
  ].join(',');
}

function playerPayload(input: Partial<AdminPlayer>, caps: PlayerCapabilities): JsonObject {
  const skillLevel = String(input.skillLevel ?? '').trim();
  const preferredPosition = String(input.preferredPosition ?? '').trim();
  const payload: JsonObject = {
    name: String(input.name || '').trim(),
    gender: String(input.gender || 'M') === 'W' ? 'W' : 'M',
    status: PLAYER_STATUSES.has(input.status as PlayerStatus) ? input.status : 'active',
  };
  if (caps.ratingM) payload.rating_m = Number(input.ratingM || 0);
  if (caps.ratingW) payload.rating_w = Number(input.ratingW || 0);
  if (caps.ratingMix) payload.rating_mix = Number(input.ratingMix || 0);
  if (caps.wins) payload.wins = Number(input.wins || 0);
  if (caps.totalPts) payload.total_pts = Number(input.totalPts || 0);
  if (caps.tournamentsPlayed) payload.tournaments_played = Number(input.tournamentsPlayed || 0);
  if (caps.photoUrl) payload.photo_url = String(input.photoUrl || '').trim() || null;
  if (caps.birthDate) payload.birth_date = String(input.birthDate || '').trim() || null;
  if (caps.heightCm) payload.height_cm = input.heightCm == null || input.heightCm === 0 ? null : Number(input.heightCm);
  if (caps.weightKg) payload.weight_kg = input.weightKg == null || input.weightKg === 0 ? null : Number(input.weightKg);
  if (caps.skillLevel) payload.skill_level = PLAYER_SKILL_LEVELS.has(skillLevel as PlayerSkillLevel) ? skillLevel : null;
  if (caps.preferredPosition) {
    payload.preferred_position = PLAYER_POSITIONS.has(preferredPosition as PlayerPreferredPosition)
      ? preferredPosition
      : null;
  }
  if (caps.mixReady) payload.mix_ready = Boolean(input.mixReady);
  if (caps.phone) payload.phone = String(input.phone || '').trim() || null;
  if (caps.telegram) payload.telegram = String(input.telegram || '').trim() || null;
  if (caps.adminComment) payload.admin_comment = String(input.adminComment || '').trim() || null;
  return payload;
}

function encodeInFilter(ids: string[]): string {
  return `(${ids.map((id) => encodeURIComponent(id)).join(',')})`;
}

async function fetchParticipantCounts(tournamentIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tournamentIds.length === 0) return counts;
  const rows = await requestJson<JsonObject[]>(
    `/tournament_participants?select=tournament_id&tournament_id=in.${encodeInFilter(tournamentIds)}&limit=5000`
  );
  for (const row of rows ?? []) {
    const tournamentId = String(row.tournament_id ?? '');
    if (!tournamentId) continue;
    counts.set(tournamentId, Number(counts.get(tournamentId) ?? 0) + 1);
  }
  return counts;
}

async function listTournamentPlayersForLegacy(tournamentId: string) {
  const playerCaps = await getPlayerCapabilities();
  const selectParts = [
    'id',
    'name',
    'gender',
    'status',
    ...(playerCaps.ratingM ? ['rating_m'] : []),
    ...(playerCaps.ratingW ? ['rating_w'] : []),
    ...(playerCaps.ratingMix ? ['rating_mix'] : []),
    ...(playerCaps.wins ? ['wins'] : []),
    ...(playerCaps.totalPts ? ['total_pts'] : []),
    ...(playerCaps.tournamentsPlayed ? ['tournaments_played'] : []),
  ];
  const roster = await requestJson<JsonObject[]>(
    `/tournament_participants?select=position,players!inner(${selectParts.join(',')})&tournament_id=eq.${encodeURIComponent(
      tournamentId
    )}&order=position.asc&limit=500`
  );

  return (roster ?? []).map((row) => {
    const player = row.players && typeof row.players === 'object' ? (row.players as JsonObject) : {};
    return {
      id: String(player.id ?? ''),
      name: String(player.name ?? ''),
      gender: String(player.gender ?? 'M') === 'W' ? ('W' as const) : ('M' as const),
      status: String(player.status ?? 'active'),
      ratingM: Number(player.rating_m ?? 0),
      ratingW: Number(player.rating_w ?? 0),
      ratingMix: Number(player.rating_mix ?? 0),
      wins: Number(player.wins ?? 0),
      totalPts: Number(player.total_pts ?? 0),
      tournaments: Number(player.tournaments_played ?? 0),
    };
  });
}

async function listPlayersForLegacySnapshot() {
  const playerCaps = await getPlayerCapabilities();
  const selectParts = [
    'id',
    'name',
    'gender',
    'status',
    ...(playerCaps.ratingM ? ['rating_m'] : []),
    ...(playerCaps.ratingW ? ['rating_w'] : []),
    ...(playerCaps.ratingMix ? ['rating_mix'] : []),
    ...(playerCaps.wins ? ['wins'] : []),
    ...(playerCaps.totalPts ? ['total_pts'] : []),
    ...(playerCaps.tournamentsPlayed ? ['tournaments_played'] : []),
  ];
  const rows = await requestJson<JsonObject[]>(
    `/players?select=${selectParts.join(',')}&order=name.asc&limit=5000`
  );

  return (rows ?? []).map((row) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? ('W' as const) : ('M' as const),
    status: String(row.status ?? 'active'),
    ratingM: Number(row.rating_m ?? 0),
    ratingW: Number(row.rating_w ?? 0),
    ratingMix: Number(row.rating_mix ?? 0),
    wins: Number(row.wins ?? 0),
    totalPts: Number(row.total_pts ?? 0),
    tournaments: Number(row.tournaments_played ?? 0),
  }));
}

async function upsertLegacyPlayerDbSnapshot(caps: TournamentCapabilities) {
  if (!caps.externalId || !caps.gameState) return;

  const players = await listPlayersForLegacySnapshot();
  const payload: JsonObject = {
    name: PLAYER_DB_EXTERNAL_ID,
    date: '2000-01-01',
    time: null,
    location: '',
    format: 'system',
    division: null,
    level: null,
    capacity: 4,
    status: 'finished',
    external_id: PLAYER_DB_EXTERNAL_ID,
    game_state: buildLegacyPlayerDbState(players),
  };

  if (caps.photoUrl) payload.photo_url = null;
  if (caps.settings) payload.settings = {};
  if (caps.syncedAt) payload.synced_at = new Date().toISOString();

  await requestJson<unknown>(
    '/tournaments?on_conflict=external_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    }
  );
}

async function syncLegacyTournamentSnapshot(tournament: AdminTournament) {
  const caps = await getTournamentCapabilities();
  if (!caps.externalId) return;

  const patch: JsonObject = {
    external_id: tournament.id,
  };

  if (caps.syncedAt) {
    patch.synced_at = new Date().toISOString();
  }

  if (isIptMixedFormat(tournament.format) && caps.gameState) {
    const participants = await listTournamentPlayersForLegacy(tournament.id);
    patch.game_state = buildLegacyIptTournamentState({
      id: tournament.id,
      name: tournament.name,
      date: tournament.date,
      time: tournament.time,
      location: tournament.location,
      format: tournament.format,
      division: tournament.division,
      level: tournament.level,
      status: tournament.status,
      settings: tournament.settings,
      participants,
    });
  } else if (caps.gameState) {
    patch.game_state = null;
  }

  if (caps.formatCode) {
    patch.format_code = getTournamentFormatCode(tournament.format);
  }

  await requestJson<unknown>(
    `/tournaments?id=eq.${encodeURIComponent(tournament.id)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );

  if (isIptMixedFormat(tournament.format)) {
    await upsertLegacyPlayerDbSnapshot(caps);
  }
}

async function refreshLegacyTournamentSnapshotById(tournamentId: string) {
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return;
  await syncLegacyTournamentSnapshot(tournament);
}

async function replaceTournamentParticipants(
  tournamentId: string,
  participants?: AdminTournamentParticipantInput[]
): Promise<number> {
  if (!participants) {
    const counts = await fetchParticipantCounts([tournamentId]);
    return Number(counts.get(tournamentId) ?? 0);
  }

  await requestNoContent(`/tournament_participants?tournament_id=eq.${encodeURIComponent(tournamentId)}`, {
    method: 'DELETE',
  });

  if (participants.length === 0) return 0;

  const rows = [...participants]
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    .map((participant, index) => ({
      tournament_id: tournamentId,
      player_id: participant.playerId,
      is_waitlist: Boolean(participant.isWaitlist),
      position: Math.max(1, Number(participant.position || index + 1)),
    }));

  await requestJson<unknown>('/tournament_participants', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });

  return rows.length;
}

function buildTournamentSelect(caps: TournamentCapabilities): string {
  return [
    'id',
    'name',
    'date',
    'time',
    'location',
    'format',
    'division',
    'level',
    'capacity',
    'status',
    ...(caps.photoUrl ? ['photo_url'] : []),
    ...(caps.settings ? ['settings'] : []),
    ...(caps.kotcJudgeModule ? ['kotc_judge_module'] : []),
    ...(caps.kotcJudgeBootstrapSig ? ['kotc_judge_bootstrap_sig'] : []),
    ...(caps.kotcRaundCount ? ['kotc_raund_count'] : []),
    ...(caps.kotcRaundTimerMinutes ? ['kotc_raund_timer_minutes'] : []),
    ...(caps.kotcPpc ? ['kotc_ppc'] : []),
  ].join(',');
}

function applyKotcTournamentPayload(
  payload: JsonObject,
  input: Partial<AdminTournament>,
  caps: TournamentCapabilities,
) {
  if (!caps.kotcJudgeModule && !caps.kotcJudgeBootstrapSig && !caps.kotcRaundCount && !caps.kotcRaundTimerMinutes && !caps.kotcPpc) {
    return;
  }
  if (!isKotcAdminFormat(input.format)) {
    if (caps.kotcJudgeModule) payload.kotc_judge_module = null;
    if (caps.kotcJudgeBootstrapSig) payload.kotc_judge_bootstrap_sig = null;
    if (caps.kotcRaundCount) payload.kotc_raund_count = null;
    if (caps.kotcRaundTimerMinutes) payload.kotc_raund_timer_minutes = null;
    if (caps.kotcPpc) payload.kotc_ppc = null;
    return;
  }
  const normalized = normalizeKotcAdminSettings(input.settings);
  if (caps.kotcJudgeModule) payload.kotc_judge_module = normalized.kotcJudgeModule;
  if (caps.kotcJudgeBootstrapSig) payload.kotc_judge_bootstrap_sig = normalized.kotcJudgeBootstrapSignature;
  if (caps.kotcRaundCount) payload.kotc_raund_count = normalized.raundCount;
  if (caps.kotcRaundTimerMinutes) payload.kotc_raund_timer_minutes = normalized.raundTimerMinutes;
  if (caps.kotcPpc) payload.kotc_ppc = normalized.ppc;
}

async function fetchTournamentRow(id: string): Promise<JsonObject | null> {
  const caps = await getTournamentCapabilities();
  const rows = await requestJson<JsonObject[]>(
    `/tournaments?select=${buildTournamentSelect(caps)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return firstRow<JsonObject>(rows);
}

async function fetchPlayerRow(id: string): Promise<JsonObject | null> {
  const caps = await getPlayerCapabilities();
  const rows = await requestJson<JsonObject[]>(
    `/players?select=${buildPlayerSelect(caps)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return firstRow<JsonObject>(rows);
}

export async function listTournaments(query = ''): Promise<AdminTournament[]> {
  const caps = await getTournamentCapabilities();
  const params = new URLSearchParams({
    select: buildTournamentSelect(caps),
    order: 'date.desc,time.desc',
    limit: '200',
  });

  const term = String(query || '').trim();
  if (term) {
    const escaped = term.replace(/\*/g, '');
    params.set('or', `(name.ilike.*${escaped}*,location.ilike.*${escaped}*,status.ilike.*${escaped}*)`);
  }

  const rows = await requestJson<JsonObject[]>(`/tournaments?${params.toString()}`);
  const visibleRows = (rows ?? []).filter((row) => String(row.name ?? '') !== PLAYER_DB_EXTERNAL_ID);
  const counts = await fetchParticipantCounts(
    visibleRows.map((row) => String(row.id ?? '')).filter(Boolean)
  );
  return visibleRows.map((row) => mapTournament(row, Number(counts.get(String(row.id ?? '')) ?? 0)));
}

export async function createTournament(
  input: Partial<AdminTournament> & { participants?: AdminTournamentParticipantInput[] }
): Promise<AdminTournament> {
  const caps = await getTournamentCapabilities();
  const id = String(input.id || randomUUID());
  const payload: JsonObject = {
    id,
    name: String(input.name || '').trim(),
    date: String(input.date || '').trim() || null,
    time: String(input.time || '').trim() || null,
    location: String(input.location || '').trim() || null,
    format: String(input.format || '').trim() || 'Round Robin',
    division: String(input.division || '').trim() || null,
    level: String(input.level || '').trim() || null,
    capacity: Number(input.capacity || 0),
    status: String(input.status || 'open') || 'open',
  };
  if (caps.photoUrl) payload.photo_url = String(input.photoUrl || '').trim() || null;
  if (caps.settings) payload.settings = input.settings ?? {};
  applyKotcTournamentPayload(payload, input, caps);
  if (caps.formatCode) {
    const formatCode = getTournamentFormatCode(String(input.format || ''));
    if (formatCode) payload.format_code = formatCode;
  }

  const createdRows = await requestJson<JsonObject[]>(
    '/tournaments',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    }
  );
  const createdRow = firstRow<JsonObject>(createdRows) ?? payload;
  const participantCount = await replaceTournamentParticipants(id, input.participants);
  const created = mapTournament(createdRow, participantCount);
  await syncLegacyTournamentSnapshot(created);
  return created;
}

export async function updateTournament(
  id: string,
  input: Partial<AdminTournament> & { participants?: AdminTournamentParticipantInput[] }
): Promise<AdminTournament | null> {
  const caps = await getTournamentCapabilities();
  const payload: JsonObject = {
    name: String(input.name || '').trim(),
    date: String(input.date || '').trim() || null,
    time: String(input.time || '').trim() || null,
    location: String(input.location || '').trim() || null,
    format: String(input.format || '').trim() || 'Round Robin',
    division: String(input.division || '').trim() || null,
    level: String(input.level || '').trim() || null,
    capacity: Number(input.capacity || 0),
    status: String(input.status || 'open') || 'open',
  };
  if (caps.photoUrl) payload.photo_url = String(input.photoUrl || '').trim() || null;
  if (caps.settings) payload.settings = input.settings ?? {};
  applyKotcTournamentPayload(payload, input, caps);
  if (caps.formatCode) {
    const formatCode = getTournamentFormatCode(String(input.format || ''));
    if (formatCode) payload.format_code = formatCode;
  }

  const rows = await requestJson<JsonObject[]>(
    `/tournaments?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    }
  );
  const row = firstRow<JsonObject>(rows);
  if (!row) return null;

  const participantCount = await replaceTournamentParticipants(id, input.participants);
  const updated = mapTournament(row, participantCount);
  await syncLegacyTournamentSnapshot(updated);
  return updated;
}

export async function deleteTournament(id: string): Promise<boolean> {
  const existing = await getTournamentById(id);
  if (!existing) return false;
  await requestNoContent(`/tournaments?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return true;
}

export async function getTournamentById(id: string): Promise<AdminTournament | null> {
  const row = await fetchTournamentRow(id);
  if (!row) return null;
  const counts = await fetchParticipantCounts([id]);
  return mapTournament(row, Number(counts.get(id) ?? 0));
}

export async function getTournamentLegacyGameStateById(id: string): Promise<Record<string, unknown> | null> {
  const caps = await getTournamentCapabilities();
  if (!caps.gameState) return null;
  const rows = await requestJson<JsonObject[]>(
    `/tournaments?select=game_state&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  const state = firstRow<JsonObject>(rows)?.game_state;
  return state && typeof state === 'object' && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : null;
}

export async function listPlayers(query = ''): Promise<AdminPlayer[]> {
  const caps = await getPlayerCapabilities();
  const params = new URLSearchParams({
    select: buildPlayerSelect(caps),
    order: 'name.asc',
    limit: '2000',
  });

  const term = String(query || '').trim();
  if (term) {
    const escaped = term.replace(/\*/g, '');
    params.set('name', `ilike.*${escaped}*`);
  }

  const rows = await requestJson<JsonObject[]>(`/players?${params.toString()}`);
  return (rows ?? []).map((row) => mapPlayer(row));
}

export async function getPlayerById(id: string): Promise<AdminPlayer | null> {
  const row = await fetchPlayerRow(id);
  return row ? mapPlayer(row) : null;
}

export async function getPlayersByIds(ids: string[]): Promise<AdminPlayer[]> {
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalizedIds.length) return [];

  const caps = await getPlayerCapabilities();
  const rows = await requestJson<JsonObject[]>(
    `/players?select=${buildPlayerSelect(caps)}&id=in.${encodeInFilter(normalizedIds)}&limit=${Math.max(1, normalizedIds.length)}`,
  );
  return (rows ?? []).map((row) => mapPlayer(row));
}

export async function createPlayer(input: Partial<AdminPlayer>): Promise<AdminPlayer> {
  const caps = await getPlayerCapabilities();
  const payload: JsonObject = {
    id: String(input.id || randomUUID()),
    ...playerPayload(input, caps),
  };

  const rows = await requestJson<JsonObject[]>(
    '/players',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    }
  );
  return mapPlayer(firstRow<JsonObject>(rows));
}

export async function updatePlayer(id: string, input: Partial<AdminPlayer>): Promise<AdminPlayer | null> {
  const caps = await getPlayerCapabilities();
  const payload = playerPayload(input, caps);

  const rows = await requestJson<JsonObject[]>(
    `/players?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    }
  );
  const row = firstRow<JsonObject>(rows);
  return row ? mapPlayer(row) : null;
}

export async function deletePlayer(id: string): Promise<boolean> {
  const existing = await getPlayerById(id);
  if (!existing) return false;
  await requestNoContent(`/players?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return true;
}

export async function listFilterPresets(actorId: string, scope: string) {
  const rows = await requestJson<JsonObject[]>(
    `/admin_filter_presets?select=id,actor_id,name,scope,filters,created_at,updated_at&actor_id=eq.${encodeURIComponent(
      actorId,
    )}&scope=eq.${encodeURIComponent(scope)}&order=updated_at.desc,name.asc`,
    {},
    { allow404: true },
  );
  return (rows ?? []).map((row) => mapFilterPreset(row));
}

export async function upsertFilterPreset(input: {
  id?: string;
  actorId: string;
  scope: string;
  name: string;
  filters: Record<string, unknown>;
}) {
  const payload = {
    id: String(input.id || randomUUID()),
    actor_id: String(input.actorId || '').trim(),
    name: String(input.name || '').trim(),
    scope: String(input.scope || '').trim(),
    filters: input.filters ?? {},
  };
  const rows = await requestJson<JsonObject[]>(
    '/admin_filter_presets?on_conflict=actor_id,scope,name',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    },
  );
  return mapFilterPreset(firstRow<JsonObject>(rows));
}

export async function deleteFilterPreset(input: { id: string; actorId: string; scope: string }): Promise<boolean> {
  const existing = await requestJson<JsonObject[]>(
    `/admin_filter_presets?select=id&id=eq.${encodeURIComponent(input.id)}&actor_id=eq.${encodeURIComponent(
      input.actorId,
    )}&scope=eq.${encodeURIComponent(input.scope)}&limit=1`,
    {},
    { allow404: true },
  );
  if (!(existing ?? []).length) return false;
  await requestNoContent(
    `/admin_filter_presets?id=eq.${encodeURIComponent(input.id)}&actor_id=eq.${encodeURIComponent(
      input.actorId,
    )}&scope=eq.${encodeURIComponent(input.scope)}`,
    { method: 'DELETE' },
  );
  return true;
}

export async function mergeTournamentSettingsKeys(
  id: string,
  patch: Record<string, unknown>,
): Promise<AdminTournament | null> {
  const current = await getTournamentById(id);
  if (!current) return null;
  const settings = { ...current.settings, ...patch };
  return updateTournament(id, {
    name: current.name,
    date: current.date,
    time: current.time,
    location: current.location,
    format: current.format,
    division: current.division,
    level: current.level,
    capacity: current.capacity,
    status: current.status,
    photoUrl: current.photoUrl,
    settings,
  });
}

export async function applyTournamentStatusOverride(input: {
  tournamentId: string;
  status: string;
}): Promise<AdminTournament | null> {
  const rows = await requestJson<JsonObject[]>(
    `/tournaments?id=eq.${encodeURIComponent(input.tournamentId)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status: input.status }),
    }
  );
  const row = firstRow<JsonObject>(rows);
  if (!row) return null;
  const tournament = await getTournamentById(String(row.id ?? input.tournamentId));
  if (tournament) {
    await syncLegacyTournamentSnapshot(tournament);
  }
  return tournament;
}

export async function applyPlayerRecalcOverride(input: { playerId: string }): Promise<AdminPlayer | null> {
  const rows = await requestJson<JsonObject[]>(
    `/tournament_results?select=game_pts,wins&player_id=eq.${encodeURIComponent(input.playerId)}&limit=5000`
  );
  const totals = (rows ?? []).reduce<{ wins: number; totalPts: number }>(
    (acc, row) => {
      acc.wins += Number(row.wins ?? 0);
      acc.totalPts += Number(row.game_pts ?? 0);
      return acc;
    },
    { wins: 0, totalPts: 0 }
  );
  return updatePlayer(input.playerId, {
    ...(await getPlayerById(input.playerId)),
    wins: totals.wins,
    totalPts: totals.totalPts,
  });
}

export async function applyPlayerRatingOverride(input: {
  playerId: string;
  ratingM?: number;
  ratingW?: number;
  ratingMix?: number;
}): Promise<AdminPlayer | null> {
  const current = await getPlayerById(input.playerId);
  if (!current) return null;
  return updatePlayer(input.playerId, {
    ...current,
    ratingM: input.ratingM != null ? Number(input.ratingM) : current.ratingM,
    ratingW: input.ratingW != null ? Number(input.ratingW) : current.ratingW,
    ratingMix: input.ratingMix != null ? Number(input.ratingMix) : current.ratingMix,
  });
}

export async function listRosterParticipants(tournamentId: string): Promise<RosterParticipant[]> {
  const rows = await requestJson<JsonObject[]>(
    `/tournament_participants?select=id,player_id,is_waitlist,position,registered_at,players!inner(name,gender)&tournament_id=eq.${encodeURIComponent(
      tournamentId
    )}&order=is_waitlist.asc,position.asc&limit=500`
  );
  return (rows ?? []).map((row) => mapRosterParticipant(row));
}

export async function addParticipant(
  tournamentId: string,
  playerId: string
): Promise<{ ok: boolean; waitlist: boolean; message: string }> {
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    return { ok: false, waitlist: false, message: 'Tournament not found' };
  }
  if (tournament.status === 'finished' || tournament.status === 'cancelled') {
    return { ok: false, waitlist: false, message: `Tournament is ${tournament.status}` };
  }

  const existing = await requestJson<JsonObject[]>(
    `/tournament_participants?select=id&tournament_id=eq.${encodeURIComponent(tournamentId)}&player_id=eq.${encodeURIComponent(
      playerId
    )}&limit=1`
  );
  if ((existing ?? []).length > 0) {
    return { ok: false, waitlist: false, message: 'Player already registered' };
  }

  const mainRows = await requestJson<JsonObject[]>(
    `/tournament_participants?select=position&tournament_id=eq.${encodeURIComponent(tournamentId)}&is_waitlist=eq.false&limit=500`
  );
  const waitRows = await requestJson<JsonObject[]>(
    `/tournament_participants?select=position&tournament_id=eq.${encodeURIComponent(tournamentId)}&is_waitlist=eq.true&limit=500`
  );
  const isWaitlist = (mainRows ?? []).length >= Number(tournament.capacity ?? 0);
  const nextPos = Math.max(
    1,
    ...((isWaitlist ? waitRows : mainRows) ?? []).map((row) => Number(row.position ?? 0) + 1)
  );

  await requestJson<unknown>('/tournament_participants', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      tournament_id: tournamentId,
      player_id: playerId,
      is_waitlist: isWaitlist,
      position: nextPos,
    }),
  });

  await refreshLegacyTournamentSnapshotById(tournamentId);
  return {
    ok: true,
    waitlist: isWaitlist,
    message: isWaitlist ? 'Added to waitlist' : 'Registered',
  };
}

export async function removeParticipant(
  tournamentId: string,
  playerId: string
): Promise<{ removed: boolean; promotedPlayerId: string | null }> {
  const rows = await requestJson<JsonObject[]>(
    `/tournament_participants?select=id,is_waitlist&tournament_id=eq.${encodeURIComponent(
      tournamentId
    )}&player_id=eq.${encodeURIComponent(playerId)}&limit=1`
  );
  const row = firstRow<JsonObject>(rows);
  if (!row) return { removed: false, promotedPlayerId: null };

  await requestNoContent(`/tournament_participants?id=eq.${encodeURIComponent(String(row.id ?? ''))}`, {
    method: 'DELETE',
  });

  let promotedPlayerId: string | null = null;
  if (!Boolean(row.is_waitlist)) {
    const waitlistRows = await requestJson<JsonObject[]>(
      `/tournament_participants?select=id,player_id,position&tournament_id=eq.${encodeURIComponent(
        tournamentId
      )}&is_waitlist=eq.true&order=position.asc&limit=1`
    );
    const promoteRow = firstRow<JsonObject>(waitlistRows);
    if (promoteRow) {
      await requestJson<unknown>(
        `/tournament_participants?id=eq.${encodeURIComponent(String(promoteRow.id ?? ''))}`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ is_waitlist: false }),
        }
      );
      promotedPlayerId = String(promoteRow.player_id ?? '') || null;
    }
  }

  await refreshLegacyTournamentSnapshotById(tournamentId);
  return { removed: true, promotedPlayerId };
}

export async function promoteFromWaitlist(
  tournamentId: string,
  playerId: string
): Promise<boolean> {
  const row = firstRow<JsonObject>(
    await requestJson<JsonObject[]>(
      `/tournament_participants?select=id&tournament_id=eq.${encodeURIComponent(
        tournamentId
      )}&player_id=eq.${encodeURIComponent(playerId)}&is_waitlist=eq.true&limit=1`
    )
  );
  if (!row) return false;

  const mainRows = await requestJson<JsonObject[]>(
    `/tournament_participants?select=position&tournament_id=eq.${encodeURIComponent(tournamentId)}&is_waitlist=eq.false&limit=500`
  );
  const nextPos = Math.max(1, ...((mainRows ?? []).map((item) => Number(item.position ?? 0) + 1)));

  await requestJson<unknown>(
    `/tournament_participants?id=eq.${encodeURIComponent(String(row.id ?? ''))}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        is_waitlist: false,
        position: nextPos,
      }),
    }
  );

  await refreshLegacyTournamentSnapshotById(tournamentId);
  return true;
}

export async function listPendingRequests(tournamentId?: string): Promise<PlayerRequest[]> {
  const params = new URLSearchParams({
    select: 'id,name,gender,phone,tournament_id,status,created_at,reviewed_at,tournaments(name)',
    status: 'eq.pending',
    order: 'created_at.desc',
    limit: '200',
  });
  if (tournamentId) {
    params.set('tournament_id', `eq.${tournamentId}`);
  }
  const rows = await requestJson<JsonObject[]>(`/player_requests?${params.toString()}`);
  return (rows ?? []).map((row) => mapPlayerRequest(row));
}

export async function approveRequest(
  requestId: string
): Promise<{ request: PlayerRequest | null; newPlayerId: string | null }> {
  const rpcResult = (await requestJson<JsonObject>('/rpc/approve_player_request', {
    method: 'POST',
    body: JSON.stringify({ p_request_id: requestId }),
  })) ?? {};

  const requestRows = await requestJson<JsonObject[]>(
    `/player_requests?select=id,name,gender,phone,tournament_id,status,created_at,reviewed_at,tournaments(name)&id=eq.${encodeURIComponent(
      requestId
    )}&limit=1`
  );
  const request = firstRow<JsonObject>(requestRows);
  return {
    request: request ? mapPlayerRequest(request) : null,
    newPlayerId: String(rpcResult.player_id ?? '') || null,
  };
}

export async function rejectRequest(requestId: string): Promise<PlayerRequest | null> {
  try {
    await requestJson<JsonObject>('/rpc/reject_player_request', {
      method: 'POST',
      body: JSON.stringify({ p_request_id: requestId, p_reason: 'Rejected by admin panel' }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/function|signature|parameter/i.test(message)) throw error;
    await requestJson<JsonObject>('/rpc/reject_player_request', {
      method: 'POST',
      body: JSON.stringify({ p_request_id: requestId }),
    });
  }

  const rows = await requestJson<JsonObject[]>(
    `/player_requests?select=id,name,gender,phone,tournament_id,status,created_at,reviewed_at,tournaments(name)&id=eq.${encodeURIComponent(
      requestId
    )}&limit=1`
  );
  const row = firstRow<JsonObject>(rows);
  return row ? mapPlayerRequest(row) : null;
}

export async function listTempPlayers(): Promise<TempPlayer[]> {
  const rows = await requestJson<JsonObject[]>(
    '/players?select=id,name,gender,tournaments_played&status=eq.temporary&order=name.asc&limit=200'
  );
  return (rows ?? []).map((row) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    gender: String(row.gender ?? 'M') === 'W' ? 'W' : 'M',
    tournamentsPlayed: Number(row.tournaments_played ?? 0),
  }));
}

export async function mergeTempPlayer(
  tempId: string,
  realId: string
): Promise<{ ok: boolean; moved: number; message: string }> {
  const result = await requestJson<JsonObject>('/rpc/merge_players', {
    method: 'POST',
    body: JSON.stringify({ p_temp_id: tempId, p_real_id: realId }),
  });
  return {
    ok: Boolean(result.ok),
    moved: Number(result.moved ?? result.records_moved ?? 0),
    message: String(result.message ?? result.error ?? 'Merge completed'),
  };
}

export async function getArchiveTournaments(): Promise<ArchiveTournament[]> {
  const caps = await getTournamentCapabilities();
  const tournaments = await requestJson<JsonObject[]>(
    `/tournaments?select=${buildTournamentSelect(caps)}&status=eq.finished&order=date.desc&limit=200`
  );
  const visible = (tournaments ?? []).filter((row) => String(row.name ?? '') !== PLAYER_DB_EXTERNAL_ID);
  const ids = visible.map((row) => String(row.id ?? '')).filter(Boolean);
  if (ids.length === 0) return [];

  const results = await requestJson<JsonObject[]>(
    `/tournament_results?select=tournament_id,place,game_pts,rating_pts,rating_pool,players!inner(name,gender)&tournament_id=in.${encodeInFilter(
      ids
    )}&order=place.asc&limit=5000`
  );
  const counts = await fetchParticipantCounts(ids);
  const byTournament = new Map<
    string,
    Array<{
      playerName: string;
      gender: 'M' | 'W';
      placement: number;
      points: number;
      ratingPts: number;
      ratingPool: 'pro' | 'novice';
    }>
  >();
  for (const row of results ?? []) {
    const tournamentId = String(row.tournament_id ?? '');
    const player = row.players && typeof row.players === 'object' ? (row.players as JsonObject) : {};
    const current = byTournament.get(tournamentId) ?? [];
    const place = Number(row.place ?? 0);
    const poolKind = row.rating_pool === 'novice' ? 'novice' : 'pro';
    current.push({
      playerName: String(player.name ?? ''),
      gender: String(player.gender ?? 'M') === 'W' ? 'W' : 'M',
      placement: place,
      points: Number(row.game_pts ?? 0),
      ratingPts: effectiveRatingPtsFromStored(
        place,
        poolKind,
        row.rating_pts != null ? Number(row.rating_pts) : undefined,
      ),
      ratingPool: poolKind,
    });
    byTournament.set(tournamentId, current);
  }

  return visible.map((row) =>
    augmentArchiveTournamentWithThaiBoard({
      ...mapTournament(row, Number(counts.get(String(row.id ?? '')) ?? 0)),
      results: byTournament.get(String(row.id ?? '')) ?? [],
    }),
  );
}

export async function setTournamentPhotoUrl(
  id: string,
  photoUrl: string
): Promise<AdminTournament | null> {
  const rows = await requestJson<JsonObject[]>(
    `/tournaments?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ photo_url: photoUrl || null }),
    }
  );
  const row = firstRow<JsonObject>(rows);
  if (!row) return null;
  return getTournamentById(id);
}

export async function upsertTournamentResults(
  tournamentId: string,
  results: Array<{
    playerName: string;
    gender: 'M' | 'W';
    placement: number;
    points: number;
    ratingPts?: number;
    ratingPool?: RatingPool;
  }>,
): Promise<number> {
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    throw new Error('BadRequest: Tournament not found');
  }

  const payload = results.map((item) => {
    const parsedPlace = Number(item.placement || 0);
    const place = Number.isFinite(parsedPlace) ? Math.max(0, Math.trunc(parsedPlace)) : 0;
    const pool: RatingPool = item.ratingPool === 'novice' ? 'novice' : 'pro';
    return {
      name: String(item.playerName || '').trim(),
      gender: item.gender === 'W' ? 'W' : 'M',
      place,
      game_pts: Number(item.points || 0),
      rating_pts: effectiveRatingPtsFromStored(
        place,
        pool,
        item.ratingPts != null ? Number(item.ratingPts) : undefined,
      ),
      rating_type: tournament.division === 'Микст' ? 'Mix' : item.gender === 'W' ? 'W' : 'M',
      rating_pool: pool === 'novice' ? 'novice' : null,
    };
  });

  const response = await requestJson<JsonObject>('/rpc/publish_tournament_results', {
    method: 'POST',
    body: JSON.stringify({
      p_external_id: tournamentId,
      p_name: tournament.name,
      p_date: tournament.date,
      p_format: tournament.format,
      p_division: tournament.division,
      p_results: payload,
    }),
  });

  return Number(response.results_saved ?? payload.length ?? 0);
}
