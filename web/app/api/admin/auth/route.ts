import { NextRequest, NextResponse } from 'next/server';
import { createAdminSessionResponse, getAdminSessionFromRequest } from '@/lib/admin-auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';

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

  const response = createAdminSessionResponse({ id, pin });
  if (!expectsFormRedirect) {
    return response;
  }

  const redirectUrl = buildExternalRedirectUrl(req, response.ok ? '/admin' : '/admin/login');
  if (!response.ok) {
    redirectUrl.searchParams.set('error', response.status === 401 ? 'invalid' : 'server');
  }

  const redirectResponse = NextResponse.redirect(redirectUrl, { status: 303 });
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
