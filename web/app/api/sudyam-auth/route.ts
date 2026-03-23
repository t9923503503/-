import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const FALLBACK_SUDYAM_PIN = '7319';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type AttemptBucket = {
  attempts: number;
  resetAt: number;
};

const attemptsByIp = new Map<string, AttemptBucket>();

function getExpectedPin(): string {
  const configuredPin = String(process.env.SUDYAM_PIN || '').trim();
  if (configuredPin) return configuredPin;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SUDYAM_PIN env var is required in production');
  }
  return FALLBACK_SUDYAM_PIN;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

function getRateLimitState(ip: string): AttemptBucket {
  const now = Date.now();
  const current = attemptsByIp.get(ip);
  if (current && current.resetAt > now) {
    return current;
  }
  const fresh = { attempts: 0, resetAt: now + WINDOW_MS };
  attemptsByIp.set(ip, fresh);
  return fresh;
}

export async function POST(req: NextRequest) {
  let expectedPin: string;
  try {
    expectedPin = getExpectedPin();
  } catch (err) {
    console.error('[API] sudyam-auth config error:', err);
    return NextResponse.json({ error: 'Auth service misconfigured' }, { status: 503 });
  }

  const ip = getClientIp(req);
  const state = getRateLimitState(ip);
  if (state.attempts >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    );
  }

  const { pin } = await req.json();

  if (!pin || pin !== expectedPin) {
    state.attempts += 1;
    return NextResponse.json({ error: 'Неверный PIN' }, { status: 401 });
  }

  attemptsByIp.delete(ip);

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
