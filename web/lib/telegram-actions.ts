import { getPool } from '@/lib/db';
import {
  cancelPlayJoin,
  createPlayPosts,
  ensurePlayOrganizer,
  joinPlayPost,
  PlayServiceError,
  respondPlayAttendance,
  respondPlayInvite,
} from '@/lib/play-service';
import { normalizePlayPostInput, validatePlayPostInput } from '@/lib/play-core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TelegramGameActionResult {
  ok: boolean;
  reply: string;
  status?: string;
  buttons?: Array<Array<{ text: string; callbackData?: string; url?: string }>>;
}

export type TelegramGameTemplate = '2x2' | 'thai' | 'king';
export type TelegramRatingMode = 'rated' | 'friendly';

const TELEGRAM_GAME_TEMPLATES: Record<TelegramGameTemplate, {
  title: string;
  formatLabel: string;
  capacity: number;
  minPlayers: number;
  resultFormat: 'classic_2x2' | 'thai_8' | 'king_sideout';
}> = {
  '2x2': {
    title: 'Игра 2×2',
    formatLabel: '2×2',
    capacity: 4,
    minPlayers: 4,
    resultFormat: 'classic_2x2',
  },
  thai: {
    title: 'Тайская игра',
    formatLabel: 'Тайский',
    capacity: 8,
    minPlayers: 8,
    resultFormat: 'thai_8',
  },
  king: {
    title: 'Сайдаут / KING',
    formatLabel: 'Сайдаут',
    capacity: 8,
    minPlayers: 6,
    resultFormat: 'king_sideout',
  },
};

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

function siteBaseUrl(): string {
  return String(process.env.SITE_BASE_URL || 'https://lpvolley.ru').replace(/\/+$/, '');
}

function tomorrowAtEight(): { startsAt: string; endsAt: string } {
  const yekaterinburgNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const startsAt = new Date(Date.UTC(
    yekaterinburgNow.getUTCFullYear(),
    yekaterinburgNow.getUTCMonth(),
    yekaterinburgNow.getUTCDate() + 1,
    15,
    0,
    0
  ));
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

function draftLink(postId: string): string {
  const returnTo = `/partner/manage?edit=${encodeURIComponent(postId)}`;
  return `${siteBaseUrl()}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function telegramGameCreateMenu(
  telegramUserId: string,
  ratingMode: TelegramRatingMode = 'rated'
): Promise<TelegramGameActionResult> {
  const userId = await linkedUserId(telegramUserId);
  if (!userId) {
    return {
      ok: false,
      reply: 'Сначала зарегистрируйся или привяжи Telegram к аккаунту LPVOLLEY.',
    };
  }
  const friendly = ratingMode === 'friendly';
  return {
    ok: true,
    reply: friendly
      ? 'Обычная игра — результат сохранится в статистике, но не повлияет на рейтинг. Выбери формат.'
      : 'По умолчанию игра идёт на рейтинг. Создам черновик на завтра, 20:00 — останется проверить площадку и опубликовать.',
    buttons: [
      [
        { text: '🏐 2×2', callbackData: `create:2x2:${ratingMode}` },
        { text: '⚡ Тайский · 8', callbackData: `create:thai:${ratingMode}` },
      ],
      [{ text: '👑 Сайдаут / KING', callbackData: `create:king:${ratingMode}` }],
      [{
        text: friendly ? '🏆 Переключить на рейтинговую' : '🎈 Создать обычную игру',
        callbackData: `create:mode:${friendly ? 'rated' : 'friendly'}`,
      }],
    ],
  };
}

export async function createGameDraftFromTelegram(
  telegramUserId: string,
  template: TelegramGameTemplate,
  ratingMode: TelegramRatingMode = 'rated'
): Promise<TelegramGameActionResult> {
  if (!Object.hasOwn(TELEGRAM_GAME_TEMPLATES, template)) {
    return { ok: false, reply: 'Неизвестный шаблон игры.' };
  }
  if (ratingMode !== 'rated' && ratingMode !== 'friendly') {
    return { ok: false, reply: 'Неизвестный режим игры.' };
  }
  const account = await getPool().query(
    `SELECT id, email
       FROM users
      WHERE telegram_user_id = $1
      LIMIT 1`,
    [String(telegramUserId || '').trim()]
  );
  const user = account.rows[0];
  if (!user) {
    return { ok: false, reply: 'Telegram не привязан к аккаунту LPVOLLEY.' };
  }

  const actor = { kind: 'user' as const, userId: Number(user.id), email: String(user.email || '') };
  try {
    const organizer = await ensurePlayOrganizer(actor);
    const venueResult = await getPool().query(
      `SELECT pv.id::text, pv.name
         FROM play_venues pv
         LEFT JOIN LATERAL (
           SELECT MAX(pp.updated_at) AS last_used_at
             FROM play_posts pp
            WHERE pp.venue_id = pv.id AND pp.organizer_id = $1::uuid
         ) recent ON true
        WHERE pv.active = true
        ORDER BY recent.last_used_at DESC NULLS LAST, pv.name ASC
        LIMIT 1`,
      [organizer.id]
    );
    const venue = venueResult.rows[0];
    if (!venue) return { ok: false, reply: 'Нет активной площадки. Добавь её на сайте перед созданием игры.' };

    const schedule = tomorrowAtEight();
    const templateConfig = TELEGRAM_GAME_TEMPLATES[template];
    const { formatLabel, title, capacity, minPlayers, resultFormat } = templateConfig;
    const existing = await getPool().query(
      `SELECT id::text
         FROM play_posts
        WHERE organizer_id = $1::uuid
          AND status = 'draft'
          AND archived_at IS NULL
          AND format_label = $2
          AND starts_at = $3::timestamptz
          AND rating_mode = $4
          AND created_at > now() - interval '15 minutes'
        ORDER BY created_at DESC
        LIMIT 1`,
      [organizer.id, formatLabel, schedule.startsAt, ratingMode]
    );
    const existingId = String(existing.rows[0]?.id || '');
    if (existingId) {
      return {
        ok: true,
        status: 'draft_exists',
        reply: `Черновик «${title}» уже создан. Открой его, чтобы проверить и опубликовать.`,
        buttons: [[{ text: '✏️ Открыть черновик', url: draftLink(existingId) }]],
      };
    }

    const input = normalizePlayPostInput({
      kind: 'game',
      organizerId: organizer.id,
      venueId: String(venue.id),
      coachId: null,
      title,
      description: '',
      formatLabel,
      focus: '',
      ...schedule,
      registrationClosesAt: null,
      gatherDeadline: null,
      levelMin: 'light',
      levelMax: 'hard',
      genderPolicy: 'any',
      capacity,
      minPlayers,
      priceMode: 'split',
      priceRub: 0,
      courtCostRub: 3500,
      courtBooked: false,
      visibility: 'public',
      joinPolicy: 'open',
      status: 'draft',
      repeatWeeks: 1,
      joinAuthor: true,
      ratingMode,
      resultFormat,
      resultConfig: resultFormat === 'classic_2x2'
        ? { pointLimit: 21 }
        : resultFormat === 'thai_8'
          ? { pointLimit: 15, tourCount: 4 }
          : { pointLimit: 15, roundDurationMinutes: 10 },
      resultEntryMode: resultFormat === 'classic_2x2' ? 'after_game' : 'live_lite',
    });
    const validationError = validatePlayPostInput(input);
    if (validationError) return { ok: false, reply: validationError };
    const posts = await createPlayPosts(actor, input);
    const post = posts[0];
    if (!post) return { ok: false, reply: 'Не удалось создать черновик.' };
    const startsAtLabel = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Yekaterinburg',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(post.startsAt));
    const perPlayer = Math.round(3500 / capacity);
    const modeLabel = ratingMode === 'rated' ? '🏆 На рейтинг' : '🎈 Обычная';
    return {
      ok: true,
      status: 'draft_created',
      reply: `Черновик «${title}» создан на ${startsAtLabel}. ${modeLabel}. Площадка: ${String(venue.name)}. Корт: 3500 ₽ · ≈${perPlayer} ₽ с игрока при полном составе.`,
      buttons: [
        [{ text: '✏️ Проверить и опубликовать', url: draftLink(post.id) }],
        [{ text: '➕ Создать ещё', callbackData: 'create:menu' }],
      ],
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function confirmGameAttendanceFromTelegram(
  telegramUserId: string,
  postId: string
): Promise<TelegramGameActionResult> {
  if (!UUID_RE.test(postId)) return { ok: false, reply: 'Некорректная игра.' };
  const userId = await linkedUserId(telegramUserId);
  if (!userId) return { ok: false, reply: 'Telegram не привязан к аккаунту LPVOLLEY.' };
  try {
    const result = await respondPlayAttendance(userId, postId, 'going');
    return { ok: true, status: result.status, reply: 'Присутствие подтверждено — организатор видит, что ты будешь ✅' };
  } catch (error) {
    if (error instanceof PlayServiceError && error.status === 404) {
      return joinGameFromTelegram(telegramUserId, postId);
    }
    return actionError(error);
  }
}

export async function respondGameInviteFromTelegram(
  telegramUserId: string,
  postId: string,
  action: 'accept' | 'decline'
): Promise<TelegramGameActionResult> {
  if (!UUID_RE.test(postId)) return { ok: false, reply: 'Некорректная игра.' };
  const userId = await linkedUserId(telegramUserId);
  if (!userId) return { ok: false, reply: 'Telegram не привязан к аккаунту LPVOLLEY.' };
  const invite = await getPool().query(
    `SELECT id::text FROM play_invites
      WHERE post_id = $1::uuid AND to_user_id = $2 AND status = 'sent'
      ORDER BY created_at DESC
      LIMIT 1`,
    [postId, userId]
  );
  const inviteId = String(invite.rows[0]?.id || '');
  if (!inviteId) {
    return { ok: false, status: 'not_found', reply: 'Приглашение уже обработано или больше не действует.' };
  }
  try {
    const result = await respondPlayInvite(userId, inviteId, action);
    if (result.status === 'accepted') {
      return {
        ok: true,
        status: result.participantStatus,
        reply: result.participantStatus === 'reserve'
          ? 'Приглашение принято — пока ты в резерве ⏳'
          : 'Приглашение принято — ты в составе ✅',
      };
    }
    if (result.status === 'declined') {
      return { ok: true, status: result.status, reply: 'Приглашение отклонено.' };
    }
    return { ok: false, status: result.status, reply: 'Приглашение больше не действует.' };
  } catch (error) {
    return actionError(error);
  }
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
    const post = await getPool().query(
      `SELECT starts_at, status FROM play_posts WHERE id = $1::uuid LIMIT 1`,
      [postId]
    );
    if (!post.rows[0]) return { ok: false, reply: 'Игра не найдена.' };
    if (String(post.rows[0].status) !== 'published' || new Date(post.rows[0].starts_at).getTime() <= Date.now()) {
      return { ok: false, reply: 'Самостоятельно отказаться можно только до начала опубликованной игры.' };
    }
    try {
      await respondPlayAttendance(userId, postId, 'not_going');
    } catch (error) {
      if (!(error instanceof PlayServiceError) || error.status !== 404) throw error;
      await cancelPlayJoin(userId, postId);
    }
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
        AND pp.archived_at IS NULL
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
