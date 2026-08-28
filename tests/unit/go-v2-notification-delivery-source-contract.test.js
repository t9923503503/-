import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('GO V2 notification worker source contract', () => {
  it('uses leased V2 processing and preserves website polling events', () => {
    const worker = read('web/lib/go-v2/notification-delivery.ts');
    expect(worker).toContain('go_v2_claim_notification_outbox');
    expect(worker).toContain('go_v2_complete_notification_outbox');
    expect(worker).toContain('go_v2_fail_notification_outbox');
    expect(worker).toContain("provider: 'website_public_polling'");
    expect(worker).toContain("retention: 'source_row_retained'");
    expect(worker).not.toContain('sendTelegramMessage');
  });

  it('resolves current roster players to valid private chats and scopes affected entries', () => {
    const worker = read('web/lib/go-v2/notification-delivery.ts');
    expect(worker).toContain('entry.current_roster_revision_id');
    expect(worker).toContain('JOIN users "user" ON "user".player_id = member.player_id');
    expect(worker).toContain('telegram_private_chat_id');
    expect(worker).toContain("registration_state = 'confirmed'");
    expect(worker).toContain('entry_id = ANY($3::uuid[])');
    expect(worker).toContain('extractGoV2NotificationEntryScope(payload)');
  });

  it('bridges every recipient idempotently without treating the scope key as chat_id', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');
    const worker = read('web/lib/go-v2/notification-delivery.ts');
    expect(migration).toContain('go_v2_notification_delivery_bridges');
    expect(migration).toContain("recipient_key ~ '^[1-9][0-9]{0,19}$'");
    expect(migration).toContain('p_private_chat_id');
    expect(migration).toContain('p_recipient_dedup_key');
    expect(migration).not.toContain('VALUES (item.recipient_key, item.event_type');
    expect(migration).not.toContain("item.payload->>'text'");
    expect(worker).toContain('buildGoV2TelegramRecipientDedupKey(row.id, recipient.chat_id)');
    expect(worker).toContain("lineageTable: 'go_v2_notification_delivery_bridges'");
  });

  it('keeps the bridge and external delivery under one explicit relay owner', () => {
    const cron = read('web/lib/play-cron.ts');
    const route = read('web/app/api/cron/telegram-flush/route.ts');
    const relayApi = read('web/app/api/telegram/agent/route.ts');
    const relay = read('telegram-bot/bot.mjs');
    const safetyMigration = read('migrations/108_go_v2_pilot_live_safety.sql');
    expect(cron).toContain("owner !== 'relay'");
    expect(cron).toContain('GO_V2_TELEGRAM_BRIDGE_ENABLED');
    expect(cron).toContain("status: 'disabled'");
    expect(cron).toContain('pg_try_advisory_lock');
    expect(cron).toContain('await runGoV2NotificationDelivery()');
    expect(cron).not.toContain('sendTelegramMessage');
    expect(cron).not.toContain('TELEGRAM_BOT_TOKEN');
    expect(cron).toContain('export async function runCompleteGames');
    expect(cron).toContain('export async function runPlayReminders');
    expect(relayApi).toContain('go_v2_claim_telegram_outbox');
    expect(relayApi).toContain('go_v2_begin_telegram_outbox_attempt');
    expect(relayApi).toContain('go_v2_complete_telegram_outbox');
    expect(relayApi).toContain('go_v2_fail_telegram_outbox');
    expect(relayApi).toContain('go_v2_quarantine_unknown_telegram_outbox');
    expect(relayApi).toContain('TELEGRAM_OUTBOX_SCHEMA_REQUIRED');
    expect(relay).toContain("TELEGRAM_OUTBOX_OWNER === 'relay'");
    expect(relay).toContain('acknowledgeOutboxWithRetry');
    expect(relay).toContain('beginOutboxAttemptWithRetry');
    expect(relay).toContain("status: err.providerRejected ? 'failed' : 'unknown'");
    expect(safetyMigration).toContain('FOR UPDATE SKIP LOCKED');
    expect(safetyMigration).toContain('telegram_outbox_delivery_ready_idx');
    expect(safetyMigration).toContain('dead_lettered_at');
    expect(safetyMigration).toContain('delivery_receipt');
    expect(safetyMigration).toContain('provider_attempt_started_at');
    expect(safetyMigration).toContain("'status', 'delivery_unknown'");
    expect(safetyMigration).toContain('relay_lost_after_provider_attempt_started');
    expect(safetyMigration).toContain('ALTER COLUMN next_attempt_at SET DEFAULT now()');
    expect(route).toContain('CRON_SECRET');
    expect(route).toContain("report.status === 'busy'");
    expect(route).toContain("report.goV2?.status === 'schema_unavailable'");
    expect(route).toContain('(report.goV2?.failed ?? 0) > 0');
    expect(route).toContain("{ status: 503 }");
  });
});
