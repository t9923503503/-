import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { getPool } from '@/lib/db';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LEASE_SECONDS = 90;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_TELEGRAM_CHAT_PATTERN = /^[1-9][0-9]{0,19}$/;

export interface GoV2NotificationDeliveryReport {
  claimed: number;
  websiteAcknowledged: number;
  telegramEventsBridged: number;
  telegramMessagesQueued: number;
  noEligibleRecipients: number;
  failed: number;
  deadLettered: number;
}

interface GoV2NotificationOutboxRow {
  id: string;
  tournament_id: string;
  aggregate_version: string | number;
  channel: 'website' | 'telegram';
  recipient_key: string;
  event_type: string;
  payload: unknown;
  dedup_key: string;
}

interface TelegramRecipientRow {
  chat_id: string;
  entry_ids: string[] | null;
}

export interface GoV2NotificationEntryScope {
  mode: 'affected' | 'tournament';
  entryIds: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function collectUuidValues(value: unknown, target: Set<string>): void {
  if (typeof value === 'string') {
    const candidate = value.trim().toLowerCase();
    if (UUID_PATTERN.test(candidate)) target.add(candidate);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUuidValues(item, target);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (normalizedKey === 'id' || normalizedKey.endsWith('entryid')) {
        collectUuidValues(item, target);
      } else if (normalizedKey.endsWith('entryids')) {
        collectUuidValues(item, target);
      }
    }
  }
}

function isEntryScopedKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized.endsWith('entryid')
    || normalized.endsWith('entryids')
    || normalized.endsWith('teamid')
    || normalized.endsWith('teamids')
    || normalized === 'affectedentries'
    || normalized === 'affectedteams'
    || normalized === 'participantentries'
    || normalized === 'participantentryids';
}

/**
 * Notification payloads deliberately stay domain-shaped. We only interpret
 * explicitly entry/team-scoped fields; arbitrary UUIDs (match, stage, audit)
 * must never accidentally narrow the recipient set.
 */
export function extractGoV2NotificationEntryScope(payload: unknown): GoV2NotificationEntryScope {
  const entryIds = new Set<string>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isEntryScopedKey(key)) collectUuidValues(item, entryIds);
      visit(item);
    }
  }

  visit(payload);
  const sorted = [...entryIds].sort((left, right) => left.localeCompare(right));
  return { mode: sorted.length ? 'affected' : 'tournament', entryIds: sorted };
}

export function isValidPrivateTelegramChatId(value: unknown): boolean {
  return PRIVATE_TELEGRAM_CHAT_PATTERN.test(String(value ?? '').trim());
}

export function buildGoV2TelegramRecipientDedupKey(notificationId: string, chatId: string): string {
  if (!UUID_PATTERN.test(notificationId)) throw new Error('Invalid GO V2 notification id');
  if (!isValidPrivateTelegramChatId(chatId)) throw new Error('Invalid private Telegram chat id');
  const recipientDigest = createHash('sha256').update(chatId.trim()).digest('hex').slice(0, 32);
  return `go-v2-bridge:${notificationId.toLowerCase()}:${recipientDigest}`;
}

function findFirstScalar(payload: unknown, wantedKeys: ReadonlySet<string>): string | null {
  let found: string | null = null;
  function visit(value: unknown): void {
    if (found != null || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (wantedKeys.has(normalized) && ['string', 'number', 'boolean'].includes(typeof item)) {
        found = String(item);
        return;
      }
      visit(item);
    }
  }
  visit(payload);
  return found;
}

function safeTournamentName(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return normalized.slice(0, 120) || 'Турнир LPVolley';
}

function notificationOrigin(): string {
  const configured = String(
    process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.SITE_URL
      ?? process.env.APP_ORIGIN
      ?? 'https://lpvolley.ru',
  ).trim();
  try {
    const parsed = new URL(configured);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin;
  } catch {
    // Fail closed to the canonical public origin.
  }
  return 'https://lpvolley.ru';
}

const ATTENDANCE_LABELS: Record<string, string> = {
  unknown: 'статус уточняется',
  confirmed: 'участие подтверждено',
  checked_in: 'команда на месте',
  late_hold: 'команда задерживается',
  no_show: 'неявка подтверждена директором',
  withdrawn: 'команда снята',
  disqualified: 'команда дисквалифицирована',
};

const DISRUPTION_MESSAGES: Record<string, string> = {
  rain_hold: 'Объявлена пауза из-за дождя. Следите за живым расписанием.',
  lightning_hold: 'Объявлена пауза из-за грозы. Следите за живым расписанием.',
  court_damage: 'Корт временно недоступен. Расписание может измениться.',
  medical_delay: 'Игра задерживается по медицинской причине.',
  security_pause: 'Объявлена организационная пауза.',
  court_close: 'Корт закрыт. Организатор готовит обновлённое расписание.',
  court_reopen: 'Корт снова открыт. Проверьте актуальное расписание.',
  global_pause: 'Турнир временно приостановлен. Следите за обновлениями.',
};

export function renderGoV2TelegramNotification(input: {
  tournamentId: string;
  tournamentName: string;
  eventType: string;
  payload: unknown;
  origin?: string;
}): string {
  const attendanceState = findFirstScalar(input.payload, new Set(['tostate', 'attendancestate']));
  const disruptionKind = findFirstScalar(input.payload, new Set(['disruptionkind']));
  const publicationState = findFirstScalar(input.payload, new Set(['tostate', 'publicationstate']));
  const message = (() => {
    switch (input.eventType) {
      case 'draw.commit':
        return 'Жеребьёвка групп опубликована.';
      case 'bracket.lock':
        return 'Сетка плей-офф опубликована.';
      case 'schedule.generate.commit':
        return 'Расписание опубликовано. Проверьте время и корт первой игры.';
      case 'schedule.replan.commit':
        return 'Расписание обновлено. Проверьте новое время, корт и судейство.';
      case 'schedule.policy.commit':
        return 'Для тира временно изменены разрешённые корты. Проверьте обновлённое расписание.';
      case 'schedule.defer.commit':
        return 'Игра перенесена в расписании. Проверьте новое время, корт и судейство.';
      case 'schedule.defer.release.commit':
        return 'Ограничение переноса игры снято. Проверьте обновлённое время, корт и судейство.';
      case 'stage.rules.commit':
        return 'Правила будущего раунда изменены. Проверьте формат матчей и обновлённое расписание.';
      case 'publication_state_changed':
        return publicationState === 'published'
          ? 'Таблицы, сетки и живое расписание турнира опубликованы.'
          : 'Публичный доступ к турниру временно закрыт директором.';
      case 'match.result.revise':
        return 'Результат матча обновлён. Проверьте таблицу и дальнейшую сетку.';
      case 'roster.replacement.commit':
        return 'Состав вашей команды обновлён.';
      case 'reserve.promotion.commit':
        return 'Резервная команда включена в турнир. Проверьте группу, сетку и расписание.';
      case 'entry.withdrawal.commit':
        return 'Статус участия команды изменён. Проверьте сетку и расписание.';
      case 'attendance.commit':
        return `Статус присутствия изменён: ${ATTENDANCE_LABELS[attendanceState ?? ''] ?? 'обновлён'}.`;
      case 'attendance.reinstate.commit':
        return 'Команда возвращена после неявки. Проверьте сохранённые результаты и обновлённое расписание.';
      case 'disruption.commit':
        return DISRUPTION_MESSAGES[disruptionKind ?? '']
          ?? 'Условия проведения изменились. Проверьте живое расписание.';
      case 'incident.commit':
        return 'Решение по инциденту опубликовано. Проверьте результат и расписание.';
      case 'mutation.undo.commit':
        return 'Предыдущее изменение отменено. Таблица, сетка или расписание могли обновиться.';
      default:
        return 'Опубликовано обновление турнира.';
    }
  })();
  const origin = input.origin?.replace(/\/+$/, '') || notificationOrigin();
  const link = `${origin}/calendar/${encodeURIComponent(input.tournamentId)}/live`;
  return `🏐 ${safeTournamentName(input.tournamentName)}\n${message}\n${link}`;
}

async function loadTournamentName(client: PoolClient, tournamentId: string): Promise<string> {
  const result = await client.query(
    `SELECT name FROM tournaments WHERE id = $1::uuid LIMIT 1`,
    [tournamentId],
  );
  if (!result.rowCount) throw new Error('GO V2 notification tournament does not exist');
  return String(result.rows[0].name ?? 'Турнир LPVolley');
}

async function loadTelegramRecipients(
  client: PoolClient,
  tournamentId: string,
  scope: GoV2NotificationEntryScope,
): Promise<TelegramRecipientRow[]> {
  const result = await client.query(
    `WITH roster_chat AS (
       SELECT entry.id AS entry_id,
              entry.registration_state,
              CASE
                WHEN COALESCE("user".telegram_private_chat_id, '') ~ '^[1-9][0-9]{0,19}$'
                  THEN "user".telegram_private_chat_id
                WHEN COALESCE("user".telegram_chat_id, '') ~ '^[1-9][0-9]{0,19}$'
                  AND ("user".telegram_user_id IS NULL OR "user".telegram_user_id = "user".telegram_chat_id)
                  THEN "user".telegram_chat_id
                ELSE NULL
              END AS chat_id
       FROM go_v2_entries entry
       JOIN go_v2_roster_revision_members member
         ON member.roster_revision_id = entry.current_roster_revision_id
        AND member.player_id IS NOT NULL
       JOIN users "user" ON "user".player_id = member.player_id
       WHERE entry.tournament_id = $1::uuid
     )
     SELECT chat_id, array_agg(DISTINCT entry_id::text ORDER BY entry_id::text) AS entry_ids
     FROM roster_chat
     WHERE chat_id IS NOT NULL
       AND (
         ($2::boolean AND entry_id = ANY($3::uuid[]))
         OR (NOT $2::boolean AND registration_state = 'confirmed')
       )
     GROUP BY chat_id
     ORDER BY chat_id`,
    [tournamentId, scope.mode === 'affected', scope.entryIds],
  );
  return result.rows
    .map((row) => ({
      chat_id: String(row.chat_id ?? ''),
      entry_ids: Array.isArray(row.entry_ids) ? row.entry_ids.map(String) : [],
    }))
    .filter((row) => isValidPrivateTelegramChatId(row.chat_id));
}

async function completeNotification(
  client: PoolClient,
  row: GoV2NotificationOutboxRow,
  workerId: string,
  receipt: Record<string, unknown>,
): Promise<void> {
  const result = await client.query(
    `SELECT go_v2_complete_notification_outbox($1::uuid, $2::text, $3::jsonb) AS completed`,
    [row.id, workerId, JSON.stringify(receipt)],
  );
  if (result.rows[0]?.completed !== true) {
    throw new Error('GO V2 notification lease expired before completion');
  }
}

async function failNotification(
  client: PoolClient,
  row: GoV2NotificationOutboxRow,
  workerId: string,
  error: unknown,
): Promise<boolean> {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const failed = await client.query(
    `SELECT go_v2_fail_notification_outbox($1::uuid, $2::text, $3::text) AS failed`,
    [row.id, workerId, detail.slice(0, 2000)],
  );
  if (failed.rows[0]?.failed !== true) return false;
  const state = await client.query(
    `SELECT dead_lettered_at IS NOT NULL AS dead_lettered
     FROM go_v2_notification_outbox WHERE id = $1::uuid`,
    [row.id],
  );
  return state.rows[0]?.dead_lettered === true;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      throw new Error('GO V2 notification payload is not valid JSON');
    }
  }
  return asRecord(value);
}

async function processNotification(
  client: PoolClient,
  row: GoV2NotificationOutboxRow,
  workerId: string,
  report: GoV2NotificationDeliveryReport,
): Promise<void> {
  await client.query('BEGIN');
  try {
    const payload = parsePayload(row.payload);
    if (row.channel === 'website') {
      await completeNotification(client, row, workerId, {
        provider: 'website_public_polling',
        status: 'published',
        eventType: row.event_type,
        aggregateVersion: Number(row.aggregate_version),
        retention: 'source_row_retained',
      });
      await client.query('COMMIT');
      report.websiteAcknowledged += 1;
      return;
    }
    if (row.channel !== 'telegram') throw new Error(`Unsupported GO V2 notification channel: ${row.channel}`);

    const scope = extractGoV2NotificationEntryScope(payload);
    const [tournamentName, recipients] = await Promise.all([
      loadTournamentName(client, row.tournament_id),
      loadTelegramRecipients(client, row.tournament_id, scope),
    ]);
    const text = renderGoV2TelegramNotification({
      tournamentId: row.tournament_id,
      tournamentName,
      eventType: row.event_type,
      payload,
    });
    const bridgeIds: string[] = [];
    const recipientDigests: string[] = [];
    for (const recipient of recipients) {
      const dedupKey = buildGoV2TelegramRecipientDedupKey(row.id, recipient.chat_id);
      const bridged = await client.query(
        `SELECT go_v2_bridge_telegram_notification(
           $1::uuid, $2::text, $3::text, $4::text, $5::text
         )::text AS telegram_outbox_id`,
        [row.id, workerId, recipient.chat_id, text, dedupKey],
      );
      bridgeIds.push(String(bridged.rows[0].telegram_outbox_id));
      recipientDigests.push(dedupKey.slice(dedupKey.lastIndexOf(':') + 1));
    }
    await completeNotification(client, row, workerId, {
      provider: 'telegram_outbox_bridge',
      status: recipients.length ? 'queued' : 'skipped_no_eligible_recipients',
      eventType: row.event_type,
      recipientScope: scope.mode,
      affectedEntryIds: scope.entryIds,
      recipientCount: recipients.length,
      recipientDigests,
      telegramOutboxIds: bridgeIds,
      lineageTable: 'go_v2_notification_delivery_bridges',
    });
    await client.query('COMMIT');
    report.telegramEventsBridged += 1;
    report.telegramMessagesQueued += recipients.length;
    if (!recipients.length) report.noEligibleRecipients += 1;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function runGoV2NotificationDelivery(options: {
  workerId?: string;
  batchSize?: number;
  leaseSeconds?: number;
} = {}): Promise<GoV2NotificationDeliveryReport> {
  const workerId = options.workerId?.trim() || `go-v2-notify:${process.pid}:${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(500, Math.trunc(options.batchSize ?? DEFAULT_BATCH_SIZE)));
  const leaseSeconds = Math.max(5, Math.min(900, Math.trunc(options.leaseSeconds ?? DEFAULT_LEASE_SECONDS)));
  const report: GoV2NotificationDeliveryReport = {
    claimed: 0,
    websiteAcknowledged: 0,
    telegramEventsBridged: 0,
    telegramMessagesQueued: 0,
    noEligibleRecipients: 0,
    failed: 0,
    deadLettered: 0,
  };
  const client = await getPool().connect();
  try {
    const claimed = await client.query<GoV2NotificationOutboxRow>(
      `SELECT id::text, tournament_id::text, aggregate_version, channel,
              recipient_key, event_type, payload, dedup_key
       FROM go_v2_claim_notification_outbox($1::text, $2::int, $3::int)`,
      [workerId, batchSize, leaseSeconds],
    );
    report.claimed = claimed.rows.length;
    for (const row of claimed.rows) {
      try {
        await processNotification(client, row, workerId, report);
      } catch (error) {
        report.failed += 1;
        if (await failNotification(client, row, workerId, error)) report.deadLettered += 1;
      }
    }
    return report;
  } finally {
    client.release();
  }
}

export function isGoV2NotificationSchemaUnavailable(error: unknown): boolean {
  const code = String(asRecord(error).code ?? '');
  return code === '42P01' || code === '42883' || code === '42703';
}
