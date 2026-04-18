import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pin: string }> },
) {
  const { pin } = await params;
  const normalizedPin = encodeURIComponent(String(pin || '').trim().toUpperCase());
  const titlePin = String(pin || '').trim().toUpperCase();
  const startUrl = `/court/${normalizedPin}`;

  return NextResponse.json(
    {
      id: startUrl,
      name: `LPVOLLEY Судья ${titlePin}`,
      short_name: `Судья ${titlePin}`,
      description: 'Судейский экран LPVOLLEY для активного PIN корта.',
      start_url: startUrl,
      scope: startUrl,
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
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
