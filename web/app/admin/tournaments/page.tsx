import { TournamentListClient } from '@/components/admin/tournaments/TournamentListClient';
import { listTournaments } from '@/lib/admin-queries';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentsPage() {
  const tournaments = await listTournaments();
  return <TournamentListClient initialRows={tournaments} />;
}
