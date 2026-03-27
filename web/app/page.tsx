import LandingDesktop from '@/components/landing/LandingDesktop';
import { fetchHomeStats, fetchLeaderboard, fetchTournaments } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [stats, topPlayers, tournaments] = await Promise.all([
    fetchHomeStats(),
    fetchLeaderboard('M', 3),
    fetchTournaments(6),
  ]);

  const upcoming = tournaments.filter(
    (tournament) => tournament.status === 'open' || tournament.status === 'full'
  );

  return <LandingDesktop stats={stats} topPlayers={topPlayers} tournaments={upcoming} />;
}
