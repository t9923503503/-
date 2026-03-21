import { NextRequest, NextResponse } from 'next/server';
import { createAdminSessionResponse, getAdminSessionFromRequest } from '@/lib/admin-auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = getAdminSessionFromRequest(req);
  if (!actor) return NextResponse.json({ authenticated: false, actor: null });
  return NextResponse.json({ authenticated: true, actor });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pin = String(body?.pin || '');
  const id = String(body?.id || '');
  return createAdminSessionResponse({ id, pin });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
