import type { Metadata } from 'next';
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
  title: '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0442\u0443\u0440\u043d\u0438\u0440\u043e\u0432 | \u041b\u044e\u0442\u044b\u0435 \u043f\u043b\u044f\u0436\u043d\u0438\u043a\u0438',
  description:
    '\u0420\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u0442\u0443\u0440\u043d\u0438\u0440\u043e\u0432 King of the Court. \u0414\u0430\u0442\u0430, \u043c\u0435\u0441\u0442\u043e, \u0444\u043e\u0440\u043c\u0430\u0442, \u0441\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043f\u0438\u0441\u0438.',
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
    <main className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide">
        {'\u041a\u0410\u041b\u0415\u041d\u0414\u0410\u0420\u042c'}
      </h1>
      <p className="mt-3 font-body text-text-secondary">
        {'\u0414\u0430\u0442\u0430, \u043b\u043e\u043a\u0430\u0446\u0438\u044f, \u0444\u043e\u0440\u043c\u0430\u0442 \u0438 \u0441\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043f\u0438\u0441\u0438 \u2014 \u0432\u0441\u0451 \u0432 \u043e\u0434\u043d\u043e\u043c \u043c\u0435\u0441\u0442\u0435.'}
      </p>

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
              ? '\u041f\u043e \u0442\u0435\u043a\u0443\u0449\u0438\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c \u0442\u0443\u0440\u043d\u0438\u0440\u043e\u0432 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.'
              : '\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0442\u0443\u0440\u043d\u0438\u0440\u043e\u0432.'
          }
          emptyHint={
            hasFilters
              ? '\u0421\u0431\u0440\u043e\u0441\u044c\u0442\u0435 \u0447\u0430\u0441\u0442\u044c \u0444\u0438\u043b\u044c\u0442\u0440\u043e\u0432 \u0438\u043b\u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0439 \u043c\u0435\u0441\u044f\u0446 \u0438 \u0444\u043e\u0440\u043c\u0430\u0442.'
              : '\u0421\u043b\u0435\u0434\u0438\u0442\u0435 \u0437\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f\u043c\u0438 \u2014 \u0441\u043a\u043e\u0440\u043e \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u043d\u043e\u0432\u044b\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f.'
          }
        />
      </div>
    </main>
  );
}
