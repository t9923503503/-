import { describe, expect, it } from 'vitest';

import { parseGoV2CommandEnvelope } from '../../web/lib/go-v2/contracts';

const base = {
  expectedVersion: 7,
  commandId: 'device.command-0001',
  deviceId: 'admin-browser-01',
  requestHash: 'a'.repeat(64),
  reasonCode: 'admin_override',
  payload: { answer: 42 },
};

describe('GO V2 authenticated command envelope', () => {
  it('maps commandId to the internal compatibility key and preserves device context', () => {
    expect(parseGoV2CommandEnvelope(base)).toMatchObject({
      expectedVersion: 7,
      commandId: 'device.command-0001',
      idempotencyKey: 'device.command-0001',
      deviceId: 'admin-browser-01',
      payload: { answer: 42 },
    });
  });

  it('accepts a valid declared digest and rejects malformed digests', () => {
    const requestHash = 'b'.repeat(64);
    expect(parseGoV2CommandEnvelope({ ...base, requestHash }).requestHash).toBe(requestHash);
    expect(() => parseGoV2CommandEnvelope({ ...base, requestHash: 'not-a-digest' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST_HASH' }));
    expect(() => parseGoV2CommandEnvelope({ ...base, requestHash: undefined }))
      .toThrowError(expect.objectContaining({ code: 'MISSING_FIELD' }));
  });

  it('never trusts actor or courtGrant supplied by the client', () => {
    expect(() => parseGoV2CommandEnvelope({ ...base, actor: { id: 'forged', role: 'admin' } }))
      .toThrowError(expect.objectContaining({ code: 'UNTRUSTED_COMMAND_CONTEXT' }));
    expect(() => parseGoV2CommandEnvelope({ ...base, courtGrant: { grantId: 'forged' } }))
      .toThrowError(expect.objectContaining({ code: 'UNTRUSTED_COMMAND_CONTEXT' }));
  });

  it('temporarily accepts legacy idempotencyKey as the commandId alias but still requires deviceId', () => {
    expect(parseGoV2CommandEnvelope({
      ...base,
      commandId: undefined,
      idempotencyKey: 'legacy-key-0001',
    }).commandId).toBe('legacy-key-0001');
    expect(() => parseGoV2CommandEnvelope({ ...base, deviceId: undefined }))
      .toThrowError(expect.objectContaining({ code: 'MISSING_FIELD' }));
  });
});
