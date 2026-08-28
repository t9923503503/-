import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const partnerPage = read('web/app/partner/page.tsx');
const callout = read('web/components/partner/PartnerTelegramCallout.tsx');
const guide = read('web/components/play/PlayHowItWorks.tsx');
const goals = read('web/lib/metrika-goals.ts');
const externalLink = read('web/components/analytics/MetrikaExternalLink.tsx');
const channel = read('web/lib/telegram-channel.ts');
const agentRoute = read('web/app/api/telegram/agent/route.ts');
const bot = read('telegram-bot/bot.mjs');

describe('/partner Telegram experience source contract', () => {
  it('places the smart Telegram callout immediately below the hero on every tab', () => {
    expect(partnerPage).toContain('<PartnerTelegramCallout authenticated={Boolean(me)} />');
    expect(partnerPage.indexOf('<PartnerTelegramCallout')).toBeGreaterThan(partnerPage.indexOf('</header>'));
    expect(partnerPage.indexOf('<PartnerTelegramCallout')).toBeLessThan(partnerPage.indexOf('<details id="how-it-works"'));
    expect(callout).toContain('Игра рядом — бот напомнит');
    expect(callout).toContain('Ближайшие игры');
    expect(callout).toContain('Запись в состав');
    expect(callout).toContain('Изменения и напоминания');
    expect(callout).toContain("const DEFAULT_BOT = 'Lpvolley_bot'");
    expect(callout).toContain('const botUrl = `https://t.me/${bot}`');
    expect(callout).toContain('https://t.me/+ZkXujfqOmNE5ODMy');
  });

  it('supports guest, unlinked, linked and recoverable error states', () => {
    expect(callout).toContain("type TelegramState = 'guest' | 'loading' | 'unlinked' | 'linked' | 'error'");
    expect(callout).toContain("fetch('/api/auth/telegram-link', { cache: 'no-store' })");
    expect(callout).toContain("fetch('/api/auth/telegram-link', { method: 'POST' })");
    expect(callout).toContain('/login?returnTo=%2Fpartner%23telegram-bot');
    expect(callout).toContain('/profile?tab=settings#telegram');
    expect(callout).toContain('Подключить уведомления');
    expect(callout).toContain('Telegram подключён');
    expect(callout).toContain('Повторить проверку');
    expect(callout).toContain("url.hostname === 't.me'");
  });

  it('keeps the create FAB but removes its duplicate from the hero', () => {
    const hero = partnerPage.slice(partnerPage.indexOf('<header'), partnerPage.indexOf('</header>') + 9);
    expect(partnerPage).toContain('className="partner-create-game-fab"');
    expect(hero).not.toContain('href="/partner/manage"');
    expect(hero).toContain('{heroActionLabel} ↓');
    expect(hero).toContain('Войти / зарегистрироваться');
  });

  it('explains tabs and gives useful empty-state actions', () => {
    expect(partnerPage).toContain('TAB_DESCRIPTION');
    expect(partnerPage).toContain('Сбросить фильтры');
    expect(partnerPage).toContain('partner_empty_state');
    expect(partnerPage).toContain('Открыть бота');
    expect(partnerPage).toContain('id="play-feed"');
    expect(partnerPage).toContain('id="partner-search"');
  });

  it('uses compact mobile steps and only mounts screenshots after disclosure', () => {
    expect(guide).toContain('showMobileScreenshots');
    expect(guide).toContain('aria-expanded={showMobileScreenshots}');
    expect(guide).toContain('Показать примеры экранов');
    expect(guide).toContain('Скрыть примеры экранов');
    expect(guide).toContain("compactMobile ? 'hidden md:grid' : 'grid'");
    expect(guide.indexOf('{showMobileScreenshots ? (')).toBeLessThan(guide.indexOf('id="mobile-guide-screenshots"'));
  });

  it('tracks Telegram actions without sending the one-time deep link to analytics', () => {
    expect(goals).toContain("telegramClick: 'lpv_telegram_click'");
    expect(externalLink).toContain('METRIKA_GOALS.telegramClick');
    expect(callout).toContain("placement: 'partner_callout'");
    expect(callout).toContain('authState');
    expect(callout).toContain("action: 'connect_link_created'");
    expect(callout).not.toContain('outboundUrl: data.url');
  });
});

describe('Telegram deleted-channel-message contract', () => {
  it('detaches only the matching stored message and preserves the announcement row', () => {
    expect(channel).toContain('export async function detachChannelPost');
    expect(channel).toContain('SET message_id = NULL');
    expect(channel).toContain('entity_type = $1 AND entity_id = $2 AND message_id = $3');
    expect(channel).not.toContain('DELETE FROM telegram_channel_posts');
  });

  it('exposes an authenticated, validated channelDetach agent action', () => {
    expect(agentRoute).toContain("case 'channelDetach':");
    expect(agentRoute).toContain('Number.isSafeInteger(messageId)');
    expect(agentRoute).toContain('await detachChannelPost(entityType, entityId, messageId)');
  });

  it('stops retrying only Telegram message-not-found errors', () => {
    expect(bot).toContain("err.code === 400 && String(err.message).includes('message to edit not found')");
    expect(bot).toContain("agent('channelDetach'");
    expect(bot).toContain("log('[relay] channel detached:'");
    expect(bot).toContain("log('[relay] channel update fail:'");
  });
});
