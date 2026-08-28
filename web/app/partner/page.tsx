import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { BreadcrumbSchema } from '@/components/seo/SchemaOrg';
import { SEO_KEYWORDS } from '@/lib/seo';
import { fetchPartnerRequests, fetchTournaments } from '@/lib/queries';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { getMyPlayAvailability, listPlayFeed, listPlayPosts, listPlayResources, listUserPlayEntries, type PlayActionCard } from '@/lib/play-service';
import type { PlayLevel } from '@/lib/play-core';
import PlayPostCard from '@/components/partner/PlayPostCard';
import PlayCard from '@/components/play/PlayCard';
import PartnerRequestButton from '@/components/partner/PartnerRequestButton';
import PlayAvailabilityWidget from '@/components/play/PlayAvailabilityWidget';
import PlayHowItWorks from '@/components/play/PlayHowItWorks';
import PartnerTelegramCallout from '@/components/partner/PartnerTelegramCallout';
import MetrikaExternalLink from '@/components/analytics/MetrikaExternalLink';
import { METRIKA_GOALS } from '@/lib/metrika-goals';

export const metadata: Metadata = {
  title: 'Открытые игры и тренировки по пляжному волейболу в Сургуте | LPVolley',
  description: 'Найдите игру, тренировку или партнёра по пляжному волейболу в Сургуте: свободные места, запись онлайн и уведомления в Telegram.',
  keywords: SEO_KEYWORDS,
  alternates: { canonical: 'https://lpvolley.ru/partner' },
  openGraph: {
    title: 'Открытые игры и тренировки по пляжному волейболу в Сургуте | LPVolley',
    description: 'Найдите игру, тренировку или партнёра: свободные места, запись онлайн и уведомления в Telegram.',
    url: 'https://lpvolley.ru/partner',
    type: 'website',
    locale: 'ru_RU',
    images: [
      {
        url: 'https://lpvolley.ru/og-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'Открытые игры и тренировки по пляжному волейболу в Сургуте',
      },
    ],
  },
};

interface PartnerPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const LEVELS = new Set<PlayLevel>(['light', 'medium', 'hard']);
const ACTION_CARD_TEXT: Record<PlayActionCard['kind'], (count: number) => string> = {
  confirm_attendance: () => '🙋 Подтвердить присутствие',
  enter_result: () => '📝 Внести результат',
  approve_result: () => '✅ Утвердить результат',
  fix_result: (count) => `🛠 Исправить результат${count > 1 ? ` · ${count}` : ''}`,
  pending_requests: (count) => `📥 Заявок ждут ответа: ${count}`,
};

function actionCardHref(card: PlayActionCard): string {
  if (card.kind === 'confirm_attendance') return `/partner/${card.postId}#attendance`;
  if (card.kind === 'enter_result') return `/partner/${card.postId}/live`;
  if (card.kind === 'approve_result' || card.kind === 'fix_result') return `/partner/${card.postId}#result`;
  return `/partner/manage?post=${encodeURIComponent(card.postId)}`;
}

const TAB_DESCRIPTION = {
  games: 'Открытые составы: войдите сразу или отправьте заявку организатору.',
  trainings: 'Занятия с тренером и открытые групповые тренировки для разных уровней.',
  partners: 'Поиск партнёра — дополнительная возможность внутри раздела игр, с понятными датой, форматом и уровнем.',
} as const;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function ymd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function partnerLevel(input: string): 'all' | 'hard' | 'medium' | 'easy' {
  return input === 'hard' || input === 'medium' || input === 'easy' ? input : 'all';
}

function levelLabel(level: string): string {
  if (level.toLowerCase() === 'hard') return 'Hard';
  if (level.toLowerCase() === 'medium') return 'Medium';
  if (level.toLowerCase() === 'easy') return 'Lite';
  return 'Все уровни';
}

export default async function PartnerPage({ searchParams }: PartnerPageProps) {
  const raw = (await searchParams) ?? {};
  const requestedTab = one(raw.tab);
  const selectedTournament = one(raw.tournament);
  const tab = requestedTab === 'training' || requestedTab === 'trainings'
    ? 'trainings'
    : requestedTab === 'partners' || (!requestedTab && selectedTournament)
      ? 'partners'
      : 'games';
  const kind = tab === 'trainings' ? 'training' : 'game';
  const view = ['foryou', 'today', 'all', 'mine', 'past'].includes(one(raw.view)) ? one(raw.view) : 'all';
  const selectedVenue = one(raw.venue);
  const selectedLevelRaw = one(raw.playLevel);
  const selectedLevel = LEVELS.has(selectedLevelRaw as PlayLevel) ? selectedLevelRaw as PlayLevel : undefined;
  const selectedGender = one(raw.playGender) === 'M' ? 'M' : one(raw.playGender) === 'W' ? 'W' : undefined;
  const availableOnly = one(raw.available) === '1';

  const cookieStore = await cookies();
  const authToken = cookieStore.get(PLAYER_COOKIE)?.value;
  const me = authToken ? verifyPlayerToken(authToken) : null;

  const today = new Date(`${ymd(new Date())}T00:00:00+05:00`);
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const requestedDay = one(raw.day);
  const selectedDay = days.some((day) => ymd(day) === requestedDay) ? requestedDay : '';
  const rangeStart = selectedDay ? new Date(`${selectedDay}T00:00:00+05:00`) : today;
  const rangeEnd = selectedDay ? addDays(rangeStart, 1) : null;

  const selectedPartnerLevel = partnerLevel(one(raw.level));
  const selectedPartnerGender = one(raw.gender) === 'M' ? 'M' : one(raw.gender) === 'W' ? 'W' : 'all';

  const [posts, resources, upcoming, partnerRows, feed, availability, userEntries] = await Promise.all([
    listPlayPosts({
      kind,
      dateFrom: rangeStart.toISOString(),
      dateTo: rangeEnd?.toISOString(),
      venueId: selectedVenue || undefined,
      level: selectedLevel,
      gender: selectedGender,
      availableOnly,
      viewerUserId: me?.id,
    }),
    listPlayResources(),
    fetchTournaments(30).then((items) => items.filter((item) => item.status === 'open' || item.status === 'full')),
    tab === 'partners' && selectedTournament
      ? fetchPartnerRequests({
          tournamentId: selectedTournament,
          level: selectedPartnerLevel,
          gender: selectedPartnerGender,
        })
      : Promise.resolve([]),
    tab === 'games' ? listPlayFeed(me?.id ?? null) : Promise.resolve(null),
    tab === 'games' && me ? getMyPlayAvailability(me.id) : Promise.resolve(null),
    tab === 'games' && me ? listUserPlayEntries(me.id) : Promise.resolve([]),
  ]);

  const now = Date.now();
  const selectedTournamentInfo = upcoming.find((item) => item.id === selectedTournament) ?? null;
  const displayPosts = tab !== 'games' ? posts
    : view === 'today' ? posts.filter((post) => ymd(new Date(post.startsAt)) === ymd(new Date()))
      : view === 'mine' ? [...(feed?.mine ?? []), ...(feed?.myGames ?? [])].filter((post, index, rows) => rows.findIndex((item) => item.id === post.id) === index)
        : view === 'past' ? userEntries.filter((post) => new Date(post.endsAt).getTime() < now || post.status === 'cancelled')
          : view === 'all' ? posts
          : feed?.forYou ?? posts;
  const hasActivePlayFilters = Boolean(
    selectedVenue || selectedLevel || selectedGender || availableOnly || selectedDay || (tab === 'games' && view !== 'all')
  );
  const resetPlayHref = tab === 'games' ? '/partner?tab=games&view=all' : '/partner?tab=trainings';
  const heroActionHref = tab === 'partners' ? '#partner-search' : '#play-feed';
  const heroActionLabel = tab === 'partners' ? 'Найти партнёра' : tab === 'trainings' ? 'Смотреть тренировки' : 'Смотреть игры';

  const groupedPartners = new Map<string, {
    tournamentId: string;
    tournamentName: string;
    tournamentDate: string;
    players: typeof partnerRows;
  }>();
  for (const item of partnerRows) {
    const key = item.tournamentId || item.id;
    const current = groupedPartners.get(key);
    if (current) current.players.push(item);
    else groupedPartners.set(key, {
      tournamentId: item.tournamentId,
      tournamentName: item.tournamentName || 'Турнир',
      tournamentDate: item.tournamentDate,
      players: [item],
    });
  }

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Главная', url: 'https://lpvolley.ru/' },
          { name: 'Найти пару', url: 'https://lpvolley.ru/partner' },
        ]}
      />
      <main className="play-surface mx-auto max-w-[1100px] px-4 pb-16 pt-5 md:px-5">
        <Link
          href="/partner/manage"
          className="partner-create-game-fab"
          aria-label="Создать игру"
        >
          <span aria-hidden="true">➕</span>
          <span>Создать игру</span>
        </Link>
        <header className="play-hero grid gap-5 rounded-3xl px-5 py-7 text-white shadow-xl md:grid-cols-[1fr_auto] md:items-center md:px-8 md:py-8">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-cyan-200">Пляжный волейбол · Сургут</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">Где поиграть?</h1>
            <p className="mt-1.5 text-sm font-medium text-white/75">Игры твоего уровня рядом — впишись в состав или собери свою.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={heroActionHref} style={{ color: '#fff' }} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold shadow-lg shadow-orange-950/30">{heroActionLabel} ↓</Link>
            <Link href={tab === 'games' ? '#how-it-works' : '/partner/about'} style={{ color: '#fff' }} className="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold">Как это работает</Link>
            {!me ? <Link href={`/login?returnTo=${encodeURIComponent(tab === 'games' ? '/partner' : `/partner?tab=${tab}`)}`} style={{ color: '#fff' }} className="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold">Войти / зарегистрироваться</Link> : null}
          </div>
        </header>

        <PartnerTelegramCallout authenticated={Boolean(me)} />

        {tab === 'games' ? (
          <details id="how-it-works" className="group mt-5 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-surface-lighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset">
              <span>
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-brand">Быстрый старт</span>
                <span className="mt-0.5 block text-lg font-black text-text-primary">Как это работает</span>
              </span>
              <span className="shrink-0 rounded-xl border border-white/10 bg-surface px-3 py-2 text-xs font-bold text-text-secondary">
                <span className="group-open:hidden">Показать</span>
                <span className="hidden group-open:inline">Скрыть</span>
              </span>
            </summary>
            <div className="border-t border-white/10 px-5 py-7 md:px-7">
              <PlayHowItWorks compact embedded />
            </div>
          </details>
        ) : null}

        <nav aria-label="Разделы игр и партнёров" className="mt-5 inline-flex max-w-full overflow-x-auto rounded-xl bg-surface-lighter p-1">
          <Link href="/partner?tab=games" className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'games' ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary'}`}>
            Игры
          </Link>
          <Link href="/partner?tab=trainings" className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'trainings' ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary'}`}>
            Тренировки
          </Link>
          <Link href="/partner?tab=partners" className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'partners' ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary'}`}>Партнёры</Link>
        </nav>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{TAB_DESCRIPTION[tab]}</p>

        {tab === 'games' && me ? <div className="mt-4"><PlayAvailabilityWidget current={availability} /></div> : null}
        {tab === 'games' && feed?.actionCards.length ? <section className="mt-3 grid gap-2 sm:grid-cols-2">{feed.actionCards.map((card) => <Link key={`${card.kind}:${card.postId}`} href={actionCardHref(card)} className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3"><strong className="block text-sm text-amber-200">{ACTION_CARD_TEXT[card.kind](card.count)}</strong><span className="text-xs text-text-secondary">{card.title}</span></Link>)}</section> : null}

        {tab !== 'partners' ? <section className="mt-5">
          {tab === 'games' ? <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-lighter p-1">
              {[
                ['foryou', '🔥 Для тебя'], ['today', 'Сегодня'], ['all', 'Все'], ['mine', 'Мои'], ['past', 'Прошедшие'],
              ].map(([key, label]) => <Link key={key} href={`/partner?tab=games&view=${key}`} className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${view === key ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>{label}</Link>)}
            </div>
            <details className="ml-auto group">
              <summary className="cursor-pointer list-none rounded-xl border border-white/10 bg-card px-4 py-2 text-xs font-bold text-text-secondary transition hover:text-text-primary">⚙ Фильтры</summary>
              <div className="absolute right-4 z-20 mt-2 w-[min(92vw,700px)] rounded-2xl border border-white/10 bg-card p-4 shadow-2xl">
                <form method="GET" className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="tab" value="games" /><input type="hidden" name="view" value="all" />
                  <select name="venue" defaultValue={selectedVenue} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary"><option value="">Все площадки</option>{resources.venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select>
                  <select name="playLevel" defaultValue={selectedLevel || ''} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary"><option value="">Любой уровень</option><option value="light">Начальный</option><option value="medium">Средний</option><option value="hard">Высокий</option></select>
                  <select name="playGender" defaultValue={selectedGender || ''} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary"><option value="">Любой состав</option><option value="M">Мужчины</option><option value="W">Женщины</option></select>
                  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-secondary"><input type="checkbox" name="available" value="1" defaultChecked={availableOnly} className="accent-orange-500" /> Только со свободными местами</label>
                  <button type="submit" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white md:col-span-2">Показать игры</button>
                </form>
              </div>
            </details>
          </div> : null}

          {tab === 'trainings' ? <form method="GET" className="grid gap-3 rounded-2xl border border-white/10 bg-card p-4 md:grid-cols-5">
            <input type="hidden" name="tab" value={tab} />
            {selectedDay ? <input type="hidden" name="day" value={selectedDay} /> : null}
            <select name="venue" defaultValue={selectedVenue} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary">
              <option value="">Все площадки</option>
              {resources.venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <select name="playLevel" defaultValue={selectedLevel || ''} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary">
              <option value="">Любой уровень</option>
              <option value="light">Начальный</option><option value="medium">Средний</option>
              <option value="hard">Высокий</option>
            </select>
            <select name="playGender" defaultValue={selectedGender || ''} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary">
              <option value="">Любой состав</option><option value="M">Мужчины</option><option value="W">Женщины</option>
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-secondary">
              <input type="checkbox" name="available" value="1" defaultChecked={availableOnly} className="accent-orange-500" /> Только со свободными местами
            </label>
            <button type="submit" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100">Применить</button>
          </form> : null}
        </section> : null}

        {tab !== 'partners' ? <section id="play-feed" className="relative mt-7 scroll-mt-24">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-brand">Игровая лента</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-text-primary md:text-2xl">{tab === 'games' ? 'Ближайшие игры' : 'Ближайшие тренировки'}</h2>
            </div>
            <span className="shrink-0 rounded-full bg-surface-lighter px-3 py-1.5 text-xs font-bold text-text-secondary">{displayPosts.length} {displayPosts.length === 1 ? 'событие' : 'событий'}</span>
          </div>
          <div className="grid gap-4">
          {displayPosts.length ? displayPosts.map((post) => kind === 'game' ? <PlayCard key={post.id} post={post} authenticated={Boolean(me)} hot={Boolean(me) && post.fit === 'match'} /> : <PlayPostCard key={post.id} post={post} authenticated={Boolean(me)} />) : (
            <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.025] px-6 py-14 text-center">
              <h2 className="font-heading text-3xl text-text-primary">Пока нет событий по этим фильтрам</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">{hasActivePlayFilters ? 'Сбросьте фильтры или подпишитесь на новые события в Telegram.' : `Создайте первую открытую ${kind === 'game' ? 'игру' : 'тренировку'} или следите за новыми событиями в Telegram.`}</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {hasActivePlayFilters ? (
                  <Link href={resetPlayHref} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-text-primary transition hover:border-cyan-300/40">Сбросить фильтры</Link>
                ) : (
                  <Link href="/partner/manage" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white">Создать {kind === 'game' ? 'игру' : 'тренировку'}</Link>
                )}
                <MetrikaExternalLink
                  href="https://t.me/Lpvolley_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  goalId={METRIKA_GOALS.telegramClick}
                  goalParams={{ placement: 'partner_empty_state', action: 'bot_open', authState: me ? 'authenticated' : 'guest' }}
                  className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-bold text-cyan-200 transition hover:border-cyan-200/60 hover:text-white"
                >
                  Открыть бота
                </MetrikaExternalLink>
              </div>
            </div>
          )}
          </div>
        </section> : null}

        {tab === 'partners' ? (
          <section id="partner-search" className="relative mt-8 scroll-mt-24 border-t border-white/10 pt-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">Турнирный раздел</p>
              <h2 className="mt-2 font-heading text-4xl tracking-wide text-text-primary">Найти партнёра на турнир</h2>
              <p className="mt-2 text-sm text-text-secondary">Существующие соло-заявки игроков, которые ищут пару для участия.</p>
            </div>

            <form method="GET" className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:grid-cols-4">
              <input type="hidden" name="tab" value="partners" />
              <select name="tournament" required defaultValue={selectedTournament} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm">
                <option value="">Выберите турнир</option>
                {upcoming.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.date || 'дата уточняется'}</option>)}
              </select>
              <select name="level" defaultValue={selectedPartnerLevel} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm">
                <option value="all">Все уровни</option><option value="hard">Hard</option><option value="medium">Medium</option><option value="easy">Lite</option>
              </select>
              <select name="gender" defaultValue={selectedPartnerGender} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm">
                <option value="all">Любой пол</option><option value="M">Мужчины</option><option value="W">Женщины</option>
              </select>
              <button disabled={!upcoming.length} className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5 text-sm font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-50">Показать игроков</button>
            </form>

            {selectedTournamentInfo ? (
              <article className="mt-4 rounded-2xl border border-brand/30 bg-brand/[0.06] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Выбранный турнир</p>
                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-xl font-black text-text-primary">{selectedTournamentInfo.name}</h3>
                    <p className="mt-1 text-sm text-text-secondary">{selectedTournamentInfo.date || 'Дата уточняется'}{selectedTournamentInfo.time ? ` · ${selectedTournamentInfo.time}` : ''}{selectedTournamentInfo.location ? ` · ${selectedTournamentInfo.location}` : ''}</p>
                    <p className="mt-1 text-xs text-text-secondary">{selectedTournamentInfo.format || 'Формат уточняется'}{selectedTournamentInfo.level ? ` · ${selectedTournamentInfo.level}` : ''} · ищут пару: {selectedTournamentInfo.partnerRequestCount ?? 0}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/calendar/${selectedTournamentInfo.id}`} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-text-primary">Открыть турнир</Link>
                    <Link href={`/calendar/${selectedTournamentInfo.id}/register`} className="rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white">Подать заявку и искать пару</Link>
                  </div>
                </div>
              </article>
            ) : null}

            <div className="mt-5 grid gap-4">
              {Array.from(groupedPartners.values()).map((group) => (
                <article key={group.tournamentId || group.tournamentName} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><h3 className="font-heading text-2xl text-text-primary">{group.tournamentName}</h3><p className="mt-1 text-xs text-text-secondary">{group.tournamentDate || 'Дата уточняется'} · {group.players.length} ищут пару</p></div>
                    {group.tournamentId ? <Link href={`/calendar/${group.tournamentId}/register`} className="text-sm font-semibold text-orange-200 hover:text-white">Записаться на турнир →</Link> : null}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {group.players.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface/60 p-3">
                        <div><div className="text-sm font-semibold text-text-primary">{item.name}</div><div className="mt-1 text-xs text-text-secondary">{item.gender === 'M' ? 'Мужчины' : 'Женщины'} · {levelLabel(item.tournamentLevel)}</div></div>
                        {me?.id && item.requesterUserId && me.id !== item.requesterUserId ? <PartnerRequestButton sourceRequestId={item.id} /> : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {!selectedTournament ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
                  <h3 className="text-lg font-black text-text-primary">Сначала выберите турнир</h3>
                  <p className="mt-2 text-sm text-text-secondary">Поиск партнёра всегда привязан к конкретному турниру — так понятны дата, формат и уровень.</p>
                  {!upcoming.length ? <Link href="/calendar" className="mt-4 inline-flex rounded-xl border border-brand/30 px-4 py-2 text-sm font-bold text-brand">Посмотреть календарь</Link> : null}
                </div>
              ) : !groupedPartners.size ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
                  <h3 className="text-lg font-black text-text-primary">На этот турнир пока никто не ищет пару</h3>
                  <p className="mt-2 text-sm text-text-secondary">Подайте одиночную заявку и отметьте «Ищу партнёра» — вы появитесь здесь.</p>
                  <Link href={`/calendar/${selectedTournament}/register`} className="mt-4 inline-flex rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white">Подать заявку</Link>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
