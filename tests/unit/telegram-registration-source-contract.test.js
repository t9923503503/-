import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Telegram-first registration source contract', () => {
  it('keeps onboarding state and player claims in PostgreSQL', () => {
    const migration = read('migrations/074_telegram_registration.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS telegram_onboarding_sessions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS player_claims');
    expect(migration).toContain('player_claims_one_open_per_user');
    expect(migration).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS player_claims_one_approved_player');
    expect(migration).toContain('users_telegram_user_id_unique');
    expect(migration).toContain(') NOT VALID;');
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  });

  it('accepts only the Telegram user own shared contact', () => {
    const source = read('web/lib/telegram-registration.ts');
    expect(source).toContain('contactUserId !== telegramUserId');
    expect(source).toContain('telegramUserId !== privateChatId');
    expect(source).toContain("telegram_onboarding_status = 'approved'");
  });

  it('uses a browser-bound, attempt-limited Telegram confirmation code', () => {
    const migration = read('migrations/075_telegram_web_auth.sql');
    const service = read('web/lib/telegram-registration.ts');
    const route = read('web/app/api/auth/telegram-login/route.ts');
    const helper = read('web/lib/telegram-web-auth.ts');

    expect(migration).toContain('browser_secret_hash TEXT NOT NULL');
    expect(migration).toContain('confirmation_code_hash TEXT');
    expect(migration).toContain('confirmation_attempts INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('DROP COLUMN IF EXISTS confirmation_code');
    expect(service).toContain('crypto.randomInt(0, 1_000_000)');
    expect(service).toContain('pending_telegram_user_id = $2');
    expect(service).not.toContain('confirmed_telegram_user_id = $2');
    expect(helper).toContain(".update(`telegram-login-code\\n${intentToken}\\n${code}`)");
    expect(route).toContain('export async function PATCH');
    expect(route).toContain('confirmation_attempts');
    expect(route).toContain('attempts >= 5');
    expect(route).toContain('crypto.timingSafeEqual');
    expect(route).toContain('confirmed_telegram_user_id = pending_telegram_user_id');
  });

  it('keeps browser intents and return paths server-side', () => {
    const migration = read('migrations/075_telegram_web_auth.sql');
    const startRoute = read('web/app/api/auth/telegram-start/route.ts');
    const service = read('web/lib/telegram-registration.ts');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS telegram_web_auth_intents');
    expect(migration).toContain("return_to TEXT NOT NULL DEFAULT '/profile'");
    expect(startRoute).toContain('normalizeAuthReturnTo(req.nextUrl.searchParams.get(\'returnTo\'))');
    expect(startRoute).toContain('INSERT INTO telegram_web_auth_intents (');
    expect(startRoute).toContain('token, return_to, request_fingerprint, browser_secret_hash, expires_at');
    expect(startRoute).toContain('hashTelegramBrowserSecret(browserSecret)');
    expect(startRoute).toContain('httpOnly: true');
    expect(startRoute).toContain("deepLink.searchParams.set('start', `login_${token}`)");
    expect(service).toContain('UPDATE telegram_web_auth_intents');
    expect(service).toContain('used_at IS NULL AND expires_at > now()');
    expect(service).not.toContain('INSERT INTO telegram_web_login_tokens (token, user_id, return_to, expires_at)');
    expect(startRoute).not.toContain('confirmationCode');
  });

  it('uses a configured or canonical origin without trusting forwarded host headers', () => {
    const returnTo = read('web/lib/auth-return-to.ts');
    const service = read('web/lib/telegram-registration.ts');
    const route = read('web/app/api/auth/telegram-login/route.ts');
    const startRoute = read('web/app/api/auth/telegram-start/route.ts');

    expect(returnTo).toContain('process.env.SITE_BASE_URL');
    expect(returnTo).toContain("process.env.NODE_ENV !== 'production'");
    expect(service).toContain("process.env.SITE_BASE_URL || 'https://lpvolley.ru'");
    expect(route).toContain('getAuthPublicOrigin(req.nextUrl.origin)');
    expect(startRoute).toContain('getAuthPublicOrigin(req.nextUrl.origin)');
    expect(startRoute).not.toContain("new URL('/login', req.url)");
    expect(route).not.toContain('x-forwarded-host');
    expect(route).not.toContain('x-forwarded-proto');
  });

  it('uses Telegram user id as the only authentication subject', () => {
    const migration = read('migrations/075_telegram_web_auth.sql');
    const registration = read('web/lib/telegram-registration.ts');
    const actions = read('web/lib/telegram-actions.ts');
    const commands = read('web/lib/telegram-commands.ts');

    expect(migration).toContain('users_telegram_private_identity_check');
    expect(migration).toContain('telegram_user_id IS NOT NULL\n    AND telegram_user_id ~');
    expect(migration).toContain('telegram_chat_id IS NOT DISTINCT FROM telegram_user_id');
    for (const source of [registration, actions, commands]) {
      expect(source).not.toContain('telegram_user_id = $1 OR telegram_chat_id = $1');
    }
    expect(commands).toContain('currentTelegramUserId !== telegramUserId');
    expect(commands).toContain('UPDATE telegram_web_login_tokens');
  });

  it('keeps the web profile link and bot player card on users.player_id', () => {
    const profileLink = read('web/lib/profile-link.ts');
    const photoRoute = read('web/app/api/auth/photo/route.ts');
    const registration = read('web/lib/telegram-registration.ts');

    expect(profileLink).toContain('JOIN players p ON p.id = u.player_id');
    expect(profileLink).toContain('SET player_id = $2,');
    expect(profileLink).toContain('WHERE id = $1`');
    expect(profileLink).toContain('SET player_id = NULL,');
    expect(profileLink).toContain("WHEN telegram_user_id IS NOT NULL THEN 'legacy'");
    expect(profileLink).toContain('return explicit?.id || null');
    expect(profileLink).not.toContain('WHERE lower(trim(name)) = lower(trim($1))\n        LIMIT 2');
    expect(photoRoute).toContain('SELECT player_id::text AS player_id');
    expect(photoRoute).not.toContain('FROM player_requests');
    expect(photoRoute).not.toContain('if (!allowedPlayerIds.size');
    expect(registration).toContain("UPDATE users SET player_id = $2, telegram_onboarding_status = 'approved'");
  });

  it('requires explicit local admin authorization for moderation callbacks', () => {
    const bot = read('telegram-bot/bot.mjs');
    const agentRoute = read('web/app/api/telegram/agent/route.ts');
    expect(bot).toContain('process.env.TELEGRAM_ADMIN_USER_IDS');
    expect(bot).toContain('ADMIN_USER_IDS.has(telegramUserId)');
    expect(bot).not.toContain('getChatAdministrators');
    expect(bot).not.toContain('TELEGRAM_ADMIN_SOURCE_CHAT_ID');
    expect(bot).toContain("agent('adminClaimReview'");
    expect(bot).toContain('let deliveredToAny = false');
    expect(bot).toContain('if (deliveredToAny) deliveredIds.push');
    expect(agentRoute).toContain('process.env.TELEGRAM_ADMIN_USER_IDS');
    expect(agentRoute).toContain('TELEGRAM_ADMIN_USER_IDS.has(adminTelegramUserId)');
    expect(agentRoute).toContain("{ error: 'Forbidden' }, { status: 403 }");
  });

  it('supports rejecting the OTP request in both relay and webhook modes', () => {
    const bot = read('telegram-bot/bot.mjs');
    const service = read('web/lib/telegram-registration.ts');
    const webhook = read('web/app/api/telegram/webhook/route.ts');

    expect(service).toContain("callbackData: `wl:r:${intentToken}`");
    expect(bot).toContain("callbackData.match(/^wl:(r):");
    expect(bot).not.toContain("callbackData.match(/^wl:(a):");
    expect(webhook).toContain("match(/^wl:r:");
    expect(webhook).toContain("'reject'");
    expect(webhook).toContain('answerTelegramCallback');
  });

  it('reconciles only existing unambiguous player cards and supports migration reruns', () => {
    const registrationMigration = read('migrations/074_telegram_registration.sql');
    const migration = read('migrations/075_telegram_web_auth.sql');

    expect(registrationMigration).not.toContain('player_claims_one_approved_player');
    expect(migration).toContain('DROP INDEX IF EXISTS player_claims_one_approved_player');
    expect(migration).toContain('JOIN players p ON p.id::text = lower(trim(pr.approved_player_id::text))');
    expect(migration).toContain('HAVING COUNT(DISTINCT p.id) = 1');
    expect(migration).toContain('SET telegram_chat_id = NULL');
    expect(migration).toContain('UPDATE telegram_outbox o');
    expect(migration).toContain('telegram_user_id IS NULL\n    AND telegram_chat_id IS NULL\n    AND telegram_private_chat_id IS NULL');
    expect(migration.indexOf('DROP CONSTRAINT IF EXISTS users_telegram_private_identity_check'))
      .toBeLessThan(migration.indexOf('SET telegram_chat_id = NULL'));
  });

  it('serializes account creation and revalidates moderated player claims', () => {
    const registration = read('web/lib/telegram-registration.ts');

    expect(registration).toContain('SELECT pg_advisory_xact_lock(hashtext($1))');
    expect(registration).toContain("ON CONFLICT (telegram_user_id) WHERE telegram_user_id ~ '^[1-9][0-9]*$'");
    expect(registration).toContain("WHERE id = $1 AND status = 'active' AND gender = $2");
    expect(registration).toContain("if (/^[1-9]\\d*$/.test(notificationChatId))");
  });

  it('preserves canonical account ownership when temporary players are merged', () => {
    const postgresAdmin = read('web/lib/admin-queries-pg.ts');
    const postgrestAdmin = read('web/lib/admin-postgrest.ts');

    expect(postgresAdmin).toContain('WHERE player_id IN ($1, $2)');
    expect(postgresAdmin).toContain('UPDATE users SET player_id = $2 WHERE id = $1');
    expect(postgresAdmin).toContain('UPDATE player_claims');
    expect(postgrestAdmin).toContain('Player merge is disabled in PostgREST mode');
  });
});
