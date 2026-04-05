import { describe, expect, it } from 'vitest';
import {
  allowLegacyPins,
  parseAdminCredentialsFromJson,
  requireActorIdOnLogin,
} from '../../web/lib/admin-auth-policy.ts';

describe('admin auth policy helpers', () => {
  it('parses only valid actor credentials from json', () => {
    const creds = parseAdminCredentialsFromJson(
      JSON.stringify([
        { id: 'a1', role: 'admin', pin: '1111' },
        { id: 'op1', role: 'operator', pin: '2222' },
        { id: '', role: 'viewer', pin: '3333' },
        { id: 'bad', role: 'root', pin: '9999' },
      ])
    );

    expect(creds).toHaveLength(2);
    expect(creds[0]).toEqual({ id: 'a1', role: 'admin', pin: '1111' });
    expect(creds[1]).toEqual({ id: 'op1', role: 'operator', pin: '2222' });
  });

  it('controls legacy pin policy by env', () => {
    expect(allowLegacyPins('development', '')).toBe(true);
    expect(allowLegacyPins('production', '')).toBe(false);
    expect(allowLegacyPins('production', 'true')).toBe(true);
  });

  it('requires actor id when actor credentials configured', () => {
    expect(requireActorIdOnLogin(0)).toBe(false);
    expect(requireActorIdOnLogin(1)).toBe(true);
  });
});
