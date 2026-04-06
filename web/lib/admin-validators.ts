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
const PLAYER_STATUSES = new Set(['active', 'temporary', 'inactive', 'injured', 'vacation']);
const PLAYER_SKILL_LEVELS = new Set(['light', 'medium', 'advanced', 'pro']);
const PLAYER_POSITIONS = new Set(['attacker', 'defender', 'universal', 'setter', 'blocker']);
const BULK_PLAYER_ACTIONS = new Set(['status', 'level', 'delete']);
type PlayerStatus = 'active' | 'temporary' | 'inactive' | 'injured' | 'vacation';
type PlayerSkillLevel = 'light' | 'medium' | 'advanced' | 'pro';
type PlayerPreferredPosition = 'attacker' | 'defender' | 'universal' | 'setter' | 'blocker';
type BulkPlayerAction = 'status' | 'level' | 'delete';
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

function nullableInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Math.floor(toFiniteNumber(value, NaN));
  return Number.isFinite(n) ? n : null;
}

function normalizeNullableDate(value: unknown): string {
  const raw = toSafeString(value);
  if (!raw) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw.slice(0, 10);
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
  const status: PlayerStatus = PLAYER_STATUSES.has(statusRaw) ? (statusRaw as PlayerStatus) : 'active';
  const skillLevelRaw = toSafeString(input.skillLevel || input.skill_level || 'light').toLowerCase();
  const preferredPositionRaw = toSafeString(input.preferredPosition || input.preferred_position || 'universal').toLowerCase();
  const skillLevel: PlayerSkillLevel = PLAYER_SKILL_LEVELS.has(skillLevelRaw)
    ? (skillLevelRaw as PlayerSkillLevel)
    : 'light';
  const preferredPosition: PlayerPreferredPosition = PLAYER_POSITIONS.has(preferredPositionRaw)
    ? (preferredPositionRaw as PlayerPreferredPosition)
    : 'universal';
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
    tournamentsPlayed: clampNonNegativeInt(input.tournamentsPlayed ?? input.tournaments_played, 0),
    photoUrl: toSafeString(input.photoUrl ?? input.photo_url),
    birthDate: normalizeNullableDate(input.birthDate ?? input.birth_date),
    heightCm: nullableInt(input.heightCm ?? input.height_cm),
    weightKg: nullableInt(input.weightKg ?? input.weight_kg),
    skillLevel,
    preferredPosition,
    mixReady: Boolean(input.mixReady ?? input.mix_ready),
    phone: toSafeString(input.phone),
    telegram: toSafeString(input.telegram),
    adminComment: toSafeString(input.adminComment ?? input.admin_comment),
    reason: toSafeString(input.reason),
  };
}

export function validatePlayerInput(input: ReturnType<typeof normalizePlayerInput>): string | null {
  if (!input.name) return 'Player name is required';
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return 'Birth date must be YYYY-MM-DD';
  if (input.heightCm != null && (input.heightCm < 150 || input.heightCm > 220)) return 'Height must be 150-220 cm';
  if (input.weightKg != null && (input.weightKg < 40 || input.weightKg > 140)) return 'Weight must be 40-140 kg';
  return null;
}

export function normalizeFilterPresetInput(input: Record<string, unknown>) {
  return {
    id: toSafeString(input.id),
    scope: toSafeString(input.scope || 'admin.players') || 'admin.players',
    name: toSafeString(input.name),
    filters:
      input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters)
        ? (input.filters as Record<string, unknown>)
        : {},
  };
}

export function validateFilterPresetInput(input: ReturnType<typeof normalizeFilterPresetInput>): string | null {
  if (!input.name) return 'Preset name is required';
  if (input.scope !== 'admin.players') return 'Unsupported preset scope';
  return null;
}

export function normalizeBulkPlayerInput(input: Record<string, unknown>) {
  const ids = Array.isArray(input.ids)
    ? Array.from(new Set(input.ids.map((id) => toSafeString(id)).filter(Boolean)))
    : [];
  const action = toSafeString(input.action).toLowerCase();
  const status = toSafeString(input.status).toLowerCase();
  const skillLevel = toSafeString(input.skillLevel || input.skill_level).toLowerCase();
  return {
    ids,
    action: BULK_PLAYER_ACTIONS.has(action) ? (action as BulkPlayerAction) : '',
    status: PLAYER_STATUSES.has(status) ? (status as PlayerStatus) : '',
    skillLevel: PLAYER_SKILL_LEVELS.has(skillLevel) ? (skillLevel as PlayerSkillLevel) : '',
    reason: toSafeString(input.reason),
  };
}

export function validateBulkPlayerInput(input: ReturnType<typeof normalizeBulkPlayerInput>): string | null {
  if (!input.ids.length) return 'Select at least one player';
  if (!input.action) return 'Invalid bulk action';
  if (input.action === 'status' && !input.status) return 'Invalid player status';
  if (input.action === 'level' && !input.skillLevel) return 'Invalid player level';
  if (input.action === 'delete' && !input.reason) return 'Reason is required';
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
