import type { Metadata } from 'next';
import { fetchLeaderboard, fetchRankingCounts } from '@/lib/queries';
import RankingsClient from './RankingsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Рейтинг Лютых Игроков | Лютые Пляжники',
  description:
    'Рейтинги игроков пляжного волейбола — места, зоны, статистика по всем форматам.',
  openGraph: {
    title: 'Рейтинг Лютых Игроков',
    description: 'Professional Points — места, зоны, статистика.',
    type: 'website',
    locale: 'ru_RU',
  },
};

export default async function RankingsPage() {
  const [initialEntries, counts] = await Promise.all([
    fetchLeaderboard('M', 100),
    fetchRankingCounts(),
  ]);

  return <RankingsClient initialEntries={initialEntries} initialType="M" counts={counts} />;
}
