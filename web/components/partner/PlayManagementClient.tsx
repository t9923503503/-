'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayManagedPost, PlayOrganizer, PlayResources } from '@/lib/play-service';
import { PLAY_LEVEL_LABELS, formatPlayDate, formatPlayTime } from '@/lib/play-ui';
import PlayFinishAndResultButton from '@/components/play/PlayFinishAndResultButton';
import PlayShareButton from '@/components/partner/PlayShareButton';

type Dashboard = {
  posts: PlayManagedPost[];
  resources: PlayResources;
  organizer: PlayOrganizer | null;
  actorKind: 'user' | 'admin';
};

type EventKind = 'game' | 'training';
type EventTab = 'active' | 'games' | 'trainings' | 'drafts' | 'past' | 'archived';
export type GameType = '2x2' | 'sideout' | 'thai' | 'other';
type GameRecipe = 'classic' | 'thai-evening' | 'king-company' | 'friendly-company';
type ParticipantCandidate = {
  userId: number | null;
  playerId: string | null;
  name: string;
  playerLevel: keyof typeof PLAY_LEVEL_LABELS | null;
  registered: boolean;
  recommendationTags?: Array<'last_roster' | 'frequent_coplayer' | 'available' | 'fit_level' | 'long_time_no_play'>;
  sharedGamesCount?: number;
  reliability?: { score: number | null; trackedGames: number; label: 'new' | 'reliable' | 'stable' | 'attention' };
};
type KotyaraPollOption = { id: string; title: string; startsAt: string; goingCount: number; maybeCount: number };

const RECOMMENDATION_LABELS = {
  last_roster: 'Последний состав',
  frequent_coplayer: 'Часто играем вместе',
  available: 'Доступны в это время',
  fit_level: 'Подходят по уровню',
  long_time_no_play: 'Давно не играли вместе',
} as const;

function participantCandidateKey(candidate: ParticipantCandidate): string {
  return candidate.userId ? `user-${candidate.userId}` : `player-${candidate.playerId}`;
}

type EventForm = {
  kind: EventKind;
  organizerId: string;
  venueId: string;
  coachId: string;
  title: string;
  description: string;
  formatLabel: string;
  focus: string;
  startsAt: string;
  endsAt: string;
  levelMin: string;
  levelMax: string;
  genderPolicy: string;
  capacity: string;
  minPlayers: string;
  gatherDeadline: string;
  registrationClosesAt: string;
  priceMode: 'fixed' | 'split';
  priceRub: string;
  courtCostRub: string;
  courtBooked: boolean;
  joinAuthor: boolean;
  visibility: string;
  joinPolicy: string;
  status: string;
  repeatWeeks: string;
  ratingMode: 'rated' | 'friendly';
  resultFormat: 'classic_2x2' | 'thai_8' | 'king_sideout' | 'legacy_custom';
  targetScore: string;
  decidingSetTargetScore: string;
};

const fieldClass = 'w-full rounded-xl border border-white/10 bg-surface px-3 py-3 text-sm text-text-primary outline-none transition focus:border-cyan-300/60';
const PREFERENCES_KEY = 'lpvolley-play-create-preferences-v2';

function isDevelopmentPreview(): boolean {
  return process.env.NODE_ENV !== 'production'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('preview') === '1';
}

const GAME_TYPES: Array<{ id: GameType; icon: string; label: string; format: string; title: string }> = [
  { id: '2x2', icon: '🏐', label: '2×2', format: '2×2', title: 'Игра 2×2' },
  { id: 'sideout', icon: '🔥', label: 'Сайд-аут / KING', format: 'Сайд-аут / KING', title: 'Сайд-аут / KING' },
  { id: 'thai', icon: '⚡', label: 'Тайский · 8', format: 'Тайский', title: 'Тайский · 8 игроков' },
  { id: 'other', icon: '✦', label: 'Другое', format: 'Другое', title: 'Открытая игра' },
];

const GAME_PRESETS: Record<Exclude<GameType, 'other'>, {
  capacity: string;
  minPlayers: string;
  targetScore: string;
  resultFormat: EventForm['resultFormat'];
}> = {
  '2x2': { capacity: '4', minPlayers: '4', targetScore: '21', resultFormat: 'classic_2x2' },
  thai: { capacity: '8', minPlayers: '8', targetScore: '15', resultFormat: 'thai_8' },
  sideout: { capacity: '8', minPlayers: '6', targetScore: '15', resultFormat: 'king_sideout' },
};

const VALID_KING_CAPACITIES = [6, 8, 10] as const;

export function normalizeGameComposition(
  type: GameType,
  rawCapacity: string | number,
  rawMinPlayers?: string | number,
): { capacity: number; minPlayers: number } {
  const parsedCapacity = Math.trunc(Number(rawCapacity));
  const requestedCapacity = Number.isFinite(parsedCapacity) ? parsedCapacity : 0;
  const parsedMinPlayers = Math.trunc(Number(rawMinPlayers));
  const requestedMinPlayers = Number.isFinite(parsedMinPlayers) ? parsedMinPlayers : 0;

  if (type === 'thai') return { capacity: 8, minPlayers: 8 };
  if (type === 'sideout') {
    const target = requestedCapacity || 8;
    const capacity = VALID_KING_CAPACITIES.reduce((closest, candidate) => (
      Math.abs(candidate - target) <= Math.abs(closest - target) ? candidate : closest
    ), VALID_KING_CAPACITIES[0]);
    const validMinimums = VALID_KING_CAPACITIES.filter((candidate) => candidate <= capacity);
    const requestedMinimum = requestedMinPlayers || 6;
    const minPlayers = validMinimums.reduce((closest, candidate) => (
      Math.abs(candidate - requestedMinimum) <= Math.abs(closest - requestedMinimum) ? candidate : closest
    ), validMinimums[0]);
    return {
      capacity,
      minPlayers,
    };
  }

  const minimum = type === '2x2' ? 4 : 2;
  const capacity = Math.min(100, Math.max(minimum, requestedCapacity || minimum));
  return {
    capacity,
    minPlayers: Math.min(capacity, Math.max(minimum, requestedMinPlayers || minimum)),
  };
}

export function getNextWeeklyRepeatDate(
  value: string | Date,
  nowValue: number | Date = Date.now(),
): Date {
  const source = new Date(value);
  const now = new Date(nowValue);
  if (!Number.isFinite(source.getTime()) || !Number.isFinite(now.getTime())) return new Date(Number.NaN);

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const elapsedWeeks = Math.max(1, Math.floor((now.getTime() - source.getTime()) / weekMs) + 1);
  const candidate = new Date(source);
  candidate.setDate(candidate.getDate() + elapsedWeeks * 7);
  while (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

export function selectRepeatGame<T extends Pick<PlayManagedPost, 'kind' | 'archivedAt' | 'status' | 'startsAt'>>(
  posts: T[],
  nowValue: number | Date = Date.now(),
): T | undefined {
  const now = new Date(nowValue).getTime();
  const candidates = posts
    .filter((post) => post.kind === 'game' && !post.archivedAt && !['draft', 'cancelled'].includes(post.status))
    .map((post) => ({ post, startsAt: new Date(post.startsAt).getTime() }))
    .filter((item) => Number.isFinite(item.startsAt));
  const mostRecentPast = candidates
    .filter((item) => item.startsAt <= now)
    .sort((left, right) => right.startsAt - left.startsAt)[0];
  if (mostRecentPast) return mostRecentPast.post;
  return candidates
    .filter((item) => item.startsAt > now)
    .sort((left, right) => left.startsAt - right.startsAt)[0]?.post;
}

const GAME_RECIPES: Array<{
  id: GameRecipe;
  gameType: Exclude<GameType, 'other'>;
  icon: string;
  title: string;
  description: string;
  accent: string;
  overrides?: Partial<EventForm>;
}> = [
  {
    id: 'classic',
    gameType: '2x2',
    icon: '🏐',
    title: 'Постоянные пары',
    description: '2×2 · 4 игрока · до 21',
    accent: 'border-orange-300/30 bg-orange-300/10 hover:border-orange-300/60',
  },
  {
    id: 'thai-evening',
    gameType: 'thai',
    icon: '⚡',
    title: 'Меняем партнёров',
    description: 'Тайский · 8 игроков · 4 тура',
    accent: 'border-cyan-300/25 bg-cyan-300/5 hover:border-cyan-300/55',
  },
  {
    id: 'king-company',
    gameType: 'sideout',
    icon: '👑',
    title: 'Победители остаются',
    description: 'KING · 6–10 игроков · до 15 · ротация',
    accent: 'border-amber-300/25 bg-amber-300/5 hover:border-amber-300/55',
  },
  {
    id: 'friendly-company',
    gameType: '2x2',
    icon: '🤝',
    title: 'Своя компания',
    description: '2×2 с гостями · без рейтинга',
    accent: 'border-emerald-300/25 bg-emerald-300/5 hover:border-emerald-300/55',
    overrides: { ratingMode: 'friendly', title: 'Игра своей компанией' },
  },
];

function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function withDuration(startsAt: string, minutes: number): string {
  const start = new Date(startsAt);
  return Number.isFinite(start.getTime()) ? localInput(new Date(start.getTime() + minutes * 60_000)) : '';
}

function initialForm(kind: EventKind = 'game'): EventForm {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setHours(kind === 'game' ? 20 : 19, 0, 0, 0);
  const startsAt = localInput(start);
  return {
    kind,
    organizerId: '',
    venueId: '',
    coachId: '',
    title: kind === 'game' ? 'Игра 2×2' : 'Тренировка по пляжному волейболу',
    description: '',
    formatLabel: kind === 'game' ? '2×2' : '',
    focus: '',
    startsAt,
    endsAt: withDuration(startsAt, kind === 'game' ? 120 : 90),
    levelMin: kind === 'training' ? 'medium' : 'light',
    levelMax: kind === 'training' ? 'medium' : 'hard',
    genderPolicy: 'any',
    capacity: kind === 'game' ? '4' : '8',
    minPlayers: kind === 'game' ? '2' : '4',
    gatherDeadline: '',
    registrationClosesAt: '',
    priceMode: kind === 'game' ? 'split' : 'fixed',
    priceRub: '0',
    courtCostRub: kind === 'game' ? '3500' : '',
    courtBooked: false,
    joinAuthor: kind === 'game',
    visibility: 'public',
    joinPolicy: 'open',
    status: 'published',
    repeatWeeks: '1',
    ratingMode: 'rated',
    resultFormat: 'classic_2x2',
    targetScore: '21',
    decidingSetTargetScore: '15',
  };
}

function gamePresetForm(
  type: Exclude<GameType, 'other'>,
  defaults: { organizerId: string; venueId: string; courtCostRub: string },
  overrides: Partial<EventForm> = {},
): EventForm {
  const base = initialForm('game');
  const preset = GAME_TYPES.find((item) => item.id === type) || GAME_TYPES[0];
  const settings = GAME_PRESETS[type];
  return {
    ...base,
    organizerId: defaults.organizerId,
    venueId: defaults.venueId,
    courtCostRub: defaults.courtCostRub || '3500',
    title: preset.title,
    formatLabel: preset.format,
    capacity: settings.capacity,
    minPlayers: settings.minPlayers,
    targetScore: settings.targetScore,
    resultFormat: settings.resultFormat,
    ...overrides,
    ...(type === 'sideout' ? { targetScore: '15' } : {}),
  };
}

function fromPost(post: PlayManagedPost, copy: boolean): EventForm {
  const sourceStartsAt = new Date(post.startsAt);
  const copiedStartsAt = copy ? getNextWeeklyRepeatDate(sourceStartsAt) : sourceStartsAt;
  const offset = copiedStartsAt.getTime() - sourceStartsAt.getTime();
  const shiftedDate = (value: string) => localInput(new Date(new Date(value).getTime() + offset));
  const resultSettings = post as PlayManagedPost & {
    ratingMode?: 'rated' | 'friendly';
    resultFormat?: EventForm['resultFormat'];
    resultConfig?: { pointLimit?: number; decidingPointLimit?: number } | null;
  };
  const fallbackPointLimit = gameTypeFromFormat(post.formatLabel) === '2x2' ? 21 : 15;
  const isKing = resultSettings.resultFormat === 'king_sideout' || gameTypeFromFormat(post.formatLabel) === 'sideout';
  const pointLimit = isKing ? 15 : resultSettings.resultConfig?.pointLimit || fallbackPointLimit;
  const decidingPointLimit = Math.min(resultSettings.resultConfig?.decidingPointLimit || 15, pointLimit);
  const postGameType = gameTypeFromFormat(post.formatLabel);
  const composition = post.kind === 'game'
    ? normalizeGameComposition(postGameType, post.capacity, post.minPlayers ?? undefined)
    : { capacity: post.capacity, minPlayers: post.minPlayers ?? Math.max(2, Math.ceil(post.capacity / 2)) };
  return {
    kind: post.kind,
    organizerId: post.organizer.id,
    venueId: post.venue.id,
    coachId: post.coach?.id || '',
    title: post.title,
    description: post.description,
    formatLabel: post.formatLabel,
    focus: post.focus,
    startsAt: localInput(copiedStartsAt),
    endsAt: shiftedDate(post.endsAt),
    levelMin: post.levelMin || '',
    levelMax: post.levelMax || '',
    genderPolicy: post.genderPolicy,
    capacity: String(composition.capacity),
    minPlayers: String(composition.minPlayers),
    gatherDeadline: post.gatherDeadline ? shiftedDate(post.gatherDeadline) : '',
    registrationClosesAt: post.registrationClosesAt ? shiftedDate(post.registrationClosesAt) : '',
    priceMode: post.priceMode,
    priceRub: String(post.priceRub),
    courtCostRub: String(post.courtCostRub ?? ''),
    courtBooked: post.courtBooked,
    joinAuthor: copy && post.kind === 'game',
    visibility: post.visibility,
    joinPolicy: post.joinPolicy,
    status: copy ? 'published' : post.status,
    repeatWeeks: '1',
    ratingMode: resultSettings.ratingMode || 'rated',
    resultFormat: resultSettings.resultFormat || (gameTypeFromFormat(post.formatLabel) === 'thai' ? 'thai_8' : gameTypeFromFormat(post.formatLabel) === 'sideout' ? 'king_sideout' : 'classic_2x2'),
    targetScore: String(pointLimit),
    decidingSetTargetScore: String(decidingPointLimit),
  };
}

function gameTypeFromFormat(format: string): GameType {
  const normalized = format.toLowerCase();
  if (normalized.includes('сайдаут') || normalized.includes('сайд-аут') || normalized.includes('king')) return 'sideout';
  if (normalized.includes('тай')) return 'thai';
  if (normalized.includes('2')) return '2x2';
  return 'other';
}

function isPastPost(post: PlayManagedPost): boolean {
  return ['completed', 'cancelled'].includes(post.status) || new Date(post.endsAt).getTime() < Date.now();
}

function postStatusLabel(status: PlayManagedPost['status']): string {
  if (status === 'draft') return 'Черновик';
  if (status === 'published') return 'Опубликовано';
  if (status === 'completed') return 'Завершено';
  return 'Отменено';
}

export default function PlayManagementClient() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedKind, setSelectedKind] = useState<EventKind | null>(null);
  const [gameType, setGameType] = useState<GameType>('2x2');
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [form, setForm] = useState<EventForm>(() => initialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eventTab, setEventTab] = useState<EventTab>('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [createdPostId, setCreatedPostId] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError('');
    setAuthRequired(false);
    try {
      const preview = isDevelopmentPreview();
      const response = await fetch(`/api/play-management${preview ? '?preview=1' : ''}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthRequired(true);
        throw new Error('Войдите или зарегистрируйтесь, чтобы создать игру');
      }
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить события');
      const next = data as Dashboard;
      setDashboard(next);
      let preferences: { venueId?: string; priceRub?: string; courtCostRub?: string; capacity?: string; durationMinutes?: number } = {};
      try { preferences = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || '{}'); } catch {}
      const query = new URLSearchParams(window.location.search);
      const editId = deepLinkHandled.current ? '' : query.get('edit') || '';
      const focusPostId = deepLinkHandled.current ? '' : query.get('post') || '';
      const recipeId = deepLinkHandled.current ? '' : query.get('recipe') || '';
      const editPost = editId ? next.posts.find((post) => post.id === editId) : null;
      if (editPost) {
        deepLinkHandled.current = true;
        setSelectedKind(editPost.kind);
        setGameType(gameTypeFromFormat(editPost.formatLabel));
        setShowFormatPicker(false);
        setEditingId(editPost.id);
        setForm(fromPost(editPost, false));
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      if (focusPostId && next.posts.some((post) => post.id === focusPostId)) {
        deepLinkHandled.current = true;
        setCreatedPostId(focusPostId);
        window.history.replaceState(null, '', window.location.pathname);
        window.setTimeout(() => document.getElementById(`managed-post-${focusPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }
      const recipe = GAME_RECIPES.find((item) => item.id === recipeId);
      if (!deepLinkHandled.current && recipe) {
        deepLinkHandled.current = true;
        setSelectedKind('game');
        setEditingId(null);
        setGameType(recipe.gameType);
        setShowFormatPicker(false);
        setForm(gamePresetForm(recipe.gameType, {
          organizerId: next.organizer?.id || next.resources.organizers[0]?.id || '',
          venueId: preferences.venueId || next.resources.venues[0]?.id || '',
          courtCostRub: preferences.courtCostRub || '3500',
        }, recipe.overrides));
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      setForm((current) => ({
        ...current,
        organizerId: current.organizerId || next.organizer?.id || next.resources.organizers[0]?.id || '',
        venueId: current.venueId || preferences.venueId || next.resources.venues[0]?.id || '',
        priceRub: current.priceRub !== '0' ? current.priceRub : preferences.priceRub || current.priceRub,
        courtCostRub: current.courtCostRub || preferences.courtCostRub || '3500',
        capacity: preferences.capacity || current.capacity,
        minPlayers: String(Math.max(2, Math.ceil(Number(preferences.capacity || current.capacity) / 2))),
        endsAt: preferences.durationMinutes ? withDuration(current.startsAt, preferences.durationMinutes) : current.endsAt,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function update<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeTargetScore(value: EventForm['targetScore']) {
    const nextTargetScore = gameType === 'sideout' ? '15' : value;
    setForm((current) => ({
      ...current,
      targetScore: nextTargetScore,
      decidingSetTargetScore: String(Math.min(Number(current.decidingSetTargetScore) || Number(nextTargetScore), Number(nextTargetScore))),
    }));
  }

  function changeDecidingSetTargetScore(value: EventForm['decidingSetTargetScore']) {
    setForm((current) => ({
      ...current,
      decidingSetTargetScore: String(Math.min(Number(value), Number(current.targetScore))),
    }));
  }

  function chooseKind(kind: EventKind) {
    const base = initialForm(kind);
    const organizerId = dashboard?.organizer?.id || dashboard?.resources.organizers[0]?.id || '';
    const venueId = form.venueId || dashboard?.resources.venues[0]?.id || '';
    const composition = normalizeGameComposition('2x2', form.capacity, form.minPlayers);
    setSelectedKind(kind);
    setEditingId(null);
    setGameType('2x2');
    setShowFormatPicker(kind === 'game');
    setForm({
      ...base,
      organizerId,
      venueId,
      priceRub: kind === 'training' ? form.priceRub : base.priceRub,
      courtCostRub: kind === 'game' ? form.courtCostRub || base.courtCostRub : '',
      capacity: kind === 'game' ? String(composition.capacity) : '8',
      minPlayers: kind === 'game' ? String(composition.minPlayers) : '4',
    });
  }

  function chooseGameType(type: GameType) {
    const preset = GAME_TYPES.find((item) => item.id === type) || GAME_TYPES[0];
    setGameType(type);
    setForm((current) => {
      const settings = type === 'other' ? null : GAME_PRESETS[type];
      const composition = normalizeGameComposition(
        type,
        settings?.capacity || current.capacity,
        settings?.minPlayers || current.minPlayers,
      );
      return {
        ...current,
        formatLabel: preset.format,
        title: preset.title,
        capacity: String(composition.capacity),
        minPlayers: String(composition.minPlayers),
        targetScore: settings?.targetScore || current.targetScore,
        resultFormat: settings?.resultFormat || 'legacy_custom',
        ratingMode: type === 'other' ? 'friendly' : current.ratingMode,
      };
    });
  }

  function startGamePreset(type: Exclude<GameType, 'other'>, overrides: Partial<EventForm> = {}) {
    setSelectedKind('game');
    setEditingId(null);
    setGameType(type);
    setShowFormatPicker(false);
    setForm(gamePresetForm(type, {
      organizerId: dashboard?.organizer?.id || dashboard?.resources.organizers[0]?.id || '',
      venueId: form.venueId || dashboard?.resources.venues[0]?.id || '',
      courtCostRub: form.courtCostRub || '3500',
    }, overrides));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startGameRecipe(recipe: (typeof GAME_RECIPES)[number]) {
    startGamePreset(recipe.gameType, recipe.overrides);
  }

  function setQuickStart(mode: 'tomorrow' | 'tuesday' | 'week') {
    const now = new Date();
    let start: Date;
    if (mode === 'week') {
      const current = new Date(form.startsAt);
      start = Number.isFinite(current.getTime()) ? new Date(current.getTime() + 7 * 24 * 60 * 60_000) : new Date(now.getTime() + 7 * 24 * 60 * 60_000);
    } else if (mode === 'tuesday') {
      const days = (2 - now.getDay() + 7) % 7 || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 20, 0, 0, 0);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 20, 0, 0, 0);
    }
    changeStart(localInput(start));
  }

  function changeStart(value: string) {
    setForm((current) => ({ ...current, startsAt: value, endsAt: withDuration(value, current.kind === 'game' ? 120 : 90) }));
  }

  function changeCapacity(value: string) {
    setForm((current) => {
      if (current.kind !== 'game') {
        const capacity = Math.min(100, Math.max(2, Math.trunc(Number(value)) || 2));
        return { ...current, capacity: String(capacity), minPlayers: String(Math.min(capacity, Math.max(2, Number(current.minPlayers) || 2))) };
      }
      const composition = normalizeGameComposition(gameType, value, current.minPlayers);
      return { ...current, capacity: String(composition.capacity), minPlayers: String(composition.minPlayers) };
    });
  }

  function fillFromPost(post: PlayManagedPost, copy = true) {
    setSelectedKind(post.kind);
    setGameType(gameTypeFromFormat(post.formatLabel));
    setShowFormatPicker(false);
    setEditingId(copy ? null : post.id);
    setForm(fromPost(post, copy));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setTuesdayTemplate() {
    const base = initialForm('game');
    const now = new Date();
    const days = (2 - now.getDay() + 7) % 7 || 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 20, 0, 0, 0);
    const value = localInput(start);
    setSelectedKind('game');
    setGameType('2x2');
    setShowFormatPicker(false);
    setForm((current) => ({
      ...base,
      organizerId: dashboard?.organizer?.id || dashboard?.resources.organizers[0]?.id || '',
      venueId: current.venueId || dashboard?.resources.venues[0]?.id || '',
      courtCostRub: current.courtCostRub || '3500',
      startsAt: value,
      endsAt: withDuration(value, 120),
      minPlayers: '4',
      repeatWeeks: '8',
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitEvent(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSavedMessage('');
    const isTraining = form.kind === 'training';
    const title = isTraining ? `Тренировка: ${form.focus.trim() || 'пляжный волейбол'}` : form.title;
    const composition = isTraining
      ? { capacity: Number(form.capacity), minPlayers: Math.max(2, Math.ceil(Number(form.capacity) / 2)) }
      : normalizeGameComposition(gameType, form.capacity, form.minPlayers);
    const capacity = composition.capacity;
    try {
      const response = await fetch(editingId ? `/api/play-posts/${editingId}` : '/api/play-posts', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          title,
          coachId: isTraining ? form.coachId || null : null,
          formatLabel: isTraining ? '' : form.formatLabel,
          genderPolicy: isTraining ? 'any' : form.genderPolicy,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          gatherDeadline: !isTraining && form.gatherDeadline ? new Date(form.gatherDeadline).toISOString() : null,
          registrationClosesAt: form.registrationClosesAt ? new Date(form.registrationClosesAt).toISOString() : null,
          capacity,
          minPlayers: composition.minPlayers,
          priceRub: Number(form.priceRub),
          courtCostRub: form.courtCostRub ? Number(form.courtCostRub) : null,
          repeatWeeks: editingId ? 1 : Number(form.repeatWeeks),
          levelMin: form.levelMin || null,
          levelMax: form.levelMax || null,
          joinAuthor: !isTraining && form.joinAuthor,
          ratingMode: isTraining ? 'friendly' : form.ratingMode,
          resultFormat: isTraining ? 'custom' : form.resultFormat,
          resultConfig: isTraining ? {} : {
            pointLimit: form.resultFormat === 'king_sideout' ? 15 : Number(form.targetScore),
            decidingPointLimit: Math.min(Number(form.decidingSetTargetScore), form.resultFormat === 'king_sideout' ? 15 : Number(form.targetScore)),
          },
          resultEntryMode: 'after_game',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить событие');
      const durationMinutes = Math.max(15, Math.round((new Date(form.endsAt).getTime() - new Date(form.startsAt).getTime()) / 60_000));
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ venueId: form.venueId, priceRub: form.priceRub, courtCostRub: form.courtCostRub, capacity: String(capacity), durationMinutes }));
      setSavedMessage(editingId ? 'Изменения сохранены' : form.status === 'draft' ? 'Черновик сохранён' : 'Событие опубликовано');
      const savedPostId = !editingId && Array.isArray(data.posts) ? String(data.posts[0]?.id || '') : editingId || '';
      setCreatedPostId(savedPostId || null);
      setEditingId(null);
      setSelectedKind(null);
      await load();
      if (savedPostId) window.setTimeout(() => document.getElementById(`managed-post-${savedPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function patchPost(id: string, patch: Record<string, unknown>) {
    setError('');
    const response = await fetch(`/api/play-posts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || 'Не удалось изменить событие'); return; }
    await load(true);
  }

  async function createRematch(post: PlayManagedPost) {
    if (!window.confirm(`Создать реванш «${post.title}» на то же время через неделю и пригласить прошлый состав?`)) return;
    setError('');
    setSavedMessage('');
    const response = await fetch(`/api/play-posts/${post.id}/rematch`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || 'Не удалось собрать реванш'); return; }
    setSavedMessage(`Реванш создан · приглашено: ${Number(data.invited || 0)}${data.skippedGuests ? ` · гостей нужно добавить заново: ${data.skippedGuests}` : ''}`);
    await load(true);
    const nextId = String(data.post?.id || '');
    if (nextId) window.setTimeout(() => document.getElementById(`managed-post-${nextId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  async function review(postId: string, participantId: string, action: 'accept' | 'reject') {
    const response = await fetch(`/api/play-posts/${postId}/participants/${participantId}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || 'Не удалось обработать заявку'); return; }
    await load(true);
  }

  const filteredPosts = useMemo(() => {
    const posts = dashboard?.posts || [];
    if (eventTab === 'archived') return posts.filter((post) => Boolean(post.archivedAt));
    const visible = posts.filter((post) => !post.archivedAt);
    if (eventTab === 'past') return visible.filter(isPastPost);
    if (eventTab === 'drafts') return visible.filter((post) => post.status === 'draft');
    const active = visible.filter((post) => !isPastPost(post));
    if (eventTab === 'games') return active.filter((post) => post.kind === 'game' && post.status !== 'draft');
    if (eventTab === 'trainings') return active.filter((post) => post.kind === 'training' && post.status !== 'draft');
    return active;
  }, [dashboard?.posts, eventTab]);

  const splitCapacity = Math.max(1, Number(form.capacity) || 1);
  const splitCourtCost = Math.max(0, Number(form.courtCostRub) || 0);
  const splitPricePerPerson = Math.ceil(splitCourtCost / splitCapacity);

  if (loading) return <div className="rounded-2xl border border-white/10 p-8 text-sm text-text-secondary">Загружаем ваши игры…</div>;
  if (!dashboard && authRequired) return (
    <section className="rounded-3xl border border-brand/20 bg-brand/5 p-6 text-center md:p-8">
      <div className="text-3xl" aria-hidden="true">🏐</div>
      <h2 className="mt-3 text-2xl font-black text-text-primary">Создать игру может каждый</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">Войдите или зарегистрируйтесь на LPVOLLEY. Отдельный статус организатора и одобрение администратора не нужны.</p>
      <Link href="/login?returnTo=%2Fpartner%2Fmanage" className="mt-5 inline-flex rounded-2xl bg-brand px-6 py-3 text-sm font-black text-white">Войти или зарегистрироваться</Link>
    </section>
  );
  if (!dashboard) return <div className="rounded-2xl border border-red-300/20 bg-red-300/5 p-6 text-sm text-red-200">{error || 'Не удалось открыть создание игры'}</div>;

  const repeatSourcePost = selectRepeatGame(dashboard.posts);
  const repeatStartsAt = repeatSourcePost ? getNextWeeklyRepeatDate(repeatSourcePost.startsAt) : null;

  return (
    <div className="space-y-10">
      {error ? <div className="rounded-2xl border border-red-300/20 bg-red-300/5 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {savedMessage ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-100"><span>✓ {savedMessage}{createdPostId ? ' · состав открыт ниже' : ''}</span>{createdPostId ? <div className="flex items-center gap-2"><PlayShareButton title={form.title} url={`/partner/${createdPostId}`} compact /><Link href={`/partner/${createdPostId}`} className="inline-flex min-h-10 items-center rounded-xl border border-emerald-300/25 px-3 text-xs">Открыть игру →</Link></div> : null}</div> : null}

      <section className="rounded-3xl border border-white/10 bg-card p-5 shadow-xl md:p-7">
          {!selectedKind ? <>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand">Новая игра</p>
              <h2 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">Как играем?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">Выберите понятный сценарий. Состав, счёт и ротация настроятся сами — останется проверить время и площадку.</p>
            </div>

            {repeatSourcePost ? (
              <button type="button" onClick={() => fillFromPost(repeatSourcePost)} className="mt-6 flex w-full items-center gap-4 rounded-2xl border border-brand/35 bg-brand/10 p-4 text-left transition hover:border-brand/70 hover:bg-brand/15">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-2xl text-white" aria-hidden="true">↻</span>
                <span className="min-w-0 flex-1">
                  <small className="block text-[11px] font-black uppercase tracking-[0.16em] text-brand">Самый быстрый вариант</small>
                  <strong className="mt-1 block truncate text-base text-text-primary">Повторить: {repeatSourcePost.title}</strong>
                  <span className="mt-0.5 block text-xs text-text-secondary">{repeatSourcePost.venue.name}{repeatStartsAt ? ` · ${formatPlayDate(repeatStartsAt.toISOString(), { day: 'numeric', month: 'short' })} в ${formatPlayTime(repeatStartsAt.toISOString())}` : ''} · прошлый состав можно пригласить снова</span>
                </span>
                <span className="hidden text-sm font-black text-brand sm:block">Проверить →</span>
              </button>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {GAME_RECIPES.map((recipe) => (
                <button key={recipe.id} type="button" onClick={() => startGameRecipe(recipe)} className={`min-h-32 rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 ${recipe.accent}`}>
                  <span className="text-2xl" aria-hidden="true">{recipe.icon}</span>
                  <strong className="mt-2 block text-sm leading-5 text-text-primary">{recipe.title}</strong>
                  <span className="mt-1 block text-[11px] leading-4 text-text-secondary">{recipe.description}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
              <button type="button" onClick={setTuesdayTemplate} className="min-h-11 rounded-xl border border-orange-300/30 bg-orange-300/10 px-4 text-sm font-bold text-orange-800 dark:text-orange-100">📅 Серия по вторникам · 20:00</button>
              <button type="button" onClick={() => chooseKind('game')} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-text-primary">⚙ Настроить свою игру</button>
              <button type="button" onClick={() => chooseKind('training')} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-text-primary">🎓 Создать тренировку</button>
              <a href="https://t.me/Lpvolley_bot?start=create_game" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-cyan-300/25 bg-cyan-300/5 px-4 text-sm font-bold text-cyan-700 hover:border-cyan-400 dark:text-cyan-200">Создать через Telegram</a>
            </div>
          </> : <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand">{editingId ? 'Редактирование' : form.kind === 'game' ? 'Быстрое создание игры' : 'Новая тренировка'}</p><h2 className="mt-1 text-2xl font-black text-text-primary md:text-3xl">{editingId ? form.title : form.kind === 'game' ? 'Соберите игру за минуту' : 'Запланируйте тренировку'}</h2></div>
              <button type="button" onClick={() => { setSelectedKind(null); setEditingId(null); setShowFormatPicker(false); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-text-secondary hover:text-text-primary">← Все сценарии</button>
            </div>

            <form onSubmit={submitEvent} className="mt-6">
              {form.kind === 'game' ? <div className="grid gap-3">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface-light/25 p-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-2xl" aria-hidden="true">{GAME_TYPES.find((type) => type.id === gameType)?.icon || '🏐'}</span>
                  <div className="min-w-0 flex-1">
                    <small className="block text-[11px] font-black uppercase tracking-[0.14em] text-text-secondary">Сценарий игры</small>
                    <strong className="mt-0.5 block text-sm text-text-primary">{form.title}</strong>
                    <span className="mt-0.5 block text-xs text-text-secondary">{form.capacity} игроков · до {form.targetScore} · пары и счёт подготовятся автоматически</span>
                  </div>
                  <button type="button" aria-expanded={showFormatPicker} onClick={() => setShowFormatPicker((value) => !value)} className="min-h-11 shrink-0 rounded-xl border border-white/15 px-3 text-xs font-bold text-text-primary">{showFormatPicker ? 'Готово' : 'Сменить'}</button>
                </div>

                {showFormatPicker ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{GAME_TYPES.map((type) => <button key={type.id} type="button" onClick={() => { chooseGameType(type.id); setShowFormatPicker(false); }} className={`min-h-24 rounded-2xl border p-3 text-left transition ${gameType === type.id ? 'border-brand bg-brand/10 shadow-lg' : 'border-white/10 bg-surface-light/30 hover:border-white/20'}`}><span className="text-xl">{type.icon}</span><strong className="mt-1.5 block text-xs text-text-primary">{type.label}</strong></button>)}</div> : null}

                <div className="rounded-2xl border border-white/10 bg-surface-light/20 p-1">
                  <div className="grid grid-cols-2 gap-1" role="group" aria-label="Тип результата"><button type="button" disabled={gameType === 'other'} aria-pressed={form.ratingMode === 'rated'} onClick={() => update('ratingMode', 'rated')} className={`min-h-12 rounded-xl px-3 text-sm font-bold transition disabled:opacity-35 ${form.ratingMode === 'rated' ? 'bg-brand text-white shadow' : 'text-text-secondary hover:text-text-primary'}`}>На рейтинг</button><button type="button" aria-pressed={form.ratingMode === 'friendly'} onClick={() => update('ratingMode', 'friendly')} className={`min-h-12 rounded-xl px-3 text-sm font-bold transition ${form.ratingMode === 'friendly' ? 'bg-white/10 text-text-primary shadow' : 'text-text-secondary hover:text-text-primary'}`}>Обычная</button></div>
                  <p className="px-3 py-2 text-xs text-text-secondary">{gameType === 'other' ? 'Свободный формат пока сохраняется как обычная игра.' : form.ratingMode === 'rated' ? 'Все участники с аккаунтами — рейтинг после утверждения результата.' : 'Гостей можно добавлять сразу; статистика сохранится без рейтинга.'}</p>
                </div>
              </div> : null}

              {form.kind === 'game' ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-surface-light/20 p-3">
                <span className="mr-auto text-xs font-black uppercase tracking-[0.12em] text-text-secondary">Игра до</span>
                {(['11', '15', '21'] as const).map((limit) => <button key={limit} type="button" disabled={gameType === 'sideout' && limit !== '15'} aria-pressed={form.targetScore === limit} onClick={() => changeTargetScore(limit)} className={`min-h-11 min-w-14 rounded-xl px-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-25 ${form.targetScore === limit ? 'bg-brand text-white shadow' : 'border border-white/15 text-text-primary'}`}>{limit}</button>)}
                {gameType === 'sideout' ? <span className="w-full text-xs text-text-secondary sm:w-auto">Для KING используется единый счёт до 15.</span> : null}
              </div> : null}

              {form.kind === 'game' && !editingId ? <div className="mt-5">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-text-secondary">Быстро выбрать время</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setQuickStart('tomorrow')} className="min-h-11 rounded-xl border border-white/15 px-2 text-xs font-bold text-text-primary">Завтра<br /><span className="font-normal text-text-secondary">20:00</span></button>
                  <button type="button" onClick={() => setQuickStart('tuesday')} className="min-h-11 rounded-xl border border-white/15 px-2 text-xs font-bold text-text-primary">Во вторник<br /><span className="font-normal text-text-secondary">20:00</span></button>
                  <button type="button" onClick={() => setQuickStart('week')} className="min-h-11 rounded-xl border border-white/15 px-2 text-xs font-bold text-text-primary">+ 7 дней<br /><span className="font-normal text-text-secondary">то же время</span></button>
                </div>
              </div> : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {form.kind === 'training' ? <><label className="text-xs text-text-secondary">Тренер<select required value={form.coachId} onChange={(e) => update('coachId', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="">Выберите тренера</option>{dashboard.resources.coaches.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs text-text-secondary">Тема<input required value={form.focus} onChange={(e) => update('focus', e.target.value)} className={`${fieldClass} mt-1.5`} placeholder="Например: приём и защита" /></label><label className="text-xs text-text-secondary md:col-span-2">Уровень группы<select value={form.levelMin} onChange={(e) => setForm((current) => ({ ...current, levelMin: e.target.value, levelMax: e.target.value }))} className={`${fieldClass} mt-1.5`}>{Object.entries(PLAY_LEVEL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></> : null}
                {form.kind === 'game' && gameType === 'other' ? <label className="text-xs text-text-secondary md:col-span-2">Название игры<input required value={form.title} onChange={(e) => update('title', e.target.value)} className={`${fieldClass} mt-1.5`} placeholder="Название вашей игры" /></label> : null}
                <label className="text-xs text-text-secondary">Дата и время<input required type="datetime-local" value={form.startsAt} onChange={(e) => changeStart(e.target.value)} className={`${fieldClass} mt-1.5`} /></label>
                <label className="text-xs text-text-secondary">Площадка<select required value={form.venueId} onChange={(e) => update('venueId', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="">Выберите площадку</option>{dashboard.resources.venues.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.address}</option>)}</select></label>
                {form.kind === 'game' && gameType === 'sideout' ? (
                  <fieldset className="text-xs text-text-secondary">
                    <legend>Количество игроков KING</legend>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {VALID_KING_CAPACITIES.map((capacity) => <button key={capacity} type="button" aria-pressed={form.capacity === String(capacity)} onClick={() => changeCapacity(String(capacity))} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${form.capacity === String(capacity) ? 'border-brand bg-brand text-white' : 'border-white/10 bg-surface text-text-primary'}`}>{capacity}</button>)}
                    </div>
                    <span className="mt-1 block text-[11px]">Только чётный состав: 6, 8 или 10 игроков.</span>
                  </fieldset>
                ) : (
                  <label className="text-xs text-text-secondary">Количество мест<input required readOnly={form.kind === 'game' && gameType === 'thai'} type="number" min={form.kind === 'game' && gameType === '2x2' ? 4 : 2} max={form.kind === 'game' && gameType === 'thai' ? 8 : 100} value={form.capacity} onChange={(e) => changeCapacity(e.target.value)} className={`${fieldClass} mt-1.5 ${form.kind === 'game' && gameType === 'thai' ? 'cursor-not-allowed opacity-70' : ''}`} />{form.kind === 'game' && gameType === 'thai' ? <span className="mt-1 block text-[11px]">Тайский формат проводится ровно на 8 игроков.</span> : form.kind === 'game' && gameType === '2x2' ? <span className="mt-1 block text-[11px]">Минимум 4 игрока; при большем составе пары можно менять между партиями.</span> : null}</label>
                )}
                {form.priceMode === 'split' ? (
                  <label className="text-xs text-text-secondary">Цена за корт, ₽<input required type="number" min="1" value={form.courtCostRub} onChange={(e) => update('courtCostRub', e.target.value)} className={`${fieldClass} mt-1.5`} /><span className="mt-1 block text-[11px]">При {splitCapacity} местах — ~{splitPricePerPerson} ₽ с участника. Итог зависит от состава.</span></label>
                ) : (
                  <label className="text-xs text-text-secondary">Цена с участника, ₽<input required type="number" min="0" value={form.priceRub} onChange={(e) => update('priceRub', e.target.value)} className={`${fieldClass} mt-1.5`} /><span className="mt-1 block text-[11px]">Фиксированная сумма для каждого участника.</span></label>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button disabled={saving} className="min-h-12 w-full rounded-2xl bg-brand px-5 text-sm font-black text-white shadow-lg shadow-orange-950/20 transition hover:-translate-y-0.5 disabled:opacity-60 sm:w-auto sm:px-7">{saving ? 'Сохраняем…' : editingId ? 'Сохранить изменения' : form.status === 'draft' ? 'Сохранить черновик' : form.kind === 'game' ? 'Создать и собрать состав' : 'Создать тренировку'}</button>
                <span className="hidden text-xs text-text-secondary sm:block">{form.kind === 'game' ? `${form.title} · ${form.capacity} мест · до ${form.targetScore}` : `Тренировка · ${form.capacity} мест`}</span>
              </div>

              <details className="mt-6 rounded-2xl border border-white/10 bg-surface-light/20">
                <summary className="cursor-pointer list-none px-4 py-4 text-sm font-black text-text-primary">⚙ Дополнительные настройки</summary>
                <div className="grid gap-4 border-t border-white/10 p-4 md:grid-cols-2">
                  {dashboard.actorKind === 'admin' ? <label className="text-xs text-text-secondary md:col-span-2">Организация<select required value={form.organizerId} onChange={(e) => update('organizerId', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="">Выберите</option>{dashboard.resources.organizers.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label> : null}
                  <label className="text-xs text-text-secondary md:col-span-2">Описание<textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${fieldClass} mt-1.5 min-h-24`} placeholder="Инвентарь, правила и важные детали" /></label>
                  <label className="text-xs text-text-secondary">Окончание<input type="datetime-local" value={form.endsAt} onChange={(e) => update('endsAt', e.target.value)} className={`${fieldClass} mt-1.5`} /></label>
                  <label className="text-xs text-text-secondary">Запись закрывается<input type="datetime-local" value={form.registrationClosesAt} onChange={(e) => update('registrationClosesAt', e.target.value)} className={`${fieldClass} mt-1.5`} /></label>
                  {form.kind === 'game' ? <><label className="text-xs text-text-secondary">Дедлайн сбора<input type="datetime-local" value={form.gatherDeadline} onChange={(e) => update('gatherDeadline', e.target.value)} className={`${fieldClass} mt-1.5`} /></label><label className="text-xs text-text-secondary">Состав<select value={form.genderPolicy} onChange={(e) => update('genderPolicy', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="any">Мужчины и женщины</option><option value="mixed">Микст</option><option value="M">Мужчины</option><option value="W">Женщины</option></select></label><label className="text-xs text-text-secondary">Минимум игроков{gameType === 'sideout' ? <select value={form.minPlayers} onChange={(e) => update('minPlayers', e.target.value)} className={`${fieldClass} mt-1.5`}>{VALID_KING_CAPACITIES.filter((capacity) => capacity <= Number(form.capacity)).map((capacity) => <option key={capacity} value={capacity}>{capacity} игроков</option>)}</select> : <input type="number" min={gameType === 'thai' ? 8 : gameType === '2x2' ? 4 : 2} max={form.capacity} readOnly={gameType === 'thai'} value={form.minPlayers} onChange={(e) => update('minPlayers', e.target.value)} className={`${fieldClass} mt-1.5 ${gameType === 'thai' ? 'cursor-not-allowed opacity-70' : ''}`} />}</label></> : null}
                  {form.kind === 'game' && gameType === '2x2' ? <label className="text-xs text-text-secondary">Решающий сет до<select value={form.decidingSetTargetScore} onChange={(e) => changeDecidingSetTargetScore(e.target.value)} className={`${fieldClass} mt-1.5`}><option value="11">11 очков</option><option value="15" disabled={Number(form.targetScore) < 15}>15 очков</option><option value="21" disabled={Number(form.targetScore) < 21}>21 очка</option></select></label> : null}
                  <label className="text-xs text-text-secondary">Способ расчёта<select value={form.priceMode} onChange={(e) => update('priceMode', e.target.value as 'fixed' | 'split')} className={`${fieldClass} mt-1.5`}><option value="split">Разделить цену корта</option><option value="fixed">Фиксированная цена с участника</option></select></label>
                  <label className="text-xs text-text-secondary">Доступ<select value={form.visibility} onChange={(e) => update('visibility', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="public">Общая лента</option><option value="unlisted">Только по ссылке</option></select></label>
                  <label className="text-xs text-text-secondary">Запись<select value={form.joinPolicy} onChange={(e) => update('joinPolicy', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="open">Сразу в состав</option><option value="request">После подтверждения</option><option value="closed">Только через организатора</option></select></label>
                  {!editingId ? <label className="text-xs text-text-secondary">Повтор<select value={form.repeatWeeks} onChange={(e) => update('repeatWeeks', e.target.value)} className={`${fieldClass} mt-1.5`}>{Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value === 1 ? 'Без повтора' : `${value} недель подряд`}</option>)}</select></label> : null}
                  <label className="text-xs text-text-secondary">Статус<select value={form.status} onChange={(e) => update('status', e.target.value)} className={`${fieldClass} mt-1.5`}><option value="published">Опубликовать</option><option value="draft">Сохранить черновик</option>{editingId ? <><option value="completed">Завершено</option><option value="cancelled">Отменено</option></> : null}</select></label>
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 p-3 text-sm text-text-secondary"><input type="checkbox" checked={form.courtBooked} onChange={(e) => update('courtBooked', e.target.checked)} className="accent-orange-500" /> Корт уже забронирован</label>
                  {form.kind === 'game' && !editingId && dashboard.actorKind === 'user' ? <label className="flex items-center gap-2 rounded-xl border border-white/10 p-3 text-sm text-text-secondary"><input type="checkbox" checked={form.joinAuthor} onChange={(e) => update('joinAuthor', e.target.checked)} className="accent-orange-500" /> Я участвую в этой игре</label> : null}
                </div>
              </details>

            </form>
          </>}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand">Управление</p><h2 className="mt-1 text-3xl font-black text-text-primary">Мои события</h2></div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-surface-lighter p-1">{([
            ['active', 'Актуальные'],
            ['games', 'Игры'],
            ['trainings', 'Тренировки'],
            ['drafts', 'Черновики'],
            ['past', 'Прошедшие'],
            ...(dashboard.actorKind === 'admin' ? [['archived', 'Архив'] as [EventTab, string]] : []),
          ] as Array<[EventTab, string]>).map(([key,label]) => <button key={key} type="button" onClick={() => setEventTab(key)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${eventTab === key ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary'}`}>{label}</button>)}</div>
        </div>
        <div className="mt-5 grid gap-4">
          {filteredPosts.map((post) => (
            <article id={`managed-post-${post.id}`} key={post.id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-card p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-black ${post.kind === 'training' ? 'bg-cyan-300/10 text-cyan-300' : 'bg-brand/10 text-brand'}`}>{post.kind === 'training' ? '🎓 Тренировка' : '🏐 Игра'}</span>
                    <span className="text-text-secondary">{post.archivedAt ? 'В архиве' : postStatusLabel(post.status)}</span>
                    {post.kind === 'game' ? <span className="rounded-full bg-white/5 px-2.5 py-1 text-text-secondary">{(post as PlayManagedPost & { ratingMode?: string }).ratingMode === 'friendly' ? 'Обычная' : 'На рейтинг'}</span> : null}
                  </div>
                  <h3 className="mt-2 text-xl font-black text-text-primary">{post.title}</h3>
                  <p className="mt-1 text-sm text-text-secondary">{formatPlayDate(post.startsAt, { day: 'numeric', month: 'short' })} · {formatPlayTime(post.startsAt)} · {post.venue.name} · {post.confirmedCount}/{post.capacity}</p>
                  {post.kind === 'training' ? <p className="mt-2 text-xs text-cyan-200">{post.coach?.name || 'Тренер не указан'} · {post.focus || 'Тема не указана'} · {post.levelMin ? PLAY_LEVEL_LABELS[post.levelMin] : 'Любой уровень'}</p> : null}
                </div>

                <div className="grid gap-2 lg:justify-items-end">
                  {post.kind === 'game' && post.status === 'published' && !post.archivedAt ? (
                    <div className="w-full sm:w-auto [&_a]:w-full"><PlayFinishAndResultButton postId={post.id} /></div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Link href={`/partner/${post.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-text-primary transition hover:border-white/30">Открыть</Link>
                    <PlayShareButton title={post.title} url={`/partner/${post.id}`} compact />
                    {!post.archivedAt ? (
                      <>
                        <button type="button" onClick={() => fillFromPost(post, false)} className="min-h-10 rounded-xl border border-cyan-300/25 px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:border-cyan-400 dark:text-cyan-100">Изменить</button>
                        {isPastPost(post) ? <button type="button" onClick={() => void createRematch(post)} className="min-h-10 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-300/15 dark:text-cyan-100">↻ Собрать реванш</button> : <button type="button" onClick={() => fillFromPost(post, true)} className="min-h-10 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-white/30">По шаблону</button>}
                        {post.status === 'draft' ? <button type="button" onClick={() => void patchPost(post.id, { status: 'published' })} className="min-h-10 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-200">Опубликовать</button> : null}
                        {post.status === 'published' ? <button type="button" onClick={() => void patchPost(post.id, { status: 'cancelled' })} className="min-h-10 rounded-xl border border-red-300/20 bg-red-400/5 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-400/10 dark:text-red-200">Отменить</button> : null}
                        {dashboard.actorKind === 'admin' && (post.status !== 'published' || isPastPost(post)) ? <button type="button" onClick={() => void patchPost(post.id, { archived: true })} className="min-h-10 rounded-xl border border-amber-300/25 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-200">В архив</button> : null}
                      </>
                    ) : dashboard.actorKind === 'admin' ? <button type="button" onClick={() => void patchPost(post.id, { archived: false })} className="min-h-10 rounded-xl border border-emerald-300/25 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-200">Вернуть</button> : null}
                  </div>
                </div>
              </div>
              {!post.archivedAt ? <ParticipantRosterManager post={post} initiallyOpen={createdPostId === post.id} onReview={review} onChanged={() => load(true)} /> : null}
            </article>
          ))}
          {!filteredPosts.length ? <p className="rounded-2xl border border-dashed border-white/15 p-9 text-center text-sm text-text-secondary">В этом разделе пока нет событий.</p> : null}
        </div>
      </section>
    </div>
  );
}

const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  pending: 'ожидает решения',
  confirmed: 'в составе',
  reserve: 'резерв',
  cancelled: 'убран',
  rejected: 'отклонён',
};

const ATTENDANCE_LABELS: Record<string, string> = {
  going: 'будет',
  not_going: 'не сможет',
  attended: 'пришёл',
  no_show: 'не пришёл',
};

function ParticipantRosterManager({
  post,
  initiallyOpen,
  onReview,
  onChanged,
}: {
  post: PlayManagedPost;
  initiallyOpen?: boolean;
  onReview: (postId: string, participantId: string, action: 'accept' | 'reject') => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [candidates, setCandidates] = useState<ParticipantCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<ParticipantCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  const [message, setMessage] = useState('');
  const [kotyaraPolls, setKotyaraPolls] = useState<KotyaraPollOption[]>([]);
  const [kotyaraPollId, setKotyaraPollId] = useState('');
  const [includeKotyaraMaybe, setIncludeKotyaraMaybe] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(Boolean(initiallyOpen));
  const activeParticipants = post.participants.filter((participant) => !['cancelled', 'rejected'].includes(participant.status));
  const canChangeRoster = post.status !== 'cancelled';
  const canSettleAttendance = post.kind === 'game' && new Date(post.startsAt).getTime() <= Date.now() && post.status !== 'cancelled';
  const availableSlots = Math.max(0, post.capacity - post.confirmedCount);
  const quickInviteCandidates = candidates.filter((candidate) => candidate.userId).slice(0, availableSlots);
  const confirmedShare = post.priceMode === 'split' && post.courtCostRub && post.confirmedCount
    ? Math.ceil(post.courtCostRub / post.confirmedCount)
    : null;

  const findPlayers = useCallback(async (query: string, signal?: AbortSignal) => {
    setSearching(true);
    setLocalError('');
    setMessage('');
    try {
      if (isDevelopmentPreview()) {
        const previewCandidates: ParticipantCandidate[] = [
          { userId: 101, playerId: null, name: 'Анна Волкова', playerLevel: 'medium', registered: true, recommendationTags: ['last_roster', 'frequent_coplayer'], sharedGamesCount: 12 },
          { userId: 102, playerId: null, name: 'Максим Орлов', playerLevel: 'hard', registered: true, recommendationTags: ['available'], sharedGamesCount: 4 },
          { userId: 103, playerId: null, name: 'Илья Соколов', playerLevel: 'light', registered: true, recommendationTags: [], sharedGamesCount: 1 },
        ];
        const normalizedQuery = query.toLocaleLowerCase('ru');
        setCandidates(previewCandidates.filter((candidate) => candidate.name.toLocaleLowerCase('ru').includes(normalizedQuery)));
        return;
      }
      const response = await fetch(`/api/play-posts/${post.id}/participants?q=${encodeURIComponent(query)}`, { cache: 'no-store', signal });
      const data = await response.json().catch(() => ([]));
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить игроков');
      setCandidates(data as ParticipantCandidate[]);
      if (!data.length) setMessage(query ? 'Игроки не найдены или уже приглашены' : 'Все зарегистрированные игроки уже добавлены или приглашены');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLocalError(error instanceof Error ? error.message : 'Ошибка загрузки игроков');
    } finally {
      if (!signal?.aborted) setSearching(false);
    }
  }, [post.id]);

  useEffect(() => {
    const query = search.trim();
    if (query.length === 1) {
      setCandidates([]);
      setSearching(false);
      setLocalError('');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void findPlayers(query, controller.signal);
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, findPlayers]);

  useEffect(() => {
    if (post.kind !== 'game' || !canChangeRoster || isDevelopmentPreview()) return;
    const controller = new AbortController();
    void fetch(`/api/play-posts/${post.id}/kotyara-poll`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ([]));
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить опросы Котяры');
        const polls = Array.isArray(data) ? data as KotyaraPollOption[] : [];
        setKotyaraPolls(polls);
        setKotyaraPollId((current) => current || polls[0]?.id || '');
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setLocalError(error instanceof Error ? error.message : 'Ошибка опросов Котяры');
      });
    return () => controller.abort();
  }, [post.id, post.kind, canChangeRoster]);

  async function importKotyaraPoll() {
    if (!kotyaraPollId) return;
    setBusy('kotyara-import');
    setLocalError('');
    setMessage('');
    try {
      const response = await fetch(`/api/play-posts/${post.id}/kotyara-poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: kotyaraPollId, includeMaybe: includeKotyaraMaybe }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось добавить участников опроса');
      setMessage(`Из Котяры добавлено: ${data.added || 0}${data.reserved ? `, в резерв: ${data.reserved}` : ''}${data.skipped ? `, уже были/пропущены: ${data.skipped}` : ''}`);
      await onChanged();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Ошибка импорта из Котяры');
    } finally {
      setBusy(null);
    }
  }

  function toggleCandidate(candidate: ParticipantCandidate) {
    const key = participantCandidateKey(candidate);
    setSelectedCandidates((current) => current.some((item) => participantCandidateKey(item) === key)
      ? current.filter((item) => participantCandidateKey(item) !== key)
      : [...current, candidate]);
  }

  async function processCandidates(targets: ParticipantCandidate[], action: 'invite' | 'add') {
    const eligible = action === 'invite' ? targets.filter((candidate) => candidate.userId) : targets;
    if (!eligible.length) return;
    setBusy(`bulk-${action}`);
    setLocalError('');
    setMessage('');
    try {
      const response = await fetch(`/api/play-posts/${post.id}/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: eligible.map((candidate) => action === 'invite'
            ? { action: 'invite', userId: candidate.userId }
            : { action: 'add', userId: candidate.userId, playerId: candidate.playerId }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось изменить состав');
      const completed = new Set(eligible.map(participantCandidateKey));
      setCandidates((current) => current.filter((candidate) => !completed.has(participantCandidateKey(candidate))));
      setSelectedCandidates((current) => current.filter((candidate) => !completed.has(participantCandidateKey(candidate))));
      const reserved = Array.isArray(data.results)
        ? data.results.filter((item: { outcome?: string }) => item.outcome === 'reserved').length
        : 0;
      setMessage(action === 'invite'
        ? `Приглашения отправлены: ${completed.size}`
        : reserved
          ? `В состав добавлено: ${completed.size - reserved}, в резерв: ${reserved}`
          : `Добавлено в состав: ${completed.size}`);
      if (action === 'add') await onChanged();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Ошибка изменения состава');
    } finally {
      setBusy(null);
    }
  }

  async function addGuest() {
    const name = guestName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      setLocalError('Укажите имя гостя');
      return;
    }
    if (!availableSlots) {
      setLocalError('В составе уже нет свободных мест');
      return;
    }
    setBusy('guest');
    setLocalError('');
    setMessage('');
    try {
      const response = await fetch(`/api/play-posts/${post.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName: name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось добавить гостя');
      setGuestName('');
      setMessage(`${name} добавлен как гость`);
      await onChanged();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Ошибка добавления гостя');
    } finally {
      setBusy(null);
    }
  }

  async function removePlayer(participantId: string, participantName: string) {
    if (!window.confirm(`Убрать ${participantName} из состава?`)) return;
    setBusy(`participant-${participantId}`);
    setLocalError('');
    setMessage('');
    try {
      const response = await fetch(`/api/play-posts/${post.id}/participants/${participantId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось убрать игрока');
      setMessage(`${participantName} убран из состава`);
      await onChanged();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Ошибка изменения состава');
    } finally {
      setBusy(null);
    }
  }

  async function settleAttendance(participantId: string, attendanceStatus: 'attended' | 'no_show') {
    setBusy(`attendance-${participantId}`);
    setLocalError('');
    try {
      const response = await fetch(`/api/play-posts/${post.id}/participants/${participantId}/attendance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendanceStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось отметить посещение');
      setMessage(attendanceStatus === 'attended' ? 'Посещение отмечено' : 'Неявка отмечена');
      await onChanged();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Ошибка отметки посещения');
    } finally {
      setBusy(null);
    }
  }

  async function copyGuestClaimLink(participantId: string, participantName: string) {
    setBusy(`claim-${participantId}`);
    setLocalError('');
    setMessage('');
    try {
      const response = await fetch(`/api/play-participants/${participantId}/claim-link`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось создать ссылку');
      await navigator.clipboard.writeText(String(data.url));
      setMessage(`Ссылка для ${participantName} скопирована. Отправьте её лично гостю.`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Ошибка создания ссылки');
    } finally {
      setBusy(null);
    }
  }

  return (
    <details open={rosterOpen} onToggle={(event) => setRosterOpen(event.currentTarget.open)} className="mt-4 border-t border-white/10 pt-3">
      <summary className="cursor-pointer text-xs font-bold text-text-secondary">
        Состав и заявки ({activeParticipants.length}) · добавить собранных игроков
      </summary>
      <div className="mt-3 grid gap-3">
        {activeParticipants.length ? (
          <div className="grid gap-2">
            {activeParticipants.map((participant) => (
              <div key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-light/30 px-3 py-2">
                <span className="text-sm font-semibold text-text-primary">
                  {participant.name}{' '}
                  <small className="font-normal text-text-secondary">· {PARTICIPANT_STATUS_LABELS[participant.status] || participant.status}</small>
                  {participant.attendanceStatus !== 'unknown' ? <small className={`ml-2 rounded-full px-2 py-0.5 font-normal ${participant.attendanceStatus === 'going' || participant.attendanceStatus === 'attended' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200'}`}>{ATTENDANCE_LABELS[participant.attendanceStatus]}</small> : null}
                </span>
                <div className="flex gap-2">
                  {participant.status === 'pending' ? (
                    <><button type="button" onClick={() => void onReview(post.id, participant.id, 'accept')} className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs text-emerald-200">Принять</button><button type="button" onClick={() => void onReview(post.id, participant.id, 'reject')} className="rounded-lg bg-red-400/10 px-3 py-1.5 text-xs text-red-200">Отклонить</button></>
                  ) : null}
                  {canSettleAttendance && participant.status === 'confirmed' ? <><button type="button" disabled={busy === `attendance-${participant.id}`} onClick={() => void settleAttendance(participant.id, 'attended')} className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs text-emerald-200">Был</button><button type="button" disabled={busy === `attendance-${participant.id}`} onClick={() => void settleAttendance(participant.id, 'no_show')} className="rounded-lg bg-rose-400/10 px-3 py-1.5 text-xs text-rose-200">Не пришёл</button></> : null}
                  {!participant.registered && !['cancelled', 'rejected'].includes(participant.status) ? <button type="button" disabled={busy === `claim-${participant.id}`} onClick={() => void copyGuestClaimLink(participant.id, participant.name)} className="rounded-lg border border-amber-300/25 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50">{busy === `claim-${participant.id}` ? 'Создаём…' : 'Ссылка регистрации'}</button> : null}
                  {canChangeRoster ? <button type="button" disabled={busy === `participant-${participant.id}`} onClick={() => void removePlayer(participant.id, participant.name)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-text-secondary disabled:opacity-50">Убрать</button> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-text-secondary">Состав пока пуст.</p>}

        {canChangeRoster ? (
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
            {post.kind === 'game' && kotyaraPolls.length ? <div className="mb-3 rounded-xl border border-orange-300/25 bg-orange-300/5 p-3">
              <strong className="text-sm text-text-primary">🐾 Добавить из опроса Котяры</strong>
              <p className="mt-1 text-[11px] leading-5 text-text-secondary">Добавим ответивших «иду»: связанные профили — как игроков LPVOLLEY, остальных — как гостей.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <select value={kotyaraPollId} onChange={(event) => setKotyaraPollId(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-white/10 bg-surface px-3 text-sm text-text-primary">
                  {kotyaraPolls.map((poll) => <option key={poll.id} value={poll.id}>{formatPlayDate(poll.startsAt, { day: 'numeric', month: 'short' })} · {poll.title} · идут {poll.goingCount}{poll.maybeCount ? ` · думают ${poll.maybeCount}` : ''}</option>)}
                </select>
                <button type="button" disabled={busy === 'kotyara-import'} onClick={() => void importKotyaraPoll()} className="min-h-11 rounded-xl bg-orange-500 px-4 text-xs font-black text-white disabled:opacity-50">{busy === 'kotyara-import' ? 'Добавляем…' : 'Добавить в игру'}</button>
              </div>
              <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={includeKotyaraMaybe} onChange={(event) => setIncludeKotyaraMaybe(event.target.checked)} className="h-4 w-4 accent-orange-500" />Также добавить ответивших «возможно»</label>
            </div> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong className="text-sm text-text-primary">{availableSlots === 1 ? 'Нужен ещё 1 игрок' : 'Игроки LPVOLLEY'}</strong><p className="mt-1 text-xs text-text-secondary">Выберите зарегистрированных пользователей: пригласите их или сразу добавьте в состав. Игра сохранится в профиле каждого.</p></div>
              <div className="flex flex-wrap items-center gap-2">{availableSlots > 0 && quickInviteCandidates.length ? <button type="button" disabled={Boolean(busy) || post.status !== 'published'} onClick={() => void processCandidates(quickInviteCandidates, 'invite')} className="min-h-10 rounded-xl bg-brand px-3 text-xs font-black text-white disabled:opacity-40">Пригласить {quickInviteCandidates.length} подходящ{quickInviteCandidates.length === 1 ? 'его' : 'их'}</button> : null}<span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-200">{post.confirmedCount}/{post.capacity}</span>{confirmedShare ? <span className="rounded-full bg-orange-300/10 px-2.5 py-1 text-[11px] font-bold text-orange-800 dark:text-orange-200">сейчас ≈ {confirmedShare} ₽/чел.</span> : null}</div>
            </div>
            <div className="relative mt-3">
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2.5 pr-20 text-sm text-text-primary outline-none focus:border-cyan-300/60" placeholder="Найти по имени или выбрать из списка" autoComplete="off" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-text-secondary">{searching ? 'Загружаем…' : search.trim().length === 1 ? 'ещё 1 буква' : ''}</span>
            </div>
            {!search.trim() ? <div className="mt-3 flex flex-wrap gap-2">{(Object.keys(RECOMMENDATION_LABELS) as Array<keyof typeof RECOMMENDATION_LABELS>).map((tag) => {
              const suggested = candidates.filter((candidate) => candidate.recommendationTags?.includes(tag));
              return suggested.length ? <button key={tag} type="button" onClick={() => setSelectedCandidates((current) => {
                const merged = new Map([...current, ...suggested].map((candidate) => [participantCandidateKey(candidate), candidate]));
                return [...merged.values()];
              })} className="min-h-10 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 text-xs font-bold text-cyan-100">{RECOMMENDATION_LABELS[tag]} · {suggested.length}</button> : null;
            })}</div> : null}
            {selectedCandidates.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-surface/50 p-2.5">
                <span className="mr-auto text-xs font-bold text-text-primary">Выбрано: {selectedCandidates.length}</span>
                <button type="button" disabled={Boolean(busy) || post.status !== 'published'} onClick={() => void processCandidates(selectedCandidates, 'invite')} className="rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40">Пригласить выбранных</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void processCandidates(selectedCandidates, 'add')} className="rounded-lg bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-40">{availableSlots ? 'Добавить выбранных' : 'Добавить в резерв'}</button>
              </div>
            ) : null}
            {candidates.length ? <div className="mt-3 grid gap-2">{candidates.map((candidate) => (
              <div key={participantCandidateKey(candidate)} className="flex flex-col gap-2 rounded-lg bg-surface/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-w-0 cursor-pointer items-start gap-2 text-xs font-semibold text-text-primary"><input type="checkbox" checked={selectedCandidates.some((item) => participantCandidateKey(item) === participantCandidateKey(candidate))} onChange={() => toggleCandidate(candidate)} className="mt-1 h-4 w-4 accent-orange-500" /><span className="min-w-0"><span className="block truncate">{candidate.name}{candidate.playerLevel ? <small className="ml-2 font-normal text-text-secondary">{PLAY_LEVEL_LABELS[candidate.playerLevel]}</small> : null}<small className="ml-2 font-normal text-emerald-200">зарегистрирован</small>{candidate.reliability ? <small className="ml-2 font-normal text-emerald-200">· надёжность {candidate.reliability.score == null ? 'новичок' : `${candidate.reliability.score}%`}</small> : null}</span>{candidate.recommendationTags?.length ? <span className="mt-1 flex flex-wrap gap-1">{candidate.recommendationTags.map((tag) => <small key={tag} className="rounded-full bg-cyan-300/10 px-2 py-0.5 font-normal text-cyan-100">{RECOMMENDATION_LABELS[tag]}{tag === 'frequent_coplayer' && candidate.sharedGamesCount ? ` · ${candidate.sharedGamesCount}` : ''}</small>)}</span> : null}</span></label>
                <div className="flex shrink-0 gap-2 pl-6 sm:pl-0">
                  <button type="button" disabled={Boolean(busy) || post.status !== 'published'} onClick={() => void processCandidates([candidate], 'invite')} className="rounded-lg border border-cyan-300/25 px-3 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-40">Пригласить</button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void processCandidates([candidate], 'add')} className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-40">{availableSlots ? '+ В состав' : '+ В резерв'}</button>
                </div>
              </div>
            ))}</div> : null}
            <div className="mt-3 rounded-xl border border-dashed border-white/15 p-3">
              <p className="text-xs font-bold text-text-primary">Нет аккаунта на LPVOLLEY?</p>
              <p className="mt-1 text-[11px] leading-5 text-text-secondary">Добавьте участника по имени. Он попадёт в состав и результат матча, но без аккаунта личная статистика и рейтинг ему не начисляются.</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addGuest(); } }} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-300/60" placeholder="Имя и фамилия гостя" maxLength={100} />
                <button type="button" disabled={busy === 'guest' || !availableSlots} onClick={() => void addGuest()} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-text-primary disabled:opacity-40">+ Добавить гостя</button>
              </div>
            </div>
            {localError ? <p className="mt-2 text-xs text-rose-200">{localError}</p> : null}
            {message ? <p className="mt-2 text-xs text-emerald-200">✓ {message}</p> : null}
          </div>
        ) : null}

        {post.kind === 'game' ? <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] leading-5 text-text-secondary">Быстрая проверка: добавьте состав → проведите игру → внесите счёт → организатор утвердит результат → статистика и рейтинг обновятся.</p> : null}
      </div>
    </details>
  );
}
