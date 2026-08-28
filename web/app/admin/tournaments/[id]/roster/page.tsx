import { notFound } from 'next/navigation';
import { TournamentRosterManager } from '@/components/admin/tournaments/TournamentRosterManager';
import { getTournamentById, listPlayers, listRosterParticipants } from '@/lib/admin-queries';

export const dynamic = 'force-dynamic';

export default async function TournamentRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, players, participants] = await Promise.all([
    getTournamentById(id),
    listPlayers(),
    listRosterParticipants(id),
  ]);

  if (!tournament) notFound();

  return (
    <TournamentRosterManager
      tournament={tournament}
      initialPlayers={players}
      initialParticipants={participants}
    />
  );
}
