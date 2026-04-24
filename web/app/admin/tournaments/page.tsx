'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GO_ADMIN_DEFAULT_BRACKET_LEVELS,
  GO_ADMIN_DEFAULT_COURTS,
  GO_ADMIN_DEFAULT_GROUP_FORMULA,
  GO_ADMIN_DEFAULT_GROUPS,
  GO_ADMIN_DEFAULT_SLOT_MINUTES,
  GO_ADMIN_DEFAULT_START_TIME,
  GO_ADMIN_DEFAULT_TEAMS_PER_GROUP,
  GO_ADMIN_MAX_DECLARED_TEAMS,
  GO_ADMIN_FORMAT,
  GO_ADMIN_MAX_BRACKET_LEVELS,
  GO_ADMIN_MAX_COURTS,
  GO_ADMIN_MAX_GROUPS,
  GO_ADMIN_MIN_DECLARED_TEAMS,
  GO_ADMIN_MIN_BRACKET_LEVELS,
  GO_ADMIN_MIN_COURTS,
  GO_ADMIN_MIN_GROUPS,
  buildGoAutoLayoutSuggestion,
  KOTC_ADMIN_DEFAULT_PPC,
  KOTC_ADMIN_DEFAULT_RAUNDS,
  KOTC_ADMIN_DEFAULT_TIMER,
  KOTC_ADMIN_FORMAT,
  KOTC_ADMIN_MAX_PPC,
  KOTC_ADMIN_MAX_RAUNDS,
  KOTC_ADMIN_MAX_TIMER,
  KOTC_ADMIN_MIN_PPC,
  KOTC_ADMIN_MIN_RAUNDS,
  KOTC_ADMIN_MIN_TIMER,
  getKotcSeatCount,
  THAI_ADMIN_COURTS,
  THAI_ADMIN_FORMAT,
  THAI_ADMIN_MIN_COURTS,
  THAI_ADMIN_POINT_LIMIT_MAX,
  THAI_ADMIN_POINT_LIMIT_MIN,
  THAI_ADMIN_PLAYERS_PER_COURT,
  THAI_ROSTER_MODES,
  THAI_RULES_PRESETS,
  type ThaiRosterMode,
  type ThaiRulesPreset,
  THAI_VARIANTS,
  type ThaiTourCount,
  type ThaiVariant,
  getGoSeatCount,
  getThaiDivisionLabel,
  getThaiSeatCount,
  isGoAdminFormat,
  isKotcAdminFormat,
  isThaiAdminFormat,
  normalizeGoAdminSettings,
  normalizeKotcAdminSettings,
  normalizeKotcJudgeModule,
  normalizeThaiAdminSettings,
  normalizeThaiRosterMode,
  normalizeThaiRulesPreset,
  normalizeThaiTourCount,
  normalizeThaiVariant,
  type KotcJudgeModule,
  validateThaiRoster,
} from '@/lib/admin-legacy-sync';
import { normalizeTournamentInput } from '@/lib/admin-validators';
import { validateTournamentInput } from '@/lib/admin-validators';
import { buildSudyamLaunchUrl, getSudyamFormatForTournament } from '@/lib/sudyam-launch';
import {
  inferThaiJudgeModuleFromSettings,
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
  THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT,
  THAI_NEXT_JUDGE_MAX_COURTS,
  type ThaiJudgeModule,
  isExactThaiTournamentFormat,
  normalizeThaiJudgeBootstrapSignature,
  normalizeThaiJudgeModule,
} from '@/lib/thai-judge-config';
import { filterPlayersByGenderSelection, type ThaiGenderFilter } from '@/lib/thai-ui-helpers';
import { calcBracketSize } from '@/lib/go-next/bracket-generator';
import {
  draftPlayersToSnapshot,
  snapshotToDraftPlayers,
} from '@/lib/roster-editor/engine';
import type {
  RosterEditorAction,
  RosterEditorHistoryState,
} from '@/lib/roster-editor/types';
import { RosterHistoryControls } from '@/components/admin/tournaments/RosterHistoryControls';
import { RosterMobileActionBar } from '@/components/admin/tournaments/RosterMobileActionBar';
import { RosterPoolPanel } from '@/components/admin/tournaments/RosterPoolPanel';
import { RosterWorkspaceSwitch } from '@/components/admin/tournaments/RosterWorkspaceSwitch';
import { FixedPairsCategoriesBoard } from '@/components/admin/tournaments/FixedPairsCategoriesBoard';
import { FixedPairsGroupsBoard } from '@/components/admin/tournaments/FixedPairsGroupsBoard';
import { RosterLanesBoard } from '@/components/admin/tournaments/RosterLanesBoard';
const TOURNAMENT_COMPOSER_DRAFT_STORAGE_KEY = 'lpvolley:admin:tournament-composer-draft:v1';
const TOURNAMENT_COMPOSER_DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 14;

type TournamentSettings = {
  courts: number;
  playersPerCourt: number;
  timerCourts: number;
  timerFinals: number;
  pairsMode: 'rotation' | 'fixed';
  draftSeed: string;
  thaiVariant: ThaiVariant;
  thaiRosterMode: ThaiRosterMode;
  tourCount: ThaiTourCount;
  thaiJudgeModule: ThaiJudgeModule;
  thaiJudgeBootstrapSignature: string | null;
  thaiPointLimit: number;
  thaiPointLimitR1: number;
  thaiPointLimitR2: number;
  thaiRulesPreset: ThaiRulesPreset;
  iptPointLimit: number;
  iptFinishType: 'hard' | 'balance';
  kotcJudgeModule: KotcJudgeModule;
  kotcJudgeBootstrapSignature: string | null;
  kotcPpc: number;
  kotcRaundCount: number;
  kotcRaundTimerMinutes: number;
  goCourts: number;
  goDeclaredTeamCount: number;
  goGroupCount: number;
  goTeamsPerGroup: number;
  goMatchFormat: 'single15' | 'single21' | 'bo3';
  goPointLimitGroup: number;
  goPointLimitBracket: number;
  goSeedingMode: 'serpentine' | 'random' | 'manual' | 'fixedPairs';
  goBracketLevels: number;
  goMatchPointSystem: 'fivb' | 'simple';
  goTieBreakerLogic: 'fivb' | 'classic';
  goGroupFormulaHard: number;
  goGroupFormulaMedium: number;
  goGroupFormulaLite: number;
  goSlotMinutes: number;
  goStartTime: string;
  goEnabledPlayoffLeagues: Array<'lyutye' | 'hard' | 'medium' | 'lite'>;
  goBracketSizes: Partial<Record<'lyutye' | 'hard' | 'medium' | 'lite', number>>;
  goBronzeMatchEnabled: boolean;
  goMixedTeamCounts: Partial<Record<'lyutye' | 'hard' | 'medium' | 'lite', number>>;
};

type Row = {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  level: string;
  capacity: number;
  status: string;
  participantCount: number;
  settings?: TournamentSettings;
  kotcJudgeModule?: KotcJudgeModule | null;
  kotcJudgeBootstrapSig?: string | null;
  kotcRaundCount?: number | null;
  kotcRaundTimerMinutes?: number | null;
  kotcPpc?: number | null;
};

type Player = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  level?: string;
};

type DraftPlayer = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  playerLevel?: 'hard' | 'medium' | 'easy';
};

type GenderFilter = ThaiGenderFilter;

type RosterParticipant = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  isWaitlist?: boolean;
  position?: number;
};

type LaunchTarget = {
  href: string;
  label: string;
};

type GoPlayoffLeague = TournamentSettings['goEnabledPlayoffLeagues'][number];

type TournamentComposerDraftPayload = {
  version: 1;
  savedAt: number;
  form: Omit<Row, 'id' | 'participantCount'>;
  draftPlayers: Array<DraftPlayer | null>;
};

type GoPreflightCheck = {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
};

type GoPreflightResult = {
  checks: GoPreflightCheck[];
  errors: string[];
  warnings: string[];
  canGoLive: boolean;
};

const defaultSettings: TournamentSettings = {
  courts: THAI_ADMIN_COURTS,
  playersPerCourt: 4,
  timerCourts: 10,
  timerFinals: 10,
  pairsMode: 'rotation',
  draftSeed: '',
  thaiVariant: 'MF',
  thaiRosterMode: 'manual',
  tourCount: THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT,
  thaiJudgeModule: THAI_JUDGE_MODULE_NEXT,
  thaiJudgeBootstrapSignature: null,
  thaiPointLimit: 15,
  thaiPointLimitR1: 15,
  thaiPointLimitR2: 15,
  thaiRulesPreset: 'legacy',
  iptPointLimit: 21,
  iptFinishType: 'hard',
  kotcJudgeModule: 'next',
  kotcJudgeBootstrapSignature: null,
  kotcPpc: KOTC_ADMIN_DEFAULT_PPC,
  kotcRaundCount: KOTC_ADMIN_DEFAULT_RAUNDS,
  kotcRaundTimerMinutes: KOTC_ADMIN_DEFAULT_TIMER,
  goCourts: GO_ADMIN_DEFAULT_COURTS,
  goDeclaredTeamCount: GO_ADMIN_DEFAULT_GROUPS * GO_ADMIN_DEFAULT_TEAMS_PER_GROUP,
  goGroupCount: GO_ADMIN_DEFAULT_GROUPS,
  goTeamsPerGroup: GO_ADMIN_DEFAULT_TEAMS_PER_GROUP,
  goMatchFormat: 'single15',
  goPointLimitGroup: 15,
  goPointLimitBracket: 15,
  goSeedingMode: 'serpentine',
  goBracketLevels: GO_ADMIN_DEFAULT_BRACKET_LEVELS,
  goMatchPointSystem: 'fivb',
  goTieBreakerLogic: 'fivb',
  goGroupFormulaHard: GO_ADMIN_DEFAULT_GROUP_FORMULA.hard,
  goGroupFormulaMedium: GO_ADMIN_DEFAULT_GROUP_FORMULA.medium,
  goGroupFormulaLite: GO_ADMIN_DEFAULT_GROUP_FORMULA.lite,
  goSlotMinutes: GO_ADMIN_DEFAULT_SLOT_MINUTES,
  goStartTime: GO_ADMIN_DEFAULT_START_TIME,
  goEnabledPlayoffLeagues: ['hard', 'medium', 'lite'],
  goBracketSizes: { hard: 4, medium: 4, lite: 4 },
  goBronzeMatchEnabled: true,
  goMixedTeamCounts: {},
};

const DEFAULT_TOURNAMENT_TIME = '20:00';
const DEFAULT_TOURNAMENT_LOCATION = '\u041c\u0410\u041b\u0418\u0411\u0423';
const ADMIN_UNIFIED_ROSTER_V2 =
  process.env.NEXT_PUBLIC_ADMIN_UNIFIED_ROSTER_V2 === 'true';

const EMPTY_ROSTER_HISTORY: RosterEditorHistoryState = {
  revision: 0,
  sessionId: null,
  cursor: -1,
  stack: [],
  currentSnapshot: null,
  canUndo: false,
  canRedo: false,
};

function getDefaultTournamentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createEmptyForm(): Row {
  return {
    id: '',
    name: '',
    date: getDefaultTournamentDate(),
    time: DEFAULT_TOURNAMENT_TIME,
    location: DEFAULT_TOURNAMENT_LOCATION,
    format: 'Round Robin',
    division: 'Мужской',
    level: 'medium',
    capacity: 24,
    status: 'draft',
    participantCount: 0,
    settings: { ...defaultSettings },
  };
}

function normalizeSettings(settings?: Partial<TournamentSettings>): TournamentSettings {
  return { ...defaultSettings, ...(settings ?? {}) };
}

function normalizeGender(value: unknown): 'M' | 'W' {
  return String(value || 'M').toUpperCase() === 'W' ? 'W' : 'M';
}

function normalizeDraftPayloadForm(input: unknown): Omit<Row, 'id' | 'participantCount'> | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Partial<Row>;
  const normalizedMeta = normalizeTournamentInput({
    date: normalizeDateInputValue(row.date),
    time: row.time,
    division: row.division,
    level: row.level,
    status: row.status,
  });
  return {
    name: String(row.name ?? ''),
    date: normalizedMeta.date || normalizeDateInputValue(row.date),
    time: normalizedMeta.time || DEFAULT_TOURNAMENT_TIME,
    location: String(row.location ?? DEFAULT_TOURNAMENT_LOCATION),
    format: String(row.format ?? 'Round Robin'),
    division: normalizedMeta.division || 'Мужской',
    level: normalizedMeta.level || 'medium',
    capacity: Math.max(0, Math.floor(Number(row.capacity ?? 0) || 0)),
    status: normalizedMeta.status || 'draft',
    settings: normalizeSettings((row.settings ?? {}) as Partial<TournamentSettings>),
  };
}

function readTournamentComposerDraft(): TournamentComposerDraftPayload | null {
  try {
    const raw = window.localStorage.getItem(TOURNAMENT_COMPOSER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TournamentComposerDraftPayload>;
    if (!parsed || parsed.version !== 1 || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > TOURNAMENT_COMPOSER_DRAFT_TTL_MS) {
      window.localStorage.removeItem(TOURNAMENT_COMPOSER_DRAFT_STORAGE_KEY);
      return null;
    }
    const normalizedForm = normalizeDraftPayloadForm(parsed.form);
    if (!normalizedForm) return null;
    const draftPlayers = Array.isArray(parsed.draftPlayers)
      ? parsed.draftPlayers.map((slot) => {
          if (!slot || typeof slot !== 'object') return null;
          const player = slot as Partial<DraftPlayer>;
          return {
            playerId: String(player.playerId ?? ''),
            playerName: String(player.playerName ?? ''),
            gender: normalizeGender(player.gender),
            playerLevel: player.playerLevel ? normalizeGoSkillLevel(player.playerLevel) : undefined,
          };
        })
      : [];
    return {
      version: 1,
      savedAt: parsed.savedAt,
      form: normalizedForm,
      draftPlayers,
    };
  } catch {
    return null;
  }
}

function clearTournamentComposerDraft() {
  try {
    window.localStorage.removeItem(TOURNAMENT_COMPOSER_DRAFT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

function normalizeGoSkillLevel(value: unknown): 'hard' | 'medium' | 'easy' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'medium';
  if (
    normalized === 'hard' ||
    normalized === 'pro' ||
    normalized === 'advanced' ||
    normalized === 'advance' ||
    normalized.includes('хард') ||
    normalized.includes('про') ||
    normalized.includes('продвин')
  ) {
    return 'hard';
  }
  if (
    normalized === 'medium' ||
    normalized === 'med' ||
    normalized.includes('мед') ||
    normalized.includes('сред')
  ) {
    return 'medium';
  }
  if (
    normalized === 'easy' ||
    normalized === 'light' ||
    normalized === 'lite' ||
    normalized === 'novice' ||
    normalized === 'beginner' ||
    normalized.includes('Р»Р°Р№С‚') ||
    normalized.includes('легк') ||
    normalized.includes('нович')
  ) {
    return 'easy';
  }
  return 'medium';
}

function clampThaiPointLimitValue(value: number): number {
  return Math.max(THAI_ADMIN_POINT_LIMIT_MIN, Math.min(THAI_ADMIN_POINT_LIMIT_MAX, Math.trunc(value)));
}

function normalizeThaiSettings(
  settings?: Partial<TournamentSettings>,
  participantCount?: number,
  fallbackModule: ThaiJudgeModule = THAI_JUDGE_MODULE_NEXT,
): TournamentSettings {
  const base = normalizeSettings(settings);
  const thaiSettings = normalizeThaiAdminSettings(base as unknown as Record<string, unknown>, participantCount);
  const judgeModule = normalizeThaiJudgeModule(base.thaiJudgeModule, fallbackModule);
  const legacyPl = thaiSettings.pointLimit;
  const r1 = clampThaiPointLimitValue(
    Number(base.thaiPointLimitR1 ?? base.thaiPointLimit ?? legacyPl) || legacyPl,
  );
  const r2 = clampThaiPointLimitValue(
    Number(base.thaiPointLimitR2 ?? base.thaiPointLimit ?? legacyPl) || legacyPl,
  );
  return {
    ...base,
    courts: thaiSettings.courts,
    playersPerCourt: THAI_ADMIN_PLAYERS_PER_COURT,
    pairsMode: 'rotation',
    thaiVariant: thaiSettings.variant,
    thaiRosterMode: normalizeThaiRosterMode(base.thaiRosterMode),
    thaiRulesPreset: normalizeThaiRulesPreset(base.thaiRulesPreset),
    tourCount: judgeModule === THAI_JUDGE_MODULE_NEXT ? THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT : thaiSettings.tourCount,
    thaiPointLimit: r1,
    thaiPointLimitR1: r1,
    thaiPointLimitR2: r2,
    thaiJudgeModule: judgeModule,
    thaiJudgeBootstrapSignature: normalizeThaiJudgeBootstrapSignature(base.thaiJudgeBootstrapSignature),
  };
}

function getThaiJudgeModuleFallback(
  settings?: Partial<TournamentSettings>,
  fallback: ThaiJudgeModule = THAI_JUDGE_MODULE_LEGACY,
): ThaiJudgeModule {
  return inferThaiJudgeModuleFromSettings(
    (settings ?? null) as Record<string, unknown> | null,
    fallback,
  );
}

function normalizeKotcSettings(
  settings?: Partial<TournamentSettings>,
  participantCount?: number,
  fallbackModule: KotcJudgeModule = 'next',
): TournamentSettings {
  const base = normalizeSettings(settings);
  const kotcSettings = normalizeKotcAdminSettings(
    {
      ...base,
      kotcJudgeModule: base.kotcJudgeModule ?? fallbackModule,
    },
    participantCount,
  );
  return {
    ...base,
    courts: kotcSettings.courts,
    playersPerCourt: kotcSettings.playersPerCourt,
    kotcJudgeModule: normalizeKotcJudgeModule(base.kotcJudgeModule, fallbackModule),
    kotcJudgeBootstrapSignature: kotcSettings.kotcJudgeBootstrapSignature,
    kotcPpc: kotcSettings.ppc,
    kotcRaundCount: kotcSettings.raundCount,
    kotcRaundTimerMinutes: kotcSettings.raundTimerMinutes,
  };
}

function normalizeGoSettings(
  settings?: Partial<TournamentSettings>,
  participantCount?: number,
): TournamentSettings {
  const base = normalizeSettings(settings);
  const goSettings = normalizeGoAdminSettings(base as unknown as Record<string, unknown>, participantCount);
  const suggestedGroupCount = Math.ceil(
    Math.max(GO_ADMIN_MIN_DECLARED_TEAMS, Number(goSettings.declaredTeamCount) || GO_ADMIN_DEFAULT_GROUPS * GO_ADMIN_DEFAULT_TEAMS_PER_GROUP) /
      Math.max(3, Number(goSettings.groupSlotSize) || GO_ADMIN_DEFAULT_TEAMS_PER_GROUP),
  );
  const persistedGroupCount = Number.isFinite(Number(base.goGroupCount))
    ? Math.floor(Number(base.goGroupCount))
    : suggestedGroupCount;
  const normalizedGroupCount = Math.max(
    GO_ADMIN_MIN_GROUPS,
    Math.min(GO_ADMIN_MAX_GROUPS, persistedGroupCount || suggestedGroupCount || GO_ADMIN_DEFAULT_GROUPS),
  );
  return {
    ...base,
    courts: goSettings.courts,
    goCourts: goSettings.courts,
    goDeclaredTeamCount: goSettings.declaredTeamCount,
    goGroupCount: normalizedGroupCount,
    goTeamsPerGroup: goSettings.groupSlotSize,
    goMatchFormat: goSettings.matchFormat as TournamentSettings['goMatchFormat'],
    goPointLimitGroup: goSettings.pointLimitGroup,
    goPointLimitBracket: goSettings.pointLimitBracket,
    goSeedingMode: goSettings.seedingMode as TournamentSettings['goSeedingMode'],
    goBracketLevels: goSettings.bracketLevels,
    goMatchPointSystem: goSettings.matchPointSystem as TournamentSettings['goMatchPointSystem'],
    goTieBreakerLogic: goSettings.tieBreakerLogic as TournamentSettings['goTieBreakerLogic'],
    goGroupFormulaHard: goSettings.groupFormula.hard,
    goGroupFormulaMedium: goSettings.groupFormula.medium,
    goGroupFormulaLite: goSettings.groupFormula.lite,
    goSlotMinutes: goSettings.slotMinutes,
    goStartTime: goSettings.startTime,
    goEnabledPlayoffLeagues: goSettings.enabledPlayoffLeagues,
    goBracketSizes: goSettings.bracketSizes,
    goBronzeMatchEnabled: goSettings.bronzeMatchEnabled,
  };
}

function getThaiVariantLabel(variant: ThaiVariant): string {
  switch (variant) {
    case 'MN':
      return 'М/Н';
    case 'MM':
      return 'Муж';
    case 'WW':
      return 'Жен';
    default:
      return 'Микст';
  }
}

function getThaiCourtHint(variant: ThaiVariant): string {
  switch (variant) {
    case 'MN':
      return '8 мест · 4 профи / 4 новичка';
    case 'MM':
      return '8 мест · только мужчины';
    case 'WW':
      return '8 мест · только женщины';
    default:
      return '8 мест · 4M / 4W';
  }
}

function getThaiSlotHint(variant: ThaiVariant, slotIndex: number): string | null {
  if (variant === 'MN') {
    return slotIndex < 4 ? 'Профи' : 'Новичок';
  }
  if (variant === 'MM') return 'Мужчина';
  if (variant === 'WW') return 'Женщина';
  if (variant === 'MF') return slotIndex < 4 ? 'M' : 'Ж';
  return null;
}

function buildJudgeLaunchUrl(row: Pick<Row, 'id' | 'format'>): string {
  const format = getSudyamFormatForTournament(row.format);
  if (!format) return '';
  return buildSudyamLaunchUrl({
    tournamentId: row.id,
    format,
  });
}

function buildKotcNextControlUrl(tournamentId: string): string {
  return `/sudyam/kotcn/${encodeURIComponent(tournamentId)}`;
}

function buildGoControlUrl(tournamentId: string): string {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/go-live`;
}

function getGoLeaguesByBracketLevels(levels: number): TournamentSettings['goEnabledPlayoffLeagues'] {
  if (levels >= 4) return ['lyutye', 'hard', 'medium', 'lite'];
  if (levels === 3) return ['hard', 'medium', 'lite'];
  return ['hard', 'medium'];
}

function getGoGroupFormulaBySize(size: number): Pick<TournamentSettings, 'goGroupFormulaHard' | 'goGroupFormulaMedium' | 'goGroupFormulaLite'> {
  if (size <= 3) {
    return {
      goGroupFormulaHard: 1,
      goGroupFormulaMedium: 1,
      goGroupFormulaLite: 1,
    };
  }
  return {
    goGroupFormulaHard: 2,
    goGroupFormulaMedium: 1,
    goGroupFormulaLite: 1,
  };
}

function getGoMixedBracketSize(teamCount: number): number {
  return calcBracketSize(teamCount);
}

function getGoMixedLeagueMinTeams(league: GoPlayoffLeague): number {
  return league === 'hard' || league === 'lyutye' ? 4 : 2;
}

function clampGoMixedLeagueTeamCount(
  league: GoPlayoffLeague,
  value: number,
): number {
  const min = getGoMixedLeagueMinTeams(league);
  return Math.max(min, Math.min(16, Math.floor(Number(value) || 0)));
}

function buildAutoGoMixedTeamCounts(
  settings: Pick<
    TournamentSettings,
    | 'goGroupCount'
    | 'goGroupFormulaHard'
    | 'goGroupFormulaMedium'
    | 'goGroupFormulaLite'
    | 'goEnabledPlayoffLeagues'
  >,
): TournamentSettings['goMixedTeamCounts'] {
  const groupCount = Math.max(
    GO_ADMIN_MIN_GROUPS,
    Math.min(GO_ADMIN_MAX_GROUPS, Math.floor(Number(settings.goGroupCount) || GO_ADMIN_DEFAULT_GROUPS)),
  );
  const hardPerGroup = Math.max(0, Math.min(4, Math.floor(Number(settings.goGroupFormulaHard) || 0)));
  const mediumPerGroup = Math.max(0, Math.min(4, Math.floor(Number(settings.goGroupFormulaMedium) || 0)));
  const litePerGroup = Math.max(0, Math.min(4, Math.floor(Number(settings.goGroupFormulaLite) || 0)));
  const baseByLeague: Record<GoPlayoffLeague, number> = {
    lyutye: groupCount * hardPerGroup,
    hard: groupCount * hardPerGroup,
    medium: groupCount * mediumPerGroup,
    lite: groupCount * litePerGroup,
  };
  const enabled: GoPlayoffLeague[] = settings.goEnabledPlayoffLeagues?.length
    ? settings.goEnabledPlayoffLeagues
    : (['hard', 'medium', 'lite'] as GoPlayoffLeague[]);
  const next: TournamentSettings['goMixedTeamCounts'] = {};
  enabled.forEach((league) => {
    next[league] = clampGoMixedLeagueTeamCount(league, baseByLeague[league]);
  });
  return next;
}

function isLegacyGoMixedDefaultCounts(
  counts: TournamentSettings['goMixedTeamCounts'] | undefined,
  leagues: TournamentSettings['goEnabledPlayoffLeagues'],
): boolean {
  if (!counts || !leagues.length) return false;
  return leagues.every((league) => {
    const value = Number(counts[league]);
    if (!Number.isFinite(value)) return false;
    const legacyDefault = league === 'hard' || league === 'lyutye' ? 16 : 4;
    return value === legacyDefault;
  });
}

function buildGoBracketSizesForLeagues(
  leagues: TournamentSettings['goEnabledPlayoffLeagues'],
  current?: TournamentSettings['goBracketSizes'],
): TournamentSettings['goBracketSizes'] {
  const next: TournamentSettings['goBracketSizes'] = {};
  leagues.forEach((league) => {
    const fallback = league === 'lyutye' || league === 'hard' ? 4 : 2;
    next[league] = Number(current?.[league] ?? fallback);
  });
  return next;
}

function buildGoAutoConfigPatchFromDeclared(
  declaredTeams: number,
  currentSettings?: Partial<TournamentSettings>,
): Partial<TournamentSettings> {
  const suggestion = buildGoAutoLayoutSuggestion(declaredTeams);
  const formulaPatch = getGoGroupFormulaBySize(suggestion.groupSize);
  const leagues = currentSettings?.goEnabledPlayoffLeagues?.length
    ? currentSettings.goEnabledPlayoffLeagues
    : (['hard', 'medium', 'lite'] as GoPlayoffLeague[]);
  const autoCounts = buildAutoGoMixedTeamCounts({
    goGroupCount: suggestion.groupCount,
    goGroupFormulaHard: formulaPatch.goGroupFormulaHard,
    goGroupFormulaMedium: formulaPatch.goGroupFormulaMedium,
    goGroupFormulaLite: formulaPatch.goGroupFormulaLite,
    goEnabledPlayoffLeagues: leagues,
  });
  const nextBracketSizes: TournamentSettings['goBracketSizes'] = {};
  leagues.forEach((league) => {
    const leagueCount = Number(autoCounts[league] ?? 0);
    nextBracketSizes[league] = getGoMixedBracketSize(leagueCount);
  });
  return {
    goDeclaredTeamCount: suggestion.declaredTeamCount,
    goGroupCount: suggestion.groupCount,
    ...formulaPatch,
    goMixedTeamCounts: autoCounts,
    goBracketSizes: nextBracketSizes,
  };
}

function getPrimaryLaunchTarget(row: Pick<Row, 'id' | 'format' | 'settings'>): LaunchTarget | null {
  if (!row.id) return null;
  if (isThaiAdminFormat(row.format)) {
    const normalized = normalizeThaiSettings(
      row.settings,
      undefined,
      getThaiJudgeModuleFallback(row.settings, THAI_JUDGE_MODULE_LEGACY),
    );
    if (normalized.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT) {
      return {
        href: `/admin/tournaments/${encodeURIComponent(row.id)}/thai-live`,
        label: 'Thai Tournament Control →',
      };
    }
  }
  if (isKotcAdminFormat(row.format)) {
    const normalized = normalizeKotcSettings(row.settings, undefined, 'legacy');
    if (normalized.kotcJudgeModule === 'next') {
      return {
        href: buildKotcNextControlUrl(row.id),
        label: 'KOTC Next Control →',
      };
    }
  }
  if (isGoAdminFormat(row.format)) {
    return {
      href: buildGoControlUrl(row.id),
      label: 'GO Tournament Control →',
    };
  }

  const judgeUrl = buildJudgeLaunchUrl(row);
  if (!judgeUrl) return null;
  return {
    href: judgeUrl,
    label: 'Open in Sudyam',
  };
}

function getErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeDateInputValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const candidate = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';
  const [yearRaw, monthRaw, dayRaw] = candidate.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return '';
  }
  return candidate;
}

const formats = [
  { key: 'Round Robin', label: 'Round Robin' },
  { key: 'King of the Court', label: 'KOTC' },
  { key: THAI_ADMIN_FORMAT, label: 'Тайский' },
  { key: GO_ADMIN_FORMAT, label: 'Группы + Олимп.' },
];

const divisions = [
  { key: 'Мужской', label: 'Муж' },
  { key: 'Женский', label: 'Жен' },
  { key: 'Микст', label: 'Микст' },
];

const levels = [
  { key: 'hard', label: 'HARD', color: 'border-red-500/60 text-red-300' },
  { key: 'medium', label: 'MEDIUM', color: 'border-amber-500/60 text-amber-300' },
  { key: 'easy', label: 'LITE', color: 'border-emerald-500/60 text-emerald-300' },
];

const thaiVariantOptions: { key: ThaiVariant; label: string }[] = THAI_VARIANTS.map((variant) => ({
  key: variant,
  label: getThaiVariantLabel(variant),
}));

const thaiRosterModeOptions: { key: ThaiRosterMode; label: string }[] = THAI_ROSTER_MODES.map((mode) => ({
  key: mode,
  label: mode === 'manual' ? 'Вручную' : 'Случайно',
}));

const thaiTourOptions: { key: ThaiTourCount; label: string }[] = [
  { key: 1 as ThaiTourCount, label: '1 тур' },
  { key: 2 as ThaiTourCount, label: '2 тура' },
];

const statuses = [
  { key: 'draft', label: 'Черновик', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  { key: 'open', label: 'Открыт', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { key: 'full', label: 'Заполнен', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { key: 'finished', label: 'Завершён', color: 'bg-white/10 text-text-primary/60 border-white/10' },
  { key: 'cancelled', label: 'Отменён', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
];

const genderFilterOptions: { key: GenderFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'M', label: 'M' },
  { key: 'W', label: 'W' },
];

function Seg<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { key: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const normalizeSegStringKey = (input: string): string => input.toLowerCase().replace(/[\s_-]+/g, '');
  const isSelected = (current: T, optionKey: T): boolean => {
    if (typeof current === 'string' && typeof optionKey === 'string') {
      return normalizeSegStringKey(current) === normalizeSegStringKey(optionKey);
    }
    return current === optionKey;
  };
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            disabled
              ? isSelected(value, o.key)
                ? 'bg-brand/10 text-brand/50 border-brand/30 cursor-not-allowed'
                : 'bg-white/5 text-text-primary/30 border-white/5 cursor-not-allowed'
              : isSelected(value, o.key)
                ? o.color ?? 'bg-brand/20 text-brand border-brand/50'
                : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 25,
  suffix = '',
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg border border-white/20 hover:border-brand text-text-primary/80 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        -
      </button>
      <span className="w-16 text-center font-semibold text-brand">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg border border-white/20 hover:border-brand text-text-primary/80 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  );
}

export default function AdminTournamentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [rowsLoaded, setRowsLoaded] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerGenderFilter, setPlayerGenderFilter] = useState<GenderFilter>('all');
  const [form, setForm] = useState<Row>(() => createEmptyForm());
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>([]);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number | null>(null);
  const [confirmClearCourtIndex, setConfirmClearCourtIndex] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState<{name: string, gender: 'M'|'W', level: string}>({ name: '', gender: 'M', level: 'easy' });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [fixedPairsView, setFixedPairsView] = useState<'categories' | 'groups'>('categories');
  const [rosterHistory, setRosterHistory] = useState<RosterEditorHistoryState>(EMPTY_ROSTER_HISTORY);
  const [rosterHistoryBusy, setRosterHistoryBusy] = useState(false);
  const [rosterWorkspaceView, setRosterWorkspaceView] = useState<'categories' | 'groups' | 'courts' | 'thai-r1'>('groups');
  const [composerDraftHydrated, setComposerDraftHydrated] = useState(false);
  const [serverDraftRestoreAttempted, setServerDraftRestoreAttempted] = useState(false);
  const [serverDraftRestored, setServerDraftRestored] = useState(false);
  const [adminActorId, setAdminActorId] = useState('');
  const [adminActorResolved, setAdminActorResolved] = useState(false);
  const [goAutosaveState, setGoAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [goAutosaveAt, setGoAutosaveAt] = useState('');
  const [goAutosaveError, setGoAutosaveError] = useState('');
  const [goPreflight, setGoPreflight] = useState<GoPreflightResult | null>(null);
  const [goPreflightLoading, setGoPreflightLoading] = useState(false);
  const [quickPairMode, setQuickPairMode] = useState(false);
  const [quickPairFirst, setQuickPairFirst] = useState<Player | null>(null);
  const goAutosaveBusyRef = useRef(false);
  const goPlayoffSyncSignatureRef = useRef<string>('');
  const [rosterSessionId] = useState(
    () => `roster-ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const isEdit = useMemo(() => Boolean(form.id), [form.id]);
  const unifiedRosterV2Enabled = ADMIN_UNIFIED_ROSTER_V2;
  const dateInputValue = useMemo(() => normalizeDateInputValue(form.date), [form.date]);
  const isThaiFormat = useMemo(() => isThaiAdminFormat(form.format), [form.format]);
  const isKotcFormat = useMemo(() => isKotcAdminFormat(form.format), [form.format]);
  const isGoFormat = useMemo(() => isGoAdminFormat(form.format), [form.format]);
  const isExactThaiFormat = useMemo(() => isExactThaiTournamentFormat(form.format), [form.format]);
  const settings = useMemo(() => normalizeSettings(form.settings), [form.settings]);
  const thaiSettings = useMemo(
    () =>
      isThaiFormat
        ? normalizeThaiSettings(
            form.settings,
            draftPlayers.length,
            isEdit
              ? getThaiJudgeModuleFallback(form.settings, THAI_JUDGE_MODULE_LEGACY)
              : THAI_JUDGE_MODULE_NEXT,
          )
        : null,
    [draftPlayers.length, form.settings, isEdit, isThaiFormat]
  );
  const kotcSettings = useMemo(
    () =>
      isKotcFormat
        ? normalizeKotcSettings(
            form.settings,
            draftPlayers.length,
            isEdit ? 'legacy' : 'next',
          )
        : null,
    [draftPlayers.length, form.settings, isEdit, isKotcFormat],
  );
  const goSettings = useMemo(
    () =>
      isGoFormat
        ? normalizeGoSettings(
            form.settings,
            draftPlayers.length,
          )
        : null,
    [draftPlayers.length, form.settings, isGoFormat],
  );
  const goAutoSuggestion = useMemo(() => {
    if (!isGoFormat) return null;
    const declared = Number(
      goSettings?.goDeclaredTeamCount ??
      (goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS) * (goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP),
    );
    return buildGoAutoLayoutSuggestion(declared);
  }, [goSettings, isGoFormat]);
  const isFixedPairsSeeding = isGoFormat && goSettings?.goSeedingMode === 'fixedPairs';
  const fixedPairsHardSlots = isFixedPairsSeeding
    ? (goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS) * (goSettings?.goGroupFormulaHard ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.hard) * 2
    : 0;
  const fixedPairsMedSlots = isFixedPairsSeeding
    ? (goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS) * (goSettings?.goGroupFormulaMedium ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.medium) * 2
    : 0;
  const fixedPairsLiteSlots = isFixedPairsSeeding
    ? (goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS) * (goSettings?.goGroupFormulaLite ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.lite) * 2
    : 0;
  const fixedPairsPlayoffCounts = useMemo(() => {
    if (!isGoFormat || !isFixedPairsSeeding || !goSettings) return null;
    const leagues: GoPlayoffLeague[] = goSettings.goEnabledPlayoffLeagues?.length
      ? goSettings.goEnabledPlayoffLeagues
      : (['hard', 'medium', 'lite'] as GoPlayoffLeague[]);
    const baseByLeague: Record<GoPlayoffLeague, number> = {
      lyutye: Math.floor(fixedPairsHardSlots / 2),
      hard: Math.floor(fixedPairsHardSlots / 2),
      medium: Math.floor(fixedPairsMedSlots / 2),
      lite: Math.floor(fixedPairsLiteSlots / 2),
    };
    const next: TournamentSettings['goMixedTeamCounts'] = {};
    leagues.forEach((league) => {
      next[league] = clampGoMixedLeagueTeamCount(league, baseByLeague[league]);
    });
    return next;
  }, [
    fixedPairsHardSlots,
    fixedPairsLiteSlots,
    fixedPairsMedSlots,
    goSettings,
    isFixedPairsSeeding,
    isGoFormat,
  ]);
  const fixedPairsProgress = useMemo(() => {
    const hardFilled = draftPlayers.slice(0, fixedPairsHardSlots).filter(Boolean).length;
    const mediumFilled = draftPlayers.slice(fixedPairsHardSlots, fixedPairsHardSlots + fixedPairsMedSlots).filter(Boolean).length;
    const liteFilled = draftPlayers
      .slice(fixedPairsHardSlots + fixedPairsMedSlots, fixedPairsHardSlots + fixedPairsMedSlots + fixedPairsLiteSlots)
      .filter(Boolean).length;
    return {
      hardPairs: `${Math.floor(hardFilled / 2)}/${Math.floor(fixedPairsHardSlots / 2)}`,
      mediumPairs: `${Math.floor(mediumFilled / 2)}/${Math.floor(fixedPairsMedSlots / 2)}`,
      litePairs: `${Math.floor(liteFilled / 2)}/${Math.floor(fixedPairsLiteSlots / 2)}`,
    };
  }, [draftPlayers, fixedPairsHardSlots, fixedPairsLiteSlots, fixedPairsMedSlots]);

  const playersPerCourt = isThaiFormat
    ? THAI_ADMIN_PLAYERS_PER_COURT
    : isGoFormat
      ? Math.max(2, (goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP) * 2)
    : isKotcFormat
      ? kotcSettings?.playersPerCourt ?? settings.playersPerCourt
      : settings.playersPerCourt;
  const rosterLaneCount = isGoFormat
    ? Math.max(1, goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS)
    : settings.courts;
  const seatCount = isThaiFormat
    ? getThaiSeatCount(thaiSettings?.courts ?? THAI_ADMIN_COURTS)
    : isGoFormat
      ? getGoSeatCount(goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS, goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP)
    : isKotcFormat
      ? getKotcSeatCount(kotcSettings?.courts ?? settings.courts, kotcSettings?.kotcPpc ?? settings.kotcPpc)
      : settings.courts * playersPerCourt;
  const autoCapacity = seatCount;
  const participantLimit = isThaiFormat || isKotcFormat || isGoFormat ? seatCount : Math.max(Number(form.capacity || 0), 0) || autoCapacity;
  const reservePlayers = draftPlayers.slice(seatCount);
  const rosterOverflow = draftPlayers.length > participantLimit;
  const thaiMenCount = useMemo(() => draftPlayers.filter((player) => player && player.gender === 'M').length, [draftPlayers]);
  const thaiWomenCount = draftPlayers.filter((player) => player != null).length - thaiMenCount;
  const thaiRosterError = useMemo(() => {
    if (!isThaiFormat || !thaiSettings) return '';
    return (
      validateThaiRoster(
        draftPlayers.filter(Boolean).map((player) => ({
          id: player.playerId,
          gender: player.gender,
        })),
        {
          courts: thaiSettings.courts,
          thaiVariant: thaiSettings.thaiVariant,
          tourCount: thaiSettings.tourCount,
        }
      ) ?? ''
    );
  }, [draftPlayers, isThaiFormat, thaiSettings]);
  const goRosterError = useMemo(() => {
    if (!isGoFormat) return '';
    const mainRoster = draftPlayers.filter(Boolean);
    if (mainRoster.length % 2 !== 0) {
      return 'GO требует чётное количество игроков (пары по 2).';
    }
    if (isFixedPairsSeeding) {
      const hardFilled = draftPlayers.slice(0, fixedPairsHardSlots).filter(Boolean).length;
      const medFilled = draftPlayers.slice(fixedPairsHardSlots, fixedPairsHardSlots + fixedPairsMedSlots).filter(Boolean).length;
      const liteFilled = draftPlayers.slice(fixedPairsHardSlots + fixedPairsMedSlots, fixedPairsHardSlots + fixedPairsMedSlots + fixedPairsLiteSlots).filter(Boolean).length;
      if (hardFilled % 2 !== 0 || medFilled % 2 !== 0 || liteFilled % 2 !== 0) {
        return 'Фикс. пары: каждая категория должна быть заполнена целыми парами.';
      }
    }
    return '';
  }, [draftPlayers, isGoFormat, isFixedPairsSeeding, fixedPairsHardSlots, fixedPairsMedSlots, fixedPairsLiteSlots]);
  const registeredIds = useMemo(() => new Set(draftPlayers.filter(Boolean).map((player) => player.playerId)), [draftPlayers]);
  const filteredPlayers = useMemo(() => {
    const term = playerSearch.trim().toLowerCase();
    return filterPlayersByGenderSelection(
      allPlayers
      .filter((player) => !registeredIds.has(player.id))
      .filter((player) => {
        if (!isThaiFormat || !thaiSettings) return true;
        if (thaiSettings.thaiVariant === 'WW') return player.gender === 'W';
        if (thaiSettings.thaiVariant === 'MM') return player.gender === 'M';
        return true;
      })
      .filter((player) => !term || player.name.toLowerCase().includes(term))
      , playerGenderFilter).slice(0, 40);
  }, [allPlayers, isThaiFormat, playerGenderFilter, playerSearch, registeredIds, thaiSettings]);
  const rosterWorkspaceOptions = useMemo(() => {
    if (isGoFormat) {
      if (isFixedPairsSeeding) {
        return [
          { key: 'categories' as const, label: 'По категориям' },
          { key: 'groups' as const, label: 'По группам' },
        ];
      }
      return [{ key: 'groups' as const, label: 'По группам' }];
    }
    if (isThaiFormat) {
      return [
        { key: 'courts' as const, label: 'По кортам' },
        { key: 'thai-r1' as const, label: 'R1-схема' },
      ];
    }
    return [{ key: 'courts' as const, label: 'По кортам' }];
  }, [isFixedPairsSeeding, isGoFormat, isThaiFormat]);
  const currentWorkspaceLabel = useMemo(() => {
    return rosterWorkspaceOptions.find((option) => option.key === rosterWorkspaceView)?.label ?? 'Вид';
  }, [rosterWorkspaceOptions, rosterWorkspaceView]);

  function cycleRosterWorkspaceView() {
    if (rosterWorkspaceOptions.length <= 1) return;
    const keys = rosterWorkspaceOptions.map((option) => option.key);
    const index = keys.indexOf(rosterWorkspaceView);
    const nextKey = keys[(index + 1) % keys.length] as 'categories' | 'groups' | 'courts' | 'thai-r1';
    setRosterWorkspaceView(nextKey);
    if (nextKey === 'categories' || nextKey === 'groups') {
      setFixedPairsView(nextKey);
    }
  }

  function makeRosterRequestId(action: string): string {
    return `${action}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function applyHistoryToDraft(nextHistory: RosterEditorHistoryState) {
    setRosterHistory(nextHistory);
    const nextDraft = snapshotToDraftPlayers(nextHistory.currentSnapshot).map((slot) =>
      slot ? ({ ...slot } as DraftPlayer) : (undefined as unknown as DraftPlayer),
    );
    setDraftPlayers(nextDraft);
    setSelectedDraftIndex(null);
  }

  async function fetchRosterHistory(tournamentId: string) {
    if (!unifiedRosterV2Enabled || !tournamentId) {
      setRosterHistory(EMPTY_ROSTER_HISTORY);
      return;
    }
    try {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/roster-editor/history`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as RosterEditorHistoryState | { error?: string } | null;
      if (!res.ok || !data || typeof data !== 'object' || !('cursor' in data)) {
        return;
      }
      setRosterHistory(data as RosterEditorHistoryState);
      if ((data as RosterEditorHistoryState).currentSnapshot) {
        const draftFromHistory = snapshotToDraftPlayers((data as RosterEditorHistoryState).currentSnapshot).map((slot) =>
          slot ? ({ ...slot } as DraftPlayer) : (undefined as unknown as DraftPlayer),
        );
        setDraftPlayers(draftFromHistory);
      }
    } catch {
      // best-effort history loading
    }
  }

  async function sendRosterAction(
    action: RosterEditorAction,
    nextDraft: DraftPlayer[],
  ) {
    if (!unifiedRosterV2Enabled || !form.id) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(form.id)}/roster-editor/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          snapshot: draftPlayersToSnapshot(
            nextDraft.map((slot) => (slot ? { ...slot } : null)),
          ),
          expectedRevision: rosterHistory.revision,
          sessionId: rosterSessionId,
          requestId: makeRosterRequestId(action.type),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | RosterEditorHistoryState
        | { current?: RosterEditorHistoryState; error?: string }
        | null;
      if (res.ok && data && typeof data === 'object' && 'cursor' in data) {
        setRosterHistory(data);
      } else if (
        res.status === 409 &&
        data &&
        typeof data === 'object' &&
        'current' in data &&
        data.current
      ) {
        applyHistoryToDraft(data.current);
        setMessage('Состав был изменён в другой вкладке. Применена актуальная версия.');
      }
    } catch {
      // best-effort history persistence
    }
  }

  async function undoRosterAction() {
    if (!unifiedRosterV2Enabled || !form.id || rosterHistoryBusy) return;
    setRosterHistoryBusy(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(form.id)}/roster-editor/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: rosterHistory.revision,
          sessionId: rosterSessionId,
          requestId: makeRosterRequestId('undo'),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | RosterEditorHistoryState
        | { current?: RosterEditorHistoryState; error?: string }
        | null;
      if (res.ok && data && typeof data === 'object' && 'cursor' in data) {
        applyHistoryToDraft(data);
      } else if (
        res.status === 409 &&
        data &&
        typeof data === 'object' &&
        'current' in data &&
        data.current
      ) {
        applyHistoryToDraft(data.current);
        setMessage('Undo отклонён из-за конфликта версии. Загружено актуальное состояние.');
      }
    } finally {
      setRosterHistoryBusy(false);
    }
  }

  async function redoRosterAction() {
    if (!unifiedRosterV2Enabled || !form.id || rosterHistoryBusy) return;
    setRosterHistoryBusy(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(form.id)}/roster-editor/redo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: rosterHistory.revision,
          sessionId: rosterSessionId,
          requestId: makeRosterRequestId('redo'),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | RosterEditorHistoryState
        | { current?: RosterEditorHistoryState; error?: string }
        | null;
      if (res.ok && data && typeof data === 'object' && 'cursor' in data) {
        applyHistoryToDraft(data);
      } else if (
        res.status === 409 &&
        data &&
        typeof data === 'object' &&
        'current' in data &&
        data.current
      ) {
        applyHistoryToDraft(data.current);
        setMessage('Redo отклонён из-за конфликта версии. Загружено актуальное состояние.');
      }
    } finally {
      setRosterHistoryBusy(false);
    }
  }

  async function clearRosterHistoryState() {
    if (!unifiedRosterV2Enabled || !form.id || rosterHistoryBusy) return;
    setRosterHistoryBusy(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(form.id)}/roster-editor/history/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: rosterHistory.revision,
          sessionId: rosterSessionId,
          requestId: makeRosterRequestId('clear'),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | RosterEditorHistoryState
        | { current?: RosterEditorHistoryState; error?: string }
        | null;
      if (res.ok && data && typeof data === 'object' && 'cursor' in data) {
        setRosterHistory(data);
      } else if (
        res.status === 409 &&
        data &&
        typeof data === 'object' &&
        'current' in data &&
        data.current
      ) {
        setRosterHistory(data.current);
        setMessage('Очистка истории отклонена из-за конфликта версии.');
      }
    } finally {
      setRosterHistoryBusy(false);
    }
  }

  const isDirty = useMemo(() => {
    const defaults = createEmptyForm();
    return (
      form.name !== defaults.name ||
      form.date !== defaults.date ||
      form.time !== defaults.time ||
      form.location !== defaults.location ||
      draftPlayers.some(Boolean)
    );
  }, [form.name, form.date, form.time, form.location, draftPlayers]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !message.includes('Сохранено')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, message]);

  useEffect(() => {
    if (isGoFormat) {
      setRosterWorkspaceView(isFixedPairsSeeding ? 'categories' : 'groups');
      return;
    }
    if (isThaiFormat) {
      setRosterWorkspaceView('courts');
      return;
    }
    setRosterWorkspaceView('courts');
  }, [form.id, isFixedPairsSeeding, isGoFormat, isThaiFormat]);

  useEffect(() => {
    if (rosterWorkspaceView === 'categories' || rosterWorkspaceView === 'groups') {
      setFixedPairsView(rosterWorkspaceView);
    }
  }, [rosterWorkspaceView]);

  useEffect(() => {
    if (!isGoFormat || !goSettings) return;
    const leagues: GoPlayoffLeague[] = goSettings.goEnabledPlayoffLeagues?.length
      ? goSettings.goEnabledPlayoffLeagues
      : (['hard', 'medium', 'lite'] as GoPlayoffLeague[]);
    const structuralSignature = JSON.stringify({
      groupCount: goSettings.goGroupCount,
      formulaHard: goSettings.goGroupFormulaHard,
      formulaMedium: goSettings.goGroupFormulaMedium,
      formulaLite: goSettings.goGroupFormulaLite,
      leagues,
    });
    const structuralChanged = goPlayoffSyncSignatureRef.current !== structuralSignature;
    if (structuralChanged) {
      goPlayoffSyncSignatureRef.current = structuralSignature;
    }
    const autoCounts = buildAutoGoMixedTeamCounts(goSettings);
    const currentCounts = goSettings.goMixedTeamCounts ?? {};
    const hasMissing = leagues.some((league) => currentCounts[league] == null);
    const hasLegacyDefaults = isLegacyGoMixedDefaultCounts(currentCounts, leagues);
    const countsDiffer = leagues.some(
      (league) => Number(currentCounts[league] ?? NaN) !== Number(autoCounts[league] ?? NaN),
    );
    if (!countsDiffer && !hasMissing && !hasLegacyDefaults) return;
    if (!structuralChanged && !hasMissing && !hasLegacyDefaults) return;
    const nextCounts = { ...currentCounts };
    leagues.forEach((league) => {
      nextCounts[league] = autoCounts[league];
    });
    const nextSizes = { ...(goSettings.goBracketSizes ?? {}) };
    leagues.forEach((league) => {
      const teamCount = clampGoMixedLeagueTeamCount(league, Number(nextCounts[league] ?? autoCounts[league] ?? 0));
      nextSizes[league] = getGoMixedBracketSize(teamCount);
    });
    updateSettings({ goMixedTeamCounts: nextCounts, goBracketSizes: nextSizes });
  }, [goSettings, isGoFormat]);

  useEffect(() => {
    if (!isGoFormat || !isFixedPairsSeeding || !goSettings || !fixedPairsPlayoffCounts) return;
    const leagues: GoPlayoffLeague[] = goSettings.goEnabledPlayoffLeagues?.length
      ? goSettings.goEnabledPlayoffLeagues
      : (['hard', 'medium', 'lite'] as GoPlayoffLeague[]);
    const currentCounts = goSettings.goMixedTeamCounts ?? {};
    const nextCounts: TournamentSettings['goMixedTeamCounts'] = {};
    const nextSizes: TournamentSettings['goBracketSizes'] = {};
    let shouldSync = false;
    leagues.forEach((league) => {
      const maxAvailable = clampGoMixedLeagueTeamCount(league, Number(fixedPairsPlayoffCounts[league] ?? 0));
      const currentValue = Number(currentCounts[league] ?? NaN);
      const nextValue =
        !Number.isFinite(currentValue) || currentValue > maxAvailable
          ? maxAvailable
          : clampGoMixedLeagueTeamCount(league, currentValue);
      if (!Number.isFinite(currentValue) || currentValue !== nextValue) {
        shouldSync = true;
      }
      nextCounts[league] = nextValue;
      nextSizes[league] = getGoMixedBracketSize(nextValue);
    });
    if (!shouldSync) return;
    updateSettings({ goMixedTeamCounts: nextCounts, goBracketSizes: nextSizes });
  }, [fixedPairsPlayoffCounts, goSettings, isFixedPairsSeeding, isGoFormat]);

  function resetComposer() {
    clearTournamentComposerDraft();
    setForm(createEmptyForm());
    setDraftPlayers([]);
    setSelectedDraftIndex(null);
    setPlayerSearch('');
    setPlayerGenderFilter('all');
    setRosterError('');
    setLaunchTarget(null);
    setConfirmClearCourtIndex(null);
    setRosterHistory(EMPTY_ROSTER_HISTORY);
  }

  function updateSettings(patch: Partial<TournamentSettings>) {
    setForm((current) => {
      const nextSettings = { ...normalizeSettings(current.settings), ...patch };
      if (isThaiAdminFormat(current.format)) {
        const nextThaiSettings = normalizeThaiSettings(nextSettings, draftPlayers.length);
        return {
          ...current,
          format: THAI_ADMIN_FORMAT,
          division: getThaiDivisionLabel(nextThaiSettings.thaiVariant),
          capacity: getThaiSeatCount(nextThaiSettings.courts),
          settings: {
            ...nextSettings,
            ...nextThaiSettings,
          },
        };
      }
      if (isKotcAdminFormat(current.format)) {
        const fallbackModule = current.id ? 'legacy' : 'next';
        const nextKotcSettings = normalizeKotcSettings(nextSettings, draftPlayers.length, fallbackModule);
        return {
          ...current,
          format: KOTC_ADMIN_FORMAT,
          capacity: getKotcSeatCount(nextKotcSettings.courts, nextKotcSettings.kotcPpc),
          settings: {
            ...nextSettings,
            ...nextKotcSettings,
          },
        };
      }
      if (isGoAdminFormat(current.format)) {
        const nextGoSettings = normalizeGoSettings(nextSettings, draftPlayers.length);
        return {
          ...current,
          format: GO_ADMIN_FORMAT,
          capacity: getGoSeatCount(nextGoSettings.goGroupCount, nextGoSettings.goTeamsPerGroup),
          settings: {
            ...nextSettings,
            ...nextGoSettings,
          },
        };
      }
      return {
        ...current,
        settings: nextSettings,
      };
    });
  }

  function updateGoGroupFormulaPart(part: 'hard' | 'medium' | 'lite', nextValue: number) {
    const hard = part === 'hard' ? nextValue : goSettings?.goGroupFormulaHard ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.hard;
    const medium = part === 'medium' ? nextValue : goSettings?.goGroupFormulaMedium ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.medium;
    const lite = part === 'lite' ? nextValue : goSettings?.goGroupFormulaLite ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.lite;
    const total = hard + medium + lite;
    if (total < 3 || total > 4) {
      setMessage('В GO допускается только 3 или 4 команды в группе.');
      return;
    }
    updateSettings({
      goGroupFormulaHard: hard,
      goGroupFormulaMedium: medium,
      goGroupFormulaLite: lite,
    });
    setMessage('');
  }

  function applyFormat(format: string) {
    setForm((current) => {
      const nextSettings = normalizeSettings(current.settings);
      if (isThaiAdminFormat(format)) {
        const thaiSeedSettings: Partial<TournamentSettings> =
          current.format === THAI_ADMIN_FORMAT
            ? nextSettings
            : {
                ...nextSettings,
                courts: THAI_ADMIN_COURTS,
                tourCount: THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT,
                thaiJudgeModule: THAI_JUDGE_MODULE_NEXT,
                thaiJudgeBootstrapSignature: null,
              };
        const nextThaiSettings = normalizeThaiSettings(
          thaiSeedSettings,
          draftPlayers.length,
          THAI_JUDGE_MODULE_NEXT,
        );
        return {
          ...current,
          format: THAI_ADMIN_FORMAT,
          division: getThaiDivisionLabel(nextThaiSettings.thaiVariant),
          capacity: getThaiSeatCount(nextThaiSettings.courts),
          settings: {
            ...nextSettings,
            ...nextThaiSettings,
          },
        };
      }
      if (isKotcAdminFormat(format)) {
        const kotcSeedSettings: Partial<TournamentSettings> =
          current.format === KOTC_ADMIN_FORMAT
            ? nextSettings
            : {
                ...nextSettings,
                kotcJudgeModule: 'next',
                kotcJudgeBootstrapSignature: null,
                kotcPpc: KOTC_ADMIN_DEFAULT_PPC,
                kotcRaundCount: KOTC_ADMIN_DEFAULT_RAUNDS,
                kotcRaundTimerMinutes: KOTC_ADMIN_DEFAULT_TIMER,
              };
        const nextKotcSettings = normalizeKotcSettings(
          kotcSeedSettings,
          draftPlayers.length,
          'next',
        );
        return {
          ...current,
          format: KOTC_ADMIN_FORMAT,
          capacity: getKotcSeatCount(nextKotcSettings.courts, nextKotcSettings.kotcPpc),
          settings: {
            ...nextSettings,
            ...nextKotcSettings,
          },
        };
      }
      if (isGoAdminFormat(format)) {
        const goSeedSettings: Partial<TournamentSettings> =
          current.format === GO_ADMIN_FORMAT
            ? nextSettings
            : {
                ...nextSettings,
                goCourts: GO_ADMIN_DEFAULT_COURTS,
                goDeclaredTeamCount: GO_ADMIN_DEFAULT_GROUPS * GO_ADMIN_DEFAULT_TEAMS_PER_GROUP,
                goGroupCount: GO_ADMIN_DEFAULT_GROUPS,
                goTeamsPerGroup: GO_ADMIN_DEFAULT_TEAMS_PER_GROUP,
                goMatchFormat: 'single15',
                goPointLimitGroup: 15,
                goPointLimitBracket: 15,
                goSeedingMode: 'serpentine',
                goBracketLevels: GO_ADMIN_DEFAULT_BRACKET_LEVELS,
                goMatchPointSystem: 'fivb',
                goTieBreakerLogic: 'fivb',
                goGroupFormulaHard: GO_ADMIN_DEFAULT_GROUP_FORMULA.hard,
                goGroupFormulaMedium: GO_ADMIN_DEFAULT_GROUP_FORMULA.medium,
                goGroupFormulaLite: GO_ADMIN_DEFAULT_GROUP_FORMULA.lite,
                goSlotMinutes: GO_ADMIN_DEFAULT_SLOT_MINUTES,
                goStartTime: GO_ADMIN_DEFAULT_START_TIME,
                goEnabledPlayoffLeagues: ['hard', 'medium', 'lite'],
                goBracketSizes: { hard: 4, medium: 4, lite: 4 },
                goBronzeMatchEnabled: true,
              };
        const nextGoSettings = normalizeGoSettings(
          goSeedSettings,
          draftPlayers.length,
        );
        return {
          ...current,
          format: GO_ADMIN_FORMAT,
          capacity: getGoSeatCount(nextGoSettings.goGroupCount, nextGoSettings.goTeamsPerGroup),
          settings: {
            ...nextSettings,
            ...nextGoSettings,
          },
        };
      }
      return {
        ...current,
        format,
        settings: nextSettings,
      };
    });
    setMessage('');
  }

  async function load() {
    const res = await fetch(`/api/admin/tournaments?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => []);
    setRows(
      Array.isArray(data)
        ? data.map((row) => ({
            ...(row as Row),
            date: normalizeDateInputValue((row as Row).date),
          }))
        : []
    );
  }

  async function loadPlayers() {
    const res = await fetch('/api/admin/players', { cache: 'no-store' });
    const data = await res.json().catch(() => []);
    setAllPlayers(
      Array.isArray(data)
        ? data.map((player) => ({
            id: String(player?.id ?? ''),
            name: String(player?.name ?? ''),
            gender: normalizeGender(player?.gender),
            level: normalizeGoSkillLevel(player?.level),
          }))
        : []
    );
    setRowsLoaded(true);
  }

  useEffect(() => {
    void Promise.all([load(), loadPlayers()]);
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch('/api/admin/auth', { cache: 'no-store' })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!mounted) return;
        const actorId = String((data as { actor?: { id?: string } })?.actor?.id ?? '').trim();
        setAdminActorId(actorId);
        setAdminActorResolved(true);
      })
      .catch(() => {
        if (!mounted) return;
        setAdminActorResolved(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (serverDraftRestoreAttempted) return;
    if (!adminActorResolved) return;
    if (!rowsLoaded) return;
    const serverDraft = rows.find((row) => {
      const status = String(row.status ?? '').toLowerCase();
      const owner = String((row.settings as Record<string, unknown> | undefined)?.goDraftOwner ?? '').trim();
      return isGoAdminFormat(row.format) && status === 'draft' && owner === adminActorId;
    });
    if (serverDraft) {
      void startEdit(serverDraft);
      setServerDraftRestored(true);
      setMessage('Восстановлен серверный черновик GO.');
    }
    setServerDraftRestoreAttempted(true);
  }, [adminActorId, adminActorResolved, rows, rowsLoaded, serverDraftRestoreAttempted]);

  useEffect(() => {
    if (!serverDraftRestoreAttempted) return;
    if (serverDraftRestored) {
      setComposerDraftHydrated(true);
      return;
    }
    const snapshot = readTournamentComposerDraft();
    if (!snapshot) {
      setComposerDraftHydrated(true);
      return;
    }
    setForm((current) => ({
      ...current,
      ...snapshot.form,
      id: '',
      participantCount: snapshot.draftPlayers.filter(Boolean).length,
    }));
    setDraftPlayers(
      snapshot.draftPlayers.map((slot) => (slot ? ({ ...slot } as DraftPlayer) : (undefined as unknown as DraftPlayer))),
    );
    setMessage('Черновик восстановления загружен.');
    setComposerDraftHydrated(true);
  }, [serverDraftRestoreAttempted, serverDraftRestored]);

  useEffect(() => {
    if (!composerDraftHydrated || isEdit) return;
    const hasDraftContent = Boolean(form.name.trim() || draftPlayers.some(Boolean));
    if (!hasDraftContent) {
      clearTournamentComposerDraft();
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const payload: TournamentComposerDraftPayload = {
        version: 1,
        savedAt: Date.now(),
        form: {
          name: form.name,
          date: normalizeDateInputValue(form.date),
          time: form.time,
          location: form.location,
          format: form.format,
          division: form.division,
          level: form.level,
          capacity: Number(form.capacity || 0),
          status: form.status,
          settings: normalizeSettings(form.settings),
        },
        draftPlayers: draftPlayers.map((slot) => (slot ? { ...slot } : null)),
      };
      try {
        window.localStorage.setItem(TOURNAMENT_COMPOSER_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [composerDraftHydrated, draftPlayers, form, isEdit]);

  useEffect(() => {
    if (selectedDraftIndex != null && selectedDraftIndex >= draftPlayers.length) {
      setSelectedDraftIndex(null);
    }
  }, [draftPlayers.length, selectedDraftIndex]);

  useEffect(() => {
    if (!quickPairMode && quickPairFirst) {
      setQuickPairFirst(null);
    }
  }, [quickPairFirst, quickPairMode]);

  useEffect(() => {
    if (!isThaiFormat) return;
    setForm((current) => {
      const currentSettings = normalizeSettings(current.settings);
      const nextSettings = normalizeThaiSettings(current.settings, draftPlayers.filter(Boolean).length);
      const nextDivision = getThaiDivisionLabel(nextSettings.thaiVariant);
      const nextCapacity = getThaiSeatCount(nextSettings.courts);

      if (
        current.format === THAI_ADMIN_FORMAT &&
        current.capacity === nextCapacity &&
        current.division === nextDivision &&
        currentSettings.courts === nextSettings.courts &&
        currentSettings.playersPerCourt === nextSettings.playersPerCourt &&
        currentSettings.pairsMode === nextSettings.pairsMode &&
        currentSettings.thaiVariant === nextSettings.thaiVariant &&
        currentSettings.thaiRosterMode === nextSettings.thaiRosterMode &&
        currentSettings.tourCount === nextSettings.tourCount &&
        currentSettings.thaiPointLimit === nextSettings.thaiPointLimit &&
        currentSettings.thaiPointLimitR1 === nextSettings.thaiPointLimitR1 &&
        currentSettings.thaiPointLimitR2 === nextSettings.thaiPointLimitR2 &&
        currentSettings.thaiJudgeModule === nextSettings.thaiJudgeModule &&
        currentSettings.thaiJudgeBootstrapSignature === nextSettings.thaiJudgeBootstrapSignature &&
        currentSettings.thaiRulesPreset === nextSettings.thaiRulesPreset
      ) {
        return current;
      }

      return {
        ...current,
        format: THAI_ADMIN_FORMAT,
        division: nextDivision,
        capacity: nextCapacity,
        settings: nextSettings,
      };
    });
  }, [draftPlayers.length, isThaiFormat]);

  useEffect(() => {
    if (!isKotcFormat) return;
    setForm((current) => {
      const currentSettings = normalizeSettings(current.settings);
      const nextSettings = normalizeKotcSettings(
        current.settings,
        draftPlayers.filter(Boolean).length,
        current.id ? 'legacy' : 'next',
      );
      const nextCapacity = getKotcSeatCount(nextSettings.courts, nextSettings.kotcPpc);

      if (
        current.format === KOTC_ADMIN_FORMAT &&
        current.capacity === nextCapacity &&
        currentSettings.courts === nextSettings.courts &&
        currentSettings.playersPerCourt === nextSettings.playersPerCourt &&
        currentSettings.kotcJudgeModule === nextSettings.kotcJudgeModule &&
        currentSettings.kotcJudgeBootstrapSignature === nextSettings.kotcJudgeBootstrapSignature &&
        currentSettings.kotcPpc === nextSettings.kotcPpc &&
        currentSettings.kotcRaundCount === nextSettings.kotcRaundCount &&
        currentSettings.kotcRaundTimerMinutes === nextSettings.kotcRaundTimerMinutes
      ) {
        return current;
      }

      return {
        ...current,
        format: KOTC_ADMIN_FORMAT,
        capacity: nextCapacity,
        settings: nextSettings,
      };
    });
  }, [draftPlayers.length, isKotcFormat]);

  async function startEdit(row: Row) {
    setMessage('');
    setRosterError('');
    setSelectedDraftIndex(null);
    setPlayerGenderFilter('all');
    setRosterLoading(true);
    setLaunchTarget(getPrimaryLaunchTarget(row));
    if (isThaiAdminFormat(row.format)) {
      const nextSettings = normalizeThaiSettings(
        row.settings,
        row.participantCount || row.capacity,
        isExactThaiTournamentFormat(row.format)
          ? getThaiJudgeModuleFallback(row.settings, THAI_JUDGE_MODULE_LEGACY)
          : THAI_JUDGE_MODULE_NEXT,
      );
      setForm({
        ...row,
        date: normalizeDateInputValue(row.date),
        format: THAI_ADMIN_FORMAT,
        division: getThaiDivisionLabel(nextSettings.thaiVariant),
        capacity: getThaiSeatCount(nextSettings.courts),
        settings: nextSettings,
      });
    } else if (isKotcAdminFormat(row.format)) {
      const nextSettings = normalizeKotcSettings(
        row.settings,
        row.participantCount || row.capacity,
        row.kotcJudgeModule ?? 'legacy',
      );
      setForm({
        ...row,
        date: normalizeDateInputValue(row.date),
        format: KOTC_ADMIN_FORMAT,
        capacity: getKotcSeatCount(nextSettings.courts, nextSettings.kotcPpc),
        settings: nextSettings,
      });
    } else if (isGoAdminFormat(row.format)) {
      const nextSettings = normalizeGoSettings(
        row.settings,
        row.participantCount || row.capacity,
      );
      setForm({
        ...row,
        date: normalizeDateInputValue(row.date),
        format: GO_ADMIN_FORMAT,
        capacity: getGoSeatCount(nextSettings.goGroupCount, nextSettings.goTeamsPerGroup),
        settings: nextSettings,
      });
    } else {
      setForm({ ...row, date: normalizeDateInputValue(row.date), settings: normalizeSettings(row.settings) });
    }
    try {
      const res = await fetch(`/api/admin/roster?tournamentId=${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        const errorText =
          typeof data === 'object' && data && 'error' in data ? String(data.error ?? '') : 'Не удалось загрузить состав';
        throw new Error(errorText);
      }
      const participants = Array.isArray(data) ? (data as RosterParticipant[]) : [];
      const mainParticipants = participants
        .filter((participant) => !participant.isWaitlist)
        .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0));
      const playersSparse: DraftPlayer[] = [];
      mainParticipants.forEach((participant) => {
        const rawPos = Number(participant.position ?? 0);
        const index = Number.isFinite(rawPos) && rawPos > 0 ? rawPos - 1 : playersSparse.length;
        playersSparse[index] = {
          playerId: String(participant.playerId ?? ''),
          playerName: String(participant.playerName ?? ''),
          gender: normalizeGender(participant.gender),
        };
      });
      // Fill gaps up to the largest index with undefined to ensure holes are preserved
      for (let i = 0; i < playersSparse.length; i++) {
        if (!playersSparse[i]) {
          playersSparse[i] = undefined as unknown as DraftPlayer;
        }
      }
      setDraftPlayers(playersSparse);
      void fetchRosterHistory(row.id);
    } catch (error) {
      const errorText = getErrorText(error, 'Не удалось загрузить состав');
      setDraftPlayers([]);
      setRosterHistory(EMPTY_ROSTER_HISTORY);
      setRosterError(errorText);
      setMessage(errorText);
    } finally {
      setRosterLoading(false);
    }
  }

  function getFixedPairsCategoryRange(category: 'hard' | 'medium' | 'easy') {
    const start = category === 'hard' ? 0 : category === 'medium' ? fixedPairsHardSlots : fixedPairsHardSlots + fixedPairsMedSlots;
    const end = category === 'hard'
      ? fixedPairsHardSlots
      : category === 'medium'
        ? fixedPairsHardSlots + fixedPairsMedSlots
        : fixedPairsHardSlots + fixedPairsMedSlots + fixedPairsLiteSlots;
    return { start, end };
  }

  function buildAvailablePlayersByCategory(sourceDraft: DraftPlayer[]) {
    const usedIds = new Set(sourceDraft.filter(Boolean).map((player) => player.playerId));
    const available = allPlayers.filter((player) => !usedIds.has(player.id));
    return {
      hard: available.filter((player) => normalizeGoSkillLevel(player.level) === 'hard'),
      medium: available.filter((player) => normalizeGoSkillLevel(player.level) === 'medium'),
      easy: available.filter((player) => normalizeGoSkillLevel(player.level) === 'easy'),
    } as const;
  }

  function clearFixedPairsCategory(category: 'hard' | 'medium' | 'easy') {
    if (!isFixedPairsSeeding) return;
    const { start, end } = getFixedPairsCategoryRange(category);
    if (end <= start) return;
    let nextDraftRef: DraftPlayer[] = [];
    const indexes: number[] = [];
    setDraftPlayers((current) => {
      const next = [...current];
      for (let index = start; index < end; index += 1) {
        if (next[index]) indexes.push(index);
        next[index] = undefined as unknown as DraftPlayer;
      }
      while (next.length > 0 && !next[next.length - 1]) next.pop();
      nextDraftRef = next;
      return next;
    });
    void sendRosterAction(
      {
        type: 'clear_scope',
        scope: 'categories',
        indexes,
        note: `clear-fixed-pairs-${category}`,
      },
      nextDraftRef,
    );
    setQuickPairFirst(null);
    setMessage('');
  }

  function topUpFixedPairsCategory(category: 'hard' | 'medium' | 'easy') {
    if (!isFixedPairsSeeding) return;
    const { start, end } = getFixedPairsCategoryRange(category);
    if (end <= start) return;
    const availableByCategory = buildAvailablePlayersByCategory(draftPlayers);
    const queue = [...availableByCategory[category]];
    if (!queue.length) {
      setMessage(`Нет доступных игроков уровня ${category.toUpperCase()} для дозаполнения.`);
      return;
    }
    let nextDraftRef: DraftPlayer[] = [];
    setDraftPlayers((current) => {
      const next = [...current];
      const freeIndexes: number[] = [];
      for (let index = start; index < end; index += 1) {
        if (!next[index]) freeIndexes.push(index);
      }
      const fillCount = Math.min(
        freeIndexes.length - (freeIndexes.length % 2),
        queue.length - (queue.length % 2),
      );
      for (let index = 0; index < fillCount; index += 1) {
        const slotIndex = freeIndexes[index];
        const player = queue[index];
        next[slotIndex] = {
          playerId: player.id,
          playerName: player.name,
          gender: player.gender,
          playerLevel: category,
        };
      }
      while (next.length > 0 && !next[next.length - 1]) next.pop();
      nextDraftRef = next;
      return next;
    });
    void sendRosterAction(
      { type: 'assign', scope: 'categories', note: `topup-fixed-pairs-${category}` },
      nextDraftRef,
    );
    setMessage('');
  }

  function autoDistributeFixedPairsByCategory() {
    if (!isFixedPairsSeeding) return;
    const categories: Array<'hard' | 'medium' | 'easy'> = ['hard', 'medium', 'easy'];
    const availableByCategory = buildAvailablePlayersByCategory(draftPlayers);
    let nextDraftRef: DraftPlayer[] = [];
    setDraftPlayers((current) => {
      const next = [...current];
      categories.forEach((category) => {
        const { start, end } = getFixedPairsCategoryRange(category);
        if (end <= start) return;
        const queue = [...availableByCategory[category]];
        if (!queue.length) return;
        for (let index = start; index < end && queue.length; index += 1) {
          if (next[index]) continue;
          const player = queue.shift();
          if (!player) break;
          next[index] = {
            playerId: player.id,
            playerName: player.name,
            gender: player.gender,
            playerLevel: category,
          };
        }
      });
      while (next.length > 0 && !next[next.length - 1]) next.pop();
      nextDraftRef = next;
      return next;
    });
    void sendRosterAction(
      { type: 'assign', scope: 'categories', note: 'auto-distribute-fixed-pairs' },
      nextDraftRef,
    );
    setMessage('');
  }

  function handlePoolAddPlayer(player: Player) {
    if (!isFixedPairsSeeding || !quickPairMode) {
      addDraftPlayer(player);
      return;
    }
    if (!quickPairFirst) {
      setQuickPairFirst(player);
      setMessage(`Выбран первый игрок пары: ${player.name}. Выберите второго игрока.`);
      return;
    }
    if (quickPairFirst.id === player.id) {
      setMessage('Выберите другого игрока для второй позиции пары.');
      return;
    }
    const category = normalizeGoSkillLevel(quickPairFirst.level);
    addDraftPlayer(quickPairFirst, category);
    addDraftPlayer(player, category);
    setQuickPairFirst(null);
    setMessage('');
  }

  function addDraftPlayer(player: Player, forceCategory?: 'hard' | 'medium' | 'easy') {
    if (registeredIds.has(player.id)) return;
    if (draftPlayers.length >= participantLimit) {
      setMessage(`Лимит участников достигнут: ${participantLimit}`);
      return;
    }

    // Fixed Pairs mode: route player to the correct category slot range
    if (isFixedPairsSeeding) {
      const cat = forceCategory ?? normalizeGoSkillLevel(player.level);
      const rangeStart = cat === 'hard' ? 0 : cat === 'medium' ? fixedPairsHardSlots : fixedPairsHardSlots + fixedPairsMedSlots;
      const rangeEnd = cat === 'hard' ? fixedPairsHardSlots : cat === 'medium' ? fixedPairsHardSlots + fixedPairsMedSlots : fixedPairsHardSlots + fixedPairsMedSlots + fixedPairsLiteSlots;
      if (rangeEnd <= rangeStart) {
        setMessage(`Категория ${cat.toUpperCase()} не предусмотрена в текущей формуле.`);
        return;
      }
      let targetSlot = rangeStart;
      while (targetSlot < rangeEnd && draftPlayers[targetSlot]) targetSlot++;
      if (targetSlot >= rangeEnd) {
        setMessage(`Слоты ${cat === 'easy' ? 'LITE' : cat.toUpperCase()} уже заполнены.`);
        return;
      }
      let nextDraftRef: DraftPlayer[] = [];
      setDraftPlayers((current) => {
        const next = [...current];
        while (next.length <= targetSlot) next.push(undefined as unknown as DraftPlayer);
        next[targetSlot] = { playerId: player.id, playerName: player.name, gender: player.gender, playerLevel: cat };
        nextDraftRef = next;
        return next;
      });
      void sendRosterAction(
        { type: 'assign', scope: 'categories', toIndex: targetSlot, note: 'add-player-fixed-pairs' },
        nextDraftRef,
      );
      setMessage('');
      return;
    }

    if (isThaiFormat && thaiSettings) {
      if (thaiSettings.thaiVariant === 'MM' && player.gender !== 'M') {
        setMessage('Thai Муж допускает только мужчин.');
        return;
      }
      if (thaiSettings.thaiVariant === 'WW' && player.gender !== 'W') {
        setMessage('Thai Жен допускает только женщин.');
        return;
      }
      if (thaiSettings.thaiVariant === 'MF') {
        const sameGenderCount = draftPlayers.filter((draftPlayer) => draftPlayer.gender === player.gender).length;
        const sameGenderLimit = participantLimit / 2;
        if (sameGenderCount >= sameGenderLimit) {
          setMessage(
            player.gender === 'W'
              ? `Thai Микст уже собрал ${sameGenderLimit} женщин.`
              : `Thai Микст уже собрал ${sameGenderLimit} мужчин.`
          );
          return;
        }
      }
    }
    let nextDraftRef: DraftPlayer[] = [];
    setDraftPlayers((current) => {
      const holeIndex = current.findIndex((p) => !p);
      if (holeIndex !== -1 && holeIndex < participantLimit) {
        const next = [...current];
        next[holeIndex] = {
          playerId: player.id,
          playerName: player.name,
          gender: player.gender,
        };
        nextDraftRef = next;
        return next;
      }
      const appended = [
        ...current,
        {
          playerId: player.id,
          playerName: player.name,
          gender: player.gender,
        },
      ];
      nextDraftRef = appended;
      return appended;
    });
    void sendRosterAction(
      { type: 'assign', scope: isThaiFormat ? 'courts' : isGoFormat ? 'groups' : 'all', note: 'add-player' },
      nextDraftRef,
    );
    setMessage('');
  }

  function removeDraftPlayer(index: number) {
    let nextDraftRef: DraftPlayer[] = [];
    setDraftPlayers((current) => {
      const next = [...current];
      if (isGoFormat) {
        const pairStart = index - (index % 2);
        next[pairStart] = undefined as unknown as DraftPlayer;
        next[pairStart + 1] = undefined as unknown as DraftPlayer;
      } else {
        next[index] = undefined as unknown as DraftPlayer;
      }
      // Trim empty tail
      while (next.length > 0 && !next[next.length - 1]) {
        next.pop();
      }
      nextDraftRef = next;
      return next;
    });
    void sendRosterAction(
      {
        type: isGoFormat ? 'move_pair' : 'remove',
        scope: isGoFormat ? 'groups' : isThaiFormat ? 'courts' : 'all',
        fromIndex: index,
        pair: isGoFormat ? { fromStart: index - (index % 2), toStart: index - (index % 2) } : undefined,
        note: 'remove-player',
      },
      nextDraftRef,
    );
    if (isGoFormat) {
      const pairStart = index - (index % 2);
      if (selectedDraftIndex != null && (selectedDraftIndex === pairStart || selectedDraftIndex === pairStart + 1)) {
        setSelectedDraftIndex(null);
      }
    } else if (selectedDraftIndex === index) {
      setSelectedDraftIndex(null);
    } else if (selectedDraftIndex != null && selectedDraftIndex > index) {
      // Don't shift selection, position stays same!
      // setSelectedDraftIndex(selectedDraftIndex - 1); // Removed to prevent selection shift
    }
    setMessage('');
  }

  function swapDraftPlayers(index1: number, index2?: number) {
    const target1 = isGoFormat ? index1 - (index1 % 2) : index1;
    const rawTarget2 = index2 !== undefined ? index2 : selectedDraftIndex;
    const target2 = rawTarget2 == null ? null : isGoFormat ? rawTarget2 - (rawTarget2 % 2) : rawTarget2;
    
    // Bounds check
    const maxAllowed = participantLimit + reservePlayers.length;
    if (target1 < 0 || target1 > Math.max(maxAllowed, draftPlayers.length)) return;

    if (target2 == null) {
      setSelectedDraftIndex(target1);
      return;
    }
    if (target2 === target1) {
      setSelectedDraftIndex(null);
      return;
    }
    let nextDraftRef: DraftPlayer[] = [];
    setDraftPlayers((current) => {
      const next = [...current];
      // Extend array with dummy elements if dropped far beyond
      const maxIndex = Math.max(target1, target2) + (isGoFormat ? 1 : 0);
      while (next.length <= maxIndex) next.push(undefined as unknown as DraftPlayer);

      if (isGoFormat) {
        const leftA = next[target1];
        const leftB = next[target1 + 1];
        next[target1] = next[target2];
        next[target1 + 1] = next[target2 + 1];
        next[target2] = leftA;
        next[target2 + 1] = leftB;
      } else {
        [next[target2], next[target1]] = [next[target1], next[target2]];
      }
      
      while (next.length > 0 && !next[next.length - 1]) {
        next.pop();
      }
      nextDraftRef = next;
      return next;
    });
    void sendRosterAction(
      isGoFormat
        ? {
            type: 'move_pair',
            scope: isFixedPairsSeeding ? 'categories' : 'groups',
            pair: { fromStart: target1, toStart: target2 },
            note: 'swap-pair',
          }
        : {
            type: 'swap',
            scope: isThaiFormat ? 'courts' : 'all',
            fromIndex: target1,
            toIndex: target2,
            note: 'swap-player',
          },
      nextDraftRef,
    );
    setSelectedDraftIndex(null);
    setMessage('');
  }

  function clearCourt(courtIndex: number) {
    if (confirmClearCourtIndex !== courtIndex) {
      setConfirmClearCourtIndex(courtIndex);
      setTimeout(() => {
        setConfirmClearCourtIndex((current) => (current === courtIndex ? null : current));
      }, 3000);
      return;
    }
    
    setConfirmClearCourtIndex(null);
    const affectedIndexes = Array.from({ length: playersPerCourt }, (_, i) => courtIndex * playersPerCourt + i);
    let nextDraftRef: DraftPlayer[] = [];
    setDraftPlayers((current) => {
      const next = [...current];
      const start = courtIndex * playersPerCourt;
      for (let i = 0; i < playersPerCourt; i++) {
        next[start + i] = undefined as unknown as DraftPlayer;
      }
      while (next.length > 0 && !next[next.length - 1]) {
        next.pop();
      }
      nextDraftRef = next;
      return next;
    });
    void sendRosterAction(
      {
        type: 'clear_scope',
        scope: isGoFormat ? 'groups' : isThaiFormat ? 'courts' : 'courts',
        indexes: affectedIndexes,
        note: 'clear-court',
      },
      nextDraftRef,
    );
    setMessage('');
  }

  function clearRoster() {
    if (window.confirm('Очистить всех игроков из турнира? (Резерв тоже будет удалён)')) {
      setDraftPlayers([]);
      setSelectedDraftIndex(null);
      void sendRosterAction(
        {
          type: 'clear_scope',
          scope: 'all',
          indexes: Array.from({ length: draftPlayers.length }, (_, index) => index),
          note: 'clear-roster',
        },
        [],
      );
      setMessage('');
    }
  }

  async function handleQuickCreatePlayer() {
    if (!quickAddForm.name.trim()) return;
    setQuickAddLoading(true);
    try {
      const res = await fetch('/api/admin/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickAddForm.name.trim(),
          gender: quickAddForm.gender,
          level: quickAddForm.level,
        }),
      });
      const created = await res.json();
      if (res.ok && created && created.id) {
        const newPlayer = {
          ...created,
          level: normalizeGoSkillLevel(created.level || quickAddForm.level),
        } as Player;
        setAllPlayers(current => [...current, newPlayer]);
        addDraftPlayer(newPlayer);
        setShowQuickAdd(false);
        setQuickAddForm({ name: '', gender: 'M', level: 'easy' });
        setPlayerSearch('');
      } else {
        setMessage(created.error || 'Ошибка создания игрока');
      }
    } catch (err) {
      setMessage('Ошибка создания игрока');
    } finally {
      setQuickAddLoading(false);
    }
  }

  async function handleDeleteTournament() {
    if (!form.id || form.status !== 'draft') return;
    const reason = window.prompt('Введите причину удаления турнира (строго обязательно):');
    if (!reason?.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${form.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) {
        window.location.href = '/admin/tournaments';
      } else {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error || 'Ошибка удаления турнира. Возможно нет прав admin.');
        setLoading(false);
      }
    } catch (err) {
      setMessage('Ошибка удаления');
      setLoading(false);
    }
  }

  function buildTournamentPayload(forceStatus?: string) {
    const normalizedDate = normalizeDateInputValue(form.date);
    const normalizedMeta = normalizeTournamentInput({
      date: normalizedDate,
      time: form.time,
      division: form.division,
      level: form.level,
      status: forceStatus ?? form.status,
    });
    const mergedSettings =
      isThaiFormat && thaiSettings
        ? {
            ...settings,
            ...thaiSettings,
          }
        : isGoFormat && goSettings
          ? {
              ...settings,
              ...goSettings,
            }
          : isKotcFormat && kotcSettings
            ? {
                ...settings,
                ...kotcSettings,
              }
            : settings;
    const payloadSettings: Record<string, unknown> = { ...mergedSettings };
    if (isGoFormat) {
      payloadSettings.goDraftOwner = adminActorId;
      payloadSettings.goDraftTouchedAt = new Date().toISOString();
    }
    if (!isExactThaiFormat) {
      delete payloadSettings.thaiJudgeModule;
      delete payloadSettings.thaiJudgeBootstrapSignature;
    }
    return {
      normalizedDate,
      mergedSettings,
      payload: {
        ...form,
        name: String(form.name ?? '').trim(),
        status: normalizedMeta.status,
        date: normalizedMeta.date || normalizedDate,
        time: normalizedMeta.time || form.time,
        format: isExactThaiFormat ? THAI_ADMIN_FORMAT : form.format,
        division:
          isExactThaiFormat && thaiSettings
            ? getThaiDivisionLabel(thaiSettings.thaiVariant)
            : (normalizedMeta.division || form.division),
        level: normalizedMeta.level || form.level,
        location: String(form.location ?? '').trim(),
        capacity: participantLimit,
        settings: payloadSettings,
        participants: draftPlayers
          .map((player, index) =>
            player
              ? {
                  playerId: player.playerId,
                  position: index + 1,
                  isWaitlist: false,
                }
              : null
          )
          .filter(Boolean),
      },
    };
  }

  async function requestGoPreflight(silent = false): Promise<GoPreflightResult | null> {
    if (!isGoFormat || !goSettings) return null;
    if (!silent) setGoPreflightLoading(true);
    try {
      const payload = {
        id: form.id || undefined,
        format: form.format,
        division: form.division,
        settings: {
          ...goSettings,
          goGroupCount: goSettings.goGroupCount,
          goGroupFormulaHard: goSettings.goGroupFormulaHard,
          goGroupFormulaMedium: goSettings.goGroupFormulaMedium,
          goGroupFormulaLite: goSettings.goGroupFormulaLite,
        },
        participants: draftPlayers
          .map((player, index) =>
            player
              ? {
                  playerId: player.playerId,
                  position: index + 1,
                  isWaitlist: false,
                }
              : null,
          )
          .filter(Boolean),
      };
      const res = await fetch('/api/admin/tournaments/go-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as GoPreflightResult | { error?: string } | null;
      if (!res.ok || !data || !('canGoLive' in data)) {
        if (!silent) {
          const errorText = data && typeof data === 'object' && 'error' in data ? String(data.error ?? '') : '';
          setMessage(errorText || 'Не удалось выполнить GO preflight.');
        }
        return null;
      }
      setGoPreflight(data as GoPreflightResult);
      return data as GoPreflightResult;
    } finally {
      if (!silent) setGoPreflightLoading(false);
    }
  }

  async function runGoDraftAutosave() {
    if (!isGoFormat) return;
    if (loading || rosterLoading) return;
    if (goAutosaveBusyRef.current) return;
    const shouldAutosave = isEdit ? form.status === 'draft' : isDirty;
    if (!shouldAutosave) return;

    const { normalizedDate, payload } = buildTournamentPayload('draft');
    if (!normalizedDate) return;
    const validationError = validateTournamentInput(
      normalizeTournamentInput(payload as unknown as Record<string, unknown>),
    );
    if (validationError) {
      setGoAutosaveState('idle');
      setGoAutosaveError(validationError);
      return;
    }

    goAutosaveBusyRef.current = true;
    setGoAutosaveState('saving');
    setGoAutosaveError('');
    try {
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/tournaments', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorText = typeof data === 'object' && data && 'error' in data ? String(data.error ?? '') : '';
        setGoAutosaveState('error');
        setGoAutosaveError(errorText || 'Ошибка автосохранения');
        return;
      }
      const savedId = typeof data === 'object' && data && 'id' in data ? String((data as Row).id ?? '') : '';
      if (!form.id && savedId) {
        setForm((current) => ({
          ...current,
          id: savedId,
          status: 'draft',
        }));
      }
      setGoAutosaveState('saved');
      setGoAutosaveAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (error) {
      setGoAutosaveState('error');
      setGoAutosaveError(getErrorText(error, 'Ошибка автосохранения'));
    } finally {
      goAutosaveBusyRef.current = false;
    }
  }

  useEffect(() => {
    if (!isGoFormat || !composerDraftHydrated) return;
    const shouldAutosave = isEdit ? form.status === 'draft' : isDirty;
    if (!shouldAutosave) return;
    const timerId = window.setTimeout(() => {
      void runGoDraftAutosave();
    }, 1500);
    return () => window.clearTimeout(timerId);
  }, [
    composerDraftHydrated,
    draftPlayers,
    form,
    isDirty,
    isEdit,
    isGoFormat,
    loading,
    rosterLoading,
  ]);

  useEffect(() => {
    if (!isGoFormat || !composerDraftHydrated) {
      setGoPreflight(null);
      return;
    }
    const timerId = window.setTimeout(() => {
      void requestGoPreflight(true);
    }, 600);
    return () => window.clearTimeout(timerId);
  }, [
    composerDraftHydrated,
    draftPlayers,
    form.division,
    form.id,
    isGoFormat,
    settings.goDeclaredTeamCount,
    settings.goGroupCount,
    settings.goTeamsPerGroup,
    settings.goSeedingMode,
    settings.goGroupFormulaHard,
    settings.goGroupFormulaMedium,
    settings.goGroupFormulaLite,
  ]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (rosterLoading) {
      setMessage('Состав ещё загружается');
      return;
    }
    if (rosterError) {
      setMessage(rosterError);
      return;
    }
    if (rosterOverflow) {
      setMessage(`Игроков больше, чем capacity: ${draftPlayers.length} / ${participantLimit}`);
      return;
    }
    if (thaiRosterError && form.status !== 'open') {
      setMessage(thaiRosterError);
      return;
    }
    if (goRosterError) {
      setMessage(goRosterError);
      return;
    }
    const normalizedDate = normalizeDateInputValue(form.date);
    if (!normalizedDate) {
      setMessage('Tournament date must be YYYY-MM-DD');
      return;
    }

    setLoading(true);
    setMessage('');
    const method = isEdit ? 'PUT' : 'POST';
    const mergedSettings =
      isThaiFormat && thaiSettings
        ? {
            ...settings,
            ...thaiSettings,
          }
        : isGoFormat && goSettings
          ? {
              ...settings,
              ...goSettings,
            }
        : isKotcFormat && kotcSettings
          ? {
              ...settings,
              ...kotcSettings,
            }
          : settings;
    const payloadSettings: Record<string, unknown> = { ...mergedSettings };
    if (!isExactThaiFormat) {
      delete payloadSettings.thaiJudgeModule;
      delete payloadSettings.thaiJudgeBootstrapSignature;
    }
    const payload = {
      ...form,
      date: normalizedDate,
      format: isExactThaiFormat ? THAI_ADMIN_FORMAT : form.format,
      division: isExactThaiFormat && thaiSettings ? getThaiDivisionLabel(thaiSettings.thaiVariant) : form.division,
      capacity: participantLimit,
      settings: payloadSettings,
      participants: draftPlayers
        .map((player, index) =>
          player
            ? {
                playerId: player.playerId,
                position: index + 1,
                isWaitlist: false,
              }
            : null
        )
        .filter(Boolean),
    };
    const res = await fetch('/api/admin/tournaments', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorText = typeof data === 'object' && data && 'error' in data ? String(data.error ?? '') : '';
      setLoading(false);
      setMessage(errorText || 'Save failed');
      return;
    }
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка сохранения');
      return;
    }
    const savedId = typeof data === 'object' && data && 'id' in data ? String((data as Row).id || '') : '';
    const savedFormat =
      typeof data === 'object' && data && 'format' in data ? String((data as Row).format || '') : form.format;
    const nextLaunchTarget = savedId
      ? getPrimaryLaunchTarget({
          id: savedId,
          format: savedFormat || form.format,
          settings:
            typeof data === 'object' && data && 'settings' in data
              ? (((data as Row).settings ?? mergedSettings) as TournamentSettings)
              : (mergedSettings as TournamentSettings),
        })
      : null;
    resetComposer();
    if (nextLaunchTarget) {
      setLaunchTarget(nextLaunchTarget);
      setMessage('Сохранено');
      await load();
      return;
    }
    setMessage('Сохранено');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Удалить турнир?')) return;
    const res = await fetch(`/api/admin/tournaments/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'manual delete from admin' }),
    });
    if (!res.ok) {
      setMessage('Удаление запрещено или не удалось');
      return;
    }
    if (form.id === id) resetComposer();
    await load();
  }

  async function saveAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (rosterLoading) {
      setMessage('Состав ещё загружается');
      return;
    }
    if (rosterError) {
      setMessage(rosterError);
      return;
    }
    if (rosterOverflow) {
      setMessage(`Игроков больше, чем capacity: ${draftPlayers.length} / ${participantLimit}`);
      return;
    }
    if (thaiRosterError && form.status !== 'open') {
      setMessage(thaiRosterError);
      return;
    }
    if (goRosterError) {
      setMessage(goRosterError);
      return;
    }
    const { normalizedDate, mergedSettings, payload } = buildTournamentPayload();
    if (!normalizedDate) {
      setMessage('Tournament date must be YYYY-MM-DD');
      return;
    }
    if (isGoFormat && String(form.status).toLowerCase() === 'open') {
      const preflight = await requestGoPreflight(true);
      if (!preflight) {
        setMessage('GO preflight is unavailable. Please retry.');
        return;
      }
      if (preflight && !preflight.canGoLive) {
        setGoPreflight(preflight);
        setMessage(`GO preflight: ${preflight.errors.join(' | ')}`);
        return;
      }
    }

    setLoading(true);
    setMessage('');
    const method = isEdit ? 'PUT' : 'POST';

    const response = await fetch('/api/admin/tournaments', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorText =
        typeof result === 'object' && result && 'error' in result ? String(result.error ?? '') : '';
      setLoading(false);
      setMessage(errorText || 'Save failed');
      return;
    }

    setLoading(false);
    const savedId =
      typeof result === 'object' && result && 'id' in result ? String((result as Row).id || '') : '';
    const savedFormat =
      typeof result === 'object' && result && 'format' in result
        ? String((result as Row).format || '')
        : form.format;
    const nextLaunchTarget = savedId
      ? getPrimaryLaunchTarget({
          id: savedId,
          format: savedFormat || form.format,
          settings:
            typeof result === 'object' && result && 'settings' in result
              ? (((result as Row).settings ?? mergedSettings) as TournamentSettings)
              : (mergedSettings as TournamentSettings),
        })
      : null;

    await load();

    if (savedId) {
      clearTournamentComposerDraft();
      const nextRow: Row = {
        id: savedId,
        name:
          typeof result === 'object' && result && 'name' in result ? String((result as Row).name || form.name) : form.name,
        date:
          typeof result === 'object' && result && 'date' in result
            ? normalizeDateInputValue(String((result as Row).date || form.date))
            : normalizeDateInputValue(form.date),
        time:
          typeof result === 'object' && result && 'time' in result ? String((result as Row).time || form.time) : form.time,
        location:
          typeof result === 'object' && result && 'location' in result
            ? String((result as Row).location || form.location)
            : form.location,
        format: savedFormat || form.format,
        division:
          typeof result === 'object' && result && 'division' in result
            ? String((result as Row).division || form.division)
            : form.division,
        level:
          typeof result === 'object' && result && 'level' in result
            ? String((result as Row).level || form.level)
            : form.level,
        status:
          typeof result === 'object' && result && 'status' in result
            ? String((result as Row).status || form.status)
            : form.status,
        capacity:
          typeof result === 'object' && result && 'capacity' in result
            ? Number((result as Row).capacity || participantLimit)
            : participantLimit,
        participantCount:
          typeof result === 'object' && result && 'participantCount' in result
            ? Number((result as Row).participantCount || draftPlayers.length)
            : draftPlayers.length,
        settings:
          typeof result === 'object' && result && 'settings' in result
            ? ((result as Row).settings ?? (mergedSettings as TournamentSettings))
            : (mergedSettings as TournamentSettings),
      };
      setLaunchTarget(nextLaunchTarget);
      await startEdit(nextRow);
    } else {
      setLaunchTarget(null);
    }

    setMessage('Сохранено');
  }

  const saveDisabled =
    loading ||
    rosterLoading ||
    Boolean(rosterError) ||
    rosterOverflow ||
    (Boolean(thaiRosterError) && form.status !== 'open') ||
    Boolean(goRosterError) ||
    (isGoFormat && form.status === 'open' && goPreflight?.canGoLive === false);

  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по турнирам"
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand"
          >
            Найти
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="py-2 pr-3">Название</th>
                <th className="py-2 pr-3">Р”Р°С‚Р°</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3">Участники</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const launch = getPrimaryLaunchTarget(row);
                return (
                  <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3">{row.date}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs border ${
                        statuses.find((status) => status.key === row.status)?.color ?? 'border-white/10'
                      }`}
                    >
                      {statuses.find((status) => status.key === row.status)?.label ?? row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.participantCount}</td>
                  <td className="py-2 pr-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void startEdit(row)}
                      className="px-2 py-1 rounded border border-white/20 hover:border-brand text-xs"
                    >
                      Edit
                    </button>
                    {launch ? (
                      <Link
                        href={launch.href}
                        className="px-2 py-1 rounded border border-brand/50 text-brand text-xs"
                      >
                        {isThaiAdminFormat(row.format) || isGoAdminFormat(row.format) ? 'Управлять' : 'Sudyam'}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="px-2 py-1 rounded border border-red-500/60 text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-text-secondary" colSpan={5}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={saveAdmin} className="flex flex-col gap-4">

        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h2 className="font-heading text-3xl leading-none">
            {isEdit ? 'Редактировать турнир' : 'Новый турнир'}
          </h2>

          <div className="flex gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Название *"
              className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
              required
            />
            <button
              type="button"
              onClick={() => {
                const formatLabel = formats.find(f => f.key === form.format)?.label || form.format;
                const divLabel =
                  isThaiFormat && thaiSettings
                    ? getThaiDivisionLabel(thaiSettings.thaiVariant)
                    : divisions.find(d => d.key === form.division)?.label || form.division;
                const lvlLabel = levels.find(l => l.key === form.level)?.label || form.level;
                const dateParts = form.date.split('-');
                const formattedDate = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : form.date;
                const newName = `${formatLabel} ${divLabel} ${lvlLabel} ${formattedDate}`.trim();
                setForm((current) => ({ ...current, name: newName }));
              }}
              className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand text-xs text-text-secondary whitespace-nowrap"
            >
              Авто-название
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateInputValue}
              onChange={(e) =>
                setForm((current) => ({ ...current, date: normalizeDateInputValue(e.target.value) }))
              }
              className="px-3 py-2 rounded-lg bg-surface border border-white/20"
              required
            />
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((current) => ({ ...current, time: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-surface border border-white/20"
              required
            />
          </div>

          <input
            value={form.location}
            onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
            placeholder="Локация *"
            className="px-3 py-2 rounded-lg bg-surface border border-white/20"
            required
          />
        </div>

        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Формат турнира</h3>

          <div className="flex gap-1 flex-wrap">
            {formats.map((format) => (
              <button
                key={format.key}
                type="button"
                onClick={() => applyFormat(format.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  form.format === format.key
                    ? 'bg-brand/20 text-brand border-brand/50'
                    : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
                }`}
              >
                {format.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-text-secondary">{isThaiFormat ? 'Состав Thai' : 'Дивизион'}</label>
            {isThaiFormat ? (
              <Seg
                options={thaiVariantOptions}
                value={thaiSettings?.thaiVariant ?? normalizeThaiVariant(settings.thaiVariant)}
                onChange={(value) => updateSettings({ thaiVariant: value })}
              />
            ) : (
              <Seg
                options={divisions.map((division) => ({ key: division.key, label: division.label }))}
                value={form.division}
                onChange={(value) => {
                  setForm((current) => ({ ...current, division: value }));
                }}
              />
            )}
          </div>

          <div>
            <label className="text-xs text-text-secondary">Уровень</label>
            <Seg
              options={levels.map((level) => ({ key: level.key, label: level.label, color: level.color }))}
              value={form.level}
              onChange={(value) => setForm((current) => ({ ...current, level: value }))}
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">Статус</label>
            <Seg
              options={statuses.map((status) => ({ key: status.key, label: status.label, color: status.color }))}
              value={form.status}
              onChange={async (value) => {
                if (isGoFormat && value === 'open') {
                  const preflight = await requestGoPreflight();
                  if (preflight && !preflight.canGoLive) {
                    setMessage(`GO preflight: ${preflight.errors.join(' | ')}`);
                    return;
                  }
                  if (preflight && preflight.warnings.length) {
                    const confirmed = window.confirm(
                      `GO preflight warnings:\n- ${preflight.warnings.join('\n- ')}\n\nПеревести турнир в Открыт?`,
                    );
                    if (!confirmed) return;
                  }
                }
                setForm((current) => ({ ...current, status: value }));
              }}
            />
          </div>
        </div>

        {isThaiFormat ? (
          <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Thai формат</h3>

            {isExactThaiFormat ? (
              <div>
                <label className="text-xs text-text-secondary">Judge module</label>
                <Seg
                  options={[
                    { key: THAI_JUDGE_MODULE_NEXT, label: 'Next' },
                    { key: THAI_JUDGE_MODULE_LEGACY, label: 'Legacy' },
                  ]}
                  value={thaiSettings?.thaiJudgeModule ?? settings.thaiJudgeModule}
                  onChange={(value) => updateSettings({ thaiJudgeModule: value })}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Количество туров</label>
              <Stepper
                value={thaiSettings?.tourCount ?? normalizeThaiTourCount(settings.tourCount)}
                onChange={(value) =>
                  updateSettings({
                    tourCount:
                      thaiSettings?.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT
                        ? THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT
                        : (value as ThaiTourCount),
                  })}
                min={thaiSettings?.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT ? THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT : 1}
                max={thaiSettings?.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT ? THAI_NEXT_JUDGE_DEFAULT_TOUR_COUNT : 12}
              />
            </div>

            {thaiSettings?.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Лимит очков R1</label>
                  <Stepper
                    value={thaiSettings?.thaiPointLimitR1 ?? settings.thaiPointLimitR1 ?? settings.thaiPointLimit ?? 15}
                    onChange={(value) =>
                      updateSettings({
                        thaiPointLimitR1: value,
                        thaiPointLimit: value,
                      })
                    }
                    min={THAI_ADMIN_POINT_LIMIT_MIN}
                    max={THAI_ADMIN_POINT_LIMIT_MAX}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Лимит очков R2</label>
                  <Stepper
                    value={thaiSettings?.thaiPointLimitR2 ?? settings.thaiPointLimitR2 ?? settings.thaiPointLimit ?? 15}
                    onChange={(value) => updateSettings({ thaiPointLimitR2: value })}
                    min={THAI_ADMIN_POINT_LIMIT_MIN}
                    max={THAI_ADMIN_POINT_LIMIT_MAX}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-text-secondary">Point limit</label>
                <Stepper
                  value={thaiSettings?.thaiPointLimit ?? settings.thaiPointLimit ?? 15}
                  onChange={(value) =>
                    updateSettings({
                      thaiPointLimit: value,
                      thaiPointLimitR1: value,
                      thaiPointLimitR2: value,
                    })
                  }
                  min={THAI_ADMIN_POINT_LIMIT_MIN}
                  max={THAI_ADMIN_POINT_LIMIT_MAX}
                />
              </div>
            )}

            <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-text-secondary">
              Thai Next: 2 раунда × 4 тура; R2 — зоны по числу кортов ({THAI_ADMIN_MIN_COURTS}–{THAI_NEXT_JUDGE_MAX_COURTS} кортов, по{' '}
              {THAI_ADMIN_PLAYERS_PER_COURT} игроков на корте).
              {thaiSettings?.thaiVariant === 'MN' ? ' М/Н: отдельные рейтинги профи и новичков.' : null}
            </div>

            {thaiSettings?.thaiJudgeModule === THAI_JUDGE_MODULE_NEXT ? (
              form.id ? (
                <div className="flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Живая игра Thai (жеребьёвка R1, завершение раундов, R2) — на отдельной странице.
                  </p>
                  <Link
                    href={`/admin/tournaments/${encodeURIComponent(form.id)}/thai-live`}
                    className="shrink-0 rounded-lg border border-brand bg-brand/20 px-4 py-2.5 text-center text-sm font-semibold text-brand hover:bg-brand/30"
                  >
                    Thai Tournament Control →
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-secondary">
                  Сохраните турнир — затем откроется ссылка на Thai Tournament Control.
                </div>
              )
            ) : null}
          </div>
        ) : null}

        {isKotcFormat ? (
          <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">KOTC Next</h3>

            <div>
              <label className="text-xs text-text-secondary">Judge module</label>
              <Seg
                options={[
                  { key: 'next', label: 'Next' },
                  { key: 'legacy', label: 'Legacy' },
                ]}
                value={kotcSettings?.kotcJudgeModule ?? settings.kotcJudgeModule}
                onChange={(value) => updateSettings({ kotcJudgeModule: value as KotcJudgeModule })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Пар на корт</label>
              <Stepper
                value={kotcSettings?.kotcPpc ?? settings.kotcPpc}
                onChange={(value) => updateSettings({ kotcPpc: value, kotcRaundCount: value })}
                min={KOTC_ADMIN_MIN_PPC}
                max={KOTC_ADMIN_MAX_PPC}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Раундов на корт</label>
              <Stepper
                value={kotcSettings?.kotcRaundCount ?? settings.kotcRaundCount}
                onChange={() => {}}
                min={KOTC_ADMIN_MIN_RAUNDS}
                max={KOTC_ADMIN_MAX_RAUNDS}
                disabled
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Таймер раундов 1–2</label>
              <Stepper
                value={kotcSettings?.kotcRaundTimerMinutes ?? settings.kotcRaundTimerMinutes}
                onChange={(value) => updateSettings({ kotcRaundTimerMinutes: value })}
                min={KOTC_ADMIN_MIN_TIMER}
                max={KOTC_ADMIN_MAX_TIMER}
                suffix=" мин"
              />
            </div>

            <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-text-secondary">
              KOTC Next: {settings.courts} корт(а), по {kotcSettings?.kotcPpc ?? settings.kotcPpc} пар на корт,
              {` `}{playersPerCourt} игроков на площадку, цикл = {kotcSettings?.kotcRaundCount ?? settings.kotcRaundCount} раунд(а) по
              {` `}{kotcSettings?.kotcRaundTimerMinutes ?? settings.kotcRaundTimerMinutes} мин.
            </div>

            {kotcSettings?.kotcJudgeModule === 'next' ? (
              form.id ? (
                <div className="flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Операторский контроль KOTC Next открывается на отдельной странице Sudyam.
                  </p>
                  <Link
                    href={buildKotcNextControlUrl(form.id)}
                    className="shrink-0 rounded-lg border border-brand bg-brand/20 px-4 py-2.5 text-center text-sm font-semibold text-brand hover:bg-brand/30"
                  >
                    KOTC Next Control →
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-secondary">
                  Сохраните турнир, затем станет доступна ссылка на KOTC Next Control.
                </div>
              )
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-secondary">
                Legacy KOTC открывается через обычный Sudyam launcher.
              </div>
            )}
          </div>
        ) : null}

        {isGoFormat ? (
          <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">GO: группы + олимпийка</h3>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Корты</label>
              <Stepper
                value={goSettings?.goCourts ?? GO_ADMIN_DEFAULT_COURTS}
                onChange={(value) => updateSettings({ goCourts: value, courts: value })}
                min={GO_ADMIN_MIN_COURTS}
                max={GO_ADMIN_MAX_COURTS}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Команд заявилось</label>
              <Stepper
                value={
                  goSettings?.goDeclaredTeamCount ??
                  ((goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS) * (goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP))
                }
                onChange={(value) =>
                  updateSettings(buildGoAutoConfigPatchFromDeclared(value, goSettings ?? settings))
                }
                min={GO_ADMIN_MIN_DECLARED_TEAMS}
                max={GO_ADMIN_MAX_DECLARED_TEAMS}
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-secondary">
              Рекомендуем: <span className="text-brand font-semibold">{goAutoSuggestion?.groupCount ?? 0} групп × {goAutoSuggestion?.groupSize ?? 4} команд</span>
              {' '}({goAutoSuggestion?.emptySlots ?? 0} пустых слотов).
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
              {goAutosaveState === 'saving' ? (
                <span className="text-amber-300">Черновик сохраняется…</span>
              ) : goAutosaveState === 'saved' ? (
                <span className="text-emerald-300">Черновик сохранён в {goAutosaveAt}</span>
              ) : goAutosaveState === 'error' ? (
                <span className="text-red-300">Ошибка автосохранения: {goAutosaveError || 'unknown error'}</span>
              ) : (
                <span className="text-text-secondary">Автосохранение черновика включено.</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Группы (1-12)</label>
              <Stepper
                value={goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS}
                onChange={(value) => updateSettings({ goGroupCount: value })}
                min={GO_ADMIN_MIN_GROUPS}
                max={GO_ADMIN_MAX_GROUPS}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Команд в группе (3-4)</label>
              <Seg
                options={[
                  { key: 3, label: '3' },
                  { key: 4, label: '4' },
                ]}
                value={goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP}
                onChange={(value) => updateSettings(getGoGroupFormulaBySize(Number(value)))}
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary">Формат матча</label>
              <Seg
                options={[
                  { key: 'single15', label: 'До 15' },
                  { key: 'single21', label: 'До 21' },
                  { key: 'bo3', label: 'Best of 3' },
                ]}
                value={goSettings?.goMatchFormat ?? 'single15'}
                onChange={(value) => updateSettings({ goMatchFormat: value as TournamentSettings['goMatchFormat'] })}
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary">Посев</label>
              <Seg
                options={[
                  { key: 'serpentine', label: 'Змейка' },
                  { key: 'random', label: 'Случайный' },
                  { key: 'manual', label: 'Ручной' },
                  { key: 'fixedPairs', label: 'Фикс. пары' },
                ]}
                value={goSettings?.goSeedingMode ?? 'serpentine'}
                onChange={(value) => updateSettings({ goSeedingMode: value as TournamentSettings['goSeedingMode'] })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Уровни сетки</label>
              <Stepper
                value={goSettings?.goBracketLevels ?? GO_ADMIN_DEFAULT_BRACKET_LEVELS}
                onChange={(value) => {
                  const leagues = getGoLeaguesByBracketLevels(value);
                  const autoCounts = buildAutoGoMixedTeamCounts({
                    goGroupCount: goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS,
                    goGroupFormulaHard: goSettings?.goGroupFormulaHard ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.hard,
                    goGroupFormulaMedium: goSettings?.goGroupFormulaMedium ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.medium,
                    goGroupFormulaLite: goSettings?.goGroupFormulaLite ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.lite,
                    goEnabledPlayoffLeagues: leagues,
                  });
                  const nextCounts: TournamentSettings['goMixedTeamCounts'] = {};
                  const nextSizes: TournamentSettings['goBracketSizes'] = {};
                  leagues.forEach((league) => {
                    const teamCount = clampGoMixedLeagueTeamCount(
                      league,
                      Number(goSettings?.goMixedTeamCounts?.[league] ?? autoCounts[league] ?? 0),
                    );
                    nextCounts[league] = teamCount;
                    nextSizes[league] = getGoMixedBracketSize(teamCount);
                  });
                  updateSettings({
                    goBracketLevels: value,
                    goEnabledPlayoffLeagues: leagues,
                    goMixedTeamCounts: nextCounts,
                    goBracketSizes: nextSizes,
                  });
                }}
                min={GO_ADMIN_MIN_BRACKET_LEVELS}
                max={GO_ADMIN_MAX_BRACKET_LEVELS}
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary">Система очков</label>
              <Seg
                options={[
                  { key: 'fivb', label: 'FIVB (3-2-1-0)' },
                  { key: 'simple', label: 'Простая (2-1)' },
                ]}
                value={goSettings?.goMatchPointSystem ?? 'fivb'}
                onChange={(value) => updateSettings({ goMatchPointSystem: value as TournamentSettings['goMatchPointSystem'] })}
              />
            </div>

            <div>
              <label className="text-xs text-text-secondary">Тейбрейкер</label>
              <Seg
                options={[
                  { key: 'fivb', label: 'FIVB' },
                  { key: 'classic', label: 'Классический' },
                ]}
                value={goSettings?.goTieBreakerLogic ?? 'fivb'}
                onChange={(value) => updateSettings({ goTieBreakerLogic: value as TournamentSettings['goTieBreakerLogic'] })}
              />
            </div>

            <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-text-secondary">
              Участников по настройке: <span className="text-brand font-semibold">{seatCount}</span>.
              Уровни сетки: {(goSettings?.goEnabledPlayoffLeagues ?? ['hard', 'medium', 'lite']).join(', ')}.
            </div>

            <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Готовность к LIVE</h4>
                <button
                  type="button"
                  onClick={() => void requestGoPreflight()}
                  className="px-2 py-1 rounded border border-white/20 hover:border-brand text-xs"
                  disabled={goPreflightLoading}
                >
                  {goPreflightLoading ? 'Проверяем...' : 'Обновить'}
                </button>
              </div>
              {goPreflight ? (
                <>
                  <div className="space-y-1">
                    {goPreflight.checks.map((check) => (
                      <div key={check.key} className="text-xs">
                        <span
                          className={
                            check.status === 'error'
                              ? 'text-red-300'
                              : check.status === 'warning'
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                          }
                        >
                          {check.status === 'error' ? 'CRITICAL' : check.status === 'warning' ? 'WARNING' : 'OK'}
                        </span>
                        <span className="text-text-secondary"> · {check.label}: </span>
                        <span className="text-text-primary">{check.detail}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      goPreflight.canGoLive
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                        : 'border-red-500/30 bg-red-500/5 text-red-300'
                    }`}
                  >
                    {goPreflight.canGoLive
                      ? 'Переход в LIVE доступен (critical=0).'
                      : `Переход в LIVE заблокирован: ${goPreflight.errors.length} critical.`}
                  </div>
                </>
              ) : (
                <div className="text-xs text-text-secondary">Preflight будет рассчитан автоматически после изменений.</div>
              )}
            </div>

            <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Настройки плей-офф</h4>
                <p className="text-xs text-text-secondary mt-1">
                  {isFixedPairsSeeding
                    ? 'В режиме Фикс. пары количество команд предзаполняется по слотам категорий, но оператор может скорректировать его вручную.'
                    : 'Автопредложение считается по группам и формуле, при необходимости можно скорректировать вручную.'}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary border-b border-white/10">
                      <th className="py-2 pr-4 text-xs uppercase">Категория</th>
                      <th className="py-2 pr-4 text-xs uppercase">Кол-во</th>
                      <th className="py-2 pr-4 text-xs uppercase">Сетка</th>
                      <th className="py-2 pr-4 text-xs uppercase">BYE</th>
                      <th className="py-2 text-xs uppercase">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(goSettings?.goEnabledPlayoffLeagues ?? ['hard', 'medium', 'lite']).map((league) => {
                      const leagueColorMap: Record<string, string> = {
                        lyutye: 'text-red-400',
                        hard: 'text-orange-400',
                        medium: 'text-green-400',
                        lite: 'text-blue-400',
                      };
                      const minCount = getGoMixedLeagueMinTeams(league);
                      const autoCounts =
                        isFixedPairsSeeding && fixedPairsPlayoffCounts
                          ? fixedPairsPlayoffCounts
                          : goSettings
                            ? buildAutoGoMixedTeamCounts(goSettings)
                            : {};
                      const teamCount = clampGoMixedLeagueTeamCount(
                        league,
                        Number(
                          goSettings?.goMixedTeamCounts?.[league] ?? autoCounts[league] ?? minCount,
                        ),
                      );
                      const bracketSize = getGoMixedBracketSize(teamCount);
                      const byeCount = bracketSize - teamCount;
                      const isOk = teamCount >= minCount && teamCount <= 16;
                      return (
                        <tr key={league} className="border-b border-white/5">
                          <td className={`py-2 pr-4 font-semibold uppercase ${leagueColorMap[league] ?? 'text-text-primary'}`}>
                            {league}
                          </td>
                          <td className="py-2 pr-4">
                            <Stepper
                              value={teamCount}
                              onChange={(value) => {
                                const nextTeamCount = clampGoMixedLeagueTeamCount(league, value);
                                const newCounts = { ...(goSettings?.goMixedTeamCounts ?? {}), [league]: nextTeamCount };
                                const newSizes = { ...(goSettings?.goBracketSizes ?? {}) };
                                newSizes[league] = getGoMixedBracketSize(nextTeamCount);
                                updateSettings({ goMixedTeamCounts: newCounts, goBracketSizes: newSizes });
                              }}
                              min={minCount}
                              max={16}
                            />
                          </td>
                          <td className="py-2 pr-4 font-semibold">{bracketSize}</td>
                          <td className="py-2 pr-4 text-text-secondary">{byeCount}</td>
                          <td className="py-2">
                            {isOk ? (
                              <span className="text-green-400 text-xs">
                                OK — {teamCount} команд, сетка {bracketSize} мест{byeCount > 0 ? ` | BYE: ${byeCount}` : ''}
                              </span>
                            ) : (
                              <span className="text-red-400 text-xs">Ошибка: мин. {minCount}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {form.id ? (
              <div className="flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-secondary">Операторская страница GO доступна отдельно.</p>
                <Link
                  href={buildGoControlUrl(form.id)}
                  className="shrink-0 rounded-lg border border-brand bg-brand/20 px-4 py-2.5 text-center text-sm font-semibold text-brand hover:bg-brand/30"
                >
                  GO Tournament Control →
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-secondary">
                Сохраните турнир, чтобы открыть GO Tournament Control.
              </div>
            )}
          </div>
        ) : null}

        {!isGoFormat ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Настройки корта</h3>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Кортов:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSettings({ courts: value })}
                  className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-colors ${
                    settings.courts === value
                      ? 'bg-brand/20 text-brand border-brand/50'
                      : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">
              {isThaiFormat ? 'Игроков на Thai-корт:' : 'Игроков на корт:'}
            </span>
            <div className="flex gap-1">
              {(isThaiFormat ? [THAI_ADMIN_PLAYERS_PER_COURT] : isKotcFormat ? [playersPerCourt] : [4, 5, 6]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    if (isThaiFormat || isKotcFormat) return;
                    updateSettings({ playersPerCourt: value });
                  }}
                  disabled={isThaiFormat || isKotcFormat}
                  className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-colors ${
                    playersPerCourt === value
                      ? 'bg-brand/20 text-brand border-brand/50'
                      : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
                  } ${isThaiFormat || isKotcFormat ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-center">
            {settings.courts} {isThaiFormat ? 'Thai-корт(а)' : 'корт(а)'} x {settings.playersPerCourt} ={' '}
            <strong className="text-brand">{autoCapacity} игроков</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Вместимость:</span>
            <input
              type="number"
              min={isThaiFormat || isKotcFormat ? autoCapacity : 4}
              value={form.capacity || autoCapacity}
              onChange={(e) => setForm((current) => ({ ...current, capacity: Number(e.target.value || 0) }))}
              readOnly={isThaiFormat || isKotcFormat}
              className="w-24 px-2 py-1 rounded-lg bg-surface border border-white/20 text-center text-sm"
            />
          </div>

          {isThaiFormat ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-primary/80">Состав R1:</span>
              <Seg
                options={thaiRosterModeOptions}
                value={thaiSettings?.thaiRosterMode ?? 'manual'}
                onChange={(value) => updateSettings({ thaiRosterMode: value })}
              />
            </div>
          ) : null}

          {isThaiFormat ? (
            <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-text-secondary">
              {thaiSettings?.thaiVariant === 'MF'
                ? 'Thai Микст требует по 4 мужчины и 4 женщины на каждом корте.'
                : thaiSettings?.thaiVariant === 'MN'
                  ? 'Thai Мужчины / Новички собирается только из мужчин. Админ делит роли порядком слотов: 1-4 на корте — основной пул, 5-8 — новички.'
                : thaiSettings?.thaiVariant === 'MM'
                  ? 'Thai Муж собирается только из мужчин.'
                  : 'Thai Жен собирается только из женщин.'}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-primary/80">Пары:</span>
                <button
                  type="button"
                  onClick={() => {
                    updateSettings({
                      pairsMode: settings.pairsMode === 'rotation' ? 'fixed' : 'rotation',
                    });
                  }}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    settings.pairsMode === 'rotation'
                      ? 'bg-brand/20 text-brand border-brand/50'
                      : 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                  }`}
                >
                  {settings.pairsMode === 'rotation' ? 'Ротация' : 'Фиксированные'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-text-primary/80">Draft seed:</span>
                <input
                  type="number"
                  value={settings.draftSeed}
                  onChange={(e) => {
                    updateSettings({ draftSeed: e.target.value });
                  }}
                  placeholder="авто"
                  className="w-24 px-2 py-1 rounded-lg bg-surface border border-white/20 text-center text-sm"
                />
              </div>
            </>
          )}
        </div>
        ) : null}

        {isKotcFormat && (kotcSettings?.kotcJudgeModule ?? settings.kotcJudgeModule) !== 'next' ? (
          <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Таймеры</h3>

            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary/80">Корты (К1-К{settings.courts}):</span>
              <Stepper
                value={settings.timerCourts}
                onChange={(value) => updateSettings({ timerCourts: value })}
                min={2}
                max={25}
                suffix=" мин"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary/80">Финалы:</span>
              <Stepper
                value={settings.timerFinals}
                onChange={(value) => updateSettings({ timerFinals: value })}
                min={2}
                max={25}
                suffix=" мин"
              />
            </div>

            <div className="text-xs text-text-secondary text-center">Диапазон: 2-25 минут</div>
          </div>
        ) : null}

        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                {isGoFormat ? 'Состав по группам' : 'Состав по кортам'}
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                {isFixedPairsSeeding
                  ? 'Фикс. пары: кликайте игроков — они уйдут в слот своей категории (HARD/MEDIUM/LITE). Переключите вид на «По группам» для ручной правки состава.'
                  : isGoFormat
                  ? 'GO: состав формируется парами. Пары идут по порядку слотов: 1-2, 3-4, 5-6. Перетаскивание и выбор меняют местами сразу всю пару.'
                  : isThaiFormat
                  ? thaiSettings?.thaiRosterMode === 'manual'
                    ? 'Thai: вручную расставьте игроков по слотам и кортам. Этот порядок будет использован для составов R1 без дополнительной перетасовки. Для M/N первые 4 слота на корте — Профи, следующие 4 — Новички.'
                    : 'Thai: заполните состав, а перед стартом R1 Sudyam случайно распределит игроков по кортам по seed. Для M/N перемешивание идёт отдельно внутри слотов 1-4 и 5-8.'
                  : 'Выберите игрока, затем нажмите на другого игрока, чтобы поменять их местами.'}
              </p>
            </div>
            <div className="text-right text-xs text-text-secondary">
              <div>
                Старт: {Math.min(draftPlayers.slice(0, seatCount).filter(Boolean).length, seatCount)} / {seatCount}
              </div>
              <div className="mb-2">
                Всего: {draftPlayers.filter(Boolean).length} / {participantLimit}
              </div>
              {isFixedPairsSeeding ? (
                <div className="mb-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-text-secondary">
                  <div>HARD: {fixedPairsProgress.hardPairs}</div>
                  <div>MEDIUM: {fixedPairsProgress.mediumPairs}</div>
                  <div>LITE: {fixedPairsProgress.litePairs}</div>
                </div>
              ) : null}
              <RosterHistoryControls
                visible={unifiedRosterV2Enabled && isEdit}
                canUndo={rosterHistory.canUndo}
                canRedo={rosterHistory.canRedo}
                busy={rosterHistoryBusy}
                hasHistory={rosterHistory.stack.length > 0}
                onUndo={undoRosterAction}
                onRedo={redoRosterAction}
                onClear={clearRosterHistoryState}
              />
              {draftPlayers.length > 0 && (
                <button
                  type="button"
                  onClick={clearRoster}
                  className="text-[11px] font-semibold tracking-wide uppercase text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 bg-red-500/10 rounded px-2 py-1 transition-colors"
                >
                  Очистить
                </button>
              )}
            </div>
          </div>

          <div className={unifiedRosterV2Enabled ? 'grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]' : 'flex flex-col gap-3'}>
            {isFixedPairsSeeding ? (
              <div className="rounded-xl border border-white/10 bg-black/10 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary uppercase">Fixed pairs tools</span>
                  <button
                    type="button"
                    onClick={() => setQuickPairMode((current) => !current)}
                    className={`px-2 py-1 rounded border text-xs ${
                      quickPairMode
                        ? 'border-brand/60 bg-brand/20 text-brand'
                        : 'border-white/20 text-text-secondary hover:border-brand/40'
                    }`}
                  >
                    {quickPairMode ? 'Быстрый ввод пары: ON' : 'Быстрый ввод пары: OFF'}
                  </button>
                </div>
                {quickPairFirst ? (
                  <div className="flex items-center justify-between gap-2 rounded border border-brand/30 bg-brand/10 px-2 py-1.5 text-xs text-brand">
                    <span>1/2 пары: {quickPairFirst.name}</span>
                    <button
                      type="button"
                      onClick={() => setQuickPairFirst(null)}
                      className="rounded border border-brand/40 px-2 py-1 text-[11px] hover:bg-brand/20"
                    >
                      Сбросить
                    </button>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={autoDistributeFixedPairsByCategory}
                    className="px-2 py-1.5 rounded border border-white/20 hover:border-brand text-xs"
                  >
                    Авторазложить
                  </button>
                  <button
                    type="button"
                    onClick={() => topUpFixedPairsCategory('hard')}
                    className="px-2 py-1.5 rounded border border-red-500/40 text-red-300 text-xs hover:bg-red-500/10"
                  >
                    Добрать HARD
                  </button>
                  <button
                    type="button"
                    onClick={() => topUpFixedPairsCategory('medium')}
                    className="px-2 py-1.5 rounded border border-amber-500/40 text-amber-300 text-xs hover:bg-amber-500/10"
                  >
                    Добрать MEDIUM
                  </button>
                  <button
                    type="button"
                    onClick={() => topUpFixedPairsCategory('easy')}
                    className="px-2 py-1.5 rounded border border-emerald-500/40 text-emerald-300 text-xs hover:bg-emerald-500/10"
                  >
                    Добрать LITE
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => clearFixedPairsCategory('hard')}
                    className="px-2 py-1.5 rounded border border-red-500/30 text-red-300 text-xs hover:bg-red-500/10"
                  >
                    Очистить HARD
                  </button>
                  <button
                    type="button"
                    onClick={() => clearFixedPairsCategory('medium')}
                    className="px-2 py-1.5 rounded border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/10"
                  >
                    Очистить MEDIUM
                  </button>
                  <button
                    type="button"
                    onClick={() => clearFixedPairsCategory('easy')}
                    className="px-2 py-1.5 rounded border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/10"
                  >
                    Очистить LITE
                  </button>
                </div>
              </div>
            ) : null}
            <RosterPoolPanel
              unifiedMode={unifiedRosterV2Enabled}
              searchValue={playerSearch}
              onSearchChange={setPlayerSearch}
              genderFilterControl={(
                <Seg
                  options={genderFilterOptions}
                  value={playerGenderFilter}
                  onChange={(value) => setPlayerGenderFilter(value)}
                />
              )}
              players={filteredPlayers}
              isFixedPairsSeeding={isFixedPairsSeeding}
              onAddPlayer={handlePoolAddPlayer}
              showQuickAdd={showQuickAdd}
              quickAddForm={quickAddForm}
              quickAddLoading={quickAddLoading}
              levels={levels}
              onShowQuickAdd={setShowQuickAdd}
              onQuickAddFormChange={(patch) => setQuickAddForm((prev) => ({ ...prev, ...patch }))}
              onQuickCreatePlayer={handleQuickCreatePlayer}
            />
            <div className={unifiedRosterV2Enabled ? 'rounded-xl border border-white/10 bg-black/10 p-3 flex flex-col gap-3 min-w-0' : 'flex flex-col gap-3'}>

          <RosterWorkspaceSwitch
            unifiedMode={unifiedRosterV2Enabled}
            isFixedPairsSeeding={isFixedPairsSeeding}
            workspaceOptions={rosterWorkspaceOptions}
            workspaceValue={rosterWorkspaceView}
            fixedPairsValue={fixedPairsView}
            showThaiR1Hint={unifiedRosterV2Enabled && isThaiFormat && rosterWorkspaceView === 'thai-r1'}
            onWorkspaceChange={(next) => {
              setRosterWorkspaceView(next);
              if (next === 'categories' || next === 'groups') {
                setFixedPairsView(next);
              }
            }}
            onFixedPairsChange={(next) => setFixedPairsView(next)}
          />

          {isFixedPairsSeeding && fixedPairsView === 'categories' ? (
            <FixedPairsCategoriesBoard
              draftPlayers={draftPlayers}
              selectedDraftIndex={selectedDraftIndex}
              hardSlots={fixedPairsHardSlots}
              mediumSlots={fixedPairsMedSlots}
              liteSlots={fixedPairsLiteSlots}
              onSwap={swapDraftPlayers}
              onRemove={removeDraftPlayer}
              onMessage={setMessage}
            />
          ) : isFixedPairsSeeding && fixedPairsView === 'groups' ? (
            <FixedPairsGroupsBoard
              groupCount={goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS}
              formulaHard={goSettings?.goGroupFormulaHard ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.hard}
              formulaMedium={goSettings?.goGroupFormulaMedium ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.medium}
              formulaLite={goSettings?.goGroupFormulaLite ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.lite}
              fixedPairsHardSlots={fixedPairsHardSlots}
              fixedPairsMedSlots={fixedPairsMedSlots}
              draftPlayers={draftPlayers}
              selectedDraftIndex={selectedDraftIndex}
              confirmClearGroupIndex={confirmClearCourtIndex}
              onRequestClearGroup={(groupIdx, indexesToClear) => {
                if (confirmClearCourtIndex !== groupIdx) {
                  setConfirmClearCourtIndex(groupIdx);
                  setTimeout(() => setConfirmClearCourtIndex((c) => (c === groupIdx ? null : c)), 3000);
                  return;
                }
                setConfirmClearCourtIndex(null);
                let nextDraftRef: DraftPlayer[] = [];
                setDraftPlayers((current) => {
                  const next = [...current];
                  indexesToClear.forEach((index) => {
                    next[index] = undefined as unknown as DraftPlayer;
                  });
                  while (next.length > 0 && !next[next.length - 1]) next.pop();
                  nextDraftRef = next;
                  return next;
                });
                void sendRosterAction(
                  {
                    type: 'clear_scope',
                    scope: 'groups',
                    indexes: indexesToClear,
                    note: 'clear-go-fixed-pairs-group',
                  },
                  nextDraftRef,
                );
              }}
              onSwap={swapDraftPlayers}
              onRemove={removeDraftPlayer}
            />
          ) : (
            <RosterLanesBoard
              showLaneGrid
              rosterLaneCount={rosterLaneCount}
              playersPerCourt={playersPerCourt}
              isGoFormat={isGoFormat}
              isThaiFormat={isThaiFormat}
              division={form.division}
              thaiCourtHint={getThaiCourtHint(thaiSettings?.thaiVariant ?? 'MF')}
              selectedDraftIndex={selectedDraftIndex}
              confirmClearLaneIndex={confirmClearCourtIndex}
              draftPlayers={draftPlayers}
              reservePlayers={reservePlayers}
              seatCount={seatCount}
              rosterOverflow={rosterOverflow}
              rosterError={rosterError}
              thaiRosterError={thaiRosterError}
              goRosterError={goRosterError}
              getExpectedSlotHint={(slotIndex) =>
                isThaiFormat && thaiSettings ? getThaiSlotHint(thaiSettings.thaiVariant, slotIndex) : null
              }
              onSwap={swapDraftPlayers}
              onRemove={removeDraftPlayer}
              onClearLane={clearCourt}
              onSetGenderFilter={(next) => setPlayerGenderFilter(next)}
            />
          )}
          {isFixedPairsSeeding ? (
            <RosterLanesBoard
              showLaneGrid={false}
              rosterLaneCount={rosterLaneCount}
              playersPerCourt={playersPerCourt}
              isGoFormat={isGoFormat}
              isThaiFormat={isThaiFormat}
              division={form.division}
              thaiCourtHint={getThaiCourtHint(thaiSettings?.thaiVariant ?? 'MF')}
              selectedDraftIndex={selectedDraftIndex}
              confirmClearLaneIndex={confirmClearCourtIndex}
              draftPlayers={draftPlayers}
              reservePlayers={reservePlayers}
              seatCount={seatCount}
              rosterOverflow={rosterOverflow}
              rosterError={rosterError}
              thaiRosterError={thaiRosterError}
              goRosterError={goRosterError}
              getExpectedSlotHint={(slotIndex) =>
                isThaiFormat && thaiSettings ? getThaiSlotHint(thaiSettings.thaiVariant, slotIndex) : null
              }
              onSwap={swapDraftPlayers}
              onRemove={removeDraftPlayer}
              onClearLane={clearCourt}
              onSetGenderFilter={(next) => setPlayerGenderFilter(next)}
            />
          ) : null}
            </div>
          </div>
        </div>

        <RosterMobileActionBar
          visible={unifiedRosterV2Enabled && isEdit}
          viewLabel={currentWorkspaceLabel}
          filled={Math.min(draftPlayers.filter(Boolean).length, seatCount)}
          total={seatCount}
          canUndo={rosterHistory.canUndo}
          canRedo={rosterHistory.canRedo}
          busy={rosterHistoryBusy}
          hasHistory={rosterHistory.stack.length > 0}
          saveDisabled={saveDisabled}
          viewSwitchDisabled={rosterWorkspaceOptions.length <= 1}
          onUndo={undoRosterAction}
          onRedo={redoRosterAction}
          onClear={clearRosterHistoryState}
          onViewSwitch={cycleRosterWorkspaceView}
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saveDisabled}
            className="flex-1 px-4 py-3 rounded-xl bg-brand text-surface font-semibold disabled:opacity-60 text-sm"
          >
            {loading ? 'Сохраняем...' : isEdit ? 'Сохранить изменения' : 'Создать турнир'}
          </button>
          <button
            type="button"
            onClick={resetComposer}
            className="px-4 py-3 rounded-xl border border-white/20 hover:border-brand text-sm"
          >
            Сброс
          </button>
          {isEdit && form.status === 'draft' ? (
            <button
              type="button"
              onClick={handleDeleteTournament}
              disabled={loading}
              className="px-4 py-3 rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-sm font-semibold transition-colors"
            >
              Удалить
            </button>
          ) : null}
        </div>

        {message ? (
          <p className={`text-sm text-center ${message === 'Сохранено' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </p>
        ) : null}
        {launchTarget ? (
          <Link
            href={launchTarget.href}
            className="px-4 py-3 rounded-xl border border-brand/40 bg-brand/10 text-brand-light text-sm font-semibold"
          >
            {launchTarget.label}
          </Link>
        ) : null}
      </form>
    </div>
  );
}

