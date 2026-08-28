import { NextRequest, NextResponse } from 'next/server';
import { createAdminSessionResponse, getAdminSessionFromRequest } from '@/lib/admin-auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';
import {
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  recordAdminLoginFailure,
} from '@/lib/admin-login-rate-limit';

export const dynamic = 'force-dynamic';

function buildExternalRedirectUrl(req: NextRequest, targetPath: string): URL {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');

  if (forwardedHost) {
    return new URL(targetPath, `${forwardedProto || 'https'}://${forwardedHost}`);
  }

  return new URL(targetPath, req.url);
}

export async function GET(req: NextRequest) {
  const actor = getAdminSessionFromRequest(req);
  if (!actor) return NextResponse.json({ authenticated: false, actor: null });
  return NextResponse.json({ authenticated: true, actor });
}

export async function POST(req: NextRequest) {
  const contentType = String(req.headers.get('content-type') || '').toLowerCase();
  const expectsFormRedirect =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  let id = '';
  let pin = '';

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    pin = String(body?.pin || '');
    id = String(body?.id || '');
  } else {
    const form = await req.formData().catch(() => null);
    pin = String(form?.get('pin') || '');
    id = String(form?.get('id') || '');
  }

  const limit = checkAdminLoginRateLimit(req.headers, id);
  const response = limit.blocked
    ? NextResponse.json(
        { error: 'Too many login attempts' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    : createAdminSessionResponse({ id, pin });

  if (!limit.blocked && response.status === 401) {
    recordAdminLoginFailure(req.headers, id);
  } else if (response.ok) {
    clearAdminLoginFailures(req.headers, id);
  }

  if (!expectsFormRedirect) {
    return response;
  }

  const redirectUrl = buildExternalRedirectUrl(req, response.ok ? '/admin' : '/admin/login');
  if (!response.ok) {
    const errorCode = response.status === 401
      ? 'invalid'
      : response.status === 429
        ? 'rate_limited'
        : 'server';
    redirectUrl.searchParams.set('error', errorCode);
  }

  const redirectResponse = NextResponse.redirect(redirectUrl, { status: 303 });
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) redirectResponse.headers.set('Retry-After', retryAfter);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
