import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPlayerAdminActor,
  isAdminPlayerEmail,
} from '../../web/lib/admin-player-access';

describe('player-linked admin access', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('grants full admin role only to the linked owner email', () => {
    expect(isAdminPlayerEmail('sv-ugra@yandex.ru')).toBe(true);
    expect(isAdminPlayerEmail(' SV-UGRA@YANDEX.RU ')).toBe(true);
    expect(isAdminPlayerEmail('player@example.com')).toBe(false);
    expect(createPlayerAdminActor(25)).toEqual({ id: 'player:25', role: 'admin' });
  });

  it('supports additional explicitly configured player emails', () => {
    vi.stubEnv('ADMIN_PLAYER_EMAILS', 'second@example.com, third@example.com');

    expect(isAdminPlayerEmail('second@example.com')).toBe(true);
    expect(isAdminPlayerEmail('THIRD@example.com')).toBe(true);
    expect(isAdminPlayerEmail('fourth@example.com')).toBe(false);
  });
});
