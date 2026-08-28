import type { Metadata } from 'next';
import Link from 'next/link';
import { TournamentV2PublicView } from '@/components/go-v2/TournamentV2PublicView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `LIVE турнир · ${String(id || '').slice(0, 8)} | LPVOLLEY.RU`,
    description: 'Группы, сетки, корты и актуальное расписание турнира LPVolley.',
  };
}

export default async function TournamentV2LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-6 md:px-4 md:py-10">
      <Link href={`/calendar/${encodeURIComponent(id)}`} className="text-sm font-semibold text-text-secondary hover:text-brand">
        ← К турниру
      </Link>
      <TournamentV2PublicView tournamentId={id} />
    </main>
  );
}

