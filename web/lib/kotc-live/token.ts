import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { SeatRole, SeatTokenPayload } from './types';

const DEFAULT_TTL_SECONDS = 60 * 60;

function getSeatTokenSecret(): string {
  const secret = String(process.env.KOTC_SEAT_TOKEN_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('KOTC_SEAT_TOKEN_SECRET env var is required in production');
  }
  return 'dev-kotc-seat-token-secret';
}

function b64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function b64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signPart(part: string, secret: string): string {
  return createHmac('sha256', secret).update(part).digest('base64url');
}

export function createSeatNonce(): string {
  return randomBytes(32).toString('hex');
}

export function issueSeatToken(input: {
  sessionId: string;
  seatId: number;
  role: SeatRole;
  courtIdx: number | null;
  deviceId: string;
  seatNonce: string;
  ttlSeconds?: number;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = Math.max(30, Number(input.ttlSeconds ?? DEFAULT_TTL_SECONDS));
  const payload: SeatTokenPayload = {
    session_id: input.sessionId,
    seat_id: input.seatId,
    role: input.role,
    court_idx: input.courtIdx,
    device_id: input.deviceId,
    iat: nowSec,
    exp: nowSec + ttlSec,
    seat_nonce: input.seatNonce,
  };
  const body = b64UrlEncode(JSON.stringify(payload));
  const sig = signPart(body, getSeatTokenSecret());
  return `${body}.${sig}`;
}

export function verifySeatToken(token: string): SeatTokenPayload | null {
  const secret = getSeatTokenSecret();
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = signPart(body, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(b64UrlDecode(body)) as SeatTokenPayload;
    if (!parsed || !parsed.session_id || !parsed.seat_id || !parsed.role || !parsed.device_id) return null;
    if (!(parsed.role === 'hub' || parsed.role === 'judge')) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    const courtIdx = parsed.court_idx == null ? null : Number(parsed.court_idx);
    if (courtIdx != null && (!Number.isInteger(courtIdx) || courtIdx < 1 || courtIdx > 4)) return null;
    return {
      session_id: String(parsed.session_id),
      seat_id: Number(parsed.seat_id),
      role: parsed.role,
      court_idx: courtIdx,
      device_id: String(parsed.device_id),
      iat: Number(parsed.iat),
      exp: Number(parsed.exp),
      seat_nonce: String(parsed.seat_nonce || ''),
    };
  } catch {
    return null;
  }
}
