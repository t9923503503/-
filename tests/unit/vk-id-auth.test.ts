import { afterEach, describe, expect, it } from 'vitest';
import {
  buildVkAuthorizeUrl,
  hashVkValue,
  isVkIdAvailable,
  normalizeVkName,
  randomVkSecret,
  vkCodeChallenge,
  VK_CODE_VERIFIER_RE,
  VK_STATE_RE,
} from '../../web/lib/vk-id';

const originalEnabled = process.env.VK_ID_ENABLED;
const originalAppId = process.env.VK_ID_APP_ID;
const originalRedirect = process.env.VK_ID_REDIRECT_URI;

afterEach(() => {
  if (originalEnabled == null) delete process.env.VK_ID_ENABLED;
  else process.env.VK_ID_ENABLED = originalEnabled;
  if (originalAppId == null) delete process.env.VK_ID_APP_ID;
  else process.env.VK_ID_APP_ID = originalAppId;
  if (originalRedirect == null) delete process.env.VK_ID_REDIRECT_URI;
  else process.env.VK_ID_REDIRECT_URI = originalRedirect;
});

describe('VK ID auth helpers', () => {
  it('is fail-closed until explicitly enabled with a numeric app ID', () => {
    delete process.env.VK_ID_ENABLED;
    process.env.VK_ID_APP_ID = '123';
    expect(isVkIdAvailable()).toBe(false);
    process.env.VK_ID_ENABLED = 'true';
    process.env.VK_ID_APP_ID = 'bad';
    expect(isVkIdAvailable()).toBe(false);
    process.env.VK_ID_APP_ID = '123';
    expect(isVkIdAvailable()).toBe(true);
    process.env.VK_ID_REDIRECT_URI = 'https://evil.example/callback';
    expect(isVkIdAvailable()).toBe(false);
  });

  it('creates PKCE-compatible random values and a deterministic S256 challenge', () => {
    const state = randomVkSecret();
    const verifier = randomVkSecret();
    expect(state).toMatch(VK_STATE_RE);
    expect(verifier).toMatch(VK_CODE_VERIFIER_RE);
    expect(vkCodeChallenge(verifier)).toMatch(VK_STATE_RE);
    expect(hashVkValue('same')).toBe(hashVkValue('same'));
  });

  it('builds the official authorization request without email or phone scopes', () => {
    const url = new URL(buildVkAuthorizeUrl({
      appId: '123',
      redirectUri: 'https://lpvolley.ru/api/auth/vk/callback',
      state: 's'.repeat(43),
      codeChallenge: 'c'.repeat(43),
    }));
    expect(url.origin).toBe('https://id.vk.ru');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('normalizes the display name and has a safe fallback', () => {
    expect(normalizeVkName(' Александр\n', ' Лебедев ')).toBe('Александр Лебедев');
    expect(normalizeVkName('', '')).toBe('Игрок VK');
  });
});
