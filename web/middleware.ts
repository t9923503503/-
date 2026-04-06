import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';
import { getExpectedJudgePin } from '@/lib/judge-pin';

function getJudgePinOrThrow(): string {
  return getExpectedJudgePin();
}

function buildRedirectUrl(request: NextRequest, targetPath: string, options?: { returnTo?: boolean }): URL {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (forwardedHost) {
    const hostname = forwardedHost.split(':')[0];
    const url = new URL(targetPath, `${forwardedProto}://${hostname}`);
    if (options?.returnTo && nextPath) {
      url.searchParams.set('returnTo', nextPath);
    }
    return url;
  }
  const url = request.nextUrl.clone();
  url.pathname = targetPath;
  url.search = '';
  if (options?.returnTo && nextPath) {
    url.searchParams.set('returnTo', nextPath);
  }
  return url;
}

function getAdminSessionSecret(): string {
  const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_SESSION_SECRET env var is required in production');
  }
  return 'dev-admin-session-secret';
}

function b64UrlToBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padLength);
}

async function signPart(part: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(part));
  const bytes = Array.from(new Uint8Array(signature));
  const binary = bytes.map((byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function isValidAdminSession(token: string): Promise<boolean> {
  const [part, sig] = String(token || '').split('.');
  if (!part || !sig) return false;

  const secret = getAdminSessionSecret();
  const expected = await signPart(part, secret);
  if (expected !== sig) return false;

  try {
    const payload = JSON.parse(atob(b64UrlToBase64(part))) as { exp?: number; id?: string; role?: string };
    if (!payload?.id || !payload?.role || !payload?.exp) return false;
    return Date.now() <= Number(payload.exp);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /sudyam and /sudyam/* — but NOT /sudyam2 (separate route)
  const isSudyam = pathname === '/sudyam' || pathname.startsWith('/sudyam/');
  const isSudyamLogin = pathname.startsWith('/sudyam/login');
  if (isSudyam && !isSudyamLogin) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    let expectedPin: string;
    try {
      expectedPin = getJudgePinOrThrow();
    } catch {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login', { returnTo: true }));
    }
    if (!token || token !== expectedPin) {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login', { returnTo: true }));
    }
  }

  // /sudyam2 — same PIN gate, but separate prefix
  const isSudyam2 = pathname === '/sudyam2' || pathname.startsWith('/sudyam2/');
  if (isSudyam2) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    let expectedPin: string;
    try {
      expectedPin = getJudgePinOrThrow();
    } catch {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login', { returnTo: true }));
    }
    if (!token || token !== expectedPin) {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login', { returnTo: true }));
    }
  }

  const isCourtEntry =
    pathname === '/court' ||
    pathname === '/court/' ||
    pathname.startsWith('/court/tournament');
  if (isCourtEntry) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    let expectedPin: string;
    try {
      expectedPin = getJudgePinOrThrow();
    } catch {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login', { returnTo: true }));
    }
    if (!token || token !== expectedPin) {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login', { returnTo: true }));
    }
  }

  const isAdmin = pathname.startsWith('/admin');
  const isAdminLogin = pathname.startsWith('/admin/login');
  if (isAdmin && !isAdminLogin) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token || !(await isValidAdminSession(token))) {
      const response = NextResponse.redirect(buildRedirectUrl(request, '/admin/login'));
      response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      return response;
    }
  }

  const response = NextResponse.next();
  if (isAdmin) {
    response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  }
  return response;
}

export const config = {
  matcher: [
    '/sudyam',
    '/sudyam/:path*',
    '/sudyam2',
    '/sudyam2/:path*',
    '/court',
    '/court/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
