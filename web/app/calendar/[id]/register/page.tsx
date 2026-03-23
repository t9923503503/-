import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournamentRegisterForm from '@/components/calendar/TournamentRegisterForm';
import { fetchTournamentById } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Запись на турнир | Лютые пляжники',
  description: 'Подача заявки на участие в турнире King of the Court.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentRegisterPage({ params }: PageProps) {
  const { id } = await params;
  const tournament = await fetchTournamentById(id);

  if (!tournament) {
    notFound();
  }

  const isRegistrationClosed =
    tournament.status === 'finished' || tournament.status === 'cancelled';

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <nav className="text-text-secondary text-sm font-body">
        <Link href="/calendar" className="hover:text-brand transition-colors">
          ← Календарь
        </Link>
      </nav>

      <h1 className="mt-4 font-heading text-4xl text-text-primary tracking-wide">
        Запись на турнир
      </h1>

      <p className="mt-2 text-text-secondary font-body">
        Турнир: <span className="text-text-primary/90">{tournament.name}</span>
      </p>
      <p className="mt-1 text-text-secondary font-body text-sm">
        Статус: <span className="text-text-primary/90">{tournament.status}</span>
      </p>

      {isRegistrationClosed ? (
        <section className="mt-8 rounded-xl border border-white/10 bg-surface-light/20 p-6 md:p-8">
          <h2 className="font-heading text-2xl text-text-primary tracking-wide">
            Запись закрыта
          </h2>
          <p className="mt-3 font-body text-text-secondary">
            Этот турнир уже завершён или отменён. Новые заявки не принимаются.
          </p>
          <Link
            href={`/calendar/${id}`}
            className="mt-5 inline-flex items-center justify-center px-6 py-3 rounded-lg font-body font-semibold transition-colors bg-brand text-white hover:bg-brand-light"
          >
            Вернуться к турниру
          </Link>
        </section>
      ) : (
        <TournamentRegisterForm tournamentId={id} />
      )}
    </main>
  );
}

