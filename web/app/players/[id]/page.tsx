import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchPlayerExtendedStats,
} from '@/lib/queries';
import EpicProfile from '@/components/players/EpicProfile';

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

  const [matches, ratingHistory, stats] = await Promise.all([
    fetchPlayerMatches(id, 30),
    fetchRatingHistory(id, 30),
    fetchPlayerExtendedStats(id),
  ]);

  return (
    <main>
      <EpicProfile
        player={player}
        stats={stats}
        matches={matches}
        ratingHistory={ratingHistory}
        backLink={{ href: '/rankings', label: '\u2190 Рейтинги' }}
      />
    </main>
  );
}
