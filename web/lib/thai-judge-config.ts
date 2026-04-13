import {
  THAI_ADMIN_FORMAT,
  getThaiSeatCount,
  normalizeThaiAdminSettings,
  normalizeThaiRulesPreset,
  validateThaiRoster,
} from './admin-legacy-sync';

export const THAI_JUDGE_MODULE_LEGACY = 'legacy';
export const THAI_JUDGE_MODULE_NEXT = 'next';
export const THAI_STRUCTURAL_DRIFT_LOCKED_CODE = 'STRUCTURAL_DRIFT_LOCKED';

export type ThaiJudgeModule =
  | typeof THAI_JUDGE_MODULE_LEGACY
  | typeof THAI_JUDGE_MODULE_NEXT;

export const THAI_NEXT_JUDGE_DEFAULT_COURTS = 4;
export const THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT = 4;
export const THAI_NEXT_JUDGE_MIN_COURTS = 1;
export const THAI_NEXT_JUDGE_MAX_COURTS = 4;
export const THAI_NEXT_JUDGE_MIN_TOURS = 1;
export const THAI_NEXT_JUDGE_MAX_TOURS = 4;

export interface ThaiJudgeStructureParticipant {
  playerId: string;
  gender: 'M' | 'W';
  position?: number | null;
  isWaitlist?: boolean | null;
}

function toFiniteInt(value: unknown): number | null {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlayerId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizePlayerGender(value: unknown): 'M' | 'W' {
  return String(value ?? '').trim().toUpperCase() === 'W' ? 'W' : 'M';
}

function isWaitlistParticipant(value: boolean | null | undefined): boolean {
  return value === true;
}

function sortParticipants<T extends { position?: number | null }>(participants: T[]): T[] {
  return [...participants].sort((left, right) => {
    const leftPosition = toFiniteInt(left.position);
    const rightPosition = toFiniteInt(right.position);
    if (leftPosition == null && rightPosition == null) return 0;
    if (leftPosition == null) return 1;
    if (rightPosition == null) return -1;
    return leftPosition - rightPosition;
  });
}

export function isExactThaiTournamentFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === THAI_ADMIN_FORMAT.toLowerCase();
}

export function normalizeThaiJudgeModule(
  value: unknown,
  fallback: ThaiJudgeModule = THAI_JUDGE_MODULE_LEGACY,
): ThaiJudgeModule {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === THAI_JUDGE_MODULE_NEXT) return THAI_JUDGE_MODULE_NEXT;
  if (normalized === THAI_JUDGE_MODULE_LEGACY) return THAI_JUDGE_MODULE_LEGACY;
  return fallback;
}

export function normalizeThaiJudgeBootstrapSignature(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export function inferThaiJudgeModuleFromSettings(
  settings: Record<string, unknown> | null | undefined,
  fallback: ThaiJudgeModule = THAI_JUDGE_MODULE_LEGACY,
): ThaiJudgeModule {
  const explicitValue = settings?.thaiJudgeModule;
  if (explicitValue != null && String(explicitValue).trim()) {
    return normalizeThaiJudgeModule(explicitValue, fallback);
  }
  if (normalizeThaiJudgeBootstrapSignature(settings?.thaiJudgeBootstrapSignature)) {
    return THAI_JUDGE_MODULE_NEXT;
  }
  return fallback;
}

function stripRulesFromThaiJudgeSignature(signature: string): string {
  return signature.replace(/;rules=[^;]*/, '');
}

export function thaiJudgeBootstrapSignaturesMatch(
  left: unknown,
  right: unknown,
): boolean {
  const normalizedLeft = normalizeThaiJudgeBootstrapSignature(left);
  const normalizedRight = normalizeThaiJudgeBootstrapSignature(right);
  if (!normalizedLeft || !normalizedRight) return normalizedLeft === normalizedRight;
  if (normalizedLeft === normalizedRight) return true;

  // Older initialized tournaments persisted signatures before rules preset
  // became part of the structural lock. Keep those signatures compatible.
  return stripRulesFromThaiJudgeSignature(normalizedLeft) === stripRulesFromThaiJudgeSignature(normalizedRight);
}

export function buildThaiJudgeStructuralSignature(input: {
  settings?: Record<string, unknown>;
  participants: Array<Pick<ThaiJudgeStructureParticipant, 'playerId' | 'position' | 'isWaitlist'>>;
}): string {
  const settings = input.settings ?? {};
  const mainParticipants = sortParticipants(
    input.participants.filter((participant) => !isWaitlistParticipant(participant.isWaitlist)),
  );
  const thaiSettings = normalizeThaiAdminSettings(settings, mainParticipants.length);
  const playerIds = mainParticipants
    .map((participant) => normalizePlayerId(participant.playerId))
    .filter(Boolean)
    .join(',');

  const rules = normalizeThaiRulesPreset(settings.thaiRulesPreset);
  return `variant=${thaiSettings.variant};courts=${thaiSettings.courts};tours=${thaiSettings.tourCount};rules=${rules};players=${playerIds}`;
}

export function validateThaiNextStructuralLock(input: {
  currentTournament?: {
    format?: unknown;
    settings?: Record<string, unknown>;
  } | null;
  nextTournament: {
    format: unknown;
    settings?: Record<string, unknown>;
    participants: Array<Pick<ThaiJudgeStructureParticipant, 'playerId' | 'position' | 'isWaitlist'>>;
  };
}): { code: typeof THAI_STRUCTURAL_DRIFT_LOCKED_CODE; message: string } | null {
  const storedSignature = normalizeThaiJudgeBootstrapSignature(
    input.currentTournament?.settings?.thaiJudgeBootstrapSignature,
  );
  if (!storedSignature) {
    return null;
  }

  if (!isExactThaiTournamentFormat(input.nextTournament.format)) {
    return {
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'Cannot change tournament format. Structural Thai Next state already initialized.',
    };
  }

  const nextModule = normalizeThaiJudgeModule(
    input.nextTournament.settings?.thaiJudgeModule,
    THAI_JUDGE_MODULE_NEXT,
  );
  if (nextModule !== THAI_JUDGE_MODULE_NEXT) {
    return {
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'Cannot downgrade judge module after Thai Next state initialization.',
    };
  }

  const nextSignature = buildThaiJudgeStructuralSignature({
    settings: input.nextTournament.settings,
    participants: input.nextTournament.participants,
  });
  if (!thaiJudgeBootstrapSignaturesMatch(storedSignature, nextSignature)) {
    return {
      code: THAI_STRUCTURAL_DRIFT_LOCKED_CODE,
      message: 'structural Thai Next state already initialized; reset/recreate flow required',
    };
  }

  return null;
}

export function validateThaiNextTournamentSetup(input: {
  format: unknown;
  settings?: Record<string, unknown>;
  participants: ThaiJudgeStructureParticipant[];
}): string | null {
  if (!isExactThaiTournamentFormat(input.format)) {
    return 'Thai Next judge module requires Thai format';
  }

  const settings = input.settings ?? {};
  const normalizedSettings = normalizeThaiAdminSettings(settings, input.participants.length);
  const courts = toFiniteInt(settings.courts) ?? normalizedSettings.courts;
  const tourCount =
    toFiniteInt(settings.tourCount ?? settings.tours ?? settings.stageCount) ?? normalizedSettings.tourCount;

  if (courts < THAI_NEXT_JUDGE_MIN_COURTS || courts > THAI_NEXT_JUDGE_MAX_COURTS) {
    return `Thai Next judge module supports ${THAI_NEXT_JUDGE_MIN_COURTS}-${THAI_NEXT_JUDGE_MAX_COURTS} courts`;
  }
  if (tourCount < THAI_NEXT_JUDGE_MIN_TOURS || tourCount > THAI_NEXT_JUDGE_MAX_TOURS) {
    return `Thai Next judge module supports ${THAI_NEXT_JUDGE_MIN_TOURS}-${THAI_NEXT_JUDGE_MAX_TOURS} tours`;
  }

  const orderedParticipants = sortParticipants(input.participants);
  if (orderedParticipants.some((participant) => isWaitlistParticipant(participant.isWaitlist))) {
    return 'Thai Next judge module requires a full starting roster without waitlist players';
  }

  const expectedCount = getThaiSeatCount(courts);
  if (orderedParticipants.length !== expectedCount) {
    return `Thai Next judge module requires exactly ${expectedCount} starting players`;
  }

  const seen = new Set<string>();
  const roster = orderedParticipants.map((participant) => {
    const playerId = normalizePlayerId(participant.playerId);
    if (!playerId) return null;
    if (seen.has(playerId)) return false;
    seen.add(playerId);
    return {
      id: playerId,
      gender: normalizePlayerGender(participant.gender),
    };
  });

  if (roster.some((participant) => participant === null)) {
    return 'Thai Next judge module requires player ids for every starting slot';
  }
  if (roster.some((participant) => participant === false)) {
    return 'Participant list contains duplicates';
  }

  return (
    validateThaiRoster(roster.filter((participant): participant is { id: string; gender: 'M' | 'W' } => Boolean(participant)), {
      courts,
      thaiVariant: normalizedSettings.variant,
      tourCount,
    }) ?? null
  );
}
