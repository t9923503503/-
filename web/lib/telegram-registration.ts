import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import {
  formatTelegramConfirmationCode,
  hashTelegramConfirmationCode,
  isTelegramWebAuthUserAllowed,
} from '@/lib/telegram-web-auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEB_INTENT_RE = /^[A-Za-z0-9_-]{20,64}$/;

class TelegramClaimReviewError extends Error {}

export interface TelegramButton {
  text: string;
  callbackData?: string;
  url?: string;
}

export interface TelegramFlowResult {
  ok: boolean;
  reply: string;
  buttons?: TelegramButton[][];
  requestContact?: boolean;
  removeKeyboard?: boolean;
  status?: string;
}

function cleanTelegramId(value: unknown): string {
  const id = String(value ?? '').trim();
  return /^[1-9]\d*$/.test(id) ? id : '';
}

function telegramBetaClosed(): TelegramFlowResult {
  return {
    ok: false,
    status: 'beta_closed',
    reply: 'Анкета игрока в боте временно недоступна. Попробуйте ещё раз позже.',
  };
}

function telegramPlayerOnboardingAvailable(): boolean {
  return true;
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function telegramDisplayName(firstNameRaw: unknown, lastNameRaw: unknown, usernameRaw: unknown): string {
  const firstName = normalizeName(firstNameRaw);
  const lastName = normalizeName(lastNameRaw);
  const fullName = normalizeName(`${firstName} ${lastName}`);
  if (fullName) return fullName;
  const username = String(usernameRaw ?? '').trim().replace(/^@/, '').slice(0, 64);
  return username ? `@${username}` : 'Игрок Telegram';
}

function siteBaseUrl(): string {
  const configured = String(process.env.SITE_BASE_URL || 'https://lpvolley.ru').trim();
  try {
    const url = new URL(configured);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // Fall through to the canonical production origin.
  }
  return 'https://lpvolley.ru';
}

function authenticatedSiteUrl(returnTo: string): string {
  return `${siteBaseUrl()}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function ensureTelegramAccount(
  client: PoolClient,
  telegramUserId: string,
  privateChatId: string,
  profile: { firstName?: unknown; lastName?: unknown; username?: unknown }
): Promise<{ id: number; fullName: string; playerId: string | null }> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `telegram-account:${telegramUserId}`,
  ]);
  const existing = await client.query(
    `SELECT id, full_name, player_id
       FROM users
      WHERE telegram_user_id = $1
      LIMIT 1
      FOR UPDATE`,
    [telegramUserId]
  );
  const displayName = telegramDisplayName(profile.firstName, profile.lastName, profile.username);

  if (existing.rowCount) {
    const user = existing.rows[0];
    const updated = await client.query(
      `UPDATE users
          SET telegram_user_id = $2,
              telegram_chat_id = $2,
              telegram_private_chat_id = $3,
              full_name = CASE
                WHEN NULLIF(trim(COALESCE(full_name, '')), '') IS NULL THEN $4
                ELSE full_name
              END,
              telegram_onboarding_status = CASE
                WHEN player_id IS NOT NULL THEN 'approved'
                ELSE COALESCE(NULLIF(telegram_onboarding_status, ''), 'legacy')
              END
        WHERE id = $1
        RETURNING id, full_name, player_id::text`,
      [Number(user.id), telegramUserId, privateChatId, displayName]
    );
    return {
      id: Number(updated.rows[0].id),
      fullName: String(updated.rows[0].full_name || displayName),
      playerId: updated.rows[0].player_id ? String(updated.rows[0].player_id) : null,
    };
  }

  const created = await client.query(
    `INSERT INTO users (
       email, password_hash, full_name, nickname, telegram_chat_id,
       telegram_user_id, telegram_private_chat_id, telegram_onboarding_status
     ) VALUES (NULL, NULL, $1, NULL, $2, $2, $3, 'legacy')
     RETURNING id, full_name, player_id::text`,
    [displayName, telegramUserId, privateChatId]
  );
  return {
    id: Number(created.rows[0].id),
    fullName: String(created.rows[0].full_name || displayName),
    playerId: created.rows[0].player_id ? String(created.rows[0].player_id) : null,
  };
}

function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return '';
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+${digits}`;
}

async function sessionUpsert(telegramUserId: string, privateChatId: string, step: string, data: object): Promise<void> {
  await getPool().query(
    `INSERT INTO telegram_onboarding_sessions (telegram_user_id, private_chat_id, step, data, expires_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now() + interval '24 hours', now())
     ON CONFLICT (telegram_user_id) DO UPDATE SET
       private_chat_id = EXCLUDED.private_chat_id,
       step = EXCLUDED.step,
       data = EXCLUDED.data,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()`,
    [telegramUserId, privateChatId, step, JSON.stringify(data)]
  );
}

async function loadSession(telegramUserId: string): Promise<{ step: string; data: Record<string, unknown> } | null> {
  const { rows } = await getPool().query(
    `SELECT step, data FROM telegram_onboarding_sessions
      WHERE telegram_user_id = $1 AND expires_at > now() LIMIT 1`,
    [telegramUserId]
  );
  return rows[0] ? { step: String(rows[0].step), data: rows[0].data ?? {} } : null;
}

export async function telegramHome(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Личный кабинет доступен только в приватном чате с ботом.' };
  }
  const { rows } = await getPool().query(
    `SELECT u.id, u.full_name, u.player_id, u.telegram_onboarding_status,
            pc.status AS claim_status
       FROM users u
       LEFT JOIN LATERAL (
         SELECT status FROM player_claims WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
       ) pc ON true
      WHERE u.telegram_user_id = $1
      LIMIT 1`,
    [telegramUserId]
  );
  const user = rows[0];
  const betaAllowed = isTelegramWebAuthUserAllowed(telegramUserId);
  if (!betaAllowed) {
    if (!user) {
      return {
        ok: true,
        status: 'guest',
        reply: 'Привет! Здесь можно смотреть ближайшие игры и турниры LPVOLLEY. Для регистрации и входа откройте личный чат с ботом.',
        buttons: [[{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }]],
      };
    }
    if (!user.player_id) {
      const claimPending = String(user.claim_status || '') === 'pending';
      return {
        ok: true,
        status: claimPending ? 'pending' : 'account_ready',
        reply: claimPending
          ? `👤 ${user.full_name}\nСуществующая заявка на карточку рассматривается организатором.`
          : `👤 ${user.full_name}\nTelegram-уведомления доступны для уже связанного аккаунта. Откройте личный чат с ботом для регистрации и входа.`,
        buttons: claimPending
          ? [
              [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
              [{ text: '⏳ Обновить статус', callbackData: 'home' }],
              [{ text: '❌ Отменить заявку', callbackData: 'reg:cancel' }],
              [{ text: '🎮 Смотреть игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
              [{ text: '📋 Мои записи', callbackData: 'registrations' }],
            ]
          : [
              [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
              [{ text: '🎮 Смотреть игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
              [{ text: '📋 Мои записи', callbackData: 'registrations' }],
            ],
      };
    }
    return {
      ok: true,
      status: 'approved',
      reply: `С возвращением, ${user.full_name}! Карточка игрока подтверждена ✅`,
      buttons: [
        [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
        [{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
        [{ text: '📋 Мои записи', callbackData: 'registrations' }, { text: '👤 Мой профиль', callbackData: 'profile' }],
      ],
    };
  }
  if (!telegramPlayerOnboardingAvailable()) {
    if (!user) {
      return {
        ok: true,
        status: 'owner_beta',
        reply: 'Вход через Telegram доступен. Начни его на странице входа сайта.',
        buttons: [
          [{ text: '🌐 Открыть вход', callbackData: 'web:login' }],
          [{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
        ],
      };
    }
    if (!user.player_id) {
      const claimPending = String(user.claim_status || '') === 'pending';
      return {
        ok: true,
        status: claimPending ? 'pending' : 'account_ready',
        reply: claimPending
          ? `👤 ${user.full_name}\nСуществующая заявка на карточку рассматривается организатором.`
          : `👤 ${user.full_name}\nАккаунт готов к входу через Telegram.`,
        buttons: [
          [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
          [{ text: '🌐 Войти на сайт', callbackData: 'web:login' }],
          ...(claimPending ? [[{ text: '❌ Отменить заявку', callbackData: 'reg:cancel' }]] : []),
          [{ text: '🎮 Смотреть игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
          [{ text: '📋 Мои записи', callbackData: 'registrations' }],
        ],
      };
    }
    return {
      ok: true,
      status: 'approved',
      reply: `С возвращением, ${user.full_name}! Карточка игрока подтверждена ✅`,
      buttons: [
        [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
        [{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
        [{ text: '📋 Мои записи', callbackData: 'registrations' }, { text: '👤 Мой профиль', callbackData: 'profile' }],
        [{ text: '🌐 Войти на сайт', callbackData: 'web:login' }],
      ],
    };
  }
  if (!user) {
    return {
      ok: true,
      status: 'guest',
      reply: 'Привет! Я помогу зарегистрироваться в LPVOLLEY, найти твою карточку и записываться на игры и турниры прямо здесь.',
      buttons: [
        [{ text: '🏐 Зарегистрироваться', callbackData: 'reg:start' }],
        [{ text: '🔗 У меня уже есть аккаунт', url: 'https://lpvolley.ru/profile' }],
        [{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
      ],
    };
  }
  if (!user.player_id) {
    const claimStatus = String(user.claim_status || '');
    const claimPending = claimStatus === 'pending';
    return {
      ok: true,
      status: claimPending ? 'pending' : 'account_ready',
      reply: claimPending
        ? `👤 ${user.full_name}\nTelegram-аккаунт готов. Заявка на карточку игрока рассматривается организатором.`
        : `👤 ${user.full_name}\nTelegram-аккаунт готов. Можно войти на сайт без email и пароля. Карточку игрока запроси здесь — привязку подтвердит организатор.`,
      buttons: claimPending
        ? [
            [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
            [{ text: '🌐 Войти на сайт', callbackData: 'web:login' }],
            [{ text: '⏳ Обновить статус', callbackData: 'home' }],
            [{ text: '❌ Отменить заявку', callbackData: 'reg:cancel' }],
            [{ text: '🎮 Смотреть игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
            [{ text: '📋 Мои записи', callbackData: 'registrations' }],
          ]
        : [
            [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
            [{ text: '🌐 Войти на сайт', callbackData: 'web:login' }],
            [{ text: '🏐 Привязать карточку в боте', callbackData: 'reg:start' }],
            [{ text: '🎮 Смотреть игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
            [{ text: '📋 Мои записи', callbackData: 'registrations' }],
          ],
    };
  }
  return {
    ok: true,
    status: 'approved',
    reply: `С возвращением, ${user.full_name}! Карточка игрока подтверждена ✅`,
    buttons: [
      [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
      [{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
      [{ text: '📋 Мои записи', callbackData: 'registrations' }, { text: '👤 Мой профиль', callbackData: 'profile' }],
      [{ text: '🌐 Войти на сайт', callbackData: 'web:login' }],
    ],
  };
}

export async function beginTelegramRegistration(telegramUserIdRaw: unknown, privateChatIdRaw: unknown): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Регистрация доступна только в личном чате с ботом.' };
  }
  if (!telegramPlayerOnboardingAvailable() || !isTelegramWebAuthUserAllowed(telegramUserId)) return telegramBetaClosed();
  const existing = await getPool().query(
    `SELECT u.id, u.player_id,
            EXISTS (
              SELECT 1 FROM player_claims pc
               WHERE pc.user_id = u.id AND pc.status = 'pending'
            ) AS has_pending_claim
       FROM users u
      WHERE u.telegram_user_id = $1
      LIMIT 1`,
    [telegramUserId]
  );
  if (existing.rows[0]?.player_id || existing.rows[0]?.has_pending_claim) {
    return telegramHome(telegramUserId, privateChatId);
  }
  await sessionUpsert(telegramUserId, privateChatId, 'name', {});
  return { ok: true, reply: 'Напиши имя и фамилию одной строкой. Например: Иван Петров.' };
}

export async function telegramRegistrationText(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown,
  textRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Анкету можно заполнять только в личном чате.' };
  }
  if (!telegramPlayerOnboardingAvailable() || !isTelegramWebAuthUserAllowed(telegramUserId)) return telegramBetaClosed();
  const session = await loadSession(telegramUserId);
  if (!session) return { ok: false, reply: 'Анкета не активна. Нажми «Зарегистрироваться».', buttons: [[{ text: '🏐 Зарегистрироваться', callbackData: 'reg:start' }]] };
  if (session.step !== 'name') return { ok: false, reply: 'Используй кнопки под последним сообщением.' };
  const fullName = normalizeName(textRaw);
  if (fullName.length < 5 || fullName.split(' ').length < 2) {
    return { ok: false, reply: 'Нужно указать имя и фамилию. Например: Иван Петров.' };
  }
  await sessionUpsert(telegramUserId, privateChatId, 'gender', { fullName });
  return {
    ok: true,
    reply: `Записал: ${fullName}. Теперь выбери пол — он нужен для рейтинга и форматов турниров.`,
    buttons: [[{ text: 'Мужчина', callbackData: 'reg:gender:M' }, { text: 'Женщина', callbackData: 'reg:gender:W' }]],
  };
}

export async function telegramRegistrationGender(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown,
  genderRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  const gender = String(genderRaw) === 'W' ? 'W' : String(genderRaw) === 'M' ? 'M' : '';
  if (!telegramPlayerOnboardingAvailable() || !isTelegramWebAuthUserAllowed(telegramUserId)) return telegramBetaClosed();
  const session = await loadSession(telegramUserId);
  if (!session || session.step !== 'gender' || !gender || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Кнопка устарела. Начни регистрацию заново.' };
  }
  await sessionUpsert(telegramUserId, privateChatId, 'contact', { ...session.data, gender });
  return {
    ok: true,
    reply: 'Поделись своим контактом кнопкой ниже. Номер увидят только организаторы LPVOLLEY.',
    requestContact: true,
  };
}

export async function telegramRegistrationContact(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown,
  contactUserIdRaw: unknown,
  phoneRaw: unknown,
  usernameRaw?: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  const contactUserId = cleanTelegramId(contactUserIdRaw);
  const phone = normalizePhone(phoneRaw);
  if (!telegramPlayerOnboardingAvailable() || !isTelegramWebAuthUserAllowed(telegramUserId)) return telegramBetaClosed();
  const session = await loadSession(telegramUserId);
  if (!session || session.step !== 'contact' || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Анкета устарела. Начни регистрацию заново.' };
  }
  if (contactUserId !== telegramUserId || !phone) {
    return { ok: false, reply: 'Нужно отправить именно свой контакт встроенной кнопкой Telegram.', requestContact: true };
  }
  const fullName = normalizeName(session.data.fullName);
  const gender = session.data.gender === 'W' ? 'W' : 'M';
  const username = String(usernameRaw ?? '').replace(/^@/, '').slice(0, 64);
  const { rows } = await getPool().query(
    `SELECT id::text, name, COALESCE(photo_url, '') AS photo_url, tournaments_played
       FROM players
      WHERE status = 'active' AND gender = $2
        AND (lower(name) = lower($1) OR similarity(name, $1) > 0.28)
      ORDER BY (lower(name) = lower($1)) DESC, similarity(name, $1) DESC, tournaments_played DESC
      LIMIT 5`,
    [fullName, gender]
  );
  await sessionUpsert(telegramUserId, privateChatId, 'player', { fullName, gender, phone, username });
  const buttons: TelegramButton[][] = rows.map((row) => [{
    text: `Это я: ${String(row.name).slice(0, 36)} (${Number(row.tournaments_played || 0)} турн.)`,
    callbackData: `reg:player:${row.id}`,
  }]);
  buttons.push([{ text: '➕ Моей карточки нет', callbackData: 'reg:player:new' }]);
  return {
    ok: true,
    removeKeyboard: true,
    reply: rows.length
      ? 'Нашёл похожие карточки. Выбери свою — организатор проверит привязку.'
      : 'Похожих карточек не нашлось. Создадим новую после проверки организатором.',
    buttons,
  };
}

export async function submitTelegramPlayerClaim(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown,
  playerIdRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  if (!telegramPlayerOnboardingAvailable() || !isTelegramWebAuthUserAllowed(telegramUserId)) return telegramBetaClosed();
  const session = await loadSession(telegramUserId);
  if (!session || session.step !== 'player' || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Анкета устарела. Начни регистрацию заново.' };
  }
  const playerId = String(playerIdRaw ?? '') === 'new' ? null : String(playerIdRaw ?? '');
  if (playerId && !UUID_RE.test(playerId)) return { ok: false, reply: 'Некорректная карточка игрока.' };
  const fullName = normalizeName(session.data.fullName);
  const gender = session.data.gender === 'W' ? 'W' : 'M';
  const phone = normalizePhone(session.data.phone);
  const username = String(session.data.username ?? '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let candidateName = 'Нужно создать новую карточку';
    const userResult = await client.query(
      `INSERT INTO users (
         email, password_hash, full_name, nickname, telegram_chat_id,
         telegram_user_id, telegram_private_chat_id, phone, gender, telegram_onboarding_status
       ) VALUES (NULL, NULL, $1, NULL, $2, $2, $2, $3, $4, 'pending')
       ON CONFLICT (telegram_user_id) WHERE telegram_user_id ~ '^[1-9][0-9]*$'
       DO UPDATE SET full_name = EXCLUDED.full_name, telegram_private_chat_id = EXCLUDED.telegram_private_chat_id,
                     telegram_chat_id = EXCLUDED.telegram_chat_id, phone = EXCLUDED.phone,
                     gender = EXCLUDED.gender, telegram_onboarding_status = 'pending'
       RETURNING id, player_id::text`,
      [fullName, telegramUserId, phone, gender]
    );
    const userId = Number(userResult.rows[0].id);
    if (userResult.rows[0].player_id) {
      await client.query('ROLLBACK');
      return {
        ok: true,
        status: 'approved',
        reply: 'Карточка игрока уже подтверждена.',
        buttons: [[{ text: '⬅️ Открыть меню', callbackData: 'home' }]],
      };
    }
    if (playerId) {
      const candidate = await client.query(
        `SELECT name
           FROM players
          WHERE id = $1 AND status = 'active' AND gender = $2
          FOR SHARE`,
        [playerId, gender]
      );
      if (!candidate.rowCount) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          reply: 'Карточка недоступна или не совпадает пол. Начни регистрацию заново.',
          buttons: [[{ text: '🏐 Начать заново', callbackData: 'reg:start' }]],
        };
      }
      candidateName = `Карточка: ${String(candidate.rows[0].name)}`;
    }
    await client.query(
      `WITH cancelled_claims AS (
         UPDATE player_claims
            SET status = 'cancelled', updated_at = now()
          WHERE user_id = $1 AND status = 'pending'
          RETURNING id
       )
       UPDATE telegram_admin_outbox AS outbox
          SET sent_at = COALESCE(outbox.sent_at, now())
         FROM cancelled_claims AS claim
        WHERE outbox.sent_at IS NULL
          AND outbox.dedup_key = 'player_claim:' || claim.id::text`,
      [userId]
    );
    const claimResult = await client.query(
      `INSERT INTO player_claims (user_id, requested_player_id, proposed_name, gender, phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, playerId, fullName, gender, phone]
    );
    const claimId = String(claimResult.rows[0].id);
    await client.query(
      `INSERT INTO telegram_admin_outbox (kind, text, callback_data, dedup_key)
       VALUES ('player_claim', $1, $2::jsonb, $3) ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `🏐 Новая заявка LPVOLLEY\nИгрок: ${fullName}\nПол: ${gender}\nТелефон: ${phone}\nTelegram: ${username ? `@${username}` : telegramUserId}\n${candidateName}`,
        JSON.stringify({ approve: `ac:a:${claimId}`, reject: `ac:r:${claimId}` }),
        `player_claim:${claimId}`,
      ]
    );
    await client.query(`DELETE FROM telegram_onboarding_sessions WHERE telegram_user_id = $1`, [telegramUserId]);
    await client.query('COMMIT');
    return {
      ok: true,
      status: 'pending',
      reply: 'Анкета отправлена ✅ Организатор проверит карточку, а я пришлю результат сюда.',
      buttons: [[{ text: '⏳ Проверить статус', callbackData: 'home' }], [{ text: '🎮 Игры', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }]],
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelTelegramClaim(telegramUserIdRaw: unknown): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query(
      `SELECT id
         FROM users
        WHERE telegram_user_id = $1
        ORDER BY id
        FOR UPDATE`,
      [telegramUserId]
    );
    const userId = Number(accountResult.rows[0]?.id || 0);
    if (!userId) {
      await client.query('ROLLBACK');
      return {
        ok: true,
        reply: 'Активной заявки нет.',
        buttons: [[{ text: '🏐 Начать заново', callbackData: 'reg:start' }]],
      };
    }

    const result = await client.query(
      `WITH cancelled_claims AS (
         UPDATE player_claims
            SET status = 'cancelled', updated_at = now()
          WHERE user_id = $1 AND status = 'pending'
          RETURNING id
       ), retired_outbox AS (
         UPDATE telegram_admin_outbox AS outbox
            SET sent_at = COALESCE(outbox.sent_at, now())
           FROM cancelled_claims AS claim
          WHERE outbox.sent_at IS NULL
            AND outbox.dedup_key = 'player_claim:' || claim.id::text
          RETURNING outbox.id
       )
       SELECT COUNT(*)::int AS cancelled_count
         FROM cancelled_claims`,
      [userId]
    );
    const cancelledCount = Number(result.rows[0]?.cancelled_count || 0);
    if (cancelledCount) {
      await client.query(
        `UPDATE users
            SET telegram_onboarding_status = CASE
              WHEN player_id IS NOT NULL THEN 'approved'
              ELSE 'rejected'
            END
          WHERE id = $1`,
        [userId]
      );
    }
    await client.query('COMMIT');
    return {
      ok: true,
      reply: cancelledCount ? 'Заявка отменена.' : 'Активной заявки нет.',
      buttons: [[{ text: '🏐 Начать заново', callbackData: 'reg:start' }]],
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function resolveClaimPlayer(client: PoolClient, claim: Record<string, unknown>): Promise<string> {
  if (claim.requested_player_id) {
    const playerId = String(claim.requested_player_id);
    const player = await client.query(
      `SELECT id
         FROM players
        WHERE id = $1 AND status = 'active' AND gender = $2
        FOR UPDATE`,
      [playerId, claim.gender]
    );
    if (!player.rowCount) {
      throw new TelegramClaimReviewError('Карточка недоступна или пол карточки не совпадает с анкетой.');
    }
    const occupied = await client.query(
      `SELECT account_id
         FROM (
           SELECT id AS account_id
             FROM users
            WHERE player_id::text = $1 AND id <> $2
           UNION ALL
           SELECT requester_user_id AS account_id
             FROM player_requests
            WHERE tournament_id IS NULL
              AND status = 'approved'
              AND approved_player_id::text = $1
              AND requester_user_id <> $2
         ) conflicts
        LIMIT 1`,
      [playerId, claim.user_id]
    );
    if (occupied.rowCount) throw new TelegramClaimReviewError('Эта карточка уже привязана к другому аккаунту.');
    await client.query(`UPDATE players SET phone = COALESCE(NULLIF(phone, ''), $2), updated_at = now() WHERE id = $1`, [playerId, claim.phone]);
    return playerId;
  }
  const created = await client.query(
    `INSERT INTO players (name, gender, phone, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (lower(trim(name)), gender) DO NOTHING
     RETURNING id::text`,
    [claim.proposed_name, claim.gender, claim.phone]
  );
  if (!created.rowCount) {
    throw new TelegramClaimReviewError(
      'Карточка с таким именем уже существует. Отклони заявку и попроси игрока выбрать существующую карточку.'
    );
  }
  return String(created.rows[0].id);
}

async function syncApprovedPlayerRequest(
  client: PoolClient,
  userId: number,
  playerId: string,
  claim: Record<string, unknown>
): Promise<void> {
  const existing = await client.query(
    `SELECT id
       FROM player_requests
      WHERE requester_user_id = $1
        AND tournament_id IS NULL
      ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [userId]
  );
  const existingId = String(existing.rows[0]?.id || '');
  if (existingId) {
    await client.query(
      `UPDATE player_requests
          SET name = $2,
              gender = $3,
              phone = $4,
              status = 'approved',
              approved_player_id = $5,
              reviewed_at = now()
        WHERE id = $1`,
      [existingId, claim.proposed_name, claim.gender, claim.phone, playerId]
    );
    await client.query(
      `DELETE FROM player_requests
        WHERE requester_user_id = $1
          AND tournament_id IS NULL
          AND id <> $2`,
      [userId, existingId]
    );
    return;
  }
  await client.query(
    `INSERT INTO player_requests (
       name, gender, phone, tournament_id, status,
       approved_player_id, requester_user_id, reviewed_at
     ) VALUES ($1, $2, $3, NULL, 'approved', $4, $5, now())`,
    [claim.proposed_name, claim.gender, claim.phone, playerId, userId]
  );
}

export async function reviewTelegramClaim(claimIdRaw: unknown, decisionRaw: unknown, reviewerRaw: unknown): Promise<TelegramFlowResult> {
  const claimId = String(claimIdRaw ?? '');
  const decision = String(decisionRaw ?? '');
  const reviewer = String(reviewerRaw ?? '').trim().slice(0, 80);
  if (!UUID_RE.test(claimId) || !['approve', 'reject'].includes(decision) || !reviewer) {
    return { ok: false, reply: 'Некорректное действие администратора.' };
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const claimOwnerResult = await client.query(
      `SELECT user_id FROM player_claims WHERE id = $1 LIMIT 1`,
      [claimId]
    );
    const claimUserId = Number(claimOwnerResult.rows[0]?.user_id || 0);
    if (!claimUserId) {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Заявка уже обработана.' };
    }
    const userResult = await client.query(
      `SELECT telegram_private_chat_id, telegram_chat_id, full_name
         FROM users WHERE id = $1
         FOR UPDATE`,
      [claimUserId]
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Аккаунт заявки не найден.' };
    }
    const claimResult = await client.query(
      `SELECT * FROM player_claims WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [claimId, claimUserId]
    );
    const claim = claimResult.rows[0];
    if (!claim || claim.status !== 'pending') {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Заявка уже обработана.' };
    }
    const notificationChatId = String(user.telegram_private_chat_id || user.telegram_chat_id || '');
    if (decision === 'approve') {
      const playerId = await resolveClaimPlayer(client, claim);
      await client.query(
        `UPDATE player_claims
            SET status = 'cancelled', updated_at = now()
          WHERE user_id = $1 AND status = 'approved' AND id <> $2`,
        [claim.user_id, claimId]
      );
      await client.query(
        `UPDATE users SET player_id = $2, telegram_onboarding_status = 'approved' WHERE id = $1`,
        [claim.user_id, playerId]
      );
      await client.query(
        `UPDATE player_claims SET status = 'approved', requested_player_id = $2,
          reviewed_by = $3, reviewed_at = now(), updated_at = now() WHERE id = $1`,
        [claimId, playerId, reviewer]
      );
      await syncApprovedPlayerRequest(client, Number(claim.user_id), playerId, claim);
      if (/^[1-9]\d*$/.test(notificationChatId)) {
        await client.query(
          `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
           VALUES ($1, 'player_claim_approved', $2, $3) ON CONFLICT (dedup_key) DO NOTHING`,
          [notificationChatId, `Твоя карточка LPVOLLEY подтверждена ✅\nТеперь можно записываться на игры и турниры прямо в боте.`, `player_claim_approved:${claimId}`]
        );
      }
    } else {
      await client.query(
        `UPDATE users
            SET telegram_onboarding_status = CASE
              WHEN player_id IS NOT NULL THEN 'approved'
              ELSE 'rejected'
            END
          WHERE id = $1`,
        [claim.user_id]
      );
      await client.query(
        `UPDATE player_claims SET status = 'rejected', reviewed_by = $2,
          reviewed_at = now(), updated_at = now() WHERE id = $1`,
        [claimId, reviewer]
      );
      if (/^[1-9]\d*$/.test(notificationChatId)) {
        await client.query(
          `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
           VALUES ($1, 'player_claim_rejected', $2, $3) ON CONFLICT (dedup_key) DO NOTHING`,
          [notificationChatId, `Заявка на карточку отклонена. Проверь имя или свяжись с организатором и отправь анкету ещё раз.`, `player_claim_rejected:${claimId}`]
        );
      }
    }
    await client.query('COMMIT');
    return { ok: true, reply: decision === 'approve' ? `✅ ${user.full_name}: карточка подтверждена.` : `❌ ${user.full_name}: заявка отклонена.` };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof TelegramClaimReviewError) {
      return { ok: false, reply: error.message };
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function listTelegramAdminOutbox(limit = 20): Promise<Array<{ id: number; text: string; callbacks: Record<string, string> }>> {
  const { rows } = await getPool().query(
    `SELECT outbox.id, outbox.text, outbox.callback_data
       FROM telegram_admin_outbox AS outbox
      WHERE outbox.sent_at IS NULL
        AND (
          outbox.kind <> 'player_claim'
          OR EXISTS (
            SELECT 1
              FROM player_claims AS claim
             WHERE claim.status = 'pending'
               AND outbox.dedup_key = 'player_claim:' || claim.id::text
          )
        )
      ORDER BY outbox.created_at ASC
      LIMIT $1`,
    [Math.max(1, Math.min(limit, 50))]
  );
  return rows.map((row) => ({ id: Number(row.id), text: String(row.text), callbacks: row.callback_data ?? {} }));
}

export async function ackTelegramAdminOutbox(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await getPool().query(`UPDATE telegram_admin_outbox SET sent_at = now() WHERE id = ANY($1::bigint[])`, [ids]);
}

export async function startTelegramWebLogin(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown,
  intentTokenRaw: unknown,
  profile: { firstName?: unknown; lastName?: unknown; username?: unknown } = {}
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  const intentToken = String(intentTokenRaw ?? '').trim();
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Вход доступен только в личном чате с ботом.' };
  }
  if (!isTelegramWebAuthUserAllowed(telegramUserId)) {
    return {
      ok: false,
      reply: 'Вход через Telegram сейчас недоступен для этого аккаунта.',
    };
  }
  if (!WEB_INTENT_RE.test(intentToken)) {
    return { ok: false, reply: 'Ссылка входа повреждена. Вернись на сайт и нажми «Продолжить в Telegram» ещё раз.' };
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const intentResult = await client.query(
      `SELECT pending_telegram_user_id,
              confirmed_user_id, confirmed_telegram_user_id
         FROM telegram_web_auth_intents
        WHERE token = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [intentToken]
    );
    if (!intentResult.rowCount) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reply: 'Ссылка входа истекла или уже использована. Вернись на сайт и нажми «Продолжить в Telegram» ещё раз.',
        buttons: [[{ text: '🌐 Вернуться на LPVOLLEY', url: `${siteBaseUrl()}/login` }]],
      };
    }

    const pendingTelegramUserId = String(intentResult.rows[0]?.pending_telegram_user_id || '');
    const confirmedTelegramUserId = String(
      intentResult.rows[0]?.confirmed_telegram_user_id || ''
    );
    if (confirmedTelegramUserId && confirmedTelegramUserId !== telegramUserId) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reply: 'Эта попытка входа уже подтверждена другим Telegram. Начни вход на сайте заново.',
      };
    }
    if (pendingTelegramUserId && pendingTelegramUserId !== telegramUserId) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reply: 'Эта попытка входа уже открыта в другом Telegram. Начни новую попытку на сайте.',
      };
    }

    if (confirmedTelegramUserId === telegramUserId) {
      await client.query('COMMIT');
      return {
        ok: true,
        status: 'telegram_confirmed',
        reply: 'Вход уже подтверждён ✅\nВернись в исходную вкладку браузера.',
      };
    }

    const confirmationCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const displayName = telegramDisplayName(profile.firstName, profile.lastName, profile.username);
    if (!pendingTelegramUserId) {
      const safeProfile = {
        firstName: normalizeName(profile.firstName),
        lastName: normalizeName(profile.lastName),
        username: String(profile.username ?? '').trim().replace(/^@/, '').slice(0, 64),
      };
      await client.query(
        `UPDATE telegram_web_auth_intents
            SET pending_telegram_user_id = $2,
                pending_private_chat_id = $2,
                pending_display_name = $3,
                pending_profile = $4::jsonb,
                confirmation_code_hash = $5,
                confirmation_attempts = 0,
                challenge_issued_at = now(),
                pending_at = now()
          WHERE token = $1
            AND pending_telegram_user_id IS NULL
            AND confirmed_telegram_user_id IS NULL
            AND used_at IS NULL`,
        [
          intentToken,
          telegramUserId,
          displayName,
          JSON.stringify(safeProfile),
          hashTelegramConfirmationCode(intentToken, confirmationCode),
        ]
      );
    } else {
      await client.query(
        `UPDATE telegram_web_auth_intents
            SET confirmation_code_hash = $2,
                confirmation_attempts = 0,
                challenge_issued_at = now()
          WHERE token = $1
            AND pending_telegram_user_id = $3
            AND confirmed_telegram_user_id IS NULL
            AND used_at IS NULL`,
        [intentToken, hashTelegramConfirmationCode(intentToken, confirmationCode), telegramUserId]
      );
    }
    await client.query('COMMIT');

    return {
      ok: true,
      status: 'confirmation_required',
      reply: `Код входа LPVOLLEY: ${formatTelegramConfirmationCode(confirmationCode)}\n\nВведи его только в исходной вкладке lpvolley.ru, если сам начал вход. Никому не сообщай код. Если ссылку прислал кто-то другой — отклони запрос.`,
      buttons: [
        [{ text: '❌ Это не я', callbackData: `wl:r:${intentToken}` }],
      ],
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmTelegramWebLogin(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown,
  intentTokenRaw: unknown,
  decisionRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  const intentToken = String(intentTokenRaw ?? '').trim();
  const decision = decisionRaw === 'reject' ? 'reject' : '';
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Подтверждение входа доступно только в личном чате.' };
  }
  if (!WEB_INTENT_RE.test(intentToken) || !decision) {
    return { ok: false, reply: 'Некорректное подтверждение входа.' };
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const intentResult = await client.query(
      `SELECT pending_telegram_user_id, pending_private_chat_id
         FROM telegram_web_auth_intents
        WHERE token = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [intentToken]
    );
    const intent = intentResult.rows[0];
    if (!intent) {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Попытка входа истекла или уже завершена.' };
    }
    if (
      String(intent.pending_telegram_user_id || '') !== telegramUserId
      || String(intent.pending_private_chat_id || '') !== telegramUserId
    ) {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Этот запрос входа был открыт другим Telegram.' };
    }

    await client.query(
      `UPDATE telegram_web_auth_intents SET used_at = now()
        WHERE token = $1 AND used_at IS NULL`,
      [intentToken]
    );
    await client.query('COMMIT');
    return {
      ok: true,
      status: 'rejected',
      reply: 'Запрос входа отклонён. Вход не выполнен.',
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createTelegramWebLogin(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Ссылка для входа выдаётся только в приватном чате с ботом.' };
  }
  if (!isTelegramWebAuthUserAllowed(telegramUserId)) {
    return {
      ok: false,
      reply: 'Вход через Telegram сейчас недоступен для этого аккаунта.',
    };
  }
  return {
    ok: true,
    reply: 'Безопасный вход начинается на сайте. Открой страницу входа, нажми «Продолжить в Telegram», затем вернись в исходную вкладку.',
    buttons: [[{ text: '🌐 Открыть вход LPVOLLEY', url: `${siteBaseUrl()}/login` }]],
  };
}

export async function telegramRegistrations(
  telegramUserIdRaw: unknown,
  privateChatIdRaw: unknown
): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const privateChatId = cleanTelegramId(privateChatIdRaw);
  if (!telegramUserId || telegramUserId !== privateChatId) {
    return { ok: false, reply: 'Мои записи доступны только в приватном чате с ботом.' };
  }
  const userResult = await getPool().query(
    `SELECT id, player_id FROM users WHERE telegram_user_id = $1 LIMIT 1`,
    [telegramUserId]
  );
  const user = userResult.rows[0];
  if (!user) return { ok: false, reply: 'Сначала зарегистрируйся в боте.', buttons: [[{ text: '🏐 Зарегистрироваться', callbackData: 'reg:start' }]] };
  const [games, invites, tournaments] = await Promise.all([
    getPool().query(
      `SELECT pp.id::text, pp.kind, pp.title, pp.starts_at, pp.ends_at, pp.status AS post_status,
              COALESCE(pp.rating_mode, 'rated') AS rating_mode,
              ppp.status AS participant_status,
              (po.owner_user_id = $1) AS is_organizer,
              pgr.id::text AS result_id, pgr.status AS result_status
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
         LEFT JOIN play_post_participants ppp
           ON ppp.post_id = pp.id AND ppp.user_id = $1
         LEFT JOIN play_game_results pgr ON pgr.post_id = pp.id
        WHERE pp.archived_at IS NULL
          AND pp.status IN ('draft', 'published', 'completed')
          AND (po.owner_user_id = $1 OR ppp.status IN ('pending', 'confirmed', 'reserve'))
          AND (
            pp.starts_at > now()
            OR (pp.ends_at > now() - interval '7 days' AND pp.status IN ('published', 'completed'))
          )
        ORDER BY
          CASE WHEN pp.starts_at > now() THEN 0 ELSE 1 END,
          pp.starts_at ASC
        LIMIT 12`,
      [user.id]
    ),
    getPool().query(
      `SELECT pi.id::text, pp.id::text AS post_id, pp.kind, pp.title, pp.starts_at,
              COALESCE(pp.rating_mode, 'rated') AS rating_mode
         FROM play_invites pi
         JOIN play_posts pp ON pp.id = pi.post_id
        WHERE pi.to_user_id = $1 AND pi.status = 'sent'
          AND pp.status = 'published' AND pp.starts_at > now()
        ORDER BY pp.starts_at ASC
        LIMIT 10`,
      [user.id]
    ),
    user.player_id ? getPool().query(
      `SELECT t.id::text, t.name, t.date, t.time, tp.is_waitlist
         FROM tournament_participants tp JOIN tournaments t ON t.id = tp.tournament_id
        WHERE tp.player_id = $1 AND t.date >= CURRENT_DATE
        ORDER BY t.date ASC, t.time ASC LIMIT 10`,
      [user.player_id]
    ) : Promise.resolve({ rows: [] }),
  ]);
  const lines = ['📋 Мои игры и записи'];
  const buttons: TelegramButton[][] = [];
  for (const invite of invites.rows) {
    const postId = String(invite.post_id);
    const date = new Date(invite.starts_at).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });
    const mode = String(invite.kind) === 'training'
      ? 'тренировка'
      : String(invite.rating_mode) === 'friendly' ? 'обычная' : 'на рейтинг';
    lines.push(`\n💌 ${invite.title}\n${date} · приглашение · ${mode}`);
    buttons.push([
      { text: '✅ Иду', callbackData: `invite:a:${postId}` },
      { text: '❌ Не смогу', callbackData: `invite:d:${postId}` },
    ]);
  }
  for (const game of games.rows) {
    const postId = String(game.id);
    const isPast = new Date(game.ends_at).getTime() <= Date.now();
    const isDraft = String(game.post_status) === 'draft';
    const mode = String(game.kind) === 'training'
      ? 'тренировка'
      : String(game.rating_mode) === 'friendly' ? 'обычная' : 'на рейтинг';
    const role = isDraft ? 'черновик' : game.is_organizer ? 'организую' : String(game.participant_status) === 'reserve' ? 'резерв' : 'участвую';
    lines.push(`\n🏐 ${game.title}\n${new Date(game.starts_at).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })} · ${role} · ${mode}`);
    if (isDraft && game.is_organizer) {
      buttons.push([{
        text: `✏️ Продолжить · ${String(game.title).slice(0, 24)}`,
        url: authenticatedSiteUrl(`/partner/manage?edit=${postId}`),
      }]);
    } else if (
      String(game.kind) === 'game'
      && isPast
      && !game.result_id
      && (game.is_organizer || String(game.participant_status) === 'confirmed')
    ) {
      buttons.push([{
        text: `✍️ Внести счёт · ${String(game.title).slice(0, 24)}`,
        url: authenticatedSiteUrl(`/partner/${postId}#result-entry`),
      }]);
    } else if (game.result_id && String(game.result_status) !== 'confirmed') {
      buttons.push([{
        text: game.is_organizer ? '✅ Проверить и утвердить счёт' : '🔎 Проверить счёт',
        url: authenticatedSiteUrl(`/partner/${postId}#result`),
      }]);
    } else if (!isPast && String(game.participant_status) === 'confirmed') {
      buttons.push([
        { text: '✅ Иду', callbackData: `attendance:y:${postId}` },
        { text: '❌ Не смогу', callbackData: `attendance:n:${postId}` },
      ]);
    } else {
      buttons.push([{ text: `Открыть · ${String(game.title).slice(0, 30)}`, url: `${siteBaseUrl()}/partner/${postId}` }]);
    }
  }
  for (const tournament of tournaments.rows) {
    lines.push(`\n🏆 ${tournament.name}\n${String(tournament.date).slice(0, 10)} ${tournament.time || ''} · ${tournament.is_waitlist ? 'лист ожидания' : 'основной состав'}`);
  }
  if (games.rows.length === 0 && invites.rows.length === 0 && tournaments.rows.length === 0) {
    lines.push('\nПока нет активных игр и будущих записей.');
  }
  buttons.push(
    [{ text: '➕ Создать игру', callbackData: 'create:menu' }],
    [{ text: '🎮 Найти игру', callbackData: 'games' }, { text: '🏆 Турниры', callbackData: 'tournaments' }],
    [{ text: '⬅️ Меню', callbackData: 'home' }]
  );
  return { ok: true, reply: lines.join('\n'), buttons };
}

export async function joinTournamentFromTelegram(telegramUserIdRaw: unknown, tournamentIdRaw: unknown): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const tournamentId = String(tournamentIdRaw ?? '');
  if (!UUID_RE.test(tournamentId)) return { ok: false, reply: 'Некорректный турнир.' };
  const userResult = await getPool().query(
    `SELECT id, player_id FROM users WHERE telegram_user_id = $1 LIMIT 1`,
    [telegramUserId]
  );
  const user = userResult.rows[0];
  if (!user?.player_id) return { ok: false, status: 'registration_required', reply: 'Сначала зарегистрируйся и подтверди карточку игрока.', buttons: [[{ text: '🏐 Зарегистрироваться', callbackData: 'reg:start' }]] };
  const { rows } = await getPool().query(`SELECT safe_register_player($1, $2) AS result`, [tournamentId, user.player_id]);
  const result = rows[0]?.result ?? {};
  return {
    ok: Boolean(result.ok),
    status: result.waitlist ? 'waitlist' : result.ok ? 'confirmed' : String(result.error || 'error'),
    reply: String(result.message || (result.ok ? 'Запись подтверждена ✅' : 'Не удалось записаться.')),
    buttons: result.ok ? [[{ text: '❌ Отменить запись', callbackData: `tleave:${tournamentId}` }]] : undefined,
  };
}

export async function leaveTournamentFromTelegram(telegramUserIdRaw: unknown, tournamentIdRaw: unknown): Promise<TelegramFlowResult> {
  const telegramUserId = cleanTelegramId(telegramUserIdRaw);
  const tournamentId = String(tournamentIdRaw ?? '');
  if (!UUID_RE.test(tournamentId)) return { ok: false, reply: 'Некорректный турнир.' };
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await client.query(
      `SELECT u.player_id, t.date, t.time, t.registration_closes_at
         FROM users u CROSS JOIN tournaments t
        WHERE u.telegram_user_id = $1 AND t.id = $2
        FOR UPDATE OF t`,
      [telegramUserId, tournamentId]
    );
    const data = row.rows[0];
    if (!data?.player_id) {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Запись не найдена.' };
    }
    const deadlineResult = await client.query(
      `SELECT COALESCE($1::timestamptz,
        (($2::date + COALESCE(NULLIF($3, '')::time, time '00:00')) AT TIME ZONE 'Asia/Yekaterinburg') - interval '24 hours') AS deadline`,
      [data.registration_closes_at, data.date, data.time]
    );
    if (new Date(deadlineResult.rows[0].deadline).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return { ok: false, status: 'deadline', reply: 'Дедлайн самостоятельной отмены прошёл. Напиши организатору в группе.' };
    }
    const removed = await client.query(
      `DELETE FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2 RETURNING is_waitlist`,
      [tournamentId, data.player_id]
    );
    if (!removed.rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, reply: 'Активная запись не найдена.' };
    }
    if (!removed.rows[0].is_waitlist) {
      await client.query(
        `UPDATE tournament_participants SET is_waitlist = false
          WHERE id = (SELECT id FROM tournament_participants
                       WHERE tournament_id = $1 AND is_waitlist = true
                       ORDER BY registered_at ASC LIMIT 1)`,
        [tournamentId]
      );
    }
    await client.query('COMMIT');
    return { ok: true, reply: 'Запись на турнир отменена.' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
