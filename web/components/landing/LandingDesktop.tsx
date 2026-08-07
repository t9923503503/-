import Link from 'next/link';
import LandingHeroAccessPanel from '@/components/landing/LandingHeroAccessPanel';
import HomeRankingTabs from '@/components/landing/HomeRankingTabs';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import MetrikaExternalLink from '@/components/analytics/MetrikaExternalLink';
import { METRIKA_GOALS } from '@/lib/metrika-goals';
import {
  fallbackPosterForTournament,
  isLikelyHostedPlayerOrVkPhoto,
  localPosterForTournamentId,
} from '@/lib/tournament-poster';
import type { HomeActivityItem, HomeGameActivity, HomeOverview, HomePersonalSnapshot } from '@/lib/home';
import type { PlayPostView } from '@/lib/play-service';
import type { Tournament } from '@/lib/types';

interface LandingDesktopProps {
  overview: HomeOverview;
  personal: HomePersonalSnapshot | null;
}

const HERO_IMAGE = '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/gallery-03.jpg';

function formatTournamentDate(value: string) {
  if (!value) return 'Дата уточняется';
  try {
    const [year, month, day] = value.split('T')[0].split('-').map(Number);
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));
  } catch {
    return value;
  }
}

function formatGameDate(value: string) {
  if (!value) return 'Дата уточняется';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yekaterinburg',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-black/25 px-4 py-3 backdrop-blur-sm">
      <div className="font-heading text-3xl tracking-wide text-white">{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.17em] text-white/60">{label}</div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, href, linkLabel }: { eyebrow: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-brand">{eyebrow}</p>
        <h2 className="mt-2 max-w-full break-words font-heading text-[clamp(2.75rem,12vw,3.75rem)] leading-[0.92] uppercase tracking-[0.015em] text-text-primary md:text-6xl">{title}</h2>
      </div>
      {href && linkLabel ? <Link href={href} className="text-sm font-bold text-brand transition hover:text-brand/80">{linkLabel} →</Link> : null}
    </div>
  );
}

function ActionLabel({ kind }: { kind: 'enter_result' | 'confirm_result' | 'pending_requests' }) {
  if (kind === 'enter_result') return 'Внести результат';
  if (kind === 'confirm_result') return 'Подтвердить результат';
  return 'Проверить заявки';
}

function PersonalActivity({ personal }: { personal: HomePersonalSnapshot | null }) {
  if (!personal) {
    return (
      <section className="px-4 py-5 md:px-6 md:py-7" aria-label="Вход в профиль игрока">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-[24px] border border-cyan-300/20 bg-cyan-300/[0.06] px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-cyan-300">Твоя история матчей</p>
            <h2 className="mt-1 text-xl font-black text-text-primary">Войди, чтобы сохранять результаты и видеть свой прогресс</h2>
          </div>
          <Link href="/cabinet" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-black text-white transition hover:bg-brand/90">Войти в профиль</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-5 md:px-6 md:py-7" aria-labelledby="personal-activity-heading">
      <div className="mx-auto max-w-7xl rounded-[24px] border border-black/10 bg-card p-5 dark:border-white/10 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-brand">Личный центр</p>
            <h2 id="personal-activity-heading" className="mt-1 font-heading text-4xl uppercase tracking-wide text-text-primary">Твоя активность</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[560px] lg:grid-cols-3">
            {personal.nextGame ? (
              <Link href={`/partner/${personal.nextGame.id}`} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4 transition hover:border-cyan-300/45">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-300">Следующая игра</div>
                <div className="mt-1 truncate text-sm font-black text-text-primary">{personal.nextGame.title}</div>
                <div className="mt-1 text-xs text-text-secondary">{formatGameDate(personal.nextGame.startsAt)}</div>
              </Link>
            ) : (
              <Link href="/partner" className="rounded-2xl border border-dashed border-black/15 p-4 transition hover:border-brand/40 dark:border-white/15">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">Следующая игра</div>
                <div className="mt-1 text-sm font-black text-text-primary">Выбрать игру</div>
                <div className="mt-1 text-xs text-text-secondary">Открытые игры сообщества</div>
              </Link>
            )}
            {personal.player ? (
              <Link href={`/players/${personal.player.id}`} className="rounded-2xl border border-black/10 bg-surface-light/40 p-4 transition hover:border-brand/35 dark:border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">Турнирный рейтинг</div>
                <div className="mt-1 text-sm font-black text-text-primary">{personal.player.rating} · {personal.player.ratingType}</div>
                <div className="mt-1 text-xs text-text-secondary">{personal.player.rank ? `Место ${personal.player.rank}` : 'Открыть профиль'}</div>
              </Link>
            ) : (
              <Link href="/profile" className="rounded-2xl border border-black/10 bg-surface-light/40 p-4 transition hover:border-brand/35 dark:border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary">Профиль игрока</div>
                <div className="mt-1 text-sm font-black text-text-primary">Привязать карточку</div>
                <div className="mt-1 text-xs text-text-secondary">Чтобы видеть турнирную статистику</div>
              </Link>
            )}
            {personal.actions.length ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4 sm:col-span-2 lg:col-span-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300">Нужно сделать</div>
                <div className="mt-1 text-sm font-black text-text-primary">{personal.actions.length} действия</div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-text-secondary">
                  {personal.actions.slice(0, 2).map((action) => <Link key={`${action.kind}:${action.postId}`} href={`/partner/${action.postId}`} className="hover:text-amber-200">{ActionLabel({ kind: action.kind })} →</Link>)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function TournamentCard({ tournament, featured = false }: { tournament: Tournament; featured?: boolean }) {
  const localPoster = localPosterForTournamentId(tournament.id);
  const remotePoster = String(tournament.photoUrl || '').trim();
  const poster = localPoster || (isLikelyHostedPlayerOrVkPhoto(remotePoster) ? remotePoster : fallbackPosterForTournament(tournament));
  const places = tournament.capacity > 0 ? `${tournament.participantCount}/${tournament.capacity}` : `${tournament.participantCount}`;
  return (
    <Link href={`/calendar/${tournament.id}`} className={`group relative block overflow-hidden rounded-[24px] border border-black/10 bg-card transition hover:-translate-y-0.5 hover:border-brand/40 dark:border-white/10 ${featured ? 'min-h-[270px]' : ''}`}>
      <div className={`${featured ? 'h-44' : 'h-32'} relative overflow-hidden`}>
        <img src={poster} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full border border-emerald-300/30 bg-emerald-300/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
          {tournament.status === 'full' ? 'Лимит участников' : 'Регистрация открыта'}
        </span>
        <span className="absolute bottom-4 left-4 text-sm font-bold text-white">{formatTournamentDate(tournament.date)}{tournament.time ? ` · ${tournament.time}` : ''}</span>
      </div>
      <div className="p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">{tournament.level || tournament.division || 'Турнир'}</div>
        <h3 className="mt-1 text-xl font-black leading-tight text-text-primary">{tournament.name}</h3>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
          <span>{tournament.format || 'Пляжный волейбол'}</span>
          <span className="font-bold text-cyan-300">{places} участников</span>
        </div>
      </div>
    </Link>
  );
}

function GameCard({ game }: { game: PlayPostView }) {
  return (
    <Link href={`/partner/${game.id}`} className="group flex gap-4 rounded-2xl border border-black/10 bg-card p-4 transition hover:border-cyan-300/40 dark:border-white/10">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-300/10 text-xl" aria-hidden>🏐</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="truncate text-base font-black text-text-primary">{game.title}</h3>
          <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300">Игра</span>
        </div>
        <div className="mt-1 text-xs text-text-secondary">{formatGameDate(game.startsAt)} · {game.venue.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span>{game.formatLabel || 'Обычная игра'}</span>
          <span className="font-bold text-text-primary">{game.confirmedCount}/{game.capacity}</span>
          <span className={game.gatherState === 'full' ? 'text-amber-300' : 'text-emerald-300'}>{game.gatherState === 'full' ? 'Заполнено' : 'Можно присоединиться'}</span>
        </div>
      </div>
    </Link>
  );
}

function ActivityCard({ item }: { item: HomeActivityItem }) {
  if (item.kind === 'game') return <GameResultCard item={item} />;
  return (
    <Link href={item.href} className="rounded-[22px] border border-black/10 bg-card p-5 transition hover:-translate-y-0.5 hover:border-brand/35 dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-brand">Итоги турнира · {formatTournamentDate(item.date)}</div>
          <h3 className="mt-2 line-clamp-2 text-lg font-black text-text-primary">{item.title}</h3>
          <p className="mt-1 text-xs text-text-secondary">{item.format}</p>
        </div>
        <span className="text-xl" aria-hidden>🏆</span>
      </div>
      <ol className="mt-4 grid gap-2">
        {item.podium.map((player) => (
          <li key={player.playerId} className="flex items-center gap-3 rounded-xl bg-surface-light/40 px-3 py-2">
            <span className="w-5 text-center font-heading text-xl text-text-secondary">{player.place}</span>
            {player.photoUrl ? <PlayerPhoto photoUrl={player.photoUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-lg object-cover" /> : <span className="h-7 w-7 rounded-lg bg-brand/20" aria-hidden />}
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary">{player.name}</span>
            <span className="text-xs font-bold text-cyan-300">{player.ratingPts > 0 ? `+${player.ratingPts}` : ''}</span>
          </li>
        ))}
      </ol>
    </Link>
  );
}

function GameResultCard({ item }: { item: HomeGameActivity }) {
  return (
    <Link href={item.href} className="rounded-[22px] border border-black/10 bg-card p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/35 dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300">Результат игры · {formatGameDate(item.date)}</div>
          <h3 className="mt-2 text-lg font-black text-text-primary">{item.title}</h3>
          <p className="mt-1 text-xs text-text-secondary">{item.format}</p>
        </div>
        <span className="text-xl" aria-hidden>✓</span>
      </div>
      <p className="mt-4 rounded-xl bg-surface-light/40 px-3 py-2 text-sm font-bold text-text-primary">{item.summary}</p>
      {item.leaders.length ? (
        <div className="mt-3 grid gap-1 text-xs text-text-secondary">
          {item.leaders.map((leader, index) => <span key={`${leader.name}-${index}`}><b className="text-text-primary">{index + 1}. {leader.name}</b> · {leader.value}</span>)}
        </div>
      ) : null}
    </Link>
  );
}

export default function LandingDesktop({ overview, personal }: LandingDesktopProps) {
  const featuredTournament = overview.upcomingTournaments[0] || null;
  const otherTournaments = overview.upcomingTournaments.slice(1);

  return (
    <main className="min-w-0 overflow-x-hidden bg-surface text-text-primary">
      <section className="px-3 pb-4 pt-3 sm:px-4 md:px-6 md:pb-7 md:pt-6">
        <div className="landing-hero relative mx-auto max-w-7xl overflow-hidden rounded-[24px] border border-white/10 bg-[#0A0A0F] shadow-[0_24px_70px_rgba(0,0,0,0.3)] sm:rounded-[30px]">
          <img src={HERO_IMAGE} alt="Игроки LPVOLLEY на площадке" className="absolute inset-0 h-full w-full object-cover opacity-55" />
          <div className="landing-hero-overlay absolute inset-0 bg-[linear-gradient(100deg,rgba(4,10,22,0.96)_0%,rgba(4,10,22,0.82)_44%,rgba(4,10,22,0.38)_100%)]" />
          <LandingHeroAccessPanel />
          <div className="relative grid min-h-[570px] gap-7 px-4 pb-4 pt-28 sm:px-5 sm:pb-5 md:min-h-[440px] md:grid-cols-[1.1fr_0.9fr] md:items-end md:gap-10 md:px-10 md:pb-8 md:pt-12">
            <div className="max-w-2xl">
              <div className="inline-flex rounded-full border border-brand/35 bg-brand/15 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.24em] text-orange-100">LPVOLLEY · Сургут</div>
              <h1 className="mt-5 max-w-full break-words font-heading text-[clamp(2.9rem,13vw,5.5rem)] uppercase leading-[0.88] tracking-[0.01em] text-white sm:text-7xl md:text-8xl">
                Играй.<br />Сохраняй результаты.<br /><span className="text-cyan-300">Следи за прогрессом.</span>
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/75 md:text-base">Турниры и обычные игры, история матчей, статистика и рейтинг — в одном месте.</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Link href="/partner" className="btn-action inline-flex items-center justify-center">Играть</Link>
                <Link href="/partner/manage" className="btn-action-outline inline-flex items-center justify-center">Создать игру</Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-white/65">
                <Link href="/calendar" className="transition hover:text-white">Турниры →</Link>
                <Link href="/archive" className="transition hover:text-white">Результаты →</Link>
                <Link href="/rankings" className="transition hover:text-white">Рейтинг →</Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <StatPill label="Открытых игр" value={overview.stats.openGames} />
              <StatPill label="Турниров впереди" value={overview.stats.upcomingTournaments} />
              <StatPill label="Результатов" value={overview.stats.savedResults} />
            </div>
          </div>
        </div>
      </section>

      <PersonalActivity personal={personal} />

      <section className="px-4 py-7 md:px-6 md:py-10" aria-labelledby="home-events-heading">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Сейчас в LPVOLLEY" title="Ближайшие события" href="/calendar" linkLabel="Все турниры" />
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div>{featuredTournament ? <TournamentCard tournament={featuredTournament} featured /> : <div className="flex min-h-[270px] flex-col items-center justify-center rounded-[24px] border border-dashed border-black/15 bg-card px-6 text-center dark:border-white/15"><span className="text-3xl" aria-hidden>🏐</span><p className="mt-3 text-sm text-text-secondary">Ближайших турниров пока нет</p><Link href="/calendar" className="mt-4 text-sm font-bold text-brand">Открыть календарь →</Link></div>}</div>
            <div className="grid gap-3">
              {overview.upcomingGames.length ? overview.upcomingGames.map((game) => <GameCard key={game.id} game={game} />) : <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-dashed border-black/15 bg-card px-6 text-center dark:border-white/15"><span className="text-3xl" aria-hidden>🏐</span><p className="mt-3 text-sm text-text-secondary">Открытых игр пока нет</p><Link href="/partner/manage" className="mt-4 text-sm font-bold text-brand">Создать первую игру →</Link></div>}
              {otherTournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-7 md:px-6 md:py-10" aria-labelledby="home-results-heading">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Система помнит каждую игру" title="Последние результаты" href="/archive" linkLabel="Весь архив" />
          {overview.activity.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{overview.activity.map((item) => <ActivityCard key={`${item.kind}:${item.id}`} item={item} />)}</div> : <div className="mt-5 rounded-[24px] border border-dashed border-black/15 bg-card px-6 py-12 text-center text-sm text-text-secondary dark:border-white/15">Здесь появятся опубликованные итоги турниров и подтверждённые результаты игр.</div>}
        </div>
      </section>

      <HomeRankingTabs rankings={overview.rankings} />

      <section className="px-4 pb-10 pt-3 md:px-6 md:pb-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-[24px] border border-brand/20 bg-brand/[0.06] px-5 py-6 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.23em] text-brand">Следующий матч начинается здесь</p>
            <h2 className="mt-2 font-heading text-4xl uppercase tracking-wide text-text-primary">Собери свою историю игр</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/partner" className="btn-action inline-flex items-center justify-center">Играть</Link>
            <MetrikaExternalLink href="https://vk.com/lpvolley" target="_blank" rel="noopener noreferrer" goalId={METRIKA_GOALS.vkClick} goalParams={{ placement: 'landing_bottom_cta' }} className="btn-action-outline inline-flex items-center justify-center">Сообщество VK</MetrikaExternalLink>
          </div>
        </div>
      </section>
    </main>
  );
}
