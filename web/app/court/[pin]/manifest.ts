import type { MetadataRoute } from 'next';

export default async function manifest({
  params,
}: {
  params: Promise<{ pin: string }>;
}): Promise<MetadataRoute.Manifest> {
  const { pin } = await params;
  const normalizedPin = encodeURIComponent(String(pin || '').trim().toUpperCase());
  const startUrl = `/court/${normalizedPin}`;

  return {
    id: startUrl,
    name: `LPVOLLEY Судья ${String(pin || '').trim().toUpperCase()}`,
    short_name: `Судья ${String(pin || '').trim().toUpperCase()}`,
    description: 'Судейский экран LPVOLLEY для активного PIN корта.',
    start_url: startUrl,
    scope: `/court/${normalizedPin}`,
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#111827',
    orientation: 'portrait',
    icons: [
      {
        src: '/kotc/assets/logo_lp_192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/kotc/assets/logo_lp_512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
