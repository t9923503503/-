'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  GO_ADMIN_DEFAULT_BRACKET_LEVELS,
  GO_ADMIN_DEFAULT_COURTS,
  GO_ADMIN_DEFAULT_GROUP_FORMULA,
  GO_ADMIN_DEFAULT_GROUPS,
  GO_ADMIN_DEFAULT_SLOT_MINUTES,
  GO_ADMIN_DEFAULT_START_TIME,
  GO_ADMIN_DEFAULT_TEAMS_PER_GROUP,
  GO_ADMIN_FORMAT,
  GO_ADMIN_MAX_BRACKET_LEVELS,
  GO_ADMIN_MAX_COURTS,
  GO_ADMIN_MAX_GROUPS,
  GO_ADMIN_MAX_TEAMS_PER_GROUP,
  GO_ADMIN_MIN_BRACKET_LEVELS,
  GO_ADMIN_MIN_COURTS,
  GO_ADMIN_MIN_GROUPS,
  GO_ADMIN_MIN_TEAMS_PER_GROUP,
  GO_BRACKET_LEVEL_LABELS,
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
  goGroupCount: number;
  goTeamsPerGroup: number;
  goMatchFormat: 'single15' | 'single21' | 'bo3';
  goPointLimitGroup: number;
  goPointLimitBracket: number;
  goSeedingMode: 'serpentine' | 'random' | 'manual';
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
};

type DraftPlayer = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
};

type GenderFilter = ThaiGenderFilter;

type RosterParticipant = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
};

type LaunchTarget = {
  href: string;
  label: string;
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

function createEmptyForm(): Row {
  return {
    id: '',
    name: '',
    date: '',
    time: '',
    location: '',
    format: 'Round Robin',
    division: 'Мужской',
    level: 'medium',
    capacity: 24,
    status: 'open',
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
  return {
    ...base,
    courts: goSettings.courts,
    goCourts: goSettings.courts,
    goGroupCount: Math.max(1, Math.ceil((participantCount ?? 0) / 2 / Math.max(1, goSettings.groupSlotSize))),
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
              ? value === o.key
                ? 'bg-brand/10 text-brand/50 border-brand/30 cursor-not-allowed'
                : 'bg-white/5 text-text-primary/30 border-white/5 cursor-not-allowed'
              : value === o.key
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
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg border border-white/20 hover:border-brand text-text-primary/80 flex items-center justify-center"
      >
        -
      </button>
      <span className="w-16 text-center font-semibold text-brand">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg border border-white/20 hover:border-brand text-text-primary/80 flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

export default function AdminTournamentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
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
  const [quickAddForm, setQuickAddForm] = useState<{name: string, gender: 'M'|'W', level: string}>({ name: '', gender: 'M', level: 'Лайт' });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const isEdit = useMemo(() => Boolean(form.id), [form.id]);
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
  const playersPerCourt = isThaiFormat
    ? THAI_ADMIN_PLAYERS_PER_COURT
    : isGoFormat
      ? Math.max(2, Math.ceil(getGoSeatCount(goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS, goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP) / Math.max(1, goSettings?.goCourts ?? GO_ADMIN_DEFAULT_COURTS)))
    : isKotcFormat
      ? kotcSettings?.playersPerCourt ?? settings.playersPerCourt
      : settings.playersPerCourt;
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

  const isDirty = useMemo(() => {
    return form.name !== '' || form.date !== '' || form.location !== '' || draftPlayers.some(Boolean);
  }, [form.name, form.date, form.location, draftPlayers]);

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

  function resetComposer() {
    setForm(createEmptyForm());
    setDraftPlayers([]);
    setSelectedDraftIndex(null);
    setPlayerSearch('');
    setPlayerGenderFilter('all');
    setRosterError('');
    setLaunchTarget(null);
    setConfirmClearCourtIndex(null);
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
    setRows(Array.isArray(data) ? (data as Row[]) : []);
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
          }))
        : []
    );
  }

  useEffect(() => {
    void Promise.all([load(), loadPlayers()]);
  }, []);

  useEffect(() => {
    if (selectedDraftIndex != null && selectedDraftIndex >= draftPlayers.length) {
      setSelectedDraftIndex(null);
    }
  }, [draftPlayers.length, selectedDraftIndex]);

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
        format: GO_ADMIN_FORMAT,
        capacity: getGoSeatCount(nextSettings.goGroupCount, nextSettings.goTeamsPerGroup),
        settings: nextSettings,
      });
    } else {
      setForm({ ...row, settings: normalizeSettings(row.settings) });
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
      const playersSparse: DraftPlayer[] = [];
      participants.forEach((participant, idx) => {
        const rawPos = (participant as any).position;
        const index = typeof rawPos === 'number' ? rawPos - 1 : playersSparse.length;
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
    } catch (error) {
      const errorText = getErrorText(error, 'Не удалось загрузить состав');
      setDraftPlayers([]);
      setRosterError(errorText);
      setMessage(errorText);
    } finally {
      setRosterLoading(false);
    }
  }

  function addDraftPlayer(player: Player) {
    if (registeredIds.has(player.id)) return;
    if (draftPlayers.length >= participantLimit) {
      setMessage(`Лимит участников достигнут: ${participantLimit}`);
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
    setDraftPlayers((current) => {
      const holeIndex = current.findIndex((p) => !p);
      if (holeIndex !== -1 && holeIndex < participantLimit) {
        const next = [...current];
        next[holeIndex] = {
          playerId: player.id,
          playerName: player.name,
          gender: player.gender,
        };
        return next;
      }
      return [
        ...current,
        {
          playerId: player.id,
          playerName: player.name,
          gender: player.gender,
        },
      ];
    });
    setMessage('');
  }

  function removeDraftPlayer(index: number) {
    setDraftPlayers((current) => {
      const next = [...current];
      next[index] = undefined as unknown as DraftPlayer;
      // Trim empty tail
      while (next.length > 0 && !next[next.length - 1]) {
        next.pop();
      }
      return next;
    });
    if (selectedDraftIndex === index) {
      setSelectedDraftIndex(null);
    } else if (selectedDraftIndex != null && selectedDraftIndex > index) {
      // Don't shift selection, position stays same!
      // setSelectedDraftIndex(selectedDraftIndex - 1); // Removed to prevent selection shift
    }
    setMessage('');
  }

  function swapDraftPlayers(index1: number, index2?: number) {
    const target1 = index1;
    const target2 = index2 !== undefined ? index2 : selectedDraftIndex;
    
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
    setDraftPlayers((current) => {
      const next = [...current];
      // Extend array with dummy elements if dropped far beyond
      const maxIndex = Math.max(target1, target2);
      while (next.length <= maxIndex) next.push(undefined as unknown as DraftPlayer);
      
      [next[target2], next[target1]] = [next[target1], next[target2]];
      
      while (next.length > 0 && !next[next.length - 1]) {
        next.pop();
      }
      return next;
    });
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
    setDraftPlayers((current) => {
      const next = [...current];
      const start = courtIndex * playersPerCourt;
      for (let i = 0; i < playersPerCourt; i++) {
        next[start + i] = undefined as unknown as DraftPlayer;
      }
      while (next.length > 0 && !next[next.length - 1]) {
        next.pop();
      }
      return next;
    });
    setMessage('');
  }

  function clearRoster() {
    if (window.confirm('Очистить всех игроков из турнира? (Резерв тоже будет удалён)')) {
      setDraftPlayers([]);
      setSelectedDraftIndex(null);
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
          level: created.level || quickAddForm.level,
        } as Player;
        setAllPlayers(current => [...current, newPlayer]);
        addDraftPlayer(newPlayer);
        setShowQuickAdd(false);
        setQuickAddForm({ name: '', gender: 'M', level: 'Лайт' });
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
      const nextRow: Row = {
        id: savedId,
        name:
          typeof result === 'object' && result && 'name' in result ? String((result as Row).name || form.name) : form.name,
        date:
          typeof result === 'object' && result && 'date' in result ? String((result as Row).date || form.date) : form.date,
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

  const saveDisabled = loading || rosterLoading || Boolean(rosterError) || rosterOverflow || (Boolean(thaiRosterError) && form.status !== 'open');

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
                <th className="py-2 pr-3">Дата</th>
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
              value={form.date}
              onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
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

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">GO v2 settings</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Hard / group</label>
                  <Stepper
                    value={goSettings?.goGroupFormulaHard ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.hard}
                    onChange={(value) => updateSettings({ goGroupFormulaHard: value })}
                    min={0}
                    max={4}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Medium / group</label>
                  <Stepper
                    value={goSettings?.goGroupFormulaMedium ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.medium}
                    onChange={(value) => updateSettings({ goGroupFormulaMedium: value })}
                    min={0}
                    max={4}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Lite / group</label>
                  <Stepper
                    value={goSettings?.goGroupFormulaLite ?? GO_ADMIN_DEFAULT_GROUP_FORMULA.lite}
                    onChange={(value) => updateSettings({ goGroupFormulaLite: value })}
                    min={0}
                    max={4}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Slot, min</label>
                  <Stepper
                    value={goSettings?.goSlotMinutes ?? GO_ADMIN_DEFAULT_SLOT_MINUTES}
                    onChange={(value) => updateSettings({ goSlotMinutes: value })}
                    min={10}
                    max={120}
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-text-secondary">Start time</label>
                  <input
                    type="time"
                    value={goSettings?.goStartTime ?? GO_ADMIN_DEFAULT_START_TIME}
                    onChange={(event) => updateSettings({ goStartTime: event.target.value })}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-white"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={Boolean(goSettings?.goBronzeMatchEnabled ?? true)}
                    onChange={(event) => updateSettings({ goBronzeMatchEnabled: event.target.checked })}
                  />
                  Bronze match
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ['hard', 'medium'],
                  ['hard', 'medium', 'lite'],
                  ['lyutye', 'hard', 'medium'],
                  ['lyutye', 'hard', 'medium', 'lite'],
                ].map((preset) => {
                  const active =
                    JSON.stringify(goSettings?.goEnabledPlayoffLeagues ?? ['hard', 'medium', 'lite']) === JSON.stringify(preset);
                  return (
                    <button
                      key={preset.join(',')}
                      type="button"
                      onClick={() =>
                        updateSettings({
                          goEnabledPlayoffLeagues: preset as TournamentSettings['goEnabledPlayoffLeagues'],
                        })
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase ${
                        active ? 'border-brand/60 bg-brand/20 text-brand' : 'border-white/10 bg-white/5 text-white/70'
                      }`}
                    >
                      {preset.join(' / ')}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {(goSettings?.goEnabledPlayoffLeagues ?? ['hard', 'medium', 'lite']).map((league) => (
                  <div key={league} className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-xs font-semibold uppercase text-white/70">{league}</div>
                    <div className="mt-2">
                      <Stepper
                        value={goSettings?.goBracketSizes?.[league] ?? (league === 'hard' || league === 'lyutye' ? 4 : 2)}
                        onChange={(value) =>
                          updateSettings({
                            goBracketSizes: {
                              ...(goSettings?.goBracketSizes ?? {}),
                              [league]: value,
                            },
                          })
                        }
                        min={league === 'hard' || league === 'lyutye' ? 4 : 2}
                        max={16}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
                onChange={(value) => updateSettings({ kotcPpc: value })}
                min={KOTC_ADMIN_MIN_PPC}
                max={KOTC_ADMIN_MAX_PPC}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Раундов на корт</label>
              <Stepper
                value={kotcSettings?.kotcRaundCount ?? settings.kotcRaundCount}
                onChange={(value) => updateSettings({ kotcRaundCount: value })}
                min={KOTC_ADMIN_MIN_RAUNDS}
                max={KOTC_ADMIN_MAX_RAUNDS}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Таймер раунда</label>
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
              {` `}{playersPerCourt} игроков на площадку, {kotcSettings?.kotcRaundCount ?? settings.kotcRaundCount} раунд(а) по
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
              <label className="text-xs text-text-secondary">Группы</label>
              <Stepper
                value={goSettings?.goGroupCount ?? GO_ADMIN_DEFAULT_GROUPS}
                onChange={(value) => updateSettings({ goGroupCount: value })}
                min={GO_ADMIN_MIN_GROUPS}
                max={GO_ADMIN_MAX_GROUPS}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Команд в группе</label>
              <Stepper
                value={goSettings?.goTeamsPerGroup ?? GO_ADMIN_DEFAULT_TEAMS_PER_GROUP}
                onChange={(value) => updateSettings({ goTeamsPerGroup: value })}
                min={GO_ADMIN_MIN_TEAMS_PER_GROUP}
                max={GO_ADMIN_MAX_TEAMS_PER_GROUP}
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
                ]}
                value={goSettings?.goSeedingMode ?? 'serpentine'}
                onChange={(value) => updateSettings({ goSeedingMode: value as TournamentSettings['goSeedingMode'] })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-text-secondary">Уровни сетки</label>
              <Stepper
                value={goSettings?.goBracketLevels ?? GO_ADMIN_DEFAULT_BRACKET_LEVELS}
                onChange={(value) => updateSettings({ goBracketLevels: value })}
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
              Уровни сетки: {GO_BRACKET_LEVEL_LABELS.slice(0, goSettings?.goBracketLevels ?? GO_ADMIN_DEFAULT_BRACKET_LEVELS).join(', ')}.
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
              onChange={(value) => {
                if (value === 'live' && draftPlayers.filter(Boolean).length < seatCount) {
                  if (!window.confirm("Внимание! Ростер заполнен не полностью (заполнено " + draftPlayers.filter(Boolean).length + " из " + seatCount + "). \n\nАлгоритмам может не хватить игроков. Ожидается 500 ошибка. \nВы уверены, что хотите перевести в LIVE?")) {
                    return;
                  }
                }
                setForm((current) => ({ ...current, status: value }));
              }}
            />
          </div>
        </div>

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

        {isKotcFormat ? (
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
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Состав по кортам</h3>
              <p className="text-xs text-text-secondary mt-1">
                {isThaiFormat
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

          <input
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            placeholder="Добавить игрока в турнир"
            className="px-3 py-2 rounded-lg bg-surface border border-white/20"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-secondary">Фильтр пола</span>
            <Seg
              options={genderFilterOptions}
              value={playerGenderFilter}
              onChange={(value) => setPlayerGenderFilter(value)}
            />
          </div>

          <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
            {filteredPlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => addDraftPlayer(player)}
                className="text-left px-3 py-2 rounded-lg border border-white/10 hover:border-brand transition-colors text-sm"
              >
                {player.name}
                <span className="text-text-secondary ml-2">{player.gender === 'W' ? 'W' : 'M'}</span>
              </button>
            ))}
            {filteredPlayers.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-text-secondary">Нет доступных игроков в базе</p>
                {!showQuickAdd ? (
                  <button
                    type="button"
                    onClick={() => {
                       setShowQuickAdd(true);
                       setQuickAddForm(prev => ({...prev, name: playerSearch}));
                    }}
                    className="text-left px-3 py-2 rounded-lg border border-brand/40 hover:bg-brand/10 text-brand text-sm transition-colors uppercase tracking-wider font-semibold"
                  >
                    + Создать игрока
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-lg max-w-sm">
                    <input
                      placeholder="Имя Фамилия"
                      value={quickAddForm.name}
                      onChange={e => setQuickAddForm(p => ({...p, name: e.target.value}))}
                      className="px-2 py-1.5 rounded bg-surface border border-white/20 text-sm"
                    />
                    <div className="flex gap-2">
                       <select 
                         value={quickAddForm.gender} 
                         onChange={e => setQuickAddForm(p => ({...p, gender: e.target.value as 'M'|'W'}))}
                         className="flex-1 px-2 py-1.5 rounded bg-surface border border-white/20 text-sm"
                       >
                         <option value="M">М</option>
                         <option value="W">Ж</option>
                       </select>
                       <select 
                         value={quickAddForm.level} 
                         onChange={e => setQuickAddForm(p => ({...p, level: e.target.value}))}
                         className="flex-1 px-2 py-1.5 rounded bg-surface border border-white/20 text-sm"
                       >
                         {levels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                       </select>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button 
                        type="button" 
                        onClick={handleQuickCreatePlayer}
                        disabled={quickAddLoading || !quickAddForm.name.trim()}
                        className="flex-1 bg-brand text-surface text-sm font-semibold rounded py-1.5 disabled:opacity-50"
                      >
                        {quickAddLoading ? '...' : 'Создать'}
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setShowQuickAdd(false)}
                        className="flex-1 border border-white/20 text-text-secondary text-sm rounded py-1.5 hover:bg-white/5"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="grid xl:grid-cols-2 gap-3">
            {Array.from({ length: settings.courts }, (_, courtIndex) => (
              <div key={courtIndex} className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-text-primary">Корт {courtIndex + 1}</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary">
                      {isThaiFormat ? getThaiCourtHint(thaiSettings?.thaiVariant ?? 'MF') : form.division === 'Микст' ? `${settings.playersPerCourt} мест · ${Math.floor(settings.playersPerCourt / 2)}M / ${Math.ceil(settings.playersPerCourt / 2)}Ж` : `${settings.playersPerCourt} мест`}
                    </span>
                    <button
                      type="button"
                      onClick={() => clearCourt(courtIndex)}
                      className={`text-[10px] uppercase font-semibold px-2 py-1 rounded transition-colors ${
                        confirmClearCourtIndex === courtIndex
                          ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                          : 'text-red-400 hover:text-red-300'
                      }`}
                    >
                      {confirmClearCourtIndex === courtIndex ? 'Точно?' : 'Очистить'}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: settings.playersPerCourt }, (_, slotIndex) => {
                    const draftIndex = courtIndex * settings.playersPerCourt + slotIndex;
                    const player = draftPlayers[draftIndex];
                    const selected = selectedDraftIndex === draftIndex;
                    let expectedGender =
                      isThaiFormat && thaiSettings ? getThaiSlotHint(thaiSettings.thaiVariant, slotIndex) : null;
                    if (!expectedGender && form.division === 'Микст') {
                      expectedGender = slotIndex < settings.playersPerCourt / 2 ? 'M' : 'Ж';
                    }
                    return (
                      <div
                        key={draftIndex}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', draftIndex.toString());
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                          if (!isNaN(fromIndex) && fromIndex !== draftIndex) {
                            swapDraftPlayers(fromIndex, draftIndex);
                          }
                        }}
                        className={`rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                          selected ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-stretch gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              swapDraftPlayers(draftIndex);
                              const exp = isThaiFormat && thaiSettings ? getThaiSlotHint(thaiSettings.thaiVariant, slotIndex) : (form.division === 'Микст' ? (slotIndex < settings.playersPerCourt / 2 ? 'M' : 'Ж') : null);
                              if (exp === 'M' || exp === 'Мужчина') setPlayerGenderFilter('M');
                              else if (exp === 'Ж' || exp === 'W' || exp === 'Женщина') setPlayerGenderFilter('W');
                            }}
                            disabled={!player}
                            className="flex-1 px-3 py-2 text-left disabled:cursor-default disabled:opacity-60"
                          >
                            <div className="text-[11px] uppercase tracking-wider text-text-secondary">
                              Слот {slotIndex + 1}
                              {expectedGender ? ` · ${expectedGender}` : ''}
                            </div>
                            <div className="font-medium text-sm mt-1">
                              {player ? player.playerName : 'Пусто'}
                            </div>
                            <div className="text-xs text-text-secondary mt-1">
                              {player
                                ? `Игрок ${draftIndex + 1} · ${player.gender}`
                                : expectedGender
                                  ? `Ожидается ${expectedGender}`
                                  : 'Свободное место'}
                            </div>
                          </button>
                          {player ? (
                            <button
                              type="button"
                              onClick={() => removeDraftPlayer(draftIndex)}
                              className="px-3 text-xs text-red-300 border-l border-white/10"
                            >
                              Убрать
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {reservePlayers.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-text-primary">Резерв</h4>
                <span className="text-xs text-text-secondary">{reservePlayers.length} игроков</span>
              </div>
              <div className="space-y-2">
                {reservePlayers.map((player, reserveIndex) => {
                  const draftIndex = seatCount + reserveIndex;
                  const selected = selectedDraftIndex === draftIndex;
                  return (
                    <div
                      key={player ? `${player.playerId}-${draftIndex}` : `empty-${draftIndex}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', draftIndex.toString());
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        if (!isNaN(fromIndex) && fromIndex !== draftIndex) {
                          swapDraftPlayers(fromIndex, draftIndex);
                        }
                      }}
                      className={`rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                        selected ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          onClick={() => swapDraftPlayers(draftIndex)}
                          className="flex-1 px-3 py-2 text-left"
                        >
                          <div className="text-[11px] uppercase tracking-wider text-text-secondary">
                            Позиция {draftIndex + 1}
                          </div>
                          <div className="font-medium text-sm mt-1">{player ? player.playerName : 'Пусто'}</div>
                          <div className="text-xs text-text-secondary mt-1">{player ? player.gender : 'Ожидается резерв'}</div>
                        </button>
                        {player ? (
                          <button
                            type="button"
                            onClick={() => removeDraftPlayer(draftIndex)}
                            className="px-3 text-xs text-red-300 border-l border-white/10"
                          >
                            Убрать
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {selectedDraftIndex != null && draftPlayers[selectedDraftIndex] ? (
            <div className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand">
              Выбран игрок: {draftPlayers[selectedDraftIndex].playerName}. Нажмите на другого игрока, чтобы поменять местами.
            </div>
          ) : null}

          {draftPlayers.filter(Boolean).length > 0 && draftPlayers.filter(Boolean).length < seatCount ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Внимание: не хватает {seatCount - draftPlayers.filter(Boolean).length} игроков для заполнения всех ожидаемых мест на кортах.
            </div>
          ) : null}

          {rosterOverflow ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              Игроков больше, чем вместимость. Увеличьте capacity или уберите лишних игроков.
            </div>
          ) : null}

          {rosterError ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {rosterError}
            </div>
          ) : null}

          {thaiRosterError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {thaiRosterError}
            </div>
          ) : null}
        </div>

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
