import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('KOTC Next control safety contract', () => {
  it('persists idempotency, audit and presence without sharing the game revision', () => {
    const migration = read('migrations/081_kotc_next_control_presence.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS kotcn_control_command');
    expect(migration).toContain('PRIMARY KEY (tournament_id, command_id)');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS kotcn_event_log');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS kotcn_presence');
    expect(migration).toContain('PRIMARY KEY (court_id, device_id)');
    expect(migration).toContain('kotcn_presence_last_seen_idx');
    expect(migration).not.toContain('UPDATE kotcn_event_log');
  });

  it('keeps revision check and mutation under the same tournament transaction lock', () => {
    const service = read('web/lib/kotc-next/service.ts');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(service).toContain('request_json = $3::jsonb AS same_request');
    expect(service).toContain("'COURTS_OFFLINE'");
    expect(service).toContain('acknowledgeOffline');
  });

  it('disables judge start and exposes lightweight heartbeat', () => {
    const startRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/start/route.ts');
    const heartbeatRoute = read('web/app/api/kotc-next/judge/[pin]/heartbeat/route.ts');
    const judge = read('web/components/kotc-next/KotcNextJudgeScreen.tsx');
    expect(startRoute).toContain('OPERATOR_CONTROL_REQUIRED');
    expect(heartbeatRoute).toContain('heartbeatKotcNextJudge');
    expect(judge).toContain('requestJudgeHeartbeat');
    expect(judge).toContain('5000');
    expect(judge).toContain('sentAt + (receivedAt - sentAt) / 2');
  });
});
