import { notFound, redirect } from 'next/navigation';
import { KotcNextTournamentWorkspace } from '@/components/kotc-next/KotcNextTournamentWorkspace';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import { SudyamBootstrapError, resolveSudyamBootstrap, type SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';

export const dynamic = 'force-dynamic';

export default async function AdminKotcNextPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [payload, actor] = await Promise.all([
      resolveSudyamBootstrap(id, 'kotc'),
      getAdminSessionFromCookies(),
    ]);
    if (payload.format !== 'kotc') notFound();
    if (payload.kotcJudgeModule === 'legacy') {
      redirect(`/sudyam?tournamentId=${encodeURIComponent(id)}&format=kotc&legacy=1`);
    }
    const initialData: SudyamBootstrapPayload = {
      ...payload,
      canAdminResetKotcNext: actor?.role === 'admin',
      canAdminForceFinishKotcRound: actor?.role === 'admin',
    };
    return (
      <KotcNextTournamentWorkspace
        initialData={initialData}
      />
    );
  } catch (error) {
    if (error instanceof SudyamBootstrapError && error.status === 404) notFound();
    throw error;
  }
}
