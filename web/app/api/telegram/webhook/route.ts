import { NextRequest, NextResponse } from 'next/server';
import {
  answerTelegramCallback,
  sendTelegramInlineMessage,
  sendTelegramMessage,
} from '@/lib/telegram';
import { handleTgStart, handleTgMy, handleTgUnlink, handleTgHelp } from '@/lib/telegram-commands';
import { confirmTelegramWebLogin, startTelegramWebLogin } from '@/lib/telegram-registration';

export const dynamic = 'force-dynamic';

// Webhook-режим: Telegram шлёт updates на сервер. Используется, только если
// сервер может ходить в Telegram API; иначе бот работает локальным релеем
// через /api/telegram/agent (long polling на стороне бота).

type TgMessage = {
  text?: string;
  chat?: { id?: number | string; type?: string };
  from?: {
    id?: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
};

type TgUpdate = {
  message?: TgMessage;
  callback_query?: {
    id?: string;
    data?: string;
    from?: TgMessage['from'];
    message?: TgMessage;
  };
};

function checkSecret(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Webhook — запасной режим. Пока секрет явно не настроен, маршрут должен
  // оставаться закрытым: иначе произвольный запрос сможет выполнять команды
  // от имени известного Telegram chat_id.
  if (!expected) return false;
  return req.headers.get('x-telegram-bot-api-secret-token') === expected;
}

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const callback = update.callback_query;
  const callbackMatch = String(callback?.data || '').match(/^wl:r:([A-Za-z0-9_-]{20,64})$/);
  if (callback && callbackMatch) {
    const callbackChatId = String(callback.message?.chat?.id ?? '').trim();
    const callbackUserId = String(callback.from?.id ?? '').trim();
    const callbackPrivateChatId = callback.message?.chat?.type === 'private' ? callbackChatId : '';
    try {
      const result = await confirmTelegramWebLogin(
        callbackUserId,
        callbackPrivateChatId,
        callbackMatch[1],
        'reject'
      );
      await answerTelegramCallback(callback.id, result.ok ? 'Вход отменён' : 'Не удалось отменить вход');
      if (callbackChatId) await sendTelegramMessage(callbackChatId, result.reply);
    } catch (err) {
      console.error('[api/telegram/webhook][callback]', err);
      await answerTelegramCallback(callback.id, 'Временная ошибка');
    }
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = String(message?.chat?.id ?? '').trim();
  const telegramUserId = String(message?.from?.id ?? '').trim();
  const privateChatId = message?.chat?.type === 'private' ? chatId : '';
  const text = String(message?.text ?? '').trim();

  if (chatId && text.startsWith('/')) {
    try {
      const [commandRaw, ...rest] = text.split(/\s+/);
      const command = commandRaw.split('@')[0].toLowerCase();
      const payload = rest.join(' ').trim();

      let reply: string | null = null;
      const loginIntent = payload.match(/^login_([A-Za-z0-9_-]{20,64})$/);
      if (command === '/start' && loginIntent) {
        const result = await startTelegramWebLogin(
          telegramUserId,
          privateChatId,
          loginIntent[1],
          {
            firstName: message?.from?.first_name,
            lastName: message?.from?.last_name,
            username: message?.from?.username,
          }
        );
        if (result.buttons?.length) {
          await sendTelegramInlineMessage(chatId, result.reply, result.buttons);
        } else {
          await sendTelegramMessage(chatId, result.reply);
        }
      }
      else if (command === '/start') {
        reply = await handleTgStart(chatId, payload, telegramUserId, privateChatId);
      }
      else if (command === '/my') reply = await handleTgMy(chatId);
      else if (command === '/unlink') reply = await handleTgUnlink(chatId);
      else if (command === '/help') reply = handleTgHelp();

      if (reply) await sendTelegramMessage(chatId, reply);
    } catch (err) {
      console.error('[api/telegram/webhook]', err);
      await sendTelegramMessage(chatId, 'Что-то пошло не так. Попробуй ещё раз чуть позже.');
    }
  }

  return NextResponse.json({ ok: true });
}

// Telegram не шлёт GET, но оставим для проверки живости маршрута
export async function GET() {
  return NextResponse.json({ ok: true, service: 'lpvolley-telegram-webhook' });
}
