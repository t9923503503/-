#!/usr/bin/env node
/**
 * Установка/проверка/сброс Telegram webhook для @Lpvolley_bot.
 *
 *   node scripts/telegram-set-webhook.mjs set [url]   # установить webhook (по умолчанию https://lpvolley.ru/api/telegram/webhook)
 *   node scripts/telegram-set-webhook.mjs info        # показать текущий webhook
 *   node scripts/telegram-set-webhook.mjs delete      # снять webhook (для локального polling/отладки)
 *
 * Читает TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET из .env.local (или окружения).
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Нет TELEGRAM_BOT_TOKEN — заполни .env.local');
  process.exit(1);
}

const cmd = process.argv[2] || 'info';
const api = `https://api.telegram.org/bot${token}`;

async function call(method, payload) {
  const res = await fetch(`${api}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  return res.json();
}

if (cmd === 'set') {
  const url = process.argv[3] || 'https://lpvolley.ru/api/telegram/webhook';
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const payload = { url, allowed_updates: ['message'], drop_pending_updates: true };
  if (secret) payload.secret_token = secret;
  const out = await call('setWebhook', payload);
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === 'delete') {
  const out = await call('deleteWebhook', { drop_pending_updates: false });
  console.log(JSON.stringify(out, null, 2));
} else {
  const out = await call('getWebhookInfo');
  console.log(JSON.stringify(out, null, 2));
}
