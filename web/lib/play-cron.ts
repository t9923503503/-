import { getPool } from '@/lib/db';
import {
  isGoV2NotificationSchemaUnavailable,
  runGoV2NotificationDelivery,
  type GoV2NotificationDeliveryReport,
} from '@/lib/go-v2/notification-delivery';
import { applyConfirmedPlayResultRating } from '@/lib/play-game-rating';

const TELEGRAM_BRIDGE_LOCK = 'lpvolley:go-v2-telegram-bridge:v1';

export class TelegramFlushConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TelegramFlushConfigurationError';
    this.code = code;
  }
}

export interface TelegramFlushReport {
  status: 'processed' | 'busy' | 'disabled';
  goV2: (GoV2NotificationDeliveryReport & { status: 'processed' | 'schema_unavailable' }) | null;
}

function assertRelayOwnsTelegramOutbox(): void {
  const owner = String(process.env.TELEGRAM_OUTBOX_OWNER ?? '').trim().toLowerCase();
  if (owner !== 'relay') {
    throw new TelegramFlushConfigurationError(
      'TELEGRAM_OUTBOX_OWNER_REQUIRED',
      'TELEGRAM_OUTBOX_OWNER must be relay; the existing external relay is the sole Telegram sender',
    );
  }
}

function emptyGoV2Report(status: 'schema_unavailable'): NonNullable<TelegramFlushReport['goV2']> {
  return {
    status,
    claimed: 0,
    websiteAcknowledged: 0,
    telegramEventsBridged: 0,
    telegramMessagesQueued: 0,
    noEligibleRecipients: 0,
    failed: 0,
    deadLettered: 0,
  };
}

export async function runTelegramFlush(): Promise<TelegramFlushReport> {
  // This cron only renders/bridges immutable V2 domain events into the legacy
  // telegram_outbox. It intentionally has no Telegram token and never calls
  // the provider. telegram-bot/bot.mjs remains the only delivery owner.
  if (String(process.env.GO_V2_TELEGRAM_BRIDGE_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    return { status: 'disabled', goV2: null };
  }
  assertRelayOwnsTelegramOutbox();
  const client = await getPool().connect();
  let lockAcquired = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS acquired`,
      [TELEGRAM_BRIDGE_LOCK],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) return { status: 'busy', goV2: null };

    let goV2: NonNullable<TelegramFlushReport['goV2']>;
    try {
      goV2 = { status: 'processed', ...await runGoV2NotificationDelivery() };
    } catch (error) {
      if (!isGoV2NotificationSchemaUnavailable(error)) throw error;
      // During an additive rollout, the existing Telegram queue may continue
      // while migrations 105/106 are still pending. No V2 event is consumed in this path.
      goV2 = emptyGoV2Report('schema_unavailable');
    }
    return { status: 'processed', goV2 };
  } finally {
    if (lockAcquired) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtextextended($1::text, 0))`,
        [TELEGRAM_BRIDGE_LOCK],
      ).catch(() => undefined);
    }
    client.release();
  }
}

export interface PlayRemindersReport {
  reminders60m: number;
  atRisk: number;
  resultReminders: number;
  autoConfirmedResults: number;
}

export interface CompleteGamesReport {
  autoCancelledGames: number;
  completedGames: number;
  deactivatedAvailability: number;
  expiredInvites: number;
}

// Legacy Play V3 lifecycle worker. Kept intact while Telegram delivery gains
// V2 bridging; the V2 pilot must not remove existing cron behavior.
export async function runCompleteGames(): Promise<CompleteGamesReport> {
  const pool = getPool();
  const report: CompleteGamesReport = {
    autoCancelledGames: 0,
    completedGames: 0,
    deactivatedAvailability: 0,
    expiredInvites: 0,
  };

  const cancelled = await pool.query(
    `UPDATE play_posts pp SET status = 'cancelled'
      WHERE pp.status = 'published'
        AND pp.gather_deadline IS NOT NULL
        AND pp.gather_deadline <= now()
        AND (SELECT COUNT(*) FROM play_post_participants ppp
              WHERE ppp.post_id = pp.id AND ppp.status = 'confirmed') < COALESCE(pp.min_players, pp.capacity)
      RETURNING pp.id::text, pp.title`,
  );
  report.autoCancelledGames = cancelled.rowCount ?? 0;
  for (const post of cancelled.rows) {
    await pool.query(
      `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
       SELECT DISTINCT u.telegram_chat_id, 'game_auto_cancelled', $2,
              'game_auto_cancelled:' || $1 || ':' || u.telegram_chat_id
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
         LEFT JOIN play_post_participants ppp ON ppp.post_id = pp.id AND ppp.status IN ('confirmed', 'reserve', 'pending')
         JOIN users u ON u.id = po.owner_user_id OR u.id = ppp.user_id
        WHERE pp.id = $1::uuid AND COALESCE(u.telegram_chat_id, '') <> ''
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        String(post.id),
        `Игра «${String(post.title)}» отменена: к дедлайну не набран минимальный состав. https://lpvolley.ru/partner/${String(post.id)}`,
      ],
    );
  }

  const completed = await pool.query(
    `UPDATE play_posts SET status = 'completed'
      WHERE status = 'published' AND ends_at < now() - interval '4 hours'
      RETURNING id`,
  );
  report.completedGames = completed.rowCount ?? 0;

  const availability = await pool.query(
    `UPDATE play_availability SET active = false WHERE active AND date_to < now() RETURNING id`,
  );
  report.deactivatedAvailability = availability.rowCount ?? 0;

  const invites = await pool.query(
    `UPDATE play_invites pi SET status = 'expired', responded_at = now()
       FROM play_posts pp
      WHERE pp.id = pi.post_id AND pi.status = 'sent' AND pp.starts_at < now()
      RETURNING pi.id`,
  );
  report.expiredInvites = invites.rowCount ?? 0;

  return report;
}

// Legacy Play V3 reminder/rating worker, deliberately preserved alongside the
// single-owner Telegram transport.
export async function runPlayReminders(): Promise<PlayRemindersReport> {
  const pool = getPool();
  const report: PlayRemindersReport = {
    reminders60m: 0,
    atRisk: 0,
    resultReminders: 0,
    autoConfirmedResults: 0,
  };

  const soon = await pool.query(
    `SELECT pp.id::text, pp.title, pv.name AS venue, u.telegram_chat_id
       FROM play_posts pp
       JOIN play_venues pv ON pv.id = pp.venue_id
       JOIN play_post_participants ppp ON ppp.post_id = pp.id AND ppp.status = 'confirmed'
       JOIN users u ON u.id = ppp.user_id
      WHERE pp.status = 'published'
        AND pp.starts_at BETWEEN now() + interval '55 minutes' AND now() + interval '65 minutes'
        AND COALESCE(u.telegram_chat_id, '') <> ''`,
  );
  for (const row of soon.rows) {
    const inserted = await pool.query(
      `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
       VALUES ($1, 'reminder_60m', $2, $3)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        String(row.telegram_chat_id),
        `Через час «${String(row.title)}», площадка: ${String(row.venue)}. Детали: https://lpvolley.ru/partner/${String(row.id)}`,
        `reminder_60m:${String(row.id)}:${String(row.telegram_chat_id)}`,
      ],
    );
    if (inserted.rows[0]) report.reminders60m += 1;
  }

  const risky = await pool.query(
    `SELECT pp.id::text, pp.title, pp.min_players, pp.capacity, u.telegram_chat_id,
            (SELECT COUNT(*)::int FROM play_post_participants ppp
              WHERE ppp.post_id = pp.id AND ppp.status = 'confirmed') AS confirmed
       FROM play_posts pp
       JOIN play_organizers po ON po.id = pp.organizer_id
       JOIN users u ON u.id = po.owner_user_id
      WHERE pp.status = 'published'
        AND pp.gather_deadline BETWEEN now() AND now() + interval '2 hours'
        AND COALESCE(u.telegram_chat_id, '') <> ''`,
  );
  for (const row of risky.rows) {
    const minimum = Number(row.min_players ?? row.capacity);
    const missing = minimum - Number(row.confirmed);
    if (missing <= 0) continue;
    const inserted = await pool.query(
      `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
       VALUES ($1, 'game_at_risk', $2, $3)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        String(row.telegram_chat_id),
        `До дедлайна сбора «${String(row.title)}» 2 часа, не хватает ${missing}. Пригласите подходящих: https://lpvolley.ru/partner/${String(row.id)}`,
        `game_at_risk:${String(row.id)}`,
      ],
    );
    if (inserted.rows[0]) report.atRisk += 1;
  }

  const noResult = await pool.query(
    `SELECT pp.id::text, pp.title, u.telegram_chat_id
       FROM play_posts pp
       JOIN play_organizers po ON po.id = pp.organizer_id
       JOIN users u ON u.id = po.owner_user_id
      WHERE pp.status IN ('published', 'completed')
        AND pp.ends_at BETWEEN now() - interval '3 hours' AND now() - interval '2 hours'
        AND NOT EXISTS (SELECT 1 FROM play_game_results pgr WHERE pgr.post_id = pp.id)
        AND COALESCE(u.telegram_chat_id, '') <> ''`,
  );
  for (const row of noResult.rows) {
    const inserted = await pool.query(
      `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
       VALUES ($1, 'result_reminder', $2, $3)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        String(row.telegram_chat_id),
        `Как сыграли? Внесите результат «${String(row.title)}»: https://lpvolley.ru/partner/${String(row.id)}`,
        `result_reminder:${String(row.id)}:${String(row.telegram_chat_id)}`,
      ],
    );
    if (inserted.rows[0]) report.resultReminders += 1;
  }

  const autoConfirm = await pool.query(
    `UPDATE play_game_results pgr SET status = 'confirmed'
      WHERE pgr.status = 'pending'
        AND FALSE -- results require an explicit organizer/admin approval
        AND pgr.auto_confirm_at < now()
        AND NOT EXISTS (
          SELECT 1 FROM play_result_confirmations prc
           WHERE prc.result_id = pgr.id AND prc.verdict = 'disputed'
        )
      RETURNING pgr.id::text, pgr.post_id::text AS post_id`,
  );
  for (const row of autoConfirm.rows) {
    const ratingClient = await pool.connect();
    try {
      await ratingClient.query('BEGIN');
      await applyConfirmedPlayResultRating(ratingClient, String(row.id));
      await ratingClient.query('COMMIT');
    } catch (error) {
      await ratingClient.query('ROLLBACK');
      throw error;
    } finally {
      ratingClient.release();
    }
    const owner = await pool.query(
      `SELECT u.telegram_chat_id, pp.title
         FROM play_posts pp
         JOIN play_organizers po ON po.id = pp.organizer_id
         JOIN users u ON u.id = po.owner_user_id
        WHERE pp.id = $1::uuid LIMIT 1`,
      [row.post_id],
    );
    const chat = String(owner.rows[0]?.telegram_chat_id ?? '');
    if (chat) {
      await pool.query(
        `INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key)
         VALUES ($1, 'result_confirmed', $2, $3)
         ON CONFLICT (dedup_key) DO NOTHING`,
        [
          chat,
          `Результат «${String(owner.rows[0]?.title ?? '')}» подтверждён автоматически (24 ч без возражений).`,
          `result_confirmed:${String(row.post_id)}:${chat}`,
        ],
      );
    }
  }
  report.autoConfirmedResults = autoConfirm.rowCount ?? 0;

  return report;
}
