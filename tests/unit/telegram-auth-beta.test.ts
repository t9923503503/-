import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isLegacyTelegramLinkAvailable,
  isTelegramWebAuthAvailable,
  isTelegramWebAuthUserAllowed,
} from '../../web/lib/telegram-web-auth';

describe('Telegram web auth public access', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('remains available in production without an allowlist', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TELEGRAM_AUTH_BETA_USER_IDS', '');

    expect(isTelegramWebAuthAvailable()).toBe(true);
    expect(isTelegramWebAuthUserAllowed('353922461')).toBe(true);
    expect(isLegacyTelegramLinkAvailable()).toBe(false);
  });

  it('accepts any exact positive Telegram ID', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TELEGRAM_AUTH_BETA_USER_IDS', '353922461, 123456; bad 0 -7');

    expect(isTelegramWebAuthAvailable()).toBe(true);
    expect(isTelegramWebAuthUserAllowed('353922461')).toBe(true);
    expect(isTelegramWebAuthUserAllowed('123456')).toBe(true);
    expect(isTelegramWebAuthUserAllowed('353922462')).toBe(true);
    expect(isTelegramWebAuthUserAllowed('0')).toBe(false);
  });

  it('keeps local development usable when no beta list is configured', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TELEGRAM_AUTH_BETA_USER_IDS', '');

    expect(isTelegramWebAuthAvailable()).toBe(true);
    expect(isTelegramWebAuthUserAllowed('987654321')).toBe(true);
    expect(isLegacyTelegramLinkAvailable()).toBe(true);
  });
});
