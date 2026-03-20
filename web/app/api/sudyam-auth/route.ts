import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { pin } = await req.json();

  if (!pin || pin !== process.env.SUDYAM_PIN) {
    return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, pin, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 дней
    path: '/',
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
