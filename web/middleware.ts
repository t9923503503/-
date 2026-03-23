import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';

const FALLBACK_SUDYAM_PIN = '7319';

function getExpectedSudyamPin(): string {
  const configuredPin = String(process.env.SUDYAM_PIN || '').trim();
  if (configuredPin) return configuredPin;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SUDYAM_PIN env var is required in production');
  }
  return FALLBACK_SUDYAM_PIN;
}

function buildRedirectUrl(request: NextRequest, targetPath: string): URL {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const url = request.nextUrl.clone();
  url.pathname = targetPath;
  url.search = '';
  if (forwardedHost) {
    url.host = forwardedHost;
  }
  if (forwardedProto) {
    url.protocol = `${forwardedProto}:`;
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

  const isSudyam = pathname.startsWith('/sudyam');
  const isSudyamLogin = pathname.startsWith('/sudyam/login');
  if (isSudyam && !isSudyamLogin) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const expectedPin = getExpectedSudyamPin();
    if (!token || token !== expectedPin) {
      return NextResponse.redirect(buildRedirectUrl(request, '/sudyam/login'));
    }
  }

  const isAdmin = pathname.startsWith('/admin');
  const isAdminLogin = pathname.startsWith('/admin/login');
  if (isAdmin && !isAdminLogin) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token || !(await isValidAdminSession(token))) {
      return NextResponse.redirect(buildRedirectUrl(request, '/admin/login'));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/sudyam', '/sudyam/:path*', '/admin', '/admin/:path*'],
};
