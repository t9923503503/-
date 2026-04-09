import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { KotcNextTournamentWorkspace } from '@/components/kotc-next/KotcNextTournamentWorkspace';
import { SudyamBootstrapError, resolveSudyamBootstrap } from '@/lib/sudyam-bootstrap';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const short = String(id || '').slice(0, 8);
  return {
    title: `KOTC Next · ${short}… | Sudyam`,
    description: 'Операторский контроль KOTC Next: bootstrap R1/R2, PIN-корты, live state и итоговые зоны.',
  };
}

export default async function SudyamKotcNextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const payload = await resolveSudyamBootstrap(id, 'kotc');
    if (payload.format !== 'kotc') {
      notFound();
    }
    if (payload.kotcJudgeModule === 'legacy') {
      redirect(`/sudyam?tournamentId=${encodeURIComponent(id)}&format=kotc&legacy=1`);
    }
    return <KotcNextTournamentWorkspace initialData={payload} />;
  } catch (error) {
    if (error instanceof SudyamBootstrapError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
