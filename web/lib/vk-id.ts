import crypto from 'crypto';
import { getAuthPublicOrigin } from './auth-return-to';

export const VK_INTENT_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-lpvolley_vk_intent'
  : 'vk_login_intent';

export const VK_STATE_RE = /^[A-Za-z0-9_-]{43}$/;
export const VK_CODE_VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;
export const VK_DEVICE_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;
export const VK_USER_ID_RE = /^[1-9]\d*$/;

function resolveRedirectUri(requestOrigin?: string): string {
  const publicOrigin = getAuthPublicOrigin(requestOrigin);
  const expected = `${publicOrigin}/api/auth/vk/callback`;
  const configured = String(process.env.VK_ID_REDIRECT_URI || expected).trim();
  const redirectUri = new URL(configured);
  if (
    redirectUri.origin !== publicOrigin
    || redirectUri.pathname !== '/api/auth/vk/callback'
    || redirectUri.search
    || redirectUri.hash
    || (process.env.NODE_ENV === 'production' && redirectUri.protocol !== 'https:')
  ) throw new Error('VK_ID_REDIRECT_URI must be the canonical VK callback URL');
  return redirectUri.toString();
}

export function isVkIdAvailable(requestOrigin?: string): boolean {
  if (
    process.env.VK_ID_ENABLED !== 'true'
    || !/^[1-9]\d*$/.test(String(process.env.VK_ID_APP_ID || '').trim())
  ) return false;
  try {
    resolveRedirectUri(requestOrigin);
    return true;
  } catch {
    return false;
  }
}

export function getVkIdConfig(requestOrigin?: string): {
  appId: string;
  redirectUri: string;
} {
  if (!isVkIdAvailable(requestOrigin)) throw new Error('VK ID is not configured');
  const appId = String(process.env.VK_ID_APP_ID).trim();
  return { appId, redirectUri: resolveRedirectUri(requestOrigin) };
}

export function randomVkSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashVkValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function vkCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildVkAuthorizeUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://id.vk.ru/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.appId,
    app_id: input.appId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    state: input.state,
    sdk_type: 'vkid',
    v: '2.6.1',
  }).toString();
  return url.toString();
}

export function normalizeVkName(firstName: unknown, lastName: unknown): string {
  const clean = (value: unknown) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [clean(firstName), clean(lastName)].filter(Boolean).join(' ').slice(0, 255)
    || 'Игрок VK';
}
