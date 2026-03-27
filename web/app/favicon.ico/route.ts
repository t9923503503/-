import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export const dynamic = 'force-static';

export async function GET(request: Request) {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;
  return NextResponse.redirect(new URL('/kotc/assets/favicon.png', origin));
}
