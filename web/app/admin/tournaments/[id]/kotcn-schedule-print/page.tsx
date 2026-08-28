import type { Metadata } from 'next';
import { KotcNextSchedulePrintClient } from '@/components/kotc-next/KotcNextSchedulePrintClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = String(id || '').slice(0, 8);
  return {
    title: `Печать KOTC · ${short}… | Админ`,
    description: 'Расписание KOTC Next для печати и выдачи судьям на корты.',
  };
}

export default async function AdminKotcNextSchedulePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KotcNextSchedulePrintClient tournamentId={id} />;
}
