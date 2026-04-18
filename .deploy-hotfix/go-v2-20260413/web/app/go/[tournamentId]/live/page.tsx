import type { Metadata } from 'next';
import { GoSpectatorBoard } from '@/components/go-next/GoSpectatorBoard';
import { getGoSpectatorPayload } from '@/lib/go-next';
import type { GoSpectatorPayload } from '@/lib/go-next/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}): Promise<Metadata> {
  const { tournamentId } = await params;
  const short = String(tournamentId || '').slice(0, 8);
  return {
    title: `GO Live · ${short}…`,
    description: 'Публичное табло GO: группы, сетка и live-корты.',
  };
}

async function loadInitialPayload(tournamentId: string): Promise<GoSpectatorPayload | null> {
  try {
    return await getGoSpectatorPayload(tournamentId);
  } catch {
    return null;
  }
}

export default async function GoLivePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const initialData = await loadInitialPayload(tournamentId);
  return <GoSpectatorBoard tournamentId={tournamentId} initialData={initialData} />;
}
