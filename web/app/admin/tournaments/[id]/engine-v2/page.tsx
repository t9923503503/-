import type { Metadata } from 'next';
import { TournamentEngineV2Workspace } from '@/components/go-v2/TournamentEngineV2Workspace';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Tournament Engine V2 · ${String(id || '').slice(0, 8)} | Админ`,
    description: 'Версионируемый движок групп, тиров, сеток и расписания LPVolley.',
  };
}

export default async function TournamentEngineV2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TournamentEngineV2Workspace tournamentId={id} />;
}

