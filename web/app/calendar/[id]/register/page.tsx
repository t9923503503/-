import type { Metadata } from 'next';
import Link from 'next/link';
import TournamentRegisterForm from '@/components/calendar/TournamentRegisterForm';

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
        ID турнира: <span className="text-text-primary/90">{id}</span>
      </p>

      <TournamentRegisterForm tournamentId={id} />
    </main>
  );
}

