import type { Metadata } from 'next';
import { ThaiTournamentControlClient } from '@/components/thai-live/ThaiTournamentControlClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const short = String(id || '').slice(0, 8);
  return {
    title: `Thai Live · ${short}… | Админ`,
    description: 'Управление Thai Next: жеребьёвка R1, завершение раундов, R2.',
  };
}

export default async function AdminThaiTournamentLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ThaiTournamentControlClient tournamentId={id} />;
}
