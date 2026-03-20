import type { Metadata } from 'next';
import { fetchLeaderboard } from '@/lib/queries';
import RankingsClient from './RankingsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Рейтинги | Лютые Пляжники',
  description:
    'Рейтинги игроков пляжного волейбола в форматах Мужской, Женский и Микст.',
  openGraph: {
    title: 'Рейтинги | Лютые Пляжники',
    description: 'Топ игроков King of the Court по всем форматам.',
    type: 'website',
    locale: 'ru_RU',
  },
};

export default async function RankingsPage() {
  const initialEntries = await fetchLeaderboard('M', 50);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-heading text-4xl md:text-5xl text-text-primary mb-6 uppercase tracking-wide">
        Рейтинги
      </h1>
      <div className="flex flex-col gap-6">
        <RankingsClient initialEntries={initialEntries} initialType="M" />
      </div>
    </main>
  );
}
