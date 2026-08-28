'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminPlayer, AdminTournament, RosterParticipant } from '@/lib/admin-queries';
import {
  INDIVIDUAL_MIX_FORMAT,
  INDIVIDUAL_MIX_FORMAT_LABEL,
  INDIVIDUAL_MIX_SERIES_LABEL,
  INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID,
  INDIVIDUAL_MIX_VARIANT_STANDARD,
  isSixPairIndividualMixVariant,
} from '@/lib/individual-mix/admin';
import {
  calculateTournamentCapacity,
  getGoPreset,
  getLocalIsoDate,
  getTournamentFormatLabel,
  getTournamentLaunchHref,
  getTournamentStatusLabel,
} from '@/lib/admin-tournaments-ui';
import {
  GO_ADMIN_MAX_DECLARED_TEAMS,
  GO_ADMIN_MAX_GROUPS,
  GO_ADMIN_MIN_DECLARED_TEAMS,
  GO_ADMIN_MIN_GROUPS,
  KOTC_ADMIN_MAX_PPC,
  KOTC_ADMIN_MAX_TIMER,
  KOTC_ADMIN_MIN_PPC,
  KOTC_ADMIN_MIN_TIMER,
} from '@/lib/admin-legacy-sync';
import {
  alignKotcRoundsToPairs,
  buildGoAutoConfigPatchFromDeclared,
  buildGoPlayoffSyncPatch,
  findFirstMatchingThaiSlot,
  getGoGroupFormulaPatch,
  getTournamentWizardThaiSlotGender,
  normalizeTournamentWizardThaiVariant,
} from './tournament-wizard-logic';

export type WizardMode = 'create' | 'edit' | 'duplicate';

type WizardSettings = Record<string, unknown> & {
  courts?: number;
  pairsPerCourt?: number;
  playersPerCourt?: number;
  timerCourts?: number;
  timerFinals?: number;
  pairsMode?: 'rotation' | 'fixed';
  draftSeed?: string;
  thaiVariant?: string;
  thaiRosterMode?: 'manual' | 'random';
  thaiJudgeModule?: 'next' | 'legacy';
  thaiPointLimit?: number;
  tourCount?: number;
  kotcJudgeModule?: 'next' | 'legacy';
  kotcNextDemoEnabled?: boolean;
  kotcR2SeedingMode?: string;
  kotcSelfScoringEnabled?: boolean;
  kotcScoreVoiceEnabled?: boolean;
  kotcScoreHistoryVisible?: boolean;
  kotcTakeoversMode?: 'standard' | 'no_takeovers';
  kotcPpc?: number;
  kotcRaundCount?: number;
  kotcRaundTimerMinutes?: number;
  goCourts?: number;
  goDeclaredTeamCount?: number;
  goGroupCount?: number;
  goTeamsPerGroup?: number;
  goMatchFormat?: string;
  goPointLimitGroup?: number;
  goPointLimitBracket?: number;
  goSeedingMode?: string;
  goBracketLevels?: number;
  goGroupFormulaHard?: number;
  goGroupFormulaMedium?: number;
  goGroupFormulaLite?: number;
  goEnabledPlayoffLeagues?: string[];
  goMixedTeamCounts?: Record<string, number>;
  goBracketSizes?: Record<string, number>;
  goBronzeMatchEnabled?: boolean;
  goV2PublicEnabled?: boolean;
  rrTeamCount?: number;
  rrGroupCount?: number;
  rrCourts?: number;
  rrPlayoffMode?: 'championship' | 'all_levels';
  rrSeedingMode?: 'serpentine' | 'random' | 'manual';
  rrGroupMatchFormat?: string;
  rrPlayoffMatchFormat?: string;
  rrTimedMinutes?: number;
  individualMixPoolSize?: 4 | 5 | 6;
  individualMixPointLimit?: number;
  individualMixVariant?: 'standard' | 'six_pair_hybrid';
  individualMixPairGender?: 'M' | 'W';
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

export type TournamentWizardDraft = {
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
  goEngineVersion: 1 | 2;
  settings: WizardSettings;
};

type RosterEntry = {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  playerLevel: 'hard' | 'medium' | 'easy';
};

type Props = {
  mode: WizardMode;
  initialTournament?: AdminTournament | null;
  initialPlayers: AdminPlayer[];
  initialRoster?: RosterParticipant[];
};

const STEPS = ['Основное', 'Формат', 'Участники', 'Проверка'] as const;
const STORAGE_PREFIX = 'lpvolley:admin:tournament-wizard:v2:';
const INPUT = 'mt-1 w-full rounded-lg border border-white/20 bg-surface px-3 py-2 text-text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const LEVEL_LABELS: Record<string, string> = { hard: 'Продвинутый', medium: 'Средний', easy: 'Начальный' };
// Схема не допускает смешанный состав: каждая пара — Джедай + Падаван одного пола.

function normalizedRosterLookup(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/https?:\/\/t\.me\//g, '@')
    .replace(/[^\p{L}\p{N}@]+/gu, ' ')
    .trim();
}

export function matchTelegramRosterText(text: string, players: AdminPlayer[]): {
  matchedIds: string[];
  unmatched: string[];
  ambiguous: string[];
} {
  const available = players.map((player) => ({
    player,
    name: normalizedRosterLookup(player.name),
    telegram: normalizedRosterLookup(player.telegram),
  }));
  const matchedIds = new Set<string>();
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = normalizedRosterLookup(sourceLine.replace(/^\s*(?:\d+[.)-]?|[-–—•])\s*/, ''));
    if (!line) continue;
    const exact = available.filter(({ name, telegram }) => line === name || Boolean(telegram && (line === telegram || line.includes(telegram))));
    const candidates = exact.length ? exact : available.filter(({ name }) => line.includes(name) || name.includes(line));
    if (candidates.length === 1) matchedIds.add(candidates[0].player.id);
    else if (candidates.length > 1) ambiguous.push(sourceLine.trim());
    else unmatched.push(sourceLine.trim());
  }
  return { matchedIds: [...matchedIds], unmatched, ambiguous };
}

const DEFAULT_SETTINGS: WizardSettings = {
  courts: 3,
  pairsPerCourt: 2,
  playersPerCourt: 4,
  timerCourts: 10,
  timerFinals: 10,
  pairsMode: 'rotation',
  draftSeed: '',
  thaiVariant: 'MF',
  thaiRosterMode: 'manual',
  thaiJudgeModule: 'next',
  thaiPointLimit: 15,
  tourCount: 2,
  kotcJudgeModule: 'next',
  kotcNextDemoEnabled: false,
  kotcR2SeedingMode: 'court_places',
  kotcSelfScoringEnabled: false,
  kotcScoreVoiceEnabled: true,
  kotcScoreHistoryVisible: true,
  kotcTakeoversMode: 'standard',
  kotcPpc: 3,
  kotcRaundCount: 3,
  kotcRaundTimerMinutes: 10,
  goCourts: 3,
  goDeclaredTeamCount: 12,
  goGroupCount: 3,
  goTeamsPerGroup: 4,
  goMatchFormat: 'single15',
  goPointLimitGroup: 15,
  goPointLimitBracket: 15,
  goSeedingMode: 'fixedPairs',
  goBracketLevels: 3,
  goGroupFormulaHard: 2,
  goGroupFormulaMedium: 1,
  goGroupFormulaLite: 1,
  goEnabledPlayoffLeagues: ['hard', 'medium', 'lite'],
  goMixedTeamCounts: { hard: 6, medium: 3, lite: 3 },
  goBracketSizes: { hard: 8, medium: 4, lite: 4 },
  rrTeamCount: 6,
  rrGroupCount: 2,
  rrCourts: 2,
  rrPlayoffMode: 'championship',
  rrSeedingMode: 'serpentine',
  rrGroupMatchFormat: 'single15',
  rrPlayoffMatchFormat: 'single15',
  rrTimedMinutes: 15,
  individualMixPoolSize: 5,
  individualMixPointLimit: 15,
  individualMixVariant: INDIVIDUAL_MIX_VARIANT_STANDARD,
  individualMixPairGender: 'W',
  goBronzeMatchEnabled: true,
};

function normalizePlayerLevel(value: unknown): RosterEntry['playerLevel'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'pro' || normalized === 'advanced' || normalized === 'hard') return 'hard';
  if (normalized === 'medium') return 'medium';
  return 'easy';
}

function createDraft(initial?: AdminTournament | null): TournamentWizardDraft {
  const mergedSettings: WizardSettings = {
    ...DEFAULT_SETTINGS,
    ...(initial?.settings ?? {}),
  };
  const settings = /kotc|king of the court/i.test(String(initial?.format ?? ''))
    ? alignKotcRoundsToPairs(mergedSettings) as WizardSettings
    : String(initial?.format ?? '').toLowerCase() === 'thai'
      ? { ...mergedSettings, thaiVariant: normalizeTournamentWizardThaiVariant(mergedSettings.thaiVariant) }
      : mergedSettings;
  const base: TournamentWizardDraft = {
    id: initial?.id ?? '',
    name: initial?.name ?? '',
    date: initial?.date ?? getLocalIsoDate(),
    time: initial?.time || '20:00',
    location: initial?.location || 'МАЛИБУ',
    format: initial?.format || 'Round Robin',
    division: initial?.division || 'Мужской',
    level: initial?.level || 'medium',
    capacity: initial?.capacity || 12,
    status: initial?.status || 'draft',
    goEngineVersion: initial?.goEngineVersion === 2 ? 2 : 1,
    settings,
  };
  return { ...base, capacity: calculateTournamentCapacity(base) };
}

function rosterEntry(player: Pick<AdminPlayer, 'id' | 'name' | 'gender' | 'skillLevel'>): RosterEntry {
  return { playerId: player.id, playerName: player.name, gender: player.gender, playerLevel: normalizePlayerLevel(player.skillLevel) };
}

function rosterFromInitial(roster: RosterParticipant[], players: AdminPlayer[]): Array<RosterEntry | null> {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const result: Array<RosterEntry | null> = [];
  const positionOffset = roster.length && roster.every((participant) => participant.position >= 1) ? 1 : 0;
  [...roster].sort((a, b) => a.position - b.position).forEach((participant) => {
    const player = playersById.get(participant.playerId);
    result[Math.max(0, participant.position - positionOffset)] = player
      ? rosterEntry(player)
      : { playerId: participant.playerId, playerName: participant.playerName, gender: participant.gender, playerLevel: 'easy' };
  });
  return result;
}

function formatKey(draft: TournamentWizardDraft): string {
  if (draft.format === 'Groups + Olympic') return getGoPreset(draft.settings) === 'olympic' ? 'go_olympic' : 'go_all';
  return draft.format;
}

function patchForFormat(key: string): Partial<TournamentWizardDraft> {
  if (key === 'go_olympic') return { format: 'Groups + Olympic', settings: { ...DEFAULT_SETTINGS, goEnabledPlayoffLeagues: ['hard'], goBracketLevels: 1, goMixedTeamCounts: { hard: 6 }, goBracketSizes: { hard: 8 } } };
  if (key === 'go_all') return { format: 'Groups + Olympic', settings: { ...DEFAULT_SETTINGS, goEnabledPlayoffLeagues: ['hard', 'medium', 'lite'], goBracketLevels: 3, goBracketSizes: { hard: 4, medium: 4, lite: 4 } } };
  if (key === 'Thai') return { format: key, settings: { ...DEFAULT_SETTINGS, courts: 2, pairsPerCourt: 4, playersPerCourt: 8, thaiJudgeModule: 'next' } };
  if (key === 'King of the Court') return { format: key, settings: alignKotcRoundsToPairs({ ...DEFAULT_SETTINGS, courts: 2, kotcPpc: 3 }) as WizardSettings };
  if (key === 'Round Robin') return { format: key, settings: { ...DEFAULT_SETTINGS, courts: 2, pairsPerCourt: 3, playersPerCourt: 6, rrTeamCount: 6, rrGroupCount: 2, rrCourts: 2, rrPlayoffMode: 'championship', rrSeedingMode: 'serpentine', rrGroupMatchFormat: 'single15', rrPlayoffMatchFormat: 'single15' } };
  if (key === INDIVIDUAL_MIX_FORMAT) return { format: key, division: 'Микст', settings: { ...DEFAULT_SETTINGS, individualMixVariant: INDIVIDUAL_MIX_VARIANT_STANDARD, courts: 2, individualMixPoolSize: 5, individualMixPointLimit: 15, playersPerCourt: 10, pairsPerCourt: 5 } };
  return { format: key, settings: { ...DEFAULT_SETTINGS, courts: 3, pairsPerCourt: 2, playersPerCourt: 4 } };
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить турнир';
}

export function TournamentWizard({ mode, initialTournament, initialPlayers, initialRoster = [] }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => createDraft(initialTournament));
  const [slots, setSlots] = useState<Array<RosterEntry | null>>(() => rosterFromInitial(initialRoster, initialPlayers));
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<'all' | 'M' | 'W'>('all');
  const [level, setLevel] = useState<'all' | RosterEntry['playerLevel']>('all');
  const [selectedPool, setSelectedPool] = useState<Set<string>>(new Set());
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [confirmClearCourt, setConfirmClearCourt] = useState<number | null>(null);
  const [telegramRosterText, setTelegramRosterText] = useState('');
  const [telegramImportMessage, setTelegramImportMessage] = useState('');
  const [goAutosaveState, setGoAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [goAutosaveAt, setGoAutosaveAt] = useState('');
  const [goAutosaveError, setGoAutosaveError] = useState('');
  const [goPreflight, setGoPreflight] = useState<GoPreflightResult | null>(null);
  const [goPreflightLoading, setGoPreflightLoading] = useState(false);
  const firstErrorRef = useRef<HTMLInputElement>(null);
  const goAutosaveBusyRef = useRef(false);
  const goPreflightRequestRef = useRef(0);
  const storageKey = `${STORAGE_PREFIX}${initialTournament?.id || mode}`;
  const capacity = calculateTournamentCapacity(draft);
  const sixPairVariant = draft.format === INDIVIDUAL_MIX_FORMAT
    && isSixPairIndividualMixVariant(draft.settings.individualMixVariant);
  const sixPairExpectedGender: RosterEntry['gender'] = String(draft.settings.individualMixPairGender ?? 'W') === 'M' ? 'M' : 'W';
  const courtCount = draft.format === 'Groups + Olympic'
    ? Math.max(1, Number(draft.settings.goGroupCount ?? 1))
    : Math.max(1, Number(draft.settings.courts ?? 1));
  const seatsPerCourt = Math.max(1, Math.ceil(capacity / courtCount));
  const rosterGroupCount = sixPairVariant ? 6 : courtCount;
  const rosterSeatsPerGroup = sixPairVariant ? 2 : seatsPerCourt;
  const entries = slots.filter((entry): entry is RosterEntry => Boolean(entry));
  const assignedCount = slots.slice(0, capacity).filter(Boolean).length;
  const reserve = slots.slice(capacity).filter((entry): entry is RosterEntry => Boolean(entry));
  const publicationErrors = validatePublish();
  const canPublish = Object.keys(publicationErrors).length === 0;

  useEffect(() => {
    if (mode === 'duplicate') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { savedAt?: number; draft?: TournamentWizardDraft; slots?: Array<RosterEntry | null> };
      if (!saved.savedAt || Date.now() - saved.savedAt > 14 * 24 * 60 * 60 * 1000 || !saved.draft) return;
      setDraft({
        ...saved.draft,
        goEngineVersion: saved.draft.goEngineVersion === 2 ? 2 : 1,
      });
      setSlots(saved.slots ?? []);
      setDirty(true);
      setMessage('Восстановлена локальная несохранённая версия.');
    } catch { /* ignore invalid local backup */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const timeout = window.setTimeout(() => localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), draft, slots })), 400);
    return () => window.clearTimeout(timeout);
  }, [dirty, draft, slots, storageKey]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    if (errors.name || errors.date) firstErrorRef.current?.focus();
  }, [errors]);

  useEffect(() => {
    if (
      draft.format !== 'Groups + Olympic'
      || draft.goEngineVersion !== 1
      || !draft.name.trim()
      || !draft.date
    ) {
      setGoPreflight(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      void requestGoPreflight(true);
    }, 600);
    return () => window.clearTimeout(timeout);
  // The request reads the complete immutable render snapshot listed below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    capacity,
    draft.date,
    draft.division,
    draft.format,
    draft.goEngineVersion,
    draft.id,
    draft.name,
    draft.settings,
    slots,
  ]);

  useEffect(() => {
    const isServerDraft = !draft.id || draft.status === 'draft';
    if (
      draft.format !== 'Groups + Olympic'
      || !dirty
      || !isServerDraft
      || saving
      || !draft.name.trim()
      || !draft.date
    ) return;
    const timeout = window.setTimeout(() => {
      void runGoDraftAutosave();
    }, 1500);
    return () => window.clearTimeout(timeout);
  // Autosave deliberately follows the complete draft/roster snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, saving, slots]);

  function updateDraft(patch: Partial<TournamentWizardDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      return { ...next, capacity: calculateTournamentCapacity(next) };
    });
    setDirty(true);
    setMessage('');
    if (draft.format === 'Groups + Olympic' || patch.format === 'Groups + Olympic') setGoAutosaveState('idle');
  }

  function updateSettings(patch: Partial<WizardSettings>) {
    setDraft((current) => {
      const settings = current.format === 'King of the Court'
        ? alignKotcRoundsToPairs(current.settings, patch) as WizardSettings
        : { ...current.settings, ...patch };
      const next = { ...current, settings };
      return { ...next, capacity: calculateTournamentCapacity(next) };
    });
    setDirty(true);
    if (draft.format === 'Groups + Olympic') setGoAutosaveState('idle');
  }

  function chooseFormat(key: string) {
    const patch = patchForFormat(key);
    const goEngineVersion = patch.format === 'Groups + Olympic' ? draft.goEngineVersion : 1;
    const next = { ...draft, ...patch, goEngineVersion } as TournamentWizardDraft;
    updateDraft({ ...patch, goEngineVersion, capacity: calculateTournamentCapacity(next) });
  }

  function validateBase(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = 'Укажите название турнира.';
    if (!draft.date) next.date = 'Укажите дату турнира.';
    return next;
  }

  function validatePublish(): Record<string, string> {
    const next = validateBase();
    if (!draft.time) next.time = 'Укажите время.';
    if (!draft.division) next.division = 'Выберите дивизион.';
    if (!draft.level) next.level = 'Выберите уровень.';
    if (['Thai', 'King of the Court', 'Groups + Olympic', INDIVIDUAL_MIX_FORMAT].includes(draft.format) && assignedCount !== capacity) {
      next.roster = `Для публикации нужно распределить ${capacity} игроков. Сейчас: ${assignedCount}.`;
    }
    if (draft.format === 'Thai' && assignedCount === capacity) {
      const thaiVariant = normalizeTournamentWizardThaiVariant(draft.settings.thaiVariant);
      const thaiPlayersPerCourt = Math.max(2, Number(draft.settings.playersPerCourt ?? 8));
      const wrongSlot = slots.slice(0, capacity).findIndex((entry, index) => (
        entry && getTournamentWizardThaiSlotGender(thaiVariant, index, thaiPlayersPerCourt) !== entry.gender
      ));
      if (wrongSlot >= 0) {
        const expected = getTournamentWizardThaiSlotGender(thaiVariant, wrongSlot, thaiPlayersPerCourt);
        next.roster = `Thai: место ${wrongSlot + 1} ожидает ${expected === 'W' ? 'женщину' : 'мужчину'}.`;
      }
    }
    if (draft.format === INDIVIDUAL_MIX_FORMAT && sixPairVariant && assignedCount === capacity) {
      const expectedGender = String(draft.settings.individualMixPairGender ?? 'W') === 'M' ? 'M' : 'W';
      const expectedDivision = expectedGender === 'W' ? 'Женский' : 'Мужской';
      const wrongGender = slots.slice(0, capacity).filter((entry) => entry && entry.gender !== expectedGender).length;
      if (draft.division !== expectedDivision) {
        next.division = `Для пар ${expectedGender}/${expectedGender} выберите дивизион «${expectedDivision}».`;
      }
      if (wrongGender) {
        next.roster = `Для этого варианта нужны 12 ${expectedGender === 'W' ? 'женщин' : 'мужчин'}. Игроков другого пола: ${wrongGender}.`;
      } else {
        const pairs = Array.from({ length: 6 }, (_, pairIndex) => slots.slice(pairIndex * 2, pairIndex * 2 + 2));
        const invalidPair = pairs.findIndex((pair) => pair[0]?.playerLevel !== 'hard' || pair[1]?.playerLevel === 'hard');
        if (invalidPair >= 0) next.roster = `Пара ${invalidPair + 1}: слева должен быть Джедай, справа — Падаван.`;
      }
    } else if (draft.format === INDIVIDUAL_MIX_FORMAT && assignedCount === capacity) {
      const expectedPerGender = capacity / 2;
      const men = slots.slice(0, capacity).filter((entry) => entry?.gender === 'M').length;
      const women = slots.slice(0, capacity).filter((entry) => entry?.gender === 'W').length;
      if (men !== expectedPerGender || women !== expectedPerGender) {
        next.roster = `Для личного микста нужно поровну мужчин и женщин: ${expectedPerGender} + ${expectedPerGender}. Сейчас: ${men} + ${women}.`;
      } else {
        for (let court = 0; court < courtCount; court += 1) {
          const courtRoster = slots.slice(court * seatsPerCourt, (court + 1) * seatsPerCourt);
          const courtMen = courtRoster.filter((entry) => entry?.gender === 'M').length;
          const courtWomen = courtRoster.filter((entry) => entry?.gender === 'W').length;
          if (courtMen !== seatsPerCourt / 2 || courtWomen !== seatsPerCourt / 2) {
            next.roster = `На каждом корте должно быть по ${seatsPerCourt / 2} мужчин и женщин. Проверьте корт ${court + 1}.`;
            break;
          }
        }
      }
    }
    return next;
  }

  function goNext() {
    const nextErrors = step === 0 ? validateBase() : {};
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const filteredPlayers = useMemo(() => {
    const assignedIds = new Set(slots.filter(Boolean).map((entry) => entry?.playerId));
    return initialPlayers.filter((player) => {
    if (assignedIds.has(player.id)) return false;
    if (sixPairVariant && player.gender !== sixPairExpectedGender) return false;
    if (gender !== 'all' && player.gender !== gender) return false;
    const playerLevel = normalizePlayerLevel(player.skillLevel);
    if (level !== 'all' && playerLevel !== level) return false;
    return player.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'));
    });
  }, [gender, initialPlayers, level, search, sixPairExpectedGender, sixPairVariant, slots]);

  function addPlayers(ids: string[]) {
    const byId = new Map(initialPlayers.map((player) => [player.id, player]));
    const next = [...slots];
    const rejected: string[] = [];
    const thaiVariant = normalizeTournamentWizardThaiVariant(draft.settings.thaiVariant);
    const thaiPlayersPerCourt = Math.max(2, Number(draft.settings.playersPerCourt ?? 8));
    ids.forEach((id) => {
      const player = byId.get(id);
      if (!player || next.some((entry) => entry?.playerId === id)) return;
      if (sixPairVariant && player.gender !== sixPairExpectedGender) return;
      if (draft.format === 'Thai') {
        const preferredThaiSlot = findFirstMatchingThaiSlot(
          next,
          capacity,
          thaiVariant,
          player.gender,
          thaiPlayersPerCourt,
        );
        if (preferredThaiSlot === -1) {
          rejected.push(player.name);
          return;
        }
        while (next.length <= preferredThaiSlot) next.push(null);
        next[preferredThaiSlot] = rosterEntry(player);
        return;
      }
      const empty = Array.from({ length: capacity }, (_, index) => index).find((index) => !next[index]);
      if (empty == null) next.push(rosterEntry(player)); else next[empty] = rosterEntry(player);
    });
    setSlots(next);
    setSelectedPool(new Set());
    setSearch('');
    setDirty(true);
    if (draft.format === 'Groups + Olympic') setGoAutosaveState('idle');
    if (rejected.length) {
      setMessage(`Нет подходящих свободных мест для: ${rejected.join(', ')}.`);
    }
  }

  function importTelegramRoster() {
    const result = matchTelegramRosterText(telegramRosterText, initialPlayers);
    addPlayers(result.matchedIds);
    const details = [
      `Найдено: ${result.matchedIds.length}`,
      result.unmatched.length ? `не найдены: ${result.unmatched.join(', ')}` : '',
      result.ambiguous.length ? `нужно уточнить: ${result.ambiguous.join(', ')}` : '',
    ].filter(Boolean);
    setTelegramImportMessage(details.join(' · '));
  }

  function removeSlot(index: number) {
    setSlots((current) => { const next = [...current]; next[index] = null; return next; });
    setSelectedSlot(null);
    setDirty(true);
  }

  function swapSlots(from: number, to: number) {
    setSlots((current) => { const next = [...current]; [next[from], next[to]] = [next[to] ?? null, next[from] ?? null]; return next; });
    setSelectedSlot(null);
    setDirty(true);
  }

  function activateSlot(index: number) {
    if (selectedSlot == null) setSelectedSlot(index);
    else if (selectedSlot === index) setSelectedSlot(null);
    else swapSlots(selectedSlot, index);
  }

  function clearCourt(court: number) {
    if (confirmClearCourt !== court) { setConfirmClearCourt(court); return; }
    const start = court * rosterSeatsPerGroup;
    setSlots((current) => current.map((entry, index) => index >= start && index < start + rosterSeatsPerGroup ? null : entry));
    setConfirmClearCourt(null);
    setDirty(true);
  }

  function autoDistribute() {
    if (sixPairVariant) {
      const expectedGender = String(draft.settings.individualMixPairGender ?? 'W') === 'M' ? 'M' : 'W';
      const eligible = entries.filter((entry) => entry.gender === expectedGender);
      const jedi = eligible.filter((entry) => entry.playerLevel === 'hard').sort((a, b) => a.playerName.localeCompare(b.playerName, 'ru'));
      const padawans = eligible.filter((entry) => entry.playerLevel !== 'hard').sort((a, b) => a.playerName.localeCompare(b.playerName, 'ru'));
      const next: Array<RosterEntry | null> = Array.from({ length: capacity }, (_, index) => (
        index % 2 === 0 ? jedi[Math.floor(index / 2)] ?? null : padawans[Math.floor(index / 2)] ?? null
      ));
      next.push(...entries.filter((entry) => entry.gender !== expectedGender), ...jedi.slice(6), ...padawans.slice(6));
      setSlots(next);
      setDirty(true);
      setMessage(jedi.length === 6 && padawans.length === 6
        ? 'Сформировано 6 пар «Джедай + Падаван». Пары можно переставить вручную.'
        : `Для автосборки нужно 6 Джедаев и 6 Падаванов. Сейчас: ${jedi.length} + ${padawans.length}.`);
      return;
    }
    if (draft.format === INDIVIDUAL_MIX_FORMAT) {
      const men = entries.filter((entry) => entry.gender === 'M').sort((a, b) => a.playerLevel.localeCompare(b.playerLevel) || a.playerName.localeCompare(b.playerName, 'ru'));
      const women = entries.filter((entry) => entry.gender === 'W').sort((a, b) => a.playerLevel.localeCompare(b.playerLevel) || a.playerName.localeCompare(b.playerName, 'ru'));
      const perGender = seatsPerCourt / 2;
      const next: Array<RosterEntry | null> = Array.from({ length: capacity }, () => null);
      for (let court = 0; court < courtCount; court += 1) {
        for (let index = 0; index < perGender; index += 1) {
          next[court * seatsPerCourt + index] = men[court * perGender + index] ?? null;
          next[court * seatsPerCourt + perGender + index] = women[court * perGender + index] ?? null;
        }
      }
      next.push(...men.slice(capacity / 2), ...women.slice(capacity / 2));
      setSlots(next);
      setDirty(true);
      setMessage('Мужчины и женщины поровну распределены по кортам.');
      return;
    }
    if (draft.format === 'Thai') {
      const variant = normalizeTournamentWizardThaiVariant(draft.settings.thaiVariant);
      const thaiPlayersPerCourt = Math.max(2, Number(draft.settings.playersPerCourt ?? 8));
      const next: Array<RosterEntry | null> = Array.from({ length: capacity }, () => null);
      const reserveEntries: RosterEntry[] = [];
      entries.forEach((entry) => {
        const target = findFirstMatchingThaiSlot(
          next,
          capacity,
          variant,
          entry.gender,
          thaiPlayersPerCourt,
        );
        if (target === -1) reserveEntries.push(entry);
        else next[target] = entry;
      });
      next.push(...reserveEntries);
      setSlots(next);
      setDirty(true);
      setMessage(reserveEntries.length
        ? `Не удалось распределить по полу: ${reserveEntries.map((entry) => entry.playerName).join(', ')}.`
        : 'Игроки распределены по гендерным местам каждого Thai-корта.');
      return;
    }
    const ordered = [...entries].sort((a, b) => a.playerLevel.localeCompare(b.playerLevel) || a.gender.localeCompare(b.gender) || a.playerName.localeCompare(b.playerName, 'ru'));
    const next: Array<RosterEntry | null> = Array.from({ length: capacity }, () => null);
    ordered.slice(0, capacity).forEach((entry, index) => {
      const court = index % courtCount;
      const row = Math.floor(index / courtCount);
      next[court * seatsPerCourt + row] = entry;
    });
    next.push(...ordered.slice(capacity));
    setSlots(next);
    setDirty(true);
    setMessage('Игроки равномерно распределены по кортам.');
  }

  function buildTournamentPayload(status: string, reason: string) {
    const settings = draft.format === 'King of the Court'
      ? alignKotcRoundsToPairs(draft.settings) as WizardSettings
      : draft.format === 'Thai'
        ? { ...draft.settings, thaiVariant: normalizeTournamentWizardThaiVariant(draft.settings.thaiVariant) }
        : draft.settings;
    return {
      ...draft,
      status,
      capacity,
      settings,
      participants: slots
        .map((entry, position) => entry ? {
          playerId: entry.playerId,
          position: position + 1,
          isWaitlist: position >= capacity,
        } : null)
        .filter(Boolean),
      reason,
    };
  }

  async function requestGoPreflight(silent = false): Promise<GoPreflightResult | null> {
    if (draft.format !== 'Groups + Olympic' || draft.goEngineVersion !== 1) return null;
    const requestId = goPreflightRequestRef.current + 1;
    goPreflightRequestRef.current = requestId;
    setGoPreflightLoading(true);
    try {
      const response = await fetch('/api/admin/tournaments/go-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id || undefined,
          format: draft.format,
          division: draft.division,
          settings: draft.settings,
          participants: slots
            .slice(0, capacity)
            .map((entry, position) => entry ? {
              playerId: entry.playerId,
              position: position + 1,
              isWaitlist: false,
            } : null)
            .filter(Boolean),
        }),
      });
      const data = await response.json().catch(() => null) as GoPreflightResult | { error?: unknown } | null;
      if (!response.ok || !data || !('canGoLive' in data)) {
        if (!silent && requestId === goPreflightRequestRef.current) {
          setMessage(data && 'error' in data ? String(data.error || 'Не удалось выполнить GO preflight.') : 'Не удалось выполнить GO preflight.');
        }
        return null;
      }
      if (requestId === goPreflightRequestRef.current) setGoPreflight(data);
      return data;
    } catch (error) {
      if (!silent && requestId === goPreflightRequestRef.current) setMessage(getErrorText(error));
      return null;
    } finally {
      if (requestId === goPreflightRequestRef.current) setGoPreflightLoading(false);
    }
  }

  async function runGoDraftAutosave(): Promise<void> {
    if (
      draft.format !== 'Groups + Olympic'
      || (draft.id && draft.status !== 'draft')
      || saving
      || goAutosaveBusyRef.current
      || !draft.name.trim()
      || !draft.date
    ) return;
    goAutosaveBusyRef.current = true;
    setGoAutosaveState('saving');
    setGoAutosaveError('');
    try {
      const response = await fetch('/api/admin/tournaments', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTournamentPayload('draft', 'Автосохранение черновика GO через мастер')),
      });
      const saved = await response.json().catch(() => ({})) as Partial<AdminTournament> & { error?: unknown };
      if (!response.ok) throw new Error(String(saved.error || 'Ошибка автосохранения'));
      if (!draft.id && saved.id) {
        setDraft((current) => ({ ...current, id: String(saved.id), status: 'draft' }));
      }
      setGoAutosaveState('saved');
      setGoAutosaveAt(new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    } catch (error) {
      setGoAutosaveState('error');
      setGoAutosaveError(getErrorText(error));
    } finally {
      goAutosaveBusyRef.current = false;
    }
  }

  async function save(publish: boolean) {
    if (goAutosaveBusyRef.current) {
      setMessage('Дождитесь завершения автосохранения черновика.');
      return;
    }
    const nextErrors = publish ? validatePublish() : validateBase();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setMessage('Исправьте отмеченные поля.'); return; }
    setSaving(true);
    setMessage('');
    try {
      const status = publish
        ? (['finished', 'cancelled'].includes(draft.status) ? draft.status : ['open', 'full'].includes(draft.status) ? draft.status : 'open')
        : (draft.id && draft.status !== 'draft' ? draft.status : 'draft');
      const payload = buildTournamentPayload(
        status,
        publish ? 'Публикация турнира через мастер' : 'Сохранение черновика через мастер',
      );
      const response = await fetch('/api/admin/tournaments', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(saved.error || 'Не удалось сохранить турнир'));
      const nextDraft = createDraft(saved as AdminTournament);
      setDraft(nextDraft);
      setDirty(false);
      localStorage.removeItem(storageKey);
      setMessage(publish ? 'Турнир опубликован.' : 'Черновик сохранён.');
      if (!draft.id && saved.id) router.replace(`/admin/tournaments/${saved.id}/edit`);
      if (publish) router.push(getTournamentLaunchHref(saved as AdminTournament) || '/admin/tournaments');
      router.refresh();
    } catch (error) {
      setMessage(getErrorText(error));
    } finally {
      setSaving(false);
    }
  }

  const formatOptions = [
    { key: 'Round Robin', title: 'Круговой', text: 'Каждая пара играет с каждой.' },
    {
      key: INDIVIDUAL_MIX_FORMAT,
      title: INDIVIDUAL_MIX_FORMAT_LABEL,
      badge: INDIVIDUAL_MIX_SERIES_LABEL,
      text: 'Стандартный личный микст или схема «6 пар · 2 корта» с тайским и обычным кортом.',
    },
    { key: 'King of the Court', title: 'KOTC', text: 'Ротационный формат «Король корта».' },
    { key: 'Thai', title: 'Тайский', text: 'Индивидуальный турнир с ротацией и турами.' },
    { key: 'go_olympic', title: 'Группы + олимпийская система', text: 'Групповой этап и только верхняя сетка HARD.' },
    { key: 'go_all', title: 'Группы + все места', text: 'Отдельные сетки HARD, MEDIUM и LITE.' },
  ];

  return (
    <form onSubmit={(event) => event.preventDefault()} className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/admin/tournaments" onClick={(e) => { if (dirty && !window.confirm('Выйти без сохранения изменений?')) e.preventDefault(); }} className="text-sm text-brand hover:underline">← К списку турниров</Link><h1 className="mt-2 font-heading text-4xl leading-none">{mode === 'edit' ? 'Редактировать турнир' : mode === 'duplicate' ? 'Дублировать турнир' : 'Новый турнир'}</h1></div>
        <span className="w-fit rounded-full border border-white/15 px-3 py-1 text-xs text-text-secondary">{getTournamentStatusLabel(draft.status)}</span>
      </div>

      <nav aria-label="Шаги создания турнира" className="grid grid-cols-2 gap-2 md:grid-cols-4">{STEPS.map((label, index) => <button key={label} type="button" onClick={() => { if (index <= step || !Object.keys(validateBase()).length) setStep(index); }} aria-current={step === index ? 'step' : undefined} className={`rounded-xl border px-3 py-3 text-left text-sm ${step === index ? 'border-brand bg-brand/15 text-brand' : index < step ? 'border-emerald-500/30 text-emerald-200' : 'border-white/15 text-text-secondary'}`}><span className="mr-2 font-mono">{index + 1}</span>{label}</button>)}</nav>
      <div className="sr-only" aria-live="polite">Шаг {step + 1}: {STEPS[step]}. {message}</div>
      {message ? <div className={`rounded-xl border px-4 py-3 text-sm ${Object.keys(errors).length ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/15 bg-white/5'}`}>{message}</div> : null}

      {step === 0 ? <section className="rounded-2xl border border-white/15 bg-white/5 p-5"><h2 className="font-heading text-2xl">Основная информация</h2><div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2 text-sm">Название <span className="text-brand">*</span><div className="mt-1 flex gap-2"><input ref={firstErrorRef} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} className={`${INPUT} mt-0`} /><button type="button" onClick={() => updateDraft({ name: `${getTournamentFormatLabel(draft)} · ${draft.division} · ${draft.date}` })} className="shrink-0 rounded-lg border border-brand/40 px-3 text-xs text-brand">Сформировать</button></div>{errors.name ? <span id="name-error" className="mt-1 block text-xs text-red-300">{errors.name}</span> : null}</label>
        <label className="text-sm">Дата <span className="text-brand">*</span><input aria-invalid={Boolean(errors.date)} type="date" value={draft.date} onChange={(e) => updateDraft({ date: e.target.value })} className={INPUT} />{errors.date ? <span className="mt-1 block text-xs text-red-300">{errors.date}</span> : null}</label>
        <label className="text-sm">Время<input type="time" value={draft.time} onChange={(e) => updateDraft({ time: e.target.value })} className={INPUT} /></label>
        <label className="text-sm">Место<input value={draft.location} onChange={(e) => updateDraft({ location: e.target.value })} className={INPUT} /></label>
        <label className="text-sm">Дивизион<select value={draft.division} onChange={(e) => updateDraft({ division: e.target.value })} className={INPUT}><option>Мужской</option><option>Женский</option><option>Микст</option></select></label>
        <label className="text-sm">Уровень<select value={draft.level} onChange={(e) => updateDraft({ level: e.target.value })} className={INPUT}><option value="hard">Продвинутый</option><option value="medium">Средний</option><option value="easy">Начальный</option></select></label>
      </div></section> : null}

      {step === 1 ? <section className="space-y-4"><div className="rounded-2xl border border-white/15 bg-white/5 p-5"><h2 className="font-heading text-2xl">Формат турнира</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{formatOptions.map((option) => <button key={option.key} type="button" aria-pressed={formatKey(draft) === option.key} onClick={() => chooseFormat(option.key)} className={`rounded-xl border p-4 text-left ${formatKey(draft) === option.key ? 'border-brand bg-brand/15' : 'border-white/15 hover:border-white/30'}`}><span className="flex flex-wrap items-start justify-between gap-2"><strong>{option.title}</strong>{option.badge ? <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand">{option.badge}</span> : null}</span><span className="mt-2 block text-xs leading-5 text-text-secondary">{option.text}</span></button>)}</div></div><FormatSettings
        draft={draft}
        updateDraft={updateDraft}
        updateSettings={updateSettings}
        goAutosaveState={goAutosaveState}
        goAutosaveAt={goAutosaveAt}
        goAutosaveError={goAutosaveError}
        goPreflight={goPreflight}
        goPreflightLoading={goPreflightLoading}
        onRequestGoPreflight={() => void requestGoPreflight()}
      /></section> : null}

      {step === 1 && draft.format === 'Round Robin' ? <RoundRobinWizardSettings settings={draft.settings} onChange={(patch) => updateDraft({ settings: { ...draft.settings, ...patch } })} /> : null}
      {step === 1 && draft.format === INDIVIDUAL_MIX_FORMAT ? <IndividualMixWizardSettings
        settings={draft.settings}
        onChange={updateSettings}
        onVariantChange={(variant) => {
          const hybrid = variant === INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID;
          setSelectedPool(new Set());
          setGender(hybrid ? 'W' : 'all');
          updateDraft({
            division: hybrid ? 'Женский' : 'Микст',
            settings: hybrid
              ? {
                  ...draft.settings,
                  individualMixVariant: variant,
                  individualMixPairGender: 'W',
                  individualMixPointLimit: 11,
                  individualMixPoolSize: 6,
                  courts: 2,
                  playersPerCourt: 6,
                  pairsPerCourt: 3,
                }
              : {
                  ...draft.settings,
                  individualMixVariant: variant,
                  individualMixPointLimit: 15,
                  individualMixPoolSize: 5,
                  courts: 2,
                  playersPerCourt: 10,
                  pairsPerCourt: 5,
                },
          });
        }}
        onPairGenderChange={(pairGender) => {
          setSelectedPool(new Set());
          setGender(pairGender);
          updateDraft({
            division: pairGender === 'W' ? 'Женский' : 'Мужской',
            settings: { ...draft.settings, individualMixPairGender: pairGender },
          });
        }}
      /> : null}
      {step === 2 ? <section className="space-y-4"><div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className="rounded-2xl border border-white/15 bg-white/5 p-4"><h2 className="font-heading text-2xl">Доступные игроки</h2>{sixPairVariant ? <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-400/[.06] p-3"><strong className="text-sm">Импорт списка из Telegram</strong><p className="mt-1 text-xs leading-5 text-text-secondary">Перетащите или вставьте сообщение со списком. Поиск идёт по имени и Telegram username; неоднозначные строки не добавляются автоматически.</p><textarea value={telegramRosterText} onChange={(event) => setTelegramRosterText(event.target.value)} onDrop={(event) => { const text = event.dataTransfer.getData('text/plain'); if (text) { event.preventDefault(); setTelegramRosterText(text); } }} rows={5} placeholder={'1. Фамилия Имя\n2. @username'} className={`${INPUT} resize-y`} /><button type="button" disabled={!telegramRosterText.trim()} onClick={importTelegramRoster} className="mt-2 min-h-11 w-full rounded-lg bg-sky-500 px-3 text-sm font-black text-white disabled:opacity-40">Найти и добавить игроков</button>{telegramImportMessage ? <p className="mt-2 text-xs leading-5 text-sky-100">{telegramImportMessage}</p> : null}</div> : null}<div className="mt-3 grid grid-cols-2 gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск игрока" className={`${INPUT} col-span-2 mt-0`} /><select value={sixPairVariant ? sixPairExpectedGender : gender} disabled={sixPairVariant} aria-label="Пол игроков" title={sixPairVariant ? `Для этой схемы доступны только ${sixPairExpectedGender === 'W' ? 'женщины' : 'мужчины'}.` : undefined} onChange={(e) => setGender(e.target.value as typeof gender)} className={`${INPUT} mt-0 disabled:cursor-not-allowed disabled:opacity-70`}><option value="all">Любой пол</option><option value="M">Мужчины</option><option value="W">Женщины</option></select><select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className={`${INPUT} mt-0`}><option value="all">Любой уровень</option><option value="hard">Джедаи</option><option value="medium">Падаваны · средний</option><option value="easy">Падаваны · начинающий</option></select></div>{sixPairVariant ? <p className="mt-2 text-xs text-text-secondary">Нужно ровно 6 Джедаев (продвинутый уровень) и 6 Падаванов (средний/начальный), все пола {sixPairExpectedGender}.</p> : null}<div className="mt-3 max-h-[32rem] space-y-1 overflow-y-auto">{filteredPlayers.map((player) => { const active = selectedPool.has(player.id); const skill = normalizePlayerLevel(player.skillLevel); return <button key={player.id} type="button" aria-pressed={active} onClick={() => setSelectedPool((current) => { const next = new Set(current); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/25'}`}><span className="font-medium">{player.name}</span><span className="block text-xs text-text-secondary">{player.gender === 'M' ? 'Мужчина' : 'Женщина'} · {sixPairVariant ? skill === 'hard' ? 'Джедай' : 'Падаван' : LEVEL_LABELS[skill]}</span></button>; })}{!filteredPlayers.length ? <p className="py-8 text-center text-sm text-text-secondary">Подходящих игроков нет.</p> : null}</div><button type="button" disabled={!selectedPool.size} onClick={() => addPlayers([...selectedPool])} className="mt-3 w-full rounded-lg bg-brand px-3 py-2 font-semibold text-surface disabled:opacity-40">Добавить выбранных ({selectedPool.size})</button></div><RosterBoard slots={slots} capacity={capacity} courts={rosterGroupCount} seatsPerCourt={rosterSeatsPerGroup} groupMode={sixPairVariant ? 'pairs' : 'courts'} selectedSlot={selectedSlot} confirmClearCourt={confirmClearCourt} onActivate={activateSlot} onRemove={removeSlot} onSwap={swapSlots} onClearCourt={clearCourt} onAuto={autoDistribute} /></div>{errors.roster ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errors.roster}</div> : null}</section> : null}

      {step === 3 ? <Review draft={draft} assignedCount={assignedCount} capacity={capacity} reserve={reserve.length} errors={publicationErrors} /> : null}

      <div className="admin-wizard-actions sticky bottom-3 z-20 flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-surface/95 p-3 shadow-2xl backdrop-blur"><button type="button" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))} className="min-h-11 rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Назад</button><div className="flex min-w-0 flex-1 justify-end gap-2"><button type="button" disabled={saving || goAutosaveState === 'saving'} title="Сохранить без публикации" onClick={() => void save(false)} className="min-h-11 rounded-lg border border-brand/50 px-3 py-2 text-sm font-semibold text-brand disabled:opacity-40">{saving || goAutosaveState === 'saving' ? 'Сохранение…' : 'Сохранить'}</button>{step < 3 ? <button type="button" onClick={goNext} className="min-h-11 rounded-lg bg-brand px-5 py-2 font-bold text-surface">Далее</button> : <button type="button" disabled={saving || !canPublish || goAutosaveState === 'saving' || ['finished', 'cancelled'].includes(draft.status)} title={!canPublish ? Object.values(publicationErrors)[0] : undefined} onClick={() => void save(true)} className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-surface disabled:cursor-not-allowed disabled:opacity-40">{['open', 'full'].includes(draft.status) ? 'Сохранить и открыть' : 'Опубликовать'}</button>}</div></div>
    </form>
  );
}

function NumberField({ label, value, min = 1, max = 99, onChange, title }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void; title?: string }) {
  return <label className="text-sm" title={title}>{label}<input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} className={INPUT} /></label>;
}

type FormatSettingsProps = {
  draft: TournamentWizardDraft;
  updateDraft: (patch: Partial<TournamentWizardDraft>) => void;
  updateSettings: (patch: Partial<WizardSettings>) => void;
  goAutosaveState: 'idle' | 'saving' | 'saved' | 'error';
  goAutosaveAt: string;
  goAutosaveError: string;
  goPreflight: GoPreflightResult | null;
  goPreflightLoading: boolean;
  onRequestGoPreflight: () => void;
};

function FormatSettings(props: FormatSettingsProps) {
  const { draft, updateDraft, updateSettings } = props;
  const settings = draft.settings;
  const kotc = draft.format === 'King of the Court';
  const thai = draft.format === 'Thai';

  if (draft.format === INDIVIDUAL_MIX_FORMAT || draft.format === 'Round Robin') return null;

  if (!kotc && !thai) {
    return <DeprecatedFormatSettings {...props} />;
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
      <h3 className="font-semibold">Основные параметры</h3>
      <p className="mt-2 text-xs text-text-secondary">
        Используется только актуальная серверная судейская панель. Старые совместимые режимы отключены.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Корты" value={Number(settings.courts ?? 2)} max={12} onChange={(value) => updateSettings({ courts: value })} />
        <NumberField
          label="Пар на корт"
          value={kotc ? Number(settings.kotcPpc ?? 3) : Number(settings.pairsPerCourt ?? 4)}
          min={kotc ? KOTC_ADMIN_MIN_PPC : 1}
          max={kotc ? KOTC_ADMIN_MAX_PPC : 8}
          onChange={(value) => updateSettings(kotc
            ? { kotcPpc: value, kotcRaundCount: value, pairsPerCourt: value, playersPerCourt: value * 2, kotcJudgeModule: 'next' }
            : { pairsPerCourt: value, playersPerCourt: value * 2, thaiJudgeModule: 'next' })}
        />
        {thai ? (
          <>
            <label className="text-sm">Вариант<select value={normalizeTournamentWizardThaiVariant(settings.thaiVariant)} onChange={(event) => updateSettings({ thaiVariant: event.target.value, thaiJudgeModule: 'next' })} className={INPUT}><option value="MF">Мужчины + женщины</option><option value="MM">Мужской</option><option value="WW">Женский</option></select></label>
            <NumberField label="Количество туров" value={Number(settings.tourCount ?? 2)} min={1} max={4} onChange={(value) => updateSettings({ tourCount: value, thaiJudgeModule: 'next' })} />
            <label className="text-sm">Состав первого раунда<select value={String(settings.thaiRosterMode ?? 'manual')} onChange={(event) => updateSettings({ thaiRosterMode: event.target.value as 'manual' | 'random', thaiJudgeModule: 'next' })} className={INPUT}><option value="manual">Вручную</option><option value="random">Случайная жеребьёвка</option></select></label>
            <NumberField label="Лимит очков" value={Number(settings.thaiPointLimit ?? 15)} min={5} max={99} onChange={(value) => updateSettings({ thaiPointLimit: value, thaiPointLimitR1: value, thaiPointLimitR2: value, thaiJudgeModule: 'next' })} />
          </>
        ) : (
          <>
            <div className="rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-sm">
              <span className="block text-text-secondary">Раундов на корт</span>
              <strong className="mt-1 block text-lg">{Number(settings.kotcPpc ?? 3)}</strong>
              <span className="block text-[11px] text-text-secondary">автоматически = пар на корт</span>
            </div>
            <NumberField label="Таймер раунда, мин" value={Number(settings.kotcRaundTimerMinutes ?? 10)} min={KOTC_ADMIN_MIN_TIMER} max={KOTC_ADMIN_MAX_TIMER} onChange={(value) => updateSettings({ kotcRaundTimerMinutes: value, kotcJudgeModule: 'next' })} />
            <label className="text-sm">Посев второго раунда<select value={String(settings.kotcR2SeedingMode ?? 'court_places')} onChange={(event) => updateSettings({ kotcR2SeedingMode: event.target.value, kotcJudgeModule: 'next' })} className={INPUT}><option value="court_places">По местам на кортах</option><option value="manual">Ручной</option></select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.kotcNextDemoEnabled)} onChange={(event) => updateSettings({ kotcNextDemoEnabled: event.target.checked, kotcJudgeModule: 'next' })} /> Демо-режим</label>
          </>
        )}
      </div>
      {kotc ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span>
                <strong className="block text-sm">Без заходов</strong>
                <span className="mt-1 block text-xs text-text-secondary">
                  {settings.kotcTakeoversMode === 'no_takeovers'
                    ? 'Таблица считается без учета заходов.'
                    : 'Заходы учитываются как дополнительный критерий.'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.kotcTakeoversMode === 'no_takeovers'}
                onChange={(event) => updateSettings({
                  kotcTakeoversMode: event.target.checked ? 'no_takeovers' : 'standard',
                })}
                className="size-5 shrink-0 accent-brand"
              />
            </label>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Таймеры KOTC</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumberField label="Корты, мин" value={Number(settings.timerCourts ?? 10)} min={2} max={25} onChange={(value) => updateSettings({ timerCourts: value })} />
              <NumberField label="Финалы, мин" value={Number(settings.timerFinals ?? 10)} min={2} max={25} onChange={(value) => updateSettings({ timerFinals: value })} />
            </div>
            <p className="mt-2 text-xs text-text-secondary">Диапазон: 2–25 минут. Эти значения используются KOTC-таймерами кортов и финалов.</p>
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(settings.kotcSelfScoringEnabled)}
              onChange={(event) => updateSettings({
                kotcSelfScoringEnabled: event.target.checked,
                kotcScoreVoiceEnabled: settings.kotcScoreVoiceEnabled !== false,
                kotcScoreHistoryVisible: settings.kotcScoreHistoryVisible !== false,
                kotcJudgeModule: 'next',
              })}
              className="mt-1 size-5 shrink-0 accent-emerald-400"
            />
            <span>
              <strong className="block text-sm">Самостоятельный ввод очков игроками</strong>
              <span className="mt-1 block text-xs leading-5 text-text-secondary">
                Дополнительный режим для «Кинг без переходов». Авторизованный игрок может добавить +1 только своей текущей паре.
              </span>
            </span>
          </label>
          {settings.kotcSelfScoringEnabled ? (
            <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.kotcScoreVoiceEnabled !== false}
                  onChange={(event) => updateSettings({ kotcScoreVoiceEnabled: event.target.checked })}
                  className="mt-0.5 size-5 shrink-0 accent-brand"
                />
                <span><strong className="block">Озвучивать очки</strong><span className="mt-1 block text-xs text-text-secondary">После подтверждения сервером: «Плюс один, всего …».</span></span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.kotcScoreHistoryVisible !== false}
                  onChange={(event) => updateSettings({ kotcScoreHistoryVisible: event.target.checked })}
                  className="mt-0.5 size-5 shrink-0 accent-brand"
                />
                <span><strong className="block">Показывать историю игрокам</strong><span className="mt-1 block text-xs text-text-secondary">Журнал свёрнут по умолчанию и открывается по запросу.</span></span>
              </label>
            </div>
          ) : null}
          <p className="mt-3 text-[11px] leading-5 text-text-secondary">
            Служебный аудит «кто, когда и сколько изменил» ведётся всегда и не отключается этой настройкой.
          </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IndividualMixWizardSettings({
  settings,
  onChange,
  onVariantChange,
  onPairGenderChange,
}: {
  settings: WizardSettings;
  onChange: (patch: Partial<WizardSettings>) => void;
  onVariantChange: (variant: 'standard' | 'six_pair_hybrid') => void;
  onPairGenderChange: (gender: 'M' | 'W') => void;
}) {
  const hybrid = isSixPairIndividualMixVariant(settings.individualMixVariant);
  const courts = Math.max(1, Math.min(4, Number(settings.courts ?? 2)));
  const poolSize = Math.max(4, Math.min(6, Number(settings.individualMixPoolSize ?? 5))) as 4 | 5 | 6;
  const divisions = ({ 1: 'HARD', 2: 'HARD + LIGHT', 3: 'HARD + MEDIUM + LIGHT', 4: 'HARD + ADV + MEDIUM + LIGHT' } as Record<number, string>)[courts];
  return <section className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
    <div>
      <span className="text-sm font-semibold">Вариант проведения</span>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <button type="button" aria-pressed={!hybrid} onClick={() => onVariantChange(INDIVIDUAL_MIX_VARIANT_STANDARD)} className={`min-h-24 rounded-xl border p-3 text-left ${!hybrid ? 'border-brand bg-brand/15' : 'border-white/15 bg-black/10'}`}>
          <strong className="block">Стандартный</strong>
          <span className="mt-1 block text-xs leading-5 text-text-secondary">Мужчины + женщины, от 1 до 4 кортов, личный зачёт и второй этап.</span>
        </button>
        <button type="button" aria-pressed={hybrid} onClick={() => onVariantChange(INDIVIDUAL_MIX_VARIANT_SIX_PAIR_HYBRID)} className={`min-h-24 rounded-xl border p-3 text-left ${hybrid ? 'border-brand bg-brand/15' : 'border-white/15 bg-black/10'}`}>
          <span className="flex flex-wrap items-center justify-between gap-2"><strong>6 пар · 2 корта</strong><span className="rounded-full border border-brand/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">Бездельники</span></span>
          <span className="mt-1 block text-xs leading-5 text-text-secondary">12 игроков одного пола: тайский корт + обычная игра фиксированных пар.</span>
        </button>
      </div>
      <p className="mt-2 text-xs text-text-secondary">В стандартном варианте особенности схемы «6 пар» полностью выключены.</p>
    </div>

    {hybrid ? <>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Бездельники · специальная схема</p><h3 className="mt-1 font-heading text-2xl">6 стартовых пар · 6 равных туров</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">В каждом туре четыре пары проходят тайскую дуэль на корте 1, а две пары играют обычную игру на корте 2. Все партии — до 11.</p></div>
        <div className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">12 игроков · 2 корта · 30 игр</div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/15 bg-black/10 p-3">
          <span className="text-sm font-semibold">Состав пар</span>
          <div className="mt-2 grid grid-cols-2 gap-2">{(['W', 'M'] as const).map((gender) => <button key={gender} type="button" aria-pressed={(settings.individualMixPairGender ?? 'W') === gender} onClick={() => onPairGenderChange(gender)} className={`min-h-12 rounded-xl border text-sm font-bold ${(settings.individualMixPairGender ?? 'W') === gender ? 'border-brand bg-brand/15 text-brand' : 'border-white/15'}`}>{gender === 'W' ? 'Ж/Ж' : 'М/М'}</button>)}</div>
        </div>
        <div className="rounded-xl border border-brand/35 bg-brand/10 p-3"><span className="text-xs font-bold uppercase tracking-wide text-brand">Единый счёт</span><strong className="mt-1 block text-xl">Все игры до 11</strong><span className="mt-1 block text-xs text-text-secondary">Для этой схемы лимит зафиксирован и применяется на обоих кортах.</span></div>
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3"><strong className="text-cyan-200">Корт 1 · тайский</strong><p className="mt-1 text-xs leading-5 text-text-secondary">4 пары: сначала своими составами, затем с обменом партнёрами.</p></div>
        <div className="rounded-xl border border-white/15 bg-black/10 p-3"><strong>Корт 2 · обычный</strong><p className="mt-1 text-xs leading-5 text-text-secondary">2 фиксированные пары играют одну полную игру пара на пару.</p></div>
      </div>
      <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-sm"><strong className="text-emerald-300">Баланс проверен</strong><p className="mt-1 text-xs leading-5 text-text-secondary">У каждой пары 4 тайских тура и 2 обычные игры. У каждого игрока 10 игр. Итоговое место считается по разнице мячей +/−, затем по победам и набранным очкам.</p></div>
    </> : <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Формат «{INDIVIDUAL_MIX_SERIES_LABEL}»</p><h3 className="mt-1 font-heading text-2xl">{INDIVIDUAL_MIX_FORMAT_LABEL} · ротация партнёров</h3><p className="mt-1 max-w-2xl text-sm text-text-secondary">Каждая дуэль состоит из двух игр: со своим партнёром и после обмена. Затем приложение считает личный зачёт и автоматически собирает пары второго этапа.</p></div>
      <div className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">{courts * poolSize * 2} игроков · {courts} {courts === 1 ? 'корт' : 'корта'}</div>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div><span className="text-sm font-semibold">Кортов</span><div className="mt-2 grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((count) => <button key={count} type="button" aria-pressed={courts === count} onClick={() => onChange({ courts: count })} className={`min-h-12 rounded-xl border text-lg font-bold ${courts === count ? 'border-brand bg-brand/15 text-brand' : 'border-white/15'}`}>{count}</button>)}</div></div>
      <div><span className="text-sm font-semibold">Мужчин + женщин на корт</span><div className="mt-2 grid grid-cols-3 gap-2">{([4, 5, 6] as const).map((count) => <button key={count} type="button" aria-pressed={poolSize === count} onClick={() => onChange({ individualMixPoolSize: count, playersPerCourt: count * 2, pairsPerCourt: count })} className={`min-h-12 rounded-xl border text-sm font-bold ${poolSize === count ? 'border-brand bg-brand/15 text-brand' : 'border-white/15'}`}>{count} + {count}</button>)}</div></div>
      <NumberField label="Лимит очков" value={Number(settings.individualMixPointLimit ?? 15)} min={5} max={30} onChange={(value) => onChange({ individualMixPointLimit: value })} />
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-sm"><strong className="text-emerald-300">Второй этап: {divisions}</strong><p className="mt-1 text-xs leading-5 text-text-secondary">Первый корт второго этапа — сильнейший дивизион. На 2 кортах это HARD и LIGHT.</p></div>
    </div>
    </>}
  </section>;
}

function DeprecatedFormatSettings({
  draft,
  updateDraft,
  updateSettings,
  goAutosaveState,
  goAutosaveAt,
  goAutosaveError,
  goPreflight,
  goPreflightLoading,
  onRequestGoPreflight,
}: FormatSettingsProps) {
  const settings = draft.settings;
  const go = draft.format === 'Groups + Olympic';
  const kotc = draft.format === 'King of the Court';
  const thai = draft.format === 'Thai';
  if (go) {
    const engineVersion = draft.goEngineVersion;
    const v2 = engineVersion === 2;
    const declaredTeams = Number(settings.goDeclaredTeamCount ?? 12);
    const goAutoLayout = buildGoAutoConfigPatchFromDeclared(declaredTeams, settings);
    const goAutoCounts = buildGoPlayoffSyncPatch(settings).goMixedTeamCounts ?? {};
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold">Группы и плей-офф</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-secondary">
              V2 работает параллельно старому GO и включается для турнира явно. Существующие турниры автоматически не мигрируют.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${v2 ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100' : 'border-white/15 bg-white/5 text-text-secondary'}`}>
            {v2 ? 'Tournament Engine V2' : 'Legacy GO'}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs" aria-live="polite">
          {goAutosaveState === 'saving' ? (
            <span className="text-amber-300">Черновик GO сохраняется на сервере…</span>
          ) : goAutosaveState === 'saved' ? (
            <span className="text-emerald-300">Черновик GO сохранён{goAutosaveAt ? ` в ${goAutosaveAt}` : ''}.</span>
          ) : goAutosaveState === 'error' ? (
            <span className="text-red-300">Ошибка автосохранения: {goAutosaveError || 'неизвестная ошибка'}</span>
          ) : (
            <span className="text-text-secondary">После изменения GO серверный черновик сохраняется автоматически.</span>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm sm:col-span-2">
            Движок
            <select
              value={String(engineVersion)}
              onChange={(event) => {
                const nextVersion = event.target.value === '2' ? 2 : 1;
                updateDraft({
                  goEngineVersion: nextVersion,
                  settings: {
                    ...settings,
                    ...(nextVersion === 2
                      ? { goCourts: Math.min(6, Math.max(1, Number(settings.goCourts ?? 4))), goSeedingMode: 'serpentine' }
                      : { goV2PublicEnabled: false }),
                  },
                });
              }}
              className={INPUT}
            >
              <option value="1">Legacy GO — текущие турниры</option>
              <option value="2">V2 — группы, SE/DE, версии и impact preview</option>
            </select>
          </label>

          {v2 ? (
            <>
              <NumberField
                label="Команд"
                value={declaredTeams}
                min={2}
                max={48}
                onChange={(value) => updateSettings({ goDeclaredTeamCount: value })}
              />
              <NumberField
                label="Кортов"
                value={Math.min(6, Number(settings.goCourts ?? 4))}
                min={1}
                max={6}
                onChange={(value) => updateSettings({ goCourts: value })}
              />
            </>
          ) : (
            <>
              <NumberField
                label="Команд заявилось"
                value={declaredTeams}
                min={GO_ADMIN_MIN_DECLARED_TEAMS}
                max={GO_ADMIN_MAX_DECLARED_TEAMS}
                onChange={(value) => updateSettings(buildGoAutoConfigPatchFromDeclared(value, settings))}
              />
              <NumberField
                label="Группы"
                value={Number(settings.goGroupCount ?? 3)}
                min={GO_ADMIN_MIN_GROUPS}
                max={GO_ADMIN_MAX_GROUPS}
                onChange={(value) => {
                  const structural = { ...settings, goGroupCount: value };
                  updateSettings({ goGroupCount: value, ...buildGoPlayoffSyncPatch(structural) });
                }}
              />
              <NumberField
                label="Пар в группе"
                value={Number(settings.goTeamsPerGroup ?? 4)}
                min={3}
                max={4}
                onChange={(value) => {
                  const formula = getGoGroupFormulaPatch(value);
                  updateSettings({ ...formula, ...buildGoPlayoffSyncPatch({ ...settings, ...formula }) });
                }}
              />
              <NumberField label="Кортов" value={Number(settings.goCourts ?? 3)} max={7} onChange={(value) => updateSettings({ goCourts: value })} />
            </>
          )}
        </div>

        {!v2 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-text-secondary">
              Автосхема: <strong className="text-brand">{goAutoLayout.goGroupCount} групп × {goAutoLayout.goTeamsPerGroup} команды</strong>.
              Ручное изменение групп не меняет заявленное число команд.
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-text-secondary">
              Автовыходы: {Object.entries(goAutoCounts).map(([league, count]) => `${league.toUpperCase()} ${count}`).join(' · ')}.
            </div>
          </div>
        ) : null}

        {v2 ? (
          <div className="mt-5 space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-4 text-sm text-emerald-50">
            <strong>Настройка продолжается после сохранения.</strong>
            <p className="mt-1 text-xs leading-5 text-emerald-100/75">
              В рабочей области V2 можно выбрать группы 3/4 либо standalone bracket, правила партий, Hard/Medium/Light, single или true double elimination, окна кортов и судейство.
            </p>
            {Number(settings.goDeclaredTeamCount ?? 12) === 5 ? (
              <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">
                Пять команд нельзя разделить на группы по 3/4 — рабочая область V2 автоматически предложит standalone SE/DE.
              </p>
            ) : null}
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/10 px-3 text-xs">
              <span>
                Разрешить публичную публикацию V2
                <span className="mt-0.5 block text-[10px] text-emerald-100/70">
                  Это защитный переключатель, а не публикация. После проверки расписания директор отдельно выполняет preview и commit в рабочей области V2.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.goV2PublicEnabled === true}
                onChange={(event) => updateSettings({ goV2PublicEnabled: event.target.checked })}
                className="h-4 w-4 shrink-0 accent-brand"
              />
            </label>
          </div>
        ) : (
          <details className="mt-5 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer font-semibold">Расширенные настройки legacy GO</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm">Формат матча<select value={String(settings.goMatchFormat ?? 'single15')} onChange={(event) => updateSettings({ goMatchFormat: event.target.value })} className={INPUT}><option value="single15">Один сет до 15</option><option value="single21">Один сет до 21</option><option value="bo3">До двух побед</option></select></label>
              <label className="text-sm">Посев<select value={String(settings.goSeedingMode ?? 'fixedPairs')} onChange={(event) => updateSettings({ goSeedingMode: event.target.value })} className={INPUT}><option value="fixedPairs">Фиксированные пары</option><option value="serpentine">Змейка</option><option value="random">Случайный</option><option value="manual">Ручной</option></select></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.goBronzeMatchEnabled)} onChange={(event) => updateSettings({ goBronzeMatchEnabled: event.target.checked })} /> Матч за третье место</label>
            </div>
          </details>
        )}

        {!v2 ? (
          <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Готовность к LIVE</h4>
                <p className="mt-1 text-xs text-text-secondary">Проверяются структура, полный состав и пары по дивизиону.</p>
              </div>
              <button
                type="button"
                onClick={onRequestGoPreflight}
                disabled={goPreflightLoading}
                className="min-h-10 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:border-brand disabled:opacity-50"
              >
                {goPreflightLoading ? 'Проверяем…' : 'Обновить'}
              </button>
            </div>
            {goPreflight ? (
              <div className="mt-3 space-y-2">
                {goPreflight.checks.map((check) => (
                  <div key={check.key} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs">
                    <span className={check.status === 'error' ? 'text-red-300' : check.status === 'warning' ? 'text-amber-300' : 'text-emerald-300'}>
                      {check.status === 'error' ? 'CRITICAL' : check.status === 'warning' ? 'WARNING' : 'OK'}
                    </span>
                    <span className="text-text-secondary"> · {check.label}: </span>
                    <span>{check.detail}</span>
                  </div>
                ))}
                <div className={`rounded-lg border px-3 py-2 text-xs ${goPreflight.canGoLive ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-red-500/30 bg-red-500/5 text-red-300'}`}>
                  {goPreflight.canGoLive
                    ? 'Переход в LIVE доступен: критических ошибок нет.'
                    : `Переход в LIVE заблокирован: ${goPreflight.errors.length} критических ошибок.`}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-text-secondary">Preflight будет рассчитан автоматически после изменений.</p>
            )}
          </div>
        ) : null}
      </div>
    );
  }
  return <div className="rounded-2xl border border-white/15 bg-white/5 p-5"><h3 className="font-semibold">Основные параметры</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{go ? <><NumberField label="Группы" value={Number(settings.goGroupCount ?? 3)} max={8} onChange={(value) => updateSettings({ goGroupCount: value, goDeclaredTeamCount: value * Number(settings.goTeamsPerGroup ?? 4) })} /><NumberField label="Пар в группе" value={Number(settings.goTeamsPerGroup ?? 4)} min={3} max={4} onChange={(value) => updateSettings({ goTeamsPerGroup: value, goDeclaredTeamCount: value * Number(settings.goGroupCount ?? 3) })} /><NumberField label="Корты" value={Number(settings.goCourts ?? 3)} max={12} onChange={(value) => updateSettings({ goCourts: value })} /></> : <><NumberField label="Корты" value={Number(settings.courts ?? 2)} max={12} onChange={(value) => updateSettings({ courts: value })} /><NumberField label="Пар на корт" value={kotc ? Number(settings.kotcPpc ?? 3) : Number(settings.pairsPerCourt ?? 2)} min={kotc ? 2 : 1} max={8} onChange={(value) => updateSettings(kotc ? { kotcPpc: value, pairsPerCourt: value, playersPerCourt: value * 2 } : { pairsPerCourt: value, playersPerCourt: value * 2 })} /></>}{thai ? <><label className="text-sm">Вариант<select value={String(settings.thaiVariant ?? 'MF')} onChange={(e) => updateSettings({ thaiVariant: e.target.value })} className={INPUT}><option value="MF">Мужчины + женщины</option><option value="M">Мужской</option><option value="W">Женский</option></select></label><NumberField label="Количество туров" value={Number(settings.tourCount ?? 2)} min={1} max={4} onChange={(value) => updateSettings({ tourCount: value })} /><label className="text-sm">Состав первого раунда<select value={String(settings.thaiRosterMode ?? 'manual')} onChange={(e) => updateSettings({ thaiRosterMode: e.target.value as 'manual' | 'random' })} className={INPUT}><option value="manual">Вручную</option><option value="random">Случайная жеребьёвка</option></select></label></> : null}</div><details className="mt-5 rounded-xl border border-white/10 p-4"><summary className="cursor-pointer font-semibold">Расширенные настройки</summary><p className="mt-2 text-xs text-text-secondary">Актуальный модуль использует серверное live-состояние. Совместимый — прежнюю судейскую механику.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{kotc ? <><label className="text-sm">Модуль судей<select value={String(settings.kotcJudgeModule ?? 'next')} onChange={(e) => updateSettings({ kotcJudgeModule: e.target.value as 'next' | 'legacy' })} className={INPUT}><option value="next">Актуальный</option><option value="legacy">Совместимый</option></select></label><NumberField label="Раунды" value={Number(settings.kotcRaundCount ?? 3)} min={2} max={8} onChange={(value) => updateSettings({ kotcRaundCount: value })} /><NumberField label="Таймер раунда, мин" value={Number(settings.kotcRaundTimerMinutes ?? 10)} min={3} max={60} onChange={(value) => updateSettings({ kotcRaundTimerMinutes: value })} /><label className="text-sm">Посев второго раунда<select value={String(settings.kotcR2SeedingMode ?? 'court_places')} onChange={(e) => updateSettings({ kotcR2SeedingMode: e.target.value })} className={INPUT}><option value="court_places">По местам на кортах</option><option value="manual">Ручной</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.kotcNextDemoEnabled)} onChange={(e) => updateSettings({ kotcNextDemoEnabled: e.target.checked })} /> Демо-режим</label></> : null}{thai ? <><label className="text-sm">Модуль судей<select value={String(settings.thaiJudgeModule ?? 'next')} onChange={(e) => updateSettings({ thaiJudgeModule: e.target.value as 'next' | 'legacy' })} className={INPUT}><option value="next">Актуальный</option><option value="legacy">Совместимый</option></select></label><NumberField label="Лимит очков" value={Number(settings.thaiPointLimit ?? 15)} min={5} max={99} onChange={(value) => updateSettings({ thaiPointLimit: value, thaiPointLimitR1: value, thaiPointLimitR2: value })} /></> : null}{go ? <><label className="text-sm">Формат матча<select value={String(settings.goMatchFormat ?? 'single15')} onChange={(e) => updateSettings({ goMatchFormat: e.target.value })} className={INPUT}><option value="single15">Один сет до 15</option><option value="single21">Один сет до 21</option><option value="bo3">До двух побед</option></select></label><label className="text-sm">Посев<select value={String(settings.goSeedingMode ?? 'fixedPairs')} onChange={(e) => updateSettings({ goSeedingMode: e.target.value })} className={INPUT}><option value="fixedPairs">Фиксированные пары</option><option value="serpentine">Змейка</option><option value="random">Случайный</option><option value="manual">Ручной</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(settings.goBronzeMatchEnabled)} onChange={(e) => updateSettings({ goBronzeMatchEnabled: e.target.checked })} /> Матч за третье место</label></> : null}<label className="sm:col-span-2 lg:col-span-4 text-sm" title="Необязательная ручная схема начального посева">Черновик посева<textarea value={String(settings.draftSeed ?? '')} onChange={(e) => updateSettings({ draftSeed: e.target.value })} rows={3} className={INPUT} placeholder="Необязательно" /></label></div></details></div>;
}

function RoundRobinWizardSettings({ settings, onChange }: { settings: WizardSettings; onChange: (patch: Partial<WizardSettings>) => void }) {
  const courts = Math.max(1, Number(settings.rrCourts ?? 2));
  const teams = Math.max(6, Number(settings.rrTeamCount ?? 6));
  const groups = Math.max(2, Number(settings.rrGroupCount ?? 2));
  const formatOptions = [
    ['single11', '1 сет до 11'], ['single15', '1 сет до 15'], ['single21', '1 сет до 21'],
    ['bo3_21_15', 'BO3 · 21/21/15'], ['timed', 'По времени'],
  ];
  return <section className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Round Robin Next</p><h3 className="mt-1 font-heading text-2xl">Фиксированные команды</h3><p className="mt-1 text-sm text-text-secondary">Состав команды всегда 2 игрока. Пары подтверждаются перед запуском.</p></div><div className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold">{teams} команд · {teams * 2} игроков</div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div><span className="text-sm font-semibold">Кортов</span><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4].map((count) => <button key={count} type="button" onClick={() => onChange({ rrCourts: count, courts: count })} className={`min-h-12 min-w-14 rounded-xl border text-lg font-bold ${courts === count ? 'border-brand bg-brand/15 text-brand' : 'border-white/15'}`}>{count}</button>)}<input aria-label="Больше четырёх кортов" type="number" min={5} max={16} value={courts > 4 ? courts : 5} onFocus={() => onChange({ rrCourts: 5, courts: 5 })} onChange={(event) => { const value = Math.max(5, Number(event.target.value) || 5); onChange({ rrCourts: value, courts: value }); }} className="min-h-12 w-24 rounded-xl border border-white/15 bg-surface px-3" /></div></div>
      <label className="text-sm font-semibold">Команд<input type="number" min={6} max={32} step={1} value={teams} onChange={(event) => onChange({ rrTeamCount: Math.max(6, Number(event.target.value) || 6) })} className={INPUT} /></label>
      <label className="text-sm font-semibold">Сценарий плей-офф<select value={settings.rrPlayoffMode ?? 'championship'} onChange={(event) => { const value = event.target.value === 'all_levels' ? 'all_levels' : 'championship'; onChange({ rrPlayoffMode: value, ...(value === 'championship' ? { rrGroupCount: 2 } : {}) }); }} className={INPUT}><option value="championship">Чемпионский · 2 группы</option><option value="all_levels">Все уровни · HARD/MEDIUM/LITE</option></select></label>
      <label className="text-sm font-semibold">Групп<select value={groups} disabled={settings.rrPlayoffMode !== 'all_levels'} onChange={(event) => onChange({ rrGroupCount: Number(event.target.value) })} className={INPUT}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
      <label className="text-sm font-semibold">Матчи групп<select value={settings.rrGroupMatchFormat ?? 'single15'} onChange={(event) => onChange({ rrGroupMatchFormat: event.target.value })} className={INPUT}>{formatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold">Матчи плей-офф<select value={settings.rrPlayoffMatchFormat ?? 'single15'} onChange={(event) => onChange({ rrPlayoffMatchFormat: event.target.value })} className={INPUT}>{formatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold">Посев<select value={settings.rrSeedingMode ?? 'serpentine'} onChange={(event) => onChange({ rrSeedingMode: event.target.value as WizardSettings['rrSeedingMode'] })} className={INPUT}><option value="serpentine">Змейка по рейтингу</option><option value="random">Случайно</option><option value="manual">Вручную перед запуском</option></select></label>
      {(settings.rrGroupMatchFormat === 'timed' || settings.rrPlayoffMatchFormat === 'timed') ? <label className="text-sm font-semibold">Минут на матч<input type="number" min={1} max={180} value={Number(settings.rrTimedMinutes ?? 15)} onChange={(event) => onChange({ rrTimedMinutes: Math.max(1, Number(event.target.value) || 1) })} className={INPUT} /></label> : null}
    </div>
  </section>;
}

function RosterBoard({ slots, capacity, courts, seatsPerCourt, groupMode = 'courts', selectedSlot, confirmClearCourt, onActivate, onRemove, onSwap, onClearCourt, onAuto }: { slots: Array<RosterEntry | null>; capacity: number; courts: number; seatsPerCourt: number; groupMode?: 'courts' | 'pairs'; selectedSlot: number | null; confirmClearCourt: number | null; onActivate: (index: number) => void; onRemove: (index: number) => void; onSwap: (from: number, to: number) => void; onClearCourt: (court: number) => void; onAuto: () => void }) {
  const filled = slots.slice(0, capacity).filter(Boolean).length;
  const reserve = slots.slice(capacity).filter(Boolean);
  const pairs = groupMode === 'pairs';
  return <div className="rounded-2xl border border-white/15 bg-white/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-heading text-2xl">{pairs ? 'Стартовые пары' : 'Распределение по кортам'}</h2><p className="text-xs text-text-secondary">Добавлено {filled} из {capacity} · резерв {reserve.length}</p></div><button type="button" disabled={!filled} onClick={onAuto} className="min-h-11 rounded-lg border border-brand/50 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40">{pairs ? 'Собрать пары автоматически' : 'Распределить автоматически'}</button></div>{pairs ? <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[10px] font-black uppercase tracking-[.15em]"><span className="rounded-lg bg-amber-400/10 px-2 py-2 text-amber-200">Джедаи · профи</span><span className="rounded-lg bg-sky-400/10 px-2 py-2 text-sky-200">Падаваны · любители</span></div> : null}<div className="mt-3 grid gap-3 xl:grid-cols-2">{Array.from({ length: courts }, (_, court) => { const start = court * seatsPerCourt; const courtEntries = Array.from({ length: seatsPerCourt }, (_, offset) => slots[start + offset] ?? null); const courtFilled = courtEntries.filter(Boolean).length; return <details key={court} open={pairs || undefined} className="group rounded-xl border border-white/10 bg-black/10"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><h3 className="font-semibold">{pairs ? 'Пара' : 'Корт'} {court + 1}</h3><p className="mt-1 truncate text-xs text-text-secondary">{courtFilled ? courtEntries.filter(Boolean).map((entry) => entry?.playerName).join(' + ') : 'Состав пока не назначен'}</p></div><span className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-xs">{courtFilled} / {seatsPerCourt}</span></summary><div className="border-t border-white/10 p-3"><div className="mb-3 flex justify-end"><button type="button" onClick={() => onClearCourt(court)} disabled={!courtFilled} className="min-h-10 text-xs text-red-300 disabled:opacity-40">{confirmClearCourt === court ? 'Нажмите ещё раз для очистки' : pairs ? 'Очистить пару' : 'Очистить корт'}</button></div><div className={pairs ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>{courtEntries.map((entry, offset) => { const index = start + offset; const role = offset === 0 ? 'Джедай' : 'Падаван'; const wrongRole = pairs && entry && (offset === 0 ? entry.playerLevel !== 'hard' : entry.playerLevel === 'hard'); return <div key={index} draggable={Boolean(entry)} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) onSwap(from, index); }} className={`flex min-h-12 items-stretch rounded-lg border ${wrongRole ? 'border-red-400/50 bg-red-400/10' : selectedSlot === index ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5'}`}><button type="button" disabled={!entry} onClick={() => onActivate(index)} className="min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-60"><span className="block text-[10px] uppercase tracking-wider text-text-secondary">{pairs ? role : `Место ${offset + 1}`}</span><span className="block truncate text-sm">{entry ? entry.playerName : 'Свободно'}</span>{wrongRole ? <span className="block text-[10px] text-red-200">Неверная колонка</span> : null}</button>{entry ? <button type="button" aria-label={`Убрать ${entry.playerName}`} onClick={() => onRemove(index)} className="min-w-10 border-l border-white/10 px-2 text-xs text-red-300">×</button> : null}</div>; })}</div></div></details>; })}</div>{selectedSlot != null ? <p className="mt-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-brand">Выбрано место. Откройте нужную {pairs ? 'пару' : 'группу корта'} и нажмите другое место для переноса или обмена.</p> : null}{filled < capacity ? <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Нужно добавить ещё {capacity - filled} игроков для полного состава.</p> : null}{reserve.length ? <details className="mt-4 rounded-xl border border-white/10"><summary className="min-h-12 cursor-pointer px-3 py-3 font-semibold">Резерв · {reserve.length}</summary><div className="space-y-2 border-t border-white/10 p-3">{reserve.map((entry, offset) => { const index = capacity + offset; return <div key={`${entry?.playerId}-${index}`} className="flex min-h-11 items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"><button type="button" onClick={() => onActivate(index)} className="text-left">{entry?.playerName}</button><button type="button" onClick={() => onRemove(index)} className="text-xs text-red-300">Убрать</button></div>; })}</div></details> : null}</div>;
}

function Review({ draft, assignedCount, capacity, reserve, errors }: { draft: TournamentWizardDraft; assignedCount: number; capacity: number; reserve: number; errors: Record<string, string> }) {
  const rows = [['Название', draft.name || 'Не указано'], ['Дата и время', `${draft.date || 'Не указана'} · ${draft.time || '—'}`], ['Формат', getTournamentFormatLabel(draft)], ['Дивизион и уровень', `${draft.division} · ${LEVEL_LABELS[draft.level] ?? draft.level}`], ['Корты', String(draft.format === 'Groups + Olympic' ? draft.settings.goCourts ?? '—' : draft.settings.courts ?? '—')], ['Участники', `${assignedCount} / ${capacity}`], ['Резерв', String(reserve)]];
  return <section className="rounded-2xl border border-white/15 bg-white/5 p-5"><h2 className="font-heading text-2xl">Проверка перед публикацией</h2><dl className="mt-5 divide-y divide-white/10">{rows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-text-secondary">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>{Object.values(errors).length ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><strong>Нужно исправить:</strong><ul className="mt-2 list-disc pl-5">{Object.values(errors).map((error) => <li key={error}>{error}</li>)}</ul></div> : assignedCount < capacity ? <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Состав заполнен не полностью. Для кругового турнира это допустимо при публикации регистрации; форматы с фиксированной сеткой потребуют полный состав.</div> : <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">Основные данные и состав готовы к публикации.</div>}</section>;
}
