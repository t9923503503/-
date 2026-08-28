import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { findPlayerIdsByName } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Личный кабинет | Лютые Пляжники',
  description: 'Игры, результаты, статистика и настройки игрока LPVOLLEY.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://lpvolley.ru/cabinet' },
};

interface ProfileRedirectPageProps {
  searchParams?: Promise<{ id?: string; tab?: string }>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function redirectLegacyPublicProfile(rawId: string): Promise<never> {
  if (isUuid(rawId)) redirect(`/players/${encodeURIComponent(rawId)}`);
  const ids = await findPlayerIdsByName(rawId, 2).catch(() => []);
  if (ids.length === 1) redirect(`/players/${encodeURIComponent(ids[0])}`);
  redirect('/rankings');
}

export default async function ProfileRedirectPage({ searchParams }: ProfileRedirectPageProps) {
  const params = (await searchParams) ?? {};
  const legacyId = String(params.id || '').trim();
  if (legacyId) await redirectLegacyPublicProfile(legacyId);

  const tab = String(params.tab || '').trim();
  redirect(tab ? `/cabinet?tab=${encodeURIComponent(tab)}` : '/cabinet');
}
