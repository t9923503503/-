import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { BreadcrumbSchema } from '@/components/seo/SchemaOrg';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { getMyPlayAvailability, listPlayFeed, type PlayActionCard } from '@/lib/play-service';
import PlayCard from '@/components/play/PlayCard';
import PlayAvailabilityWidget from '@/components/play/PlayAvailabilityWidget';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Игры | LPVolley · Лютые пляжники',
  description: 'Найди игру по пляжному волейболу в Сургуте: твои игры, подбор «Для тебя», лист ожидания и результаты.',
  alternates: { canonical: 'https://lpvolley.ru/play' },
};

const ACTION_CARD_TEXT: Record<PlayActionCard['kind'], (count: number) => string> = {
  confirm_attendance: () => '🙋 Подтвердить присутствие',
  enter_result: () => '📝 Внести результат',
  approve_result: () => '✅ Утвердить результат',
  fix_result: (count) => `🛠 Исправить результат${count > 1 ? ` · ${count}` : ''}`,
  pending_requests: (count) => `📥 Заявок ждут ответа: ${count}`,
};

function actionCardHref(card: PlayActionCard): string {
  if (card.kind === 'confirm_attendance') return `/play/${card.postId}#attendance`;
  if (card.kind === 'enter_result') return `/partner/${card.postId}/live`;
  if (card.kind === 'approve_result' || card.kind === 'fix_result') return `/play/${card.postId}#result`;
  return `/partner/manage?post=${encodeURIComponent(card.postId)}`;
}

export default async function PlayPage() {
  const store = await cookies();
  const token = store.get(PLAYER_COOKIE)?.value;
  const me = token ? verifyPlayerToken(token) : null;

  const [feed, availability] = await Promise.all([
    listPlayFeed(me?.id ?? null),
    me ? getMyPlayAvailability(me.id) : Promise.resolve(null),
  ]);

  const authenticated = Boolean(me);

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Главная', url: 'https://lpvolley.ru/' },
          { name: 'Игры', url: 'https://lpvolley.ru/play' },
        ]}
      />
      <main className="relative mx-auto max-w-6xl overflow-hidden px-4 py-8 md:py-12">
        <div className="pointer-events-none absolute -right-24 top-12 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />

        <header className="relative grid gap-6 border-b border-white/10 pb-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Лютые пляжники · powered by LPVOLLEY</p>
            <h1 className="mt-3 max-w-4xl font-heading text-5xl uppercase leading-[0.92] tracking-wide text-text-primary md:text-7xl">
              Хочу играть
            </h1>
            <p className="mt-4 max-w-2xl font-body text-text-secondary">
              Найди игру → впишись → сыграй → подтверди результат → собери этих же ещё раз.
            </p>
          </div>
          <Link href="/partner/manage" className="inline-flex h-fit items-center justify-center rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-sm font-semibold text-orange-100 transition hover:bg-brand/20">
            Создать игру
          </Link>
        </header>

        {authenticated ? (
          <div className="relative mt-6">
            <PlayAvailabilityWidget current={availability} />
          </div>
        ) : null}

        {feed.actionCards.length ? (
          <section className="relative mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {feed.actionCards.map((card) => (
              <Link
                key={`${card.kind}:${card.postId}`}
                href={actionCardHref(card)}
                className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 transition hover:bg-amber-300/15"
              >
                <span className="block text-sm font-semibold text-amber-100">{ACTION_CARD_TEXT[card.kind](card.count)}</span>
                <span className="mt-0.5 block truncate text-xs text-text-secondary">{card.title}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {feed.mine.length ? (
          <section className="relative mt-10">
            <h2 className="font-heading text-4xl tracking-wide text-text-primary">Твоё</h2>
            <div className="mt-4 grid gap-4">
              {feed.mine.map((post) => <PlayCard key={post.id} post={post} authenticated={authenticated} />)}
            </div>
          </section>
        ) : null}

        <section className="relative mt-10">
          <h2 className="font-heading text-4xl tracking-wide text-text-primary">
            {authenticated ? 'Для тебя' : 'Ближайшие игры'}
          </h2>
          <div className="mt-4 grid gap-4">
            {feed.forYou.length ? feed.forYou.map((post) => (
              <PlayCard key={post.id} post={post} authenticated={authenticated} hot={authenticated && post.fit === 'match'} />
            )) : (
              <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.025] px-6 py-14 text-center">
                <h3 className="font-heading text-3xl text-text-primary">Пока нет подходящих игр</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {authenticated
                    ? 'Отметься «🟢 Я свободен» — организаторы найдут тебя сами.'
                    : 'Войдите, чтобы видеть персональный подбор и записываться.'}
                </p>
              </div>
            )}
          </div>
        </section>

        {feed.myGames.length ? (
          <section className="relative mt-10">
            <h2 className="font-heading text-4xl tracking-wide text-text-primary">Твои игры</h2>
            <div className="mt-4 grid gap-4">
              {feed.myGames.map((post) => <PlayCard key={post.id} post={post} authenticated={authenticated} />)}
            </div>
          </section>
        ) : null}

        <section className="relative mt-12 rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-6">
          <h2 className="font-heading text-3xl tracking-wide text-text-primary">Турниры</h2>
          <p className="mt-2 text-sm text-text-secondary">Официальные события «Лютых пляжников» — расписание, составы, лист ожидания.</p>
          <Link href="/calendar" className="mt-4 inline-flex rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5 text-sm font-semibold text-orange-100 transition hover:bg-brand/20">
            Открыть календарь турниров →
          </Link>
        </section>
      </main>
    </>
  );
}
