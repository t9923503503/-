import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ThaiSpectatorBoard } from '@/components/thai-live/ThaiSpectatorBoard';
import { getThaiSpectatorBoardPayload } from '@/lib/thai-spectator';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ tournamentId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tournamentId } = await params;
  const data = await getThaiSpectatorBoardPayload(tournamentId);
  if (!data) {
    return { title: 'Табло турнира' };
  }
  return {
    title: `${data.tournamentName} — табло`,
    description: 'Публичное табло тайского турнира: счёт и сетка без данных для судей.',
  };
}

export default async function ThaiSpectatorPage({ params }: PageProps) {
  const { tournamentId } = await params;
  const data = await getThaiSpectatorBoardPayload(tournamentId);
  if (!data) {
    notFound();
  }
  return <ThaiSpectatorBoard data={data} />;
}
