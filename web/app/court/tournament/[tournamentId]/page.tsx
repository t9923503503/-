import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { ThaiTournamentJudgeWorkspace } from '@/components/thai-live/ThaiTournamentJudgeWorkspace';
import { getThaiJudgeTournamentSnapshot, isThaiJudgeError } from '@/lib/thai-live';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}): Promise<Metadata> {
  const { tournamentId } = await params;
  return {
    title: `Thai Tournament ${String(tournamentId || '').trim()} | LPVOLLEY`,
    description: 'Thai tournament-level judge workspace with round and court tabs.',
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: '#111827',
  };
}

export default async function ThaiTournamentJudgePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  try {
    const { tournamentId } = await params;
    const snapshot = await getThaiJudgeTournamentSnapshot(tournamentId);
    return <ThaiTournamentJudgeWorkspace initialSnapshot={snapshot} />;
  } catch (error) {
    if (isThaiJudgeError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
