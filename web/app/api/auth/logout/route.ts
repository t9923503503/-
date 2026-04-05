import { NextResponse } from 'next/server';
import { clearPlayerCookie } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearPlayerCookie(response);
  return response;
}
