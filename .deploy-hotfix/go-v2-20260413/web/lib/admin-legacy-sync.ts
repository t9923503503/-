export const THAI_ADMIN_FORMAT = 'Thai';
export const IPT_MIXED_FORMAT = 'IPT Mixed';
export const KOTC_ADMIN_FORMAT = 'King of the Court';
export const GO_ADMIN_FORMAT = 'Groups + Olympic';

export const THAI_ADMIN_MIN_COURTS = 1;
export const THAI_ADMIN_MAX_COURTS = Number.MAX_SAFE_INTEGER;
export const THAI_ADMIN_COURTS = 4;
export const THAI_ADMIN_PLAYERS_PER_COURT = 8;
export const THAI_ADMIN_SEAT_COUNT = THAI_ADMIN_PLAYERS_PER_COURT;
export const THAI_ADMIN_TOUR_COUNT_DEFAULT = 4;
export const THAI_ADMIN_POINT_LIMIT_MIN = 9;
export const THAI_ADMIN_POINT_LIMIT_DEFAULT = 15;
export const THAI_ADMIN_POINT_LIMIT_MAX = 21;

export const IPT_MIXED_MIN_COURTS = THAI_ADMIN_MIN_COURTS;
export const IPT_MIXED_MAX_COURTS = 4;
export const IPT_MIXED_COURTS = 2;
export const IPT_MIXED_PLAYERS_PER_COURT = THAI_ADMIN_PLAYERS_PER_COURT;
export const IPT_MIXED_SEAT_COUNT = IPT_MIXED_PLAYERS_PER_COURT;
export const IPT_MIXED_POINT_LIMIT_MIN = 9;
export const IPT_MIXED_POINT_LIMIT_DEFAULT = 21;
export const IPT_MIXED_POINT_LIMIT_MAX = 21;

export const KOTC_JUDGE_MODULES = ['legacy', 'next'] as const;
export type KotcJudgeModule = (typeof KOTC_JUDGE_MODULES)[number];
export const KOTC_ADMIN_MIN_COURTS = 1;
export const KOTC_ADMIN_MAX_COURTS = 4;
export const KOTC_ADMIN_DEFAULT_COURTS = 2;
export const KOTC_ADMIN_MIN_PPC = 3;
export const KOTC_ADMIN_MAX_PPC = 5;
export const KOTC_ADMIN_DEFAULT_PPC = 4;
export const KOTC_ADMIN_MIN_RAUNDS = 1;
export const KOTC_ADMIN_MAX_RAUNDS = 4;
export const KOTC_ADMIN_DEFAULT_RAUNDS = 2;
export const KOTC_ADMIN_MIN_TIMER = 9;
export const KOTC_ADMIN_MAX_TIMER = 20;
export const KOTC_ADMIN_DEFAULT_TIMER = 10;
export const GO_ADMIN_MIN_COURTS = 1;
export const GO_ADMIN_MAX_COURTS = 7;
export const GO_ADMIN_DEFAULT_COURTS = 3;
export const GO_ADMIN_MIN_GROUPS = 1;
export const GO_ADMIN_MAX_GROUPS = 32;
export const GO_ADMIN_DEFAULT_GROUPS = 4;
export const GO_ADMIN_MIN_TEAMS_PER_GROUP = 3;
export const GO_ADMIN_MAX_TEAMS_PER_GROUP = 4;
export const GO_ADMIN_DEFAULT_TEAMS_PER_GROUP = 4;
export const GO_ADMIN_DEFAULT_GROUP_FORMULA = { hard: 2, medium: 1, lite: 1 } as const;
export const GO_ADMIN_DEFAULT_SLOT_MINUTES = 30;
export const GO_ADMIN_DEFAULT_START_TIME = '08:00';
export const GO_ADMIN_PLAYOFF_LEAGUES = ['lyutye', 'hard', 'medium', 'lite'] as const;
export const GO_ADMIN_MIN_BRACKET_LEVELS = 2;
export const GO_ADMIN_MAX_BRACKET_LEVELS = 4;
export const GO_ADMIN_DEFAULT_BRACKET_LEVELS = 3;
export const GO_BRACKET_LEVEL_LABELS = GO_ADMIN_PLAYOFF_LEAGUES;

export const THAI_VARIANTS = ['MF', 'MN', 'MM', 'WW'] as const;
export type ThaiVariant = (typeof THAI_VARIANTS)[number];
export const THAI_ROSTER_MODES = ['manual', 'random'] as const;
export type ThaiRosterMode = (typeof THAI_ROSTER_MODES)[number];

/** Ранжирование и (для MF/MN) согласованная сетка R1: победы → P → K → мячи; расписание как в спецификации v2. */
export const THAI_RULES_PRESETS = ['legacy', 'balanced_v2'] as const;
export type ThaiRulesPreset = (typeof THAI_RULES_PRESETS)[number];

export function normalizeThaiRulesPreset(value: unknown): ThaiRulesPreset {
  return String(value ?? '').trim().toLowerCase() === 'balanced_v2' ? 'balanced_v2' : 'legacy';
}

export type ThaiTourCount = number; // 1..N
export const THAI_ADMIN_MIN_TOURS = 1;
export const THAI_ADMIN_MAX_TOURS = Number.MAX_SAFE_INTEGER;

export type LegacySyncPlayer = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status?: string;
  ratingM?: number;
  ratingW?: number;
  ratingMix?: number;
  wins?: number;
  totalPts?: number;
  tournaments?: number;
  tournamentsM?: number;
  tournamentsW?: number;
  tournamentsMix?: number;
  lastSeen?: string;
  iptWins?: number;
  iptDiff?: number;
  iptPts?: number;
  iptMatches?: number;
};

export type LegacySyncTournamentInput = {
  id: string;
  name: string;
  date: string;
  time?: string;
  location?: string;
  format: string;
  division: string;
  level: string;
  status: string;
  settings?: Record<string, unknown>;
  participants: LegacySyncPlayer[];
};

type IptFinishType = 'hard' | 'balance';

function toFiniteInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeFinishType(value: unknown): IptFinishType {
  return String(value ?? '').trim().toLowerCase() === 'balance' ? 'balance' : 'hard';
}

function normalizePlayerGender(value: unknown): 'M' | 'W' {
  return String(value ?? '').trim().toUpperCase() === 'W' ? 'W' : 'M';
}

export function normalizeThaiVariant(value: unknown): ThaiVariant {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'MN' || normalized === 'MM' || normalized === 'WW') return normalized;
  return 'MF';
}

export function normalizeThaiTourCount(value: unknown): ThaiTourCount {
  const v = Math.floor(Number(value));
  if (Number.isFinite(v) && v >= THAI_ADMIN_MIN_TOURS && v <= THAI_ADMIN_MAX_TOURS) return v;
  return THAI_ADMIN_TOUR_COUNT_DEFAULT;
}

export function normalizeThaiRosterMode(value: unknown): ThaiRosterMode {
  return String(value ?? '').trim().toLowerCase() === 'random' ? 'random' : 'manual';
}

export function isThaiAdminFormat(format: unknown): boolean {
  const normalized = String(format ?? '').trim().toLowerCase();
  return normalized === THAI_ADMIN_FORMAT.toLowerCase() || normalized === IPT_MIXED_FORMAT.toLowerCase();
}

export function isIptMixedFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === IPT_MIXED_FORMAT.toLowerCase();
}

export function isKotcAdminFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === KOTC_ADMIN_FORMAT.toLowerCase();
}

export function isGoAdminFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === GO_ADMIN_FORMAT.toLowerCase();
}

export function getThaiSeatCount(courts: number): number {
  return clamp(Math.floor(Number(courts) || 0), THAI_ADMIN_MIN_COURTS, THAI_ADMIN_MAX_COURTS) * THAI_ADMIN_SEAT_COUNT;
}

export function getIptMixedSeatCount(courts: number): number {
  return clamp(Math.floor(Number(courts) || 0), IPT_MIXED_MIN_COURTS, IPT_MIXED_MAX_COURTS) * IPT_MIXED_SEAT_COUNT;
}

export function getKotcSeatCount(courts: number, ppc = KOTC_ADMIN_DEFAULT_PPC): number {
  const normalizedCourts = clamp(Math.floor(Number(courts) || 0), KOTC_ADMIN_MIN_COURTS, KOTC_ADMIN_MAX_COURTS);
  const normalizedPpc = clamp(Math.floor(Number(ppc) || 0), KOTC_ADMIN_MIN_PPC, KOTC_ADMIN_MAX_PPC);
  return normalizedCourts * normalizedPpc * 2;
}

export function getGoSeatCount(groups: number, teamsPerGroup: number): number {
  const normalizedGroups = Math.max(1, Math.floor(Number(groups) || 0));
  const normalizedTeamsPerGroup = clamp(
    Math.floor(Number(teamsPerGroup) || 0),
    GO_ADMIN_MIN_TEAMS_PER_GROUP,
    GO_ADMIN_MAX_TEAMS_PER_GROUP,
  );
  return normalizedGroups * normalizedTeamsPerGroup * 2;
}

function inferCourtCount(participantCount: unknown, fallback: number): number {
  const parsed = Math.floor(Number(participantCount) || 0);
  if (parsed > 0) {
    return clamp(Math.ceil(parsed / THAI_ADMIN_SEAT_COUNT), THAI_ADMIN_MIN_COURTS, THAI_ADMIN_MAX_COURTS);
  }
  return clamp(fallback, THAI_ADMIN_MIN_COURTS, THAI_ADMIN_MAX_COURTS);
}

function inferIptCourtCount(participantCount: unknown, fallback: number): number {
  return inferCourtCount(participantCount, fallback);
}

function inferKotcCourtCount(participantCount: unknown, ppc: number, fallback: number): number {
  const parsed = Math.floor(Number(participantCount) || 0);
  if (parsed > 0) {
    const playersPerCourt = Math.max(1, ppc * 2);
    return clamp(
      Math.ceil(parsed / playersPerCourt),
      KOTC_ADMIN_MIN_COURTS,
      KOTC_ADMIN_MAX_COURTS,
    );
  }
  return clamp(fallback, KOTC_ADMIN_MIN_COURTS, KOTC_ADMIN_MAX_COURTS);
}

function inferGoTeamsPerGroup(participantCount: unknown, groupCount: number, fallback: number): number {
  const parsed = Math.floor(Number(participantCount) || 0);
  if (parsed > 0 && groupCount > 0) {
    return clamp(
      Math.ceil(parsed / 2 / groupCount),
      GO_ADMIN_MIN_TEAMS_PER_GROUP,
      GO_ADMIN_MAX_TEAMS_PER_GROUP,
    );
  }
  return clamp(fallback, GO_ADMIN_MIN_TEAMS_PER_GROUP, GO_ADMIN_MAX_TEAMS_PER_GROUP);
}

function normalizeGoPlayoffLeague(value: unknown): typeof GO_ADMIN_PLAYOFF_LEAGUES[number] | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return GO_ADMIN_PLAYOFF_LEAGUES.find((league) => league === normalized) ?? null;
}

function sortGoPlayoffLeagues(
  value: unknown,
): Array<(typeof GO_ADMIN_PLAYOFF_LEAGUES)[number]> {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? String(value)
          .split(',')
          .map((item) => item.trim())
      : [];
  const selected = new Set(
    raw
      .map((item) => normalizeGoPlayoffLeague(item))
      .filter((item): item is (typeof GO_ADMIN_PLAYOFF_LEAGUES)[number] => Boolean(item)),
  );
  const ordered = GO_ADMIN_PLAYOFF_LEAGUES.filter((league) => selected.has(league));
  if (ordered.length >= 2) return ordered;
  return ['hard', 'medium', 'lite'];
}

function normalizeGoGroupFormula(source: Record<string, unknown>) {
  const hard = clamp(toFiniteInt(source.goGroupFormulaHard ?? source.groupFormulaHard, GO_ADMIN_DEFAULT_GROUP_FORMULA.hard), 0, 4);
  const medium = clamp(
    toFiniteInt(source.goGroupFormulaMedium ?? source.groupFormulaMedium, GO_ADMIN_DEFAULT_GROUP_FORMULA.medium),
    0,
    4,
  );
  const lite = clamp(toFiniteInt(source.goGroupFormulaLite ?? source.groupFormulaLite, GO_ADMIN_DEFAULT_GROUP_FORMULA.lite), 0, 4);
  const total = hard + medium + lite;
  if (total < GO_ADMIN_MIN_TEAMS_PER_GROUP || total > GO_ADMIN_MAX_TEAMS_PER_GROUP) {
    return { ...GO_ADMIN_DEFAULT_GROUP_FORMULA };
  }
  return { hard, medium, lite };
}

function normalizeGoBracketSizeForLeague(
  league: (typeof GO_ADMIN_PLAYOFF_LEAGUES)[number],
  value: unknown,
): number {
  const fallback = league === 'lyutye' || league === 'hard' ? 4 : 2;
  const normalized = clamp(toFiniteInt(value, fallback), 2, 16);
  if (league === 'lyutye' || league === 'hard') {
    return normalized <= 4 ? 4 : normalized <= 8 ? 8 : 16;
  }
  if (normalized <= 2) return 2;
  if (normalized <= 4) return 4;
  if (normalized <= 8) return 8;
  return 16;
}

export function getThaiDivisionLabel(variant: unknown): string {
  switch (normalizeThaiVariant(variant)) {
    case 'MN':
      return 'Мужской';
    case 'MM':
      return 'Мужской';
    case 'WW':
      return 'Женский';
    default:
      return 'Микст';
  }
}

export function normalizeThaiAdminSettings(settings?: Record<string, unknown>, participantCount?: unknown) {
  const source = settings ?? {};
  const fallbackCourts = inferCourtCount(participantCount, THAI_ADMIN_COURTS);
  const courts = clamp(toFiniteInt(source.courts, fallbackCourts), THAI_ADMIN_MIN_COURTS, THAI_ADMIN_MAX_COURTS);
  return {
    courts,
    playersPerCourt: THAI_ADMIN_PLAYERS_PER_COURT,
    variant: normalizeThaiVariant(source.thaiVariant ?? source.variant ?? source.mode),
    tourCount: normalizeThaiTourCount(source.tourCount ?? source.tours ?? source.stageCount),
    rosterMode: normalizeThaiRosterMode(source.thaiRosterMode ?? source.rosterMode),
    thaiRulesPreset: normalizeThaiRulesPreset(source.thaiRulesPreset),
    pointLimit: clamp(
      toFiniteInt(source.thaiPointLimit ?? source.pointLimit, THAI_ADMIN_POINT_LIMIT_DEFAULT),
      THAI_ADMIN_POINT_LIMIT_MIN,
      THAI_ADMIN_POINT_LIMIT_MAX,
    ),
  };
}

export function normalizeKotcJudgeModule(value: unknown, fallback: KotcJudgeModule = 'next'): KotcJudgeModule {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'legacy') return 'legacy';
  if (normalized === 'next') return 'next';
  return fallback;
}

export function normalizeKotcJudgeBootstrapSignature(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  return raw || null;
}

export function normalizeKotcAdminSettings(settings?: Record<string, unknown>, participantCount?: unknown) {
  const source = settings ?? {};
  const ppc = clamp(
    toFiniteInt(source.kotcPpc ?? source.ppc, KOTC_ADMIN_DEFAULT_PPC),
    KOTC_ADMIN_MIN_PPC,
    KOTC_ADMIN_MAX_PPC,
  );
  const fallbackCourts = inferKotcCourtCount(participantCount, ppc, KOTC_ADMIN_DEFAULT_COURTS);
  const courts = clamp(
    toFiniteInt(source.courts, fallbackCourts),
    KOTC_ADMIN_MIN_COURTS,
    KOTC_ADMIN_MAX_COURTS,
  );
  return {
    courts,
    playersPerCourt: ppc * 2,
    ppc,
    raundCount: clamp(
      toFiniteInt(source.kotcRaundCount ?? source.raundCount, KOTC_ADMIN_DEFAULT_RAUNDS),
      KOTC_ADMIN_MIN_RAUNDS,
      KOTC_ADMIN_MAX_RAUNDS,
    ),
    raundTimerMinutes: clamp(
      toFiniteInt(source.kotcRaundTimerMinutes ?? source.raundTimerMinutes, KOTC_ADMIN_DEFAULT_TIMER),
      KOTC_ADMIN_MIN_TIMER,
      KOTC_ADMIN_MAX_TIMER,
    ),
    kotcJudgeModule: normalizeKotcJudgeModule(source.kotcJudgeModule),
    kotcJudgeBootstrapSignature: normalizeKotcJudgeBootstrapSignature(source.kotcJudgeBootstrapSignature),
  };
}

function normalizeGoMatchFormat(value: unknown): 'single15' | 'single21' | 'bo3' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'single21') return 'single21';
  if (normalized === 'bo3') return 'bo3';
  return 'single15';
}

function normalizeGoSeedingMode(value: unknown): 'serpentine' | 'random' | 'manual' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'random') return 'random';
  if (normalized === 'manual') return 'manual';
  return 'serpentine';
}

function normalizeGoMatchPointSystem(value: unknown): 'fivb' | 'simple' {
  return String(value ?? '').trim().toLowerCase() === 'simple' ? 'simple' : 'fivb';
}

function normalizeGoTieBreakerLogic(value: unknown): 'fivb' | 'classic' {
  return String(value ?? '').trim().toLowerCase() === 'classic' ? 'classic' : 'fivb';
}

export function normalizeGoAdminSettings(
  settings?: Record<string, unknown>,
  participantCount?: unknown
): {
  courts: number;
  groupFormula: { hard: number; medium: number; lite: number };
  groupSlotSize: number;
  matchFormat: 'single15' | 'single21' | 'bo3';
  pointLimitGroup: number;
  pointLimitBracket: number;
  seedingMode: 'serpentine' | 'random' | 'manual';
  slotMinutes: number;
  startTime: string;
  enabledPlayoffLeagues: Array<(typeof GO_ADMIN_PLAYOFF_LEAGUES)[number]>;
  bracketSizes: Partial<Record<(typeof GO_ADMIN_PLAYOFF_LEAGUES)[number], number>>;
  bronzeMatchEnabled: boolean;
  bracketLevels: number;
  matchPointSystem: 'fivb' | 'simple';
  tieBreakerLogic: 'fivb' | 'classic';
} {
  const source = settings ?? {};
  const groupFormula = normalizeGoGroupFormula(source);
  const groupSlotSize = groupFormula.hard + groupFormula.medium + groupFormula.lite;
  const matchFormat = normalizeGoMatchFormat(source.goMatchFormat ?? source.matchFormat);
  const defaultPointLimit = matchFormat === 'single21' ? 21 : 15;
  const enabledPlayoffLeagues = sortGoPlayoffLeagues(
    source.goEnabledPlayoffLeagues ?? source.enabledPlayoffLeagues ?? source.goPlayoffPreset,
  );
  const bracketSizes = Object.fromEntries(
    enabledPlayoffLeagues.map((league) => [
      league,
      normalizeGoBracketSizeForLeague(
        league,
        source[`goBracketSize_${league}`] ??
          (source.goBracketSizes && typeof source.goBracketSizes === 'object'
            ? (source.goBracketSizes as Record<string, unknown>)[league]
            : undefined) ??
          (source.bracketSizes && typeof source.bracketSizes === 'object'
            ? (source.bracketSizes as Record<string, unknown>)[league]
            : undefined),
      ),
    ]),
  ) as Partial<Record<(typeof GO_ADMIN_PLAYOFF_LEAGUES)[number], number>>;
  const parsedStart = String(source.goStartTime ?? source.startTime ?? GO_ADMIN_DEFAULT_START_TIME).trim();
  const startTime = /^\d{2}:\d{2}$/.test(parsedStart) ? parsedStart : GO_ADMIN_DEFAULT_START_TIME;

  return {
    courts: clamp(
      toFiniteInt(source.goCourts ?? source.courts, GO_ADMIN_DEFAULT_COURTS),
      GO_ADMIN_MIN_COURTS,
      GO_ADMIN_MAX_COURTS,
    ),
    groupFormula,
    groupSlotSize,
    matchFormat,
    pointLimitGroup: clamp(
      toFiniteInt(source.goPointLimitGroup ?? source.pointLimitGroup, defaultPointLimit),
      1,
      99,
    ),
    pointLimitBracket: clamp(
      toFiniteInt(source.goPointLimitBracket ?? source.pointLimitBracket, defaultPointLimit),
      1,
      99,
    ),
    seedingMode: normalizeGoSeedingMode(source.goSeedingMode ?? source.seedingMode),
    slotMinutes: clamp(
      toFiniteInt(source.goSlotMinutes ?? source.slotMinutes, GO_ADMIN_DEFAULT_SLOT_MINUTES),
      10,
      120,
    ),
    startTime,
    enabledPlayoffLeagues,
    bracketSizes,
    bronzeMatchEnabled: Boolean(source.goBronzeMatchEnabled ?? source.bronzeMatchEnabled ?? true),
    bracketLevels: enabledPlayoffLeagues.length,
    matchPointSystem: normalizeGoMatchPointSystem(source.goMatchPointSystem ?? source.matchPointSystem),
    tieBreakerLogic: normalizeGoTieBreakerLogic(source.goTieBreakerLogic ?? source.tieBreakerLogic),
  };
}

export function normalizeIptAdminSettings(settings?: Record<string, unknown>, participantCount?: unknown) {
  const source = settings ?? {};
  const fallbackCourts = inferIptCourtCount(participantCount, IPT_MIXED_COURTS);
  const courts = clamp(toFiniteInt(source.courts, fallbackCourts), IPT_MIXED_MIN_COURTS, IPT_MIXED_MAX_COURTS);
  return {
    courts,
    playersPerCourt: IPT_MIXED_PLAYERS_PER_COURT,
    legacyGroups: courts,
    pointLimit: clamp(
      toFiniteInt(source.iptPointLimit ?? source.pointLimit, IPT_MIXED_POINT_LIMIT_DEFAULT),
      IPT_MIXED_POINT_LIMIT_MIN,
      IPT_MIXED_POINT_LIMIT_MAX
    ),
    finishType: normalizeFinishType(source.iptFinishType ?? source.finishType),
  };
}

export function validateThaiRoster(
  players: Array<Pick<LegacySyncPlayer, 'id' | 'gender'>>,
  settings?: Record<string, unknown>
): string | null {
  const thaiSettings = normalizeThaiAdminSettings(settings, players.length);
  const expectedCount = getThaiSeatCount(thaiSettings.courts);

  if (players.length !== expectedCount) {
    return `Thai requires exactly ${expectedCount} players.`;
  }

  const men = players.filter((player) => normalizePlayerGender(player.gender) === 'M').length;
  const women = players.length - men;

  if (thaiSettings.variant === 'MF') {
    const expectedGenderCount = expectedCount / 2;
    if (men !== expectedGenderCount || women !== expectedGenderCount) {
      return `Thai Mixed requires exactly ${expectedGenderCount} men and ${expectedGenderCount} women.`;
    }
  } else if (thaiSettings.variant === 'MN') {
    return null;
  } else if (thaiSettings.variant === 'MM') {
    if (women > 0) {
      return 'Thai Men allows only male players.';
    }
  } else if (men > 0) {
    return 'Thai Women allows only female players.';
  }

  for (let courtIndex = 0; courtIndex < thaiSettings.courts; courtIndex += 1) {
    const offset = courtIndex * THAI_ADMIN_SEAT_COUNT;
    const courtPlayers = players.slice(offset, offset + THAI_ADMIN_SEAT_COUNT);
    const courtMen = courtPlayers.filter((player) => normalizePlayerGender(player.gender) === 'M').length;
    const courtWomen = courtPlayers.length - courtMen;

    if (thaiSettings.variant === 'MF' && (courtMen !== 4 || courtWomen !== 4)) {
      return `Thai Mixed court ${courtIndex + 1} requires 4 men and 4 women.`;
    }
    if (thaiSettings.variant === 'MM' && courtWomen !== 0) {
      return `Thai Men court ${courtIndex + 1} allows only men.`;
    }
    if (thaiSettings.variant === 'WW' && courtMen !== 0) {
      return `Thai Women court ${courtIndex + 1} allows only women.`;
    }
  }

  return null;
}

export function validateIptMixedRoster(
  players: Array<Pick<LegacySyncPlayer, 'id' | 'gender'>>,
  settings?: Record<string, unknown>
): string | null {
  const iptSettings = normalizeIptAdminSettings(settings, players.length);
  const expectedCount = getIptMixedSeatCount(iptSettings.courts);

  if (players.length !== expectedCount) {
    return `IPT Mixed requires exactly ${expectedCount} players.`;
  }

  const men = players.filter((player) => normalizePlayerGender(player.gender) === 'M').length;
  const women = players.length - men;
  const expectedGenderCount = expectedCount / 2;
  if (men !== expectedGenderCount || women !== expectedGenderCount) {
    return `IPT Mixed requires exactly ${expectedGenderCount} men and ${expectedGenderCount} women.`;
  }

  for (let courtIndex = 0; courtIndex < iptSettings.courts; courtIndex += 1) {
    const offset = courtIndex * IPT_MIXED_SEAT_COUNT;
    for (let slotIndex = 0; slotIndex < IPT_MIXED_SEAT_COUNT; slotIndex += 1) {
      const expectedGender = slotIndex % 2 === 0 ? 'M' : 'W';
      if (normalizePlayerGender(players[offset + slotIndex]?.gender) !== expectedGender) {
        return `IPT Mixed court ${courtIndex + 1} slots must be filled in M/W/M/W/M/W/M/W order.`;
      }
    }
  }

  return null;
}

export function buildLegacyIptTournamentState(input: LegacySyncTournamentInput) {
  const rosterError = validateIptMixedRoster(input.participants, input.settings);
  if (rosterError) {
    throw new Error(`BadRequest: ${rosterError}`);
  }

  const iptSettings = normalizeIptAdminSettings(input.settings, input.participants.length);

  return {
    id: String(input.id),
    name: String(input.name || '').trim(),
    date: String(input.date || '').trim(),
    time: String(input.time || '').trim(),
    location: String(input.location || '').trim(),
    format: IPT_MIXED_FORMAT,
    division: String(input.division || '').trim(),
    level: String(input.level || '').trim(),
    capacity: getIptMixedSeatCount(iptSettings.courts),
    status: String(input.status || 'open').trim() || 'open',
    gender: 'mixed',
    source: 'admin',
    participants: input.participants.map((player) => String(player.id)),
    waitlist: [],
    winners: [],
    ipt: {
      pointLimit: iptSettings.pointLimit,
      finishType: iptSettings.finishType,
      courts: iptSettings.legacyGroups,
      gender: 'mixed',
    },
  };
}

export function buildLegacyPlayerDbState(players: LegacySyncPlayer[]) {
  return {
    players: players.map((player) => ({
      id: String(player.id),
      name: String(player.name || '').trim(),
      gender: normalizePlayerGender(player.gender),
      status: String(player.status || 'active').trim() || 'active',
      addedAt: '',
      tournaments: Number(player.tournaments ?? 0),
      totalPts: Number(player.totalPts ?? 0),
      wins: Number(player.wins ?? 0),
      ratingM: Number(player.ratingM ?? 0),
      ratingW: Number(player.ratingW ?? 0),
      ratingMix: Number(player.ratingMix ?? 0),
      tournamentsM: Number(player.tournamentsM ?? 0),
      tournamentsW: Number(player.tournamentsW ?? 0),
      tournamentsMix: Number(player.tournamentsMix ?? 0),
      lastSeen: String(player.lastSeen || ''),
      iptWins: Number(player.iptWins ?? 0),
      iptDiff: Number(player.iptDiff ?? 0),
      iptPts: Number(player.iptPts ?? 0),
      iptMatches: Number(player.iptMatches ?? 0),
    })),
    synced_at: new Date().toISOString(),
  };
}
