import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/components/seo/SchemaOrg';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import CalendarFilters from '@/components/calendar/CalendarFilters';
import {
  filterCalendarTournaments,
  getCalendarFilterOptions,
  hasActiveCalendarFilters,
  normalizeCalendarFilters,
} from '@/lib/calendar';
import { fetchTournaments } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Календарь турниров по пляжному волейболу в Сургуте | LPVolley',
  description:
    'Расписание турниров по пляжному волейболу в Сургуте: THAI, King of the Court, миксты. Дата, место, формат, статус записи — всё в одном месте.',
  keywords: [
    'календарь турниров Сургут',
    'пляжный волейбол турниры Сургут',
    'THAI Сургут',
    'King of the Court Сургут',
    'записаться на турнир волейбол',
  ],
  alternates: { canonical: 'https://lpvolley.ru/calendar' },
  openGraph: {
    title: 'Календарь турниров по пляжному волейболу в Сургуте | LPVolley',
    description: 'Расписание турниров: THAI, King of the Court, миксты. Дата, место, формат, статус записи.',
    url: 'https://lpvolley.ru/calendar',
    type: 'website',
    locale: 'ru_RU',
    images: [
      {
        url: 'https://lpvolley.ru/og-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'Календарь турниров по пляжному волейболу в Сургуте',
      },
    ],
  },
};

interface CalendarPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const filters = normalizeCalendarFilters((await searchParams) ?? {});
  const tournaments = await fetchTournaments(200);
  const baseList =
    filters.status === 'cancelled'
      ? tournaments
      : tournaments.filter((tournament) => tournament.status !== 'cancelled');
  const visible = filterCalendarTournaments(baseList, filters);
  const options = getCalendarFilterOptions(baseList);
  const hasFilters = hasActiveCalendarFilters(filters);

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Главная', url: 'https://lpvolley.ru/' },
          { name: 'Календарь', url: 'https://lpvolley.ru/calendar' },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_85%_20%,rgba(255,104,0,.23),transparent_35%),linear-gradient(135deg,#171717,#090909)] px-6 py-10 md:px-10 md:py-14">
          <div className="absolute -right-10 -top-16 select-none font-heading text-[180px] leading-none text-white/[0.025]" aria-hidden="true">26</div>
          <div className="relative max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[.28em] text-brand">LPVolley · Сургут</p>
            <h1 className="mt-4 font-heading text-5xl leading-[.9] tracking-wide text-white md:text-7xl">Время выходить<br /><span className="text-brand">на песок</span></h1>
            <p className="mt-5 max-w-xl font-body text-base leading-7 text-white/55 md:text-lg">Выбирай турнир по уровню и формату. Дата, место и свободные места — сразу по делу.</p>
          </div>
        </section>

        <CalendarFilters
          filters={filters}
          options={options}
          totalCount={baseList.length}
          visibleCount={visible.length}
        />

        <div className="mt-10">
          <CalendarGrid
            tournaments={visible}
            emptyTitle={
              hasFilters
                ? 'По текущим фильтрам турниров не найдено.'
                : 'Пока нет турниров.'
            }
            emptyHint={
              hasFilters
                ? 'Сбросьте часть фильтров или попробуйте другой месяц и формат.'
                : 'Следите за обновлениями — скоро появятся новые события.'
            }
          />
        </div>
      </main>
    </>
  );
}
