import { notFound } from 'next/navigation';
import { TournamentWizard } from '@/components/admin/tournaments/TournamentWizard';
import { getTournamentById, listPlayers, listRosterParticipants } from '@/lib/admin-queries';

export const dynamic = 'force-dynamic';

export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, players, roster] = await Promise.all([
    getTournamentById(id),
    listPlayers(),
    listRosterParticipants(id),
  ]);
  if (!tournament) notFound();

  return (
    <TournamentWizard
      mode="edit"
      initialTournament={tournament}
      initialPlayers={players}
      initialRoster={roster}
    />
  );
}
