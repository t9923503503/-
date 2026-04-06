'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry, MedalEntry, RatingType } from '@/lib/types';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import type { RankingCounts } from '@/lib/queries';

/* ── helpers ───────────────────────────────────── */

type SortMode = 'pts' | 'avg' | 'trn' | 'medals';

function zoneMeta(level: string) {
  const l = level.toLowerCase();
  if (l === 'hard') return { cls: 'zone-hard', label: 'HARD', color: '#e94560', bg: 'rgba(233,69,96,.12)', border: 'rgba(233,69,96,.3)' };
  if (l === 'advanced' || l === 'advance') return { cls: 'zone-advanced', label: 'ADVANCED', color: '#4DA8DA', bg: 'rgba(77,168,218,.12)', border: 'rgba(77,168,218,.3)' };
  if (l === 'medium') return { cls: 'zone-medium', label: 'MEDIUM', color: '#FFD700', bg: 'rgba(255,215,0,.10)', border: 'rgba(255,215,0,.3)' };
  return { cls: 'zone-lite', label: 'LIGHT', color: '#6ABF69', bg: 'rgba(106,191,105,.12)', border: 'rgba(106,191,105,.3)' };
}

function sortEntries(entries: LeaderboardEntry[], mode: SortMode): LeaderboardEntry[] {
  const sorted = [...entries];
  if (mode === 'avg') {
    sorted.sort((a, b) => {
      const avgA = a.tournaments > 0 ? a.rating / a.tournaments : 0;
      const avgB = b.tournaments > 0 ? b.rating / b.tournaments : 0;
      return avgB - avgA;
    });
  } else if (mode === 'trn') {
    sorted.sort((a, b) => b.tournaments - a.tournaments || b.rating - a.rating);
  }
  // mode === 'pts' — already sorted by rating from API
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

function sortLabel(mode: SortMode) {
  if (mode === 'avg') return 'СР.';
  if (mode === 'trn') return 'ТУРН.';
  if (mode === 'medals') return 'ЗОЛ.';
  return 'РЕЙТ.';
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

/* ── sub‑components ──────────────────────────────── */

function StatChip({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div className="flex-1 bg-[#1a1a2e] border border-[#2a2a44] rounded-xl p-3 text-center min-w-0">
      <div className="font-heading text-2xl text-brand leading-none">{value}</div>
      <div className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">{icon} {label}</div>
    </div>
  );
}

function Podium({ entries, sort }: { entries: LeaderboardEntry[]; sort: SortMode }) {
  const [p1, p2, p3] = [entries[0], entries[1], entries[2]];
  if (!p1) return null;

  const Pod = ({ p, place, medal }: { p: LeaderboardEntry; place: 'p1' | 'p2' | 'p3'; medal: string }) => {
    const heights = { p1: 'h-[110px]', p2: 'h-[80px]', p3: 'h-[65px]' };
    const gradients = {
      p1: 'from-[rgba(255,215,0,0.2)] to-[rgba(255,215,0,0.05)] border-[rgba(255,215,0,0.35)]',
      p2: 'from-[rgba(192,192,192,0.18)] to-[rgba(192,192,192,0.05)] border-[rgba(192,192,192,0.3)]',
      p3: 'from-[rgba(205,127,50,0.18)] to-[rgba(205,127,50,0.05)] border-[rgba(205,127,50,0.3)]',
    };
    const textColors = { p1: 'text-[#FFD700]', p2: 'text-[#c0c0c0]', p3: 'text-[#cd7f32]' };

    return (
      <Link href={`/players/${p.playerId}`} className="flex flex-col items-center flex-1 max-w-[130px] group">
        <div className={`flex flex-col items-center justify-end w-full rounded-t-lg border bg-gradient-to-b ${gradients[place]} ${heights[place]} px-2 py-2 transition-all group-hover:scale-105`}>
          <span className="text-xl mb-1">{medal}</span>
          <span className="text-[11px] font-bold text-white text-center truncate w-full">{p.name}</span>
          <span className={`font-heading text-lg ${textColors[place]} leading-none`}>{sortValue(p, sort)}</span>
          <span className="text-[8px] text-text-secondary uppercase tracking-wider">{sortLabel(sort)}</span>
        </div>
      </Link>
    );
  };

  return (
    <div className="flex items-end justify-center gap-2 py-4 mb-4">
      {p2 && <Pod p={p2} place="p2" medal="🥈" />}
      <Pod p={p1} place="p1" medal="🥇" />
      {p3 && <Pod p={p3} place="p3" medal="🥉" />}
    </div>
  );
}

function PlayerItem({ entry, sort }: { entry: LeaderboardEntry; sort: SortMode }) {
  const zn = zoneMeta(entry.topLevel);
  const avg = entry.tournaments > 0 ? (entry.rating / entry.tournaments).toFixed(1) : '0';

  const medalMap: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const rankDisplay = medalMap[entry.rank] ?? String(entry.rank);
  const rankColorClass = entry.rank === 1 ? 'text-[#FFD700]' : entry.rank === 2 ? 'text-[#c0c0c0]' : entry.rank === 3 ? 'text-[#cd7f32]' : 'text-text-secondary';

  return (
    <Link
      href={`/players/${entry.playerId}`}
      className="flex items-center gap-3 px-3 py-3 bg-[#16162a] border border-[#2a2a40] rounded-xl transition-all hover:border-[#3a3a5e] hover:bg-[#1a1a30] group"
      style={{ borderLeftWidth: '3px', borderLeftColor: zn.color }}
    >
      {entry.photoUrl ? (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-[#2a2a44]">
          <PlayerPhoto photoUrl={entry.photoUrl} alt={entry.name} width={40} height={40} />
        </div>
      ) : (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-brand/40 to-[#6366F1]/40 border border-[#2a2a44] flex items-center justify-center text-xs font-bold text-white/90">
          {entry.name.charAt(0).toUpperCase()}
        </div>
      )}
      {/* Rank */}
      <div className={`flex-shrink-0 w-7 text-center font-heading text-base ${rankColorClass}`}>
        {rankDisplay}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-white truncate group-hover:text-brand transition-colors">
          {entry.name}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-secondary mt-0.5 flex-wrap">
          <span>🏆 {entry.tournaments} турн.</span>
          <span>⚡ {entry.rating} рейт.</span>
          <span>📊 {avg} ср.</span>
        </div>
        {hasMedals(entry) ? (
          <div className="flex items-center gap-1.5 text-[10px] text-text-secondary mt-0.5">
            {entry.gold > 0 ? <span>🥇{entry.gold}</span> : null}
            {entry.silver > 0 ? <span>🥈{entry.silver}</span> : null}
            {entry.bronze > 0 ? <span>🥉{entry.bronze}</span> : null}
          </div>
        ) : null}
      </div>

      {/* Value */}
      <div className="flex-shrink-0 text-right">
        <div className="font-heading text-lg text-brand leading-none">{sortValue(entry, sort)}</div>
        <div className="text-[9px] text-text-secondary uppercase tracking-wider">{sortLabel(sort)}</div>
      </div>

      {/* Zone badge */}
      <div
        className="flex-shrink-0 text-[9px] font-bold tracking-wide px-2 py-0.5 rounded"
        style={{ background: zn.bg, color: zn.color, border: `1px solid ${zn.border}` }}
      >
        {zn.label}
      </div>
    </Link>
  );
}

function MedalItem({ entry }: { entry: MedalEntry }) {
  const levelChips = [
    { label: 'HARD', value: entry.hardWins, className: 'border-brand/50 bg-brand/15 text-orange-300' },
    { label: 'ADVANCED', value: entry.advancedWins, className: 'border-[#00D1FF]/50 bg-[#00D1FF]/10 text-[#00D1FF]' },
    { label: 'MEDIUM', value: entry.mediumWins, className: 'border-[#FFD700]/50 bg-[#FFD700]/10 text-[#FFD700]' },
    { label: 'LIGHT', value: entry.lightWins, className: 'border-[#6ABF69]/50 bg-[#6ABF69]/10 text-[#6ABF69]' },
  ].filter((chip) => chip.value > 0);
  const formatChips = [
    { label: 'KOTC', icon: '👑', value: entry.kotcWins },
    { label: 'Thai', icon: '🏖️', value: entry.thaiWins },
    { label: 'Double', icon: '⚡', value: entry.iptWins },
  ].filter((chip) => chip.value > 0);

  return (
    <Link
      href={`/players/${entry.playerId}`}
      className="block rounded-2xl border border-[#2a2a44] bg-[#16162a] p-4 transition-all hover:border-brand/45 hover:bg-[#1a1a30] group"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-11 text-center">
          <div className="font-heading text-2xl text-[#FFD700] leading-none">#{entry.rank}</div>
          <div className="text-[9px] text-text-secondary uppercase tracking-wider mt-1">место</div>
        </div>

        {entry.photoUrl ? (
          <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-[#2a2a44]">
            <PlayerPhoto photoUrl={entry.photoUrl} alt={entry.name} width={48} height={48} />
          </div>
        ) : (
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFD700]/30 to-brand/30 border border-[#2a2a44] flex items-center justify-center text-sm font-bold text-white/90">
            {entry.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-sm text-white truncate group-hover:text-brand transition-colors">
              {entry.name}
            </div>
            <div className="flex items-center gap-2 text-sm font-bold">
              {entry.gold > 0 ? <span className="text-[#FFD700]">🥇{entry.gold}</span> : null}
              {entry.silver > 0 ? <span className="text-[#c0c0c0]">🥈{entry.silver}</span> : null}
              {entry.bronze > 0 ? <span className="text-[#cd7f32]">🥉{entry.bronze}</span> : null}
            </div>
          </div>

          {levelChips.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {levelChips.map((chip) => (
                <span
                  key={chip.label}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${chip.className}`}
                >
                  {chip.label} ×{chip.value}
                </span>
              ))}
            </div>
          ) : null}

          {formatChips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-text-secondary">
              {formatChips.map((chip) => (
                <span key={chip.label} className="rounded-full border border-white/10 bg-white/[.04] px-2 py-0.5">
                  {chip.icon} {chip.label} ×{chip.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/* ── main client ─────────────────────────────────── */

interface RankingsClientProps {
  initialEntries: LeaderboardEntry[];
  initialType: RatingType;
  counts: RankingCounts;
}

export default function RankingsClient({ initialEntries, initialType, counts }: RankingsClientProps) {
  const [type, setType] = useState<RatingType>(initialType);
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [medalEntries, setMedalEntries] = useState<MedalEntry[]>([]);
  const [medalsType, setMedalsType] = useState<RatingType | null>(null);
  const [loading, setLoading] = useState(false);
  const [medalsLoading, setMedalsLoading] = useState(false);
  const [sort, setSort] = useState<SortMode>('pts');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (type === initialType) {
      setEntries(initialEntries);
      return;
    }
    setLoading(true);
    fetch(`/api/leaderboard?type=${type}&limit=100`)
      .then((r) => r.json())
      .then((data: LeaderboardEntry[]) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [type, initialType, initialEntries]);

  useEffect(() => {
    if (sort !== 'medals' || medalsType === type) return;
    setMedalsLoading(true);
    fetch(`/api/leaderboard-medals?type=${type}&limit=100`)
      .then((r) => r.json())
      .then((data: MedalEntry[]) => {
        setMedalEntries(data);
        setMedalsType(type);
      })
      .catch(() => {
        setMedalEntries([]);
        setMedalsType(type);
      })
      .finally(() => setMedalsLoading(false));
  }, [sort, type, medalsType]);

  const filtered = useMemo(() => {
    let list = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return sortEntries(list, sort);
  }, [entries, sort, search]);

  const filteredMedals = useMemo(() => {
    let list = medalEntries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [medalEntries, search]);

  const genderTabs: { value: RatingType; label: string; icon: string; count: number }[] = [
    { value: 'M', label: 'М', icon: '🏋️', count: counts.men },
    { value: 'W', label: 'Ж', icon: '👩', count: counts.women },
    { value: 'Mix', label: 'Микст', icon: '🤝', count: counts.mix },
  ];

  const sortTabs: { value: SortMode; label: string; icon: string }[] = [
    { value: 'pts', label: 'РЕЙТИНГ', icon: '⚡' },
    { value: 'avg', label: 'СРЕДНИЙ', icon: '📊' },
    { value: 'trn', label: 'ТУРНИРЫ', icon: '🏆' },
    { value: 'medals', label: 'МЕДАЛИ', icon: '🏅' },
  ];

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="font-heading text-4xl md:text-5xl text-brand tracking-wide uppercase">
          🔥 Рейтинг Лютых Игроков
        </h1>
        <p className="text-text-secondary text-sm mt-2">
          Professional Points — места, зоны, статистика
        </p>
      </div>

      {/* Stat chips */}
      <div className="flex gap-2 mb-5">
        <StatChip value={counts.men} label="Мужчин" icon="🏋️" />
        <StatChip value={counts.women} label="Женщин" icon="👩" />
        <StatChip value={counts.mix} label="Микст" icon="🤝" />
        <StatChip value={counts.total} label="Всего" icon="👥" />
      </div>

      {/* Gender tabs */}
      <div className="flex gap-1 bg-white/[.04] p-1 rounded-xl border border-[#2a2a40] mb-4">
        {genderTabs.map((tab) => {
          const isActive = tab.value === type;
          return (
            <button
              key={tab.value}
              onClick={() => { setType(tab.value); setSearch(''); }}
              className={`flex-1 py-2 rounded-lg font-bold text-sm uppercase tracking-wide transition-all ${
                isActive
                  ? 'bg-brand text-[#111] shadow-[0_3px_10px_rgba(255,90,0,0.25)]'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.icon} {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {/* Sort tabs */}
      <div className="flex gap-1.5 mb-4">
        {sortTabs.map((tab) => {
          const isActive = tab.value === sort;
          return (
            <button
              key={tab.value}
              onClick={() => setSort(tab.value)}
              className={`flex-1 py-2 px-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                isActive
                  ? 'bg-brand/10 border-brand/40 text-brand'
                  : 'bg-white/[.04] border-[#2a2a44] text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      <div className={loading || medalsLoading ? 'opacity-40 transition-opacity pointer-events-none' : ''}>
        {sort !== 'medals' ? <Podium entries={filtered} sort={sort} /> : null}

        {/* Search */}
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm pointer-events-none">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени..."
            className="w-full bg-[#1a1a2e] border border-[#2a2a44] rounded-xl py-2.5 pl-9 pr-4 text-white text-sm outline-none focus:border-brand transition-colors"
          />
        </div>

        {/* Player list */}
        {sort === 'medals' ? (
          filteredMedals.length === 0 ? (
            <div className="text-center text-text-secondary py-16">
              Нет медалей для отображения
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMedals.map((entry) => (
                <MedalItem key={entry.playerId} entry={entry} />
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="text-center text-text-secondary py-16">
            Нет данных для отображения
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((entry) => (
              <PlayerItem key={entry.playerId} entry={entry} sort={sort} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
