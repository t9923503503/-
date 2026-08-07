export async function sendTelegramMessage(
  chatId: string | null | undefined,
  text: string
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const targetChat = String(chatId || '').trim();
  if (!botToken || !targetChat) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TelegramInlineButton {
  text: string;
  callbackData?: string;
  url?: string;
}

export async function sendTelegramInlineMessage(
  chatId: string | null | undefined,
  text: string,
  buttons: TelegramInlineButton[][]
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const targetChat = String(chatId || '').trim();
  if (!botToken || !targetChat) return false;

  const inlineKeyboard: Array<Array<{
    text: string;
    callback_data?: string;
    url?: string;
  }>> = buttons
    .map((row) => {
      const telegramRow: Array<{
        text: string;
        callback_data?: string;
        url?: string;
      }> = [];
      for (const button of row) {
        const label = String(button.text || '').trim();
        if (!label) continue;
        if (button.callbackData) {
          telegramRow.push({
            text: label,
            callback_data: String(button.callbackData).slice(0, 64),
          });
          continue;
        }
        if (button.url) telegramRow.push({ text: label, url: String(button.url) });
      }
      return telegramRow;
    })
    .filter((row) => row.length > 0);

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        disable_web_page_preview: true,
        ...(inlineKeyboard.length ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function answerTelegramCallback(
  callbackQueryId: string | null | undefined,
  text?: string
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const callbackId = String(callbackQueryId || '').trim();
  if (!botToken || !callbackId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackId,
        ...(text ? { text: String(text).slice(0, 180) } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Пост в канал с инлайн-кнопкой-ссылкой («⚡ Записаться»).
// Возвращает message_id при успехе (нужен для будущего редактирования поста).
export async function sendTelegramChannelPost(
  chatId: string | null | undefined,
  text: string,
  buttonText: string,
  buttonUrl: string
): Promise<number | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const targetChat = String(chatId || '').trim();
  if (!botToken || !targetChat) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      result?: { message_id?: number };
    } | null;
    return data?.result?.message_id ?? null;
  } catch {
    return null;
  }
}
