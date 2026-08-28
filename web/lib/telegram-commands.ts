// Общая логика команд бота: используется и webhook-маршрутом
// (/api/telegram/webhook), и локальным ботом-релеем через /api/telegram/agent.
import { getPool } from '@/lib/db';
import { importTelegramProfileAvatar } from '@/lib/profile-avatar-import';
import { isTelegramWebAuthUserAllowed } from '@/lib/telegram-web-auth';

export async function handleTgStart(
  chatId: string,
  payload: string,
  telegramUserId = chatId,
  privateChatId = chatId
): Promise<string> {
  const pool = getPool();

  if (!payload) {
    const res = await pool.query(
      'SELECT full_name FROM users WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    const name = res.rows[0]?.full_name as string | undefined;
    if (name) {
      return `С возвращением, ${name}! 🏐\nАккаунт привязан — уведомления об играх и турнирах будут приходить сюда.\n\nКоманды: /my — мой аккаунт, /unlink — отвязать Telegram.`;
    }
    if (!isTelegramWebAuthUserAllowed(telegramUserId)) {
      return (
        'Привет! Это бот LPVOLLEY.RU — пляжный волейбол в Сургуте 🏐\n\n' +
        'Здесь можно смотреть ближайшие игры и турниры. Для регистрации и входа на сайт откройте личный чат с ботом.'
      );
    }
    return (
      'Привет! Это бот LPVOLLEY.RU — пляжный волейбол в Сургуте 🏐\n\n' +
      'Чтобы получать уведомления и записываться на игры, привяжи аккаунт: ' +
      'зайди в личный кабинет на lpvolley.ru и нажми «Привязать Telegram».'
    );
  }

  if (
    !/^[1-9]\d*$/.test(telegramUserId) ||
    !/^[1-9]\d*$/.test(privateChatId) ||
    chatId !== privateChatId ||
    telegramUserId !== privateChatId
  ) {
    return 'Ссылку привязки можно использовать только в личном чате с ботом.';
  }
  if (!isTelegramWebAuthUserAllowed(telegramUserId)) {
    return 'Откройте личный чат с ботом, чтобы привязать Telegram к аккаунту.';
  }

  // Сначала узнаём владельца токена без блокировки token row, затем блокируем
  // account row. Единый порядок блокировок сериализует разные активные ссылки
  // одного аккаунта и не создаёт взаимную блокировку token -> user / user -> token.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenLookup = await client.query(
      `SELECT user_id
         FROM telegram_link_tokens
        WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
        LIMIT 1`,
      [payload]
    );
    const userId = tokenLookup.rows[0]?.user_id;
    if (!userId) {
      await client.query('ROLLBACK');
      return (
        'Ссылка привязки устарела или уже использована. ' +
        'Сгенерируй новую в личном кабинете на lpvolley.ru («Привязать Telegram»).'
      );
    }

    const userRes = await client.query(
      `SELECT full_name, telegram_user_id
         FROM users WHERE id = $1
         FOR UPDATE`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return 'Аккаунт для этой ссылки больше не существует.';
    }
    const currentTelegramUserId = String(user.telegram_user_id || '');
    if (currentTelegramUserId && currentTelegramUserId !== telegramUserId) {
      await client.query(
        `UPDATE telegram_link_tokens
            SET used_at = COALESCE(used_at, now())
          WHERE user_id = $1 AND used_at IS NULL`,
        [userId]
      );
      await client.query('COMMIT');
      return 'Аккаунт уже привязан к другому Telegram. Сначала отвяжи его в личном кабинете и создай новую ссылку.';
    }

    const tokenRes = await client.query(
      `UPDATE telegram_link_tokens
          SET used_at = NOW()
        WHERE token = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`,
      [payload, userId]
    );
    if (!tokenRes.rowCount) {
      await client.query('ROLLBACK');
      return (
        'Ссылка привязки устарела или уже использована. ' +
        'Сгенерируй новую в личном кабинете на lpvolley.ru («Привязать Telegram»).'
      );
    }
    const fullName = String(user.full_name ?? 'игрок');
    await client.query(`UPDATE users SET telegram_chat_id = $2, telegram_user_id = $2,
      telegram_private_chat_id = $2,
      telegram_onboarding_status = CASE WHEN player_id IS NOT NULL THEN 'approved' ELSE telegram_onboarding_status END
      WHERE id = $1`, [
      userId,
      chatId,
    ]);
    await client.query(
      `UPDATE telegram_link_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    await client.query(
      `UPDATE telegram_web_login_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    await client.query('COMMIT');
    await importTelegramProfileAvatar(Number(userId), telegramUserId).catch((error) => {
      console.warn('[telegram-commands][avatar-import]', error instanceof Error ? error.message : 'failed');
    });
    return (
      `Готово, ${fullName}! ✅\nАккаунт lpvolley.ru привязан. ` +
      'Теперь сюда будут приходить подтверждения заявок, напоминания об играх и новости турниров.\n\n' +
      'Команды: /my — мой аккаунт, /unlink — отвязать Telegram.'
    );
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Уникальный индекс: этот Telegram уже привязан к другому аккаунту
    if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
      return 'Этот Telegram уже привязан к другому аккаунту lpvolley.ru. Сначала отвяжи его там (/unlink).';
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function handleTgMy(chatId: string): Promise<string> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT full_name, email, player_id, telegram_onboarding_status FROM users
      WHERE telegram_user_id = $1 LIMIT 1`,
    [chatId]
  );
  const row = res.rows[0];
  if (!row) {
    return 'Telegram не привязан к аккаунту. Привяжи его в личном кабинете на lpvolley.ru.';
  }
  return [
    `🏐 Аккаунт: ${row.full_name}`,
    row.email ? `✉️ ${row.email}` : '',
    row.player_id ? '✅ Карточка игрока подтверждена' : `⏳ Статус: ${row.telegram_onboarding_status || 'ожидает проверки'}`,
    '',
    'Уведомления включены. Используй /menu для игр, турниров и входа на сайт.',
  ].filter(Boolean).join('\n');
}

export async function handleTgUnlink(chatId: string): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `SELECT id, email, password_hash FROM users
        WHERE telegram_user_id = $1 LIMIT 1
        FOR UPDATE`,
      [chatId]
    );
    const user = account.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return 'Этот Telegram и так не привязан к аккаунту.';
    }
    if (!user.email || !user.password_hash) {
      await client.query('ROLLBACK');
      return 'Это Telegram-аккаунт без пароля, поэтому отвязать его нельзя. При необходимости обратись к организатору.';
    }
    await client.query(
      `UPDATE users
          SET telegram_chat_id = NULL,
              telegram_user_id = NULL,
              telegram_private_chat_id = NULL
        WHERE id = $1`,
      [user.id]
    );
    await client.query(
      `UPDATE telegram_link_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );
    await client.query(
      `UPDATE telegram_web_login_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );
    await client.query('COMMIT');
    return 'Telegram отвязан от аккаунта lpvolley.ru. Уведомления отключены. Привязать снова можно в личном кабинете.';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function handleTgHelp(): string {
  return (
    'LPVOLLEY — игры и турниры 🏐\n\n' +
    '/create_game — быстро создать 2×2, Тайский или KING (по умолчанию на рейтинг)\n' +
    '/registrations — мои игры, приглашения и действия со счётом\n' +
    '/games — ближайшие игры и тренировки\n' +
    '/tournaments — ближайшие турниры\n' +
    '/calendar — всё ближайшее\n' +
    '/my — мой привязанный аккаунт\n' +
    '/unlink — отвязать Telegram\n' +
    '/help — помощь\n\n' +
    'В карточках можно принять приглашение, подтвердить участие, отказаться и открыть быстрый ввод счёта.'
  );
}
