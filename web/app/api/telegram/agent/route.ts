import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { handleTgStart, handleTgMy, handleTgUnlink, handleTgHelp } from '@/lib/telegram-commands';
import {
  buildChannelQueue,
  buildGameCatalog,
  buildTournamentCatalog,
  buildChannelUpdates,
  ackChannelPost,
  detachChannelPost,
} from '@/lib/telegram-channel';
import {
  confirmGameAttendanceFromTelegram,
  createGameDraftFromTelegram,
  enqueueTelegramReminders,
  joinGameFromTelegram,
  leaveGameFromTelegram,
  respondGameInviteFromTelegram,
  telegramGameCreateMenu,
} from '@/lib/telegram-actions';
import { telegramOutboxButtons } from '@/lib/telegram-outbox';
import {
  ackTelegramAdminOutbox,
  beginTelegramRegistration,
  cancelTelegramClaim,
  confirmTelegramWebLogin,
  createTelegramWebLogin,
  joinTournamentFromTelegram,
  leaveTournamentFromTelegram,
  listTelegramAdminOutbox,
  reviewTelegramClaim,
  startTelegramWebLogin,
  submitTelegramPlayerClaim,
  telegramHome,
  telegramRegistrations,
  telegramRegistrationContact,
  telegramRegistrationGender,
  telegramRegistrationText,
} from '@/lib/telegram-registration';

export const dynamic = 'force-dynamic';

// Точка входа для ЛОКАЛЬНОГО бота-релея (когда сервер не может ходить в
// Telegram API): бот живёт на отдельной машине, опрашивает TG сам, а данные
// и дедупликация остаются на сервере. Авторизация: Bearer TELEGRAM_AGENT_SECRET.
//
// Действия (POST {action, ...}):
//   bind        {chatId, telegramUserId, privateChatId, payload} → {reply}
//   webLoginStart {telegramUserId, privateChatId, intentToken, profile} → stage code challenge
//   webLoginConfirm {telegramUserId, privateChatId, intentToken, decision:'reject'} → cancel
//   my          {chatId}                 → {reply}
//   unlink      {chatId}                 → {reply}
//   help                               → {reply}
//   games      {limit?}                 → {items}   ближайшие игры
//   gameCreateMenu {telegramUserId}      → быстрые шаблоны создания
//   createGameDraft {telegramUserId, template, ratingMode?} → черновик игры в Play
//   tournaments {limit?}               → {items}   ближайшие турниры
//   joinGame / leaveGame                → действие игрока по Telegram user id
//   channelUpdates                      → актуальные версии опубликованных карточек
//   reminderSweep                       → постановка напоминаний 24ч/3ч в outbox
//   channelQueue {limit?}                → {items}   анонсы для канала
//   channelAck  {entityType, entityId, messageId}    подтверждение анонса
//   channelDetach {entityType, entityId, messageId} → перестать обновлять удалённый пост
//   outbox      {claimId, limit?}         → leased personal notifications
//   outboxBegin {claimId, id, attemptId}   → durable provider-attempt fence
//   outboxAck   {claimId, results[]}      → idempotent delivery receipts

// A batch can contain 50 sequential Telegram calls with a 20-second provider
// timeout. Keep the lease long enough that a slow but healthy relay never
// loses ownership mid-batch.
const TELEGRAM_OUTBOX_LEASE_SECONDS = 900;
const TELEGRAM_ADMIN_USER_IDS = new Set(
  String(process.env.TELEGRAM_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[1-9]\d*$/.test(value))
);

function boundedLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), max));
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_AGENT_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function requireTelegramAdmin(value: unknown): string | null {
  const telegramUserId = String(value || '').trim();
  return TELEGRAM_ADMIN_USER_IDS.has(telegramUserId) ? telegramUserId : null;
}

function telegramRelayOwnsOutbox(): boolean {
  return String(process.env.TELEGRAM_OUTBOX_OWNER ?? '').trim().toLowerCase() === 'relay';
}

function normalizeRelayClaimId(value: unknown): string | null {
  const claimId = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(claimId) ? claimId : null;
}

function normalizeRelayAttemptId(value: unknown): string | null {
  const attemptId = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(attemptId) ? attemptId : null;
}

function telegramRelayWorkerId(claimId: string): string {
  return `external-telegram-relay:${claimId}`;
}

function isTelegramOutboxLeaseSchemaUnavailable(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  return code === '42883'
    || code === '42703'
    || message.includes('go_v2_claim_telegram_outbox')
    || message.includes('go_v2_begin_telegram_outbox_attempt')
    || message.includes('go_v2_complete_telegram_outbox')
    || message.includes('go_v2_fail_telegram_outbox')
    || message.includes('go_v2_quarantine_unknown_telegram_outbox');
}

type TelegramRelayAck = {
  id: number;
  status: 'sent' | 'failed' | 'unknown';
  receipt: Record<string, unknown>;
  error: string;
};

function parseTelegramRelayAcks(value: unknown): TelegramRelayAck[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const seen = new Set<number>();
  const parsed: TelegramRelayAck[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = Number(record.id);
    const status = record.status;
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return null;
    if (status !== 'sent' && status !== 'failed' && status !== 'unknown') return null;
    seen.add(id);
    parsed.push({
      id,
      status,
      receipt: record.receipt && typeof record.receipt === 'object' && !Array.isArray(record.receipt)
        ? record.receipt as Record<string, unknown>
        : {},
      error: String(record.error ?? 'telegram_delivery_failed').slice(0, 1_000),
    });
  }
  return parsed;
}

async function listGalleryTournaments(limit: number) {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT t.id::text, t.name, t.date, COALESCE(t.cover_photo_url, '') AS cover_photo_url,
              COUNT(g.id)::int AS gallery_count
         FROM tournaments t
         LEFT JOIN tournament_gallery_images g ON g.tournament_id = t.id
        WHERE t.status = 'finished' AND COALESCE(t.name, '') <> '__playerdb__'
        GROUP BY t.id, t.name, t.date, t.cover_photo_url
        ORDER BY t.date DESC NULLS LAST, t.name ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name || 'Турнир'),
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : '',
      galleryCount: Number(row.gallery_count || 0),
      hasCover: Boolean(String(row.cover_photo_url || '')),
    }));
  } catch (error) {
    const code = String((error as { code?: unknown })?.code || '');
    if (code !== '42703' && code !== '42P01') throw error;
    const { rows } = await pool.query(
      `SELECT id::text, name, date
         FROM tournaments
        WHERE status = 'finished' AND COALESCE(name, '') <> '__playerdb__'
        ORDER BY date DESC NULLS LAST, name ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name || 'Турнир'),
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : '',
      galleryCount: 0,
      hasCover: false,
    }));
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const pool = getPool();

  try {
    switch (action) {
      case 'bind':
        return NextResponse.json({
          reply: await handleTgStart(
            String(body.chatId ?? ''),
            String(body.payload ?? ''),
            String(body.telegramUserId ?? ''),
            String(body.privateChatId ?? '')
          ),
        });

      case 'my':
        return NextResponse.json({ reply: await handleTgMy(String(body.chatId ?? '')) });

      case 'unlink':
        return NextResponse.json({ reply: await handleTgUnlink(String(body.chatId ?? '')) });

      case 'help':
        return NextResponse.json({ reply: handleTgHelp() });

      case 'home':
        return NextResponse.json(await telegramHome(body.telegramUserId, body.privateChatId));

      case 'registrationStart':
        return NextResponse.json(await beginTelegramRegistration(body.telegramUserId, body.privateChatId));

      case 'registrationText':
        return NextResponse.json(await telegramRegistrationText(body.telegramUserId, body.privateChatId, body.text));

      case 'registrationGender':
        return NextResponse.json(await telegramRegistrationGender(body.telegramUserId, body.privateChatId, body.gender));

      case 'registrationContact':
        return NextResponse.json(await telegramRegistrationContact(
          body.telegramUserId, body.privateChatId, body.contactUserId, body.phone, body.username
        ));

      case 'registrationPlayer':
        return NextResponse.json(await submitTelegramPlayerClaim(body.telegramUserId, body.privateChatId, body.playerId));

      case 'registrationCancel':
        return NextResponse.json(await cancelTelegramClaim(body.telegramUserId));

      case 'adminClaimReview': {
        const adminTelegramUserId = String(body.adminTelegramUserId || '').trim();
        if (!TELEGRAM_ADMIN_USER_IDS.has(adminTelegramUserId)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.json(await reviewTelegramClaim(body.claimId, body.decision, adminTelegramUserId));
      }

      case 'adminOutbox':
        return NextResponse.json({ items: await listTelegramAdminOutbox(boundedLimit(body.limit, 20, 50)) });

      case 'adminOutboxAck': {
        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
        await ackTelegramAdminOutbox(ids);
        return NextResponse.json({ ok: true });
      }

      case 'galleryTournaments': {
        if (!requireTelegramAdmin(body.telegramUserId)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.json({
          items: await listGalleryTournaments(boundedLimit(body.limit, 10, 20)),
        });
      }

      case 'webLogin':
        return NextResponse.json(await createTelegramWebLogin(body.telegramUserId, body.privateChatId));

      case 'webLoginStart':
        return NextResponse.json(await startTelegramWebLogin(
          body.telegramUserId,
          body.privateChatId,
          body.intentToken,
          {
            firstName: body.firstName,
            lastName: body.lastName,
            username: body.username,
          }
        ));

      case 'webLoginConfirm':
        return NextResponse.json(await confirmTelegramWebLogin(
          body.telegramUserId,
          body.privateChatId,
          body.intentToken,
          body.decision
        ));

      case 'registrations':
        return NextResponse.json(await telegramRegistrations(body.telegramUserId, body.privateChatId));

      case 'games':
        return NextResponse.json({
          title: '🏐 Ближайшие игры и тренировки',
          items: await buildGameCatalog(boundedLimit(body.limit, 5, 10)),
        });

      case 'gameCreateMenu':
        return NextResponse.json(await telegramGameCreateMenu(
          String(body.telegramUserId ?? ''),
          body.ratingMode === 'friendly' ? 'friendly' : 'rated'
        ));

      case 'createGameDraft': {
        const template = String(body.template ?? '');
        const ratingMode = String(body.ratingMode ?? 'rated');
        if (template !== '2x2' && template !== 'thai' && template !== 'king') {
          return NextResponse.json({ error: 'Некорректный шаблон игры' }, { status: 400 });
        }
        if (ratingMode !== 'rated' && ratingMode !== 'friendly') {
          return NextResponse.json({ error: 'Некорректный режим игры' }, { status: 400 });
        }
        return NextResponse.json(await createGameDraftFromTelegram(
          String(body.telegramUserId ?? ''),
          template,
          ratingMode
        ));
      }

      case 'tournaments':
        return NextResponse.json({
          title: '🏆 Ближайшие турниры',
          items: await buildTournamentCatalog(boundedLimit(body.limit, 5, 10)),
        });

      case 'joinGame':
        return NextResponse.json(await joinGameFromTelegram(
          String(body.telegramUserId ?? ''),
          String(body.postId ?? '')
        ));

      case 'leaveGame':
        return NextResponse.json(await leaveGameFromTelegram(
          String(body.telegramUserId ?? ''),
          String(body.postId ?? '')
        ));

      case 'confirmAttendance':
        return NextResponse.json(await confirmGameAttendanceFromTelegram(
          String(body.telegramUserId ?? ''),
          String(body.postId ?? '')
        ));

      case 'respondGameInvite': {
        const decision = String(body.decision ?? '');
        if (decision !== 'accept' && decision !== 'decline') {
          return NextResponse.json({ error: 'Некорректный ответ на приглашение' }, { status: 400 });
        }
        return NextResponse.json(await respondGameInviteFromTelegram(
          String(body.telegramUserId ?? ''),
          String(body.postId ?? ''),
          decision
        ));
      }

      case 'joinTournament':
        return NextResponse.json(await joinTournamentFromTelegram(body.telegramUserId, body.tournamentId));

      case 'leaveTournament':
        return NextResponse.json(await leaveTournamentFromTelegram(body.telegramUserId, body.tournamentId));

      case 'channelUpdates':
        return NextResponse.json({
          items: await buildChannelUpdates(boundedLimit(body.limit, 25, 50)),
        });

      case 'reminderSweep':
        return NextResponse.json(await enqueueTelegramReminders());

      case 'channelQueue': {
        const limit = boundedLimit(body.limit, 10, 25);
        return NextResponse.json({ items: await buildChannelQueue(limit) });
      }

      case 'channelAck': {
        const entityType = String(body.entityType ?? '');
        const entityId = String(body.entityId ?? '').trim();
        if (!['play_post', 'tournament'].includes(entityType) || !entityId) {
          return NextResponse.json({ error: 'Некорректная сущность' }, { status: 400 });
        }
        await ackChannelPost(
          entityType,
          entityId,
          typeof body.messageId === 'number' ? body.messageId : null
        );
        return NextResponse.json({ ok: true });
      }

      case 'channelDetach': {
        const entityType = String(body.entityType ?? '');
        const entityId = String(body.entityId ?? '').trim();
        const messageId = Number(body.messageId);
        if (!['play_post', 'tournament'].includes(entityType) || !entityId || !Number.isSafeInteger(messageId) || messageId <= 0) {
          return NextResponse.json({ error: 'Некорректная сущность' }, { status: 400 });
        }
        await detachChannelPost(entityType, entityId, messageId);
        return NextResponse.json({ ok: true });
      }

      case 'outbox': {
        if (!telegramRelayOwnsOutbox()) {
          return NextResponse.json(
            { error: 'Telegram outbox delivery owner is not configured', code: 'TELEGRAM_OUTBOX_OWNER_REQUIRED' },
            { status: 503 },
          );
        }
        const claimId = normalizeRelayClaimId(body.claimId);
        if (!claimId) {
          return NextResponse.json({ error: 'Некорректный claimId' }, { status: 400 });
        }
        const limit = boundedLimit(body.limit, 25, 50);
        let rows: Array<{
          id: number | string;
          chat_id: string;
          kind: string;
          message_text: string;
          attempts: number | string;
        }>;
        try {
          const claimed = await pool.query<{
            id: number | string;
            chat_id: string;
            kind: string;
            message_text: string;
            attempts: number | string;
          }>(
            `SELECT id, chat_id, kind, message_text, attempts
               FROM go_v2_claim_telegram_outbox($1::text, $2::int, $3::int)`,
            [telegramRelayWorkerId(claimId), limit, TELEGRAM_OUTBOX_LEASE_SECONDS],
          );
          rows = claimed.rows;
        } catch (error) {
          if (!isTelegramOutboxLeaseSchemaUnavailable(error)) throw error;
          return NextResponse.json(
            { error: 'Migration 108 Telegram claim/lease schema is required', code: 'TELEGRAM_OUTBOX_SCHEMA_REQUIRED' },
            { status: 503 },
          );
        }
        return NextResponse.json({
          claimId,
          leaseSeconds: TELEGRAM_OUTBOX_LEASE_SECONDS,
          items: rows.map((row) => ({
            id: Number(row.id),
            chatId: String(row.chat_id),
            kind: String(row.kind),
            text: String(row.message_text),
            attempts: Number(row.attempts),
            buttons: telegramOutboxButtons(row.kind, row.message_text),
          })),
        });
      }

      case 'outboxBegin': {
        if (!telegramRelayOwnsOutbox()) {
          return NextResponse.json(
            { error: 'Telegram outbox delivery owner is not configured', code: 'TELEGRAM_OUTBOX_OWNER_REQUIRED' },
            { status: 503 },
          );
        }
        const claimId = normalizeRelayClaimId(body.claimId);
        const attemptId = normalizeRelayAttemptId(body.attemptId);
        const id = Number(body.id);
        if (!claimId || !attemptId || !Number.isSafeInteger(id) || id <= 0) {
          return NextResponse.json({ error: 'Некорректное начало provider attempt' }, { status: 400 });
        }
        try {
          const started = await pool.query<{ acknowledged: boolean }>(
            `SELECT go_v2_begin_telegram_outbox_attempt($1::bigint, $2::text, $3::text) AS acknowledged`,
            [id, telegramRelayWorkerId(claimId), attemptId],
          );
          if (started.rows[0]?.acknowledged !== true) {
            return NextResponse.json(
              { error: `Outbox lease is no longer owned for row ${id}`, code: 'TELEGRAM_OUTBOX_LEASE_CONFLICT' },
              { status: 409 },
            );
          }
          return NextResponse.json({ ok: true, claimId, id, attemptId });
        } catch (error) {
          if (!isTelegramOutboxLeaseSchemaUnavailable(error)) throw error;
          return NextResponse.json(
            { error: 'Migration 108 Telegram attempt-fence schema is required', code: 'TELEGRAM_OUTBOX_SCHEMA_REQUIRED' },
            { status: 503 },
          );
        }
      }

      case 'outboxAck': {
        if (!telegramRelayOwnsOutbox()) {
          return NextResponse.json(
            { error: 'Telegram outbox delivery owner is not configured', code: 'TELEGRAM_OUTBOX_OWNER_REQUIRED' },
            { status: 503 },
          );
        }
        const claimId = normalizeRelayClaimId(body.claimId);
        const results = parseTelegramRelayAcks(body.results);
        if (!claimId || !results) {
          return NextResponse.json({ error: 'Некорректное подтверждение outbox' }, { status: 400 });
        }
        const workerId = telegramRelayWorkerId(claimId);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          let sent = 0;
          let failed = 0;
          let unknown = 0;
          for (const result of results) {
            let acknowledged = false;
            if (result.status === 'sent') {
              const completed = await client.query<{ acknowledged: boolean }>(
                `SELECT go_v2_complete_telegram_outbox($1::bigint, $2::text, $3::jsonb) AS acknowledged`,
                [result.id, workerId, result.receipt],
              );
              acknowledged = completed.rows[0]?.acknowledged === true;
              sent += 1;
            } else if (result.status === 'failed') {
              const marked = await client.query<{ acknowledged: boolean }>(
                `SELECT go_v2_fail_telegram_outbox($1::bigint, $2::text, $3::text) AS acknowledged`,
                [result.id, workerId, result.error],
              );
              acknowledged = marked.rows[0]?.acknowledged === true;
              failed += 1;
            } else {
              const quarantined = await client.query<{ acknowledged: boolean }>(
                `SELECT go_v2_quarantine_unknown_telegram_outbox($1::bigint, $2::text, $3::text) AS acknowledged`,
                [result.id, workerId, result.error],
              );
              acknowledged = quarantined.rows[0]?.acknowledged === true;
              unknown += 1;
            }
            if (!acknowledged) {
              await client.query('ROLLBACK');
              return NextResponse.json(
                { error: `Outbox lease is no longer owned for row ${result.id}`, code: 'TELEGRAM_OUTBOX_LEASE_CONFLICT' },
                { status: 409 },
              );
            }
          }
          await client.query('COMMIT');
          return NextResponse.json({ ok: true, claimId, sent, failed, unknown });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          if (!isTelegramOutboxLeaseSchemaUnavailable(error)) throw error;
          return NextResponse.json(
            { error: 'Migration 108 Telegram claim/lease schema is required', code: 'TELEGRAM_OUTBOX_SCHEMA_REQUIRED' },
            { status: 503 },
          );
        } finally {
          client.release();
        }
      }

      default:
        return NextResponse.json({ error: `Неизвестное действие: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`[api/telegram/agent][${action}]`, err);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
