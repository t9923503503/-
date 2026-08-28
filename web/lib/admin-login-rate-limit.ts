import { createHash } from 'node:crypto';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 10_000;

type HeaderReader = Pick<Headers, 'get'>;

interface AttemptBucket {
  failures: number;
  windowEndsAt: number;
  lockedUntil: number;
}

export interface AdminLoginRateLimitState {
  blocked: boolean;
  retryAfterSeconds: number;
}

const attempts = new Map<string, AttemptBucket>();

function clientIp(headers: HeaderReader): string {
  const realIp = String(headers.get('x-real-ip') || '').trim();
  if (realIp) return realIp;

  const forwardedFor = String(headers.get('x-forwarded-for') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  // nginx appends the socket peer to X-Forwarded-For, so the last value is
  // the one we can trust in the current single-proxy production topology.
  return forwardedFor.at(-1) || 'unknown';
}

function attemptKey(headers: HeaderReader, actorId: string): string {
  const normalizedActorId = String(actorId || '').trim().toLowerCase() || 'pin-only';
  return createHash('sha256')
    .update(`${clientIp(headers)}\n${normalizedActorId}`)
    .digest('base64url');
}

function pruneExpired(now: number): void {
  if (attempts.size < MAX_BUCKETS) return;

  for (const [key, bucket] of attempts) {
    if (bucket.windowEndsAt <= now && bucket.lockedUntil <= now) attempts.delete(key);
  }

  while (attempts.size >= MAX_BUCKETS) {
    const oldestKey = attempts.keys().next().value as string | undefined;
    if (!oldestKey) break;
    attempts.delete(oldestKey);
  }
}

export function checkAdminLoginRateLimit(
  headers: HeaderReader,
  actorId: string,
  now = Date.now()
): AdminLoginRateLimitState {
  const key = attemptKey(headers, actorId);
  const bucket = attempts.get(key);
  if (!bucket) return { blocked: false, retryAfterSeconds: 0 };

  if (bucket.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    };
  }

  if (bucket.windowEndsAt <= now) attempts.delete(key);
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordAdminLoginFailure(
  headers: HeaderReader,
  actorId: string,
  now = Date.now()
): void {
  pruneExpired(now);
  const key = attemptKey(headers, actorId);
  const current = attempts.get(key);
  const bucket = !current || current.windowEndsAt <= now
    ? { failures: 0, windowEndsAt: now + WINDOW_MS, lockedUntil: 0 }
    : current;

  bucket.failures += 1;
  if (bucket.failures >= MAX_FAILURES) bucket.lockedUntil = now + WINDOW_MS;
  attempts.set(key, bucket);
}

export function clearAdminLoginFailures(headers: HeaderReader, actorId: string): void {
  attempts.delete(attemptKey(headers, actorId));
}

export function resetAdminLoginRateLimitForTests(): void {
  attempts.clear();
}
