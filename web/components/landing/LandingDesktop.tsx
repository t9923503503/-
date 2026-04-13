import Link from 'next/link';
import LandingHeroAccessPanel from '@/components/landing/LandingHeroAccessPanel';
import type { HomeStats } from '@/lib/queries';
import type { LeaderboardEntry, Tournament } from '@/lib/types';
import {
  fallbackPosterForTournament,
  isLikelyHostedPlayerOrVkPhoto,
} from '@/lib/tournament-poster';
import PlayerPhoto from '@/components/ui/PlayerPhoto';

interface LandingDesktopProps {
  stats: HomeStats;
  topPlayers: LeaderboardEntry[];
  tournaments: Tournament[];
}

/** CSS-only hero/cards: `/pencil/*.png` were never in git; missing files break prod after rsync --delete on public/. */
const HERO_BACKDROP =
  'absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(0,209,255,0.22),transparent_55%),radial-gradient(ellipse_80%_60%_at_100%_50%,rgba(255,122,0,0.12),transparent_50%),linear-gradient(165deg,#0c1628_0%,#14101c_45%,#0a0a0f_100%)]';

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

function formatDate(value: string) {
  if (!value) return '';

  try {
    return new Date(value).toLocaleDateString('ru-RU', {
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
    <div className="min-w-0 rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-center backdrop-blur-sm">
      <div
        className="text-3xl font-black text-white md:text-4xl"
        style={{ fontFamily: 'Sora, sans-serif' }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
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
      <div
        className={`shrink-0 overflow-hidden border-2 border-white/20 shadow-lg ${sizeClass}`}
      >
        <PlayerPhoto
          photoUrl={url}
          alt={player.name}
          width={sizePx}
          height={sizePx}
        />
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
      <div className={`relative overflow-hidden ${featured ? 'h-44' : 'h-40'}`}>
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

      <div className="relative flex flex-col gap-4 px-5 pb-5 pt-4">
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
              className={`truncate font-black uppercase tracking-[-0.04em] text-white ${featured ? 'text-3xl' : 'text-2xl'}`}
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              {player.name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                {player.gender === 'M' ? 'Мужчины' : 'Женщины'}
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
              <StatCard label="Сезон" value={player.lastSeen ? player.lastSeen.slice(0, 4) : '2026'} />
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-400">
            <span>Power Level</span>
            <span className="text-brand">{player.rating}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FF5A00] via-[#FFD700] to-[#00D1FF]"
              style={{ width: `${Math.min((player.rating / 300) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div
          className={`inline-flex items-center justify-center rounded-xl text-sm font-semibold ${
            featured ? 'bg-brand py-3 text-white' : 'border border-white/15 py-2.5 text-white'
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
  const posterSrc = isLikelyHostedPlayerOrVkPhoto(albumUrl)
    ? albumUrl
    : fallbackPosterForTournament(tournament);
  const showAlbumLink = Boolean(albumUrl) && !isLikelyHostedPlayerOrVkPhoto(albumUrl);

  return (
    <div className="group overflow-hidden rounded-[24px] border border-white/10 bg-[#121722] transition-all duration-200 hover:-translate-y-1 hover:border-brand/40">
      <Link
        href={`/calendar/${tournament.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#121722]"
      >
        <div className="relative h-44 overflow-hidden">
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

        <div className="space-y-3 p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-brand">
            {tournament.level || tournament.division || 'Турнир'}
          </div>
          <div
            className="text-2xl font-black tracking-[-0.04em] text-white"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {tournament.name}
          </div>
          <div className="text-sm text-slate-400">{tournament.format || 'King of the Court'}</div>
          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
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

export default function LandingDesktop({ stats, topPlayers, tournaments }: LandingDesktopProps) {
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
    <div className="bg-surface text-text-primary">
      <section className="px-4 pb-8 pt-6 md:px-6 md:pb-14 md:pt-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] border border-white/10 bg-[#0A0A0F] shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
          <div className="relative min-h-[420px] overflow-hidden md:min-h-[520px]">
            <div className={HERO_BACKDROP} aria-hidden />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,15,0.12),rgba(10,10,15,0.22)_20%,rgba(10,10,15,0.7)_70%,rgba(10,10,15,0.92))]" />
            <LandingHeroAccessPanel />

            <div className="relative flex min-h-[420px] flex-col items-center justify-end px-6 py-10 text-center md:min-h-[520px] md:justify-center md:px-12 md:py-16">
              <div className="rounded-full border border-brand/30 bg-brand/10 px-5 py-2 text-[11px] uppercase tracking-[0.32em] text-brand">
                Сезон 2026 — уже открыт!
              </div>

              <h1
                className="mt-6 text-4xl font-black uppercase leading-[0.95] tracking-[-0.06em] text-white md:mt-8 md:text-7xl lg:text-[96px]"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Доминируй
                <br />
                <span className="bg-gradient-to-r from-[#00D1FF] via-[#D8F156] to-[#FF7A00] bg-clip-text text-transparent">
                  на корте
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-white/78 md:mt-8 md:text-lg md:leading-8">
                Записывайся на турниры, следи за рейтингом и становись королём пляжного
                волейбола
              </p>
            </div>
          </div>

          <div className="grid gap-4 border-t border-white/10 bg-[#0A0A0F] px-6 py-6 md:grid-cols-3 md:px-12">
            <StatCard label="Турниров" value={String(stats.tournamentCount)} />
            <StatCard label="Игроков" value={`${stats.playerCount}+`} />
            <StatCard label="Открыто" value={String(stats.openCount)} />
          </div>
        </div>
      </section>

      <section className="px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-slate-500">Топ игроков</div>
              <h2
                className="mt-3 text-3xl font-black uppercase tracking-[-0.05em] text-white md:text-5xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Лидеры сезона
              </h2>
            </div>
            <Link href="/rankings" className="hidden text-sm text-brand transition-colors hover:text-brand/80 md:inline-flex">
              Полный рейтинг &rarr;
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.18fr_1fr_1fr]">
            {playerCards.map(({ player, headerClass, featured }) => (
              <PlayerCard key={player.playerId} player={player} headerClass={headerClass} featured={featured} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-slate-500">Календарь</div>
              <h2
                className="mt-3 text-3xl font-black uppercase tracking-[-0.05em] text-white md:text-5xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Ближайшие турниры
              </h2>
            </div>
            <Link href="/calendar" className="hidden text-sm text-brand transition-colors hover:text-brand/80 md:inline-flex">
              Все турниры &rarr;
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {tournamentCards.map(({ tournament, headerClass }) => (
              <TournamentCard key={tournament.id} tournament={tournament} headerClass={headerClass} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 pt-8 md:px-6 md:pb-20">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#111827_0%,#0B1019_60%,#111827_100%)] px-6 py-10 md:px-12 md:py-14">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.34em] text-brand/80">LP Volley</div>
              <h2
                className="mt-3 text-3xl font-black uppercase tracking-[-0.05em] text-white md:text-5xl"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                Готов к игре?
              </h2>
              <p className="mt-4 text-base leading-7 text-white/70 md:text-lg">
                Выбирай турнир в календаре, находи пару и выходи на песок.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/calendar" className="btn-action inline-flex items-center justify-center">
                Выбрать турнир
              </Link>
              <a
                href="https://vk.com/lpvolley"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline inline-flex items-center justify-center"
              >
                Мы во ВКонтакте
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
