import type { Metadata } from 'next';
import { ThaiSchedulePrintClient } from '@/components/thai-live/ThaiSchedulePrintClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const short = String(id || '').slice(0, 8);
  return {
    title: `Печать расписания · ${short}… | Админ`,
    description: 'Расписание R1/R2 Thai для печати и развешивания на кортах.',
  };
}

export default async function AdminSchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <ThaiSchedulePrintClient tournamentId={id} initialSeed={sp.seed} />;
}
