import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { telegramOutboxButtons } from '../../web/lib/telegram-outbox';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Telegram Play sync', () => {
  it('lets every linked account create rated or friendly drafts from all quick templates', () => {
    const actions = read('web/lib/telegram-actions.ts');
    const createDraft = actions.slice(
      actions.indexOf('export async function createGameDraftFromTelegram'),
      actions.indexOf('export async function confirmGameAttendanceFromTelegram')
    );

    expect(actions).toContain("export type TelegramGameTemplate = '2x2' | 'thai' | 'king'");
    expect(actions).toContain("export type TelegramRatingMode = 'rated' | 'friendly'");
    expect(actions).toContain("resultFormat: 'king_sideout'");
    expect(actions).toContain('ratingMode: TelegramRatingMode = \'rated\'');
    expect(actions).toContain("callbackData: `create:king:${ratingMode}`");
    expect(createDraft).not.toContain('if (!user.player_id)');
    expect(createDraft).not.toContain('SELECT id, email, player_id');
    expect(createDraft).toContain('ratingMode,');
    expect(createDraft).toContain('resultEntryMode:');
  });

  it('shows split court cost instead of marking a paid split game as free', () => {
    const channel = read('web/lib/telegram-channel.ts');
    expect(channel).toContain('pp.court_cost_rub');
    expect(channel).toContain("row.rating_mode === 'friendly' ? '🎈 Обычная игра' : '🏆 Игра на рейтинг'");
    expect(channel).toContain('Math.round(courtCost / Number(row.capacity))');
    expect(channel).toContain('`${courtCost} ₽ за корт · ≈${splitPerPlayer} ₽/чел.`');
  });

  it('keeps registration, attendance, invite and score actions interactive', () => {
    const registration = read('web/lib/telegram-registration.ts');
    const bot = read('telegram-bot/bot.mjs');
    const agent = read('web/app/api/telegram/agent/route.ts');
    const webhook = read('web/app/api/telegram/webhook/route.ts');

    expect(registration).toContain("callbackData: `attendance:y:${postId}`");
    expect(registration).toContain("callbackData: `invite:a:${postId}`");
    expect(registration).toContain('url: authenticatedSiteUrl(`/partner/${postId}#result-entry`)');
    expect(registration).toContain('po.owner_user_id = $1 OR ppp.status');
    expect(bot).toContain("callbackData.match(/^attendance:([yn]):");
    expect(bot).toContain("callbackData.match(/^invite:([ad]):");
    expect(bot).toContain("agent('respondGameInvite'");
    expect(bot).toContain('sendOutboxItem(item, attemptId)');
    expect(bot).toContain("agent('outboxBegin'");
    expect(agent).toContain("case 'confirmAttendance':");
    expect(agent).toContain("case 'respondGameInvite':");
    expect(agent).toContain('buttons: telegramOutboxButtons(row.kind, row.message_text)');
    expect(webhook).toContain('confirmGameAttendanceFromTelegram');
    expect(webhook).toContain('respondGameInviteFromTelegram');
    expect(webhook).toContain("command === '/create_game'");
  });

  it('builds the right private-message actions from outbox kind', () => {
    const postId = '11111111-1111-4111-8111-111111111111';
    const text = `Игра: https://lpvolley.ru/partner/${postId}`;

    expect(telegramOutboxButtons('reminder_3h', text)).toEqual([
      [
        { text: '✅ Иду', callbackData: `attendance:y:${postId}` },
        { text: '❌ Не смогу', callbackData: `attendance:n:${postId}` },
      ],
      [{ text: 'Открыть игру', url: `https://lpvolley.ru/partner/${postId}` }],
    ]);
    expect(telegramOutboxButtons('result_reminder', text)).toEqual([
      [{ text: '✍️ Внести счёт', url: `https://lpvolley.ru/login?returnTo=${encodeURIComponent(`/partner/${postId}#result-entry`)}` }],
    ]);
    expect(telegramOutboxButtons('result_awaiting_approval', text)).toEqual([
      [{ text: '✅ Проверить и утвердить', url: `https://lpvolley.ru/login?returnTo=${encodeURIComponent(`/partner/${postId}#result`)}` }],
    ]);
  });

  it('makes the two-hour result reminder reachable and idempotent per organizer chat', () => {
    const cron = read('web/lib/play-cron.ts');
    expect(cron).toContain("WHERE pp.status IN ('published', 'completed')");
    expect(cron).toContain("pp.ends_at BETWEEN now() - interval '3 hours' AND now() - interval '2 hours'");
    expect(cron).toContain('`result_reminder:${String(row.id)}:${String(row.telegram_chat_id)}`');
  });
});
