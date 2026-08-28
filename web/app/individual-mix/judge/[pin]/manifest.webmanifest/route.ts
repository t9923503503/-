import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const normalized = String(pin || '').trim().toUpperCase();
  return NextResponse.json({
    name: `LPVolley · Судья · ${normalized}`,
    short_name: `Корт ${normalized}`,
    start_url: `/individual-mix/judge/${encodeURIComponent(normalized)}`,
    scope: '/individual-mix/',
    display: 'standalone',
    background_color: '#080d15',
    theme_color: '#080d15',
    lang: 'ru',
  }, { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
