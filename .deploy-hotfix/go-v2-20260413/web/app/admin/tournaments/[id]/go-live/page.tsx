import type { Metadata } from 'next';
import { GoOperatorPanel } from '@/components/go-next/GoOperatorPanel';
import { getGoOperatorState } from '@/lib/go-next';
import type { GoOperatorState } from '@/lib/go-next/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const short = String(id || '').slice(0, 8);
  return {
    title: `GO Live · ${short}… | Админ`,
    description: 'Управление этапами GO: группы, посев сетки, олимпийка.',
  };
}

async function loadInitialState(tournamentId: string): Promise<GoOperatorState | null> {
  try {
    return await getGoOperatorState(tournamentId);
  } catch {
    return null;
  }
}

export default async function AdminGoTournamentLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialState = await loadInitialState(id);
  return <GoOperatorPanel tournamentId={id} initialState={initialState} />;
}
