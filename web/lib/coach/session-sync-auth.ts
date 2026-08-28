import { timingSafeEqual } from 'node:crypto';
import { readServerEnv } from '@/lib/server-env';

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireKotyaraSync(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = String(readServerEnv('LP_COACH_SYNC_SECRET') || '').trim();
  const authorization = String(req.headers.get('authorization') || '');
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!expected || expected.length < 32 || !supplied || !safeEqual(supplied, expected)) {
    return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true };
}
