import { NextRequest, NextResponse } from 'next/server';
import {
  answerTelegramCallback,
  sendTelegramInlineMessage,
  sendTelegramMessage,
} from '@/lib/telegram';
import { handleTgStart, handleTgMy, handleTgUnlink, handleTgHelp } from '@/lib/telegram-commands';
import {
  confirmTelegramWebLogin,
  startTelegramWebLogin,
  telegramRegistrations,
} from '@/lib/telegram-registration';
import {
  confirmGameAttendanceFromTelegram,
  createGameDraftFromTelegram,
  joinGameFromTelegram,
  leaveGameFromTelegram,
  respondGameInviteFromTelegram,
  telegramGameCreateMenu,
  type TelegramGameActionResult,
} from '@/lib/telegram-actions';

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

async function sendGameFlow(chatId: string, result: TelegramGameActionResult) {
  if (result.buttons?.length) {
    await sendTelegramInlineMessage(chatId, result.reply, result.buttons);
  } else {
    await sendTelegramMessage(chatId, result.reply);
  }
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
  const callbackData = String(callback?.data || '');
  const callbackMatch = callbackData.match(/^wl:r:([A-Za-z0-9_-]{20,64})$/);
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

  if (callback) {
    const callbackChatId = String(callback.message?.chat?.id ?? '').trim();
    const callbackUserId = String(callback.from?.id ?? '').trim();
    const callbackPrivateChatId = callback.message?.chat?.type === 'private' ? callbackChatId : '';
    const attendance = callbackData.match(/^attendance:([yn]):([0-9a-f-]{36})$/i);
    const invitation = callbackData.match(/^invite:([ad]):([0-9a-f-]{36})$/i);
    const gameJoin = callbackData.match(/^(join|leave):([0-9a-f-]{36})$/i);
    const create = callbackData.match(/^create:(2x2|thai|king)(?::(rated|friendly))?$/i);
    const createMode = callbackData.match(/^create:mode:(rated|friendly)$/i);
    try {
      let result: TelegramGameActionResult | null = null;
      if (attendance) {
        result = attendance[1].toLowerCase() === 'y'
          ? await confirmGameAttendanceFromTelegram(callbackUserId, attendance[2])
          : await leaveGameFromTelegram(callbackUserId, attendance[2]);
      } else if (invitation) {
        result = await respondGameInviteFromTelegram(
          callbackUserId,
          invitation[2],
          invitation[1].toLowerCase() === 'a' ? 'accept' : 'decline'
        );
      } else if (gameJoin) {
        result = gameJoin[1].toLowerCase() === 'join'
          ? await joinGameFromTelegram(callbackUserId, gameJoin[2])
          : await leaveGameFromTelegram(callbackUserId, gameJoin[2]);
      } else if (callbackData === 'create:menu' || createMode) {
        result = callbackPrivateChatId
          ? await telegramGameCreateMenu(callbackUserId, createMode?.[1].toLowerCase() === 'friendly' ? 'friendly' : 'rated')
          : { ok: false, reply: 'Создание игры доступно только в личном чате.' };
      } else if (create) {
        result = callbackPrivateChatId
          ? await createGameDraftFromTelegram(
              callbackUserId,
              create[1].toLowerCase() as '2x2' | 'thai' | 'king',
              create[2]?.toLowerCase() === 'friendly' ? 'friendly' : 'rated'
            )
          : { ok: false, reply: 'Создание игры доступно только в личном чате.' };
      }
      if (result) {
        await answerTelegramCallback(callback.id, result.reply);
        if (callbackPrivateChatId && result.buttons?.length) await sendGameFlow(callbackChatId, result);
        return NextResponse.json({ ok: true });
      }
    } catch (err) {
      console.error('[api/telegram/webhook][game-callback]', err);
      await answerTelegramCallback(callback.id, 'Временная ошибка');
      return NextResponse.json({ ok: true });
    }
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
      else if (command === '/start' && payload === 'create_game' && privateChatId) {
        await sendGameFlow(chatId, await telegramGameCreateMenu(telegramUserId));
      }
      else if (command === '/start') {
        reply = await handleTgStart(chatId, payload, telegramUserId, privateChatId);
      }
      else if (command === '/my') reply = await handleTgMy(chatId);
      else if (command === '/unlink') reply = await handleTgUnlink(chatId);
      else if (command === '/help') reply = handleTgHelp();
      else if (command === '/create_game' && privateChatId) {
        await sendGameFlow(chatId, await telegramGameCreateMenu(telegramUserId));
      }
      else if (command === '/registrations' && privateChatId) {
        const result = await telegramRegistrations(telegramUserId, privateChatId);
        if (result.buttons?.length) await sendTelegramInlineMessage(chatId, result.reply, result.buttons);
        else await sendTelegramMessage(chatId, result.reply);
      }

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
