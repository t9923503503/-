import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('player auth Telegram source contract', () => {
  it('exposes Telegram login publicly and keeps the email fallback', () => {
    const panel = read('web/components/profile/PlayerAuthPanel.tsx');
    const loginPage = read('web/app/login/page.tsx');
    expect(panel).toContain('/api/auth/telegram-start?returnTo=');
    expect(panel).toContain('telegramAuthEnabled ? (');
    expect(panel).toContain('href="/privacy"');
    expect(loginPage).toContain('const telegramAuthEnabled = isTelegramWebAuthAvailable();');
    expect(loginPage).toContain('telegramAuthEnabled={telegramAuthEnabled}');
    expect(panel.indexOf('Продолжить в Telegram')).toBeGreaterThan(-1);
    expect(panel.indexOf('<details')).toBeGreaterThan(-1);
  });

  it('maps only known Telegram errors to fixed user-facing messages', () => {
    const loginPage = read('web/app/login/page.tsx');
    for (const code of ['telegram_link', 'telegram_link_expired', 'telegram_account', 'telegram_login', 'telegram_unavailable', 'telegram_rate_limited', 'telegram_account_switch', 'telegram_beta_closed']) {
      expect(loginPage).toContain(`${code}:`);
    }
    expect(loginPage).toContain('params.error ? TELEGRAM_ERRORS[params.error] : undefined');
    expect(loginPage).not.toContain('text: params.error');
  });

  it('keeps Telegram credentials browser-bound and consent-protected', () => {
    const panel = read('web/components/profile/PlayerAuthPanel.tsx');
    const start = read('web/app/api/auth/telegram-start/route.ts');
    const callback = read('web/app/api/auth/telegram-login/route.ts');
    const helper = read('web/lib/telegram-web-auth.ts');
    expect(panel).toContain('target="_blank"');
    expect(panel).toContain('method: "PATCH"');
    expect(panel).toContain('privacyConsent: telegramConsent');
    expect(start).toContain('hashTelegramBrowserSecret(browserSecret)');
    expect(start).toContain('isTelegramWebAuthAvailable()');
    expect(start).toContain('httpOnly: true');
    expect(helper).toContain("'__Host-lpvolley_tg_intent'");
    expect(helper).toContain('return true;');
    expect(callback).toContain("body.action !== 'continue' && body.action !== 'link_current'");
    expect(callback).toContain('body.privacyConsent !== true');
    expect(callback).toContain('privacy_consent_version = $2');
    expect(callback).not.toContain("searchParams.get('token')");
  });

  it('keeps public Telegram registration and account-link flows wired', () => {
    const registration = read('web/lib/telegram-registration.ts');
    const commands = read('web/lib/telegram-commands.ts');
    const legacyLink = read('web/app/api/auth/telegram-link/route.ts');
    const profileLink = read('web/components/profile/TelegramLinkForm.tsx');
    const partnerCallout = read('web/components/partner/PartnerTelegramCallout.tsx');
    expect(registration).toContain('return true;');
    expect(registration).toContain('telegramPlayerOnboardingAvailable()');
    expect(commands).toContain('if (!isTelegramWebAuthUserAllowed(telegramUserId))');
    expect(legacyLink).toContain('if (!isLegacyTelegramLinkAvailable())');
    expect(profileLink).toContain('linkingAvailable ? (');
    expect(partnerCallout).toContain("state === 'unlinked' && linkingAvailable");
  });
});
