// Play V3 core (TZ-production-play-v3): 3 уровня, priceMode, производные gather-состояния.

export const PLAY_LEVELS = ['light', 'medium', 'hard'] as const;

export type PlayLevel = (typeof PLAY_LEVELS)[number];
export type PlayKind = 'game' | 'training';
export type PlayGenderPolicy = 'any' | 'M' | 'W' | 'mixed';
export type PlayVisibility = 'public' | 'unlisted' | 'link';
export type PlayJoinPolicy = 'request' | 'open' | 'closed';
export type PlayPostStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type PlayParticipantStatus = 'pending' | 'confirmed' | 'reserve' | 'rejected' | 'cancelled';
export type PlayFit = 'match' | 'level_too_high' | 'level_too_low' | 'gender_mismatch' | 'unknown';
export type PlayPriceMode = 'fixed' | 'split';
export type PlayGatherState = 'filling' | 'minimum_reached' | 'full' | 'closed' | 'at_risk';
export type PlayResultStatus = 'pending' | 'confirmed' | 'disputed' | 'cancelled';
export type PlayInviteStatus = 'sent' | 'accepted' | 'declined' | 'expired';
export type PlayRatingMode = 'rated' | 'friendly';
export type PlayPostResultFormat = 'classic_2x2' | 'thai_8' | 'king_sideout' | 'legacy_custom';
export type PlayResultEntryMode = 'after_game' | 'live_lite';

// D1: legacy 4-level schema maps onto 3 game levels; players.skill_level is NOT migrated.
const LEGACY_LEVEL_MAP: Record<string, PlayLevel> = {
  light: 'light',
  medium: 'medium',
  hard: 'hard',
  advanced: 'hard',
  pro: 'hard',
};

export function normalizePlayLevel(value: unknown): PlayLevel | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return LEGACY_LEVEL_MAP[normalized] ?? null;
}

export interface PlayPostInput {
  kind: PlayKind;
  organizerId: string;
  venueId: string;
  coachId: string | null;
  title: string;
  description: string;
  formatLabel: string;
  focus: string;
  startsAt: string;
  endsAt: string;
  registrationClosesAt: string | null;
  gatherDeadline: string | null;
  levelMin: PlayLevel | null;
  levelMax: PlayLevel | null;
  genderPolicy: PlayGenderPolicy;
  capacity: number;
  minPlayers: number | null;
  priceMode: PlayPriceMode;
  priceRub: number;
  courtCostRub: number | null;
  courtBooked: boolean;
  visibility: PlayVisibility;
  joinPolicy: PlayJoinPolicy;
  status: PlayPostStatus;
  ratingMode: PlayRatingMode;
  resultFormat: PlayPostResultFormat;
  resultConfig: Record<string, unknown>;
  resultEntryMode: PlayResultEntryMode;
  repeatWeeks: number;
  joinAuthor: boolean;
}

const KIND_SET = new Set<string>(['game', 'training']);
const GENDER_SET = new Set<string>(['any', 'M', 'W', 'mixed']);
const VISIBILITY_SET = new Set<string>(['public', 'unlisted', 'link']);
const JOIN_POLICY_SET = new Set<string>(['request', 'open', 'closed']);
const STATUS_SET = new Set<string>(['draft', 'published', 'cancelled', 'completed']);
const PRICE_MODE_SET = new Set<string>(['fixed', 'split']);
const RATING_MODE_SET = new Set<string>(['rated', 'friendly']);
const RESULT_FORMAT_SET = new Set<string>(['classic_2x2', 'thai_8', 'king_sideout', 'legacy_custom']);
const RESULT_ENTRY_MODE_SET = new Set<string>(['after_game', 'live_lite']);

function text(value: unknown, max = 5000): string {
  return String(value ?? '').trim().slice(0, max);
}

function nullableText(value: unknown): string | null {
  const normalized = text(value, 100);
  return normalized || null;
}

function isoDate(value: unknown): string {
  const normalized = text(value, 100);
  const parsed = new Date(normalized);
  return normalized && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function nullableIsoDate(value: unknown): string | null {
  return nullableText(value) ? isoDate(value) : null;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferPlayResultFormat(value: unknown): PlayPostResultFormat {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (/2\s*[x×]\s*2/.test(normalized)) return 'classic_2x2';
  if (normalized.includes('thai') || normalized.includes('тай')) return 'thai_8';
  if (normalized.includes('king') || normalized.includes('сайд')) return 'king_sideout';
  return 'legacy_custom';
}

export function defaultPlayResultConfig(format: PlayPostResultFormat): Record<string, unknown> {
  if (format === 'classic_2x2') {
    return { pointLimit: 21, decidingPointLimit: 15, pairingMode: 'fixed', bestOf: 1 };
  }
  if (format === 'thai_8') {
    return { pointLimit: 15, pairingMode: 'random', tourCount: 4 };
  }
  if (format === 'king_sideout') {
    return { pointLimit: 15, pairingMode: 'random', roundDurationMinutes: 10 };
  }
  return {};
}

export function normalizePlayResultConfig(
  value: unknown,
  format: PlayPostResultFormat,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultPlayResultConfig(format);
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 20_000) return defaultPlayResultConfig(format);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    if (parsed.pointLimit == null && parsed.targetScore != null) parsed.pointLimit = parsed.targetScore;
    if (parsed.decidingPointLimit == null && parsed.decidingSetTargetScore != null) {
      parsed.decidingPointLimit = parsed.decidingSetTargetScore;
    }
    delete parsed.targetScore;
    delete parsed.decidingSetTargetScore;
    for (const key of ['pointLimit', 'decidingPointLimit', 'tourCount', 'bestOf', 'roundDurationMinutes']) {
      if (parsed[key] == null || parsed[key] === '') continue;
      const numeric = Number(parsed[key]);
      if (Number.isFinite(numeric)) parsed[key] = numeric;
    }
    if (format === 'king_sideout') parsed.pointLimit = 15;
    return { ...defaultPlayResultConfig(format), ...parsed };
  } catch {
    return defaultPlayResultConfig(format);
  }
}

export function validatePlayResultConfig(
  format: PlayPostResultFormat,
  config: Record<string, unknown>,
): string | null {
  if (format === 'legacy_custom') return null;
  const pointLimit = Number(config.pointLimit);
  if (!Number.isInteger(pointLimit) || ![11, 15, 21].includes(pointLimit)) {
    return 'Счёт игры может идти до 11, 15 или 21';
  }
  if (config.pairingMode != null && !['fixed', 'random'].includes(String(config.pairingMode))) {
    return 'Неизвестная механика составления пар';
  }
  if (format === 'king_sideout' && pointLimit !== 15) {
    return 'KING проводится до 15 очков';
  }
  if (format === 'classic_2x2') {
    const decidingPointLimit = Number(config.decidingPointLimit);
    if (
      !Number.isInteger(decidingPointLimit)
      || ![11, 15, 21].includes(decidingPointLimit)
      || decidingPointLimit > pointLimit
    ) {
      return 'Решающий сет должен идти до 11, 15 или 21 и не быть длиннее основного';
    }
    const bestOf = Number(config.bestOf);
    if (!Number.isInteger(bestOf) || bestOf < 1 || bestOf > 9 || bestOf % 2 === 0) {
      return 'Число сетов bestOf должно быть нечётным от 1 до 9';
    }
  }
  if (format === 'thai_8') {
    const tourCount = Number(config.tourCount);
    if (!Number.isInteger(tourCount) || tourCount < 1 || tourCount > 20) {
      return 'Количество туров тайской игры должно быть от 1 до 20';
    }
  }
  if (format === 'king_sideout') {
    const duration = Number(config.roundDurationMinutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      return 'Длительность раунда KING должна быть от 1 до 180 минут';
    }
  }
  return null;
}

export function normalizePlayPostInput(raw: Record<string, unknown>): PlayPostInput {
  const repeatWeeks = Math.trunc(Number(raw.repeatWeeks ?? raw.repeat_weeks ?? 1));
  const kind = (KIND_SET.has(String(raw.kind)) ? raw.kind : 'game') as PlayKind;
  const inferredResultFormat = inferPlayResultFormat(raw.formatLabel ?? raw.format_label ?? raw.title);
  const rawResultFormat = String(raw.resultFormat ?? raw.result_format ?? '');
  const resultFormatAliases: Record<string, PlayPostResultFormat> = {
    fixed_pairs: 'classic_2x2',
    thai: 'thai_8',
    king: 'king_sideout',
    custom: 'legacy_custom',
  };
  const resultFormat = RESULT_FORMAT_SET.has(rawResultFormat)
    ? rawResultFormat as PlayPostResultFormat
    : resultFormatAliases[rawResultFormat] ?? inferredResultFormat;
  const rawResultEntryMode = String(raw.resultEntryMode ?? raw.result_entry_mode ?? '');
  return {
    kind,
    organizerId: text(raw.organizerId ?? raw.organizer_id, 100),
    venueId: text(raw.venueId ?? raw.venue_id, 100),
    coachId: nullableText(raw.coachId ?? raw.coach_id),
    title: text(raw.title, 120),
    description: text(raw.description, 5000),
    formatLabel: text(raw.formatLabel ?? raw.format_label, 120),
    focus: text(raw.focus, 500),
    startsAt: isoDate(raw.startsAt ?? raw.starts_at),
    endsAt: isoDate(raw.endsAt ?? raw.ends_at),
    registrationClosesAt: nullableIsoDate(raw.registrationClosesAt ?? raw.registration_closes_at),
    gatherDeadline: nullableIsoDate(raw.gatherDeadline ?? raw.gather_deadline),
    levelMin: normalizePlayLevel(raw.levelMin ?? raw.level_min),
    levelMax: normalizePlayLevel(raw.levelMax ?? raw.level_max),
    genderPolicy: (GENDER_SET.has(String(raw.genderPolicy ?? raw.gender_policy))
      ? raw.genderPolicy ?? raw.gender_policy
      : 'any') as PlayGenderPolicy,
    capacity: Math.trunc(Number(raw.capacity)),
    minPlayers: nullableInt(raw.minPlayers ?? raw.min_players),
    priceMode: (PRICE_MODE_SET.has(String(raw.priceMode ?? raw.price_mode))
      ? raw.priceMode ?? raw.price_mode
      : 'fixed') as PlayPriceMode,
    priceRub: Math.trunc(Number(raw.priceRub ?? raw.price_rub ?? 0)),
    courtCostRub: nullableInt(raw.courtCostRub ?? raw.court_cost_rub),
    courtBooked: Boolean(raw.courtBooked ?? raw.court_booked ?? false),
    visibility: (VISIBILITY_SET.has(String(raw.visibility)) ? raw.visibility : 'public') as PlayVisibility,
    joinPolicy: (JOIN_POLICY_SET.has(String(raw.joinPolicy ?? raw.join_policy))
      ? raw.joinPolicy ?? raw.join_policy
      : 'request') as PlayJoinPolicy,
    status: (STATUS_SET.has(String(raw.status)) ? raw.status : 'draft') as PlayPostStatus,
    ratingMode: (RATING_MODE_SET.has(String(raw.ratingMode ?? raw.rating_mode))
      ? raw.ratingMode ?? raw.rating_mode
      : kind === 'training' ? 'friendly' : 'rated') as PlayRatingMode,
    resultFormat,
    resultConfig: normalizePlayResultConfig(raw.resultConfig ?? raw.result_config, resultFormat),
    resultEntryMode: (RESULT_ENTRY_MODE_SET.has(rawResultEntryMode)
      ? rawResultEntryMode
      : rawResultEntryMode === 'quick' ? 'after_game' : 'after_game') as PlayResultEntryMode,
    repeatWeeks: Number.isFinite(repeatWeeks) ? repeatWeeks : 1,
    joinAuthor: raw.joinAuthor === undefined && raw.join_author === undefined
      ? true
      : Boolean(raw.joinAuthor ?? raw.join_author),
  };
}

export function validatePlayResultApproval(input: {
  ratingMode: PlayRatingMode;
  confirmedCount: number;
  registeredCount: number;
  hasStructuredPayload: boolean;
}): string | null {
  if (input.ratingMode === 'friendly') return null;
  if (input.confirmedCount < 1) return 'В рейтинговой игре нужен подтверждённый состав';
  if (input.registeredCount !== input.confirmedCount) {
    return 'Рейтинговый результат можно утвердить только после привязки всех игроков к аккаунтам';
  }
  if (!input.hasStructuredPayload) {
    return 'Для рейтинговой игры нужен структурированный счёт';
  }
  return null;
}

export function validatePlayPostInput(input: PlayPostInput): string | null {
  if (!input.venueId) return 'Выберите площадку';
  if (input.title.length < 3) return 'Название должно содержать минимум 3 символа';
  if (!input.startsAt || !input.endsAt) return 'Укажите корректные дату и время';
  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();
  if (endsAt <= startsAt) return 'Время окончания должно быть позже начала';
  if (input.registrationClosesAt && new Date(input.registrationClosesAt).getTime() > startsAt) {
    return 'Запись должна закрываться не позднее начала события';
  }
  if (input.gatherDeadline && new Date(input.gatherDeadline).getTime() > startsAt) {
    return 'Дедлайн сбора должен быть не позднее начала события';
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100) {
    return 'Количество мест должно быть от 1 до 100';
  }
  if (input.minPlayers != null) {
    if (!Number.isInteger(input.minPlayers) || input.minPlayers < 2) {
      return 'Минимальный состав — от 2 игроков';
    }
    if (input.minPlayers > input.capacity) {
      return 'Минимальный состав не может превышать количество мест';
    }
  }
  if (!Number.isInteger(input.priceRub) || input.priceRub < 0 || input.priceRub > 1_000_000) {
    return 'Укажите корректную стоимость';
  }
  if (input.priceMode === 'split') {
    if (!input.courtCostRub || input.courtCostRub < 1 || input.courtCostRub > 1_000_000) {
      return 'Для делёжки корта укажите его стоимость';
    }
  }
  if (input.repeatWeeks < 1 || input.repeatWeeks > 12) return 'Повтор доступен на срок от 1 до 12 недель';
  if (input.kind === 'training' && input.ratingMode === 'rated') {
    return 'Тренировка не может быть рейтинговой игрой';
  }
  const resultConfigError = validatePlayResultConfig(input.resultFormat, input.resultConfig);
  if (resultConfigError) return resultConfigError;
  if (input.levelMin && input.levelMax) {
    if (PLAY_LEVELS.indexOf(input.levelMin) > PLAY_LEVELS.indexOf(input.levelMax)) {
      return 'Минимальный уровень не может быть выше максимального';
    }
  }
  return null;
}

export function expandWeeklyOccurrences(
  startsAt: string,
  endsAt: string,
  occurrences: number
): Array<{ startsAt: string; endsAt: string }> {
  const count = Math.max(1, Math.min(12, Math.trunc(occurrences)));
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return Array.from({ length: count }, (_, index) => ({
    startsAt: new Date(start.getTime() + index * 7 * 24 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(end.getTime() + index * 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

export function calculatePlayFit(input: {
  playerLevel: PlayLevel | null;
  playerGender: 'M' | 'W' | null;
  levelMin: PlayLevel | null;
  levelMax: PlayLevel | null;
  genderPolicy: PlayGenderPolicy;
}): PlayFit {
  if (!input.playerLevel || !input.playerGender) return 'unknown';
  if (input.genderPolicy === 'M' && input.playerGender !== 'M') return 'gender_mismatch';
  if (input.genderPolicy === 'W' && input.playerGender !== 'W') return 'gender_mismatch';
  const playerIndex = PLAY_LEVELS.indexOf(input.playerLevel);
  if (input.levelMin && playerIndex < PLAY_LEVELS.indexOf(input.levelMin)) return 'level_too_high';
  if (input.levelMax && playerIndex > PLAY_LEVELS.indexOf(input.levelMax)) return 'level_too_low';
  return 'match';
}

// D3: gather-состояния — производные, нигде не хранятся.
export function deriveGatherState(input: {
  status: PlayPostStatus;
  confirmedCount: number;
  capacity: number;
  minPlayers: number | null;
  registrationClosesAt: string | null;
  gatherDeadline: string | null;
  now?: number;
}): PlayGatherState | null {
  if (input.status !== 'published') return null;
  const now = input.now ?? Date.now();
  if (input.confirmedCount >= input.capacity) return 'full';
  if (input.registrationClosesAt && new Date(input.registrationClosesAt).getTime() <= now) {
    return 'closed';
  }
  const minimum = input.minPlayers ?? input.capacity;
  if (input.confirmedCount >= minimum) return 'minimum_reached';
  if (input.gatherDeadline && new Date(input.gatherDeadline).getTime() <= now) {
    return 'at_risk';
  }
  return 'filling';
}

// Честный показ цены (D5): fixed — точная сумма; split — оценка «~X ₽».
export function estimatePricePerPerson(input: {
  priceMode: PlayPriceMode;
  priceRub: number;
  courtCostRub: number | null;
  confirmedCount: number;
  minPlayers: number | null;
  capacity: number;
}): { amount: number; approximate: boolean } {
  if (input.priceMode === 'fixed') return { amount: input.priceRub, approximate: false };
  const divisor = Math.max(input.confirmedCount, input.minPlayers ?? input.capacity, 1);
  return {
    amount: Math.ceil((input.courtCostRub ?? 0) / divisor),
    approximate: true,
  };
}

// Скоринг «Для тебя» — внутренний, в UI не показывается (принцип №3).
export function scoreForYou(input: {
  fit: PlayFit;
  availabilityOverlap: boolean;
  pastTeammatesCount: number;
  gatherState: PlayGatherState | null;
  startsAt: string;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  let score = 0;
  if (input.fit === 'match') score += 3;
  if (input.availabilityOverlap) score += 2;
  if (input.pastTeammatesCount > 0) score += 2;
  if (input.gatherState === 'minimum_reached') score += 1;
  if (new Date(input.startsAt).getTime() - now > 7 * 24 * 60 * 60 * 1000) score -= 1;
  return score;
}
