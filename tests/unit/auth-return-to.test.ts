import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthPublicOrigin, normalizeAuthReturnTo } from '../../web/lib/auth-return-to';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeAuthReturnTo', () => {
  it.each([
    ['/cabinet', '/cabinet'],
    ['/calendar?city=Сургут#top', '/calendar?city=%D0%A1%D1%83%D1%80%D0%B3%D1%83%D1%82#top'],
    ['/profile/settings', '/profile/settings'],
  ])('keeps a same-origin path: %s', (value, expected) => {
    expect(normalizeAuthReturnTo(value)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/..//evil.example/steal',
    '/%2e%2e//evil.example/steal',
    '/profile\nSet-Cookie:x',
    `/${'a'.repeat(600)}`,
  ])('rejects an unsafe return target: %s', (value) => {
    expect(normalizeAuthReturnTo(value)).toBe('/profile');
  });

  it('supports a caller-specific safe fallback', () => {
    expect(normalizeAuthReturnTo('bad', '/cabinet')).toBe('/cabinet');
  });

  it('is idempotent for every accepted path', () => {
    const values = ['/profile', '/calendar?city=Сургут#top', '/a/../cabinet'];
    for (const value of values) {
      const once = normalizeAuthReturnTo(value);
      expect(normalizeAuthReturnTo(once)).toBe(once);
    }
  });
});

describe('getAuthPublicOrigin', () => {
  it('uses the trusted configured origin', () => {
    vi.stubEnv('SITE_BASE_URL', 'https://staging.lpvolley.ru/some/path');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAuthPublicOrigin('https://evil.example')).toBe('https://staging.lpvolley.ru');
  });

  it('ignores the incoming host in production', () => {
    vi.stubEnv('SITE_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAuthPublicOrigin('http://localhost:3000')).toBe('https://lpvolley.ru');
    expect(getAuthPublicOrigin('https://evil.example')).toBe('https://lpvolley.ru');
  });

  it('allows localhost only during local development', () => {
    vi.stubEnv('SITE_BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getAuthPublicOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });
});
