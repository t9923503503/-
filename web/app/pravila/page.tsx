import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/components/seo/SchemaOrg';
import MetrikaPageViewGoal from '@/components/analytics/MetrikaPageViewGoal';
import { METRIKA_GOALS } from '@/lib/metrika-goals';

export const metadata: Metadata = {
  title: 'Форматы турниров по пляжному волейболу: правила и регламент | LPVolley',
  description:
    'Правила и форматы турниров по пляжному волейболу в Сургуте: King of the Court и THAI. Уровни Hard, Advance, Medium и Light, механика игры и регистрация.',
  keywords: [
    'правила пляжного волейбола',
    'форматы турниров волейбол',
    'King of the Court правила',
    'THAI волейбол правила',
    'пляжный волейбол Сургут',
  ],
  alternates: { canonical: 'https://lpvolley.ru/pravila' },
  openGraph: {
    title: 'Форматы турниров по пляжному волейболу | LPVolley',
    description: 'THAI и King of the Court: механика турниров, уровни и регистрация.',
    url: 'https://lpvolley.ru/pravila',
    type: 'website',
    locale: 'ru_RU',
    images: [{
      url: 'https://lpvolley.ru/og-banner.jpg',
      width: 1200,
      height: 630,
      alt: 'Форматы и правила турниров по пляжному волейболу',
    }],
  },
};

const LEVELS = [
  { emoji: '🔥', name: 'HARD' },
  { emoji: '⚡️', name: 'ADVANCE' },
  { emoji: '🌊', name: 'MEDIUM' },
  { emoji: '💥', name: 'LIGHT' },
] as const;

const FORMATS = [
  {
    id: 'thai',
    eyebrow: 'Новый тур — новая команда',
    title: 'THAI',
    subtitle: 'С разными партнёрами!',
    icon: '⚡️',
    bannerSrc: '/images/pravila/mixup.svg',
    bannerAlt: 'THAI — игроки меняют партнёров и соперников каждый тур',
    borderClass: 'border-purple-500/45',
    gradientClass: 'from-purple-500/15 via-fuchsia-500/5 to-transparent',
    features: [
      'Случайные пары каждый тур',
      'Новые напарники и соперники',
      'Максимум игр — минимум ожидания',
      'Максимум драйва и борьбы',
    ],
  },
  {
    id: 'kotc',
    eyebrow: 'Формат королей пляжа',
    title: 'King of the Court',
    subtitle: 'Займи трон и удержи его',
    icon: '👑',
    bannerSrc: '/images/pravila/kotc.svg',
    bannerAlt: 'King of the Court — король и претендент на пляжном корте',
    borderClass: 'border-amber-500/50',
    gradientClass: 'from-amber-500/15 via-orange-500/5 to-transparent',
    features: [
      'Постоянная смена команд',
      'Динамичные игры без остановки',
      'Максимум касаний — минимум отдыха',
      'Атмосфера лютого пляжа гарантирована',
    ],
  },
] as const;

function LevelChips({ amber = false }: { amber?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 lg:justify-end" aria-label="Лиги турниров">
      {LEVELS.map((level) => (
        <span
          key={level.name}
          className={`rounded-full border px-3 py-2 font-heading text-xs tracking-[0.12em] text-text-primary ${
            amber ? 'border-amber-400/30 bg-surface/70' : 'border-white/15 bg-white/5'
          }`}
        >
          <span aria-hidden="true">{level.emoji}</span> {level.name}
        </span>
      ))}
    </div>
  );
}

function FormatCard({ format }: { format: (typeof FORMATS)[number] }) {
  const headingId = `${format.id}-title`;
  return (
    <article
      id={format.id}
      aria-labelledby={headingId}
      className={`scroll-mt-24 overflow-hidden rounded-3xl border ${format.borderClass} bg-surface shadow-2xl shadow-black/10`}
    >
      <div className="relative h-48 overflow-hidden sm:h-56">
        <img src={format.bannerSrc} alt={format.bannerAlt} className="absolute inset-0 h-full w-full object-cover" />
        <div className={`absolute inset-0 bg-gradient-to-t ${format.gradientClass}`} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/15 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
          <p className="font-heading text-xs uppercase tracking-[0.2em] text-brand">{format.eyebrow}</p>
          <div className="mt-2 flex items-start gap-3">
            <span aria-hidden="true" className="text-3xl sm:text-4xl">{format.icon}</span>
            <div>
              <h2 id={headingId} className="font-heading text-3xl leading-none tracking-wide text-text-primary sm:text-4xl">
                {format.title}
              </h2>
              <p className="mt-2 font-body text-sm font-semibold text-text-secondary sm:text-base">{format.subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100%-12rem)] flex-col p-6 sm:p-7">
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.18em] text-text-primary">Тебя ждёт</p>
          <ul className="mt-4 space-y-3">
            {format.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 font-body text-sm leading-relaxed text-text-secondary sm:text-base">
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-brand">⚡️</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-7 border-t border-white/10 pt-6">
          <p className="font-heading text-sm uppercase tracking-[0.16em] text-text-primary">
            Призы и подарки победителям каждой лиги
          </p>
          <div className="mt-4"><LevelChips /></div>
        </div>
      </div>
    </article>
  );
}

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <BreadcrumbSchema items={[
        { name: 'Главная', url: 'https://lpvolley.ru/' },
        { name: 'Виды турниров', url: 'https://lpvolley.ru/pravila' },
      ]} />
      <MetrikaPageViewGoal goalId={METRIKA_GOALS.rulesOpen} params={{ pageType: 'rules' }} />

      <header className="mx-auto max-w-3xl text-center">
        <p className="font-heading text-sm uppercase tracking-[0.28em] text-brand">Два формата · один пляж</p>
        <h1 className="mt-3 font-heading text-5xl uppercase tracking-wide text-text-primary sm:text-6xl">Виды турниров</h1>
        <p className="mx-auto mt-5 max-w-2xl font-body text-base leading-relaxed text-text-secondary sm:text-lg">
          Выбирай свой ритм: новые партнёры в каждом туре THAI или непрерывная борьба за трон в King of the Court.
        </p>
      </header>

      <aside aria-label="Призы и подарки" className="mt-10 rounded-3xl border border-amber-400/35 bg-gradient-to-r from-brand/10 via-amber-300/5 to-brand/10 p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="text-4xl">🏆</span>
            <div>
              <h2 className="font-heading text-2xl text-text-primary sm:text-3xl">Призы и подарки — в каждом формате</h2>
              <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-text-secondary sm:text-base">
                На турнирах THAI и King of the Court мы награждаем победителей каждой лиги. У каждого уровня — свой зачёт, свои чемпионы и свои призы.
              </p>
            </div>
          </div>
          <div className="lg:max-w-sm"><LevelChips amber /></div>
        </div>
      </aside>

      <section aria-label="Форматы турниров" className="mt-6 grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
        {FORMATS.map((format) => <FormatCard key={format.id} format={format} />)}
      </section>

      <div className="mt-10 rounded-3xl border border-brand/30 bg-brand/5 px-6 py-8 text-center sm:px-10">
        <p className="font-heading text-2xl text-text-primary sm:text-3xl">Готов выйти на песок?</p>
        <p className="mx-auto mt-2 max-w-xl font-body text-sm leading-relaxed text-text-secondary sm:text-base">
          Выбери ближайший THAI или King of the Court и запишись на турнир.
        </p>
        <a href="/calendar" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-7 py-3 font-heading text-sm uppercase tracking-[0.14em] text-surface transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
          Открыть календарь
        </a>
      </div>
    </main>
  );
}
