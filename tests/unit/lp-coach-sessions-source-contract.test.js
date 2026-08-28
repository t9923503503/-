import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');
const migration = read('migrations/093_lp_coach_sessions.sql');
const service = read('web/lib/coach/session-service.ts');
const syncRoute = read('web/app/api/coach/integrations/kotyara/sync/route.ts');
const adapter = read('integrations/ace-bot/lp_coach_sync.py');
const adapterPatch = read('integrations/ace-bot/trainings-lp-coach.patch');

describe('LP Coach Stage 3 source contract', () => {
  it('stores sessions, identities, participant mappings and sync receipts in PostgreSQL', () => {
    for (const table of [
      'coach_training_sessions', 'coach_external_identities', 'coach_training_participants',
      'coach_training_participant_identities', 'coach_external_sync_events',
    ]) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(migration).toContain('UNIQUE (source, external_event_id)');
    expect(migration).toContain('UNIQUE (provider, event_key)');
    expect(migration).toContain('UNIQUE (training_session_id, external_identity_id)');
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_training_participant_identities');
  });

  it('never lets Telegram or YCLIENTS overwrite actual attendance during sync', () => {
    expect(service).toContain("const statusColumn = participant.provider === 'telegram'");
    expect(service).not.toContain('actual_attendance = $4');
    expect(migration).toContain("actual_attendance IN ('present', 'absent', 'late', 'left_early', 'unknown')");
  });

  it('uses payload receipts and the session source key for idempotency', () => {
    expect(service).toContain("previousRows[0]?.payload_hash === payloadHash");
    expect(service).toContain('ON CONFLICT (source, external_event_id) DO UPDATE');
    expect(service).toContain("ON CONFLICT (provider, event_key) DO UPDATE");
  });

  it('protects ingestion with a dedicated fail-closed secret', () => {
    expect(syncRoute).toContain('requireKotyaraSync(req)');
    expect(read('web/lib/coach/session-sync-auth.ts')).toContain("expected.length < 32");
  });

  it('extends the existing Kotyara instead of creating a second Telegram bot', () => {
    expect(adapter).toContain('push_training_snapshot');
    expect(adapter).toContain('never interrupt Kotyara');
    expect(adapterPatch).toContain('from lp_coach_sync import push_training_snapshot');
    expect(adapter).not.toContain('Bot(');
    expect(adapter).not.toContain('start_polling');
  });
});
