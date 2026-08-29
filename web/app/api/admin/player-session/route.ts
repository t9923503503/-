import { NextRequest, NextResponse } from 'next/server';
import { createPlayerAdminActor, isAdminPlayerEmail } from '@/lib/admin-player-access';
import { setAdminSessionCookie } from '@/lib/admin-auth';
import { getPool } from '@/lib/db';
import { getPlayerTokenFromCookieHeader, verifyPlayerToken } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

function buildExternalRedirectUrl(req: NextRequest, targetPath: string): URL {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  return forwardedHost
    ? new URL(targetPath, `${forwardedProto || 'https'}://${forwardedHost}`)
    : new URL(targetPath, req.url);
}

function safeAdminReturnTo(value: string | null): string {
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/admin') || candidate.startsWith('//')) return '/admin';
  return candidate;
}

function redirectToAdminLogin(req: NextRequest): NextResponse {
  const response = NextResponse.redirect(buildExternalRedirectUrl(req, '/admin/login'), { status: 303 });
  response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  return response;
}

export async function GET(req: NextRequest) {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  const player = token ? verifyPlayerToken(token) : null;
  if (!player) return redirectToAdminLogin(req);

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT email FROM users WHERE id = $1 LIMIT 1',
      [player.id],
    );
    const email = rows[0]?.email ? String(rows[0].email) : null;
    if (!isAdminPlayerEmail(email)) return redirectToAdminLogin(req);

    const returnTo = safeAdminReturnTo(req.nextUrl.searchParams.get('returnTo'));
    const response = NextResponse.redirect(buildExternalRedirectUrl(req, returnTo), { status: 303 });
    setAdminSessionCookie(response, createPlayerAdminActor(player.id));
    response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    return response;
  } catch (error) {
    console.error('[api/admin/player-session]', error);
    return redirectToAdminLogin(req);
  }
}
