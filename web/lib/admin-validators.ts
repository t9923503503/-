import {
  IPT_MIXED_FORMAT,
  THAI_ADMIN_FORMAT,
  getThaiSeatCount,
  isThaiAdminFormat,
  normalizeThaiAdminSettings,
} from './admin-legacy-sync';

const TOURNAMENT_STATUSES = new Set(['open', 'full', 'finished', 'cancelled']);
const TOURNAMENT_DIVISIONS = new Set(['Мужской', 'Женский', 'Микст']);
const TOURNAMENT_LEVELS = new Set(['hard', 'medium', 'easy']);
const PLAYER_GENDERS = new Set(['M', 'W']);
const PLAYER_STATUSES = new Set(['active', 'temporary']);
function toSafeString(value: unknown): string {
  return String(value != null ? value : '').trim();
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNonNegativeInt(value: unknown, fallback = 0): number {
  const n = Math.floor(toFiniteNumber(value, fallback));
  return n < 0 ? 0 : n;
}

function normalizeTournamentDivision(value: unknown): string {
  const raw = toSafeString(value);
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'муж' || normalized === 'мужской') return 'Мужской';
  if (normalized === 'жен' || normalized === 'женский') return 'Женский';
  if (normalized === 'микст' || normalized === 'mix') return 'Микст';
  return raw;
}

function normalizeTournamentLevel(value: unknown): string {
  const raw = toSafeString(value || 'medium').toLowerCase();
  return raw;
}

function normalizeTournamentParticipants(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item, index) => {
      const row = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      return {
        playerId: toSafeString(row.playerId),
        position: clampNonNegativeInt(row.position, index + 1),
        isWaitlist: Boolean(row.isWaitlist),
      };
    })
    .filter((row) => row.playerId);
}

export function normalizeTournamentInput(input: Record<string, unknown>) {
  const statusRaw = toSafeString(input.status || 'open').toLowerCase();
  const status = TOURNAMENT_STATUSES.has(statusRaw) ? statusRaw : 'open';
  return {
    id: toSafeString(input.id),
    name: toSafeString(input.name),
    date: toSafeString(input.date),
    time: toSafeString(input.time),
    location: toSafeString(input.location),
    format: toSafeString(input.format || 'thai'),
    division: normalizeTournamentDivision(input.division),
    level: normalizeTournamentLevel(input.level),
    capacity: clampNonNegativeInt(input.capacity, 0),
    status,
    reason: toSafeString(input.reason),
    settings: (typeof input.settings === 'object' && input.settings !== null) ? input.settings as Record<string, unknown> : {},
    participants: normalizeTournamentParticipants(input.participants),
  };
}

export function validateTournamentInput(input: ReturnType<typeof normalizeTournamentInput>): string | null {
  if (!input.name) return 'Tournament name is required';
  if (!input.date) return 'Tournament date is required';
  if (!input.division) return 'Division is required';
  if (!TOURNAMENT_DIVISIONS.has(input.division)) return 'Division must be Мужской, Женский, or Микст';
  if (!TOURNAMENT_LEVELS.has(input.level)) return 'Level must be hard, medium, or easy';
  if (input.capacity < 4) return 'Capacity must be at least 4';
  if (input.participants) {
    const seen = new Set<string>();
    for (const participant of input.participants) {
      if (!participant.playerId) return 'Participant playerId is required';
      if (seen.has(participant.playerId)) return 'Participant list contains duplicates';
      seen.add(participant.playerId);
    }
  }
  if (isThaiAdminFormat(input.format)) {
    const thaiSettings = normalizeThaiAdminSettings(input.settings, input.participants?.length ?? 0);
    const expectedParticipants = getThaiSeatCount(thaiSettings.courts);
    if ((input.participants?.length ?? 0) !== expectedParticipants) {
      const label = input.format === THAI_ADMIN_FORMAT ? THAI_ADMIN_FORMAT : IPT_MIXED_FORMAT;
      return `${label} requires exactly ${expectedParticipants} players`;
    }
  }
  return null;
}

export function normalizePlayerInput(input: Record<string, unknown>) {
  const genderRaw = toSafeString(input.gender || 'M').toUpperCase();
  const gender: 'M' | 'W' = PLAYER_GENDERS.has(genderRaw) && genderRaw === 'W' ? 'W' : 'M';
  const statusRaw = toSafeString(input.status || 'active').toLowerCase();
  const status: 'active' | 'temporary' =
    PLAYER_STATUSES.has(statusRaw) && statusRaw === 'temporary' ? 'temporary' : 'active';
  return {
    id: toSafeString(input.id),
    name: toSafeString(input.name),
    gender,
    status,
    ratingM: toFiniteNumber(input.ratingM, 0),
    ratingW: toFiniteNumber(input.ratingW, 0),
    ratingMix: toFiniteNumber(input.ratingMix, 0),
    wins: clampNonNegativeInt(input.wins, 0),
    totalPts: clampNonNegativeInt(input.totalPts, 0),
    reason: toSafeString(input.reason),
  };
}

export function validatePlayerInput(input: ReturnType<typeof normalizePlayerInput>): string | null {
  if (!input.name) return 'Player name is required';
  return null;
}

export function normalizeOverrideInput(input: Record<string, unknown>) {
  const type = toSafeString(input.type);
  return {
    type,
    reason: toSafeString(input.reason),
    tournamentId: toSafeString(input.tournamentId),
    playerId: toSafeString(input.playerId),
    status: toSafeString(input.status).toLowerCase(),
    ratingM: toFiniteNumber(input.ratingM, NaN),
    ratingW: toFiniteNumber(input.ratingW, NaN),
    ratingMix: toFiniteNumber(input.ratingMix, NaN),
  };
}

export function validateOverrideInput(input: ReturnType<typeof normalizeOverrideInput>): string | null {
  if (!input.reason) return 'Reason is required';
  if (input.type === 'tournament_status') {
    if (!input.tournamentId) return 'Missing tournamentId';
    if (!TOURNAMENT_STATUSES.has(input.status)) return 'Invalid tournament status';
    return null;
  }
  if (input.type === 'player_rating') {
    if (!input.playerId) return 'Missing playerId';
    const allNaN = Number.isNaN(input.ratingM) && Number.isNaN(input.ratingW) && Number.isNaN(input.ratingMix);
    if (allNaN) return 'At least one rating value is required';
    return null;
  }
  if (input.type === 'player_recalc') {
    if (!input.playerId) return 'Missing playerId';
    return null;
  }
  return 'Unsupported override type';
}

// ── Roster ────────────────────────────────────────────────

const ROSTER_ACTIONS = new Set(['add', 'remove', 'promote']);

export function normalizeRosterInput(input: Record<string, unknown>) {
  const action = toSafeString(input.action).toLowerCase();
  return {
    tournamentId: toSafeString(input.tournamentId),
    playerId: toSafeString(input.playerId),
    action: ROSTER_ACTIONS.has(action) ? action : '',
    reason: toSafeString(input.reason),
  };
}

export function validateRosterInput(input: ReturnType<typeof normalizeRosterInput>): string | null {
  if (!input.tournamentId) return 'Missing tournamentId';
  if (!input.playerId) return 'Missing playerId';
  if (!input.action) return 'Invalid action (add, remove, promote)';
  return null;
}

// ── Player Requests ──────────────────────────────────────

const REQUEST_ACTIONS = new Set(['approve', 'reject']);

export function normalizeRequestInput(input: Record<string, unknown>) {
  const action = toSafeString(input.action).toLowerCase();
  return {
    requestId: toSafeString(input.requestId),
    action: REQUEST_ACTIONS.has(action) ? action : '',
    reason: toSafeString(input.reason),
  };
}

export function validateRequestInput(input: ReturnType<typeof normalizeRequestInput>): string | null {
  if (!input.requestId) return 'Missing requestId';
  if (!input.action) return 'Invalid action (approve, reject)';
  return null;
}

// ── Merge ────────────────────────────────────────────────

export function normalizeMergeInput(input: Record<string, unknown>) {
  return {
    tempId: toSafeString(input.tempId),
    realId: toSafeString(input.realId),
    reason: toSafeString(input.reason),
  };
}

export function validateMergeInput(input: ReturnType<typeof normalizeMergeInput>): string | null {
  if (!input.tempId) return 'Missing tempId';
  if (!input.realId) return 'Missing realId';
  if (input.tempId === input.realId) return 'Cannot merge player with itself';
  if (!input.reason) return 'Reason is required for merge';
  return null;
}
