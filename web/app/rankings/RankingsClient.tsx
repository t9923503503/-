'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry, MedalEntry, RatingType, TournamentFormatFilter } from '@/lib/types';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import type { RankingCounts } from '@/lib/queries';

type SortMode = 'pts' | 'avg' | 'trn' | 'medals';

function zoneMeta(level: string) {
  const normalized = String(level || '').trim().toLowerCase();
  if (normalized === 'hard') {
    return { label: 'HARD', color: '#ff4d43', border: 'border-[#ff4d43]/45', chip: 'bg-[#2d1111] text-[#ff4d43]' };
  }
  if (normalized === 'advanced' || normalized === 'advance') {
    return { label: 'ADV', color: '#26c6ff', border: 'border-[#26c6ff]/45', chip: 'bg-[#0d1f29] text-[#26c6ff]' };
  }
  if (normalized === 'medium') {
    return { label: 'MED', color: '#ffb100', border: 'border-[#ffb100]/45', chip: 'bg-[#261b05] text-[#ffcf4d]' };
  }
  return { label: 'EASY', color: '#37d45d', border: 'border-[#37d45d]/45', chip: 'bg-[#0d2012] text-[#7cf293]' };
}

function sortEntries(entries: LeaderboardEntry[], mode: SortMode): LeaderboardEntry[] {
  const sorted = [...entries];
  if (mode === 'avg') {
    sorted.sort((left, right) => {
      const leftAvg = left.tournaments > 0 ? left.rating / left.tournaments : 0;
      const rightAvg = right.tournaments > 0 ? right.rating / right.tournaments : 0;
      return rightAvg - leftAvg;
    });
  } else if (mode === 'trn') {
    sorted.sort((left, right) => right.tournaments - left.tournaments || right.rating - left.rating);
  }
  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function sortLabel(mode: SortMode) {
  if (mode === 'avg') return 'СР.';
  if (mode === 'trn') return 'ТУР.';
  if (mode === 'medals') return 'ЗОЛ.';
  return 'РЕЙ.';
}

function sortValue(entry: LeaderboardEntry, mode: SortMode): string {
  if (mode === 'avg') {
    return entry.tournaments > 0 ? (entry.rating / entry.tournaments).toFixed(1) : '0';
  }
  if (mode === 'trn') return String(entry.tournaments);
  if (mode === 'medals') return String(entry.gold);
  return String(entry.rating);
}

function hasMedals(entry: Pick<LeaderboardEntry, 'gold' | 'silver' | 'bronze'>): boolean {
  return entry.gold > 0 || entry.silver > 0 || entry.bronze > 0;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function CountCard({
  value,
  label,
  accent,
  outlined = false,
}: {
  value: number;
  label: string;
  accent: string;
  outlined?: boolean;
}) {
  return (
    <div
      className={`rounded-[28px] border px-4 py-5 ${
        outlined ? 'border-[#7a4b00] bg-[#261701]' : 'border-white/6 bg-[#141414]'
      }`}
    >
      <div className={`text-center font-heading text-5xl leading-none ${accent}`}>{value}</div>
      <div className="mt-3 text-center text-[13px] font-medium uppercase tracking-[0.16em] text-white/45">
        {label}
      </div>
    </div>
  );
}

function SegmentedButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full border px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] transition ${
        active
          ? 'border-[#ff6a00] bg-[#ff6a00] text-white shadow-[0_10px_35px_rgba(255,106,0,0.28)]'
          : 'border-white/5 bg-[#181818] text-white/55 hover:text-white/75'
      }`}
    >
      {children}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
        active
          ? 'border-[#ff6a00] bg-[#1f1207] text-[#ff6a00]'
          : 'border-white/5 bg-[#171717] text-white/45 hover:text-white/75'
      }`}
    >
      {children}
    </button>
  );
}

function SortButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[18px] border px-3 py-3 text-xs font-bold uppercase tracking-[0.08em] transition ${
        active
          ? 'border-[#ffd400] bg-[#1f1904] text-[#ffd400]'
          : 'border-white/5 bg-[#151515] text-white/35 hover:text-white/65'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function PlayerAvatar({
  name,
  photoUrl,
  sizeClass,
}: {
  name: string;
  photoUrl: string;
  sizeClass: string;
}) {
  if (photoUrl) {
    return (
      <div className={`overflow-hidden rounded-full border border-white/10 ${sizeClass}`}>
        <PlayerPhoto photoUrl={photoUrl} alt={name} width={80} height={80} />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,#444,#151515_72%)] text-lg font-black text-white ${sizeClass}`}
    >
      {getInitials(name)}
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  sort,
}: {
  entry: LeaderboardEntry;
  place: 1 | 2 | 3;
  sort: SortMode;
}) {
  const tone =
    place === 1
      ? 'border-[#ffd400]/40 bg-[#261d03] text-[#ffd400]'
      : place === 2
        ? 'border-white/10 bg-[#1a1a1a] text-white'
        : 'border-white/10 bg-[#191919] text-[#d79247]';
  const imageWrap =
    place === 1
      ? 'h-28 w-28 border-[3px] border-[#ffd400]'
      : 'h-20 w-20 border-2 border-white/10';
  const rankWrap =
    place === 1 ? 'h-[112px] bg-[#4f3c02]' : place === 2 ? 'h-[86px] bg-[#2a2a2d]' : 'h-[76px] bg-[#3a2308]';

  return (
    <Link
      href={`/players/${entry.playerId}`}
      className={`flex flex-1 flex-col items-center rounded-[32px] border px-4 pt-5 transition hover:-translate-y-1 ${tone}`}
    >
      <PlayerAvatar name={entry.name} photoUrl={entry.photoUrl} sizeClass={imageWrap} />
      <div className="mt-3 text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">{place === 1 ? 'MVP' : 'Топ'}</div>
        <div className="mt-2 text-[clamp(20px,3vw,34px)] font-black leading-none text-white">
          {entry.name}
        </div>
        <div className={`mt-3 font-heading text-5xl leading-none ${place === 1 ? 'text-[#ffd400]' : place === 2 ? 'text-white/90' : 'text-[#d79247]'}`}>
          {sortValue(entry, sort)}
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">{sortLabel(sort)}</div>
      </div>
      <div
        className={`mt-5 flex w-full items-center justify-center rounded-t-[20px] border-t border-white/6 font-heading text-6xl leading-none ${rankWrap}`}
      >
        #{place}
      </div>
    </Link>
  );
}

function Podium({ entries, sort }: { entries: LeaderboardEntry[]; sort: SortMode }) {
  const [first, second, third] = [entries[0], entries[1], entries[2]];
  if (!first) return null;

  return (
    <section className="mt-6">
      <div className="mb-5 text-[14px] font-semibold uppercase tracking-[0.16em] text-white/42">Топ игроки</div>
      <div className="grid grid-cols-3 items-end gap-4">
        {second ? <PodiumCard entry={second} place={2} sort={sort} /> : <div />}
        <PodiumCard entry={first} place={1} sort={sort} />
        {third ? <PodiumCard entry={third} place={3} sort={sort} /> : <div />}
      </div>
    </section>
  );
}

function PlayerItem({ entry, sort }: { entry: LeaderboardEntry; sort: SortMode }) {
  const zone = zoneMeta(entry.topLevel);
  const average = entry.tournaments > 0 ? (entry.rating / entry.tournaments).toFixed(1) : '0';

  return (
    <Link
      href={`/players/${entry.playerId}`}
      className={`flex items-center gap-3 rounded-[24px] border bg-[#121212] px-4 py-4 transition hover:border-white/14 hover:bg-[#171717] ${entry.rank === 1 ? 'border-[#5f490a]' : 'border-white/6'}`}
    >
      <div className={`w-8 text-center font-heading text-4xl leading-none ${entry.rank <= 3 ? 'text-[#d79247]' : 'text-white/78'}`}>
        {entry.rank}
      </div>

      <PlayerAvatar name={entry.name} photoUrl={entry.photoUrl} sizeClass="h-14 w-14" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[18px] font-bold text-white">{entry.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/42">
          <span>🏆 {entry.tournaments} тур.</span>
          <span>⚡ {entry.rating} рейт.</span>
          <span>📊 {average} ср.</span>
        </div>
        {hasMedals(entry) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
            {entry.gold > 0 ? <span>🥇 {entry.gold}</span> : null}
            {entry.silver > 0 ? <span>🥈 {entry.silver}</span> : null}
            {entry.bronze > 0 ? <span>🥉 {entry.bronze}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className={`font-heading text-6xl leading-none ${entry.rank === 1 ? 'text-[#ffd400]' : entry.rank <= 3 ? 'text-[#d79247]' : 'text-white'}`}>
          {sortValue(entry, sort)}
        </div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">{sortLabel(sort)}</div>
        <div className={`rounded-[12px] border px-3 py-1 text-sm font-bold uppercase tracking-[0.12em] ${zone.border} ${zone.chip}`}>
          {zone.label}
        </div>
      </div>
    </Link>
  );
}

function MedalItem({ entry }: { entry: MedalEntry }) {
  const levelChips = [
    { label: 'HARD', value: entry.hardWins, className: 'border-[#ff4d43]/45 bg-[#2d1111] text-[#ff4d43]' },
    { label: 'ADV', value: entry.advancedWins, className: 'border-[#26c6ff]/45 bg-[#0d1f29] text-[#26c6ff]' },
    { label: 'MED', value: entry.mediumWins, className: 'border-[#ffb100]/45 bg-[#261b05] text-[#ffd25b]' },
    { label: 'EASY', value: entry.lightWins, className: 'border-[#37d45d]/45 bg-[#0d2012] text-[#7cf293]' },
  ].filter((chip) => chip.value > 0);

  const formatChips = [
    { label: 'KOTC', icon: '👑', value: entry.kotcWins, className: 'border-[#ffd400]/45 bg-[#261d03] text-[#ffd400]' },
    { label: 'THAI', icon: '🏴', value: entry.thaiWins, className: 'border-white/10 bg-[#171717] text-white/72' },
    { label: 'ДАБЛ', icon: '⚡', value: entry.iptWins, className: 'border-[#26c6ff]/45 bg-[#0d1f29] text-[#26c6ff]' },
  ].filter((chip) => chip.value > 0);

  return (
    <Link
      href={`/players/${entry.playerId}`}
      className="rounded-[24px] border border-white/6 bg-[#121212] p-4 transition hover:border-white/14 hover:bg-[#171717]"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 text-center font-heading text-4xl leading-none text-[#ffd400]">{entry.rank}</div>
        <PlayerAvatar name={entry.name} photoUrl={entry.photoUrl} sizeClass="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="truncate text-[20px] font-bold text-white">{entry.name}</div>
            <div className="shrink-0 text-right text-sm font-bold text-white/72">
              {entry.gold > 0 ? <div className="text-[#ffd400]">🥇{entry.gold}</div> : null}
              {entry.silver > 0 ? <div>🥈{entry.silver}</div> : null}
              {entry.bronze > 0 ? <div className="text-[#d79247]">🥉{entry.bronze}</div> : null}
            </div>
          </div>

          {levelChips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {levelChips.map((chip) => (
                <span
                  key={chip.label}
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${chip.className}`}
                >
                  {chip.label} x{chip.value}
                </span>
              ))}
            </div>
          ) : null}

          {formatChips.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {formatChips.map((chip) => (
                <span
                  key={chip.label}
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${chip.className}`}
                >
                  {chip.icon} {chip.label} x{chip.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

interface RankingsClientProps {
  initialEntries: LeaderboardEntry[];
  initialType: RatingType;
  counts: RankingCounts;
}

export default function RankingsClient({ initialEntries, initialType, counts }: RankingsClientProps) {
  const [type, setType] = useState<RatingType>(initialType);
  const [format, setFormat] = useState<TournamentFormatFilter>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [medalEntries, setMedalEntries] = useState<MedalEntry[]>([]);
  const [medalsLoaded, setMedalsLoaded] = useState<{ type: RatingType; format: TournamentFormatFilter } | null>(null);
  const [loading, setLoading] = useState(false);
  const [medalsLoading, setMedalsLoading] = useState(false);
  const [sort, setSort] = useState<SortMode>('pts');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (type === initialType && format === 'all') {
      setEntries(initialEntries);
      return;
    }
    setLoading(true);
    fetch(`/api/leaderboard?type=${type}&limit=100&format=${format}`)
      .then((response) => response.json())
      .then((data: LeaderboardEntry[]) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [type, format, initialEntries, initialType]);

  useEffect(() => {
    if (sort !== 'medals') return;
    if (medalsLoaded?.type === type && medalsLoaded?.format === format) return;
    setMedalsLoading(true);
    fetch(`/api/leaderboard-medals?type=${type}&limit=100&format=${format}`)
      .then((response) => response.json())
      .then((data: MedalEntry[]) => {
        setMedalEntries(data);
        setMedalsLoaded({ type, format });
      })
      .catch(() => {
        setMedalEntries([]);
        setMedalsLoaded({ type, format });
      })
      .finally(() => setMedalsLoading(false));
  }, [format, medalsLoaded, sort, type]);

  const filtered = useMemo(() => {
    let nextEntries = entries;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      nextEntries = nextEntries.filter((entry) => entry.name.toLowerCase().includes(query));
    }
    return sortEntries(nextEntries, sort);
  }, [entries, search, sort]);

  const filteredMedals = useMemo(() => {
    let nextEntries = medalEntries;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      nextEntries = nextEntries.filter((entry) => entry.name.toLowerCase().includes(query));
    }
    return nextEntries;
  }, [medalEntries, search]);

  const genderTabs: { value: RatingType; label: string; count: number }[] = [
    { value: 'M', label: 'M', count: counts.men },
    { value: 'W', label: 'Ж', count: counts.women },
    { value: 'Mix', label: 'Микст', count: counts.mix },
  ];

  const formatTabs: { value: TournamentFormatFilter; label: string }[] = [
    { value: 'all', label: 'Все' },
    { value: 'kotc', label: '👑 KOTC' },
    { value: 'thai', label: '🏴 THAI' },
    { value: 'dt', label: '⚡ Дабл' },
  ];

  const sortTabs: { value: SortMode; label: string; icon: string }[] = [
    { value: 'pts', label: 'РЕЙТИНГ', icon: '⚡' },
    { value: 'avg', label: 'СРЕДНИЙ', icon: '📊' },
    { value: 'trn', label: 'ТУРНИРЫ', icon: '🏆' },
    { value: 'medals', label: 'МЕДАЛИ', icon: '🎖' },
  ];

  const busy = loading || medalsLoading;

  return (
    <main className="mx-auto max-w-[920px] px-4 pb-10 pt-6">
      <section className="rounded-[40px] border border-white/6 bg-[#0b0b0b] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.38)]">
        <div className="text-left">
          <div className="font-heading text-[54px] leading-none text-[#ff5a00] sm:text-[72px]">🔥 РЕЙТИНГ</div>
          <h1 className="mt-3 text-[34px] font-black uppercase leading-[0.94] tracking-[-0.04em] text-white sm:text-[56px]">
            Лютых игроков
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-white/38">
            Professional Points — места, зоны, статистика
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <CountCard value={counts.men} label="M" accent="text-[#ff6a00]" />
          <CountCard value={counts.women} label="Ж" accent="text-[#ff5bb7]" />
          <CountCard value={counts.mix} label="МИК" accent="text-[#26c6ff]" />
          <CountCard value={counts.total} label="ВСЕГО" accent="text-[#ffd400]" outlined />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {genderTabs.map((tab) => (
            <SegmentedButton
              key={tab.value}
              active={type === tab.value}
              onClick={() => {
                setType(tab.value);
                setFormat('all');
                setSearch('');
              }}
            >
              {tab.label} ({tab.count})
            </SegmentedButton>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {formatTabs.map((tab) => (
            <FilterPill key={tab.value} active={format === tab.value} onClick={() => setFormat(tab.value)}>
              {tab.label}
            </FilterPill>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {sortTabs.map((tab) => (
            <SortButton
              key={tab.value}
              active={sort === tab.value}
              onClick={() => setSort(tab.value)}
              icon={tab.icon}
              label={tab.label}
            />
          ))}
        </div>

        <div className={busy ? 'mt-6 opacity-45 transition-opacity pointer-events-none' : 'mt-6'}>
          {sort !== 'medals' ? <Podium entries={filtered} sort={sort} /> : null}

          <div className="mt-6 rounded-[28px] border border-white/6 bg-[#141414] px-5 py-4">
            <label className="flex items-center gap-3">
              <span className="text-2xl text-white/28">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по имени..."
                className="w-full bg-transparent text-xl text-white outline-none placeholder:text-white/18"
              />
            </label>
          </div>

          <div className="mt-6 space-y-3">
            {sort === 'medals' ? (
              filteredMedals.length ? (
                filteredMedals.map((entry) => <MedalItem key={entry.playerId} entry={entry} />)
              ) : (
                <div className="rounded-[28px] border border-white/6 bg-[#141414] px-5 py-10 text-center text-white/38">
                  Нет медалей для отображения
                </div>
              )
            ) : filtered.length ? (
              filtered.map((entry) => <PlayerItem key={entry.playerId} entry={entry} sort={sort} />)
            ) : (
              <div className="rounded-[28px] border border-white/6 bg-[#141414] px-5 py-10 text-center text-white/38">
                Нет данных для отображения
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
