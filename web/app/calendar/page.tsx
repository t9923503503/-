import type { Metadata } from 'next';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import { fetchTournaments } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Календарь турниров | Лютые пляжники',
  description:
    'Расписание турниров King of the Court. Дата, место, формат, статус записи.',
};

export default async function CalendarPage() {
  const tournaments = await fetchTournaments(20);
  const visible = tournaments.filter((t) => t.status !== 'cancelled');

  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide">
        КАЛЕНДАРЬ
      </h1>
      <p className="mt-3 font-body text-text-secondary">
        Дата, локация, формат и статус записи — всё в одном месте.
      </p>

      <div className="mt-10">
        <CalendarGrid tournaments={visible} />
      </div>
    </main>
  );
}
