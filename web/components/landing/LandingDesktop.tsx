import Image from 'next/image';
import Link from 'next/link';
import type { HomeStats } from '@/lib/queries';
import type { LeaderboardEntry, Tournament } from '@/lib/types';

interface LandingDesktopProps {
  stats: HomeStats;
  topPlayers: LeaderboardEntry[];
  tournaments: Tournament[];
}

const HERO_BG_DESKTOP = '/pencil/generated-1774519763568.png';
const HERO_BG_MOBILE = '/pencil/generated-1774470854016.png';

const PLAYER_IMAGES = [
  {
    desktop: '/pencil/generated-1774516753003.png',
    mobile: '/pencil/generated-1774518054424.png',
    avatar: '/pencil/generated-1774518118241.png',
  },
  {
    desktop: '/pencil/generated-1774516791238.png',
    mobile: '/pencil/generated-1774516791238.png',
  },
  {
    desktop: '/pencil/generated-1774516824534.png',
    mobile: '/pencil/generated-1774516824534.png',
  },
];

const TOURNAMENT_IMAGES = [
  {
    desktop: '/pencil/generated-1774517022369.png',
    mobile: '/pencil/generated-1774517342373.png',
  },
  {
    desktop: '/pencil/generated-1774517061161.png',
    mobile: '/pencil/generated-1774517061161.png',
  },
  {
    desktop: '/pencil/generated-1774517094951.png',
    mobile: '/pencil/generated-1774517094951.png',
  },
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

function ResponsiveFillImage({
  desktopSrc,
  mobileSrc,
  alt,
  className,
}: {
  desktopSrc: string;
  mobileSrc?: string;
  alt: string;
  className: string;
}) {
  const mobile = mobileSrc ?? desktopSrc;

  return (
    <>
      <Image src={mobile} alt={alt} fill unoptimized className={`${className} md:hidden`} />
      <Image src={desktopSrc} alt={alt} fill unoptimized className={`${className} hidden md:block`} />
    </>
  );
}

function PlayerAvatar({
  player,
  avatarImage,
  featured = false,
}: {
  player: LeaderboardEntry;
  avatarImage?: string;
  featured?: boolean;
}) {
  const sizeClass = featured ? 'h-16 w-16 rounded-2xl' : 'h-12 w-12 rounded-xl';
  const gradient = featured ? 'from-[#00D1FF] to-[#6366F1]' : 'from-[#FF69B4] to-[#FF5A00]';

  if (avatarImage) {
    return (
      <div className={`relative overflow-hidden border border-white/15 ${sizeClass}`}>
        <Image src={avatarImage} alt={player.name} fill unoptimized className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} text-white ${sizeClass}`}
      style={{ fontFamily: 'Sora, sans-serif' }}
    >
      <span className={`font-black ${featured ? 'text-2xl' : 'text-lg'}`}>{initials(player.name).charAt(0)}</span>
    </div>
  );
}

function PlayerCard({
  player,
  desktopImage,
  mobileImage,
  avatarImage,
  featured = false,
}: {
  player: LeaderboardEntry;
  desktopImage: string;
  mobileImage?: string;
  avatarImage?: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/players/${player.playerId}`}
      className={`group relative overflow-hidden rounded-[28px] border transition-all duration-200 hover:-translate-y-1 hover:border-brand/50 ${
        featured ? 'border-brand/35 bg-[#121722]' : 'border-white/10 bg-[#11161F]'
      }`}
    >
      <div className={`relative overflow-hidden ${featured ? 'h-44' : 'h-40'}`}>
        <ResponsiveFillImage
          desktopSrc={desktopImage}
          mobileSrc={mobileImage}
          alt={player.name}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
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
          <PlayerAvatar player={player} avatarImage={featured ? avatarImage : undefined} featured={featured} />
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
  desktopImage,
  mobileImage,
}: {
  tournament: Tournament;
  desktopImage: string;
  mobileImage?: string;
}) {
  const status = statusMeta(tournament.status);

  return (
    <Link
      href={`/calendar/${tournament.id}`}
      className="group overflow-hidden rounded-[24px] border border-white/10 bg-[#121722] transition-all duration-200 hover:-translate-y-1 hover:border-brand/40"
    >
      <div className="relative h-44 overflow-hidden">
        <ResponsiveFillImage
          desktopSrc={desktopImage}
          mobileSrc={mobileImage}
          alt={tournament.name}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
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
  );
}

export default function LandingDesktop({ stats, topPlayers, tournaments }: LandingDesktopProps) {
  const playerCards = topPlayers.slice(0, 3).map((player, index) => ({
    player,
    desktopImage: PLAYER_IMAGES[index]?.desktop ?? PLAYER_IMAGES[PLAYER_IMAGES.length - 1].desktop,
    mobileImage: PLAYER_IMAGES[index]?.mobile ?? PLAYER_IMAGES[PLAYER_IMAGES.length - 1].mobile,
    avatarImage: PLAYER_IMAGES[index]?.avatar,
    featured: index === 0,
  }));

  const tournamentCards = tournaments.slice(0, 3).map((tournament, index) => ({
    tournament,
    desktopImage:
      TOURNAMENT_IMAGES[index]?.desktop ?? TOURNAMENT_IMAGES[TOURNAMENT_IMAGES.length - 1].desktop,
    mobileImage:
      TOURNAMENT_IMAGES[index]?.mobile ?? TOURNAMENT_IMAGES[TOURNAMENT_IMAGES.length - 1].mobile,
  }));

  return (
    <div className="bg-surface text-text-primary">
      <section className="px-4 pb-8 pt-6 md:px-6 md:pb-14 md:pt-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] border border-white/10 bg-[#0A0A0F] shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
          <div className="relative min-h-[420px] overflow-hidden md:min-h-[520px]">
            <ResponsiveFillImage
              desktopSrc={HERO_BG_DESKTOP}
              mobileSrc={HERO_BG_MOBILE}
              alt="Hero background"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,15,0.12),rgba(10,10,15,0.22)_20%,rgba(10,10,15,0.7)_70%,rgba(10,10,15,0.92))]" />

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
            {playerCards.map(({ player, desktopImage, mobileImage, avatarImage, featured }) => (
              <PlayerCard
                key={player.playerId}
                player={player}
                desktopImage={desktopImage}
                mobileImage={mobileImage}
                avatarImage={avatarImage}
                featured={featured}
              />
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
            {tournamentCards.map(({ tournament, desktopImage, mobileImage }) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                desktopImage={desktopImage}
                mobileImage={mobileImage}
              />
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
                Выбирай турнир в календаре, находи пару и выходи на песок. На мобильной
                версии теперь тоже используются отдельные изображения из Pencil.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/calendar" className="btn-action inline-flex items-center justify-center">
                Выбрать турнир
              </Link>
              <a
                href="https://lpvolley.ru/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline inline-flex items-center justify-center"
              >
                Админ-панель
              </a>
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
