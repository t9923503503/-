'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LeaderboardEntry, Tournament } from '@/lib/types';
import {
  fallbackPosterForTournament,
  isLikelyHostedPlayerOrVkPhoto,
  localPosterForTournamentId,
} from '@/lib/tournament-poster';
import PlayerPhoto from '@/components/ui/PlayerPhoto';

const PLAYER_HEADER_BACKGROUNDS = [
  'bg-gradient-to-br from-cyan-950/90 via-slate-950 to-[#11161F]',
  'bg-gradient-to-br from-fuchsia-950/80 via-slate-950 to-[#11161F]',
  'bg-gradient-to-br from-orange-950/80 via-slate-950 to-[#11161F]',
];

const TOURNAMENT_HEADER_BACKGROUNDS = [
  'bg-gradient-to-br from-sky-900/70 via-[#162032] to-[#121722]',
  'bg-gradient-to-br from-violet-900/60 via-[#161528] to-[#121722]',
  'bg-gradient-to-br from-emerald-900/50 via-[#121f24] to-[#121722]',
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Timezone-safe date formatting: parse YYYY-MM-DD without shifting */
function formatDate(value: string) {
  if (!value) return '';
  try {
    const [y, m, d] = value.split('T')[0].split('-').map(Number);
    if (!y || !m || !d) return value;
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return value;
  }
}

function statusMeta(status: Tournament['status']) {
  switch (status) {
    case 'full':
      return { label: 'Набор закрыт', cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' };
    case 'finished':
      return { label: 'Завершён', cls: 'bg-white/10 text-slate-300 border-white/20' };
    case 'cancelled':
      return { label: 'Отменён', cls: 'bg-red-500/15 text-red-300 border-red-500/30' };
    default:
      return { label: 'Открыт', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center backdrop-blur-sm">
      <div
        className="text-2xl font-black text-white md:text-3xl"
        style={{ fontFamily: 'Sora, sans-serif' }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
    </div>
  );
}

function PlayerAvatar({
  player,
  featured = false,
}: {
  player: LeaderboardEntry;
  featured?: boolean;
}) {
  const sizePx = featured ? 64 : 48;
  const sizeClass = featured ? 'h-16 w-16 rounded-2xl' : 'h-12 w-12 rounded-xl';
  const gradient = featured ? 'from-[#00D1FF] to-[#6366F1]' : 'from-[#FF69B4] to-[#FF5A00]';
  const url = String(player.photoUrl || '').trim();

  if (url) {
    return (
      <div className={`shrink-0 overflow-hidden border-2 border-white/20 shadow-lg ${sizeClass}`}>
        <PlayerPhoto photoUrl={url} alt={player.name} width={sizePx} height={sizePx} />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} text-white ${sizeClass}`}
      style={{ fontFamily: 'Sora, sans-serif' }}
    >
      <span className={`font-black ${featured ? 'text-2xl' : 'text-lg'}`}>
        {initials(player.name).charAt(0)}
      </span>
    </div>
  );
}

function PlayerCard({
  player,
  headerClass,
  featured = false,
}: {
  player: LeaderboardEntry;
  headerClass: string;
  featured?: boolean;
}) {
  const bannerUrl = String(player.photoUrl || '').trim();
  const showBannerPhoto = isLikelyHostedPlayerOrVkPhoto(bannerUrl);

  return (
    <Link
      href={`/players/${player.playerId}`}
      className={`group relative overflow-hidden rounded-[28px] border transition-all duration-200 hover:-translate-y-1 hover:border-brand/50 ${
        featured ? 'border-brand/35 bg-[#121722]' : 'border-white/10 bg-[#11161F]'
      }`}
    >
      <div className={`relative overflow-hidden ${featured ? 'h-32' : 'h-28'}`}>
        {showBannerPhoto ? (
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : null}
        <div
          className={`absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03] ${headerClass} ${showBannerPhoto ? 'opacity-50' : ''}`}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#11161F] via-[#11161F]/45 to-transparent" />
      </div>

      <div className="relative flex flex-col gap-3 px-4 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-brand">
            #{player.rank}
          </div>
          {featured && <div className="text-[11px] uppercase tracking-[0.28em] text-gold">MVP</div>}
        </div>

        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} featured={featured} />
          <div className="min-w-0">
            <div
              className={`truncate font-black uppercase tracking-[-0.04em] text-white ${featured ? 'text-2xl' : 'text-xl'}`}
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              {player.name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                {player.gender === 'M' ? 'Мужчины' : player.gender === 'W' ? 'Женщины' : 'Не указан'}
              </span>
            </div>
          </div>
        </div>

        <div className={`grid gap-3 ${featured ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
          <StatCard label="Рейтинг" value={String(player.rating)} />
          <StatCard label="Побед" value={String(player.wins)} />
          <StatCard label="Турниров" value={String(player.tournaments)} />
          {featured && (
            <div className="hidden md:block">
              <StatCard label="Сезон" value={player.lastSeen ? player.lastSeen.slice(0, 4) : ''} />
            </div>
          )}
        </div>

        <div
          className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold ${
            featured ? 'bg-brand py-2.5 text-white' : 'border border-white/15 py-2 text-white'
          }`}
        >
          {featured ? 'Профиль игрока' : 'Профиль'}
        </div>
      </div>
    </Link>
  );
}

function TournamentCard({
  tournament,
  headerClass,
}: {
  tournament: Tournament;
  headerClass: string;
}) {
  const status = statusMeta(tournament.status);
  const albumUrl = String(tournament.photoUrl || '').trim();
  const coverPhotoUrl = String(tournament.coverPhotoUrl || '').trim();
  const localPosterSrc = localPosterForTournamentId(tournament.id);
  const posterSrc = coverPhotoUrl || localPosterSrc || (isLikelyHostedPlayerOrVkPhoto(albumUrl)
    ? albumUrl
    : fallbackPosterForTournament(tournament));
  const showAlbumLink = Boolean(albumUrl) && !isLikelyHostedPlayerOrVkPhoto(albumUrl);

  return (
    <div className="group overflow-hidden rounded-[24px] border border-white/10 bg-[#121722] transition-all duration-200 hover:-translate-y-1 hover:border-brand/40">
      <Link
        href={`/calendar/${tournament.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#121722]"
      >
        <div className="relative h-36 overflow-hidden">
          <img
            src={posterSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div
            className={`pointer-events-none absolute inset-0 opacity-45 transition-transform duration-300 group-hover:scale-[1.03] ${headerClass}`}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#121722] via-[#121722]/45 to-transparent" />
          <div className="absolute left-4 top-4">
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <div className="absolute bottom-4 left-4 text-sm font-semibold text-white">
            {formatDate(tournament.date)}
            {tournament.time ? ` • ${tournament.time}` : ''}
          </div>
        </div>

        <div className="space-y-2 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-brand">
            {tournament.level || tournament.division || 'Турнир'}
          </div>
          <div
            className="text-xl font-black tracking-[-0.04em] text-white"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {tournament.name}
          </div>
          <div className="text-xs text-slate-400">{tournament.format || 'King of the Court'}</div>
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-sm">
            <span className="text-slate-400">Регистрация</span>
            <span className="font-bold text-cyan-300">
              {tournament.participantCount}/{tournament.capacity || 0}
            </span>
          </div>
        </div>
      </Link>
      {showAlbumLink && (
        <div className="border-t border-white/10 px-5 pb-4 pt-2">
          <a
            href={albumUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand hover:text-brand/80"
          >
            📸 Фото турнира
          </a>
        </div>
      )}
    </div>
  );
}

/* ── Empty State ────────────────────────────── */
function EmptyState({ title, action }: { title: string; action: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/10 bg-[#11161F] px-6 py-14 text-center">
      <div className="text-4xl mb-3" aria-hidden>🏐</div>
      <p className="text-sm text-slate-400">{title}</p>
      <Link
        href={action.href}
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand/90"
      >
        {action.label}
      </Link>
    </div>
  );
}

export default function ActivityTabs({
  tournaments,
  topPlayers,
}: {
  tournaments: Tournament[];
  topPlayers: LeaderboardEntry[];
}) {
  const [activeTab, setActiveTab] = useState<'tournaments' | 'rating'>('tournaments');

  const playerCards = topPlayers.slice(0, 3).map((player, index) => ({
    player,
    headerClass:
      PLAYER_HEADER_BACKGROUNDS[index] ??
      PLAYER_HEADER_BACKGROUNDS[PLAYER_HEADER_BACKGROUNDS.length - 1],
    featured: index === 0,
  }));

  const tournamentCards = tournaments.slice(0, 3).map((tournament, index) => ({
    tournament,
    headerClass:
      TOURNAMENT_HEADER_BACKGROUNDS[index] ??
      TOURNAMENT_HEADER_BACKGROUNDS[TOURNAMENT_HEADER_BACKGROUNDS.length - 1],
  }));

  return (
    <section className="px-4 py-6 md:px-6 md:py-8" aria-label="Ближайшие события и рейтинг">
      <div className="mx-auto max-w-7xl">
        {/* Tabs */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Переключение между турнирами и рейтингом">
            <button
              role="tab"
              aria-selected={activeTab === 'tournaments'}
              onClick={() => setActiveTab('tournaments')}
              className={`rounded-xl px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F] ${
                activeTab === 'tournaments'
                  ? 'bg-brand text-white shadow-[0_4px_20px_rgba(255,90,0,0.25)]'
                  : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              Ближайшие турниры
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'rating'}
              onClick={() => setActiveTab('rating')}
              className={`rounded-xl px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F] ${
                activeTab === 'rating'
                  ? 'bg-brand text-white shadow-[0_4px_20px_rgba(255,90,0,0.25)]'
                  : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              Лидеры микста
            </button>
          </div>
          <Link
            href={activeTab === 'tournaments' ? '/calendar' : '/rankings'}
            className="hidden text-sm text-brand transition-colors hover:text-brand/80 md:inline-flex"
          >
            {activeTab === 'tournaments' ? 'Все турниры' : 'Полный рейтинг'} &rarr;
          </Link>
        </div>

        {/* Tab content */}
        {activeTab === 'tournaments' ? (
          tournamentCards.length > 0 ? (
            <div role="tabpanel" className="grid gap-4 lg:grid-cols-3">
              {tournamentCards.map(({ tournament, headerClass }) => (
                <TournamentCard key={tournament.id} tournament={tournament} headerClass={headerClass} />
              ))}
            </div>
          ) : (
            <div role="tabpanel">
              <EmptyState
                title="Пока нет ближайших турниров"
                action={{ href: '/calendar', label: 'Весь календарь' }}
              />
            </div>
          )
        ) : (
          playerCards.length > 0 ? (
            <div role="tabpanel" className="grid gap-4 lg:grid-cols-[1.18fr_1fr_1fr]">
              {playerCards.map(({ player, headerClass, featured }) => (
                <PlayerCard key={player.playerId} player={player} headerClass={headerClass} featured={featured} />
              ))}
            </div>
          ) : (
            <div role="tabpanel">
              <EmptyState
                title="Рейтинг пока пуст"
                action={{ href: '/rankings', label: 'Полный рейтинг' }}
              />
            </div>
          )
        )}
      </div>
    </section>
  );
}
