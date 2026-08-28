import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getPool: () => ({ connect: mocks.connect }),
}));

import { runGoV2NotificationDelivery } from '../../web/lib/go-v2/notification-delivery';

const TOURNAMENT_ID = '123e4567-e89b-42d3-a456-426614174000';
const ENTRY_ID = '123e4567-e89b-42d3-a456-426614174001';
const WEBSITE_ID = '123e4567-e89b-42d3-a456-426614174010';
const TELEGRAM_ID = '123e4567-e89b-42d3-a456-426614174011';

describe('GO V2 notification worker orchestration', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  });

  it('acknowledges website polling and fans Telegram out through real private chats', async () => {
    let bridgeSequence = 70;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('go_v2_claim_notification_outbox')) {
        return {
          rows: [
            {
              id: WEBSITE_ID,
              tournament_id: TOURNAMENT_ID,
              aggregate_version: 7,
              channel: 'website',
              recipient_key: `tournament:${TOURNAMENT_ID}`,
              event_type: 'schedule.replan.commit',
              payload: { result: {} },
              dedup_key: 'website-source',
            },
            {
              id: TELEGRAM_ID,
              tournament_id: TOURNAMENT_ID,
              aggregate_version: 7,
              channel: 'telegram',
              recipient_key: `tournament:${TOURNAMENT_ID}`,
              event_type: 'attendance.commit',
              payload: { result: { entryId: ENTRY_ID, toState: 'checked_in' } },
              dedup_key: 'telegram-source',
            },
          ],
        };
      }
      if (sql.includes('SELECT name FROM tournaments')) return { rows: [{ name: 'Кубок' }], rowCount: 1 };
      if (sql.includes('WITH roster_chat AS')) {
        return {
          rows: [
            { chat_id: '111111111', entry_ids: [ENTRY_ID] },
            { chat_id: '222222222', entry_ids: [ENTRY_ID] },
          ],
        };
      }
      if (sql.includes('go_v2_bridge_telegram_notification')) {
        bridgeSequence += 1;
        return { rows: [{ telegram_outbox_id: String(bridgeSequence) }] };
      }
      if (sql.includes('go_v2_complete_notification_outbox')) return { rows: [{ completed: true }] };
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      throw new Error(`Unexpected SQL in notification worker test: ${sql}`);
    });

    const report = await runGoV2NotificationDelivery({
      workerId: 'unit-worker',
      batchSize: 10,
      leaseSeconds: 30,
    });

    expect(report).toEqual({
      claimed: 2,
      websiteAcknowledged: 1,
      telegramEventsBridged: 1,
      telegramMessagesQueued: 2,
      noEligibleRecipients: 0,
      failed: 0,
      deadLettered: 0,
    });
    const bridgeCalls = mocks.query.mock.calls.filter(([sql]) =>
      String(sql).includes('go_v2_bridge_telegram_notification'));
    expect(bridgeCalls).toHaveLength(2);
    expect(bridgeCalls.map(([, params]) => params?.[2])).toEqual(['111111111', '222222222']);
    expect(bridgeCalls.flatMap(([, params]) => params ?? [])).not.toContain(`tournament:${TOURNAMENT_ID}`);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('records a leased processing failure and recognizes dead-letter state', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('go_v2_claim_notification_outbox')) {
        return {
          rows: [{
            id: TELEGRAM_ID,
            tournament_id: TOURNAMENT_ID,
            aggregate_version: 8,
            channel: 'telegram',
            recipient_key: `tournament:${TOURNAMENT_ID}`,
            event_type: 'draw.commit',
            payload: {},
            dedup_key: 'telegram-source',
          }],
        };
      }
      if (sql.includes('SELECT name FROM tournaments')) throw new Error('temporary database failure');
      if (sql.includes('WITH roster_chat AS')) return { rows: [] };
      if (sql.includes('go_v2_fail_notification_outbox')) return { rows: [{ failed: true }] };
      if (sql.includes('dead_lettered_at IS NOT NULL')) return { rows: [{ dead_lettered: true }] };
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      throw new Error(`Unexpected SQL in notification worker test: ${sql}`);
    });

    const report = await runGoV2NotificationDelivery({ workerId: 'unit-worker' });
    expect(report.failed).toBe(1);
    expect(report.deadLettered).toBe(1);
    expect(report.telegramMessagesQueued).toBe(0);
  });
});

