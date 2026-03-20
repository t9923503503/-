import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchTournaments,
  fetchTeamsLookingForPartner,
} from '@/lib/queries';
import PlayerCard from '@/components/players/PlayerCard';
import HallOfFame from '@/components/players/HallOfFame';
import MatchHistory from '@/components/players/MatchHistory';
import RatingHistory from '@/components/players/RatingHistory';
import LookingTeams from '@/components/players/LookingTeams';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const player = await fetchPlayer(id);

  if (!player) {
    return { title: 'Игрок не найден | Лютые Пляжники' };
  }

  return {
    title: `${player.name} | Лютые Пляжники`,
    description: `Профиль игрока ${player.name}. Рейтинги и статистика.`,
    openGraph: {
      title: `${player.name} | Лютые Пляжники`,
      description: `Рейтинг M: ${player.ratingM}, Ж: ${player.ratingW}, Mix: ${player.ratingMix}`,
      type: 'profile',
      locale: 'ru_RU',
    },
  };
}

export default async function PlayerPage({ params }: PageProps) {
  const { id } = await params;
  const player = await fetchPlayer(id);

  if (!player) {
    notFound();
  }

  const matches = await fetchPlayerMatches(id, 12);
  const ratingHistory = await fetchRatingHistory(id, 20);

  const tournaments = await fetchTournaments(8);
  const openLike = tournaments
    .filter((t) => t.status === 'open' || t.status === 'full')
    .slice(0, 4);
  const teamsLists = await Promise.all(
    openLike.map(async (t) => ({
      tournamentId: t.id,
      tournamentName: t.name,
      teams: await fetchTeamsLookingForPartner(t.id),
    }))
  );
  const lookingTeams = teamsLists.filter((x) => x.teams.length > 0);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link
        href="/rankings"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-brand transition-colors text-sm font-condensed mb-6"
      >
        ← Рейтинги
      </Link>

      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="md:col-span-2">
            <PlayerCard player={player} />
          </div>
          <div className="md:col-span-1">
            <HallOfFame player={player} matches={matches} />
          </div>
        </div>

        <section>
          <h2 className="font-heading text-2xl text-text-primary uppercase mb-4 tracking-wide">
            Мои матчи
          </h2>
          <MatchHistory results={matches} />
        </section>

        <section>
          <h2 className="mt-10 font-heading text-2xl text-text-primary uppercase mb-4 tracking-wide">
            История рейтинга
          </h2>
          <RatingHistory entries={ratingHistory} />
        </section>

        <section>
          <h2 className="mt-10 font-heading text-2xl text-text-primary uppercase mb-4 tracking-wide">
            Тимы ищут напарника
          </h2>
          <LookingTeams items={lookingTeams} />
        </section>
      </div>
    </main>
  );
}
