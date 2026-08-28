import { notFound } from 'next/navigation';
import { IndividualMixAdminWorkspace } from '@/components/individual-mix/IndividualMixAdminWorkspace';
import { getTournamentById, listRosterParticipants } from '@/lib/admin-queries';
import {
  INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT,
  isSixPairIndividualMixVariant,
  normalizeIndividualMixAdminVariant,
  type IndividualMixPlayer,
} from '@/lib/individual-mix';

export const dynamic = 'force-dynamic';

export default async function AdminIndividualMixPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, roster] = await Promise.all([
    getTournamentById(id),
    listRosterParticipants(id),
  ]);

  if (!tournament || String(tournament.format).toLowerCase() !== 'individual mix') notFound();

  const variant = normalizeIndividualMixAdminVariant(tournament.settings?.individualMixVariant);
  const sixPairVariant = isSixPairIndividualMixVariant(variant);
  const courts = sixPairVariant ? 2 : Math.max(1, Math.min(4, Math.floor(Number(tournament.settings?.courts ?? 2))));
  const poolSize = (sixPairVariant ? 6 : Math.max(4, Math.min(6, Math.floor(Number(tournament.settings?.individualMixPoolSize ?? 5))))) as 4 | 5 | 6;
  const pointLimit = sixPairVariant
    ? INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT
    : Math.max(5, Math.min(30, Math.floor(Number(tournament.settings?.individualMixPointLimit ?? 15))));
  const pairGender = String(tournament.settings?.individualMixPairGender ?? (tournament.division === 'Мужской' ? 'M' : 'W')).toUpperCase() === 'M' ? 'M' : 'W';
  const initialPlayers: IndividualMixPlayer[] = roster
    .filter((participant) => !participant.isWaitlist)
    .sort((left, right) => left.position - right.position)
    .map((participant, index) => ({
      id: participant.playerId,
      name: participant.playerName,
      gender: participant.gender === 'W' ? 'W' : 'M',
      drawSeed: index + 1,
    }));
  const demoMode = String(tournament.status).toLowerCase() === 'draft' && initialPlayers.length === 0;
  const liveEnabled = String(
    process.env.INDIVIDUAL_MIX_LIVE_V1 ?? (process.env.NODE_ENV === 'production' ? '0' : '1'),
  ).trim() === '1';

  return (
    <IndividualMixAdminWorkspace
      tournamentId={tournament.id}
      tournamentName={tournament.name}
      initialCourts={courts}
      initialPoolSize={poolSize}
      pointLimit={pointLimit}
      variant={variant}
      pairGender={pairGender}
      initialPlayers={initialPlayers}
      demoMode={demoMode}
      liveEnabled={liveEnabled}
    />
  );
}
