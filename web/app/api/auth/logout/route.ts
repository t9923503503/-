import { NextResponse } from 'next/server';
import { clearPlayerCookie } from '@/lib/player-auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearPlayerCookie(response);
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
