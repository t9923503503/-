const TOURNAMENT_STATUSES = new Set(['open', 'full', 'finished', 'cancelled']);
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
    division: toSafeString(input.division || 'mix'),
    level: toSafeString(input.level || 'open'),
    capacity: clampNonNegativeInt(input.capacity, 0),
    status,
    reason: toSafeString(input.reason),
  };
}

export function validateTournamentInput(input: ReturnType<typeof normalizeTournamentInput>): string | null {
  if (!input.name) return 'Tournament name is required';
  if (!input.date) return 'Tournament date is required';
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
