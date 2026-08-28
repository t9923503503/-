import { describe, expect, it } from 'vitest';

import { deriveGoV2CourtGrantToken } from '../../web/lib/go-v2/live-operations';

describe('GO V2 court grant token derivation', () => {
  const secret = 'test-secret-that-never-enters-a-receipt';
  const grantId = '30000000-0000-4000-8000-000000000001';

  it('reconstructs the same opaque token for a lost HTTP response', () => {
    const first = deriveGoV2CourtGrantToken(secret, grantId, 'judge-command-0001', 'judge-device-01');
    const replay = deriveGoV2CourtGrantToken(secret, grantId, 'judge-command-0001', 'judge-device-01');

    expect(replay).toBe(first);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain(grantId);
    expect(first).not.toContain('judge-device-01');
  });

  it('domain-separates grants by command, device and server secret', () => {
    const baseline = deriveGoV2CourtGrantToken(secret, grantId, 'judge-command-0001', 'judge-device-01');

    expect(deriveGoV2CourtGrantToken(secret, grantId, 'judge-command-0002', 'judge-device-01')).not.toBe(baseline);
    expect(deriveGoV2CourtGrantToken(secret, grantId, 'judge-command-0001', 'judge-device-02')).not.toBe(baseline);
    expect(deriveGoV2CourtGrantToken(`${secret}-rotated`, grantId, 'judge-command-0001', 'judge-device-01')).not.toBe(baseline);
  });
});
