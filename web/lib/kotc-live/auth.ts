import { NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { getExpectedJudgePin } from '@/lib/judge-pin';
import { verifySeatToken } from './token';
import { SeatTokenPayload } from './types';

export function isSudyamApproved(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    return token === getExpectedJudgePin();
  } catch {
    return false;
  }
}

export function readSeatTokenFromRequest(req: NextRequest): string | null {
  const authHeader = String(req.headers.get('authorization') || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() || null;
  }
  const headerToken = String(req.headers.get('x-seat-token') || '').trim();
  if (headerToken) return headerToken;
  return null;
}

export function parseSeatTokenFromRequest(req: NextRequest): SeatTokenPayload | null {
  const raw = readSeatTokenFromRequest(req);
  if (!raw) return null;
  return verifySeatToken(raw);
}

export function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    return first || null;
  }
  const real = req.headers.get('x-real-ip');
  return real ? real.trim() : null;
}
