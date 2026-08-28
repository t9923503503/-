import { TournamentWizard } from '@/components/admin/tournaments/TournamentWizard';
import { getTournamentById, listPlayers } from '@/lib/admin-queries';
import { stripTournamentForDuplicate } from '@/lib/admin-tournaments-ui';

export const dynamic = 'force-dynamic';

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string | string[] }>;
}) {
  const params = await searchParams;
  const duplicateId = Array.isArray(params.duplicate) ? params.duplicate[0] : params.duplicate;
  const [players, source] = await Promise.all([
    listPlayers(),
    duplicateId ? getTournamentById(duplicateId) : Promise.resolve(null),
  ]);
  const initialTournament = source ? stripTournamentForDuplicate(source) : null;

  return (
    <TournamentWizard
      mode={source ? 'duplicate' : 'create'}
      initialTournament={initialTournament}
      initialPlayers={players}
    />
  );
}
