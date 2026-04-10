import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KotcNextSpectatorBoard } from '@/components/kotc-next/KotcNextSpectatorBoard';
import { getKotcNextSpectatorPayload } from '@/lib/kotc-next/spectator';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const short = String(id || '').slice(0, 8);
  return {
    title: `KOTC Next Live · ${short}…`,
    description: 'Публичное табло KOTC Next: корты, live standings и итоговые зоны.',
  };
}

export default async function LiveKotcNextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await getKotcNextSpectatorPayload(id);
  if (!payload) {
    notFound();
  }
  return <KotcNextSpectatorBoard data={payload} />;
}
