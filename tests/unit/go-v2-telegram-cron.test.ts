import { afterEach, describe, expect, it } from 'vitest';

import { runTelegramFlush } from '../../web/lib/play-cron';
import { telegramOutboxButtons } from '../../web/lib/telegram-outbox';

const originalOwner = process.env.TELEGRAM_OUTBOX_OWNER;
const originalBridgeEnabled = process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED;

afterEach(() => {
  if (originalOwner == null) delete process.env.TELEGRAM_OUTBOX_OWNER;
  else process.env.TELEGRAM_OUTBOX_OWNER = originalOwner;
  if (originalBridgeEnabled == null) delete process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED;
  else process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED = originalBridgeEnabled;
});

describe('single-owner Telegram bridge cron', () => {
  it('is a no-op until the external relay has been verified and enabled', async () => {
    delete process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED;
    delete process.env.TELEGRAM_OUTBOX_OWNER;
    await expect(runTelegramFlush()).resolves.toEqual({ status: 'disabled', goV2: null });
  });

  it('fails before touching the database unless the external relay is the explicit owner', async () => {
    process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED = 'true';
    delete process.env.TELEGRAM_OUTBOX_OWNER;
    await expect(runTelegramFlush()).rejects.toMatchObject({
      code: 'TELEGRAM_OUTBOX_OWNER_REQUIRED',
    });
  });

  it('rejects a server-side sender cutover before touching the database', async () => {
    process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED = 'true';
    process.env.TELEGRAM_OUTBOX_OWNER = 'cron';
    await expect(runTelegramFlush()).rejects.toMatchObject({
      code: 'TELEGRAM_OUTBOX_OWNER_REQUIRED',
    });
  });

  it('keeps legacy interactive buttons when the shared queue is delivered', () => {
    const postId = '11111111-1111-4111-8111-111111111111';
    expect(telegramOutboxButtons(
      'reminder_60m',
      `Через час игра: https://lpvolley.ru/partner/${postId}`,
    )).toEqual([
      [
        { text: '✅ Иду', callbackData: `attendance:y:${postId}` },
        { text: '❌ Не смогу', callbackData: `attendance:n:${postId}` },
      ],
      [{ text: 'Открыть игру', url: `https://lpvolley.ru/partner/${postId}` }],
    ]);
  });
});
