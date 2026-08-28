/**
 * LPVOLLEY Telegram-бот — локальный релей.
 *
 * Зачем: боевой сервер lpvolley.ru не может ходить в Telegram API.
 * Этот процесс живёт на машине с доступом к TG и выполняет три роли:
 *   1. Команды бота (/start <токен>, /my, /unlink, /help) — через long polling,
 *      действия с БД делает сервер (/api/telegram/agent), бот только доставляет.
 *   2. Релей личных уведомлений: забирает очередь telegram_outbox с сервера
 *      и отправляет игрокам в TG.
 *   3. Анонсы в канал/группу: забирает готовые посты (игры, турниры)
 *      и публикует с кнопкой «⚡ Записаться».
 *
 * Зависимостей нет (Node >= 18, fetch из коробки). Запуск: node bot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Конфиг из .env (KEY=VALUE построчно) ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const SITE_BASE = (process.env.SITE_BASE || 'https://lpvolley.ru').replace(/\/$/, '');
const AGENT_SECRET = process.env.TELEGRAM_AGENT_SECRET || '';
const POLL_TIMEOUT = Number(process.env.POLL_TIMEOUT_SEC || 25);
const RELAY_INTERVAL_MS = Number(process.env.RELAY_INTERVAL_SEC || 30) * 1000;
const TELEGRAM_OUTBOX_OWNER = String(process.env.TELEGRAM_OUTBOX_OWNER || '').trim().toLowerCase();
const TG_REQUEST_TIMEOUT_MS = 20_000;
const TG_LONG_POLL_TIMEOUT_MS = Math.max(TG_REQUEST_TIMEOUT_MS, (POLL_TIMEOUT + 15) * 1000);
const AGENT_REQUEST_TIMEOUT_MS = 20_000;
const OFFSET_FILE = path.join(__dirname, '.offset');
const ADMIN_USER_IDS = new Set(
  String(process.env.TELEGRAM_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[1-9]\d*$/.test(value))
);
const ADMIN_CHAT_IDS = Array.from(ADMIN_USER_IDS);
const gallerySessions = new Map();

if (!BOT_TOKEN) {
  console.error('[bot] Нет BOT_TOKEN — заполни .env');
  process.exit(1);
}
if (!AGENT_SECRET) {
  console.warn('[bot] Нет TELEGRAM_AGENT_SECRET — команды и релей работать не будут, только polling.');
}

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const log = (...args) => console.log(new Date().toISOString(), ...args);

// --- Telegram API ---
async function tg(method, payload) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
    signal: AbortSignal.timeout(method === 'getUpdates' ? TG_LONG_POLL_TIMEOUT_MS : TG_REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({ ok: false, description: 'bad json' }));
  if (!data.ok) {
    const err = new Error(`${method}: ${data.description || res.status}`);
    err.code = data.error_code;
    err.retryAfter = Number(data.parameters?.retry_after || 0);
    // A structured Telegram error is a definite rejection and can be retried
    // after an acknowledged backoff. Network/timeout/bad-response failures are
    // outcome-unknown and must never be sent again automatically.
    err.providerRejected = Number.isInteger(Number(data.error_code));
    throw err;
  }
  return data.result;
}

async function sendText(chatId, text) {
  try {
    await tg('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
    return 'sent';
  } catch (err) {
    log('[send] fail', chatId, err.message);
    // 400/403 обычно означают неверный chat_id или блокировку бота — это
    // постоянная ошибка. Сеть, 429 и 5xx не должны сжигать попытки outbox.
    return err.code === 400 || err.code === 403 ? 'failed' : 'retry';
  }
}

async function sendOutboxItem(item, attemptId) {
  try {
    const replyMarkup = flowMarkup(item);
    const result = await tg('sendMessage', {
      chat_id: item.chatId,
      text: String(item.text || ''),
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return {
      status: 'sent',
      receipt: {
        provider: 'telegram',
        providerAttemptId: attemptId,
        messageId: Number(result?.message_id || 0) || null,
        acceptedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    log('[outbox send] fail', item.chatId, err.message);
    return {
      status: err.providerRejected ? 'failed' : 'unknown',
      error: `${err.code || 'network'}:${String(err.message || 'telegram_delivery_failed')}`,
    };
  }
}

async function beginOutboxAttemptWithRetry(payload) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await agent('outboxBegin', payload);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError || new Error('outboxBegin failed');
}

async function acknowledgeOutboxWithRetry(payload) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await agent('outboxAck', payload);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError || new Error('outboxAck failed');
}

function flowMarkup(result) {
  const rows = Array.isArray(result?.buttons) ? result.buttons : [];
  if (!rows.length) return undefined;
  return {
    inline_keyboard: rows.map((row) => row.map((button) => {
      if (button.url) return { text: String(button.text), url: String(button.url) };
      return { text: String(button.text), callback_data: String(button.callbackData || 'home') };
    })),
  };
}

async function sendFlow(chatId, result) {
  if (!result?.reply) return;
  let replyMarkup = flowMarkup(result);
  if (result.removeKeyboard && replyMarkup) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: String(result.reply),
      disable_web_page_preview: true,
      reply_markup: { remove_keyboard: true },
    });
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Выбери вариант:',
      reply_markup: replyMarkup,
    });
    return;
  }
  if (result.requestContact) {
    replyMarkup = {
      keyboard: [[{ text: '📱 Поделиться своим контактом', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } else if (result.removeKeyboard && !replyMarkup) {
    replyMarkup = { remove_keyboard: true };
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text: String(result.reply),
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendChannelPost(item) {
  const result = await tg('sendMessage', {
    chat_id: item.chatId,
    text: item.text,
    disable_web_page_preview: false,
    reply_markup: itemButtonMarkup(item),
  });
  return result.message_id ?? null;
}

function itemButtonMarkup(item) {
  const button = item.buttonAction
    ? { text: item.buttonText, callback_data: item.buttonAction }
    : { text: item.buttonText, url: item.buttonUrl };
  return { inline_keyboard: [[button]] };
}

// --- Серверный агент ---
async function agent(action, params = {}) {
  const res = await fetch(`${SITE_BASE}/api/telegram/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AGENT_SECRET}`,
    },
    body: JSON.stringify({ action, ...params }),
    signal: AbortSignal.timeout(AGENT_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`agent ${action}: HTTP ${res.status}`);
  return res.json();
}

async function uploadTournamentPhoto({ tournamentId, kind, telegramUserId, photo }) {
  const file = await tg('getFile', { file_id: photo.file_id });
  const filePath = String(file?.file_path || '');
  if (!filePath) throw new Error('Telegram не вернул путь к фото');

  const download = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`, {
    signal: AbortSignal.timeout(TG_REQUEST_TIMEOUT_MS),
  });
  if (!download.ok) throw new Error(`скачивание фото: HTTP ${download.status}`);
  const imageBlob = await download.blob();
  const formData = new FormData();
  formData.set('kind', kind);
  formData.set('telegramUserId', telegramUserId);
  formData.set('telegramFileId', String(photo.file_id || ''));
  formData.set('telegramFileUniqueId', String(photo.file_unique_id || ''));
  formData.set('photo', imageBlob, 'telegram-photo.jpg');

  const response = await fetch(`${SITE_BASE}/api/admin/tournaments/${tournamentId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AGENT_SECRET}` },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error || `загрузка фото: HTTP ${response.status}`));
  return data;
}

async function sendGalleryPicker(chatId, telegramUserId) {
  if (!ADMIN_USER_IDS.has(telegramUserId)) {
    await sendText(chatId, 'Команда доступна только организаторам LPVOLLEY.');
    return;
  }
  const result = await agent('galleryTournaments', { telegramUserId, limit: 10 });
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) {
    await sendText(chatId, 'В архиве пока нет завершённых турниров.');
    return;
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text: '📸 Выбери завершённый турнир для фотоотчёта:',
    reply_markup: {
      inline_keyboard: items.map((item) => [{
        text: `${item.date ? `${item.date} · ` : ''}${String(item.name).slice(0, 34)} · ${Number(item.galleryCount || 0)}/20`,
        callback_data: `gal:${item.id}`,
      }]),
    },
  });
}

// --- Команды и живое меню ---
const COMMAND_ACTIONS = { '/my': 'my', '/unlink': 'unlink', '/help': 'help' };

async function sendMenu(chatId, text = 'Что показать?') {
  await tg('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ Создать игру', callback_data: 'create:menu' },
          { text: '📋 Мои игры', callback_data: 'registrations' },
        ],
        [
          { text: '🏐 Ближайшие игры', callback_data: 'games' },
          { text: '🏆 Турниры', callback_data: 'tournaments' },
        ],
        [
          { text: '📅 Всё расписание', callback_data: 'calendar' },
          { text: '👤 Мой аккаунт', callback_data: 'my' },
        ],
      ],
    },
  });
}

async function sendCatalog(chatId, action) {
  const data = await agent(action, { limit: 5 });
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    await sendText(
      chatId,
      action === 'games'
        ? 'Пока нет открытых ближайших игр. Загляни чуть позже 🏐'
        : 'Пока нет турниров с открытой регистрацией. Загляни чуть позже 🏆'
    );
    return;
  }
  await sendText(chatId, String(data.title || 'Ближайшие события'));
  for (const item of items) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: String(item.text || ''),
      disable_web_page_preview: false,
      reply_markup: itemButtonMarkup({
        ...item,
        buttonText: String(item.buttonText || '⚡ Записаться'),
        buttonUrl: String(item.buttonUrl || SITE_BASE),
      }),
    });
  }
}

async function runUserAction(chatId, action) {
  if (action === 'games' || action === 'tournaments') {
    await sendCatalog(chatId, action);
    return;
  }
  if (action === 'calendar') {
    await sendCatalog(chatId, 'games');
    await sendCatalog(chatId, 'tournaments');
    return;
  }
  if (action === 'my' || action === 'unlink' || action === 'help') {
    const reply = (await agent(action, { chatId })).reply;
    if (reply) await sendText(chatId, reply);
    return;
  }
  await sendMenu(chatId);
}

async function handleUpdate(update) {
  const callback = update.callback_query;
  if (callback) {
    const chatId = String(callback.message?.chat?.id ?? '');
    const telegramUserId = String(callback.from?.id ?? '');
    const privateChatId = String(callback.message?.chat?.type) === 'private' && chatId === telegramUserId
      ? chatId
      : '';
    const callbackData = String(callback.data || 'menu');
    try {
      const registrationGender = callbackData.match(/^reg:gender:([MW])$/);
      const registrationPlayer = callbackData.match(/^reg:player:(new|[0-9a-f-]{36})$/i);
      const adminClaim = callbackData.match(/^ac:([ar]):([0-9a-f-]{36})$/i);
      const tournamentAction = callbackData.match(/^(tjoin|tleave):([0-9a-f-]{36})$/i);
      const createGameAction = callbackData.match(/^create:(2x2|thai|king)(?::(rated|friendly))?$/i);
      const createModeAction = callbackData.match(/^create:mode:(rated|friendly)$/i);
      const attendanceAction = callbackData.match(/^attendance:([yn]):([0-9a-f-]{36})$/i);
      const inviteAction = callbackData.match(/^invite:([ad]):([0-9a-f-]{36})$/i);
      const webLoginDecision = callbackData.match(/^wl:(r):([A-Za-z0-9_-]{20,64})$/);
      const galleryTournament = callbackData.match(/^gal:([0-9a-f-]{36})$/i);
      if (webLoginDecision) {
        if (!privateChatId) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Подтвердить вход можно только в личном чате.', show_alert: true });
        } else {
          const result = await agent('webLoginConfirm', {
            telegramUserId,
            privateChatId,
            intentToken: webLoginDecision[2],
            decision: 'reject',
          });
          await tg('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: result.ok ? 'Запрос отклонён' : 'Не получилось отклонить',
            show_alert: !result.ok,
          });
          if (result.ok && callback.message?.message_id) {
            await tg('editMessageReplyMarkup', {
              chat_id: chatId,
              message_id: callback.message.message_id,
              reply_markup: { inline_keyboard: [] },
            }).catch(() => undefined);
          }
          await sendFlow(chatId, result);
        }
      } else if (callbackData === 'reg:start') {
        await tg('answerCallbackQuery', { callback_query_id: callback.id });
        await sendFlow(chatId, await agent('registrationStart', {
          telegramUserId,
          privateChatId: chatId,
        }));
      } else if (registrationGender) {
        await tg('answerCallbackQuery', { callback_query_id: callback.id });
        await sendFlow(chatId, await agent('registrationGender', {
          telegramUserId,
          privateChatId: chatId,
          gender: registrationGender[1],
        }));
      } else if (registrationPlayer) {
        await tg('answerCallbackQuery', { callback_query_id: callback.id });
        await sendFlow(chatId, await agent('registrationPlayer', {
          telegramUserId,
          privateChatId: chatId,
          playerId: registrationPlayer[1],
        }));
      } else if (callbackData === 'reg:cancel') {
        if (!privateChatId) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Открой личный чат с @Lpvolley_bot.', show_alert: true });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: callback.id });
          await sendFlow(chatId, await agent('registrationCancel', { telegramUserId }));
        }
      } else if (callbackData === 'home' || callbackData === 'profile') {
        if (!privateChatId) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Личный кабинет доступен только в чате с @Lpvolley_bot.', show_alert: true });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: callback.id });
          await sendFlow(chatId, await agent('home', { telegramUserId, privateChatId }));
        }
      } else if (callbackData === 'web:login') {
        if (!privateChatId) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Ссылка для входа выдаётся только в личном чате.', show_alert: true });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: callback.id });
          await sendFlow(chatId, await agent('webLogin', { telegramUserId, privateChatId }));
        }
      } else if (callbackData === 'registrations') {
        if (!privateChatId) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Мои записи доступны только в личном чате.', show_alert: true });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: callback.id });
          await sendFlow(chatId, await agent('registrations', { telegramUserId, privateChatId }));
        }
      } else if (callbackData === 'create:menu' || createModeAction || createGameAction) {
        if (!privateChatId) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Создание игры доступно только в личном чате.', show_alert: true });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: createGameAction ? 'Создаю черновик…' : undefined });
          const result = createGameAction
            ? await agent('createGameDraft', {
                telegramUserId,
                template: createGameAction[1].toLowerCase(),
                ratingMode: String(createGameAction[2] || 'rated').toLowerCase(),
              })
            : await agent('gameCreateMenu', {
                telegramUserId,
                ratingMode: createModeAction ? createModeAction[1].toLowerCase() : 'rated',
              });
          await sendFlow(chatId, result);
        }
      } else if (attendanceAction) {
        const action = attendanceAction[1].toLowerCase() === 'y' ? 'confirmAttendance' : 'leaveGame';
        const result = await agent(action, { telegramUserId, postId: attendanceAction[2] });
        await tg('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: String(result.reply || (result.ok ? 'Готово' : 'Не получилось')),
          show_alert: true,
        });
      } else if (inviteAction) {
        const result = await agent('respondGameInvite', {
          telegramUserId,
          postId: inviteAction[2],
          decision: inviteAction[1].toLowerCase() === 'a' ? 'accept' : 'decline',
        });
        await tg('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: String(result.reply || (result.ok ? 'Готово' : 'Не получилось')),
          show_alert: true,
        });
        if (result.ok && callback.message?.message_id) {
          await tg('editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: callback.message.message_id,
            reply_markup: { inline_keyboard: [] },
          }).catch(() => undefined);
        }
      } else if (galleryTournament) {
        if (!privateChatId || !ADMIN_USER_IDS.has(telegramUserId)) {
          await tg('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Фотоотчёт доступен организатору только в личном чате.',
            show_alert: true,
          });
        } else {
          gallerySessions.set(telegramUserId, {
            tournamentId: galleryTournament[1],
            stage: 'cover',
          });
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Турнир выбран' });
          await sendText(
            chatId,
            'Сначала пришли главное общее фото. Оно появится в шапке турнира.\n\nМожно сразу отправить альбом: первый кадр станет главным, остальные попадут в галерею. Если главное фото не нужно — /skip. Завершить — /done, отменить — /cancel.'
          );
        }
      } else if (adminClaim) {
        if (!ADMIN_USER_IDS.has(telegramUserId)) {
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Нет прав администратора', show_alert: true });
        } else {
          const result = await agent('adminClaimReview', {
            adminTelegramUserId: telegramUserId,
            decision: adminClaim[1].toLowerCase() === 'a' ? 'approve' : 'reject',
            claimId: adminClaim[2],
          });
          await tg('answerCallbackQuery', { callback_query_id: callback.id, text: String(result.reply), show_alert: true });
          if (callback.message?.message_id) {
            await tg('editMessageReplyMarkup', {
              chat_id: chatId,
              message_id: callback.message.message_id,
              reply_markup: { inline_keyboard: [] },
            }).catch(() => undefined);
          }
        }
      } else if (tournamentAction) {
        const result = await agent(
          tournamentAction[1].toLowerCase() === 'tjoin' ? 'joinTournament' : 'leaveTournament',
          { telegramUserId, tournamentId: tournamentAction[2] }
        );
        await tg('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: String(result.reply || (result.ok ? 'Готово' : 'Не получилось')),
          show_alert: true,
        });
        if (result.buttons?.length && String(callback.message?.chat?.type) === 'private') {
          await sendFlow(chatId, result);
        } else if (result.status === 'registration_required') {
          try {
            await sendFlow(telegramUserId, result);
          } catch {
            // Пользователь должен сначала открыть личный чат с ботом.
          }
        }
      } else {
      const gameAction = callbackData.match(/^(join|leave):([0-9a-f-]{36})$/i);
      if (gameAction) {
        const action = gameAction[1].toLowerCase() === 'join' ? 'joinGame' : 'leaveGame';
        const result = await agent(action, {
          telegramUserId,
          postId: gameAction[2],
        });
        await tg('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: String(result.reply || (result.ok ? 'Готово' : 'Не получилось')),
          show_alert: true,
        });
        if (result.ok && action === 'joinGame') {
          try {
            await tg('sendMessage', {
              chat_id: telegramUserId,
              text: `${String(result.reply)}\n\nОтменить запись можно кнопкой ниже.`,
              reply_markup: {
                inline_keyboard: [[{
                  text: 'Отменить запись',
                  callback_data: `leave:${gameAction[2]}`,
                }]],
              },
            });
          } catch (err) {
            log('[callback] private controls:', err.message);
          }
        }
      } else {
        await tg('answerCallbackQuery', { callback_query_id: callback.id });
        if (chatId) await runUserAction(chatId, callbackData);
      }
      }
    } catch (err) {
      log('[callback]', callbackData, err.message);
      try {
        await tg('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: 'Не получилось выполнить действие. Попробуй ещё раз чуть позже.',
          show_alert: true,
        });
      } catch { /* callback мог уже устареть */ }
    }
    return;
  }

  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat?.id ?? '');
  const telegramUserId = String(msg.from?.id ?? '');
  if (!chatId || !telegramUserId) return;

  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    if (String(msg.chat?.type) !== 'private' || !ADMIN_USER_IDS.has(telegramUserId)) return;
    const session = gallerySessions.get(telegramUserId);
    if (!session) {
      await sendText(chatId, 'Чтобы добавить фото в архив, сначала выбери турнир командой /gallery.');
      return;
    }
    const photo = msg.photo[msg.photo.length - 1];
    const kind = session.stage === 'cover' ? 'cover' : 'gallery';
    try {
      const result = await uploadTournamentPhoto({
        tournamentId: session.tournamentId,
        kind,
        telegramUserId,
        photo,
      });
      if (kind === 'cover') {
        session.stage = 'gallery';
        gallerySessions.set(telegramUserId, session);
        await sendText(chatId, '✅ Главное фото готово. Теперь присылай до 20 фото галереи одним альбомом или по одному. Завершить — /done.');
      } else {
        const count = Array.isArray(result.gallery) ? result.gallery.length : 0;
        await sendText(chatId, `✅ Фото добавлено: ${count}/20.${count >= 20 ? ' Галерея заполнена — /done.' : ''}`);
      }
    } catch (err) {
      log('[gallery photo]', err.message);
      await sendText(chatId, `❌ Не удалось добавить фото: ${err.message}`);
    }
    return;
  }

  if (msg.contact) {
    try {
      await sendFlow(chatId, await agent('registrationContact', {
        telegramUserId,
        privateChatId: chatId,
        contactUserId: String(msg.contact.user_id ?? ''),
        phone: String(msg.contact.phone_number ?? ''),
        username: String(msg.from?.username ?? ''),
      }));
    } catch (err) {
      log('[contact]', err.message);
      await sendText(chatId, 'Не получилось сохранить контакт. Попробуй ещё раз.');
    }
    return;
  }

  const text = String(msg.text || '').trim();
  if (!text) return;
  if (!text.startsWith('/')) {
    if (String(msg.chat?.type) !== 'private') return;
    try {
      await sendFlow(chatId, await agent('registrationText', {
        telegramUserId,
        privateChatId: chatId,
        text,
      }));
    } catch (err) {
      log('[registration text]', err.message);
      await sendText(chatId, 'Не получилось продолжить анкету. Нажми /start.');
    }
    return;
  }

  const [commandRaw, ...rest] = text.split(/\s+/);
  const command = commandRaw.split('@')[0].toLowerCase();
  const payload = rest.join(' ').trim();

  try {
    if (command === '/start') {
      const loginIntent = payload.match(/^login_([A-Za-z0-9_-]{20,64})$/);
      if (loginIntent) {
        await sendFlow(chatId, await agent('webLoginStart', {
          telegramUserId,
          privateChatId: String(msg.chat?.type) === 'private' ? chatId : '',
          intentToken: loginIntent[1],
          firstName: String(msg.from?.first_name ?? ''),
          lastName: String(msg.from?.last_name ?? ''),
          username: String(msg.from?.username ?? ''),
        }));
      } else if (payload === 'create_game') {
        if (String(msg.chat?.type) !== 'private') {
          await sendText(chatId, 'Открой личный чат с ботом, чтобы создать игру.');
        } else {
          await sendFlow(chatId, await agent('gameCreateMenu', { telegramUserId }));
        }
      } else {
        if (payload) {
          const reply = (await agent('bind', {
            chatId,
            telegramUserId,
            privateChatId: String(msg.chat?.type) === 'private' ? chatId : '',
            payload,
          })).reply;
          if (reply) await sendText(chatId, reply);
        }
        await sendFlow(chatId, await agent('home', {
          telegramUserId,
          privateChatId: String(msg.chat?.type) === 'private' && chatId === telegramUserId ? chatId : '',
        }));
      }
    } else if (command === '/register') {
      await sendFlow(chatId, await agent('registrationStart', { telegramUserId, privateChatId: chatId }));
    } else if (command === '/menu') {
      await sendFlow(chatId, await agent('home', {
        telegramUserId,
        privateChatId: String(msg.chat?.type) === 'private' && chatId === telegramUserId ? chatId : '',
      }));
    } else if (command === '/registrations') {
      await sendFlow(chatId, await agent('registrations', {
        telegramUserId,
        privateChatId: String(msg.chat?.type) === 'private' && chatId === telegramUserId ? chatId : '',
      }));
    } else if (command === '/games') {
      await runUserAction(chatId, 'games');
    } else if (command === '/create_game') {
      if (String(msg.chat?.type) !== 'private') {
        await sendText(chatId, 'Создание игры доступно только в личном чате с ботом.');
      } else {
        await sendFlow(chatId, await agent('gameCreateMenu', { telegramUserId }));
      }
    } else if (command === '/tournaments' || command === '/tourneys') {
      await runUserAction(chatId, 'tournaments');
    } else if (command === '/calendar') {
      await runUserAction(chatId, 'calendar');
    } else if (command === '/gallery') {
      if (String(msg.chat?.type) !== 'private') {
        await sendText(chatId, 'Открой личный чат с ботом, чтобы загрузить фото турнира.');
      } else {
        await sendGalleryPicker(chatId, telegramUserId);
      }
    } else if (command === '/skip' && gallerySessions.has(telegramUserId)) {
      const session = gallerySessions.get(telegramUserId);
      session.stage = 'gallery';
      gallerySessions.set(telegramUserId, session);
      await sendText(chatId, 'Главное фото пропущено. Присылай до 20 фото галереи. Завершить — /done.');
    } else if (command === '/done' && gallerySessions.has(telegramUserId)) {
      gallerySessions.delete(telegramUserId);
      await sendText(chatId, '✅ Фотоотчёт завершён. Он уже доступен на странице турнира в архиве.');
    } else if (command === '/cancel' && gallerySessions.has(telegramUserId)) {
      gallerySessions.delete(telegramUserId);
      await sendText(chatId, 'Загрузка фото остановлена. Уже сохранённые снимки остались в галерее.');
    } else if (COMMAND_ACTIONS[command]) {
      await runUserAction(chatId, COMMAND_ACTIONS[command]);
    } else {
      await sendMenu(chatId, 'Такой команды пока нет. Вот что я умею:');
    }
  } catch (err) {
    log('[cmd]', command, err.message);
    await sendText(chatId, 'Сервис временно недоступен. Попробуй ещё раз чуть позже.');
  }
}

// --- Long polling ---
function readOffset() {
  try {
    return Number(fs.readFileSync(OFFSET_FILE, 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset) {
  try {
    fs.writeFileSync(OFFSET_FILE, String(offset));
  } catch { /* некритично */ }
}

async function pollingLoop() {
  let offset = readOffset();
  for (;;) {
    try {
      const updates = await tg('getUpdates', {
        offset,
        timeout: POLL_TIMEOUT,
        allowed_updates: ['message', 'callback_query'],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        saveOffset(offset);
        await handleUpdate(update);
      }
    } catch (err) {
      if (err.code === 409) {
        log('[poll] 409 Conflict: кто-то ещё опрашивает бота (webhook или второй процесс). Жду 15 c.');
        await new Promise((r) => setTimeout(r, 15000));
      } else {
        log('[poll]', err.message, '— повтор через 5 c');
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

// --- Релей: outbox + анонсы канала ---
const channelTextCache = new Map();

async function refreshChannelPosts() {
  const { items } = await agent('channelUpdates', { limit: 50 });
  for (const item of Array.isArray(items) ? items : []) {
    const key = `${item.chatId}:${item.messageId}`;
    const signature = JSON.stringify([item.text, item.buttonText, item.buttonUrl, item.buttonAction]);
    if (channelTextCache.get(key) === signature) continue;
    try {
      await tg('editMessageText', {
        chat_id: item.chatId,
        message_id: item.messageId,
        text: item.text,
        disable_web_page_preview: false,
        reply_markup: itemButtonMarkup(item),
      });
      channelTextCache.set(key, signature);
      log('[relay] channel updated:', item.entityId, 'message', item.messageId);
    } catch (err) {
      if (String(err.message).includes('message is not modified')) {
        channelTextCache.set(key, signature);
      } else if (err.code === 400 && String(err.message).includes('message to edit not found')) {
        try {
          await agent('channelDetach', {
            entityType: item.entityType,
            entityId: item.entityId,
            messageId: item.messageId,
          });
          channelTextCache.delete(key);
          log('[relay] channel detached:', item.entityId, 'message', item.messageId);
        } catch (detachError) {
          log('[relay] channel detach fail:', item.entityId, detachError.message);
        }
      } else {
        log('[relay] channel update fail:', item.entityId, err.message);
      }
    }
  }
}

async function relayRound() {
  if (!AGENT_SECRET) return;

  // Заявки на карточку игрока — только в личные чаты разрешённых администраторов.
  if (ADMIN_CHAT_IDS.length > 0) {
    try {
      const { items } = await agent('adminOutbox', { limit: 20 });
      const deliveredIds = [];
      for (const item of Array.isArray(items) ? items : []) {
        let deliveredToAny = false;
        for (const adminChatId of ADMIN_CHAT_IDS) {
          try {
            await tg('sendMessage', {
              chat_id: adminChatId,
              text: String(item.text),
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ Подтвердить', callback_data: String(item.callbacks?.approve || '') },
                  { text: '❌ Отклонить', callback_data: String(item.callbacks?.reject || '') },
                ]],
              },
            });
            deliveredToAny = true;
          } catch (err) {
            log('[relay] admin outbox:', adminChatId, err.message);
          }
        }
        if (deliveredToAny) deliveredIds.push(Number(item.id));
      }
      if (deliveredIds.length) await agent('adminOutboxAck', { ids: deliveredIds });
    } catch (err) {
      log('[relay] admin outbox:', err.message);
    }
  }

  // Напоминания за сутки и за 3 часа ставятся в тот же надёжный outbox.
  try {
    const report = await agent('reminderSweep');
    if (report.reminders24h || report.reminders3h) {
      log('[relay] reminders:', report);
    }
  } catch (err) {
    log('[relay] reminderSweep:', err.message);
  }

  // Личные уведомления
  if (TELEGRAM_OUTBOX_OWNER === 'relay') {
    try {
      const claimId = randomUUID();
      const response = await agent('outbox', { claimId, limit: 25 });
      if (response.claimId !== claimId) throw new Error('outbox claimId mismatch');
      const results = [];
      for (const item of Array.isArray(response.items) ? response.items : []) {
        const attemptId = randomUUID();
        // Persist the provider-attempt fence before calling sendMessage. If the
        // process or network dies afterwards, the server quarantines the row as
        // delivery_unknown instead of risking a duplicate Telegram message.
        await beginOutboxAttemptWithRetry({ claimId, id: item.id, attemptId });
        const delivery = await sendOutboxItem(item, attemptId);
        results.push({
          id: item.id,
          status: delivery.status,
          ...(delivery.receipt ? { receipt: delivery.receipt } : {}),
          ...(delivery.error ? { error: delivery.error } : {}),
        });
      }
      if (results.length) {
        const acknowledged = await acknowledgeOutboxWithRetry({ claimId, results });
        log(
          '[relay] outbox: sent', acknowledged.sent,
          'failed', acknowledged.failed,
          'unknown/quarantined', acknowledged.unknown || 0,
        );
      }
    } catch (err) {
      log('[relay] outbox:', err.message);
    }
  }

  // Анонсы в канал/группу
  try {
    const { items } = await agent('channelQueue', { limit: 10 });
    for (const item of items) {
      try {
        const messageId = await sendChannelPost(item);
        await agent('channelAck', {
          entityType: item.entityType,
          entityId: item.entityId,
          messageId,
        });
        log('[relay] channel:', item.entityType, item.entityId, '→ message', messageId);
      } catch (err) {
        log('[relay] channel fail:', item.entityId, err.message);
      }
    }
  } catch (err) {
    log('[relay] channelQueue:', err.message);
  }

  try {
    await refreshChannelPosts();
  } catch (err) {
    log('[relay] channelUpdates:', err.message);
  }
}

async function relayLoop() {
  for (;;) {
    await relayRound();
    await new Promise((r) => setTimeout(r, RELAY_INTERVAL_MS));
  }
}

// --- Старт ---
const me = await tg('getMe');
if (ADMIN_USER_IDS.size === 0) {
  log('[bot] TELEGRAM_ADMIN_USER_IDS is empty: player-card moderation is disabled.');
}
if (TELEGRAM_OUTBOX_OWNER !== 'relay') {
  log('[bot] TELEGRAM_OUTBOX_OWNER is not relay: personal outbox delivery is disabled.');
}
const publicCommands = [
  { command: 'menu', description: 'Главное меню' },
  { command: 'registrations', description: 'Мои записи' },
  { command: 'games', description: 'Ближайшие игры и тренировки' },
  { command: 'create_game', description: 'Быстро создать игру' },
  { command: 'tournaments', description: 'Ближайшие турниры' },
  { command: 'calendar', description: 'Всё ближайшее расписание' },
  { command: 'my', description: 'Мой привязанный аккаунт' },
  { command: 'help', description: 'Помощь' },
];
try {
  await tg('setMyCommands', {
    commands: publicCommands,
  });
  for (const adminChatId of ADMIN_CHAT_IDS) {
    await tg('setMyCommands', {
      scope: { type: 'chat', chat_id: adminChatId },
      commands: [
        ...publicCommands,
        { command: 'gallery', description: 'Фотоотчёт завершённого турнира' },
      ],
    });
  }
} catch (err) {
  log('[bot] не удалось обновить меню команд:', err.message);
}
log(`[bot] @${me.username} запущен. Сайт: ${SITE_BASE}. Релей каждые ${RELAY_INTERVAL_MS / 1000} c.`);
await Promise.all([pollingLoop(), relayLoop()]);
