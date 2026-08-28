'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PlayerPhoto from '@/components/ui/PlayerPhoto';

type Relation = 'together' | 'against';
type Outcome = 'win' | 'loss' | 'draw';
type SortKey = 'total' | 'together' | 'against';
type CandidateView = 'cards' | 'list';
type HistoryFilter = 'all' | Relation;

type Streak = {
  outcome: Outcome;
  count: number;
};

type RelationStats = {
  meetings: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type TeamPlayer = {
  id: string;
  name: string;
  photoUrl?: string;
};

type Meeting = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  format: 'THAI';
  relation: Relation;
  outcome: Outcome;
  scoreLabel: string;
  scoreFor?: number;
  scoreAgainst?: number;
  pointDiff?: number;
  stageLabel: string;
  team1?: TeamPlayer[];
  team2?: TeamPlayer[];
};

type Candidate = {
  id: string;
  name: string;
  photoUrl: string;
  totalMeetings: number;
  togetherMeetings: number;
  togetherWins: number;
  togetherLosses: number;
  togetherWinRate: number;
  againstMeetings: number;
  againstWins: number;
  againstLosses: number;
  againstWinRate: number;
  totalWins: number;
  totalDraws?: number;
  winRate: number;
  lastMeetingDate?: string;
  recentForm?: Outcome[];
  currentStreak?: Streak | null;
};

type Highlights = {
  frequentPartner: Candidate | null;
  mainRival: Candidate | null;
  bestPartner: Candidate | null;
  toughestRival: Candidate | null;
};

type OverviewSummary = {
  opponents: number;
  uniqueMatches: number;
  tournaments: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  firstDate: string;
  lastDate: string;
  recentForm: Outcome[];
  currentStreak: Streak | null;
};

type CandidatePayload = {
  players: Candidate[];
  highlights: Highlights;
  summary?: OverviewSummary;
  error?: string;
};

type TournamentGroup = {
  id: string;
  name: string;
  date: string;
  meetings: number;
  wins: number;
  losses: number;
  draws: number;
  together: RelationStats;
  against: RelationStats;
  items: Meeting[];
};

type PairDetails = {
  together: RelationStats;
  against: RelationStats;
  total?: RelationStats;
  byFormat: Array<{
    format: 'THAI';
    together: RelationStats;
    against: RelationStats;
  }>;
  meetings: Meeting[];
  recentForm?: Outcome[];
  currentStreak?: Streak | null;
  longestWinStreak?: number;
  closeMatches?: number;
  standout?: {
    biggestWin: Meeting | null;
    closestMatch: Meeting | null;
  };
  tournaments?: TournamentGroup[];
  coverage: {
    firstDate: string;
    lastDate: string;
    formats: string[];
    tournamentCount?: number;
  };
  error?: string;
};

const EMPTY_HIGHLIGHTS: Highlights = {
  frequentPartner: null,
  mainRival: null,
  bestPartner: null,
  toughestRival: null,
};

const VIEW_STORAGE_KEY = 'lpvolley-player-meetings-view-v2';

async function parseApiJson<T>(response: Response, fallback: string): Promise<T> {
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error(fallback);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(fallback);
  }
}

function formatDate(value?: string, year = true): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
  });
}

function plural(value: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(value) % 100;
  const mod10 = Math.abs(value) % 10;
  const form =
    mod100 >= 11 && mod100 <= 14 ? forms[2] : mod10 === 1 ? forms[0] : mod10 >= 2 && mod10 <= 4 ? forms[1] : forms[2];
  return `${value} ${form}`;
}

function initials(name: string): string {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function outcomeLabel(outcome: Outcome): string {
  return outcome === 'win' ? 'Победа' : outcome === 'loss' ? 'Поражение' : 'Ничья';
}

function streakLabel(streak?: Streak | null): string {
  if (!streak?.count) return 'Серия ещё не сложилась';
  const noun =
    streak.outcome === 'win'
      ? plural(streak.count, ['победа', 'победы', 'побед'])
      : streak.outcome === 'loss'
        ? plural(streak.count, ['поражение', 'поражения', 'поражений'])
        : plural(streak.count, ['ничья', 'ничьи', 'ничьих']);
  return `${noun} подряд`;
}

function relationBalance(stats: RelationStats): string {
  return `${stats.wins}:${stats.losses}${stats.draws ? `:${stats.draws}` : ''}`;
}

function CandidateAvatar({ player, size = 'md' }: { player: Pick<Candidate, 'name' | 'photoUrl'>; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16 sm:h-[76px] sm:w-[76px]' : 'h-11 w-11';
  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--profile-border)] bg-[var(--profile-soft)] text-sm font-black text-[var(--profile-text)]`}
    >
      {player.photoUrl ? (
        <PlayerPhoto
          photoUrl={player.photoUrl}
          alt={player.name}
          width={88}
          height={88}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(player.name)
      )}
    </span>
  );
}

function FormStrip({ outcomes, compact = false }: { outcomes?: Outcome[]; compact?: boolean }) {
  const items = outcomes?.slice(0, 5) ?? [];
  if (!items.length) return <span className="text-xs text-[var(--profile-muted)]">Нет формы</span>;
  return (
    <span className="flex items-center gap-1" aria-label={`Последние результаты: ${items.map(outcomeLabel).join(', ')}`}>
      {items.map((outcome, index) => (
        <span
          key={`${outcome}-${index}`}
          title={outcomeLabel(outcome)}
          className={`${compact ? 'h-2 w-2' : 'h-7 min-w-7 px-1'} flex items-center justify-center rounded-full text-[9px] font-black ${
            outcome === 'win'
              ? 'bg-emerald-400/18 text-emerald-300'
              : outcome === 'loss'
                ? 'bg-red-400/18 text-red-300'
                : 'bg-slate-400/18 text-[var(--profile-muted-strong)]'
          }`}
          aria-hidden="true"
        >
          {compact ? '' : outcome === 'win' ? 'П' : outcome === 'loss' ? 'ПР' : 'Н'}
        </span>
      ))}
    </span>
  );
}

function WinRateBar({ stats, tone }: { stats: RelationStats; tone: 'cold' | 'warm' }) {
  const color = tone === 'cold' ? 'bg-[#26c6ff]' : 'bg-[#ff6a00]';
  return (
    <div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--profile-soft)]"
        role="img"
        aria-label={`${stats.winRate}% побед`}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(stats.winRate, 100))}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--profile-muted)]">
        <span>{plural(stats.meetings, ['матч', 'матча', 'матчей'])}</span>
        <span>{stats.winRate}% побед</span>
      </div>
    </div>
  );
}

function RelationCard({
  title,
  eyebrow,
  stats,
  tone,
  emptyText,
}: {
  title: string;
  eyebrow: string;
  stats: RelationStats;
  tone: 'cold' | 'warm';
  emptyText: string;
}) {
  return (
    <article className="rounded-[24px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-4 sm:p-5">
      <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${tone === 'cold' ? 'text-cyan-300' : 'text-orange-300'}`}>
        {eyebrow}
      </div>
      <div className="mt-1 text-lg font-semibold text-[var(--profile-text)]">{title}</div>
      {stats.meetings ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className={`font-heading text-5xl leading-none ${tone === 'cold' ? 'text-[#26c6ff]' : 'text-[#ff6a00]'}`}>
              {relationBalance(stats)}
            </div>
            <div className="pb-1 text-right text-xs text-[var(--profile-muted)]">
              <div>{stats.wins} побед</div>
              <div>{stats.losses} поражений</div>
            </div>
          </div>
          <div className="mt-4">
            <WinRateBar stats={stats} tone={tone} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-[var(--profile-muted)]">{emptyText}</p>
      )}
    </article>
  );
}

function TeamNames({
  players,
  primaryId,
  selectedId,
  align,
}: {
  players?: TeamPlayer[];
  primaryId: string;
  selectedId: string;
  align: 'left' | 'right';
}) {
  if (!players?.length) return <span className="text-[var(--profile-muted)]">Состав не сохранён</span>;
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      {players.map((player) => {
        const highlighted = player.id === primaryId || player.id === selectedId;
        return (
          <span
            key={player.id}
            className={`max-w-full truncate text-xs ${highlighted ? 'font-bold text-[var(--profile-text)]' : 'text-[var(--profile-muted)]'}`}
          >
            {player.name}
          </span>
        );
      })}
    </span>
  );
}

function fallbackTournamentGroups(meetings: Meeting[]): TournamentGroup[] {
  const groups = new Map<string, TournamentGroup>();
  for (const meeting of meetings) {
    const current = groups.get(meeting.tournamentId) ?? {
      id: meeting.tournamentId,
      name: meeting.tournamentName,
      date: meeting.tournamentDate,
      meetings: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      together: { meetings: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
      against: { meetings: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
      items: [],
    };
    current.meetings += 1;
    current[meeting.outcome === 'win' ? 'wins' : meeting.outcome === 'loss' ? 'losses' : 'draws'] += 1;
    const relation = current[meeting.relation];
    relation.meetings += 1;
    relation[meeting.outcome === 'win' ? 'wins' : meeting.outcome === 'loss' ? 'losses' : 'draws'] += 1;
    relation.winRate = Math.round((relation.wins / relation.meetings) * 100);
    current.items.push(meeting);
    groups.set(meeting.tournamentId, current);
  }
  return [...groups.values()];
}

function deriveTotal(details: PairDetails): RelationStats {
  if (details.total) return details.total;
  const wins = details.together.wins + details.against.wins;
  const losses = details.together.losses + details.against.losses;
  const draws = details.together.draws + details.against.draws;
  const meetings = details.together.meetings + details.against.meetings;
  return { meetings, wins, losses, draws, winRate: meetings ? Math.round((wins / meetings) * 100) : 0 };
}

function pairNarrative(details: PairDetails): string {
  const together = details.together;
  const against = details.against;
  if (together.meetings && against.meetings) {
    if (together.winRate >= against.winRate + 10) {
      return `Связка работает лучше: ${together.winRate}% побед вместе против ${against.winRate}% в дуэлях.`;
    }
    if (against.winRate >= together.winRate + 10) {
      return `В дуэлях результат выше: ${against.winRate}% побед против ${together.winRate}% в одной команде.`;
    }
    return 'Пара одинаково уверенно выглядит и в связке, и по разные стороны сетки.';
  }
  if (together.meetings) return 'Пока встречались только как партнёры — вся история пары собрана ниже.';
  if (against.meetings) return 'Пока встречались только как соперники — это чистая история дуэли.';
  return 'У пары пока нет матчей с сохранёнными составами и счётом.';
}

function CandidateRow({
  candidate,
  rank,
  view,
  active,
  onOpen,
  onHover,
}: {
  candidate: Candidate;
  rank: number;
  view: CandidateView;
  active: boolean;
  onOpen: () => void;
  onHover: () => void;
}) {
  const drawSuffix = candidate.totalDraws ? ` · ${candidate.totalDraws} нич.` : '';
  if (view === 'list') {
    return (
      <button
        id={`h2h-option-${candidate.id}`}
        type="button"
        role="option"
        aria-selected={active}
        onClick={onOpen}
        onMouseEnter={onHover}
        className={`grid min-h-16 w-full grid-cols-[minmax(0,1fr)_50px_50px] items-center gap-2 border-b border-[var(--profile-border)] px-3 py-2 text-left transition last:border-b-0 sm:grid-cols-[minmax(0,1fr)_92px_92px_76px] ${
          active ? 'bg-[var(--profile-soft)]' : 'hover:bg-[var(--profile-soft)]'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="w-5 shrink-0 text-center text-[11px] font-black text-[var(--profile-muted)]">{rank}</span>
          <CandidateAvatar player={candidate} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--profile-text)]">{candidate.name}</span>
            <span className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--profile-muted)]">
              <span>{plural(candidate.totalMeetings, ['встреча', 'встречи', 'встреч'])}</span>
              <span className="hidden sm:inline">до {formatDate(candidate.lastMeetingDate, false)}</span>
              <span className="sm:hidden"><FormStrip outcomes={candidate.recentForm} compact /></span>
            </span>
          </span>
        </span>
        <span className="text-right text-xs">
          <span className="block font-black text-cyan-300">{candidate.togetherMeetings}</span>
          <span className="hidden text-[10px] text-[var(--profile-muted)] sm:block">{candidate.togetherWins}:{candidate.togetherLosses}</span>
        </span>
        <span className="text-right text-xs">
          <span className="block font-black text-orange-300">{candidate.againstMeetings}</span>
          <span className="hidden text-[10px] text-[var(--profile-muted)] sm:block">{candidate.againstWins}:{candidate.againstLosses}</span>
        </span>
        <span className="hidden justify-self-end sm:block">
          <FormStrip outcomes={candidate.recentForm} compact />
          <span className="sr-only">{drawSuffix}</span>
        </span>
      </button>
    );
  }

  const togetherWidth = candidate.totalMeetings ? (candidate.togetherMeetings / candidate.totalMeetings) * 100 : 0;
  return (
    <button
      id={`h2h-option-${candidate.id}`}
      type="button"
      role="option"
      aria-selected={active}
      onClick={onOpen}
      onMouseEnter={onHover}
      className={`min-w-0 rounded-[22px] border bg-[var(--profile-card)] p-3.5 text-left transition ${
        active ? 'border-[var(--profile-accent)]' : 'border-[var(--profile-border)] hover:border-[var(--profile-accent)]'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="w-5 shrink-0 text-center text-xs font-black text-[var(--profile-muted)]">{rank}</span>
        <CandidateAvatar player={candidate} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--profile-text)]">{candidate.name}</span>
          <span className="mt-0.5 block text-xs text-[var(--profile-muted)]">
            {plural(candidate.totalMeetings, ['встреча', 'встречи', 'встреч'])} · {formatDate(candidate.lastMeetingDate, false)}
          </span>
        </span>
        <FormStrip outcomes={candidate.recentForm} compact />
      </span>
      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-orange-400/55" aria-hidden="true">
        <span className="block h-full bg-cyan-400" style={{ width: `${togetherWidth}%` }} />
      </span>
      <span className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
        <span className="text-cyan-300">
          Вместе {candidate.togetherMeetings} · {candidate.togetherWins}:{candidate.togetherLosses}
        </span>
        <span className="text-right text-orange-300">
          Против {candidate.againstMeetings} · {candidate.againstWins}:{candidate.againstLosses}
        </span>
      </span>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-label="Считаем личные встречи" aria-busy="true">
      <div className="h-12 animate-pulse rounded-2xl bg-[var(--profile-soft)]" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-[22px] bg-[var(--profile-soft)]" />
        <div className="h-28 animate-pulse rounded-[22px] bg-[var(--profile-soft)]" />
      </div>
    </div>
  );
}

export default function PlayerHeadToHead({
  playerId,
  playerName,
  playerPhotoUrl = '',
}: {
  playerId: string;
  playerName: string;
  playerPhotoUrl?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('total');
  const [view, setView] = useState<CandidateView>('list');
  const [players, setPlayers] = useState<Candidate[]>([]);
  const [highlights, setHighlights] = useState<Highlights>(EMPTY_HIGHLIGHTS);
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [details, setDetails] = useState<PairDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [visibleCount, setVisibleCount] = useState(12);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const deepLinkHandled = useRef(false);

  const updateUrl = useCallback((otherId?: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('section', 'meetings');
      if (otherId) url.searchParams.set('vs', otherId);
      else url.searchParams.delete('vs');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // URL state is a progressive enhancement.
    }
  }, []);

  const openCandidate = useCallback(
    async (candidate: Candidate) => {
      setSelected(candidate);
      setDetails(null);
      setDetailLoading(true);
      setHistoryFilter('all');
      setError('');
      setCopied(false);
      updateUrl(candidate.id);
      try {
        const response = await fetch(
          `/api/players/${encodeURIComponent(playerId)}/head-to-head?otherId=${encodeURIComponent(candidate.id)}`,
        );
        const payload = await parseApiJson<PairDetails>(response, 'Сервис личных встреч временно недоступен');
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить встречи');
        setDetails(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить встречи');
      } finally {
        setDetailLoading(false);
      }
    },
    [playerId, updateUrl],
  );

  useEffect(() => {
    try {
      if (window.matchMedia('(min-width: 640px)').matches && window.localStorage.getItem(VIEW_STORAGE_KEY) === 'cards') {
        setView('cards');
      }
    } catch {
      // Keep the compact default.
    }
  }, []);

  useEffect(() => {
    if (selected) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError('');
        try {
          const response = await fetch(
            `/api/players/${encodeURIComponent(playerId)}/head-to-head?q=${encodeURIComponent(query)}&limit=50&sort=${sort}`,
            { signal: controller.signal },
          );
          const payload = await parseApiJson<CandidatePayload>(response, 'Сервис личных встреч временно недоступен');
          if (!response.ok) throw new Error(payload.error || 'Не удалось найти игроков');
          const nextPlayers = Array.isArray(payload.players) ? payload.players : [];
          setPlayers(nextPlayers);
          setHighlights(payload.highlights ?? EMPTY_HIGHLIGHTS);
          setSummary(payload.summary ?? null);
          setVisibleCount(12);
          setActiveIndex(-1);

          if (!deepLinkHandled.current) {
            deepLinkHandled.current = true;
            const requestedId = new URL(window.location.href).searchParams.get('vs');
            const requestedPlayer = requestedId ? nextPlayers.find((player) => player.id === requestedId) : null;
            if (requestedPlayer) void openCandidate(requestedPlayer);
          }
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
          setError(caught instanceof Error ? caught.message : 'Не удалось найти игроков');
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [openCandidate, playerId, query, reloadKey, selected, sort]);

  const visiblePlayers = players.slice(0, visibleCount);
  const groups = useMemo(() => {
    if (!details) return [];
    const source = details.tournaments?.length ? details.tournaments : fallbackTournamentGroups(details.meetings);
    if (historyFilter === 'all') return source;
    return source
      .map((group) => {
        const items = group.items.filter((meeting) => meeting.relation === historyFilter);
        return {
          ...group,
          meetings: items.length,
          wins: items.filter((meeting) => meeting.outcome === 'win').length,
          losses: items.filter((meeting) => meeting.outcome === 'loss').length,
          draws: items.filter((meeting) => meeting.outcome === 'draw').length,
          items,
        };
      })
      .filter((group) => group.items.length);
  }, [details, historyFilter]);

  const chooseView = (next: CandidateView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // A display preference does not need persistence to work.
    }
  };

  const clearSelection = () => {
    setSelected(null);
    setDetails(null);
    setError('');
    setQuery('');
    setCopied(false);
    updateUrl();
  };

  const copyComparison = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!visiblePlayers.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, visiblePlayers.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      void openCandidate(visiblePlayers[activeIndex]);
    } else if (event.key === 'Escape') {
      setActiveIndex(-1);
    }
  };

  if (selected) {
    const total = details ? deriveTotal(details) : null;
    const tournamentCount = details?.coverage.tournamentCount ?? groups.length;
    const title = details
      ? details.together.meetings && details.against.meetings
        ? 'Связка и дуэль'
        : details.together.meetings
          ? 'Проверенная связка'
          : 'Личная дуэль'
      : 'Досье пары';
    const biggestWin = details?.standout?.biggestWin;
    const closestMatch = details?.standout?.closestMatch;

    return (
      <section
        className="overflow-hidden rounded-[28px] border border-[var(--profile-border)] bg-[var(--profile-panel)]"
        data-player-head-to-head
        data-head-to-head-version="2"
      >
        <div className="border-b border-[var(--profile-border)] bg-[linear-gradient(135deg,var(--profile-soft),transparent_72%)] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--profile-muted-strong)] transition hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)]"
            >
              ← Все игроки
            </button>
            <button
              type="button"
              onClick={copyComparison}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--profile-border)] px-4 text-xs font-bold text-[var(--profile-muted-strong)] transition hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)]"
            >
              {copied ? 'Ссылка скопирована' : 'Скопировать сравнение'}
            </button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex shrink-0 -space-x-4">
                <CandidateAvatar player={{ name: playerName, photoUrl: playerPhotoUrl }} size="lg" />
                <CandidateAvatar player={selected} size="lg" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--profile-accent)]">{title}</div>
                <h2 className="mt-1 font-heading text-3xl leading-none text-[var(--profile-text)] sm:truncate sm:text-4xl">
                  {playerName} × {selected.name}
                </h2>
                <p className="mt-2 text-sm text-[var(--profile-muted)]">
                  Подтверждённые THAI · сохранены составы и счёт
                </p>
              </div>
            </div>
            {total ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-2 text-center">
                  <div className="font-heading text-2xl text-[var(--profile-text)]">{total.meetings}</div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--profile-muted)]">матчей</div>
                </div>
                <div className="rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-2 text-center">
                  <div className="font-heading text-2xl text-[var(--profile-text)]">{tournamentCount}</div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--profile-muted)]">турниров</div>
                </div>
                <div className="rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-2 text-center">
                  <div className="font-heading text-2xl text-[var(--profile-accent)]">{total.winRate}%</div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--profile-muted)]">побед</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {detailLoading ? <LoadingSkeleton /> : null}

          {!detailLoading && error ? (
            <div className="rounded-[22px] border border-red-400/30 bg-red-500/10 px-4 py-5 text-sm text-red-200" role="alert">
              <div className="font-semibold">{error}</div>
              <button
                type="button"
                onClick={() => void openCandidate(selected)}
                className="mt-3 min-h-11 rounded-xl border border-red-300/30 px-4 font-bold"
              >
                Повторить
              </button>
            </div>
          ) : null}

          {!detailLoading && details ? (
            <>
              <div className="rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-soft)] px-4 py-3 text-sm font-medium leading-6 text-[var(--profile-text)]">
                {pairNarrative(details)}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <RelationCard
                  eyebrow="Связка"
                  title="В одной команде"
                  stats={details.together}
                  tone="cold"
                  emptyText="В записанных матчах ещё не играли вместе."
                />
                <RelationCard
                  eyebrow="Дуэль"
                  title="Друг против друга"
                  stats={details.against}
                  tone="warm"
                  emptyText="В записанных матчах ещё не играли по разные стороны сетки."
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--profile-muted)]">Последние 5</div>
                  <div className="mt-3"><FormStrip outcomes={details.recentForm ?? details.meetings.slice(0, 5).map((item) => item.outcome)} /></div>
                </div>
                <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--profile-muted)]">Текущая серия</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--profile-text)]">{streakLabel(details.currentStreak)}</div>
                </div>
                <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--profile-muted)]">Лучшая серия</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--profile-text)]">
                    {details.longestWinStreak ? plural(details.longestWinStreak, ['победа', 'победы', 'побед']) : '—'}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--profile-muted)]">Плотные концовки</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--profile-text)]">
                    {details.closeMatches ? plural(details.closeMatches, ['матч', 'матча', 'матчей']) : 'Нет'}
                  </div>
                </div>
              </div>

              {biggestWin || closestMatch ? (
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  {biggestWin ? (
                    <div className="min-w-0 rounded-[20px] border border-emerald-400/25 bg-emerald-400/8 px-4 py-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300">Самая крупная победа</div>
                      <div className="mt-1 flex items-end justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--profile-text)]">{biggestWin.tournamentName}</span>
                        <span className="shrink-0 font-heading text-2xl text-emerald-300">{biggestWin.scoreLabel}</span>
                      </div>
                    </div>
                  ) : null}
                  {closestMatch ? (
                    <div className="min-w-0 rounded-[20px] border border-amber-300/25 bg-amber-300/8 px-4 py-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-200">Самый плотный матч</div>
                      <div className="mt-1 flex items-end justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--profile-text)]">{closestMatch.tournamentName}</span>
                        <span className="shrink-0 font-heading text-2xl text-amber-200">{closestMatch.scoreLabel}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--profile-text)]">Матч за матчем</h3>
                  <p className="mt-0.5 text-xs text-[var(--profile-muted)]">
                    {details.coverage.firstDate
                      ? `${formatDate(details.coverage.firstDate)} — ${formatDate(details.coverage.lastDate)}`
                      : 'Нет матчей с сохранёнными составами'}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Фильтр истории личных встреч"
                  className="flex min-h-11 rounded-xl border border-[var(--profile-border)] bg-[var(--profile-soft)] p-1"
                >
                  {([
                    ['all', 'Все'],
                    ['together', 'Вместе'],
                    ['against', 'Против'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={historyFilter === value}
                      onClick={() => setHistoryFilter(value)}
                      className={`min-h-9 rounded-lg px-3 text-[10px] font-bold uppercase tracking-[0.08em] transition ${
                        historyFilter === value
                          ? 'bg-[var(--profile-card)] text-[var(--profile-text)] shadow-sm'
                          : 'text-[var(--profile-muted)] hover:text-[var(--profile-text)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {groups.map((group, groupIndex) => (
                  <details
                    key={group.id}
                    open={groupIndex === 0}
                    className="group overflow-hidden rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)]"
                  >
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]">{formatDate(group.date)}</span>
                        <Link
                          href={`/calendar/${group.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5 block truncate text-sm font-semibold text-[var(--profile-text)] hover:text-[var(--profile-accent)]"
                        >
                          {group.name}
                        </Link>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-right">
                          <span className="block text-sm font-black text-[var(--profile-text)]">{group.wins}:{group.losses}</span>
                          <span className="block text-[9px] uppercase tracking-[0.1em] text-[var(--profile-muted)]">
                            {plural(group.meetings, ['матч', 'матча', 'матчей'])}
                          </span>
                        </span>
                        <span className="text-lg text-[var(--profile-muted)] transition group-open:rotate-180" aria-hidden="true">⌄</span>
                      </span>
                    </summary>
                    <div className="border-t border-[var(--profile-border)]">
                      {group.items.map((meeting) => (
                        <article
                          key={meeting.id}
                          className="border-b border-[var(--profile-border)] px-3 py-3 last:border-b-0 sm:px-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${
                                meeting.relation === 'together'
                                  ? 'bg-cyan-500/12 text-cyan-300'
                                  : 'bg-orange-500/12 text-orange-300'
                              }`}
                            >
                              {meeting.relation === 'together' ? 'Вместе' : 'Против'}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--profile-muted)]">{meeting.stageLabel}</span>
                          </div>
                          {meeting.team1?.length || meeting.team2?.length ? (
                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)] items-center gap-2">
                              <TeamNames players={meeting.team1} primaryId={playerId} selectedId={selected.id} align="right" />
                              <span className="text-center font-heading text-2xl text-[var(--profile-text)]">{meeting.scoreLabel}</span>
                              <TeamNames players={meeting.team2} primaryId={playerId} selectedId={selected.id} align="left" />
                            </div>
                          ) : (
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span
                                className={`text-xs font-black uppercase tracking-[0.1em] ${
                                  meeting.outcome === 'win'
                                    ? 'text-emerald-300'
                                    : meeting.outcome === 'loss'
                                      ? 'text-red-300'
                                      : 'text-[var(--profile-muted)]'
                                }`}
                              >
                                {outcomeLabel(meeting.outcome)}
                              </span>
                              <span className="font-heading text-2xl text-[var(--profile-text)]">{meeting.scoreLabel}</span>
                            </div>
                          )}
                          <div className="mt-2 text-right text-[10px] font-black uppercase tracking-[0.1em] text-[var(--profile-muted)]">
                            {outcomeLabel(meeting.outcome)}
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                ))}
                {!groups.length ? (
                  <div className="rounded-[22px] border border-dashed border-[var(--profile-border)] px-4 py-8 text-center text-sm text-[var(--profile-muted)]">
                    В выбранном режиме матчей пока нет.
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-xs leading-5 text-[var(--profile-muted)]">
                Статистика учитывает подтверждённые командные матчи THAI со счётом и сохранёнными составами. King of the Court сюда не входит.
              </p>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  const sameAnchorPlayer =
    highlights.frequentPartner &&
    highlights.mainRival &&
    highlights.frequentPartner.id === highlights.mainRival.id;
  const highlightCards = [
    sameAnchorPlayer
      ? {
          label: 'Главная связь',
          player: highlights.frequentPartner,
          detail: `${highlights.frequentPartner?.togetherMeetings ?? 0} вместе · ${highlights.mainRival?.againstMeetings ?? 0} против`,
          tone: 'text-violet-300',
        }
      : {
          label: 'Чаще в связке',
          player: highlights.frequentPartner,
          detail: highlights.frequentPartner
            ? `${plural(highlights.frequentPartner.togetherMeetings, ['матч', 'матча', 'матчей'])} вместе`
            : '',
          tone: 'text-cyan-300',
        },
    sameAnchorPlayer
      ? null
      : {
          label: 'Главная дуэль',
          player: highlights.mainRival,
          detail: highlights.mainRival
            ? `${plural(highlights.mainRival.againstMeetings, ['очный матч', 'очных матча', 'очных матчей'])}`
            : '',
          tone: 'text-orange-300',
        },
    {
      label: 'Лучшая связка',
      player: highlights.bestPartner,
      detail: highlights.bestPartner
        ? `${highlights.bestPartner.togetherWins}:${highlights.bestPartner.togetherLosses} в ${highlights.bestPartner.togetherMeetings} матчах`
        : '',
      tone: 'text-emerald-300',
    },
    {
      label: 'Неудобный соперник',
      player: highlights.toughestRival,
      detail: highlights.toughestRival
        ? `Баланс ${highlights.toughestRival.againstWins}:${highlights.toughestRival.againstLosses}`
        : '',
      tone: 'text-red-300',
    },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item?.player)) as Array<{
    label: string;
    player: Candidate;
    detail: string;
    tone: string;
  }>;

  return (
    <section
      className="rounded-[28px] border border-[var(--profile-border)] bg-[var(--profile-panel)] px-4 py-4 sm:px-6 sm:py-5"
      data-player-head-to-head
      data-head-to-head-version="2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--profile-text)]">Личные встречи</h2>
          <p className="mt-1 text-sm text-[var(--profile-muted)]">С кем сыгрывались в связке — и как расходились по разные стороны сетки.</p>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/8 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">
          THAI · составы + счёт
        </span>
      </div>

      <label htmlFor="head-to-head-player-search-v2" className="sr-only">Найти среди тех, с кем уже играли</label>
      <div className="relative mt-4">
        <input
          id="head-to-head-player-search-v2"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Найти среди тех, с кем уже играли"
          autoComplete="off"
          role="combobox"
          aria-expanded={visiblePlayers.length > 0}
          aria-controls="head-to-head-player-options-v2"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `h2h-option-${visiblePlayers[activeIndex]?.id}` : undefined}
          className="min-h-12 w-full rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 pr-20 text-sm text-[var(--profile-text)] outline-none placeholder:text-[var(--profile-muted)] focus:border-[var(--profile-accent)]"
        />
        {loading ? (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--profile-muted)]">Ищем…</span>
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-xl px-3 text-xs font-bold text-[var(--profile-muted)] hover:text-[var(--profile-text)]"
            aria-label="Очистить поиск"
          >
            Сбросить
          </button>
        ) : null}
      </div>

      {!query && summary && !loading ? (
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { value: summary.opponents, label: 'игроков в истории' },
            { value: summary.uniqueMatches, label: 'матчей со счётом' },
            { value: summary.tournaments, label: 'турниров учтено' },
            { value: `${summary.winRate}%`, label: 'побед в этих матчах' },
          ].map((item) => (
            <div key={item.label} className="rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-3">
              <div className="font-heading text-3xl leading-none text-[var(--profile-text)]">{item.value}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]">{item.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {!query && !loading && highlightCards.length ? (
        <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4" aria-label="Рекорды личных встреч">
          {highlightCards.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void openCandidate(item.player)}
              className="min-w-[220px] snap-start rounded-[20px] border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-3 text-left transition hover:border-[var(--profile-accent)] sm:min-w-0"
            >
              <span className={`block text-[9px] font-black uppercase tracking-[0.12em] ${item.tone}`}>{item.label}</span>
              <span className="mt-2 flex items-center gap-2.5">
                <CandidateAvatar player={item.player} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--profile-text)]">{item.player.name}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--profile-muted)]">{item.detail}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]">Сначала показать</div>
          <div role="group" aria-label="Сортировка игроков по личным встречам" className="mt-1 flex min-h-11 rounded-xl border border-[var(--profile-border)] bg-[var(--profile-soft)] p-1">
            {([
              ['total', 'Все встречи'],
              ['together', 'Чаще вместе'],
              ['against', 'Чаще против'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => setSort(value)}
                className={`min-h-9 rounded-lg px-3 text-[10px] font-bold uppercase tracking-[0.06em] transition ${
                  sort === value
                    ? 'bg-[var(--profile-card)] text-[var(--profile-text)] shadow-sm'
                    : 'text-[var(--profile-muted)] hover:text-[var(--profile-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden sm:block">
          <div className="text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--profile-muted)]">Вид</div>
          <div role="group" aria-label="Вид списка игроков" className="mt-1 flex min-h-11 rounded-xl border border-[var(--profile-border)] bg-[var(--profile-soft)] p-1">
            {([
              ['list', 'Списком'],
              ['cards', 'Карточки'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => chooseView(value)}
                className={`min-h-9 rounded-lg px-3 text-[10px] font-bold uppercase tracking-[0.08em] transition ${
                  view === value
                    ? 'bg-[var(--profile-card)] text-[var(--profile-text)] shadow-sm'
                    : 'text-[var(--profile-muted)] hover:text-[var(--profile-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !players.length ? <LoadingSkeleton /> : null}

      {!loading && error && !players.length ? (
        <div className="mt-4 rounded-[22px] border border-red-400/30 bg-red-500/10 px-4 py-5 text-sm text-red-200" role="alert">
          <div className="font-semibold">{error}</div>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mt-3 min-h-11 rounded-xl border border-red-300/30 px-4 font-bold"
          >
            Повторить
          </button>
        </div>
      ) : null}

      <div
        id="head-to-head-player-options-v2"
        role="listbox"
        aria-label={query ? 'Результаты поиска игроков' : 'Игроки для сравнения'}
        data-candidate-view={view}
        className={
          view === 'cards'
            ? 'mt-3 grid gap-2 sm:grid-cols-2'
            : 'mt-3 overflow-hidden rounded-[22px] border border-[var(--profile-border)] bg-[var(--profile-card)]'
        }
      >
        {view === 'list' && visiblePlayers.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)_50px_50px] gap-2 border-b border-[var(--profile-border)] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--profile-muted)] sm:grid-cols-[minmax(0,1fr)_92px_92px_76px]">
            <span>Игрок</span>
            <span className="text-right text-cyan-300">Вместе</span>
            <span className="text-right text-orange-300">Против</span>
            <span className="hidden text-right sm:block">Форма</span>
          </div>
        ) : null}
        {visiblePlayers.map((candidate, index) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            rank={index + 1}
            view={view}
            active={activeIndex === index}
            onHover={() => setActiveIndex(index)}
            onOpen={() => void openCandidate(candidate)}
          />
        ))}
      </div>

      {!loading && !visiblePlayers.length ? (
        <div className="mt-3 rounded-[22px] border border-dashed border-[var(--profile-border)] bg-[var(--profile-card)] px-4 py-8 text-center">
          <div className="text-base font-semibold text-[var(--profile-text)]">
            {query ? 'Совпадений среди сыгранных матчей нет' : 'Пока нет записанных личных встреч'}
          </div>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[var(--profile-muted)]">
            {query
              ? 'Попробуйте фамилию без имени или очистите поиск.'
              : 'Статистика появится после подтверждённого THAI-турнира с сохранёнными составами и счётом.'}
          </p>
        </div>
      ) : null}

      {players.length > visibleCount ? (
        <button
          type="button"
          onClick={() => setVisibleCount((value) => value + 12)}
          className="mt-3 min-h-12 w-full rounded-2xl border border-[var(--profile-border)] bg-[var(--profile-card)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--profile-muted-strong)] transition hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)]"
        >
          Показать ещё · {players.length - visibleCount}
        </button>
      ) : null}

      {error && players.length ? <p className="mt-3 text-xs text-red-300" role="status">{error}</p> : null}
      <p className="mt-4 text-xs leading-5 text-[var(--profile-muted)]">
        Один и тот же матч может попасть в статистику «вместе» для партнёра и «против» для соперников. Здесь не смешиваются эти две роли.
      </p>
    </section>
  );
}
