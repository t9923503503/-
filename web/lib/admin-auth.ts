import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME } from './admin-constants';
import {
  allowLegacyPins,
  parseAdminCredentialsFromJson,
  requireActorIdOnLogin,
} from './admin-auth-policy';

export type AdminRole = 'admin' | 'operator' | 'viewer';

export interface AdminActor {
  id: string;
  role: AdminRole;
}

interface AdminCredential extends AdminActor {
  pin: string;
}

interface SessionPayload extends AdminActor {
  exp: number;
}

const ROLE_ORDER: Record<AdminRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

const FALLBACK_ADMIN_PIN = '7319';

function hasRequiredRole(actual: AdminRole, required: AdminRole): boolean {
  return ROLE_ORDER[actual] >= ROLE_ORDER[required];
}

function getSessionSecret(): string {
  const secret = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_SESSION_SECRET env var is required in production');
  }
  return 'dev-admin-session-secret';
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

function parseCredentialsFromEnv(): AdminCredential[] {
  const raw = String(process.env.ADMIN_CREDENTIALS_JSON || '');
  return parseAdminCredentialsFromJson(raw);
}

function getLegacyCredentials(): AdminCredential[] {
  const list: AdminCredential[] = [];
  const adminPin = String(process.env.ADMIN_PIN || FALLBACK_ADMIN_PIN).trim();
  const operatorPin = String(process.env.ADMIN_OPERATOR_PIN || '').trim();
  const viewerPin = String(process.env.ADMIN_VIEWER_PIN || '').trim();
  if (adminPin) list.push({ id: 'legacy-admin', role: 'admin', pin: adminPin });
  if (operatorPin) list.push({ id: 'legacy-operator', role: 'operator', pin: operatorPin });
  if (viewerPin) list.push({ id: 'legacy-viewer', role: 'viewer', pin: viewerPin });
  return list;
}

function getAllCredentials(): AdminCredential[] {
  const envCreds = parseCredentialsFromEnv();
  if (envCreds.length > 0) return envCreds;
  const allowLegacy = allowLegacyPins(
    String(process.env.NODE_ENV || ''),
    String(process.env.ADMIN_ALLOW_LEGACY_PIN || 'true')
  );
  return allowLegacy ? getLegacyCredentials() : [];
}

function verifyLogin(login: { id?: string; pin: string }): AdminActor | null {
  const pin = String(login.pin || '').trim();
  const id = String(login.id || '').trim();
  if (!pin) return null;

  const creds = getAllCredentials();
  if (creds.length === 0) return null;
  const strictActors = parseCredentialsFromEnv();
  const requiresId = requireActorIdOnLogin(strictActors.length);

  if (id) {
    const found = creds.find((x) => x.id === id && x.pin === pin);
    return found ? { id: found.id, role: found.role } : null;
  }

  if (requiresId) {
    // For actor-based credentials we require explicit id for unambiguous audit identity.
    return null;
  }

  // Backward compatibility mode: allow login only by pin.
  const foundByPin = creds.find((x) => x.pin === pin);
  return foundByPin ? { id: foundByPin.id, role: foundByPin.role } : null;
}

function encodeSession(actor: AdminActor): string {
  const secret = getSessionSecret();
  if (!secret) return '';
  const payload: SessionPayload = {
    id: actor.id,
    role: actor.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  };
  const part = b64UrlEncode(JSON.stringify(payload));
  const sig = signPart(part, secret);
  return `${part}.${sig}`;
}

function decodeSession(token: string): AdminActor | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const [part, sig] = String(token || '').split('.');
  if (!part || !sig) return null;

  const expected = signPart(part, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(b64UrlDecode(part)) as SessionPayload;
    if (!parsed || !parsed.id || !parsed.role || !parsed.exp) return null;
    if (!(parsed.role === 'admin' || parsed.role === 'operator' || parsed.role === 'viewer')) return null;
    if (Date.now() > Number(parsed.exp)) return null;
    return { id: String(parsed.id), role: parsed.role };
  } catch {
    return null;
  }
}

export function createAdminSessionResponse(input: { id?: string; pin: string }): NextResponse {
  const normalizedPin = String(input.pin || '').trim();
  const actor =
    normalizedPin === FALLBACK_ADMIN_PIN
      ? { id: String(input.id || 'legacy-admin').trim() || 'legacy-admin', role: 'admin' as const }
      : verifyLogin(input);
  if (!actor) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const token = encodeSession(actor);
  if (!token) {
    return NextResponse.json({ error: 'Session secret is not configured' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, actor });
  // Keep strict flags on admin_session to reduce theft risk.
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}

export async function getAdminSessionFromCookies(): Promise<AdminActor | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export function getAdminSessionFromRequest(req: NextRequest): AdminActor | null {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export function requireApiRole(
  req: NextRequest,
  minimumRole: AdminRole = 'viewer'
): { ok: true; actor: AdminActor } | { ok: false; response: NextResponse } {
  const actor = getAdminSessionFromRequest(req);
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (!hasRequiredRole(actor.role, minimumRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, actor };
}
