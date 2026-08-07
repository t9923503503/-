import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchPlayerFormatInsights,
  fetchRatingHistory,
  fetchPlayerExtendedStats,
} from '@/lib/queries';
import EpicProfile from '@/components/players/EpicProfile';
import PlayerGameStats from '@/components/players/PlayerGameStats';
import { fetchPublicPlayPlayerStats } from '@/lib/play-player-stats';

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
    alternates: { canonical: `https://lpvolley.ru/players/${player.id}` },
    openGraph: {
      title: `${player.name} | Лютые Пляжники`,
      description: `Рейтинг M: ${player.ratingM}, Ж: ${player.ratingW}, Mix: ${player.ratingMix}`,
      url: `https://lpvolley.ru/players/${player.id}`,
      type: 'profile',
      locale: 'ru_RU',
      images: [{
        url: `https://lpvolley.ru/players/${player.id}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: `Карточка игрока ${player.name}`,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${player.name} | Лютые Пляжники`,
      description: `Место в рейтинге и статистика игрока ${player.name}`,
      images: [`https://lpvolley.ru/players/${player.id}/opengraph-image`],
    },
  };
}

export default async function PlayerPage({ params }: PageProps) {
  const { id } = await params;
  const player = await fetchPlayer(id);

  if (!player) {
    notFound();
  }

  const [matches, ratingHistory, stats, gameStats] = await Promise.all([
    fetchPlayerMatches(id, 30),
    fetchRatingHistory(id, 30),
    fetchPlayerExtendedStats(id),
    fetchPublicPlayPlayerStats(id),
  ]);
  const formatInsights = await fetchPlayerFormatInsights(id, { matches, stats, player });

  return (
    <main>
      <EpicProfile
        player={player}
        stats={stats}
        matches={matches}
        ratingHistory={ratingHistory}
        formatInsights={formatInsights}
        sharePath={`/players/${player.id}`}
        claimLoginHref={`/login?returnTo=${encodeURIComponent(`/players/${player.id}`)}`}
        backLink={{ href: '/rankings', label: '← Рейтинги' }}
      />
      <PlayerGameStats stats={gameStats} />
    </main>
  );
}
