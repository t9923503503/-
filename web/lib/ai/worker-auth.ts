import { createHash, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export function hashLeaseToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireWorker(req: NextRequest): Response | null {
  const expected = String(process.env.AI_WORKER_TOKEN || '').trim();
  if (!expected) return Response.json({ error: 'AI worker token is not configured' }, { status: 503 });
  const supplied = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!supplied || !safeEqual(supplied, expected)) {
    return Response.json({ error: 'Unauthorized worker' }, { status: 401 });
  }
  return null;
}
