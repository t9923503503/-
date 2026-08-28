import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

describe('VK ID source contract', () => {
  it('binds OAuth state to an HttpOnly browser cookie and consumes the intent once', () => {
    const start = read('web/app/api/auth/vk/start/route.ts');
    const callback = read('web/app/api/auth/vk/callback/route.ts');
    expect(start).toContain("sameSite: 'lax'");
    expect(start).toContain('httpOnly: true');
    expect(start).toContain("codeChallenge: vkCodeChallenge(verifier)");
    expect(callback).toContain('AND used_at IS NULL');
    expect(callback).toContain('browser_secret_hash = $2');
    expect(callback).toContain('token.state !== state');
  });

  it('does not request or persist VK email, phone, or access tokens', () => {
    const helper = read('web/lib/vk-id.ts');
    const callback = read('web/app/api/auth/vk/callback/route.ts');
    expect(helper).not.toMatch(/scope:\s*['"](?:email|phone)/);
    expect(callback).not.toMatch(/INSERT INTO[^;]+access_token/s);
    expect(callback).toContain('profileUserId !== vkUserId');
  });

  it('reports VK ID as the account sign-in method', () => {
    const meRoute = read('web/app/api/auth/me/route.ts');
    const accountCard = read('web/components/profile/MyAccountCard.tsx');
    expect(meRoute).toContain('vk_linked: Boolean(user.vk_user_id)');
    expect(meRoute).toContain("user.vk_user_id ? 'vk' : null");
    expect(accountCard).toContain('method === "vk" ? "VK ID"');
    expect(accountCard).toContain('me.vk_linked ? "Подключён"');
  });

  it('links VK only to a recently authenticated existing account', () => {
    const migration = read('migrations/077_vk_id_account_link.sql');
    const start = read('web/app/api/auth/vk/start/route.ts');
    const callback = read('web/app/api/auth/vk/callback/route.ts');
    const accountCard = read('web/components/profile/MyAccountCard.tsx');

    expect(migration).toContain('link_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
    expect(start).toContain("const linkMode = body.mode === 'link'");
    expect(start).toContain('verifyRecentPlayerAuthToken');
    expect(start).toContain("code: 'recent_auth_required'");
    expect(callback).toContain('Number(existing.rows[0].id) !== linkUserId');
    expect(callback).toContain('throw new VkLinkConflictError');
    expect(callback).toContain('SET vk_user_id = $2');
    expect(accountCard).toContain('"Подключить VK ID"');
    expect(accountCard).toContain('mode: "link"');
  });

  it('explains registration for new and existing players next to the VK action', () => {
    const panel = read('web/components/profile/PlayerAuthPanel.tsx');
    expect(panel).toContain('Как войти правильно');
    expect(panel).toContain('Впервые на сайте?');
    expect(panel).toContain('Уже есть аккаунт?');
    expect(panel).toContain('Профиль → Настройки → Подключить VK ID');
    expect(panel).toContain('Не привязывайте чужую карточку');
    expect(panel).toContain('без удаления рейтинга и истории');
  });
});
