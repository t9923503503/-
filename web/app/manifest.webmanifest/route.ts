import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(
    {
      id: '/',
      name: 'LPVOLLEY',
      short_name: 'LPVOLLEY',
      description: 'LPVOLLEY tournament platform.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#111827',
      theme_color: '#111827',
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
      },
    },
  );
}
