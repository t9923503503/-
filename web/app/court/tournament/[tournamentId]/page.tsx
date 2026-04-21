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
    title: `Судейский турнир ${String(tournamentId || '').trim()} | LPVOLLEY`,
    description: 'Турнирный судейский экран LPVOLLEY с вкладками раундов и кортов.',
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: '#111827',
  };
}

export default async function ThaiTournamentJudgePage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams?: Promise<{ round?: string; court?: string }>;
}) {
  try {
    const { tournamentId } = await params;
    const resolvedSearchParams = (await searchParams) ?? {};
    const selectedRoundType =
      resolvedSearchParams.round === 'r1' || resolvedSearchParams.round === 'r2'
        ? resolvedSearchParams.round
        : undefined;
    const parsedCourtNo = Number(resolvedSearchParams.court);
    const selectedCourtNo =
      Number.isInteger(parsedCourtNo) && parsedCourtNo > 0 ? parsedCourtNo : undefined;
    const snapshot = await getThaiJudgeTournamentSnapshot(tournamentId, {
      selectedRoundType,
      selectedCourtNo,
    });
    return <ThaiTournamentJudgeWorkspace initialSnapshot={snapshot} />;
  } catch (error) {
    if (isThaiJudgeError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
