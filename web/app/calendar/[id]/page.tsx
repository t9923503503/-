import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import { fetchTournamentById, fetchTournaments } from '@/lib/queries';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchTournamentById(id);

  if (!tournament) {
    return { title: 'Турнир | Лютые пляжники' };
  }

  return {
    title: `${tournament.name} | Лютые пляжники`,
    description: tournament.description
      ? tournament.description.slice(0, 160)
      : `Детали турнира ${tournament.name}.`,
  };
}

export default async function TournamentPage({ params }: PageProps) {
  const { id } = await params;
  const tournament = await fetchTournamentById(id);

  if (!tournament) notFound();

  const tournaments = await fetchTournaments(8);
  const related = tournaments
    .filter((t) => t.id !== tournament.id)
    .slice(0, 4);

  const statusText =
    tournament.status === 'open'
      ? 'Запись открыта'
      : tournament.status === 'full'
        ? 'Мест нет, возможна заявка в ожидание'
        : tournament.status === 'finished'
          ? 'Турнир завершён'
          : 'Турнир отменён';

  const ctaHelpText =
    tournament.status === 'finished' || tournament.status === 'cancelled'
      ? 'Запись на этот турнир закрыта.'
      : tournament.status === 'full'
        ? 'Заявка уйдёт в очередь модерации. После одобрения игрок будет зарегистрирован в лист ожидания.'
        : 'Заявка уйдёт в очередь модерации. После одобрения игрок будет зарегистрирован в турнир.';

  const cta = (() => {
    if (tournament.status === 'finished' || tournament.status === 'cancelled') {
      return {
        label: 'Статус недоступен',
        disabled: true,
        href: '#',
      };
    }

    return {
      label:
        tournament.status === 'full'
          ? 'Подать заявку в ожидание'
          : 'Подать заявку',
      disabled: false,
      href: `/calendar/${tournament.id}/register`,
    };
  })();

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <nav className="text-text-secondary text-sm font-body">
        <Link href="/calendar" className="hover:text-brand transition-colors">
          ← Календарь
        </Link>
      </nav>

      <section className="mt-4 rounded-xl border border-white/10 bg-surface-light/20 p-6 md:p-8">
        <h1 className="font-heading text-4xl md:text-5xl text-text-primary tracking-wide">
          {tournament.name}
        </h1>

        <div className="mt-4 flex flex-col gap-2 text-text-primary/80 font-body">
          <div>
            <span className="text-text-secondary">Дата:</span> {tournament.date}
            {tournament.time ? ` · ${tournament.time}` : ''}
          </div>
          {tournament.location ? (
            <div>
              <span className="text-text-secondary">Локация:</span>{' '}
              {tournament.location}
            </div>
          ) : null}
          <div>
            <span className="text-text-secondary">Формат:</span> {tournament.format}
          </div>
          <div>
            <span className="text-text-secondary">Дивизион:</span> {tournament.division || '—'}
          </div>
          <div>
            <span className="text-text-secondary">Уровень:</span> {tournament.level || '—'}
          </div>
          <div>
            <span className="text-text-secondary">Статус:</span> {tournament.status}
          </div>
          <div>
            <span className="text-text-secondary">Участники:</span>{' '}
            {tournament.participantCount}/{tournament.capacity}
          </div>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="font-body text-text-secondary text-sm">{statusText}</div>

          <div className="flex gap-3">
            {cta.disabled ? (
              <span className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-body font-semibold transition-colors bg-white/5 text-text-primary/50 cursor-not-allowed border border-white/10">
                {cta.label}
              </span>
            ) : (
              <a
                href={cta.href}
                className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-body font-semibold transition-colors bg-brand text-white hover:bg-brand-light"
              >
                {cta.label}
              </a>
            )}

            <Link
              href="/rankings"
              className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-body font-semibold bg-white/5 border border-white/10 text-text-primary hover:border-brand hover:text-text-primary transition-colors"
            >
              Рейтинги
            </Link>
          </div>
        </div>

        <p className="mt-4 font-body text-text-primary/70 text-sm">
          {ctaHelpText}
        </p>

        {tournament.description ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
            <h2 className="font-heading text-2xl text-text-primary tracking-wide">
              Афиша турнира
            </h2>
            <p className="mt-4 whitespace-pre-line font-body text-sm leading-7 text-text-primary/85">
              {tournament.description}
            </p>
          </div>
        ) : null}

        {tournament.participantListText ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-5">
            <h2 className="font-heading text-2xl text-text-primary tracking-wide">
              Состав участников
            </h2>
            <p className="mt-4 whitespace-pre-line font-body text-sm leading-7 text-text-primary/85">
              {tournament.participantListText}
            </p>
          </div>
        ) : null}
      </section>

      {related.length ? (
        <section className="mt-10">
          <h2 className="font-heading text-3xl text-text-primary tracking-wide">
            Похожие турниры
          </h2>
          <div className="mt-6">
            <CalendarGrid tournaments={related} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
