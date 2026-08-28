import { notFound } from 'next/navigation';
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
    const initialData: SudyamBootstrapPayload = {
      ...payload,
      canAdminResetKotcNext: actor?.role === 'admin',
      canAdminForceFinishKotcRound: actor?.role === 'admin',
    };
    return (
      <KotcNextTournamentWorkspace
        cockpitV3Enabled={process.env.KOTC_COCKPIT_V3_ENABLED !== 'false'}
        initialData={initialData}
      />
    );
  } catch (error) {
    if (error instanceof SudyamBootstrapError && error.status === 404) notFound();
    throw error;
  }
}
