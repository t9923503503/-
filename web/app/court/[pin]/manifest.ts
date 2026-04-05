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
    name: `LPVOLLEY Thai Judge ${String(pin || '').trim().toUpperCase()}`,
    short_name: `Thai ${String(pin || '').trim().toUpperCase()}`,
    description: 'Thai judge workspace with local draft restore for beach courts.',
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
