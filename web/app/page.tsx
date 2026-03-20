import Hero from '@/components/landing/Hero';
import PlayerBanner from '@/components/landing/PlayerBanner';
import UpcomingTournaments from '@/components/landing/UpcomingTournaments';
import CTA from '@/components/landing/CTA';
import { fetchLeaderboard, fetchTournaments, fetchHomeStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [stats, topPlayers, tournaments] = await Promise.all([
    fetchHomeStats(),
    fetchLeaderboard('M', 3),
    fetchTournaments(6),
  ]);

  // Только открытые/заполненные для "Ближайшие турниры"
  const upcoming = tournaments.filter(t => t.status === 'open' || t.status === 'full');

  return (
    <>
      <Hero stats={stats} topPlayers={topPlayers} />
      <PlayerBanner stats={stats} />
      <UpcomingTournaments tournaments={upcoming} />
      <CTA />
    </>
  );
}
