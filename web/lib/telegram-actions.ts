import { getPool } from '@/lib/db';
import {
  cancelPlayJoin,
  joinPlayPost,
  PlayServiceError,
} from '@/lib/play-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TelegramGameActionResult {
  ok: boolean;
  reply: string;
  status?: string;
}

async function linkedUserId(telegramUserId: string): Promise<number | null> {
  const value = String(telegramUserId || '').trim();
  if (!/^[1-9]\d*$/.test(value)) return null;
  const result = await getPool().query(
    'SELECT id FROM users WHERE telegram_user_id = $1 LIMIT 1',
    [value]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

function actionError(error: unknown): TelegramGameActionResult {
  if (error instanceof PlayServiceError) return { ok: false, reply: error.message };
  throw error;
}

export async function joinGameFromTelegram(
  telegramUserId: string,
  postId: string
): Promise<TelegramGameActionResult> {
  if (!UUID_RE.test(postId)) return { ok: false, reply: 'Некорректная игра.' };
  const userId = await linkedUserId(telegramUserId);
  if (!userId) {
    return {
      ok: false,
      reply: 'Сначала привяжи Telegram в кабинете lpvolley.ru/profile, затем нажми кнопку ещё раз.',
    };
  }
  try {
    const result = await joinPlayPost(userId, postId);
    const status = String(result.status);
    const reply = status === 'confirmed'
      ? 'Готово — ты в основном составе ✅'
      : status === 'reserve'
        ? 'Основной состав заполнен — ты добавлен в резерв ⏳'
        : 'Заявка отправлена организатору ✅';
    return { ok: true, reply, status };
  } catch (error) {
    return actionError(error);
  }
}

export async function leaveGameFromTelegram(
  telegramUserId: string,
  postId: string
): Promise<TelegramGameActionResult> {
  if (!UUID_RE.test(postId)) return { ok: false, reply: 'Некорректная игра.' };
  const userId = await linkedUserId(telegramUserId);
  if (!userId) return { ok: false, reply: 'Telegram не привязан к аккаунту LPVOLLEY.' };
  try {
    await cancelPlayJoin(userId, postId);
    return { ok: true, reply: 'Запись отменена. Место передано следующему игроку, если был резерв.' };
  } catch (error) {
    return actionError(error);
  }
}

export interface TelegramReminderReport {
  reminders24h: number;
  reminders3h: number;
}

async function enqueueReminder(
  kind: 'reminder_24h' | 'reminder_3h',
  fromInterval: string,
  toInterval: string,
  leadText: string
): Promise<number> {
  const result = await getPool().query(
    `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
     SELECT u.telegram_chat_id,
            $1,
            $2 || ' «' || pp.title || '», площадка: ' || pv.name ||
              '. Детали: https://lpvolley.ru/partner/' || pp.id::text,
            $1 || ':' || pp.id::text || ':' || u.telegram_chat_id
       FROM play_posts pp
       JOIN play_venues pv ON pv.id = pp.venue_id
       JOIN play_post_participants ppp ON ppp.post_id = pp.id AND ppp.status = 'confirmed'
       JOIN users u ON u.id = ppp.user_id
      WHERE pp.status = 'published'
        AND pp.starts_at BETWEEN now() + $3::interval AND now() + $4::interval
        AND COALESCE(u.telegram_chat_id, '') <> ''
     ON CONFLICT (dedup_key) DO NOTHING`,
    [kind, leadText, fromInterval, toInterval]
  );
  return result.rowCount ?? 0;
}

export async function enqueueTelegramReminders(): Promise<TelegramReminderReport> {
  const [reminders24h, reminders3h] = await Promise.all([
    enqueueReminder('reminder_24h', '23 hours 50 minutes', '24 hours 10 minutes', 'Завтра игра'),
    enqueueReminder('reminder_3h', '2 hours 50 minutes', '3 hours 10 minutes', 'Через 3 часа игра'),
  ]);
  return { reminders24h, reminders3h };
}
