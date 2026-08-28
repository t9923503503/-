import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/components/seo/SchemaOrg';
import { fetchLeaderboard, fetchRankingCounts } from '@/lib/queries';
import type { RatingType } from '@/lib/types';
import RankingsClient from './RankingsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Рейтинг игроков пляжного волейбола в Сургуте | LPVolley',
  description:
    'Рейтинговая таблица игроков пляжного волейбола в Сургуте: места, зоны (Hard, Medium, Lite), статистика по всем форматам — миксты, мужчины, женщины.',
  keywords: [
    'рейтинг пляжный волейбол Сургут',
    'рейтинг игроков волейбол',
    'таблица лидеров волейбол',
    'Professional Points Сургут',
  ],
  alternates: { canonical: 'https://lpvolley.ru/rankings' },
  openGraph: {
    title: 'Рейтинг игроков пляжного волейбола в Сургуте | LPVolley',
    description: 'Рейтинговая таблица: места, зоны, статистика по всем форматам — миксты, мужчины, женщины.',
    url: 'https://lpvolley.ru/rankings',
    type: 'website',
    locale: 'ru_RU',
    images: [
      {
        url: 'https://lpvolley.ru/og-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'Рейтинг игроков пляжного волейбола в Сургуте',
      },
    ],
  },
};

function getDefaultRatingType(counts: Awaited<ReturnType<typeof fetchRankingCounts>>): RatingType {
  const tournamentCounts: { type: RatingType; tournaments: number }[] = [
    { type: 'Mix', tournaments: counts.mixTournaments },
    { type: 'M', tournaments: counts.menTournaments },
    { type: 'W', tournaments: counts.womenTournaments },
  ];
  const topTournamentCount = Math.max(...tournamentCounts.map((entry) => entry.tournaments));
  return tournamentCounts.find((entry) => entry.tournaments === topTournamentCount)?.type ?? 'Mix';
}

export default async function RankingsPage() {
  const counts = await fetchRankingCounts();
  const initialType = getDefaultRatingType(counts);
  const initialEntries = await fetchLeaderboard(initialType, 100);

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Главная', url: 'https://lpvolley.ru/' },
          { name: 'Рейтинг', url: 'https://lpvolley.ru/rankings' },
        ]}
      />
      <RankingsClient initialEntries={initialEntries} initialType={initialType} counts={counts} />
    </>
  );
}
