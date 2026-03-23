import type { Metadata } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Судьям | Лютые Пляжники',
  description: 'Приложение судьи King of the Court — управление кортами, таблицами и таймерами.',
};

// Middleware уже проверил PIN — если мы здесь, доступ разрешён
export default async function SudyamPage() {
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? '';
  const proto = headerStore.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const siteUrl = host ? `${proto}://${host}/` : '/';
  const configuredKotcUrl = String(process.env.NEXT_PUBLIC_KOTC_URL || '').trim();
  const kotcUrl =
    configuredKotcUrl && !(process.env.NODE_ENV === 'production' && configuredKotcUrl.includes('localhost'))
      ? configuredKotcUrl
      : host
        ? `${proto}://${host}/kotc/`
        : '/kotc/';

  let iframeSrc = kotcUrl;
  try {
    const url = new URL(kotcUrl);
    url.searchParams.set('siteUrl', siteUrl);
    iframeSrc = url.toString();
  } catch (_) {
    const sep = kotcUrl.includes('?') ? '&' : '?';
    iframeSrc = `${kotcUrl}${sep}siteUrl=${encodeURIComponent(siteUrl)}`;
  }

  return (
    <iframe
      src={iframeSrc}
      className="w-full h-[calc(100vh-4rem)] border-0"
      title="King of the Court — приложение судьи"
      allow="clipboard-write"
    />
  );
}
